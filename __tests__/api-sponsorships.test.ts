/**
 * POST /api/sponsorships — the "Sponsor a spot" offer form.
 * Security: same-origin only; flood, per-client, per-recipient, and global
 * caps (the route emails an address a stranger typed); byte-capped multipart;
 * honeypot; files judged by their bytes; nothing stored or sent for invalid
 * input; provider errors never reach the visitor. Behaviour: two separate
 * emails (owner with Reply-To + attachment, sponsor's copy), a saved copy
 * for Studio (a sponsor_offers row + the file in the private bucket) that's
 * optional, and an honest confirmationSent flag.
 * Also the admin inbox (GET/PATCH/DELETE): auth, whitelist, no DB errors leaked.
 */
import { NextRequest } from "next/server"
import { resetRateLimits } from "@/lib/rate-limit"
import { jsonRequest, makeRequest, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("resend", () => {
    const send = jest.fn()
    return {
        Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
        __mockSend: send,
    }
})

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    const upload = jest.fn()
    const remove = jest.fn()
    const from = jest.fn(() => ({ upload, remove }))
    const db = createChain(state)
    db.storage = { from }
    return { supabaseAdmin: db, __state: state, __upload: upload, __remove: remove, __from: from }
})

import { DELETE, GET, PATCH, POST } from "@/app/api/sponsorships/route"

const admin      = jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState; __upload: jest.Mock; __remove: jest.Mock; __from: jest.Mock }
const mockSend   = (jest.requireMock("resend") as { __mockSend: jest.Mock }).__mockSend
const mockDb     = admin.__state
const mockUpload = admin.__upload
const mockRemove = admin.__remove
const mockFrom   = admin.__from

const URL = "http://localhost/api/sponsorships"

/** The smallest bytes that read as a PNG of the given size (signature + IHDR). */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(33)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    const view = new DataView(bytes.buffer)
    view.setUint32(16, width)
    view.setUint32(20, height)
    return bytes
}
const PNG = png(1200, 1200)

/** The row inserted into sponsor_offers, if any. */
const insertedRow = () => mockDb.calls.find((call) => call.method === "insert")?.args[0] as Record<string, unknown> | undefined

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
    mockRemove.mockReset()
    mockRemove.mockResolvedValue({ data: [], error: null })
    mockFrom.mockClear()
    mockDb.result = { data: null, error: null }
    mockDb.queue = []
    mockDb.calls = []
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
        const owner = sends()[0] as { replyTo: string; attachments: { filename: string; content: string }[] }
        expect(owner.replyTo).toBe("jane@acme.dev")
        expect(owner.attachments).toHaveLength(1)
        expect(owner.attachments[0].filename).toBe("acme-logo.png")
        // Sent as base64 text (a Buffer would be JSON-encoded as a ~3.6x larger number array)
        expect(typeof owner.attachments[0].content).toBe("string")
        expect([...Buffer.from(owner.attachments[0].content, "base64")]).toEqual([...PNG])
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

    it("saves it for Studio: the file in the private bucket and a sponsor_offers row, under one random id", async () => {
        await offer()
        expect(mockFrom).toHaveBeenCalledWith("sponsor-stickers")
        expect(mockUpload).toHaveBeenCalledTimes(1)
        const [[filePath, fileBody, fileOpts]] = mockUpload.mock.calls
        expect(filePath).toMatch(/^offers\/[0-9a-f-]{36}\/sticker\.png$/)
        expect(fileOpts).toEqual({ contentType: "image/png", upsert: false })
        expect([...fileBody]).toEqual([...PNG])
        expect(mockDb.calls).toContainEqual({ method: "from", args: ["sponsor_offers"] })
        expect(insertedRow()).toEqual({
            id:          filePath.split("/")[1],
            email:       "jane@acme.dev",
            affiliation: "Acme Dev Tools",
            offer_usd:   1500,
            spot:        "slot-2",
            file_path:   filePath,
            file_type:   "image/png",
            file_bytes:  PNG.byteLength,
            file_name:   "acme-logo.png",
        })
        expect(String(sends()[0].text)).toMatch(/saved in Studio/)
    })

    it("accepts an offer for a palm-rest spot and names it in both emails", async () => {
        const res = await offer({ spot: "palm-right" })
        expect(res.status).toBe(200)
        expect(insertedRow()).toMatchObject({ spot: "palm-right" })
        for (const mail of sends()) expect(mail.html).toContain("Palm rest, right of trackpad")
    })

    it("never stores the visitor's IP with the offer", async () => {
        await offer({}, { ip: "203.0.113.77" })
        expect(JSON.stringify(mockUpload.mock.calls)).not.toContain("203.0.113.77")
        expect(JSON.stringify(mockDb.calls)).not.toContain("203.0.113.77")
        expect(JSON.stringify(sends())).not.toContain("203.0.113.77")
    })

    it("accepts a JPG", async () => {
        // SOI, then a SOF0 segment: 8-bit, 1200 x 1200, 3 components
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x04, 0xb0, 0x04, 0xb0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
        const res = await offer({}, { file: new Blob([jpeg], { type: "image/jpeg" }), fileName: "logo.jpg" })
        expect(res.status).toBe(200)
        expect(mockUpload.mock.calls[0][0]).toMatch(/\/sticker\.jpg$/)
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
        expect(insertedRow()).toMatchObject({ file_path: null }) // the offer still reaches Studio, without its file
        expect(String(sends()[0].text)).toMatch(/could NOT be saved/)
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("sponsorships-schema.sql"))
    })

    it("still delivers when the offers table doesn't exist yet", async () => {
        mockDb.result = { data: null, error: { message: "relation \"sponsor_offers\" does not exist", code: "42P01" } }
        const res = await offer()
        expect(res.status).toBe(200)
        expect(String(sends()[0].text)).toMatch(/could NOT be saved/)
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
        expect(insertedRow()).toBeUndefined()
        expect(mockSend).not.toHaveBeenCalled()
    })
})

describe("rejected requests store and send nothing", () => {
    afterEach(() => {
        expect(mockUpload).not.toHaveBeenCalled()
        expect(insertedRow()).toBeUndefined()
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

    it.each([
        ["a WebP", new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20])],
        ["a PDF", new TextEncoder().encode("%PDF-1.7\n%\u00e2\u00e3\n")],
    ])("refuses %s, even labelled as a PNG (stickers are PNG or JPG only)", async (_label, bytes) => {
        const res = await offer({}, { file: new Blob([bytes], { type: "image/png" }), fileName: "logo.png" })
        expect(res.status).toBe(400)
        expect((await res.json()).fields.sticker).toMatch(/PNG or JPG/)
    })

    it.each([
        ["too small to print", png(32, 32)],
        ["too large to draw", png(9000, 9000)],
    ])("refuses an image %s", async (_label, bytes) => {
        const res = await offer({}, { file: new Blob([bytes], { type: "image/png" }) })
        expect(res.status).toBe(400)
        expect((await res.json()).fields.sticker).toMatch(/px/)
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

describe("spam check (Cloudflare Turnstile, SECURITY.md S-40)", () => {
    const realFetch = global.fetch
    const siteverify = jest.fn()
    const verdict = (body: unknown, status = 200) => siteverify.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body })

    beforeEach(() => {
        process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA"
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
        siteverify.mockReset()
        global.fetch = siteverify as unknown as typeof fetch
    })

    afterEach(() => {
        delete process.env.TURNSTILE_SECRET_KEY
        delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        global.fetch = realFetch
    })

    it("refuses an offer without a token, before storing or emailing anything", async () => {
        const res = await offer()
        expect(res.status).toBe(400)
        expect(await res.json()).toMatchObject({ captcha: true })
        expect(siteverify).not.toHaveBeenCalled()
        expect(mockSend).not.toHaveBeenCalled()
        expect(mockUpload).not.toHaveBeenCalled()
    })

    it("refuses a token Cloudflare rejects", async () => {
        verdict({ success: false, "error-codes": ["invalid-input-response"] })
        const res = await offer({ "cf-turnstile-response": "forged" })
        expect(res.status).toBe(400)
        expect(mockSend).not.toHaveBeenCalled()
    })

    it("fails closed (503) when Cloudflare can't be reached", async () => {
        siteverify.mockRejectedValueOnce(new Error("timeout"))
        const res = await offer({ "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" })
        expect(res.status).toBe(503)
        expect(mockSend).not.toHaveBeenCalled()
    })

    it("sends the offer once the token checks out", async () => {
        verdict({ success: true, "error-codes": [] })
        const res = await offer({ "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" })
        expect(res.status).toBe(200)
        expect(sends()).toHaveLength(2)
    })

    it("checks fields first, so a typo doesn't spend the single-use token", async () => {
        const res = await offer({ email: "nope", "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" })
        expect(res.status).toBe(400)
        expect(siteverify).not.toHaveBeenCalled()
    })

    it("doesn't count refused bots against the recipient's daily cap", async () => {
        for (let i = 0; i < 3; i++) await offer({ email: "victim@example.com" }, { ip: `5.5.5.${i}` })
        verdict({ success: true })
        expect((await offer({ email: "victim@example.com", "cf-turnstile-response": "ok" }, { ip: "6.6.6.6" })).status).toBe(200)
    })
})

// ─── Studio: the offers inbox ─────────────────────────────────────────────────

describe("admin inbox", () => {
    const KEY = "test-logistics-password"
    const ID  = "3f2b6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f"
    const auth = { "x-logistics-key": KEY }
    const row = (extra: Record<string, unknown> = {}) => ({
        id: ID, email: "jane@acme.dev", affiliation: "Acme Dev Tools", offer_usd: "1500.00", spot: "slot-2",
        file_path: `offers/${ID}/sticker.png`, file_type: "image/png", file_bytes: 1234, file_name: "acme.png",
        status: "new", notes: "", created_at: "2026-11-01T12:00:00Z", ...extra,
    })

    beforeEach(() => {
        process.env.LOGISTICS_PASSWORD = KEY
        delete process.env.ADMIN_2FA
    })

    it.each([["GET", GET], ["PATCH", PATCH], ["DELETE", DELETE]] as const)("%s needs the admin session", async (method, handler) => {
        const res = await handler(makeRequest(URL, { method }))
        expect(res.status).toBe(401)
        expect(mockDb.calls).toHaveLength(0)
    })

    it("lists offers newest first, each with a same-origin file link", async () => {
        mockDb.result = { data: [row()], error: null, count: 1 }
        const res = await GET(makeRequest(URL, { headers: auth }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.setup).toBe(true)
        expect(body.offers).toHaveLength(1)
        expect(body.offers[0]).toMatchObject({ id: ID, offer_usd: 1500, fileUrl: `/api/sponsorships/file?path=${encodeURIComponent(`offers/${ID}/sticker.png`)}` })
        expect(mockDb.calls).toContainEqual({ method: "order", args: ["created_at", { ascending: false }] })
    })

    it("never links a stored path that doesn't look like ours", async () => {
        mockDb.result = { data: [row({ file_path: "../secrets/.env" })], error: null, count: 1 }
        const body = await (await GET(makeRequest(URL, { headers: auth }))).json()
        expect(body.offers[0].fileUrl).toBeNull()
    })

    it("reports setup: false before the schema has run", async () => {
        mockDb.result = { data: null, error: { message: "relation does not exist", code: "42P01" } }
        const body = await (await GET(makeRequest(URL, { headers: auth }))).json()
        expect(body).toEqual({ offers: [], setup: false })
    })

    it("hides database errors", async () => {
        mockDb.result = { data: null, error: { message: "secret internal detail" } }
        const res = await GET(makeRequest(URL, { headers: auth }))
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: "Database error" })
    })

    it("updates only status and notes", async () => {
        mockDb.result = { data: row({ status: "accepted", notes: "Call Friday" }), error: null }
        const res = await PATCH(jsonRequest(URL, "PATCH", { id: ID, status: "accepted", notes: "Call Friday", email: "attacker@evil.dev", offer_usd: 1 }, auth))
        expect(res.status).toBe(200)
        expect(mockDb.calls.find((call) => call.method === "update")?.args[0]).toEqual({ status: "accepted", notes: "Call Friday" })
    })

    it.each([
        ["a bad id", { id: "1; drop table", status: "accepted" }],
        ["an unknown status", { id: ID, status: "paid" }],
        ["over-long notes", { id: ID, notes: "x".repeat(2001) }],
        ["nothing to update", { id: ID }],
    ])("refuses %s", async (_label, body) => {
        const res = await PATCH(jsonRequest(URL, "PATCH", body, auth))
        expect(res.status).toBe(400)
        expect(mockDb.calls.some((call) => call.method === "update")).toBe(false)
    })

    it("deletes an offer and its offers/ file, never a spot's copy", async () => {
        mockDb.result = { data: [{ file_path: `offers/${ID}/sticker.png` }], error: null }
        const res = await DELETE(jsonRequest(URL, "DELETE", { id: ID }, auth))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, deleted: 1 })
        expect(mockRemove).toHaveBeenCalledWith([`offers/${ID}/sticker.png`])
    })

    it("leaves storage alone when the stored path isn't an offers/ file", async () => {
        mockDb.result = { data: [{ file_path: "spots/slot-1/abc.png" }], error: null }
        await DELETE(jsonRequest(URL, "DELETE", { id: ID }, auth))
        expect(mockRemove).not.toHaveBeenCalled()
    })
})
