/**
 * /api/analytics/track — unauthenticated public write endpoint.
 * Security: rate limiting, strict input validation, size caps, IP exclusion,
 * admin-page filtering.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import {
    makeRequest,
    firstCallArg,
    type SupabaseMockState,
} from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { POST } from "@/app/api/analytics/track/route"
import { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } from "@/lib/consent"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/analytics/track"

const VISITOR_ID = "7d3f4b2a-1c9e-4f60-8a1b-2c3d4e5f6a7b"
const consentCookie = (analytics: boolean, version = CONSENT_VERSION) =>
    `${CONSENT_COOKIE}=${serializeConsent({ version, analytics, decidedAt: Date.now(), id: VISITOR_ID })}`
// Every request below opts in unless a test overrides the cookie.
const OPT_IN = consentCookie(true)

function track(body: unknown, headers: Record<string, string> = {}) {
    return POST(makeRequest(URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", cookie: OPT_IN, ...headers },
        body: JSON.stringify(body),
    }))
}

const validBody = {
    page: "/blog",
    referrer: "https://google.com",
    session_id: "3f2c9d70-0000-0000-0000-000000000000",
    is_new_visitor: true,
    load_time: 850,
    screen_width: 1440,
}

beforeEach(() => {
    resetRateLimits()
    delete process.env.ANALYTICS_EXCLUDED_IPS
    mockDb.result = { data: null, error: null }
    mockDb.queue = []
    mockDb.calls = []
})

afterEach(() => jest.restoreAllMocks())

describe("happy path", () => {
    it("records a valid page view", async () => {
        const res = await track(validBody)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, tracked: true })
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.page).toBe("/blog")
        expect(row.session_id).toBe(validBody.session_id)
        expect(row.load_time).toBe(850)
    })
})

describe("consent enforcement (server-side)", () => {
    const inserted = () => mockDb.calls.some((c) => c.method === "insert")

    it.each([
        ["no consent cookie",            ""],
        ["analytics declined",           consentCookie(false)],
        ["an outdated policy version",   consentCookie(true, CONSENT_VERSION + 1)],
        ["a forged/malformed cookie",    `${CONSENT_COOKIE}=%7B%22v%22%3A1%2C%22a%22%3A1%7D`],
    ])("stores nothing with %s", async (_label, cookie) => {
        const res = await track(validBody, { cookie })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, tracked: false })
        expect(inserted()).toBe(false)
    })

    it("records the opt-in fields: IP, language, timezone, visitor id, policy version", async () => {
        await track({ ...validBody, language: "en-US", timezone: "America/Los_Angeles" }, { "x-forwarded-for": "203.0.113.7" })
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.ip_address).toBe("203.0.113.7")
        expect(row.language).toBe("en-US")
        expect(row.timezone).toBe("America/Los_Angeles")
        expect(row.visitor_id).toBe(VISITOR_ID)
        expect(row.consent_version).toBe(CONSENT_VERSION)
    })

    it("takes the visitor id from the consent cookie, never the body", async () => {
        await track({ ...validBody, visitor_id: "00000000-0000-4000-8000-000000000000", ip_address: "6.6.6.6" })
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.visitor_id).toBe(VISITOR_ID)
        expect(row.ip_address).toBe("1.2.3.4")
    })

    it("drops malformed language/timezone values and non-IP addresses", async () => {
        await track({ ...validBody, language: "<script>", timezone: "../../etc/passwd" }, { "x-forwarded-for": "not-an-ip" })
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.language).toBeNull()
        expect(row.timezone).toBeNull()
        expect(row.ip_address).toBeNull()
    })

    it("still records the view if the database is missing the new columns", async () => {
        mockDb.queue = [
            { data: null, error: { message: "Could not find the 'ip_address' column", code: "PGRST204" } },
            { data: null, error: null },
        ]
        jest.spyOn(console, "warn").mockImplementation(() => {})
        const res = await track(validBody)
        expect(res.status).toBe(200)
        const inserts = mockDb.calls.filter((c) => c.method === "insert")
        expect(inserts).toHaveLength(2)
        expect(inserts[1].args[0]).not.toHaveProperty("ip_address")
    })
})

describe("validation", () => {
    it("rejects non-JSON content type", async () => {
        const res = await POST(makeRequest(URL, { method: "POST", headers: { "content-type": "text/plain", cookie: OPT_IN }, body: "x" }))
        expect(res.status).toBe(400)
    })

    it("rejects invalid JSON", async () => {
        const res = await POST(makeRequest(URL, { method: "POST", headers: { "content-type": "application/json", cookie: OPT_IN }, body: "{oops" }))
        expect(res.status).toBe(400)
    })

    it("rejects a page that is not a path", async () => {
        expect((await track({ ...validBody, page: "https://evil.com" })).status).toBe(400)
        expect((await track({ ...validBody, page: 42 })).status).toBe(400)
    })

    it("rejects oversized page / session_id", async () => {
        expect((await track({ ...validBody, page: "/" + "a".repeat(400) })).status).toBe(400)
        expect((await track({ ...validBody, session_id: "s".repeat(200) })).status).toBe(400)
    })

    it("rejects a missing session_id", async () => {
        expect((await track({ page: "/", session_id: "" })).status).toBe(400)
    })

    it("drops an oversized or non-URL referrer instead of storing it", async () => {
        await track({ ...validBody, referrer: "https://x.com/" + "r".repeat(10_000) })
        await track({ ...validBody, referrer: "not a url" })
        await track({ ...validBody, referrer: "javascript:alert(1)" })
        const rows = mockDb.calls.filter((c) => c.method === "insert").map((c) => c.args[0] as Record<string, string>)
        expect(rows.map((r) => r.referrer)).toEqual(["", "", ""])
    })

    it("stores only the referring origin (no path, query, or fragment)", async () => {
        await track({ ...validBody, referrer: "https://www.google.com/search?q=private+stuff&email=me@x.com#frag" })
        const row = firstCallArg(mockDb, "insert") as Record<string, string>
        expect(row.referrer).toBe("https://www.google.com")
    })

    it.each(["null", "[]", "\"x\"", "7"])("rejects a non-object JSON body %s without throwing", async (raw) => {
        const res = await POST(makeRequest(URL, { method: "POST", headers: { "content-type": "application/json", cookie: OPT_IN }, body: raw }))
        expect(res.status).toBe(400)
    })

    it("truncates an oversized user-agent", async () => {
        await track(validBody, { "user-agent": "u".repeat(5_000) })
        const row = firstCallArg(mockDb, "insert") as Record<string, string>
        expect(row.user_agent.length).toBeLessThanOrEqual(500)
    })

    it("nulls out absurd load_time / screen_width values", async () => {
        await track({ ...validBody, load_time: -5, screen_width: 999_999 })
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.load_time).toBeNull()
        expect(row.screen_width).toBeNull()
    })

    it("coerces is_new_visitor to a strict boolean", async () => {
        await track({ ...validBody, is_new_visitor: "true" })
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.is_new_visitor).toBe(false)
    })
})

describe("filtering", () => {
    it.each(["/logistics", "/logistics/deep", "/studio", "/api/blog/posts"])(
        "silently skips admin/internal page %s",
        async (page) => {
            const res = await track({ ...validBody, page })
            expect(res.status).toBe(200)
            expect(firstCallArg(mockDb, "insert")).toBeUndefined()
        }
    )

    it("silently drops excluded IPs", async () => {
        process.env.ANALYTICS_EXCLUDED_IPS = "9.9.9.9, 1.2.3.4"
        const res = await track(validBody)
        expect(res.status).toBe(200)
        expect(firstCallArg(mockDb, "insert")).toBeUndefined()
    })
})

describe("rate limiting", () => {
    it("returns 429 after 30 requests/minute from one IP", async () => {
        for (let i = 0; i < 30; i++) {
            expect((await track(validBody)).status).toBe(200)
        }
        const res = await track(validBody)
        expect(res.status).toBe(429)
        expect(res.headers.get("Retry-After")).toBeTruthy()
    })

    it("does not throttle a different IP", async () => {
        for (let i = 0; i < 31; i++) await track(validBody)
        const res = await track(validBody, { "x-forwarded-for": "8.8.8.8" })
        expect(res.status).toBe(200)
    })
})
