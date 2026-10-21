/**
 * /api/consent — consent receipts (POST) and self-service erasure (DELETE).
 * Security/privacy: same-origin only, rate-limited, strict validation, no IP
 * stored in the consent log, erasure scoped to the caller's own visitor id.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } from "@/lib/consent"
import { makeRequest, jsonRequest, firstCallArg, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { POST, DELETE } from "@/app/api/consent/route"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/consent"
const ID  = "7d3f4b2a-1c9e-4f60-8a1b-2c3d4e5f6a7b"
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", "x-forwarded-for": "1.2.3.4" }
const cookieFor = (analytics: boolean) =>
    `${CONSENT_COOKIE}=${serializeConsent({ version: CONSENT_VERSION, analytics, decidedAt: Date.now(), id: ID })}`

function record(body: unknown, headers: Record<string, string> = {}) {
    return POST(jsonRequest(URL, "POST", body, { ...SAME_ORIGIN, ...headers }))
}

function erase(headers: Record<string, string> = {}) {
    return DELETE(makeRequest(URL, { method: "DELETE", headers: { ...SAME_ORIGIN, ...headers } }))
}

beforeEach(() => {
    resetRateLimits()
    mockDb.result = { data: null, error: null, count: 0 }
    mockDb.queue = []
    mockDb.calls = []
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("POST (record a choice)", () => {
    it("logs a minimal receipt: visitor id, choice, policy version — no IP or user agent", async () => {
        const res = await record({ id: ID, analytics: true, version: CONSENT_VERSION }, { "user-agent": "UA" })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, logged: true })
        expect(firstCallArg(mockDb, "from")).toBe("consent_events")
        expect(firstCallArg(mockDb, "insert")).toEqual({
            visitor_id: ID, analytics: true, policy_version: CONSENT_VERSION, action: "set",
        })
    })

    it.each([
        ["a non-uuid id",        { id: "abc", analytics: true, version: CONSENT_VERSION }],
        ["a non-boolean choice", { id: ID, analytics: "yes", version: CONSENT_VERSION }],
        ["an outdated version",  { id: ID, analytics: true, version: CONSENT_VERSION + 1 }],
        ["a missing field",      { id: ID, version: CONSENT_VERSION }],
        ["an array body",        [ID, true]],
        ["a null body",          null],
    ])("rejects %s", async (_label, body) => {
        expect((await record(body)).status).toBe(400)
        expect(mockDb.calls.some((c) => c.method === "insert")).toBe(false)
    })

    it("refuses cross-site requests", async () => {
        const res = await record({ id: ID, analytics: true, version: CONSENT_VERSION }, { "sec-fetch-site": "cross-site" })
        expect(res.status).toBe(403)
    })

    it("rate-limits per IP", async () => {
        for (let i = 0; i < 20; i++) await record({ id: ID, analytics: false, version: CONSENT_VERSION })
        expect((await record({ id: ID, analytics: false, version: CONSENT_VERSION })).status).toBe(429)
    })

    it("doesn't fail the visitor when the consent table doesn't exist yet", async () => {
        mockDb.result = { data: null, error: { message: "missing", code: "PGRST205" } }
        const res = await record({ id: ID, analytics: true, version: CONSENT_VERSION })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, logged: false })
    })

    it("hides other DB errors", async () => {
        mockDb.result = { data: null, error: { message: "secret schema detail" } }
        const res = await record({ id: ID, analytics: true, version: CONSENT_VERSION })
        expect(res.status).toBe(500)
        expect(JSON.stringify(await res.json())).not.toContain("secret")
    })
})

describe("DELETE (erase my analytics)", () => {
    it("deletes only the page views tied to the caller's own visitor id, then logs the erasure", async () => {
        mockDb.queue = [{ data: null, error: null, count: 12 }, { data: null, error: null }]
        const res = await erase({ cookie: cookieFor(true) })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, deleted: 12 })

        const fromCalls = mockDb.calls.filter((c) => c.method === "from").map((c) => c.args[0])
        expect(fromCalls).toEqual(["page_views", "consent_events"])
        expect(mockDb.calls.find((c) => c.method === "eq")?.args).toEqual(["visitor_id", ID])
        expect(mockDb.calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({ visitor_id: ID, action: "erase", analytics: false })
    })

    it("requires a consent cookie (there is nothing to match without one)", async () => {
        expect((await erase()).status).toBe(400)
        expect(mockDb.calls.some((c) => c.method === "delete")).toBe(false)
    })

    it("refuses cross-site requests (no CSRF-driven erasure)", async () => {
        expect((await erase({ cookie: cookieFor(true), "sec-fetch-site": "cross-site" })).status).toBe(403)
        expect(mockDb.calls.some((c) => c.method === "delete")).toBe(false)
    })

    it("reports 0 deleted when the visitor_id column doesn't exist yet", async () => {
        mockDb.queue = [{ data: null, error: { message: "no column", code: "42703" } }, { data: null, error: null }]
        const res = await erase({ cookie: cookieFor(false) })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, deleted: 0 })
    })
})
