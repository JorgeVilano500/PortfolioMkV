import "server-only"
import { STICKER_SLOTS, type StickerSlot } from "./laptop-stickers"
import { SPOT_COLUMNS, slotsFromRecords, type SpotRecord } from "./sponsor-spots"
import { isMissingTable, warnSchemaOnce } from "./supabase-errors"

/**
 * Server-side reads of the sponsorship data (supabase/sponsorships-schema.sql).
 * Everything is private, so only the service role reads it.
 */

export const SPOTS_TABLE    = "sponsor_spots"
export const OFFERS_TABLE   = "sponsor_offers"
export const STICKER_BUCKET = "sponsor-stickers"

export type SpotRead = { records: SpotRecord[] | null; setup: boolean }

/**
 * Every sponsor_spots row. `records` is null when the table doesn't exist yet
 * (setup: false) or Supabase is unreachable; callers then fall back to the
 * built-in samples rather than failing the page.
 */
export async function readSpotRecords(): Promise<SpotRead> {
    try {
        // Lazy: a build or test without Supabase env vars still renders /laptop.
        const { supabaseAdmin } = await import("./supabase-admin")
        const { data, error } = await supabaseAdmin.from(SPOTS_TABLE).select(SPOT_COLUMNS)
        if (!error) return { records: (data ?? []) as unknown as SpotRecord[], setup: true }
        if (isMissingTable(error)) {
            warnSchemaOnce("sponsor-spots", "run supabase/sponsorships-schema.sql so Studio can manage /laptop")
            return { records: null, setup: false }
        }
        console.error("[sponsor-spots] read:", error.message)
        return { records: null, setup: true }
    } catch (err) {
        console.error("[sponsor-spots] read:", err instanceof Error ? err.message : err)
        return { records: null, setup: true }
    }
}

/** What /laptop shows: visible sponsors only, and the built-in samples until the table exists. */
export async function getPublicSlots(): Promise<StickerSlot[]> {
    const { records } = await readSpotRecords()
    return records ? slotsFromRecords(records) : [...STICKER_SLOTS]
}
