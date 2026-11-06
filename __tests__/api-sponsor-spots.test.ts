/**
 * What /laptop shows, and how Studio changes it:
 *   /api/sponsorships/spots   (admin)  GET, PATCH, POST: the six spots
 *   /api/sponsorships/file    (admin)  a stored sticker, for Studio
 *   /laptop/stickers/<spot>   (public) a visible spot's sticker image
 *   /api/laptop/spots         (public) the spots as /laptop draws them
 * Security: admin routes need the admin session; only whitelisted fields are
 * written; stored paths must match the two shapes this app writes; hidden
 * sponsors and unplaced offers are never served publicly; DB errors stay
 * server-side. Behaviour: placing an offer copies its file and starts hidden;
 * every write refreshes /laptop; the built-in samples stand in until the
 * schema has run.
 */
import { NextRequest } from "next/server"
import { resetRateLimits } from "@/lib/rate-limit"
import { STICKER_SLOTS } from "@/lib/laptop-stickers"
import type { SpotRecord } from "@/lib/sponsor-spots"
import { jsonRequest, makeRequest, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    const storage = { upload: jest.fn(), remove: jest.fn(), copy: jest.fn(), download: jest.fn() }
    const bucket = jest.fn(() => storage)
    const db = createChain(state)
    db.storage = { from: bucket }
    return { supabaseAdmin: db, __state: state, __storage: storage, __bucket: bucket }
})

import { GET as getSpots, PATCH as patchSpot, POST as postImage } from "@/app/api/sponsorships/spots/route"
import { GET as getFile } from "@/app/api/sponsorships/file/route"
import { GET as getSticker } from "@/app/laptop/stickers/[spot]/route"
import { GET as getPublicSpots } from "@/app/api/laptop/spots/route"

const admin = jest.requireMock("@/lib/supabase-admin") as {
    __state: SupabaseMockState
    __storage: Record<"upload" | "remove" | "copy" | "download", jest.Mock>
    __bucket: jest.Mock
}
const mockDb = admin.__state
const storage = admin.__storage
const revalidatePath = (jest.requireMock("next/cache") as { revalidatePath: jest.Mock }).revalidatePath

const SPOTS = "http://localhost/api/sponsorships/spots"
const KEY = "test-logistics-password"
const auth = { "x-logistics-key": KEY }
const OFFER_ID = "3f2b6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f"
const OLD_IMAGE = "spots/slot-1/0b9f6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f.png"

const record = (extra: Partial<SpotRecord> = {}): SpotRecord => ({
    id: "slot-1", sponsor_name: "Acme Dev Tools", mark: "ACME", tagline: "Tools", description: "", theme: "purple",
    image_path: null, visible: true, sample: false, offer_id: null, updated_at: "2026-11-01T12:00:00.000Z", ...extra,
})
const ok = (data: unknown) => ({ data, error: null })
const missingTable = { data: null, error: { message: "relation \"sponsor_spots\" does not exist", code: "42P01" } }

/** The row written by upsert, if any. */
const upserted = () => mockDb.calls.find((call) => call.method === "upsert")?.args[0] as SpotRecord | undefined
const updated  = () => mockDb.calls.find((call) => call.method === "update")?.args[0] as Record<string, unknown> | undefined

function png(width: number, height: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(33)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    new DataView(bytes.buffer).setUint32(16, width)
    new DataView(bytes.buffer).setUint32(20, height)
    return bytes
}

function upload(fields: Record<string, string | Blob>, headers: Record<string, string> = auth) {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.set(key, value)
    return postImage(new NextRequest(SPOTS, { method: "POST", body: form, headers }))
}

beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = KEY
    delete process.env.ADMIN_2FA
    resetRateLimits()
    mockDb.result = ok(null)
    mockDb.queue = []
    mockDb.calls = []
    for (const fn of Object.values(storage)) fn.mockReset()
    storage.upload.mockResolvedValue(ok({ path: "x" }))
    storage.remove.mockResolvedValue(ok([]))
    storage.copy.mockResolvedValue(ok({ path: "x" }))
    storage.download.mockResolvedValue(ok(new Blob([png(100, 100)], { type: "image/png" })))
    revalidatePath.mockClear()
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

// ─── Admin: the spots ─────────────────────────────────────────────────────────

describe("admin spots: auth", () => {
    it.each([
        ["GET",   () => getSpots(makeRequest(SPOTS))],
        ["PATCH", () => patchSpot(jsonRequest(SPOTS, "PATCH", { id: "slot-1", visible: false }))],
        ["POST",  () => upload({ id: "slot-1", sticker: new Blob([png(100, 100)]) }, {})],
        ["file",  () => getFile(makeRequest(`http://localhost/api/sponsorships/file?path=${encodeURIComponent(OLD_IMAGE)}`))],
    ])("%s needs the admin session", async (_label, call) => {
        const res = await call()
        expect(res.status).toBe(401)
        expect(mockDb.calls).toHaveLength(0)
        expect(storage.download).not.toHaveBeenCalled()
        expect(storage.upload).not.toHaveBeenCalled()
    })
})

describe("GET /api/sponsorships/spots", () => {
    it("returns all six spots, the built-in samples standing in for rows that don't exist yet", async () => {
        mockDb.result = ok([record({ id: "slot-4", sponsor_name: "Real Co", mark: "RC", image_path: "spots/slot-4/abc.png", visible: false })])
        const res = await getSpots(makeRequest(SPOTS, { headers: auth }))
        expect(res.status).toBe(200)
        const { spots, setup } = await res.json()
        expect(setup).toBe(true)
        expect(spots.map((s: { id: string }) => s.id)).toEqual(STICKER_SLOTS.map((slot) => slot.id))
        expect(spots[0]).toMatchObject({ id: "slot-1", sample: true, visible: true, sponsor: { name: "Acme Dev Tools" } })
        expect(spots[3]).toMatchObject({ id: "slot-4", sample: false, visible: false, sponsor: { name: "Real Co", mark: "RC" }, imageUrl: "/api/sponsorships/file?path=spots%2Fslot-4%2Fabc.png" })
        expect(spots[5]).toMatchObject({ id: "palm-right", sponsor: null })
    })

    it("says setup: false before the schema has run, still listing the samples", async () => {
        mockDb.result = missingTable
        const { spots, setup } = await (await getSpots(makeRequest(SPOTS, { headers: auth }))).json()
        expect(setup).toBe(false)
        expect(spots).toHaveLength(6)
    })

    it("never links a stored path that doesn't look like ours", async () => {
        mockDb.result = ok([record({ image_path: "../../other-bucket/secret.png" })])
        const { spots } = await (await getSpots(makeRequest(SPOTS, { headers: auth }))).json()
        expect(spots[0].imageUrl).toBeNull()
    })

    it("hides database errors", async () => {
        mockDb.result = { data: null, error: { message: "secret internal detail" } }
        const res = await getSpots(makeRequest(SPOTS, { headers: auth }))
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: "Database error" })
    })
})

describe("PATCH /api/sponsorships/spots", () => {
    const patch = (body: unknown) => patchSpot(jsonRequest(SPOTS, "PATCH", body, auth))

    it("hides a spot, keeping its sponsor, and refreshes /laptop", async () => {
        mockDb.queue = [ok(record()), ok(record({ visible: false }))]
        const res = await patch({ id: "slot-1", visible: false })
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ id: "slot-1", visible: false, sponsor: { name: "Acme Dev Tools" } })
        expect(upserted()).toMatchObject({ id: "slot-1", visible: false, sponsor_name: "Acme Dev Tools" })
        expect(revalidatePath).toHaveBeenCalledWith("/laptop")
        expect(revalidatePath).toHaveBeenCalledWith("/api/laptop/spots")
    })

    it("turns a built-in sample into an editable row on its first edit", async () => {
        mockDb.queue = [ok(null), ok(record({ visible: false, sample: true }))]
        await patch({ id: "slot-2", visible: false })
        expect(upserted()).toMatchObject({ id: "slot-2", sponsor_name: "Example Cloud", sample: true, visible: false })
    })

    it("edits the sponsor's text, writing only whitelisted fields", async () => {
        mockDb.queue = [ok(record()), ok(record())]
        const res = await patch({
            id: "slot-1",
            sponsor: { name: "  New   Name ", mark: "nn", tagline: "Hi", description: "About", theme: "green", image_path: "../x" },
            image_path: "offers/evil/x.png", sample: true, offer_id: OFFER_ID,
        })
        expect(res.status).toBe(200)
        const row = upserted()!
        expect(row).toMatchObject({ sponsor_name: "New Name", mark: "NN", tagline: "Hi", description: "About", theme: "green", sample: false, image_path: null, offer_id: null })
        expect(Object.keys(row).sort()).toEqual(["description", "id", "image_path", "mark", "offer_id", "sample", "sponsor_name", "tagline", "theme", "updated_at", "visible"])
    })

    it("clears a spot (open on /laptop) and deletes its old image", async () => {
        mockDb.queue = [ok(record({ image_path: OLD_IMAGE })), ok(record({ sponsor_name: null }))]
        await patch({ id: "slot-1", sponsor: null })
        expect(upserted()).toMatchObject({ sponsor_name: null, mark: null, image_path: null, offer_id: null })
        expect(storage.remove).toHaveBeenCalledWith([OLD_IMAGE])
    })

    it("removes just the image", async () => {
        mockDb.queue = [ok(record({ image_path: OLD_IMAGE })), ok(record())]
        await patch({ id: "slot-1", removeImage: true })
        expect(upserted()).toMatchObject({ sponsor_name: "Acme Dev Tools", image_path: null })
        expect(storage.remove).toHaveBeenCalledWith([OLD_IMAGE])
    })

    it("places an offer's sticker: copies its file, names the spot after it, starts hidden, and accepts the offer", async () => {
        mockDb.queue = [
            ok(record({ id: "slot-4", sponsor_name: null, mark: null })),
            ok({ id: OFFER_ID, affiliation: "Bright Labs", file_path: `offers/${OFFER_ID}/sticker.png` }),
            ok(null), // the offer marked accepted
            ok(record({ id: "slot-4", sponsor_name: "Bright Labs", visible: false })),
        ]
        const res = await patch({ id: "slot-4", offerId: OFFER_ID })
        expect(res.status).toBe(200)
        const [from, to] = storage.copy.mock.calls[0]
        expect(from).toBe(`offers/${OFFER_ID}/sticker.png`)
        expect(to).toMatch(/^spots\/slot-4\/[0-9a-f-]{36}\.png$/)
        expect(upserted()).toMatchObject({ id: "slot-4", sponsor_name: "Bright Labs", mark: "BL", image_path: to, offer_id: OFFER_ID, visible: false, sample: false })
        expect(updated()).toEqual({ status: "accepted" })
        expect(storage.remove).not.toHaveBeenCalled() // the offer's own file stays with the offer
    })

    it("can place a sticker and show it at once", async () => {
        mockDb.queue = [ok(record({ sponsor_name: null })), ok({ id: OFFER_ID, affiliation: "Bright Labs", file_path: `offers/${OFFER_ID}/sticker.jpg` }), ok(null), ok(record())]
        await patch({ id: "slot-1", offerId: OFFER_ID, visible: true })
        expect(upserted()).toMatchObject({ visible: true })
        expect(storage.copy.mock.calls[0][1]).toMatch(/\.jpg$/)
    })

    it("refuses an offer that's gone, or has no stored file", async () => {
        mockDb.queue = [ok(record()), ok(null)]
        expect((await patch({ id: "slot-1", offerId: OFFER_ID })).status).toBe(404)
        mockDb.queue = [ok(record()), ok({ id: OFFER_ID, affiliation: "X", file_path: null })]
        expect((await patch({ id: "slot-1", offerId: OFFER_ID })).status).toBe(400)
        expect(storage.copy).not.toHaveBeenCalled()
        expect(upserted()).toBeUndefined()
    })

    it.each([
        ["an unknown spot", { id: "slot-9", visible: true }],
        ["a non-boolean visible", { id: "slot-1", visible: "yes", offerId: OFFER_ID }],
        ["a bad offer id", { id: "slot-1", offerId: "1 or 1=1" }],
        ["clearing and placing at once", { id: "slot-1", sponsor: null, offerId: OFFER_ID }],
        ["a sponsor without a name", { id: "slot-1", sponsor: { name: " ", theme: "purple" } }],
        ["an unknown colour", { id: "slot-1", sponsor: { name: "A", theme: "red" } }],
        ["an over-long tagline", { id: "slot-1", sponsor: { name: "A", theme: "pink", tagline: "x".repeat(81) } }],
        ["nothing to change", { id: "slot-1" }],
    ])("refuses %s before copying or writing anything", async (_label, body) => {
        mockDb.queue = [ok(record())]
        const res = await patch(body)
        expect(res.status).toBe(400)
        expect(storage.copy).not.toHaveBeenCalled()
        expect(upserted()).toBeUndefined()
        expect(updated()).toBeUndefined()
        expect(revalidatePath).not.toHaveBeenCalled()
    })

    it("asks for the schema (409) when the table doesn't exist yet", async () => {
        mockDb.queue = [missingTable]
        const res = await patch({ id: "slot-1", visible: false })
        expect(res.status).toBe(409)
        expect((await res.json()).error).toMatch(/sponsorships-schema\.sql/)
    })

    it("hides database errors", async () => {
        mockDb.queue = [ok(record()), { data: null, error: { message: "secret internal detail" } }]
        const res = await patch({ id: "slot-1", visible: false })
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: "Database error" })
        expect(revalidatePath).not.toHaveBeenCalled()
    })
})

describe("POST /api/sponsorships/spots (a new image)", () => {
    it("stores the image under spots/, swaps it in, and deletes the old one", async () => {
        mockDb.queue = [ok(record({ image_path: OLD_IMAGE })), ok(record({ image_path: "spots/slot-1/new.png" }))]
        const res = await upload({ id: "slot-1", sticker: new Blob([png(1000, 1000)], { type: "image/png" }) })
        expect(res.status).toBe(200)
        const [path, , opts] = storage.upload.mock.calls[0]
        expect(path).toMatch(/^spots\/slot-1\/[0-9a-f-]{36}\.png$/)
        expect(opts).toEqual({ contentType: "image/png", upsert: false })
        expect(upserted()).toMatchObject({ image_path: path, sample: false })
        expect(storage.remove).toHaveBeenCalledWith([OLD_IMAGE])
        expect(revalidatePath).toHaveBeenCalledWith("/laptop")
        expect(revalidatePath).toHaveBeenCalledWith("/api/laptop/spots")
    })

    it("saves a finished sticker from the editor as -cut.png, which the laptop draws as designed", async () => {
        const cut = "spots/slot-1/0b9f6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f-cut.png"
        mockDb.queue = [ok(record()), ok(record({ image_path: cut }))]
        const res = await upload({ id: "slot-1", sticker: new Blob([png(768, 768)], { type: "image/png" }), finish: "sticker" })
        expect(res.status).toBe(200)
        expect(storage.upload.mock.calls[0][0]).toMatch(/^spots\/slot-1\/[0-9a-f-]{36}-cut\.png$/)
        expect(await res.json()).toMatchObject({ dieCut: true })
    })

    it("keeps a plain upload, or one marked as a logo, as a logo", async () => {
        for (const extra of [{}, { finish: "logo" }] as Record<string, string>[]) {
            storage.upload.mockClear()
            mockDb.queue = [ok(record()), ok(record({ image_path: OLD_IMAGE }))]
            const res = await upload({ id: "slot-1", sticker: new Blob([png(768, 768)], { type: "image/png" }), ...extra })
            expect(res.status).toBe(200)
            expect(storage.upload.mock.calls[0][0]).toMatch(/^spots\/slot-1\/[0-9a-f-]{36}\.png$/)
            expect(await res.json()).toMatchObject({ dieCut: false })
        }
    })

    it("refuses a finished sticker that isn't a PNG, and an unknown finish, before storing anything", async () => {
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x04, 0xb0, 0x04, 0xb0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
        const asJpeg = await upload({ id: "slot-1", sticker: new Blob([jpeg], { type: "image/jpeg" }), finish: "sticker" })
        expect(asJpeg.status).toBe(400)
        expect((await asJpeg.json()).error).toMatch(/must be a PNG/)
        const odd = await upload({ id: "slot-1", sticker: new Blob([png(768, 768)], { type: "image/png" }), finish: "../cut" })
        expect(odd.status).toBe(400)
        expect(storage.upload).not.toHaveBeenCalled()
        expect(mockDb.calls).toHaveLength(0)
    })

    it("needs a sponsor name on the spot first", async () => {
        mockDb.queue = [ok(record({ sponsor_name: null }))]
        const res = await upload({ id: "slot-1", sticker: new Blob([png(1000, 1000)]) })
        expect(res.status).toBe(400)
        expect(storage.upload).not.toHaveBeenCalled()
    })

    it.each([
        ["an SVG", new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")],
        ["a WebP", new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20])],
        ["a tiny image", png(10, 10)],
    ])("refuses %s", async (_label, bytes) => {
        const res = await upload({ id: "slot-1", sticker: new Blob([bytes], { type: "image/png" }) })
        expect(res.status).toBe(400)
        expect(storage.upload).not.toHaveBeenCalled()
    })

    it("refuses an unknown spot, and a non-multipart body", async () => {
        expect((await upload({ id: "roof", sticker: new Blob([png(100, 100)]) })).status).toBe(400)
        const res = await postImage(jsonRequest(SPOTS, "POST", { id: "slot-1" }, auth))
        expect(res.status).toBe(415)
    })
})

// ─── Admin: stored files ──────────────────────────────────────────────────────

describe("GET /api/sponsorships/file", () => {
    const file = (path: string, extra = "") =>
        getFile(makeRequest(`http://localhost/api/sponsorships/file?path=${encodeURIComponent(path)}${extra}`, { headers: auth }))

    it("streams a stored sticker inline, never cached by a CDN", async () => {
        const res = await file(`offers/${OFFER_ID}/sticker.png`)
        expect(res.status).toBe(200)
        expect(res.headers.get("Content-Type")).toBe("image/png")
        expect(res.headers.get("Content-Disposition")).toMatch(/^inline;/)
        expect(res.headers.get("Cache-Control")).toMatch(/^private/)
        expect(admin.__bucket).toHaveBeenCalledWith("sponsor-stickers")
        expect(storage.download).toHaveBeenCalledWith(`offers/${OFFER_ID}/sticker.png`)
    })

    it("offers it as a download with ?download=1", async () => {
        const res = await file("spots/slot-2/abc.jpg", "&download=1")
        expect(res.headers.get("Content-Type")).toBe("image/jpeg")
        expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="slot-2-abc.jpg"')
    })

    it.each([
        "../.env", "offers/../../secrets.png", "other/x/y.png", "offers/x/y.svg", "offers/x/y.png?", "", "offers/X/Y.png",
    ])("refuses the path %j", async (path) => {
        expect((await file(path)).status).toBe(400)
        expect(storage.download).not.toHaveBeenCalled()
    })

    it("404s a missing file without saying why", async () => {
        storage.download.mockResolvedValue({ data: null, error: { message: "Object not found: internal" } })
        const res = await file("spots/slot-1/abc.png")
        expect(res.status).toBe(404)
        expect(JSON.stringify(await res.json())).not.toMatch(/internal/)
    })
})

// ─── Public ───────────────────────────────────────────────────────────────────

describe("GET /laptop/stickers/<spot>", () => {
    const sticker = (spot: string) => getSticker(new Request(`http://localhost/laptop/stickers/${spot}`), { params: Promise.resolve({ spot }) })

    it("serves a visible spot's image from this origin, cacheable for a few minutes", async () => {
        mockDb.result = ok([record({ image_path: "spots/slot-1/abc.png" })])
        const res = await sticker("slot-1")
        expect(res.status).toBe(200)
        expect(res.headers.get("Content-Type")).toBe("image/png")
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300")
        expect(storage.download).toHaveBeenCalledWith("spots/slot-1/abc.png")
    })

    it.each([
        ["a hidden spot", record({ image_path: "spots/slot-1/abc.png", visible: false })],
        ["an open spot", record({ image_path: "spots/slot-1/abc.png", sponsor_name: null })],
        ["a spot without an image", record()],
        ["a path that isn't ours", record({ image_path: "offers/../../x.png" })],
    ])("404s %s, never touching storage", async (_label, row) => {
        mockDb.result = ok([row])
        const res = await sticker("slot-1")
        expect(res.status).toBe(404)
        expect(storage.download).not.toHaveBeenCalled()
    })

    it("404s an unknown spot, and before the schema has run", async () => {
        expect((await sticker("../../etc")).status).toBe(404)
        mockDb.result = missingTable
        expect((await sticker("slot-1")).status).toBe(404)
    })
})

describe("GET /api/laptop/spots", () => {
    it("lists what /laptop shows: hidden sponsors as open spots, image links public", async () => {
        mockDb.result = ok([
            record({ image_path: "spots/slot-1/abc.png" }),
            record({ id: "slot-2", sponsor_name: "Secret Deal", visible: false }),
        ])
        const res = await getPublicSpots()
        const { spots } = await res.json()
        expect(spots).toHaveLength(6)
        expect(spots[0]).toMatchObject({ id: "slot-1", surface: "lid", sponsor: { name: "Acme Dev Tools", imageUrl: "/laptop/stickers/slot-1?v=2026-11-01T12%3A00%3A00.000Z" } })
        expect(spots[1]).toMatchObject({ id: "slot-2", sponsor: null })
        expect(JSON.stringify(spots)).not.toContain("Secret Deal")
        expect(JSON.stringify(spots)).not.toContain("spots/")
    })

    it("falls back to the built-in samples before the schema has run", async () => {
        mockDb.result = missingTable
        const { spots } = await (await getPublicSpots()).json()
        expect(spots.map((s: { sponsor: { name: string } | null }) => s.sponsor?.name ?? null))
            .toEqual(STICKER_SLOTS.map((slot) => slot.sponsor?.name ?? null))
    })

    it("falls back to the samples when Supabase is down, without leaking the error", async () => {
        mockDb.result = { data: null, error: { message: "connection refused: internal" } }
        const res = await getPublicSpots()
        expect(res.status).toBe(200)
        expect(JSON.stringify(await res.json())).not.toMatch(/internal/)
    })
})
