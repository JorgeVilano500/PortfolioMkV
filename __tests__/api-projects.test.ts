/**
 * /api/projects — CRUD with x-logistics-key auth.
 * Security: auth rejection, brute-force lockout, mass-assignment prevention,
 * input validation, no DB error leakage. Mirrors __tests__/api-blog-posts.test.ts.
 */
import { resetRateLimits } from "@/lib/rate-limit"
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

import { GET, POST, PATCH, DELETE } from "@/app/api/projects/route"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/projects"
const KEY = "test-logistics-password"

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
    it("returns projects with a valid key", async () => {
        const rows = [{ id: "1", title: "Dice Roller" }]
        mockDb.result = { data: rows, error: null }
        const res = await GET(makeRequest(URL, { headers: { "x-logistics-key": KEY } }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual(rows)
    })

    it("hides DB error details from the client", async () => {
        mockDb.result = { data: null, error: { message: 'relation "projects" does not exist' } }
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

    it("creates a project with valid fields", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "Dice Roller", description: "3D dice" }, auth))
        expect(res.status).toBe(201)
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.title).toBe("Dice Roller")
        expect(row.description).toBe("3D dice")
        expect(row.status).toBe("planned")   // default
        expect(row.published).toBe(true)     // default
        expect(row.featured).toBe(false)     // default
        expect(row.icon).toBe("🚀")          // default
    })

    it("rejects a missing title", async () => {
        const res = await POST(jsonRequest(URL, "POST", { description: "no title" }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects oversized description", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "T", description: "a".repeat(2_001) }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects malformed tags", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "T", tags: [{ nope: 1 }] }, auth))
        expect(res.status).toBe(400)
    })

    it("coerces unknown status to planned", async () => {
        await POST(jsonRequest(URL, "POST", { title: "T", status: "shipped" }, auth))
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.status).toBe("planned")
    })

    it("coerces unknown themes to purple", async () => {
        await POST(jsonRequest(URL, "POST", { title: "T", theme: "neon" }, auth))
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.theme).toBe("purple")
    })

    it("accepts a valid https link and github url", async () => {
        const res = await POST(jsonRequest(URL, "POST", {
            title: "T", link: "https://example.com", github: "https://github.com/x/y",
        }, auth))
        expect(res.status).toBe(201)
        const row = firstCallArg(mockDb, "insert") as Record<string, unknown>
        expect(row.link).toBe("https://example.com")
        expect(row.github).toBe("https://github.com/x/y")
    })

    it("rejects a non-http(s) link", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "T", link: "javascript:alert(1)" }, auth))
        expect(res.status).toBe(400)
    })

    it("allows an empty link/github to represent 'no link'", async () => {
        const res = await POST(jsonRequest(URL, "POST", { title: "T", link: "", github: "" }, auth))
        expect(res.status).toBe(201)
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
        const res = await PATCH(jsonRequest(URL, "PATCH", { id: "abc", title: "New", featured: true }, auth))
        expect(res.status).toBe(200)
        const fields = firstCallArg(mockDb, "update") as Record<string, unknown>
        expect(fields).toEqual({ title: "New", featured: true })
    })

    it("blocks mass assignment — id/created_at/arbitrary columns never reach the DB", async () => {
        await PATCH(jsonRequest(URL, "PATCH", {
            id: "abc",
            title: "ok",
            created_at: "1970-01-01",       // spoof post date
            user_role: "admin",             // arbitrary column
        }, auth))
        const fields = firstCallArg(mockDb, "update") as Record<string, unknown>
        expect(fields).toEqual({ title: "ok" })
        expect(fields).not.toHaveProperty("created_at")
        expect(fields).not.toHaveProperty("user_role")
    })

    it("rejects a missing id", async () => {
        const res = await PATCH(jsonRequest(URL, "PATCH", { title: "New" }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects a body with no updatable fields", async () => {
        const res = await PATCH(jsonRequest(URL, "PATCH", { id: "abc", bogus: 1 }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects invalid published type", async () => {
        const res = await PATCH(jsonRequest(URL, "PATCH", { id: "abc", published: "yes" }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects an invalid link on update", async () => {
        const res = await PATCH(jsonRequest(URL, "PATCH", { id: "abc", link: "not-a-url" }, auth))
        expect(res.status).toBe(400)
    })
})

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe("DELETE", () => {
    const auth = { "x-logistics-key": KEY }

    it("deletes by id", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", { id: "abc" }, auth))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true })
        expect(firstCallArg(mockDb, "eq")).toBe("id")
    })

    it("rejects a missing id", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", {}, auth))
        expect(res.status).toBe(400)
    })

    it("group-deletes by ids", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", { ids: ["a", "b", "c"] }, auth))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, deleted: 3 })
        const inCall = mockDb.calls.find((c) => c.method === "in")
        expect(inCall?.args).toEqual(["id", ["a", "b", "c"]])
    })

    it("rejects an empty ids array", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", { ids: [] }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects ids containing non-strings", async () => {
        const res = await DELETE(jsonRequest(URL, "DELETE", { ids: ["a", 5] }, auth))
        expect(res.status).toBe(400)
    })

    it("rejects more than 100 ids", async () => {
        const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`)
        const res = await DELETE(jsonRequest(URL, "DELETE", { ids }, auth))
        expect(res.status).toBe(400)
    })
})
