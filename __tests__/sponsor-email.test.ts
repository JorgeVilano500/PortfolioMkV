/**
 * lib/sponsor-email — the two emails for a sponsorship offer.
 * Security: visitor text is escaped everywhere (it's stored-XSS in someone's
 * inbox otherwise), subjects can't carry line breaks, and the only link built
 * from visitor input is the owner's mailto: to an already-validated address.
 */
import {
    escapeHtml,
    formatBytes,
    ownerNotificationEmail,
    sponsorConfirmationEmail,
    type SponsorInquiry,
} from "@/lib/sponsor-email"

const SITE = "https://javastudios.netlify.app"

const inquiry = (overrides: Partial<SponsorInquiry> = {}): SponsorInquiry => ({
    id:          "3f2b6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f",
    email:       "jane@acme.dev",
    affiliation: "Acme Dev Tools",
    offer:       1500,
    spot:        "slot-2",
    fileName:    "acme-logo.png",
    fileType:    "image/png",
    fileBytes:   1_250_000,
    receivedAt:  new Date("2026-10-30T16:05:00Z"),
    ...overrides,
})

describe("escapeHtml", () => {
    it("escapes every HTML-significant character", () => {
        expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;")
    })
})

describe("sponsor's thank-you copy", () => {
    const mail = sponsorConfirmationEmail(inquiry(), SITE)

    it("thanks them and promises a reply soon", () => {
        expect(mail.subject).toBe("Thanks for your sponsorship offer · JAVA.dev")
        expect(mail.html).toMatch(/Thanks for your sponsorship offer!/)
        expect(mail.text).toMatch(/I'll get back to you as soon as possible/)
    })

    it("includes a copy of everything they provided", () => {
        for (const value of ["jane@acme.dev", "Acme Dev Tools", "Upper right", "$1,500", "PNG, 1.2 MB", "3F2B6C1E"]) {
            expect(mail.html).toContain(value)
            expect(mail.text).toContain(value)
        }
    })

    it("leaves out the original file name (mail clients auto-link domain-like names)", () => {
        const withName = sponsorConfirmationEmail(inquiry({ fileName: "evil.com.png" }), SITE)
        expect(withName.html).not.toContain("evil.com")
    })

    it("says nothing was charged", () => {
        expect(mail.text).toMatch(/Nothing has been charged/)
    })

    it("uses the site's look: dark page, card, violet accent", () => {
        for (const color of ["#0a0a0f", "#13121c", "#2a2840", "#7c6dff", "#f0eeff"]) expect(mail.html).toContain(color)
        expect(mail.html).toContain("color-scheme")
    })
})

describe("owner's inquiry notice", () => {
    const mail = ownerNotificationEmail(inquiry(), SITE, { stored: true })

    it("announces a sponsorship inquiry with the affiliation and offer in the subject", () => {
        expect(mail.subject).toBe("Sponsorship inquiry: Acme Dev Tools ($1,500)")
        expect(mail.html).toMatch(/Someone is inquiring about a sponsorship/)
    })

    it("makes replying easy: a mailto button and a Reply-To explanation", () => {
        expect(mail.html).toContain('href="mailto:jane@acme.dev?subject=Your%20sticker%20sponsorship%20offer"')
        expect(mail.text).toMatch(/hit Reply/)
    })

    it("lists the file by name and notes it's attached and stored", () => {
        expect(mail.html).toContain("acme-logo.png")
        expect(mail.text).toMatch(/attached/)
        expect(mail.text).toMatch(/sponsor-stickers/)
    })

    it("admits when storage failed, so the email is known to be the only copy", () => {
        const unstored = ownerNotificationEmail(inquiry(), SITE, { stored: false })
        expect(unstored.text).toMatch(/could NOT be saved/)
    })
})

describe("hostile input", () => {
    const evil = inquiry({ affiliation: `<img src=x onerror=alert(1)> "Acme" & <b>Co</b>`, fileName: `<script>x</script>.png` })

    it.each([
        ["thank-you copy", sponsorConfirmationEmail(evil, SITE)],
        ["owner notice", ownerNotificationEmail(evil, SITE, { stored: true })],
    ])("escapes visitor text in the %s", (_label, mail) => {
        expect(mail.html).not.toMatch(/<img|<script|<b>Co/)
        expect(mail.html).toContain("&lt;img src=x onerror=alert(1)&gt;")
    })

    it("only ever links to the validated email address", () => {
        const html = ownerNotificationEmail(evil, SITE, { stored: true }).html
        const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
        expect(hrefs.every((href) => href.startsWith("mailto:jane@acme.dev?"))).toBe(true)
    })

    it("keeps subjects on one line", () => {
        expect(ownerNotificationEmail(evil, SITE, { stored: true }).subject).not.toMatch(/[\r\n]/)
    })
})

describe("formatBytes", () => {
    it.each([[512, "512 B"], [2048, "2 KB"], [1_250_000, "1.2 MB"]])("%p → %p", (input, expected) => {
        expect(formatBytes(input)).toBe(expected)
    })
})
