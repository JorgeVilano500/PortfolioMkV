import { type NextRequest } from "next/server"
import { createHash, randomUUID } from "crypto"
import { Resend } from "resend"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { getClientIp, isSameOriginRequest } from "@/lib/security"
import { rateLimit } from "@/lib/rate-limit"
import { BODY_LIMITS, BodyTooLargeError, readBodyBytes, readJsonBody } from "@/lib/http"
import { isMissingBucket, isMissingTable, warnSchemaOnce } from "@/lib/supabase-errors"
import { checkAdminAuth } from "@/lib/admin-auth"
import { isJsonObject, isUuid } from "@/lib/validation"
import { fetchAllRows } from "@/lib/fetch-all-rows"
import { OFFERS_TABLE, STICKER_BUCKET } from "@/lib/sponsor-spots-server"
import { STORED_FILE_RE, adminFileUrl } from "@/lib/sponsor-spots"
import {
    STICKER_FILE_TYPES,
    TURNSTILE_FIELD,
    checkStickerFile,
    checkStickerPixels,
    cleanFileName,
    imageSize,
    sniffStickerType,
    validateSponsorFields,
    type SponsorFieldErrors,
} from "@/lib/sponsorship"
import { ownerNotificationEmail, sponsorConfirmationEmail, type SponsorInquiry } from "@/lib/sponsor-email"
import { CONTACT_EMAIL, siteUrl } from "@/lib/site"
import { verifyTurnstile } from "@/lib/turnstile"

const ROUTE = "sponsorships"

// The public address already shown on /contact. Replies to the sponsor's
// copy go here (override with SPONSOR_REPLY_TO), never to the private
// SUMMARY_RECIPIENT_EMAIL inbox.
const PUBLIC_REPLY_TO = CONTACT_EMAIL

// This route emails an address a stranger typed in, so it's capped hard.
// In-memory and per instance (SECURITY.md §4.3): best-effort, but it bounds
// both inbox flooding and Resend quota burn.
const REQUEST_LIMIT       = 10                   // any request, checked before reading up to 4 MB
const REQUEST_WINDOW_MS   = 10 * 60_000
const SEND_LIMIT          = 3                    // valid offers per client per hour
const SEND_WINDOW_MS      = 60 * 60_000
const RECIPIENT_LIMIT     = 2                    // thank-you emails to one address per day
const RECIPIENT_WINDOW_MS = 24 * 60 * 60_000
const GLOBAL_LIMIT        = 20                   // offers per day, all visitors
const GLOBAL_WINDOW_MS    = 24 * 60 * 60_000

type EmailMessage = Parameters<Resend["emails"]["send"]>[0]

const tooMany = (retryAfterSeconds: number) =>
    Response.json(
        { error: "Too many offers from here. Please try again later, or email me directly." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    )

const invalid = (fields: SponsorFieldErrors) =>
    Response.json({ error: "Please fix the highlighted fields.", fields }, { status: 400 })

// ─── POST /api/sponsorships (multipart: email, affiliation, offer, spot, sticker) ─
// Sends two separate emails: an inquiry notice to SUMMARY_RECIPIENT_EMAIL
// (Reply-To: the sponsor, sticker attached) and a thank-you copy to the
// sponsor. Nothing is charged: an offer starts an email conversation.

export async function POST(req: NextRequest) {
    // 1. A browser form on our own pages: refuse cross-site posts
    if (!isSameOriginRequest(req)) {
        return Response.json({ error: "Cross-site request blocked" }, { status: 403 })
    }

    // 2. Cheap flood guard before reading a multi-megabyte body
    const ip = getClientIp(req)
    const flood = rateLimit(`${ROUTE}-requests`, ip, REQUEST_LIMIT, REQUEST_WINDOW_MS)
    if (!flood.ok) return tooMany(flood.retryAfterSeconds)

    // 3. Multipart body, byte-capped while streaming, then parsed
    const contentType = req.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
        return Response.json({ error: "Send the form as multipart/form-data" }, { status: 415 })
    }
    let form: FormData
    try {
        const body = await readBodyBytes(req, BODY_LIMITS.sponsorship)
        form = await new Response(body, { headers: { "content-type": contentType } }).formData()
    } catch (err) {
        if (err instanceof BodyTooLargeError) {
            return Response.json({ error: "That file is too large. The limit is 4 MB." }, { status: 413 })
        }
        return Response.json({ error: "Could not read the form" }, { status: 400 })
    }

    // 4. Honeypot: people never see the "website" field; bots fill it. Look
    // successful so they don't adapt, but store and send nothing.
    if (form.get("website")) return Response.json({ ok: true, confirmationSent: false })

    // 5. Validate every field, then the file by its actual bytes
    const result = validateSponsorFields({
        email:       form.get("email"),
        affiliation: form.get("affiliation"),
        offer:       form.get("offer"),
        spot:        form.get("spot"),
    })
    const upload = form.get("sticker")
    const sticker = upload instanceof Blob ? (upload as File) : null
    const fileError = checkStickerFile(sticker)
    if ("errors" in result || fileError) {
        return invalid({ ...("errors" in result ? result.errors : {}), ...(fileError ? { sticker: fileError } : {}) })
    }
    const bytes = new Uint8Array(await sticker!.arrayBuffer())
    const fileType = sniffStickerType(bytes)
    if (!fileType) return invalid({ sticker: "That file isn't a real PNG or JPG." })
    // The image is drawn on /laptop once published: refuse sizes that would stall a browser.
    const pixelError = checkStickerPixels(imageSize(bytes, fileType))
    if (pixelError) return invalid({ sticker: pixelError })

    // 6. Human check (Cloudflare Turnstile, SECURITY.md S-40), when configured.
    // After validation, so fixing a typo doesn't spend the single-use token;
    // before any cap, storage or email, so a bot can't burn the recipient caps.
    const human = await verifyTurnstile(form.get(TURNSTILE_FIELD), ip)
    if (human === "unavailable") {
        return Response.json({ error: "The spam check couldn't run just now. Please try again in a minute." }, { status: 503 })
    }
    if (human !== "ok") {
        return Response.json({ error: "Please complete the spam check, then send again.", captcha: true }, { status: 400 })
    }

    // 7. Configuration: fail closed before storing anything
    const resendKey = process.env.RESEND_API_KEY
    const owner     = process.env.SUMMARY_RECIPIENT_EMAIL
    if (!resendKey || !owner) {
        console.error(`[${ROUTE}] RESEND_API_KEY or SUMMARY_RECIPIENT_EMAIL is not set`)
        return Response.json({ error: "The sponsorship form isn't set up yet. Please email me instead." }, { status: 500 })
    }

    // 8. Send caps, counted only for valid offers
    const { fields } = result
    const recipientKey = createHash("sha256").update(fields.email.toLowerCase()).digest("base64url")
    for (const [name, key, limit, windowMs] of [
        [`${ROUTE}-sends`,     ip,           SEND_LIMIT,      SEND_WINDOW_MS],
        [`${ROUTE}-recipient`, recipientKey, RECIPIENT_LIMIT, RECIPIENT_WINDOW_MS],
        [`${ROUTE}-global`,    "all",        GLOBAL_LIMIT,    GLOBAL_WINDOW_MS],
    ] as const) {
        const rl = rateLimit(name, key, limit, windowMs)
        if (!rl.ok) return tooMany(rl.retryAfterSeconds)
    }

    const inquiry: SponsorInquiry = {
        ...fields,
        id:         randomUUID(),
        fileName:   cleanFileName(sticker!.name),
        fileType,
        fileBytes:  bytes.byteLength,
        receivedAt: new Date(),
    }
    const ext = STICKER_FILE_TYPES[fileType].ext

    // 9. Saved for Studio: a sponsor_offers row, and the file in the private
    // bucket. Not fatal: the owner's email carries everything.
    const stored = await storeOffer(inquiry, bytes, ext)

    const site    = siteUrl()
    const from    = process.env.RESEND_FROM_EMAIL || "JAVA.dev <onboarding@resend.dev>"
    const resend  = new Resend(resendKey)

    // 10. Email 1 of 2: the inquiry, to the owner. Reply-To is the sponsor, so
    // hitting Reply continues the negotiation with them directly.
    const attachmentName = `${inquiry.fileName.replace(/\.[^.]*$/, "") || "sticker"}.${ext}`
    const ownerSent = await sendEmail(resend, "owner", {
        from,
        to: owner,
        replyTo: inquiry.email,
        ...ownerNotificationEmail(inquiry, site, { stored }),
        // Base64, not a Buffer: the SDK JSON-encodes a Buffer as an array of
        // numbers (~3.6 bytes per byte), so a 4 MB sticker became a ~14 MB request.
        attachments: [{ filename: attachmentName, content: Buffer.from(bytes).toString("base64") }],
    } as EmailMessage)
    if (!ownerSent) {
        return Response.json({ error: "Your offer couldn't be sent right now. Please try again in a few minutes, or email me." }, { status: 502 })
    }

    // 11. Email 2 of 2: the sponsor's thank-you copy, sent separately. With
    // Resend's sandbox sender this can only reach the account owner, so it
    // fails until a sending domain is verified (SECURITY.md S-2). The page
    // says so instead of promising a copy that never arrives.
    const confirmationSent = await sendEmail(resend, "confirmation", {
        from,
        to: inquiry.email,
        replyTo: process.env.SPONSOR_REPLY_TO?.trim() || PUBLIC_REPLY_TO,
        ...sponsorConfirmationEmail(inquiry, site),
    } as EmailMessage)

    return Response.json({ ok: true, reference: inquiry.id.slice(0, 8).toUpperCase(), confirmationSent })
}

/** Saves the offer for Studio. True only when both the row and the file were saved. */
async function storeOffer(inquiry: SponsorInquiry, bytes: Uint8Array, ext: string): Promise<boolean> {
    try {
        let filePath: string | null = `offers/${inquiry.id}/sticker.${ext}`
        const file = await supabaseAdmin.storage.from(STICKER_BUCKET).upload(filePath, bytes, { contentType: inquiry.fileType, upsert: false })
        if (file.error) {
            if (isMissingBucket(file.error)) warnSchemaOnce(`${ROUTE}/bucket`, "run supabase/sponsorships-schema.sql to keep sticker files")
            else console.error(`[${ROUTE}] storage:`, file.error.message)
            filePath = null
        }
        const { error } = await supabaseAdmin.from(OFFERS_TABLE).insert({
            id:          inquiry.id,
            email:       inquiry.email,
            affiliation: inquiry.affiliation,
            offer_usd:   inquiry.offer,
            spot:        inquiry.spot,
            file_path:   filePath,
            file_type:   inquiry.fileType,
            file_bytes:  inquiry.fileBytes,
            file_name:   inquiry.fileName,
        })
        if (error) {
            if (isMissingTable(error)) warnSchemaOnce(`${ROUTE}/offers`, "run supabase/sponsorships-schema.sql so offers appear in Studio")
            else console.error(`[${ROUTE}] offers:`, error.message)
            return false
        }
        return filePath !== null
    } catch (err) {
        console.error(`[${ROUTE}] storage:`, err instanceof Error ? err.message : err)
        return false
    }
}

async function sendEmail(resend: Resend, label: string, message: EmailMessage): Promise<boolean> {
    try {
        const { error } = await resend.emails.send(message)
        if (!error) return true
        console.error(`[${ROUTE}] ${label} email:`, error.message)
        return false
    } catch (err) {
        console.error(`[${ROUTE}] ${label} email:`, err instanceof Error ? err.message : err)
        return false
    }
}

// ─── Studio (admin): the offers inbox ─────────────────────────────────────────
// GET    → { offers: AdminOffer[], setup }   newest first; setup: false until the schema has run
// PATCH  { id, status?, notes? }            → the updated offer
// DELETE { id }                             → removes the offer and its file

const OFFER_COLUMNS = "id, email, affiliation, offer_usd, spot, file_path, file_type, file_bytes, file_name, status, notes, created_at"
const OFFER_STATUSES = ["new", "accepted", "declined"] as const
const MAX_NOTES = 2000
const MAX_OFFERS = 5000

type OfferRow = {
    id: string; email: string; affiliation: string; offer_usd: number | string; spot: string
    file_path: string | null; file_type: string | null; file_bytes: number | null; file_name: string | null
    status: (typeof OFFER_STATUSES)[number]; notes: string; created_at: string
}

/** An offer as Studio sees it: the stored file becomes a same-origin URL behind admin auth. */
const toAdminOffer = (row: OfferRow) => ({
    ...row,
    offer_usd: Number(row.offer_usd),
    fileUrl:   row.file_path && STORED_FILE_RE.test(row.file_path) ? adminFileUrl(row.file_path) : null,
})
export type AdminOffer = ReturnType<typeof toAdminOffer>

const dbError = (context: string, message: string) => {
    console.error(`[${ROUTE}] ${context}:`, message)
    return Response.json({ error: "Database error" }, { status: 500 })
}

export async function GET(req: NextRequest) {
    const denied = await checkAdminAuth(req)
    if (denied) return denied

    const { rows, error } = await fetchAllRows<OfferRow>((from, to) => supabaseAdmin
        .from(OFFERS_TABLE)
        .select(OFFER_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: OfferRow[] | null; error: { message: string; code?: string } | null; count?: number | null }>, MAX_OFFERS)
    if (error) {
        if (isMissingTable(error)) return Response.json({ offers: [], setup: false })
        return dbError("GET", error.message)
    }
    return Response.json({ offers: rows.map(toAdminOffer), setup: true })
}

export async function PATCH(req: NextRequest) {
    const denied = await checkAdminAuth(req)
    if (denied) return denied
    const parsed = await readJsonBody(req, BODY_LIMITS.admin)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status })
    const body = parsed.body
    if (!isJsonObject(body) || !isUuid(body.id)) return Response.json({ error: "Missing or invalid id" }, { status: 400 })

    // Whitelist: only these two fields are ever written.
    const fields: Partial<Pick<OfferRow, "status" | "notes">> = {}
    if ("status" in body) {
        if (!OFFER_STATUSES.includes(body.status as OfferRow["status"])) return Response.json({ error: "status must be new, accepted, or declined" }, { status: 400 })
        fields.status = body.status as OfferRow["status"]
    }
    if ("notes" in body) {
        if (typeof body.notes !== "string" || body.notes.length > MAX_NOTES) return Response.json({ error: `notes must be a string (max ${MAX_NOTES} chars)` }, { status: 400 })
        fields.notes = body.notes
    }
    if (Object.keys(fields).length === 0) return Response.json({ error: "No updatable fields provided" }, { status: 400 })

    const { data, error } = await supabaseAdmin.from(OFFERS_TABLE).update(fields).eq("id", body.id).select(OFFER_COLUMNS).single()
    if (error) return dbError("PATCH", error.message)
    return Response.json(toAdminOffer(data as unknown as OfferRow))
}

export async function DELETE(req: NextRequest) {
    const denied = await checkAdminAuth(req)
    if (denied) return denied
    const parsed = await readJsonBody(req, BODY_LIMITS.admin)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status })
    const body = parsed.body
    if (!isJsonObject(body) || !isUuid(body.id)) return Response.json({ error: "Missing or invalid id" }, { status: 400 })

    const { data, error } = await supabaseAdmin.from(OFFERS_TABLE).delete().eq("id", body.id).select("file_path")
    if (error) return dbError("DELETE", error.message)
    // A spot showing this sticker keeps its own copy (spots/…), so only the offer's file goes.
    const paths = ((data ?? []) as { file_path: string | null }[])
        .map((row) => row.file_path)
        .filter((p): p is string => typeof p === "string" && p.startsWith("offers/") && STORED_FILE_RE.test(p))
    if (paths.length > 0) {
        const removed = await supabaseAdmin.storage.from(STICKER_BUCKET).remove(paths)
        if (removed.error) console.error(`[${ROUTE}] DELETE file:`, removed.error.message)
    }
    return Response.json({ success: true, deleted: (data ?? []).length })
}
