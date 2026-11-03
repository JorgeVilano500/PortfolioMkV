import { type NextRequest } from "next/server"
import { createHash, randomUUID } from "crypto"
import { Resend } from "resend"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { getClientIp, isSameOriginRequest } from "@/lib/security"
import { rateLimit } from "@/lib/rate-limit"
import { BODY_LIMITS, BodyTooLargeError, readBodyBytes } from "@/lib/http"
import { isMissingBucket, warnSchemaOnce } from "@/lib/supabase-errors"
import {
    STICKER_FILE_TYPES,
    TURNSTILE_FIELD,
    checkStickerFile,
    cleanFileName,
    sniffStickerType,
    validateSponsorFields,
    type SponsorFieldErrors,
} from "@/lib/sponsorship"
import { ownerNotificationEmail, sponsorConfirmationEmail, type SponsorInquiry } from "@/lib/sponsor-email"
import { CONTACT_EMAIL, siteUrl } from "@/lib/site"
import { verifyTurnstile } from "@/lib/turnstile"

const ROUTE = "sponsorships"

/** Private bucket created by supabase/sponsor-stickers-schema.sql. */
const BUCKET = "sponsor-stickers"

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
    if (!fileType) return invalid({ sticker: "That file isn't a real PNG, JPG, WebP, or PDF." })

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

    // 9. A private copy (file + JSON record). Not fatal: the owner's email carries everything.
    const stored = await storeInquiry(inquiry, bytes, ext)

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

async function storeInquiry(inquiry: SponsorInquiry, bytes: Uint8Array, ext: string): Promise<boolean> {
    try {
        const bucket = supabaseAdmin.storage.from(BUCKET)
        const file = await bucket.upload(`${inquiry.id}/sticker.${ext}`, bytes, { contentType: inquiry.fileType, upsert: false })
        const record = file.error ? null : await bucket.upload(
            `${inquiry.id}/inquiry.json`,
            JSON.stringify({ ...inquiry, receivedAt: inquiry.receivedAt.toISOString() }, null, 2),
            { contentType: "application/json", upsert: false },
        )
        const error = file.error ?? record?.error
        if (!error) return true
        if (isMissingBucket(error)) warnSchemaOnce(ROUTE, "run supabase/sponsor-stickers-schema.sql to keep private copies of sponsorship offers")
        else console.error(`[${ROUTE}] storage:`, error.message)
        return false
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
