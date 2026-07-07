/**
 * /api/analytics/stats — gated dashboard data + aggregation correctness.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { makeRequest, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { GET } from "@/app/api/analytics/stats/route"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/analytics/stats"
const KEY = "test-logistics-password"

function req(headers: Record<string, string> = {}) {
    return GET(makeRequest(URL, { headers: { "x-forwarded-for": "1.2.3.4", ...headers } }))
}

function view(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        page: "/",
        session_id: "s1",
        is_new_visitor: false,
        load_time: null,
        screen_width: 1440,
        referrer: "",
        created_at: new Date().toISOString(),
        ...overrides,
    }
}

beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = KEY
    resetRateLimits()
    mockDb.result = { data: [], error: null }
    mockDb.calls = []
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("auth", () => {
    it("rejects a missing key", async () => {
        expect((await req()).status).toBe(401)
    })

    it("rejects a wrong key", async () => {
        expect((await req({ "x-logistics-key": "wrong" })).status).toBe(401)
    })

    it("fails closed when the secret is unset", async () => {
        delete process.env.LOGISTICS_PASSWORD
        expect((await req({ "x-logistics-key": "anything" })).status).toBe(401)
    })

    it("locks out after 10 failed attempts (dashboard brute-force)", async () => {
        for (let i = 0; i < 10; i++) await req({ "x-logistics-key": "guess-" + i })
        expect((await req({ "x-logistics-key": KEY })).status).toBe(429)
    })
})

describe("aggregation", () => {
    it("computes counts, uniques, devices, and bounce rate", async () => {
        mockDb.result = {
            data: [
                // session s1: 2 views (not a bounce), desktop
                view({ session_id: "s1", page: "/", screen_width: 1440, is_new_visitor: true }),
                view({ session_id: "s1", page: "/blog", screen_width: 1440 }),
                // session s2: 1 view (bounce), mobile
                view({ session_id: "s2", page: "/", screen_width: 390 }),
                // session s3: 1 view (bounce), tablet
                view({ session_id: "s3", page: "/about", screen_width: 800, is_new_visitor: true }),
            ],
            error: null,
        }
        const res = await req({ "x-logistics-key": KEY })
        expect(res.status).toBe(200)
        const stats = await res.json()

        expect(stats.totalViews).toBe(4)
        expect(stats.uniqueVisitors).toBe(3)
        expect(stats.devices).toEqual({ mobile: 1, tablet: 1, desktop: 2 })
        expect(stats.bounceRate).toBe(67) // 2 of 3 sessions bounced
        expect(stats.newVsReturning).toEqual({ new: 2, returning: 1 })
        expect(stats.topPages[0]).toEqual({ page: "/", count: 2 })
    })

    it("averages only positive load times", async () => {
        mockDb.result = {
            data: [
                view({ load_time: 100 }),
                view({ load_time: 300 }),
                view({ load_time: null }),
                view({ load_time: 0 }),
            ],
            error: null,
        }
        const stats = await (await req({ "x-logistics-key": KEY })).json()
        expect(stats.avgLoadTime).toBe(200)
    })

    it("cleans referrer hostnames", async () => {
        mockDb.result = {
            data: [
                view({ referrer: "https://www.google.com/search?q=x" }),
                view({ referrer: "" }),
            ],
            error: null,
        }
        const stats = await (await req({ "x-logistics-key": KEY })).json()
        const refs = stats.topReferrers.map((r: { referrer: string }) => r.referrer)
        expect(refs).toContain("google.com")
        expect(refs).toContain("Direct")
    })

    it("returns 30 daily buckets and 24 hour buckets even with no data", async () => {
        const stats = await (await req({ "x-logistics-key": KEY })).json()
        expect(stats.dailyViews).toHaveLength(30)
        expect(stats.peakHours).toHaveLength(24)
        expect(stats.totalViews).toBe(0)
        expect(stats.bounceRate).toBe(0)
    })

    it("hides DB error details", async () => {
        mockDb.result = { data: null, error: { message: "secret schema info" } }
        const res = await req({ "x-logistics-key": KEY })
        expect(res.status).toBe(500)
        expect(JSON.stringify(await res.json())).not.toContain("secret schema info")
    })
})
