/**
 * next.config.ts — security headers applied to every route.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const config = require("../next.config")

type Header = { key: string; value: string }

async function getHeaders(): Promise<Header[]> {
    const rules = await config.headers()
    expect(rules).toHaveLength(1)
    expect(rules[0].source).toBe("/:path*")
    return rules[0].headers
}

function find(headers: Header[], key: string): string {
    return headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? ""
}

describe("security headers", () => {
    it("sets all expected headers", async () => {
        const headers = await getHeaders()
        for (const key of [
            "Content-Security-Policy",
            "X-Frame-Options",
            "X-Content-Type-Options",
            "Referrer-Policy",
            "Permissions-Policy",
            "Strict-Transport-Security",
        ]) {
            expect(find(headers, key)).toBeTruthy()
        }
    })

    it("denies framing (clickjacking)", async () => {
        const headers = await getHeaders()
        expect(find(headers, "X-Frame-Options")).toBe("DENY")
        expect(find(headers, "Content-Security-Policy")).toContain("frame-ancestors 'none'")
    })

    it("blocks MIME sniffing", async () => {
        expect(find(await getHeaders(), "X-Content-Type-Options")).toBe("nosniff")
    })

    it("CSP locks down objects and base URIs", async () => {
        const csp = find(await getHeaders(), "Content-Security-Policy")
        expect(csp).toContain("default-src 'self'")
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain("base-uri 'self'")
        expect(csp).toContain("form-action 'self'")
    })

    it("CSP allows the origins the app actually uses", async () => {
        const csp = find(await getHeaders(), "Content-Security-Policy")
        expect(csp).toContain("https://*.supabase.co")       // browser Supabase client
        expect(csp).toContain("https://fonts.googleapis.com") // layout font <link>
        expect(csp).toContain("https://fonts.gstatic.com")
    })

    it("does not allow unsafe-eval outside development", async () => {
        // Tests run with NODE_ENV=test, which must behave like production here
        const csp = find(await getHeaders(), "Content-Security-Policy")
        expect(csp).not.toContain("unsafe-eval")
    })

    it("enables HSTS for at least a year", async () => {
        const hsts = find(await getHeaders(), "Strict-Transport-Security")
        const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0)
        expect(maxAge).toBeGreaterThanOrEqual(31536000)
    })
})
