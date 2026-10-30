/**
 * Sponsor-sticker spots on the 3D 2019 MacBook Pro shown at /laptop.
 *
 * Pure data and helpers shared by the page UI and the Three.js viewer, so it
 * stays free of `three` and of server imports: only the viewer chunk loads
 * Three.js. The model contract below must match the GLB in public/ — the
 * full asset spec and Blender workflow are in LAPTOP_MODEL.md.
 *
 * The sponsors are curated SAMPLE data (fictional names), not real sponsors,
 * and nothing here takes payment: "Sponsor a spot" links to /contact.
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
    /** The lid's outside surface: a separate mesh so stickers can sit on it. */
    lidOuterNode: "Lid_Outer",
} as const

export type StickerSlotId = "slot-1" | "slot-2" | "slot-3" | "slot-4"

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
    /** Mesh name in the GLB: a square, sticker-sized plane on the lid's outside. */
    node:     string
    /** Where the spot sits, seen from outside the lid with the hinge at the bottom. */
    position: string
    /** null = the spot is open. */
    sponsor:  SampleSponsor | null
}

export const STICKER_SLOTS: readonly StickerSlot[] = [
    {
        id: "slot-1",
        node: "Sticker_Slot_1",
        position: "Upper left",
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
        position: "Upper right",
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
        position: "Lower left",
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
        position: "Lower right",
        sponsor: null,
    },
]

/** Sponsorship is arranged by conversation, not checkout. */
export const SPONSOR_CTA_HREF = "/contact"

/** Every node the viewer needs: the lid's outside plus the four sticker planes. */
export const REQUIRED_MODEL_NODES: readonly string[] = [
    LAPTOP_MODEL.lidOuterNode,
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

/** One-line description of a spot, for screen readers and the 3D view's label. */
export function describeSlot(slot: StickerSlot): string {
    return slot.sponsor
        ? `${slot.position} spot: ${slot.sponsor.name} (sample sponsor)`
        : `${slot.position} spot: open`
}

/**
 * Radio-group keyboard model (WAI-ARIA): arrows move and wrap, Home/End jump.
 * Returns the slot to select, or null when the key isn't a navigation key.
 */
export function nextSlotId(current: StickerSlotId | null, key: string): StickerSlotId | null {
    const last  = STICKER_SLOTS.length - 1
    const index = current ? STICKER_SLOTS.findIndex((slot) => slot.id === current) : -1
    let next: number
    switch (key) {
        case "ArrowRight":
        case "ArrowDown": next = index < 0 ? 0 : (index + 1) % STICKER_SLOTS.length; break
        case "ArrowLeft":
        case "ArrowUp":   next = index <= 0 ? last : index - 1; break
        case "Home":      next = 0; break
        case "End":       next = last; break
        default:          return null
    }
    return STICKER_SLOTS[next].id
}
