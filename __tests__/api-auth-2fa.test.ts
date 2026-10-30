/**
 * /api/auth with ADMIN_2FA=email — the password earns an emailed code, and
 * only the code earns the session.
 * Security: no session from the password alone, codes go only to the owner,
 * wrong codes hit the shared lockout, misconfiguration fails closed, and the
 * password-only x-logistics-key path can't bypass the factor.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { SESSION_COOKIE } from "@/lib/session"
import { TWO_FACTOR_COOKIE } from "@/lib/two-factor"
import { makeRequest, jsonRequest, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("resend", () => {
    const send = jest.fn()
    return {
        Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
        __mockSend: send,
    }
})

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: [], error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { POST, DELETE } from "@/app/api/auth/route"
import { GET as listProjects } from "@/app/api/projects/route"

const mockSend = (jest.requireMock("resend") as { __mockSend: jest.Mock }).__mockSend
const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/auth"
const PASSWORD = "admin-password"
const IP = "1.2.3.4"

function post(body: unknown, cookie = "", ip = IP) {
    return POST(jsonRequest(URL, "POST", body, { "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) }))
}

/** "name=value" from a response's Set-Cookie for the given cookie. */
function cookieFrom(res: Response, name: string): string {
    const header = res.headers.get("set-cookie") ?? ""
    const match = header.split(/,(?=\s*[\w-]+=)/).map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))
    return match ? match.split(";")[0] : ""
}

const emailedCode = () => /sign-in code is (\d{6})/.exec(mockSend.mock.calls.at(-1)?.[0]?.text ?? "")?.[1] ?? ""

/** Password step → [challenge cookie, emailed code]. */
async function passwordStep(): Promise<[string, string]> {
    const res = await post({ password: PASSWORD })
    expect(res.status).toBe(200)
    return [cookieFrom(res, TWO_FACTOR_COOKIE), emailedCode()]
}

beforeEach(() => {
    process.env.ADMIN_2FA = "email"
    process.env.LOGISTICS_PASSWORD = PASSWORD
    process.env.SESSION_SECRET = "test-session-secret"
    process.env.RESEND_API_KEY = "re_test_key"
    process.env.SUMMARY_RECIPIENT_EMAIL = "owner@example.com"
    resetRateLimits()
    mockDb.calls = []
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null })
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
    delete process.env.ADMIN_2FA
    delete process.env.ADMIN_2FA_EMAIL
    jest.restoreAllMocks()
})

describe("password step", () => {
    it("emails a code instead of signing in", async () => {
        const res = await post({ password: PASSWORD })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ authenticated: false, twoFactor: "email" })
        expect(cookieFrom(res, SESSION_COOKIE)).toBe("")
        expect(cookieFrom(res, TWO_FACTOR_COOKIE)).not.toBe("")
        expect(mockSend).toHaveBeenCalledTimes(1)
        expect(emailedCode()).toMatch(/^\d{6}$/)
    })

    it("sends the code only to the owner, never to an address from the request", async () => {
        await post({ password: PASSWORD, email: "attacker@evil.com", to: "attacker@evil.com" })
        expect(mockSend.mock.calls[0][0].to).toBe("owner@example.com")
        process.env.ADMIN_2FA_EMAIL = "security@example.com"
        await post({ password: PASSWORD })
        expect(mockSend.mock.calls[1][0].to).toBe("security@example.com")
    })

    it("keeps the code out of the subject line (lock-screen previews)", async () => {
        await post({ password: PASSWORD })
        expect(mockSend.mock.calls[0][0].subject).not.toMatch(/\d{6}/)
    })

    it("tells the owner where the attempt came from", async () => {
        await post({ password: PASSWORD })
        expect(mockSend.mock.calls[0][0].text).toContain(IP)
    })

    it("sets the challenge cookie HttpOnly, SameSite=Strict, short-lived", async () => {
        const res = await post({ password: PASSWORD })
        const header = (res.headers.get("set-cookie") ?? "").toLowerCase()
        expect(header).toContain("httponly")
        expect(header).toContain("samesite=strict")
        expect(header).toContain("max-age=600")
    })

    it("sends nothing for a wrong password", async () => {
        expect((await post({ password: "wrong" })).status).toBe(401)
        expect(mockSend).not.toHaveBeenCalled()
    })

    it("fails closed when email isn't configured — never skips the factor", async () => {
        delete process.env.RESEND_API_KEY
        const res = await post({ password: PASSWORD })
        expect(res.status).toBe(500)
        expect(cookieFrom(res, SESSION_COOKIE)).toBe("")
    })

    it("reports a provider failure without issuing anything", async () => {
        mockSend.mockResolvedValue({ data: null, error: { message: "quota" } })
        const res = await post({ password: PASSWORD })
        expect(res.status).toBe(502)
        expect(cookieFrom(res, SESSION_COOKIE)).toBe("")
        expect(cookieFrom(res, TWO_FACTOR_COOKIE)).toBe("")
    })

    it("caps how many codes can be sent", async () => {
        for (let i = 0; i < 5; i++) expect((await post({ password: PASSWORD })).status).toBe(200)
        expect((await post({ password: PASSWORD })).status).toBe(429)
        expect(mockSend).toHaveBeenCalledTimes(5)
    })
})

describe("code step", () => {
    it("exchanges the right code for a session and clears the challenge", async () => {
        const [challenge, code] = await passwordStep()
        const res = await post({ code }, challenge)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ authenticated: true })
        expect(cookieFrom(res, SESSION_COOKIE)).not.toBe("")
        expect(cookieFrom(res, TWO_FACTOR_COOKIE)).toBe(`${TWO_FACTOR_COOKIE}=`)
    })

    it("accepts the code typed with spaces", async () => {
        const [challenge, code] = await passwordStep()
        expect((await post({ code: `${code.slice(0, 3)} ${code.slice(3)}` }, challenge)).status).toBe(200)
    })

    it("rejects a wrong code", async () => {
        const [challenge, code] = await passwordStep()
        const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0")
        const res = await post({ code: wrong }, challenge)
        expect(res.status).toBe(401)
        expect(cookieFrom(res, SESSION_COOKIE)).toBe("")
    })

    it("rejects a code without the challenge cookie (the password step is required)", async () => {
        const [, code] = await passwordStep()
        expect((await post({ code })).status).toBe(401)
    })

    it("wrong codes count toward the admin lockout", async () => {
        const [challenge, code] = await passwordStep()
        const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0")
        for (let i = 0; i < 10; i++) await post({ code: wrong }, challenge)
        // Locked out — even the right code is refused now.
        expect((await post({ code }, challenge)).status).toBe(429)
    })

    it("malformed codes are refused without counting as guesses", async () => {
        const [challenge, code] = await passwordStep()
        for (let i = 0; i < 20; i++) expect((await post({ code: "abc" }, challenge)).status).toBe(400)
        expect((await post({ code }, challenge)).status).toBe(200)
    })

    it("ignores code submissions while 2FA is off", async () => {
        const [challenge, code] = await passwordStep()
        delete process.env.ADMIN_2FA
        expect((await post({ code }, challenge)).status).toBe(401)
    })

    it("sign-out clears a pending challenge too", async () => {
        const res = await DELETE(makeRequest(URL, { method: "DELETE" }))
        expect(cookieFrom(res, TWO_FACTOR_COOKIE)).toBe(`${TWO_FACTOR_COOKIE}=`)
    })
})

describe("password-only header while 2FA is on", () => {
    it("refuses x-logistics-key even with the right password", async () => {
        const res = await listProjects(makeRequest("http://localhost/api/projects", {
            headers: { "x-logistics-key": PASSWORD, "x-forwarded-for": IP },
        }))
        expect(res.status).toBe(401)
    })

    it("answers identically for right and wrong passwords (no oracle)", async () => {
        const ask = async (key: string) => {
            const res = await listProjects(makeRequest("http://localhost/api/projects", {
                headers: { "x-logistics-key": key, "x-forwarded-for": IP },
            }))
            return [res.status, await res.text()]
        }
        expect(await ask(PASSWORD)).toEqual(await ask("wrong"))
    })

    it("a session earned through both factors works on the admin API", async () => {
        const [challenge, code] = await passwordStep()
        const session = cookieFrom(await post({ code }, challenge), SESSION_COOKIE)
        const res = await listProjects(makeRequest("http://localhost/api/projects", { headers: { cookie: session } }))
        expect(res.status).toBe(200)
    })
})
