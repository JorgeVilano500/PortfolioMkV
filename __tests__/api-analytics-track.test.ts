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

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/analytics/track"

function track(body: unknown, headers: Record<string, string> = {}) {
    return POST(makeRequest(URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", ...headers },
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
    mockDb.calls = []
})

describe("happy path", () => {
    it("records a valid page view", async () => {
        const res = await track(validBody)
        expect(res.status).toBe(200)
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.page).toBe("/blog")
        expect(row.session_id).toBe(validBody.session_id)
        expect(row.load_time).toBe(850)
    })
})

describe("validation", () => {
    it("rejects non-JSON content type", async () => {
        const res = await POST(makeRequest(URL, { method: "POST", headers: { "content-type": "text/plain" }, body: "x" }))
        expect(res.status).toBe(400)
    })

    it("rejects invalid JSON", async () => {
        const res = await POST(makeRequest(URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" }))
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

    it("truncates an oversized referrer instead of storing megabytes", async () => {
        await track({ ...validBody, referrer: "r".repeat(10_000) })
        const row = firstCallArg(mockDb, "insert") as Record<string, string>
        expect(row.referrer.length).toBeLessThanOrEqual(2_000)
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
    it.each(["/logistics", "/logistics/deep", "/blog-editor", "/api/blog/posts"])(
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
