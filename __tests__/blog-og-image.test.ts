/**
 * app/blog/[slug]/opengraph-image — the share image for a blog post.
 * Security: it renders on request (a database query plus an image render, for
 * any slug), so one client is limited to 30 a minute, and the 429 is never
 * cached by a CDN (SECURITY.md S-47).
 */
import { resetRateLimits } from "@/lib/rate-limit"

// The real ImageResponse renders with WebAssembly; a plain Response stands in.
jest.mock("next/og", () => ({
    ImageResponse: class extends Response {
        constructor() { super("png", { headers: { "Content-Type": "image/png" } }) }
    },
}))

let mockRequestHeaders = new Headers()
jest.mock("next/headers", () => ({ headers: async () => mockRequestHeaders }))

jest.mock("@/lib/blog", () => ({ getPostBySlug: jest.fn() }))

import OGImage from "@/app/blog/[slug]/opengraph-image"

const getPostBySlug = (jest.requireMock("@/lib/blog") as { getPostBySlug: jest.Mock }).getPostBySlug

function imageFor(ip: string, slug = "hello-world") {
    mockRequestHeaders = new Headers({ "x-forwarded-for": ip })
    return OGImage({ params: Promise.resolve({ slug }) })
}

beforeEach(() => {
    resetRateLimits()
    getPostBySlug.mockReset()
    getPostBySlug.mockResolvedValue({ title: "Hello", excerpt: "World", cover_emoji: "👋" })
})

describe("blog OG image", () => {
    it("renders the post's card", async () => {
        const res = await imageFor("1.2.3.4")
        expect(res.status).toBe(200)
        expect(getPostBySlug).toHaveBeenCalledWith("hello-world")
    })

    it("limits one client to 30 a minute, before querying, with a 429 no CDN keeps", async () => {
        for (let i = 0; i < 30; i++) expect((await imageFor("1.2.3.4", `post-${i}`)).status).toBe(200)
        getPostBySlug.mockClear()

        const res = await imageFor("1.2.3.4")
        expect(res.status).toBe(429)
        expect(res.headers.get("Cache-Control")).toBe("no-store")
        expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0)
        expect(getPostBySlug).not.toHaveBeenCalled()

        expect((await imageFor("5.6.7.8")).status).toBe(200)
    })
})
