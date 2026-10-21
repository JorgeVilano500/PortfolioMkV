/**
 * /api/auth — exchanges the admin password for an HttpOnly session cookie.
 * Security: brute-force lockout (per IP + global), CSRF, cookie attributes,
 * fail-closed configuration, sign-out.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { SESSION_COOKIE, createSessionToken } from "@/lib/session"
import { makeRequest, jsonRequest } from "./helpers/test-utils"
import { GET, POST, DELETE } from "@/app/api/auth/route"

const URL = "http://localhost/api/auth"
const PASSWORD = "admin-password"

function login(password: unknown, headers: Record<string, string> = {}) {
    return POST(jsonRequest(URL, "POST", { password }, { "x-forwarded-for": "1.2.3.4", ...headers }))
}

function setCookie(res: Response): string {
    return res.headers.get("set-cookie") ?? ""
}

beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = PASSWORD
    process.env.SESSION_SECRET = "test-session-secret"
    resetRateLimits()
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("POST (sign in)", () => {
    it("sets an HttpOnly, SameSite=Strict session cookie on the right password", async () => {
        const res = await login(PASSWORD, { "sec-fetch-site": "same-origin" })
        expect(res.status).toBe(200)
        const cookie = setCookie(res)
        expect(cookie).toContain(`${SESSION_COOKIE}=`)
        expect(cookie.toLowerCase()).toContain("httponly")
        expect(cookie.toLowerCase()).toContain("samesite=strict")
        expect(cookie).not.toContain(PASSWORD)
    })

    it.each([["wrong"], [""], [123], [null], ["x".repeat(501)]])("rejects password %p with 401", async (password) => {
        const res = await login(password)
        expect(res.status).toBe(401)
        expect(setCookie(res)).toBe("")
    })

    it("rejects a non-object or invalid JSON body", async () => {
        expect((await POST(jsonRequest(URL, "POST", null))).status).toBe(401)
        const res = await POST(makeRequest(URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" }))
        expect(res.status).toBe(400)
    })

    it("fails closed when LOGISTICS_PASSWORD is unset", async () => {
        delete process.env.LOGISTICS_PASSWORD
        expect((await login("")).status).toBe(401)
        expect((await login("undefined")).status).toBe(401)
    })

    it("refuses to issue a session when no signing secret exists", async () => {
        delete process.env.SESSION_SECRET
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        const res = await login(PASSWORD)
        expect(res.status).toBe(500)
        expect(setCookie(res)).toBe("")
    })

    it("locks an IP out after 10 failures, even for the right password", async () => {
        for (let i = 0; i < 10; i++) await login("wrong")
        expect((await login(PASSWORD)).status).toBe(429)
        expect((await login(PASSWORD, { "x-forwarded-for": "5.5.5.5" })).status).toBe(200)
    })

    it("caps total guesses across many IPs (global ceiling)", async () => {
        for (let i = 0; i < 100; i++) await login("wrong", { "x-forwarded-for": `10.0.0.${i}` })
        expect((await login(PASSWORD, { "x-forwarded-for": "9.9.9.9" })).status).toBe(429)
    })

    it("blocks cross-site sign-in attempts (login CSRF)", async () => {
        expect((await login(PASSWORD, { "sec-fetch-site": "cross-site" })).status).toBe(403)
    })
})

describe("GET (session status)", () => {
    it("reports a valid session", async () => {
        const res = await GET(makeRequest(URL, { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken()}` } }))
        expect(await res.json()).toEqual({ authenticated: true })
    })

    it("reports no session without a cookie, or with a forged one", async () => {
        expect(await (await GET(makeRequest(URL))).json()).toEqual({ authenticated: false })
        const forged = await GET(makeRequest(URL, { headers: { cookie: `${SESSION_COOKIE}=9999999999999.x.y` } }))
        expect(await forged.json()).toEqual({ authenticated: false })
    })
})

describe("DELETE (sign out)", () => {
    it("clears the cookie", async () => {
        const res = await DELETE(makeRequest(URL, { method: "DELETE", headers: { "sec-fetch-site": "same-origin" } }))
        expect(res.status).toBe(200)
        const cookie = setCookie(res)
        expect(cookie).toContain(`${SESSION_COOKIE}=;`)
        expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/)
    })

    it("ignores cross-site sign-out attempts", async () => {
        expect((await DELETE(makeRequest(URL, { method: "DELETE", headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403)
    })
})
