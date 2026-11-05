import { type NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { checkAdminAuth } from "@/lib/admin-auth"
import { BODY_LIMITS, BodyTooLargeError, readBodyBytes, readJsonBody } from "@/lib/http"
import { isJsonObject, isUuid } from "@/lib/validation"
import { isMissingTable } from "@/lib/supabase-errors"
import { STICKER_SLOTS, type StickerSlotId } from "@/lib/laptop-stickers"
import {
    SPOT_COLUMNS,
    STORED_FILE_RE,
    adminFileUrl,
    initials,
    isSlotId,
    validateSponsorInput,
    SPOT_TEXT_LIMITS,
    type SpotRecord,
} from "@/lib/sponsor-spots"
import { OFFERS_TABLE, SPOTS_TABLE, STICKER_BUCKET } from "@/lib/sponsor-spots-server"
import { STICKER_FILE_TYPES, checkStickerFile, checkStickerPixels, imageSize, sniffStickerType } from "@/lib/sponsorship"

const ROUTE = "sponsorships/spots"

// ─── /api/sponsorships/spots (admin): what each spot on /laptop shows ───────
// GET   → { spots: AdminSpot[], setup }
// PATCH { id, visible?, sponsor?: {name, mark, tagline, description, theme} | null,
//         offerId?, removeImage?: true }                → the updated spot
//       sponsor: null clears the spot (open). offerId places that offer's
//       sticker on the spot as a hidden draft, unless `visible` says otherwise.
// POST  multipart { id, sticker }                        → a new image for the spot
// Every write refreshes /laptop.

/** The row a spot has before anyone edits it: its built-in sample, or open. */
function defaultRecord(id: StickerSlotId): SpotRecord {
    const sponsor = STICKER_SLOTS.find((slot) => slot.id === id)?.sponsor ?? null
    return {
        id,
        sponsor_name: sponsor?.name ?? null,
        mark:         sponsor?.mark ?? null,
        tagline:      sponsor?.tagline ?? null,
        description:  sponsor?.description ?? null,
        theme:        sponsor?.theme ?? "purple",
        image_path:   null,
        visible:      true,
        sample:       Boolean(sponsor?.sample),
        offer_id:     null,
        updated_at:   new Date(0).toISOString(),
    }
}

/** A spot as Studio sees it; the image becomes a same-origin URL behind admin auth. */
function toAdminSpot(record: SpotRecord) {
    return {
        id:        record.id,
        sponsor:   record.sponsor_name
            ? { name: record.sponsor_name, mark: record.mark ?? initials(record.sponsor_name), tagline: record.tagline ?? "", description: record.description ?? "", theme: record.theme }
            : null,
        visible:   record.visible,
        sample:    record.sample,
        offerId:   record.offer_id,
        imageUrl:  record.image_path && STORED_FILE_RE.test(record.image_path) ? adminFileUrl(record.image_path) : null,
        updatedAt: record.updated_at,
    }
}
export type AdminSpot = ReturnType<typeof toAdminSpot>

const dbError = (context: string, message: string) => {
    console.error(`[${ROUTE}] ${context}:`, message)
    return Response.json({ error: "Database error" }, { status: 500 })
}

const notSetUp = () =>
    Response.json({ error: "Run supabase/sponsorships-schema.sql in the Supabase SQL editor first." }, { status: 409 })

/** Tell /laptop (and its JSON twin) to rebuild on the next visit, so a Studio change shows up straight away. */
function refreshLaptop() {
    try {
        revalidatePath("/laptop")
        revalidatePath("/api/laptop/spots")
    } catch (err) {
        console.error(`[${ROUTE}] revalidate:`, err instanceof Error ? err.message : err)
    }
}

async function readSpot(id: StickerSlotId): Promise<{ record: SpotRecord } | { missingTable: true } | { error: string }> {
    const { data, error } = await supabaseAdmin.from(SPOTS_TABLE).select(SPOT_COLUMNS).eq("id", id).maybeSingle()
    if (error) return isMissingTable(error) ? { missingTable: true } : { error: error.message }
    return { record: (data as unknown as SpotRecord | null) ?? defaultRecord(id) }
}

async function saveSpot(record: SpotRecord): Promise<{ record: SpotRecord } | { error: string }> {
    const { data, error } = await supabaseAdmin
        .from(SPOTS_TABLE)
        .upsert({ ...record, updated_at: new Date().toISOString() })
        .select(SPOT_COLUMNS)
        .single()
    if (error) return { error: error.message }
    return { record: data as unknown as SpotRecord }
}

/** Remove a spot's previous image once nothing points at it. Never touches offers/ files. */
async function removeOldImage(before: string | null, after: string | null) {
    if (!before || before === after || !before.startsWith("spots/") || !STORED_FILE_RE.test(before)) return
    const { error } = await supabaseAdmin.storage.from(STICKER_BUCKET).remove([before])
    if (error) console.error(`[${ROUTE}] remove old image:`, error.message)
}

export async function GET(req: NextRequest) {
    const denied = await checkAdminAuth(req)
    if (denied) return denied

    const { data, error } = await supabaseAdmin.from(SPOTS_TABLE).select(SPOT_COLUMNS)
    if (error && !isMissingTable(error)) return dbError("GET", error.message)
    const byId = new Map(((data ?? []) as unknown as SpotRecord[]).map((record) => [record.id, record]))
    const spots = STICKER_SLOTS.map((slot) => toAdminSpot(byId.get(slot.id) ?? defaultRecord(slot.id)))
    return Response.json({ spots, setup: !error })
}

export async function PATCH(req: NextRequest) {
    const denied = await checkAdminAuth(req)
    if (denied) return denied
    const parsed = await readJsonBody(req, BODY_LIMITS.admin)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status })
    const body = parsed.body
    if (!isJsonObject(body) || !isSlotId(body.id)) return Response.json({ error: "Missing or invalid spot id" }, { status: 400 })
    const id = body.id
    // Every check that can refuse the request runs before anything is copied or written.
    if ("visible" in body && typeof body.visible !== "boolean") return Response.json({ error: "visible must be a boolean" }, { status: 400 })
    if ("offerId" in body && !isUuid(body.offerId)) return Response.json({ error: "offerId must be an offer's id" }, { status: 400 })
    if ("offerId" in body && body.sponsor === null) return Response.json({ error: "Clear the spot or place a sticker, not both." }, { status: 400 })
    const sponsorInput = "sponsor" in body && body.sponsor !== null ? validateSponsorInput(body.sponsor) : null
    if (sponsorInput && "error" in sponsorInput) return Response.json({ error: sponsorInput.error }, { status: 400 })

    const current = await readSpot(id)
    if ("missingTable" in current) return notSetUp()
    if ("error" in current) return dbError("PATCH read", current.error)
    const before = current.record
    const next: SpotRecord = { ...before }
    let changed = false

    if ("sponsor" in body) {
        changed = true
        if (sponsorInput) {
            const { name, mark, tagline, description, theme } = sponsorInput.sponsor
            Object.assign(next, { sponsor_name: name, mark, tagline, description, theme, sample: false })
        } else {
            Object.assign(next, { sponsor_name: null, mark: null, tagline: null, description: null, image_path: null, offer_id: null, sample: false })
        }
    }

    if ("offerId" in body) {
        changed = true
        const { data: offer, error } = await supabaseAdmin
            .from(OFFERS_TABLE).select("id, affiliation, file_path").eq("id", body.offerId).maybeSingle()
        if (error) return dbError("PATCH offer", error.message)
        const row = offer as { id: string; affiliation: string; file_path: string | null } | null
        if (!row) return Response.json({ error: "That offer no longer exists." }, { status: 404 })
        if (!row.file_path || !STORED_FILE_RE.test(row.file_path)) return Response.json({ error: "This offer has no sticker file to place." }, { status: 400 })

        // A copy, so deleting the offer later doesn't take the sticker off the laptop.
        const target = `spots/${id}/${randomUUID()}.${row.file_path.endsWith(".png") ? "png" : "jpg"}`
        const copied = await supabaseAdmin.storage.from(STICKER_BUCKET).copy(row.file_path, target)
        if (copied.error) return dbError("PATCH copy", copied.error.message)

        Object.assign(next, { image_path: target, offer_id: row.id, sample: false })
        if (!("sponsor" in body) && (next.offer_id !== before.offer_id || !before.sponsor_name || before.sample)) {
            const name = row.affiliation.slice(0, SPOT_TEXT_LIMITS.name)
            Object.assign(next, { sponsor_name: name, mark: initials(name), tagline: "", description: "" })
        }
        // A placed sticker starts hidden: preview it in Studio, then show it.
        if (!("visible" in body)) next.visible = false
        const accepted = await supabaseAdmin.from(OFFERS_TABLE).update({ status: "accepted" }).eq("id", row.id)
        if (accepted.error) console.error(`[${ROUTE}] mark accepted:`, accepted.error.message)
    }

    if (body.removeImage === true) {
        changed = true
        next.image_path = null
    }

    if ("visible" in body) {
        changed = true
        next.visible = body.visible as boolean
    }

    if (!changed) return Response.json({ error: "No updatable fields provided" }, { status: 400 })

    const saved = await saveSpot(next)
    if ("error" in saved) return dbError("PATCH save", saved.error)
    await removeOldImage(before.image_path, saved.record.image_path)
    refreshLaptop()
    return Response.json(toAdminSpot(saved.record))
}

export async function POST(req: NextRequest) {
    const denied = await checkAdminAuth(req)
    if (denied) return denied

    const contentType = req.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
        return Response.json({ error: "Send the image as multipart/form-data" }, { status: 415 })
    }
    let form: FormData
    try {
        const raw = await readBodyBytes(req, BODY_LIMITS.sponsorship)
        form = await new Response(raw, { headers: { "content-type": contentType } }).formData()
    } catch (err) {
        if (err instanceof BodyTooLargeError) return Response.json({ error: "That file is too large. The limit is 4 MB." }, { status: 413 })
        return Response.json({ error: "Could not read the form" }, { status: 400 })
    }

    const id = form.get("id")
    if (!isSlotId(id)) return Response.json({ error: "Missing or invalid spot id" }, { status: 400 })
    const upload = form.get("sticker")
    const file = upload instanceof Blob ? (upload as File) : null
    const fileError = checkStickerFile(file)
    if (fileError) return Response.json({ error: fileError }, { status: 400 })
    const bytes = new Uint8Array(await file!.arrayBuffer())
    const type = sniffStickerType(bytes)
    if (!type) return Response.json({ error: "That file isn't a real PNG or JPG." }, { status: 400 })
    const pixelError = checkStickerPixels(imageSize(bytes, type))
    if (pixelError) return Response.json({ error: pixelError }, { status: 400 })

    const current = await readSpot(id)
    if ("missingTable" in current) return notSetUp()
    if ("error" in current) return dbError("POST read", current.error)
    if (!current.record.sponsor_name) return Response.json({ error: "Give the spot a sponsor name first, then add the image." }, { status: 400 })

    const path = `spots/${id}/${randomUUID()}.${STICKER_FILE_TYPES[type].ext}`
    const stored = await supabaseAdmin.storage.from(STICKER_BUCKET).upload(path, bytes, { contentType: type, upsert: false })
    if (stored.error) return dbError("POST upload", stored.error.message)

    const saved = await saveSpot({ ...current.record, image_path: path, sample: false })
    if ("error" in saved) return dbError("POST save", saved.error)
    await removeOldImage(current.record.image_path, path)
    refreshLaptop()
    return Response.json(toAdminSpot(saved.record))
}
