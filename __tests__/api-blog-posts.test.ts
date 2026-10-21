/**
 * /api/blog/posts — CRUD with x-logistics-key auth.
 * Security: auth rejection, brute-force lockout, mass-assignment prevention,
 * input validation, no DB error leakage.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { SESSION_COOKIE, createSessionToken } from "@/lib/session"
import {
    makeRequest,
    jsonRequest,
    firstCallArg,
    type SupabaseMockState,
} from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { GET, POST, PATCH, DELETE } from "@/app/api/blog/posts/route"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/blog/posts"
const KEY = "test-logistics-password"
const ID = "3f2b6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f"
const IDS = [ID, "9a8b7c6d-5e4f-4a3b-8c2d-0f1e2d3c4b5a", "00000000-0000-4000-8000-000000000001"]

beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = KEY
    resetRateLimits()
    mockDb.result = { data: { id: "1" }, error: null }
    mockDb.queue = []
    mockDb.calls = []
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

// ─── Auth ────────────────────────────────────────────────────────────────────

describe("auth", () => {
    it.each([
        ["GET", GET], ["POST", POST], ["PATCH", PATCH], ["DELETE", DELETE],
    ] as const)("%s rejects a missing key with 401", async (_name, handler) => {
        const res = await handler(makeRequest(URL, { method: _name }))
        expect(res.status).toBe(401)
    })

    it("rejects a wrong key with 401", async () => {
        const res = await GET(makeRequest(URL, { headers: { "x-logistics-key": "wrong" } }))
        expect(res.status).toBe(401)
    })

    it("rejects everything when the secret env var is unset (fail closed)", async () => {
        delete process.env.LOGISTICS_PASSWORD
        const res = await GET(makeRequest(URL, { headers: { "x-logistics-key": "" } }))
        expect(res.status).toBe(401)
    })

    it("locks an IP out with 429 after 10 failed attempts", async () => {
        const headers = { "x-logistics-key": "wrong", "x-forwarded-for": "6.6.6.6" }
        for (let i = 0; i < 10; i++) {
            const res = await GET(makeRequest(URL, { headers }))
            expect(res.status).toBe(401)
        }
        const res = await GET(makeRequest(URL, { headers }))
        expect(res.status).toBe(429)

        // ...even with the CORRECT key — lockout can't be bypassed
        const correct = await GET(makeRequest(URL, {
            headers: { "x-logistics-key": KEY, "x-forwarded-for": "6.6.6.6" },
        }))
        expect(correct.status).toBe(429)
    })

    it("does not lock out other IPs", async () => {
        for (let i = 0; i < 11; i++) {
            await GET(makeRequest(URL, { headers: { "x-logistics-key": "wrong", "x-forwarded-for": "6.6.6.6" } }))
        }
        mockDb.result = { data: [], error: null }
        const res = await GET(makeRequest(URL, { headers: { "x-logistics-key": KEY, "x-forwarded-for": "7.7.7.7" } }))
        expect(res.status).toBe(200)
    })
})

// ─── GET ─────────────────────────────────────────────────────────────────────

describe("GET", () => {
    it("returns posts with view counts merged from analytics", async () => {
        mockDb.queue = [
            { data: [{ id: "1", title: "Hi", slug: "hi" }, { id: "2", title: "Yo", slug: "yo" }], error: null },
            { data: [{ page: "/blog/hi" }, { page: "/blog/hi" }, { page: "/blog/other" }], error: null },
        ]
        const res = await GET(makeRequest(URL, { headers: { "x-logistics-key": KEY } }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual([
            { id: "1", title: "Hi", slug: "hi", view_count: 2 },
            { id: "2", title: "Yo", slug: "yo", view_count: 0 },
        ])
    })

    it("still returns posts (view_count 0) when the analytics query fails", async () => {
        mockDb.queue = [
            { data: [{ id: "1", title: "Hi", slug: "hi" }], error: null },
            { data: null, error: { message: "page_views unavailable" } },
        ]
        const res = await GET(makeRequest(URL, { headers: { "x-logistics-key": KEY } }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual([{ id: "1", title: "Hi", slug: "hi", view_count: 0 }])
    })

    it("hides DB error details from the client", async () => {
        mockDb.result = { data: null, error: { message: 'relation "posts" does not exist' } }
        const res = await GET(makeRequest(URL, { headers: { "x-logistics-key": KEY } }))
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(JSON.stringify(body)).not.toContain("relation")
        expect(body.error).toBe("Database error")
    })
})

// ─── POST ────────────────────────────────────────────────────────────────────

describe("POST", () => {
    const auth = { "x-logistics-key": KEY }

    it("creates a post with valid fields", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "My Post", slug: "my-post", content: "hello world" }, auth))
        expect(res.status).toBe(201)
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.title).toBe("My Post")
        expect(row.slug).toBe("my-post")
        expect(row.published).toBe(false) // never published by default
        expect(row.reading_time).toBe(1)
    })

    it("rejects a missing title", async () => {
        const res = await POST(jsonRequest(URL, "POST", { slug: "x" }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects an invalid slug", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "T", slug: "../../etc" }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects oversized content", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "T", slug: "t", content: "a".repeat(200_001) }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects malformed tags", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "T", slug: "t", tags: [{ nope: 1 }] }, auth))
        expect(res.status).toBe(400)
    })

    it("coerces unknown themes to purple", async () => {
        await POST(jsonRequest(URL, "POST", { title: "T", slug: "t", theme: "neon" }, auth))
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.theme).toBe("purple")
    })

    it("rejects a non-JSON body", async () => {
        const res = await POST(makeRequest(URL, { method: "POST", headers: auth, body: "not json" }))
        expect(res.status).toBe(400)
    })
})

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe("PATCH", () => {
    const auth = { "x-logistics-key": KEY }

    it("updates whitelisted fields", async () => {
        const res = await PATCH(jsonRequest(URL, "PATCH", { id: ID, title: "New", published: true }, auth))
        expect(res.status).toBe(200)
        const fields = firstCallArg(mockDb, "update") as Record<string, unknown>
        expect(fields).toEqual({ title: "New", published: true })
    })

    it("blocks mass assignment — id/created_at/arbitrary columns never reach the DB", async () => {
        await PATCH(jsonRequest(URL, "PATCH", {
            id: ID,
            title: "ok",
            created_at: "1970-01-01",       // spoof post date
            reading_time: 9999,             // spoof computed field
            user_role: "admin",             // arbitrary column
        }, auth))
        const fields = firstCallArg(mockDb, "update") as Record<string, unknown>
        expect(fields).toEqual({ title: "ok" })
        expect(fields).not.toHaveProperty("created_at")
        expect(fields).not.toHaveProperty("user_role")
    })

    it("recomputes reading_time when content changes", async () => {
        await PATCH(jsonRequest(URL, "PATCH", { id: ID, content: Array(400).fill("w").join(" ") }, auth))
        const fields = firstCallArg(mockDb, "update") as Record<string, unknown>
        expect(fields.reading_time).toBe(2)
    })

    it("rejects a missing id", async () => {
        const res = await PATCH(jsonRequest(URL, "PATCH", { title: "New" }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects a body with no updatable fields", async () => {
        const res = await PATCH(jsonRequest(URL, "PATCH", { id: ID, bogus: 1 }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects invalid published type", async () => {
        const res = await PATCH(jsonRequest(URL, "PATCH", { id: ID, published: "yes" }, auth))
        expect(res.status).toBe(400)
    })
})

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe("DELETE", () => {
    const auth = { "x-logistics-key": KEY }

    it("deletes by id", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", { id: ID }, auth))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true })
        expect(firstCallArg(mockDb, "eq")).toBe("id")
    })

    it("rejects a missing id", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", {}, auth))
        expect(res.status).toBe(400)
    })

    it("group-deletes by ids", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", { ids: IDS }, auth))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, deleted: 3 })
        const inCall = mockDb.calls.find((c) => c.method === "in")
        expect(inCall?.args).toEqual(["id", IDS])
    })

    it("rejects an empty ids array", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", { ids: [] }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects ids containing non-strings", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", { ids: [ID, 5] }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects more than 100 ids", async () => {
        const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)
        const res = await DELETE(jsonRequest(URL, "DELETE", { ids }, auth))
        expect(res.status).toBe(400)
    })
})

describe("id validation", () => {
    const auth = { "x-logistics-key": KEY }

    it.each(["abc", "1", "x\",\"y", ""])("rejects non-uuid id %p", async (id) => {
        expect((await PATCH(jsonRequest(URL, "PATCH", { id, title: "T" }, auth))).status).toBe(400)
        expect((await DELETE(jsonRequest(URL, "DELETE", { id }, auth))).status).toBe(400)
    })
})

describe("session cookie auth", () => {
    beforeEach(() => { process.env.SESSION_SECRET = "test-session-secret" })
    afterEach(() => { delete process.env.SESSION_SECRET })

    it("accepts a valid cookie and blocks cross-site mutations", async () => {
        const cookie = `${SESSION_COOKIE}=${createSessionToken()!}`
        mockDb.queue = [{ data: [], error: null }, { data: [], error: null }]
        expect((await GET(makeRequest(URL, { headers: { cookie } }))).status).toBe(200)
        const res = await POST(jsonRequest(URL, "POST", { title: "T", slug: "t" }, { cookie, "sec-fetch-site": "cross-site" }))
        expect(res.status).toBe(403)
    })
})
