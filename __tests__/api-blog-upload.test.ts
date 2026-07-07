/**
 * /api/blog/upload — markdown + frontmatter webhook (x-api-key auth).
 * Security: auth, brute-force lockout, slug sanitization, size caps, defaults.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { makeRequest, firstCallArg, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { POST } from "@/app/api/blog/upload/route"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state

const URL = "http://localhost/api/blog/upload"
const KEY = "test-upload-secret"

function upload(markdown: string, headers: Record<string, string> = {}) {
    return POST(makeRequest(URL, {
        method: "POST",
        headers: { "x-api-key": KEY, "x-forwarded-for": "1.2.3.4", ...headers },
        body: markdown,
    }))
}

const md = (front: string, body = "Hello **world**") => `---\n${front}\n---\n\n${body}\n`

beforeEach(() => {
    process.env.BLOG_UPLOAD_SECRET = KEY
    resetRateLimits()
    mockDb.result = { data: { id: "1", slug: "x", title: "x", published: false }, error: null }
    mockDb.calls = []
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("auth", () => {
    it("rejects a missing key", async () => {
        const res = await POST(makeRequest(URL, { method: "POST", body: md("title: X") }))
        expect(res.status).toBe(401)
    })

    it("rejects a wrong key", async () => {
        expect((await upload(md("title: X"), { "x-api-key": "wrong" })).status).toBe(401)
    })

    it("fails closed when the secret is unset", async () => {
        delete process.env.BLOG_UPLOAD_SECRET
        expect((await upload(md("title: X"))).status).toBe(401)
    })

    it("locks out after repeated failures", async () => {
        for (let i = 0; i < 10; i++) await upload(md("title: X"), { "x-api-key": "wrong" })
        expect((await upload(md("title: X"))).status).toBe(429)
    })
})

describe("validation & parsing", () => {
    it("rejects an empty body", async () => {
        expect((await upload("   ")).status).toBe(400)
    })

    it("rejects an oversized body", async () => {
        expect((await upload(md("title: X", "a".repeat(1_000_001)))).status).toBe(413)
    })

    it("rejects missing title", async () => {
        expect((await upload(md("published: true"))).status).toBe(400)
    })

    it("creates a post from valid frontmatter", async () => {
        const res = await upload(md('title: "My Post"\nslug: my-post\ntags: a, b\ntheme: green\npublished: true'))
        expect(res.status).toBe(201)
        const row = firstCallArg(mockDb, "upsert") as Record<string, unknown>
        expect(row.title).toBe("My Post")
        expect(row.slug).toBe("my-post")
        expect(row.tags).toEqual(["a", "b"])
        expect(row.theme).toBe("green")
        expect(row.published).toBe(true)
        expect(row.content).toContain("Hello **world**")
    })

    it("derives the slug from the title when absent", async () => {
        await upload(md('title: "Hello, World! Post"'))
        const row = firstCallArg(mockDb, "upsert") as Record<string, unknown>
        expect(row.slug).toBe("hello-world-post")
    })

    it("sanitizes a hostile frontmatter slug instead of trusting it", async () => {
        await upload(md('title: "T"\nslug: "../../ETC/pass wd"'))
        const row = firstCallArg(mockDb, "upsert") as Record<string, unknown>
        expect(row.slug).toBe("etcpass-wd")
        expect(String(row.slug)).not.toContain("/")
        expect(String(row.slug)).not.toContain(".")
    })

    it("rejects when no valid slug can be derived", async () => {
        expect((await upload(md('title: "🚀🚀🚀"'))).status).toBe(400)
    })

    it("defaults published to false unless exactly true", async () => {
        await upload(md('title: "T"\npublished: "yes"'))
        const row = firstCallArg(mockDb, "upsert") as Record<string, unknown>
        expect(row.published).toBe(false)
    })

    it("ignores absurd reading_time overrides", async () => {
        await upload(md('title: "T"\nreading_time: 99999'))
        const row = firstCallArg(mockDb, "upsert") as Record<string, unknown>
        expect(row.reading_time).toBe(1)
    })

    it("upserts on slug so re-sending a file updates the post", async () => {
        await upload(md('title: "T"\nslug: t'))
        const opts = mockDb.calls.find((c) => c.method === "upsert")?.args[1]
        expect(opts).toEqual({ onConflict: "slug" })
    })

    it("hides DB error details", async () => {
        mockDb.result = { data: null, error: { message: "internal constraint xyz" } }
        const res = await upload(md('title: "T"\nslug: t'))
        expect(res.status).toBe(500)
        expect(JSON.stringify(await res.json())).not.toContain("constraint")
    })
})
