import "server-only"
import { SPONSOR_REPLY_WINDOW, STICKER_FILE_TYPES, formatOffer, spotLabel, type SponsorFields, type StickerMime } from "./sponsorship"

/**
 * The two emails sent for a "Sponsor a spot" offer, in the site's look
 * (DESIGN_SYSTEM.md §2): a #0a0a0f page, a #13121c card with a violet accent,
 * #f0eeff headings. Email clients ignore <style> and modern CSS, so layout is
 * tables + inline styles, with a plain-text twin for every message.
 *
 * Everything the visitor typed is HTML-escaped. Their email address is the
 * only value that becomes a link (a mailto: in the owner's copy), and it has
 * already passed the strict isValidEmail check.
 */

export type SponsorInquiry = SponsorFields & {
    id:         string
    fileName:   string
    fileType:   StickerMime
    fileBytes:  number
    receivedAt: Date
}

export type EmailContent = { subject: string; html: string; text: string }

type Row = { label: string; value: string; html?: string }

const COLORS = {
    page:    "#0a0a0f",
    inset:   "#0d0c14",
    card:    "#13121c",
    line:    "#2a2840",
    heading: "#f0eeff",
    strong:  "#c4c0d8",
    body:    "#8a88a0",
    brand:   "#7c6dff",
} as const

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(date: Date): string {
    return `${new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "UTC",
    }).format(date)} UTC`
}

const reference = (id: string) => id.slice(0, 8).toUpperCase()

// ─── Shared layout ────────────────────────────────────────────────────────────

function layout({ preheader, eyebrow, heading, paragraphs, rows, cta, footer }: {
    preheader:  string
    eyebrow:    string
    heading:    string
    paragraphs: string[]
    rows:       Row[]
    cta?:       { href: string; label: string }
    footer:     string
}): string {
    const p = (text: string) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.strong};">${text}</p>`
    const detailRows = rows.map((row, i) => `
        <tr>
            <td style="padding:${i === 0 ? "0" : "14px"} 0 0;">
                <div style="font-family:${FONT};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.body};margin:0 0 4px;">${escapeHtml(row.label)}</div>
                <div style="font-family:${FONT};font-size:15px;line-height:1.5;color:${COLORS.heading};word-break:break-word;">${row.html ?? escapeHtml(row.value)}</div>
            </td>
        </tr>`).join("")
    const button = cta ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
            <tr><td bgcolor="${COLORS.brand}" style="border-radius:999px;">
                <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(cta.label)}</a>
            </td></tr>
        </table>` : ""

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};" bgcolor="${COLORS.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background:${COLORS.page};">
    <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr><td style="padding:0 4px 20px;font-family:${FONT};font-size:18px;font-weight:800;color:${COLORS.heading};">
                JAVA<span style="color:${COLORS.brand};">.</span>dev
            </td></tr>
            <tr><td bgcolor="${COLORS.card}" style="background:${COLORS.card};border:1px solid ${COLORS.line};border-top:3px solid ${COLORS.brand};border-radius:16px;padding:32px;">
                <div style="font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;color:${COLORS.brand};margin:0 0 10px;">${escapeHtml(eyebrow)}</div>
                <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;color:${COLORS.heading};">${escapeHtml(heading)}</h1>
                ${paragraphs.map(p).join("")}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.inset}" style="background:${COLORS.inset};border:1px solid ${COLORS.line};border-radius:12px;">
                    <tr><td style="padding:20px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}</table>
                    </td></tr>
                </table>
                ${button}
            </td></tr>
            <tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.body};">${footer}</td></tr>
        </table>
    </td></tr>
</table>
</body>
</html>`
}

function textVersion(heading: string, paragraphs: string[], rows: Row[], footer: string): string {
    return [
        "JAVA.dev",
        "",
        heading,
        "",
        ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
        ...rows.map((row) => `${row.label}: ${row.value}`),
        "",
        "--",
        footer,
    ].join("\n")
}

// ─── Email 1: thank-you + copy, to the person who sent the offer ──────────────

export function sponsorConfirmationEmail(inquiry: SponsorInquiry, siteUrl: string): EmailContent {
    const heading = "Thanks for your sponsorship offer!"
    // Received, not accepted: the offer starts a conversation (SPONSORSHIPS.md).
    const paragraphs = [
        "Thank you so much for offering to sponsor a sticker spot on my laptop. It genuinely means a lot that you'd like to be part of it.",
        `I've received your offer. It isn't accepted yet: I'll look it over and reply within ${SPONSOR_REPLY_WINDOW} so we can talk it through.`,
        "Here are your offer's details, for your records:",
    ]
    const type = STICKER_FILE_TYPES[inquiry.fileType].label
    // Anyone can type any address into the form, so this email carries only
    // values the site chose or checked. The affiliation is free text a stranger
    // could fill with a scam ("Call this number..."), so only the owner's notice
    // shows it (SECURITY.md S-45). The original file name stays out too.
    const rows: Row[] = [
        { label: "Your email",         value: inquiry.email },
        { label: "Preferred spot",     value: spotLabel(inquiry.spot) },
        { label: "Your offer (USD)",   value: `${formatOffer(inquiry.offer)} · open to negotiation` },
        { label: "Sticker file",       value: `${type}, ${formatBytes(inquiry.fileBytes)} (received)` },
        { label: "Reference",          value: reference(inquiry.id) },
        { label: "Sent",               value: formatDate(inquiry.receivedAt) },
    ]
    const footerText = `You're getting this because this address was entered on the sponsorship form at ${siteUrl}/laptop. Nothing has been charged; offers are agreed by email. If this wasn't you, you can ignore this message.`
    return {
        subject: "Thanks for your sponsorship offer · JAVA.dev",
        html: layout({
            preheader: `I've received your sticker sponsorship offer and will reply within ${SPONSOR_REPLY_WINDOW}.`,
            eyebrow: "Sponsorship offer received",
            heading,
            paragraphs: paragraphs.map(escapeHtml),
            rows,
            footer: escapeHtml(footerText),
        }),
        text: textVersion(heading, paragraphs, rows, footerText),
    }
}

// ─── Email 2: inquiry notice, to the site owner (Reply-To: the sponsor) ───────

export function ownerNotificationEmail(inquiry: SponsorInquiry, siteUrl: string, { stored }: { stored: boolean }): EmailContent {
    const heading = "Someone is inquiring about a sponsorship"
    const paragraphs = [
        `${inquiry.affiliation} wants a sticker spot on the laptop and offered ${formatOffer(inquiry.offer)}. Their sticker file is attached.`,
        "Just hit Reply: this email's Reply-To is their address, so you can pick up the negotiation directly.",
    ]
    const type = STICKER_FILE_TYPES[inquiry.fileType].label
    const replyHref = `mailto:${inquiry.email}?subject=${encodeURIComponent("Your sticker sponsorship offer")}`
    const rows: Row[] = [
        { label: "Email",          value: inquiry.email, html: `<a href="${escapeHtml(replyHref)}" style="color:#AFA9EC;text-decoration:underline;">${escapeHtml(inquiry.email)}</a>` },
        { label: "Affiliation",    value: inquiry.affiliation },
        { label: "Preferred spot", value: spotLabel(inquiry.spot) },
        { label: "Offer (USD)",    value: `${formatOffer(inquiry.offer)} (negotiable)` },
        { label: "Sticker file",   value: `${inquiry.fileName} · ${type}, ${formatBytes(inquiry.fileBytes)} (attached)` },
        { label: "Reference",      value: reference(inquiry.id) },
        { label: "Received",       value: formatDate(inquiry.receivedAt) },
    ]
    const footerText = stored
        ? `Sent by the sponsorship form at ${siteUrl}/laptop. It's saved in Studio → Sponsorships (${siteUrl}/studio), with the file kept privately in the Supabase bucket "sponsor-stickers" under offers/${inquiry.id}/.`
        : `Sent by the sponsorship form at ${siteUrl}/laptop. This offer could NOT be saved to Supabase (see the server log), so it won't appear in Studio and this email is the only copy.`
    return {
        subject: `Sponsorship inquiry: ${inquiry.affiliation} (${formatOffer(inquiry.offer)})`,
        html: layout({
            preheader: `${inquiry.affiliation} offered ${formatOffer(inquiry.offer)} for a sticker spot.`,
            eyebrow: "New sponsorship inquiry",
            heading,
            paragraphs: paragraphs.map(escapeHtml),
            rows,
            cta: { href: replyHref, label: `Reply to ${inquiry.email}` },
            footer: escapeHtml(footerText),
        }),
        text: textVersion(heading, paragraphs, rows, footerText),
    }
}
