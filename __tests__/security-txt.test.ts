/**
 * /.well-known/security.txt — RFC 9116 vulnerability-disclosure contact.
 */
import { GET } from "@/app/.well-known/security.txt/route"

const fields = (text: string) =>
    Object.fromEntries(text.trim().split("\n").map((line) => {
        const i = line.indexOf(": ")
        return [line.slice(0, i), line.slice(i + 2)]
    }))

afterEach(() => {
    delete process.env.SECURITY_CONTACT
    delete process.env.NEXT_PUBLIC_SITE_URL
})

describe("security.txt", () => {
    it("is plain text with the required Contact and Expires fields", async () => {
        const res = GET()
        expect(res.headers.get("content-type")).toContain("text/plain")
        const f = fields(await res.text())
        expect(f.Contact).toMatch(/^(mailto:|https:\/\/)/)
        expect(f.Expires).toBeDefined()
    })

    it("expires in the future but less than a year out (RFC 9116)", async () => {
        const expires = Date.parse(fields(await GET().text()).Expires)
        const now = Date.now()
        expect(expires).toBeGreaterThan(now)
        expect(expires - now).toBeLessThan(365 * 24 * 60 * 60 * 1000)
    })

    it("uses SECURITY_CONTACT when set", async () => {
        process.env.SECURITY_CONTACT = "security@example.com"
        expect(fields(await GET().text()).Contact).toBe("mailto:security@example.com")
        process.env.SECURITY_CONTACT = "https://example.com/report"
        expect(fields(await GET().text()).Contact).toBe("https://example.com/report")
    })

    it("names its canonical URL on the configured site", async () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://example.dev/"
        expect(fields(await GET().text()).Canonical).toBe("https://example.dev/.well-known/security.txt")
    })
})
