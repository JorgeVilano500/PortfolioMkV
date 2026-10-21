/**
 * next.config.ts — security headers applied to every route, plus the extra
 * rules for API responses and admin pages.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const config = require("../next.config")

type Header = { key: string; value: string }
type Rule = { source: string; headers: Header[] }

async function getRule(source: string): Promise<Header[]> {
    const rules: Rule[] = await config.headers()
    const rule = rules.find((r) => r.source === source)
    expect(rule).toBeDefined()
    return rule!.headers
}

const getHeaders = () => getRule("/:path*")

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
            "Cross-Origin-Opener-Policy",
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

    it("isolates the browsing context from cross-origin openers", async () => {
        expect(find(await getHeaders(), "Cross-Origin-Opener-Policy")).toBe("same-origin")
    })

    it("CSP locks down objects and base URIs", async () => {
        const csp = find(await getHeaders(), "Content-Security-Policy")
        expect(csp).toContain("default-src 'self'")
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain("base-uri 'self'")
        expect(csp).toContain("form-action 'self'")
    })

    it("CSP blocks inline event-handler attributes", async () => {
        expect(find(await getHeaders(), "Content-Security-Policy")).toContain("script-src-attr 'none'")
    })

    it("CSP allows only the origins the app actually uses", async () => {
        const csp = find(await getHeaders(), "Content-Security-Policy")
        expect(csp).toContain("https://*.supabase.co")       // browser Supabase client
        // Fonts are self-hosted via next/font — no third-party font origins
        expect(csp).not.toContain("fonts.googleapis.com")
        expect(csp).not.toContain("fonts.gstatic.com")
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

    it("does not advertise the framework (X-Powered-By)", () => {
        expect(config.poweredByHeader).toBe(false)
    })

    it("keeps env var values out of the build cache (Netlify secrets scan)", () => {
        // Turbopack's persistent build cache stores env values; re-enabling it
        // makes Netlify fail every deploy with "secret value detected".
        expect(config.experimental?.turbopackFileSystemCacheForBuild).toBe(false)
    })
})

describe("API and admin rules", () => {
    it("API responses are never cached and never indexed", async () => {
        const headers = await getRule("/api/:path*")
        expect(find(headers, "Cache-Control")).toContain("no-store")
        expect(find(headers, "X-Robots-Tag")).toContain("noindex")
    })

    it.each(["/studio/:path*", "/logistics/:path*"])("%s is marked noindex", async (source) => {
        expect(find(await getRule(source), "X-Robots-Tag")).toContain("noindex")
    })
})
