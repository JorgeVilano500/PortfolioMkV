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

/** The CSP a fresh load of next.config.ts produces under the given env. */
async function cspWith(env: Record<string, string | undefined>): Promise<string> {
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]))
    const restore = (values: Record<string, string | undefined>) => {
        for (const [k, v] of Object.entries(values)) {
            if (v === undefined) delete process.env[k]
            else process.env[k] = v
        }
    }
    restore(env)
    try {
        let fresh: { headers: () => Promise<Rule[]> } | undefined
        jest.isolateModules(() => { fresh = require("../next.config") })
        const rules = await fresh!.headers()
        return find(rules.find((r) => r.source === "/:path*")!.headers, "Content-Security-Policy")
    } finally {
        restore(saved)
    }
}

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `) || d === name) ?? ""

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
        // Fonts are self-hosted via next/font — no third-party font origins
        expect(csp).not.toContain("fonts.googleapis.com")
        expect(csp).not.toContain("fonts.gstatic.com")
    })

    it("connect-src allows this project's Supabase origin and no other", async () => {
        const csp = await cspWith({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co/" })
        expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://abcdefgh.supabase.co")
        // A wildcard would let injected script exfiltrate to an attacker's own project.
        expect(csp).not.toContain("*.supabase.co")
    })

    it.each([
        ["unset", undefined],
        ["malformed", "not a url"],
        ["plain http in production", "http://abcdefgh.supabase.co"],
        ["a javascript: URL", "javascript:alert(1)"],
    ])("connect-src fails closed to 'self' when the Supabase URL is %s", async (_label, value) => {
        const csp = await cspWith({ NEXT_PUBLIC_SUPABASE_URL: value })
        expect(directive(csp, "connect-src")).toBe("connect-src 'self'")
    })

    it("denies powerful browser features the site never uses", async () => {
        const policy = find(await getHeaders(), "Permissions-Policy")
        for (const feature of ["camera", "microphone", "geolocation", "payment", "usb", "serial", "hid", "display-capture", "browsing-topics"]) {
            expect(policy).toContain(`${feature}=()`)
        }
        // The copy-link button needs the clipboard.
        expect(policy).not.toContain("clipboard-write=()")
    })

    it("refuses cross-domain policy files", async () => {
        expect(find(await getHeaders(), "X-Permitted-Cross-Domain-Policies")).toBe("none")
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

    it("API responses can't be embedded by other sites (CORP)", async () => {
        expect(find(await getRule("/api/:path*"), "Cross-Origin-Resource-Policy")).toBe("same-origin")
    })

    it.each(["/studio/:path*", "/logistics/:path*"])("%s is marked noindex", async (source) => {
        expect(find(await getRule(source), "X-Robots-Tag")).toContain("noindex")
    })
})
