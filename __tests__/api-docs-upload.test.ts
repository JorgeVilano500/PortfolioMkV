/**
 * /api/docs/upload — project markdown document sync (x-api-key auth).
 * Security: auth, brute-force lockout, filename/slug validation, size caps.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { makeRequest, firstCallArg, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { POST } from "@/app/api/docs/upload/route"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/docs/upload"
const KEY = "test-docs-secret"

const validDoc = {
    project: "portfoliomkv",
    filename: "PROJECT_OVERVIEW.md",
    title: "Portfolio mkV — Project Overview",
    content: "# Portfolio mkV\n\nSome markdown.",
    source: "daily-status-task",
}

function upload(payload: unknown, headers: Record<string, string> = {}) {
    return POST(makeRequest(URL, {
        method: "POST",
        headers: { "x-api-key": KEY, "x-forwarded-for": "1.2.3.4", ...headers },
        body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }))
}

beforeEach(() => {
    process.env.DOCS_UPLOAD_SECRET = KEY
    resetRateLimits()
    mockDb.result = {
        data: { id: "1", project_slug: "portfoliomkv", filename: "PROJECT_OVERVIEW.md", content_hash: "x", updated_at: "now" },
        error: null,
    }
    mockDb.calls = []
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("auth", () => {
    it("rejects a missing key", async () => {
        const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(validDoc) }))
        expect(res.status).toBe(401)
    })

    it("rejects a wrong key", async () => {
        expect((await upload(validDoc, { "x-api-key": "wrong" })).status).toBe(401)
    })

    it("fails closed when the secret is unset", async () => {
        delete process.env.DOCS_UPLOAD_SECRET
        expect((await upload(validDoc)).status).toBe(401)
    })

    it("locks out after repeated failures", async () => {
        for (let i = 0; i < 10; i++) await upload(validDoc, { "x-api-key": "wrong" })
        expect((await upload(validDoc)).status).toBe(429)
    })
})

describe("validation", () => {
    it("rejects invalid JSON", async () => {
        expect((await upload("not json {")).status).toBe(400)
    })

    it("rejects an oversized body", async () => {
        expect((await upload({ ...validDoc, content: "a".repeat(1_000_001) })).status).toBe(413)
    })

    it("rejects a missing project", async () => {
        expect((await upload({ ...validDoc, project: undefined })).status).toBe(400)
    })

    it("rejects a hostile project slug", async () => {
        expect((await upload({ ...validDoc, project: "../etc" })).status).toBe(400)
    })

    it("rejects a path-traversal filename", async () => {
        expect((await upload({ ...validDoc, filename: "../secrets.md" })).status).toBe(400)
    })

    it("rejects a non-markdown filename", async () => {
        expect((await upload({ ...validDoc, filename: "notes.txt" })).status).toBe(400)
    })

    it("rejects empty content", async () => {
        expect((await upload({ ...validDoc, content: "   " })).status).toBe(400)
    })
})

describe("happy path", () => {
    it("upserts a valid document", async () => {
        const res = await upload(validDoc)
        expect(res.status).toBe(201)
        const row = firstCallArg(mockDb, "upsert") as Record<string, unknown>
        expect(row.project_slug).toBe("portfoliomkv")
        expect(row.filename).toBe("PROJECT_OVERVIEW.md")
        expect(row.content).toContain("Some markdown")
        expect(typeof row.content_hash).toBe("string")
        expect((row.content_hash as string).length).toBe(64)
    })

    it("upserts on project_slug,filename so re-sending updates in place", async () => {
        await upload(validDoc)
        const opts = mockDb.calls.find((c) => c.method === "upsert")?.args[1]
        expect(opts).toEqual({ onConflict: "project_slug,filename" })
    })

    it("defaults optional title/source to empty strings", async () => {
        await upload({ project: "p", filename: "a.md", content: "x" })
        const row = firstCallArg(mockDb, "upsert") as Record<string, unknown>
        expect(row.title).toBe("")
        expect(row.source).toBe("")
    })

    it("hides DB error details", async () => {
        mockDb.result = { data: null, error: { message: "internal constraint xyz" } }
        const res = await upload(validDoc)
        expect(res.status).toBe(500)
        expect(JSON.stringify(await res.json())).not.toContain("constraint")
    })
})
