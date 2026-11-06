/**
 * What each sponsor spot on /laptop shows, as stored in the sponsor_spots
 * table (supabase/sponsorships-schema.sql) and edited from Studio.
 * Client-safe: pure types and helpers, shared by the routes, the page, and
 * Studio. Reading and writing happen server-side (lib/sponsor-spots-server.ts).
 *
 * A spot with no sponsor_name is open. A hidden spot (visible = false) keeps
 * its sponsor in Studio, but /laptop shows it as open.
 */
import { STICKER_SLOTS, type Sponsor, type StickerSlot, type StickerSlotId } from "./laptop-stickers"
import type { PostTheme } from "./theme"

/** A sponsor_spots row. */
export type SpotRecord = {
    id:           StickerSlotId
    sponsor_name: string | null
    mark:         string | null
    tagline:      string | null
    description:  string | null
    theme:        PostTheme
    /** In the private sponsor-stickers bucket: spots/<spot>/<uuid>.<ext>. */
    image_path:   string | null
    visible:      boolean
    sample:       boolean
    offer_id:     string | null
    updated_at:   string
}

export const SPOT_COLUMNS = "id, sponsor_name, mark, tagline, description, theme, image_path, visible, sample, offer_id, updated_at"

export const SPOT_TEXT_LIMITS = {
    name:        60,
    mark:        6,
    tagline:     80,
    description: 400,
} as const

const THEMES: readonly PostTheme[] = ["purple", "green", "pink"]
const SLOT_IDS = new Set<string>(STICKER_SLOTS.map((slot) => slot.id))

export function isSlotId(value: unknown): value is StickerSlotId {
    return typeof value === "string" && SLOT_IDS.has(value)
}

/** Up to three initials for the drawn sticker, e.g. "Acme Dev Tools" → "ADT". */
export function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w))
    const letters = words.length === 1 ? words[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 4) : words.map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0] ?? "").join("")
    return letters.slice(0, SPOT_TEXT_LIMITS.mark).toUpperCase() || "?"
}

/** The public URL /laptop loads a spot's sticker image from (app/laptop/stickers/[spot]). */
export function publicStickerUrl(record: Pick<SpotRecord, "id" | "updated_at">): string {
    // The version busts browser and CDN caches whenever the spot changes.
    return `/laptop/stickers/${record.id}?v=${encodeURIComponent(record.updated_at)}`
}

/** Studio's URL for any stored file (admin only: app/api/sponsorships/file). */
export function adminFileUrl(path: string): string {
    return `/api/sponsorships/file?path=${encodeURIComponent(path)}`
}

/** A stored file path the file routes will serve: offers/<id>/sticker.png or spots/<spot>/<id>.jpg. */
export const STORED_FILE_RE = /^(offers|spots)\/[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}\.(png|jpg)$/

/**
 * A finished die-cut sticker from Studio's editor is stored as
 * spots/<spot>/<uuid>-cut.png. The name is the only record of that (no extra
 * column), and it tells the laptop to draw the image as designed.
 */
export const DIE_CUT_SUFFIX = "-cut"

export function isDieCutPath(path: string | null | undefined): boolean {
    return Boolean(path && path.startsWith("spots/") && path.endsWith(`${DIE_CUT_SUFFIX}.png`))
}

/** The sponsor a record describes, or null for an open spot. */
export function recordSponsor(record: SpotRecord, imageUrl: (record: SpotRecord) => string | null): Sponsor | null {
    if (!record.sponsor_name) return null
    return {
        name:        record.sponsor_name,
        mark:        record.mark || initials(record.sponsor_name),
        tagline:     record.tagline ?? "",
        description: record.description ?? "",
        theme:       THEMES.includes(record.theme) ? record.theme : "purple",
        sample:      record.sample,
        imageUrl:    record.image_path ? imageUrl(record) : null,
        ...(isDieCutPath(record.image_path) && { finish: "sticker" as const }),
    }
}

/**
 * The six spots as a page draws them: the layout from STICKER_SLOTS, the
 * sponsor from `records`. A spot without a row keeps its built-in sample.
 * Hidden sponsors become open spots unless `includeHidden` (Studio's preview).
 */
export function slotsFromRecords(
    records: readonly SpotRecord[],
    { includeHidden = false, imageUrl = publicStickerUrl }: { includeHidden?: boolean; imageUrl?: (record: SpotRecord) => string | null } = {},
): StickerSlot[] {
    const byId = new Map(records.map((record) => [record.id, record]))
    return STICKER_SLOTS.map((slot) => {
        const record = byId.get(slot.id)
        if (!record) return slot
        const sponsor = record.visible || includeHidden ? recordSponsor(record, imageUrl) : null
        return { ...slot, sponsor }
    })
}

/** Sponsor text fields, validated for a Studio edit. */
export type SponsorInput = { name: string; mark: string; tagline: string; description: string; theme: PostTheme }

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "")

export function validateSponsorInput(input: unknown): { sponsor: SponsorInput } | { error: string } {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return { error: "sponsor must be an object, or null to clear the spot" }
    const raw = input as Record<string, unknown>
    const name        = clean(raw.name)
    const mark        = clean(raw.mark).toUpperCase()
    const tagline     = clean(raw.tagline)
    const description = typeof raw.description === "string" ? raw.description.trim() : ""
    const theme       = raw.theme

    if (!name) return { error: "Give the sponsor a name." }
    if (name.length > SPOT_TEXT_LIMITS.name) return { error: `Keep the name under ${SPOT_TEXT_LIMITS.name} characters.` }
    if (mark.length > SPOT_TEXT_LIMITS.mark) return { error: `Keep the mark to ${SPOT_TEXT_LIMITS.mark} characters.` }
    if (tagline.length > SPOT_TEXT_LIMITS.tagline) return { error: `Keep the tagline under ${SPOT_TEXT_LIMITS.tagline} characters.` }
    if (description.length > SPOT_TEXT_LIMITS.description) return { error: `Keep the description under ${SPOT_TEXT_LIMITS.description} characters.` }
    if (!THEMES.includes(theme as PostTheme)) return { error: "theme must be purple, green, or pink" }
    return { sponsor: { name, mark: mark || initials(name), tagline, description, theme: theme as PostTheme } }
}
