/**
 * "Sponsor a spot" offers on /laptop: field rules shared by the browser form
 * (instant feedback) and POST /api/sponsorships (the real check). Pure and
 * client-safe — no server imports.
 *
 * An offer is the start of an email conversation, not a purchase: nothing is
 * charged, and the amount is negotiable.
 */
import { STICKER_SLOTS, spotName, type StickerSlotId } from "./laptop-stickers"

export const SPONSOR_LIMITS = {
    email:       254,
    affiliation: 120,
    fileName:    120,
    /** Fits Netlify's 6 MB request cap once the body is base64-encoded (see BODY_LIMITS.sponsorship). */
    fileBytes:   4 * 1024 * 1024,
    offerMin:    1,
    offerMax:    1_000_000,
} as const

/** Print-ready formats. No SVG: it can carry script, and it would be opened by the owner. */
export const STICKER_FILE_TYPES = {
    "image/png":       { ext: "png",  label: "PNG" },
    "image/jpeg":      { ext: "jpg",  label: "JPG" },
    "image/webp":      { ext: "webp", label: "WebP" },
    "application/pdf": { ext: "pdf",  label: "PDF" },
} as const

export type StickerMime = keyof typeof STICKER_FILE_TYPES

/** For `<input type="file" accept>`. A hint only — the server checks the bytes. */
export const STICKER_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"

export type SponsorSpot = StickerSlotId | "any"

// Full names ("Palm rest, left of trackpad"): the label also goes into both emails.
export const SPOT_CHOICES: readonly { value: SponsorSpot; label: string }[] = [
    ...STICKER_SLOTS.map((slot) => ({ value: slot.id, label: spotName(slot) })),
    { value: "any", label: "Any spot" },
]

export type SponsorFields = {
    email:       string
    affiliation: string
    offer:       number
    spot:        SponsorSpot
}

export type SponsorFieldErrors = Partial<Record<keyof SponsorFields | "sticker", string>>

// Deliberately strict: no quotes, spaces, or "?"/"&" (no mailto: header tricks),
// and a dotted domain. It rejects some exotic-but-valid addresses; that's fine here.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/
// The affiliation is echoed into an email sent to whatever address was typed,
// and mail clients auto-link anything domain-shaped ("Node.js" included).
// Refusing web addresses keeps the form from becoming a link-spam relay.
const WEB_ADDRESS_RE = /https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i

export function isValidEmail(value: unknown): value is string {
    return typeof value === "string" && value.length <= SPONSOR_LIMITS.email && EMAIL_RE.test(value)
}

/** C0/C1 controls and the U+2028/2029 line separators, as spaces. */
function stripControls(value: string): string {
    let out = ""
    for (const ch of value) {
        const code = ch.codePointAt(0) ?? 0
        out += code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029 ? " " : ch
    }
    return out
}

/** Collapse whitespace and drop control characters (they'd break subjects and logs). */
export function cleanText(value: string): string {
    return stripControls(value).replace(/\s+/g, " ").trim()
}

/** "1500", "1,500", "$1,500.50" → 1500.5; null for anything else. */
export function parseOffer(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value !== "string") return null
    const cleaned = value.trim().replace(/^\$/, "").replace(/,/g, "")
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(cleaned)) return null
    return Number(cleaned)
}

export function formatOffer(amount: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(amount)
}

export function spotLabel(spot: SponsorSpot): string {
    return SPOT_CHOICES.find((choice) => choice.value === spot)?.label ?? "Any spot"
}

/** Validate the text fields. The file is checked separately (it needs its bytes). */
export function validateSponsorFields(input: {
    email: unknown
    affiliation: unknown
    offer: unknown
    spot: unknown
}): { fields: SponsorFields } | { errors: SponsorFieldErrors } {
    const errors: SponsorFieldErrors = {}

    const email = typeof input.email === "string" ? input.email.trim() : ""
    if (!isValidEmail(email)) errors.email = "Enter a valid email address."

    const affiliation = typeof input.affiliation === "string" ? cleanText(input.affiliation) : ""
    if (!affiliation) errors.affiliation = "Tell me who the sticker is for."
    else if (affiliation.length > SPONSOR_LIMITS.affiliation) errors.affiliation = `Keep it under ${SPONSOR_LIMITS.affiliation} characters.`
    else if (WEB_ADDRESS_RE.test(affiliation)) errors.affiliation = "Please leave web addresses out; a name is enough (\"Node JS Meetup\", not \"nodejs.org\")."

    const offer = parseOffer(input.offer)
    if (offer === null) errors.offer = "Enter an amount in US dollars, like 150 or 1,500."
    else if (offer < SPONSOR_LIMITS.offerMin) errors.offer = "Offers start at $1."
    else if (offer > SPONSOR_LIMITS.offerMax) errors.offer = "That's above the maximum for this form. Email me instead."

    const spot = SPOT_CHOICES.some((choice) => choice.value === input.spot) ? (input.spot as SponsorSpot) : null
    if (!spot) errors.spot = "Choose a spot."

    if (Object.keys(errors).length > 0) return { errors }
    return { fields: { email, affiliation, offer: offer!, spot: spot! } }
}

/** Size/type check the browser can do before uploading. */
export function checkStickerFile(file: { size: number; type: string } | null | undefined): string | null {
    if (!file || file.size === 0) return "Attach the sticker file you'd like printed."
    if (file.size > SPONSOR_LIMITS.fileBytes) return "That file is over 4 MB. Try a compressed PNG or a PDF."
    if (file.type && !(file.type in STICKER_FILE_TYPES)) return "Use a PNG, JPG, WebP, or PDF file."
    return null
}

/** The real file type, from its first bytes, or null when it isn't one we accept. */
export function sniffStickerType(bytes: Uint8Array): StickerMime | null {
    const starts = (...sig: number[]) => sig.every((byte, i) => bytes[i] === byte)
    const ascii  = (from: number, text: string) => [...text].every((ch, i) => bytes[from + i] === ch.charCodeAt(0))
    if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png"
    if (starts(0xff, 0xd8, 0xff)) return "image/jpeg"
    if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp"
    if (ascii(0, "%PDF-")) return "application/pdf"
    return null
}

/** A display-safe file name: no path, no control characters, bounded length. */
export function cleanFileName(name: unknown): string {
    if (typeof name !== "string") return "sticker"
    const base = cleanText(name.split(/[\\/]/).pop() ?? "").replace(/[<>:"|?*]/g, "")
    return base.slice(-SPONSOR_LIMITS.fileName) || "sticker"
}
