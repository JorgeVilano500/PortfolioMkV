/**
 * lib/laptop-stickers — sample sponsor data and the 3D model contract for /laptop.
 * The data must stay honest (samples, no payment, no outside links), the slot
 * names must match the GLB contract, and the radio-group keyboard model must
 * follow WAI-ARIA.
 */
import {
    LAPTOP_MODEL,
    LID_SLOTS,
    PALM_SLOTS,
    REQUIRED_MODEL_NODES,
    SPONSOR_CTA_HREF,
    STICKER_COLORS,
    STICKER_SLOTS,
    describeSlot,
    findSlotByNode,
    getSlot,
    missingModelNodes,
    nextSlotId,
    spotAccent,
    spotName,
    withPreview,
} from "@/lib/laptop-stickers"
import { themeMap } from "@/lib/theme"

describe("sticker slots", () => {
    it("has six slots with unique ids and node names: four on the lid, two on the palm rest", () => {
        expect(STICKER_SLOTS).toHaveLength(6)
        expect(new Set(STICKER_SLOTS.map((s) => s.id)).size).toBe(6)
        expect(new Set(STICKER_SLOTS.map((s) => s.node)).size).toBe(6)
        expect(LID_SLOTS.map((s) => s.id)).toEqual(["slot-1", "slot-2", "slot-3", "slot-4"])
        expect(PALM_SLOTS.map((s) => s.id)).toEqual(["palm-left", "palm-right"])
    })

    it("names each sticker mesh to match the GLB (GLTFLoader-safe: no dots, spaces, or slashes)", () => {
        expect(STICKER_SLOTS.map((s) => s.node)).toEqual([
            "Sticker_Slot_1", "Sticker_Slot_2", "Sticker_Slot_3", "Sticker_Slot_4", "Palm_Slot_Left", "Palm_Slot_Right",
        ])
        for (const name of REQUIRED_MODEL_NODES) expect(name).toMatch(/^[A-Za-z0-9_]+$/)
    })

    it("covers the four corners of the lid and both sides of the trackpad", () => {
        expect(LID_SLOTS.map((s) => s.position)).toEqual(["Upper left", "Upper right", "Lower left", "Lower right"])
        expect(PALM_SLOTS.map((s) => s.position)).toEqual(["Left of trackpad", "Right of trackpad"])
    })

    it("draws lid stickers square and palm-rest stickers landscape (5 × 3.5 cm planes)", () => {
        for (const slot of LID_SLOTS) expect(slot.aspect).toBe(1)
        for (const slot of PALM_SLOTS) expect(slot.aspect).toBeCloseTo(5 / 3.5)
    })

    it("uses only the site's accent themes for sponsors, with a sticker colour for each", () => {
        expect(Object.keys(STICKER_COLORS).sort()).toEqual(Object.keys(themeMap).sort())
        for (const slot of STICKER_SLOTS) {
            if (slot.sponsor) expect(Object.keys(themeMap)).toContain(slot.sponsor.theme)
        }
    })

    it("keeps sample data honest: short marks, no URLs, an open spot on each surface", () => {
        const sponsors = STICKER_SLOTS.flatMap((s) => (s.sponsor ? [s.sponsor] : []))
        for (const sponsor of sponsors) {
            expect(sponsor.mark.length).toBeLessThanOrEqual(6)
            expect(JSON.stringify(sponsor)).not.toMatch(/https?:\/\//)
        }
        expect(LID_SLOTS.some((s) => s.sponsor === null)).toBe(true)
        expect(PALM_SLOTS.some((s) => s.sponsor === null)).toBe(true)
    })

    it("flags every built-in sponsor as a sample, with no uploaded image", () => {
        const sponsors = STICKER_SLOTS.flatMap((s) => (s.sponsor ? [s.sponsor] : []))
        expect(sponsors).toHaveLength(4)
        for (const sponsor of sponsors) {
            expect(sponsor.sample).toBe(true)
            expect(sponsor.imageUrl).toBeUndefined()
        }
    })

    it("gives each spot the accent its tile lights up in: the sticker's colour, or violet when open", () => {
        expect(spotAccent(getSlot("slot-2"))).toBe(STICKER_COLORS.green.fill)
        expect(spotAccent(getSlot("slot-3"))).toBe(STICKER_COLORS.pink.fill)
        expect(spotAccent(getSlot("slot-4"))).toBe("#7c6dff")
        expect(spotAccent({ sponsor: null })).toBe("#7c6dff")
    })

    it("offers the contact page to people who'd rather write, not a checkout", () => {
        expect(SPONSOR_CTA_HREF).toBe("/contact")
    })
})

describe("model contract", () => {
    it("loads one GLB from public/models, sized for the 13-inch 2019 MacBook Pro in metres", () => {
        expect(LAPTOP_MODEL.url).toBe("/models/macbook-pro-13-2019.glb")
        expect(LAPTOP_MODEL.dimensions).toEqual({ width: 0.3041, depth: 0.2124, height: 0.0149 })
    })

    it("opens the lid to a working angle, short of flat", () => {
        expect(LAPTOP_MODEL.openAngle).toBeGreaterThan(90)
        expect(LAPTOP_MODEL.openAngle).toBeLessThan(135)
    })

    it("requires the hinge, the lid's outside, the screen, the keyboard, and the six sticker planes", () => {
        expect(REQUIRED_MODEL_NODES).toEqual([
            "Lid", "Lid_Outer", "Screen", "Keyboard",
            "Sticker_Slot_1", "Sticker_Slot_2", "Sticker_Slot_3", "Sticker_Slot_4", "Palm_Slot_Left", "Palm_Slot_Right",
        ])
    })

    it("reports exactly which nodes a model is missing", () => {
        expect(missingModelNodes(REQUIRED_MODEL_NODES)).toEqual([])
        // The first model contract (lid only) now lacks the inside parts.
        expect(missingModelNodes(["Base", "Lid", "Lid_Outer", "Sticker_Slot_1", "Sticker_Slot_2", "Sticker_Slot_3", "Sticker_Slot_4"]))
            .toEqual(["Screen", "Keyboard", "Palm_Slot_Left", "Palm_Slot_Right"])
        // Blender's duplicate suffix (".001" → "001" after GLTFLoader sanitizes it) doesn't count.
        const renamed = REQUIRED_MODEL_NODES.map((name) => (name === "Palm_Slot_Left" ? "Palm_Slot_Left001" : name))
        expect(missingModelNodes(renamed)).toEqual(["Palm_Slot_Left"])
    })

    it("maps a raycast hit's mesh name back to its slot", () => {
        expect(findSlotByNode("Sticker_Slot_3")?.id).toBe("slot-3")
        expect(findSlotByNode("Palm_Slot_Right")?.id).toBe("palm-right")
        expect(findSlotByNode("Lid_Outer")).toBeUndefined()
        expect(findSlotByNode("Sticker_Slot_1_Halo")).toBeUndefined()
    })
})

describe("names and descriptions", () => {
    it("names spots unambiguously across both surfaces", () => {
        expect(spotName(getSlot("slot-1"))).toBe("Lid, upper left")
        expect(spotName(getSlot("palm-right"))).toBe("Palm rest, right of trackpad")
    })

    it("describes sponsored and open spots for screen readers", () => {
        expect(describeSlot(getSlot("slot-1"))).toBe("Lid, upper left: Acme Dev Tools (sample sponsor)")
        expect(describeSlot(getSlot("slot-4"))).toBe("Lid, lower right: open")
        expect(describeSlot(getSlot("palm-left"))).toBe("Palm rest, left of trackpad: Demo Robotics (sample sponsor)")
    })

    it("calls a preview a preview", () => {
        const [slot] = withPreview(STICKER_SLOTS, { spotId: "slot-1", imageUrl: "blob:x", label: "Your logo" })
        expect(describeSlot(slot)).toBe("Lid, upper left: Your logo (preview)")
    })

    it("doesn't call a real sponsor a sample", () => {
        const real = { ...getSlot("slot-1"), sponsor: { name: "Real Co", mark: "RC", tagline: "", description: "", theme: "pink" as const } }
        expect(describeSlot(real)).toBe("Lid, upper left: Real Co")
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
    ] as const)("lid: %s + %s → %s", (current, key, expected) => {
        expect(nextSlotId(current, key)).toBe(expected)
    })

    it("moves within the palm-rest group when given it", () => {
        expect(nextSlotId("palm-left", "ArrowRight", PALM_SLOTS)).toBe("palm-right")
        expect(nextSlotId("palm-right", "ArrowRight", PALM_SLOTS)).toBe("palm-left") // wraps
        expect(nextSlotId("palm-right", "Home", PALM_SLOTS)).toBe("palm-left")
    })

    it("starts from the ends when nothing in the group is selected yet", () => {
        expect(nextSlotId(null, "ArrowRight")).toBe("slot-1")
        expect(nextSlotId(null, "ArrowLeft")).toBe("slot-4")
        expect(nextSlotId("slot-2", "ArrowRight", PALM_SLOTS)).toBe("palm-left") // a lid spot isn't in this group
    })

    it("ignores keys that aren't navigation keys", () => {
        expect(nextSlotId("slot-1", "Enter")).toBeNull()
        expect(nextSlotId("slot-1", "a")).toBeNull()
    })
})

describe("withPreview (a sticker tried on a spot, never saved)", () => {
    it("puts the preview on its spot only, in that spot's colour, and marks it", () => {
        const slots = withPreview(STICKER_SLOTS, { spotId: "slot-2", imageUrl: "blob:local", label: "Bright Labs" })
        expect(slots.filter((slot, i) => slot !== STICKER_SLOTS[i]).map((slot) => slot.id)).toEqual(["slot-2"])
        expect(slots[1].sponsor).toEqual({ name: "Bright Labs", mark: "", tagline: "", description: "", theme: "green", imageUrl: "blob:local", finish: undefined, preview: true })
        expect(slots[1].node).toBe(STICKER_SLOTS[1].node)
    })

    it("uses violet on an open spot, and carries a finished sticker's finish", () => {
        const [, , , open] = withPreview(STICKER_SLOTS, { spotId: "slot-4", imageUrl: "blob:x", label: "Mine", finish: "sticker" })
        expect(open.sponsor).toMatchObject({ theme: "purple", finish: "sticker", preview: true })
        expect(spotAccent(open)).toBe(STICKER_COLORS.purple.fill)
    })

    it("returns the very same spots when there's nothing to preview", () => {
        expect(withPreview(STICKER_SLOTS, null)).toBe(STICKER_SLOTS)
    })
})
