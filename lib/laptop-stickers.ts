/**
 * Sponsor-sticker spots on the 3D 2019 MacBook Pro shown at /laptop.
 *
 * Pure data and helpers shared by the page UI and the Three.js viewer, so it
 * stays free of `three` and of server imports: only the viewer chunk loads
 * Three.js. The model contract below must match the GLB in public/ — the
 * full asset spec and Blender workflow are in LAPTOP_MODEL.md.
 *
 * The sponsors are curated SAMPLE data (fictional names), not real sponsors,
 * and nothing here takes payment: an offer starts an email conversation.
 */
import type { PostTheme } from "./theme"

/** The GLB the viewer loads. When it's missing the page shows its 2D fallback. */
export const LAPTOP_MODEL = {
    url:   "/models/macbook-pro-13-2019.glb",
    label: "13-inch MacBook Pro (2019)",
    /** Apple's closed dimensions in metres. The GLB is built at 1 unit = 1 m. */
    dimensions: { width: 0.3041, depth: 0.2124, height: 0.0149 },
    /** Warn in the console above this size: the target is well under 1 MB. */
    softMaxBytes: 2 * 1024 * 1024,
    /** Named parts the viewer drives, besides the sticker planes. */
    nodes: {
        /** Empty on the hinge axis: rotating it around its local X opens the lid. */
        lid:      "Lid",
        /** The lid's outside surface, where the four lid stickers sit. */
        lidOuter: "Lid_Outer",
        /** A 16:10 plane over the display, inside the lid. The site draws what it shows. */
        screen:   "Screen",
        /** A flat plane over the key area. The site draws the keys and their backlight. */
        keyboard: "Keyboard",
    },
    /** How far the lid opens, in degrees from closed: a comfortable working angle. */
    openAngle: 108,
} as const

export type SpotSurface = "lid" | "palm-rest"

export const SURFACE_LABELS: Record<SpotSurface, string> = {
    "lid":       "Lid",
    "palm-rest": "Palm rest",
}

export type StickerSlotId = "slot-1" | "slot-2" | "slot-3" | "slot-4" | "palm-left" | "palm-right"

export type SampleSponsor = {
    name:        string
    /** Short wordmark drawn on the sticker (keep it to a few characters). */
    mark:        string
    tagline:     string
    description: string
    theme:       PostTheme
}

export type StickerSlot = {
    id:       StickerSlotId
    /** Mesh name in the GLB: a sticker-sized plane, UVs filling 0–1. */
    node:     string
    surface:  SpotSurface
    /**
     * Where the spot sits. Lid spots: seen from outside the lid with the hinge
     * at the bottom. Palm-rest spots: seen by the person typing.
     */
    position: string
    /** The plane's width ÷ height, so artwork is drawn without stretching. */
    aspect:   number
    /** null = the spot is open. */
    sponsor:  SampleSponsor | null
}

export const STICKER_SLOTS: readonly StickerSlot[] = [
    {
        id: "slot-1",
        node: "Sticker_Slot_1",
        surface: "lid",
        position: "Upper left",
        aspect: 1,
        sponsor: {
            name: "Acme Dev Tools",
            mark: "ACME",
            tagline: "Tools for shipping on time",
            description: "A sample sponsor showing how a developer-tools brand would look on the lid. Stickers render from data, so swapping a sponsor is a one-line change.",
            theme: "purple",
        },
    },
    {
        id: "slot-2",
        node: "Sticker_Slot_2",
        surface: "lid",
        position: "Upper right",
        aspect: 1,
        sponsor: {
            name: "Example Cloud",
            mark: "EX",
            tagline: "Deploys that just work",
            description: "A sample hosting sponsor. Each spot can carry a name, a short tagline, and a few lines about the sponsor.",
            theme: "green",
        },
    },
    {
        id: "slot-3",
        node: "Sticker_Slot_3",
        surface: "lid",
        position: "Lower left",
        aspect: 1,
        sponsor: {
            name: "Sample Studio",
            mark: "SS",
            tagline: "Design systems, on tap",
            description: "A sample design-studio sponsor, using the site's pink accent so you can compare the three sticker styles.",
            theme: "pink",
        },
    },
    {
        id: "slot-4",
        node: "Sticker_Slot_4",
        surface: "lid",
        position: "Lower right",
        aspect: 1,
        sponsor: null,
    },
    {
        id: "palm-left",
        node: "Palm_Slot_Left",
        surface: "palm-rest",
        position: "Left of trackpad",
        aspect: 5 / 3.5,
        sponsor: {
            name: "Demo Robotics",
            mark: "DR",
            tagline: "Robots that read the manual",
            description: "A sample palm-rest sponsor. The spots beside the trackpad are smaller and landscape, like the badges that ship on new laptops, and they're in view every time the laptop is open.",
            theme: "purple",
        },
    },
    {
        id: "palm-right",
        node: "Palm_Slot_Right",
        surface: "palm-rest",
        position: "Right of trackpad",
        aspect: 5 / 3.5,
        sponsor: null,
    },
]

// Sticker artwork uses the site palette (DESIGN_SYSTEM.md §2), drawn by the 3D
// viewer and the 2D fallback alike.
export const STICKER_COLORS: Record<PostTheme, { fill: string; ink: string }> = {
    purple: { fill: "#7c6dff", ink: "#ffffff" },
    green:  { fill: "#97C459", ink: "#0f1a14" },
    pink:   { fill: "#ED93B1", ink: "#1a1216" },
}

export const LID_SLOTS  = STICKER_SLOTS.filter((slot) => slot.surface === "lid")
export const PALM_SLOTS = STICKER_SLOTS.filter((slot) => slot.surface === "palm-rest")

/** For people who'd rather write than fill in the offer form. */
export const SPONSOR_CTA_HREF = "/contact"

/** Every node the viewer needs: the lid's moving parts, the screen, the keyboard, and the six sticker planes. */
export const REQUIRED_MODEL_NODES: readonly string[] = [
    ...Object.values(LAPTOP_MODEL.nodes),
    ...STICKER_SLOTS.map((slot) => slot.node),
]

export function getSlot(id: StickerSlotId): StickerSlot {
    return STICKER_SLOTS.find((slot) => slot.id === id) ?? STICKER_SLOTS[0]
}

/** The slot whose sticker mesh is called `name`, for mapping raycast hits back to data. */
export function findSlotByNode(name: string): StickerSlot | undefined {
    return STICKER_SLOTS.find((slot) => slot.node === name)
}

/** Contract check for a loaded model: which required node names are absent. */
export function missingModelNodes(names: Iterable<string>): string[] {
    const present = new Set(names)
    return REQUIRED_MODEL_NODES.filter((name) => !present.has(name))
}

/** "Lid, upper left" / "Palm rest, left of trackpad": unambiguous across both surfaces. */
export function spotName(slot: StickerSlot): string {
    return `${SURFACE_LABELS[slot.surface]}, ${slot.position.toLowerCase()}`
}

/** One-line description of a spot, for screen readers and the 3D view's label. */
export function describeSlot(slot: StickerSlot): string {
    return slot.sponsor
        ? `${spotName(slot)}: ${slot.sponsor.name} (sample sponsor)`
        : `${spotName(slot)}: open`
}

/**
 * Radio-group keyboard model (WAI-ARIA): arrows move and wrap, Home/End jump,
 * within one group of spots. Returns the slot to select, or null when the key
 * isn't a navigation key.
 */
export function nextSlotId(current: StickerSlotId | null, key: string, slots: readonly StickerSlot[] = LID_SLOTS): StickerSlotId | null {
    const last  = slots.length - 1
    const index = current ? slots.findIndex((slot) => slot.id === current) : -1
    let next: number
    switch (key) {
        case "ArrowRight":
        case "ArrowDown": next = index < 0 ? 0 : (index + 1) % slots.length; break
        case "ArrowLeft":
        case "ArrowUp":   next = index <= 0 ? last : index - 1; break
        case "Home":      next = 0; break
        case "End":       next = last; break
        default:          return null
    }
    return slots[next].id
}
