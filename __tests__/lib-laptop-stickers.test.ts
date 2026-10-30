/**
 * lib/laptop-stickers — sample sponsor data and the 3D model contract for /laptop.
 * The data must stay honest (samples, no payment, no outside links), the slot
 * names must match the GLB contract, and the radio-group keyboard model must
 * follow WAI-ARIA.
 */
import {
    LAPTOP_MODEL,
    REQUIRED_MODEL_NODES,
    SPONSOR_CTA_HREF,
    STICKER_SLOTS,
    describeSlot,
    findSlotByNode,
    getSlot,
    missingModelNodes,
    nextSlotId,
} from "@/lib/laptop-stickers"
import { themeMap } from "@/lib/theme"

describe("sticker slots", () => {
    it("has exactly four slots with unique ids and node names", () => {
        expect(STICKER_SLOTS).toHaveLength(4)
        expect(new Set(STICKER_SLOTS.map((s) => s.id)).size).toBe(4)
        expect(new Set(STICKER_SLOTS.map((s) => s.node)).size).toBe(4)
    })

    it("names each sticker mesh Sticker_Slot_1–4 (GLTFLoader-safe: no dots, spaces, or slashes)", () => {
        expect(STICKER_SLOTS.map((s) => s.node)).toEqual(["Sticker_Slot_1", "Sticker_Slot_2", "Sticker_Slot_3", "Sticker_Slot_4"])
        for (const name of REQUIRED_MODEL_NODES) expect(name).toMatch(/^[A-Za-z0-9_]+$/)
    })

    it("covers the four corners of the lid", () => {
        expect(STICKER_SLOTS.map((s) => s.position)).toEqual(["Upper left", "Upper right", "Lower left", "Lower right"])
    })

    it("uses only the site's accent themes for sponsors", () => {
        for (const slot of STICKER_SLOTS) {
            if (slot.sponsor) expect(Object.keys(themeMap)).toContain(slot.sponsor.theme)
        }
    })

    it("keeps sample data honest: short marks, no URLs, at least one open spot", () => {
        const sponsors = STICKER_SLOTS.flatMap((s) => (s.sponsor ? [s.sponsor] : []))
        for (const sponsor of sponsors) {
            expect(sponsor.mark.length).toBeLessThanOrEqual(6)
            expect(JSON.stringify(sponsor)).not.toMatch(/https?:\/\//)
        }
        expect(STICKER_SLOTS.some((s) => s.sponsor === null)).toBe(true)
    })

    it("sends would-be sponsors to the contact page, not a checkout", () => {
        expect(SPONSOR_CTA_HREF).toBe("/contact")
    })
})

describe("model contract", () => {
    it("loads one GLB from public/models, sized for the 13-inch 2019 MacBook Pro in metres", () => {
        expect(LAPTOP_MODEL.url).toBe("/models/macbook-pro-13-2019.glb")
        expect(LAPTOP_MODEL.dimensions).toEqual({ width: 0.3041, depth: 0.2124, height: 0.0149 })
    })

    it("requires the lid's outside plus the four sticker planes", () => {
        expect(REQUIRED_MODEL_NODES).toEqual(["Lid_Outer", "Sticker_Slot_1", "Sticker_Slot_2", "Sticker_Slot_3", "Sticker_Slot_4"])
    })

    it("reports exactly which nodes a model is missing", () => {
        expect(missingModelNodes(REQUIRED_MODEL_NODES)).toEqual([])
        expect(missingModelNodes(["Base", "Lid_Outer", "Sticker_Slot_1"])).toEqual(["Sticker_Slot_2", "Sticker_Slot_3", "Sticker_Slot_4"])
        // Blender's duplicate suffix (".001" → "001" after GLTFLoader sanitizes it) doesn't count.
        expect(missingModelNodes(["Lid_Outer", "Sticker_Slot_1001", "Sticker_Slot_2", "Sticker_Slot_3", "Sticker_Slot_4"])).toEqual(["Sticker_Slot_1"])
    })

    it("maps a raycast hit's mesh name back to its slot", () => {
        expect(findSlotByNode("Sticker_Slot_3")?.id).toBe("slot-3")
        expect(findSlotByNode("Lid_Outer")).toBeUndefined()
    })
})

describe("descriptions", () => {
    it("describes sponsored and open spots for screen readers", () => {
        expect(describeSlot(getSlot("slot-1"))).toBe("Upper left spot: Acme Dev Tools (sample sponsor)")
        expect(describeSlot(getSlot("slot-4"))).toBe("Lower right spot: open")
    })
})

describe("nextSlotId (radio-group keys)", () => {
    it.each([
        ["slot-1", "ArrowRight", "slot-2"],
        ["slot-1", "ArrowDown",  "slot-2"],
        ["slot-4", "ArrowRight", "slot-1"], // wraps
        ["slot-2", "ArrowLeft",  "slot-1"],
        ["slot-1", "ArrowUp",    "slot-4"], // wraps
        ["slot-3", "Home",       "slot-1"],
        ["slot-2", "End",        "slot-4"],
    ] as const)("%s + %s → %s", (current, key, expected) => {
        expect(nextSlotId(current, key)).toBe(expected)
    })

    it("starts from the ends when nothing is selected yet", () => {
        expect(nextSlotId(null, "ArrowRight")).toBe("slot-1")
        expect(nextSlotId(null, "ArrowLeft")).toBe("slot-4")
    })

    it("ignores keys that aren't navigation keys", () => {
        expect(nextSlotId("slot-1", "Enter")).toBeNull()
        expect(nextSlotId("slot-1", "a")).toBeNull()
    })
})
