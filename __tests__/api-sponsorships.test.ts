/**
 * POST /api/sponsorships — the "Sponsor a spot" offer form.
 * Security: same-origin only; flood, per-client, per-recipient, and global
 * caps (the route emails an address a stranger typed); byte-capped multipart;
 * honeypot; files judged by their bytes; nothing stored or sent for invalid
 * input; provider errors never reach the visitor. Behaviour: two separate
 * emails (owner with Reply-To + attachment, sponsor's copy), a private
 * storage copy that's optional, and an honest confirmationSent flag.
 */
import { NextRequest } from "next/server"
import { resetRateLimits } from "@/lib/rate-limit"

jest.mock("resend", () => {
    const send = jest.fn()
    return {
        Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
        __mockSend: send,
    }
})

jest.mock("@/lib/supabase-admin", () => {
    const upload = jest.fn()
    const from = jest.fn(() => ({ upload }))
    return { supabaseAdmin: { storage: { from } }, __upload: upload, __from: from }
})

import { POST } from "@/app/api/sponsorships/route"

const mockSend   = (jest.requireMock("resend") as { __mockSend: jest.Mock }).__mockSend
const mockUpload = (jest.requireMock("@/lib/supabase-admin") as { __upload: jest.Mock }).__upload
const mockFrom   = (jest.requireMock("@/lib/supabase-admin") as { __from: jest.Mock }).__from

const URL = "http://localhost/api/sponsorships"
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

type Fields = Record<string, string | undefined>

function offer(fields: Fields = {}, opts: { ip?: string; headers?: Record<string, string>; file?: Blob | null; fileName?: string } = {}) {
    const form = new FormData()
    const values: Fields = { email: "jane@acme.dev", affiliation: "Acme Dev Tools", offer: "1,500", spot: "slot-2", ...fields }
    for (const [key, value] of Object.entries(values)) if (value !== undefined) form.set(key, value)
    const file = opts.file === undefined ? new Blob([PNG], { type: "image/png" }) : opts.file
    if (file) form.set("sticker", file, opts.fileName ?? "acme-logo.png")
    return POST(new NextRequest(URL, {
        method: "POST",
        body: form,
        headers: { "x-forwarded-for": opts.ip ?? "1.2.3.4", "sec-fetch-site": "same-origin", ...opts.headers },
    }))
}

const sends = () => mockSend.mock.calls.map((call) => call[0] as Record<string, unknown>)

beforeEach(() => {
    resetRateLimits()
    process.env.RESEND_API_KEY = "re_test_key"
    process.env.SUMMARY_RECIPIENT_EMAIL = "owner@example.com"
    process.env.RESEND_FROM_EMAIL = "JAVA.dev <hello@example.com>"
    process.env.NEXT_PUBLIC_SITE_URL = "https://javastudios.netlify.app"
    delete process.env.SPONSOR_REPLY_TO
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null })
    mockUpload.mockReset()
    mockUpload.mockResolvedValue({ data: { path: "x" }, error: null })
    mockFrom.mockClear()
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("a valid offer", () => {
    it("succeeds, with a short reference and a confirmation flag", async () => {
        const res = await offer()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toMatchObject({ ok: true, confirmationSent: true })
        expect(body.reference).toMatch(/^[0-9A-F]{8}$/)
    })

    it("sends two separate emails: the owner's notice first, then the sponsor's copy", async () => {
        await offer()
        const [owner, sponsor] = sends()
        expect(sends()).toHaveLength(2)
        expect(owner.to).toBe("owner@example.com")
        expect(owner.subject).toBe("Sponsorship inquiry: Acme Dev Tools ($1,500)")
        expect(sponsor.to).toBe("jane@acme.dev")
        expect(sponsor.subject).toMatch(/Thanks for your sponsorship offer/)
        for (const mail of [owner, sponsor]) {
            expect(mail.from).toBe("JAVA.dev <hello@example.com>")
            expect(mail.html).toBeTruthy()
            expect(mail.text).toBeTruthy()
        }
    })

    it("lets the owner reply straight to the sponsor, with the sticker attached", async () => {
        await offer()
        const owner = sends()[0] as { replyTo: string; attachments: { filename: string; content: Buffer }[] }
        expect(owner.replyTo).toBe("jane@acme.dev")
        expect(owner.attachments).toHaveLength(1)
        expect(owner.attachments[0].filename).toBe("acme-logo.png")
        expect([...owner.attachments[0].content]).toEqual([...PNG])
    })

    it("points the sponsor's replies at the public contact address, never the private inbox", async () => {
        await offer()
        const sponsor = sends()[1]
        expect(sponsor.replyTo).toBe("vilanova.jorge50@gmail.com")
        expect(JSON.stringify(sponsor)).not.toContain("owner@example.com")
        expect(sponsor.attachments).toBeUndefined()
    })

    it("honours SPONSOR_REPLY_TO", async () => {
        process.env.SPONSOR_REPLY_TO = "sponsors@javastudios.dev"
        await offer()
        expect(sends()[1].replyTo).toBe("sponsors@javastudios.dev")
    })

    it("keeps a private copy: the file and a JSON record under one random id", async () => {
        await offer()
        expect(mockFrom).toHaveBeenCalledWith("sponsor-stickers")
        const [[filePath, fileBody, fileOpts], [recordPath, recordBody, recordOpts]] = mockUpload.mock.calls
        expect(filePath).toMatch(/^[0-9a-f-]{36}\/sticker\.png$/)
        expect(fileOpts).toEqual({ contentType: "image/png", upsert: false })
        expect([...fileBody]).toEqual([...PNG])
        expect(recordPath).toBe(filePath.replace("sticker.png", "inquiry.json"))
        expect(recordOpts).toEqual({ contentType: "application/json", upsert: false })
        expect(JSON.parse(recordBody)).toMatchObject({ email: "jane@acme.dev", affiliation: "Acme Dev Tools", offer: 1500, spot: "slot-2", fileType: "image/png" })
    })

    it("accepts an offer for a palm-rest spot and names it in both emails", async () => {
        const res = await offer({ spot: "palm-right" })
        expect(res.status).toBe(200)
        expect(JSON.parse(mockUpload.mock.calls[1][1])).toMatchObject({ spot: "palm-right" })
        for (const mail of sends()) expect(mail.html).toContain("Palm rest, right of trackpad")
    })

    it("never stores the visitor's IP with the offer", async () => {
        await offer({}, { ip: "203.0.113.77" })
        expect(JSON.stringify(mockUpload.mock.calls)).not.toContain("203.0.113.77")
        expect(JSON.stringify(sends())).not.toContain("203.0.113.77")
    })

    it("names the attachment after the detected type, whatever extension was claimed", async () => {
        await offer({}, { fileName: "logo.gif" })
        expect((sends()[0] as { attachments: { filename: string }[] }).attachments[0].filename).toBe("logo.png")
    })
})

describe("delivery problems", () => {
    it("reports confirmationSent: false when the sponsor's copy fails (e.g. Resend sandbox sender)", async () => {
        mockSend
            .mockResolvedValueOnce({ data: { id: "owner" }, error: null })
            .mockResolvedValueOnce({ data: null, error: { message: "You can only send testing emails to your own email address" } })
        const res = await offer()
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, confirmationSent: false })
    })

    it("fails with 502 when the owner's notice can't be sent, and skips the sponsor's copy", async () => {
        mockSend.mockResolvedValueOnce({ data: null, error: { message: "quota exceeded: internal detail" } })
        const res = await offer()
        expect(res.status).toBe(502)
        const body = await res.json()
        expect(body.error).toMatch(/couldn't be sent/)
        expect(JSON.stringify(body)).not.toMatch(/quota|internal detail/)
        expect(mockSend).toHaveBeenCalledTimes(1)
    })

    it("treats a thrown provider error like a failed send", async () => {
        mockSend.mockRejectedValueOnce(new Error("fetch failed"))
        expect((await offer()).status).toBe(502)
    })

    it("still delivers when the bucket doesn't exist yet, and says so in the owner's notice", async () => {
        mockUpload.mockResolvedValue({ data: null, error: { message: "Bucket not found", statusCode: "404" } })
        const res = await offer()
        expect(res.status).toBe(200)
        expect(String(sends()[0].text)).toMatch(/could NOT be saved/)
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("sponsor-stickers-schema.sql"))
    })

    it("still delivers when storage throws", async () => {
        mockUpload.mockRejectedValue(new Error("network down"))
        expect((await offer()).status).toBe(200)
    })

    it("fails closed before storing anything when email isn't configured", async () => {
        delete process.env.RESEND_API_KEY
        const res = await offer()
        expect(res.status).toBe(500)
        expect(mockUpload).not.toHaveBeenCalled()
        expect(mockSend).not.toHaveBeenCalled()
    })
})

describe("rejected requests store and send nothing", () => {
    afterEach(() => {
        expect(mockUpload).not.toHaveBeenCalled()
        expect(mockSend).not.toHaveBeenCalled()
    })

    it("blocks cross-site posts", async () => {
        expect((await offer({}, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403)
    })

    it("requires multipart form data", async () => {
        const res = await POST(new NextRequest(URL, {
            method: "POST",
            body: JSON.stringify({ email: "jane@acme.dev" }),
            headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
        }))
        expect(res.status).toBe(415)
    })

    it("refuses an oversized body with 413 before reading it", async () => {
        expect((await offer({}, { headers: { "content-length": String(10 * 1024 * 1024) } })).status).toBe(413)
    })

    it("reports each invalid field", async () => {
        const res = await offer({ email: "nope", affiliation: "", offer: "free", spot: "roof" })
        expect(res.status).toBe(400)
        expect(Object.keys((await res.json()).fields).sort()).toEqual(["affiliation", "email", "offer", "spot"])
    })

    it("requires a sticker file", async () => {
        const res = await offer({}, { file: null })
        expect((await res.json()).fields.sticker).toMatch(/Attach/)
    })

    it.each([
        ["an SVG disguised as PNG", "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"],
        ["HTML disguised as PNG", "<!doctype html><script>alert(1)</script>"],
    ])("rejects %s by its bytes", async (_label, content) => {
        const res = await offer({}, { file: new Blob([content], { type: "image/png" }), fileName: "logo.png" })
        expect(res.status).toBe(400)
        expect((await res.json()).fields.sticker).toMatch(/isn't a real/)
    })

    it("refuses a link in the affiliation (no spam relay to a typed-in address)", async () => {
        const res = await offer({ affiliation: "Cheap pills at evil.com" })
        expect((await res.json()).fields.affiliation).toMatch(/web addresses/)
    })

    it("refuses a header-injection attempt in the email", async () => {
        const res = await offer({ email: "jane@acme.dev\r\nBcc: victim@example.com" })
        expect((await res.json()).fields.email).toBeTruthy()
    })

    it("quietly drops bots that fill the honeypot", async () => {
        const res = await offer({ website: "https://spam.example" })
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true })
    })
})

describe("abuse limits", () => {
    it("caps valid offers at 3 per hour per client", async () => {
        for (let i = 0; i < 3; i++) expect((await offer({ email: `p${i}@acme.dev` })).status).toBe(200)
        const res = await offer({ email: "p4@acme.dev" })
        expect(res.status).toBe(429)
        expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0)
        expect((await offer({ email: "other@acme.dev" }, { ip: "5.6.7.8" })).status).toBe(200)
    })

    it("counts an IPv6 /64 as one client", async () => {
        for (let i = 1; i <= 3; i++) await offer({ email: `v6-${i}@acme.dev` }, { ip: `2001:db8:1:2::${i}` })
        expect((await offer({ email: "v6-4@acme.dev" }, { ip: "2001:db8:1:2::ff" })).status).toBe(429)
    })

    it("sends at most 2 thank-you emails per day to one address (no email-bombing a stranger)", async () => {
        expect((await offer({ email: "victim@example.com" }, { ip: "10.0.0.1" })).status).toBe(200)
        expect((await offer({ email: "Victim@Example.com" }, { ip: "10.0.0.2" })).status).toBe(200)
        expect((await offer({ email: "victim@example.com" }, { ip: "10.0.0.3" })).status).toBe(429)
        expect(sends().filter((mail) => String(mail.to).toLowerCase() === "victim@example.com")).toHaveLength(2)
    })

    it("caps all offers at 20 per day", async () => {
        for (let i = 0; i < 20; i++) {
            expect((await offer({ email: `s${i}@acme.dev` }, { ip: `10.1.0.${i}` })).status).toBe(200)
        }
        expect((await offer({ email: "late@acme.dev" }, { ip: "10.2.0.1" })).status).toBe(429)
    })

    it("caps raw requests before reading bodies, even invalid ones", async () => {
        for (let i = 0; i < 10; i++) await offer({ email: "bad" }, { ip: "9.9.9.9" })
        expect((await offer({}, { ip: "9.9.9.9" })).status).toBe(429)
    })
})
