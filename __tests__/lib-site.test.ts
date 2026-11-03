/**
 * lib/site — the site origin used by the sitemap, robots.txt, canonical
 * metadata, JSON-LD and security.txt. Without NEXT_PUBLIC_SITE_URL these used
 * to fall back to "https://java.dev", a domain this site doesn't own.
 */
import { CONTACT_EMAIL, siteUrl } from "@/lib/site"
import { GET as securityTxt } from "@/app/.well-known/security.txt/route"

afterEach(() => { delete process.env.NEXT_PUBLIC_SITE_URL })

describe("siteUrl", () => {
    it("falls back to the live site, never a domain we don't own", () => {
        delete process.env.NEXT_PUBLIC_SITE_URL
        expect(siteUrl()).toBe("https://javastudios.netlify.app")
    })

    it("uses NEXT_PUBLIC_SITE_URL without a trailing slash", () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://example.dev/"
        expect(siteUrl()).toBe("https://example.dev")
    })

    it("treats a blank value as unset", () => {
        process.env.NEXT_PUBLIC_SITE_URL = "  "
        expect(siteUrl()).toBe("https://javastudios.netlify.app")
    })
})

it("security.txt points at this site and the public contact address by default", async () => {
    const text = await securityTxt().text()
    expect(text).toContain("Canonical: https://javastudios.netlify.app/.well-known/security.txt")
    expect(text).toContain(`Contact: mailto:${CONTACT_EMAIL}`)
    expect(text).not.toContain("java.dev")
})
