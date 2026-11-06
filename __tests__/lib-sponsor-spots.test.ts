/**
 * lib/sponsor-spots — the sponsor_spots rows as /laptop and Studio draw them.
 * Security: only the two stored-path shapes this app writes are ever linked;
 * a hidden sponsor never reaches the public slots; Studio's text is bounded.
 * Behaviour: missing rows keep their built-in sample; hidden spots are open.
 */
import { STICKER_SLOTS } from "@/lib/laptop-stickers"
import {
    SPOT_TEXT_LIMITS,
    STORED_FILE_RE,
    adminFileUrl,
    initials,
    isDieCutPath,
    isSlotId,
    publicStickerUrl,
    slotsFromRecords,
    validateSponsorInput,
    type SpotRecord,
} from "@/lib/sponsor-spots"

const record = (extra: Partial<SpotRecord> = {}): SpotRecord => ({
    id: "slot-1", sponsor_name: "Real Co", mark: "RC", tagline: "We exist", description: "Hello", theme: "pink",
    image_path: "spots/slot-1/abc.png", visible: true, sample: false, offer_id: null, updated_at: "2026-11-01T12:00:00.000Z", ...extra,
})

describe("ids and paths", () => {
    it("knows the six spot ids, and nothing else", () => {
        for (const slot of STICKER_SLOTS) expect(isSlotId(slot.id)).toBe(true)
        for (const bad of ["slot-5", "palm-middle", "", "slot-1 ", "__proto__", 1, null]) expect(isSlotId(bad)).toBe(false)
    })

    it.each([
        ["offers/3f2b6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f/sticker.png", true],
        ["spots/palm-left/0b9f6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f.jpg", true],
        ["spots/slot-1/0b9f6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f-cut.png", true], // a finished sticker: still 40 characters
        ["offers/x/sticker.webp", false],
        ["offers/x/sticker.pdf", false],
        ["../offers/x/sticker.png", false],
        ["offers/../x/sticker.png", false],
        ["offers/x/y/sticker.png", false],
        ["offers/X/sticker.png", false],
        ["other/x/sticker.png", false],
        ["offers/x/sticker.png\n", false],
    ])("treats %j as a stored file: %s", (path, expected) => {
        expect(STORED_FILE_RE.test(path)).toBe(expected)
    })

    it("recognises a finished die-cut sticker by its stored name, and nothing else", () => {
        expect(isDieCutPath("spots/slot-1/0b9f6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f-cut.png")).toBe(true)
        expect(isDieCutPath("spots/slot-1/0b9f6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f.png")).toBe(false)
        expect(isDieCutPath("offers/x-cut/sticker-cut.png")).toBe(false) // an offer's file is the sponsor's original
        expect(isDieCutPath("spots/slot-1/abc-cut.jpg")).toBe(false)
        expect(isDieCutPath(null)).toBe(false)
    })

    it("builds same-origin image URLs, versioned so a change busts caches", () => {
        expect(publicStickerUrl(record())).toBe("/laptop/stickers/slot-1?v=2026-11-01T12%3A00%3A00.000Z")
        expect(adminFileUrl("offers/a/sticker.png")).toBe("/api/sponsorships/file?path=offers%2Fa%2Fsticker.png")
    })

    it("makes a short mark from a name", () => {
        expect(initials("Acme Dev Tools")).toBe("ADT")
        expect(initials("Bright")).toBe("BRIG")
        expect(initials("  the   big co.  ")).toBe("TBC")
        expect(initials("A B C D E F G H")).toHaveLength(SPOT_TEXT_LIMITS.mark)
        expect(initials("!!!")).toBe("?")
    })
})

describe("slotsFromRecords", () => {
    it("keeps the built-in sample for spots without a row", () => {
        expect(slotsFromRecords([])).toEqual(STICKER_SLOTS)
    })

    it("draws a row's sponsor, with its image from the public route", () => {
        const [slot] = slotsFromRecords([record()])
        expect(slot.sponsor).toEqual({
            name: "Real Co", mark: "RC", tagline: "We exist", description: "Hello", theme: "pink", sample: false,
            imageUrl: "/laptop/stickers/slot-1?v=2026-11-01T12%3A00%3A00.000Z",
        })
        expect(slot.node).toBe(STICKER_SLOTS[0].node) // the layout always comes from code
    })

    it("shows a hidden sponsor as an open spot, unless Studio asks to include it", () => {
        expect(slotsFromRecords([record({ visible: false })])[0].sponsor).toBeNull()
        expect(slotsFromRecords([record({ visible: false })], { includeHidden: true })[0].sponsor?.name).toBe("Real Co")
    })

    it("treats a row without a name as open (a cleared sample stays cleared)", () => {
        expect(slotsFromRecords([record({ id: "slot-2", sponsor_name: null })])[1].sponsor).toBeNull()
    })

    it("falls back to safe values for a row edited outside Studio", () => {
        const [slot] = slotsFromRecords([record({ mark: null, theme: "red" as never, image_path: null, tagline: null })])
        expect(slot.sponsor).toMatchObject({ mark: "RC", theme: "purple", tagline: "", imageUrl: null })
    })

    it("draws a finished sticker as designed, and a plain upload as a logo", () => {
        expect(slotsFromRecords([record({ image_path: "spots/slot-1/0b9f6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f-cut.png" })])[0].sponsor?.finish).toBe("sticker")
        expect(slotsFromRecords([record()])[0].sponsor).not.toHaveProperty("finish")
    })

    it("uses the image URL builder it's given (Studio's admin route)", () => {
        const [slot] = slotsFromRecords([record()], { imageUrl: (r) => adminFileUrl(r.image_path!) })
        expect(slot.sponsor?.imageUrl).toBe("/api/sponsorships/file?path=spots%2Fslot-1%2Fabc.png")
    })
})

describe("validateSponsorInput", () => {
    const valid = { name: "Real Co", mark: "rc", tagline: "Hi", description: "About us", theme: "green" }

    it("cleans and returns the five text fields", () => {
        expect(validateSponsorInput({ ...valid, name: "  Real \n  Co ", extra: "ignored" })).toEqual({
            sponsor: { name: "Real Co", mark: "RC", tagline: "Hi", description: "About us", theme: "green" },
        })
    })

    it("derives a mark when none is given", () => {
        expect(validateSponsorInput({ ...valid, mark: "" })).toMatchObject({ sponsor: { mark: "RC" } })
    })

    it.each([
        ["not an object", "Real Co"],
        ["an array", [valid]],
        ["no name", { ...valid, name: "   " }],
        ["a long name", { ...valid, name: "x".repeat(SPOT_TEXT_LIMITS.name + 1) }],
        ["a long mark", { ...valid, mark: "ABCDEFG" }],
        ["a long tagline", { ...valid, tagline: "x".repeat(SPOT_TEXT_LIMITS.tagline + 1) }],
        ["a long description", { ...valid, description: "x".repeat(SPOT_TEXT_LIMITS.description + 1) }],
        ["an unknown theme", { ...valid, theme: "red" }],
    ])("refuses %s", (_label, input) => {
        expect(validateSponsorInput(input)).toHaveProperty("error")
    })
})
