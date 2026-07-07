import { type NextRequest } from "next/server"
import { Resend } from "resend"
import { safeEqual, getClientIp } from "@/lib/security"
import { isAuthBlocked, recordAuthFailure, rateLimit } from "@/lib/rate-limit"
import { LIMITS, isStringMax } from "@/lib/validation"

const resend = new Resend(process.env.RESEND_API_KEY)

const ROUTE = "email-summary"

// Even authenticated, cap sends — protects the Resend quota if the key leaks
// or an upstream automation loops.
const SEND_LIMIT = 10
const SEND_WINDOW_MS = 60 * 60 * 1000 // 10 sends per hour

// ─── Route handler ───────────────────────────────────────────────────────────
// POST /api/email-summary
// Sends a pre-built summary (e.g. a daily inbox digest) to your inbox via Resend.
// This route does NOT fetch or categorize emails itself — that happens upstream
// (e.g. a Cowork scheduled task with Gmail access), which POSTs the finished
// subject/text/html here and this route just delivers it.
//
// Auth: same pattern as /api/blog/upload — send the secret as `x-api-key`.

export async function POST(request: NextRequest) {
    // 1. Authenticate (constant-time compare + brute-force damping)
    const ip = getClientIp(request)
    if (isAuthBlocked(ROUTE, ip)) {
        return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }
    const apiKey = request.headers.get("x-api-key")
    const secret = process.env.EMAIL_SUMMARY_SECRET
    if (!secret || !safeEqual(apiKey, secret)) {
        recordAuthFailure(ROUTE, ip)
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Post-auth send cap
    const rl = rateLimit("email-send", "global", SEND_LIMIT, SEND_WINDOW_MS)
    if (!rl.ok) {
        return Response.json(
            { error: "Send limit reached. Try again later." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        )
    }

    // 3. Parse + validate body
    let body: { subject?: unknown; text?: unknown; html?: unknown }
    try {
        body = await request.json()
    } catch {
        return Response.json({ error: "Request body must be valid JSON" }, { status: 400 })
    }

    const { subject, text, html } = body

    if (subject !== undefined && !isStringMax(subject, LIMITS.emailSubject)) {
        return Response.json({ error: "subject must be a string" }, { status: 400 })
    }
    if (text !== undefined && !isStringMax(text, LIMITS.emailBody)) {
        return Response.json({ error: "text must be a string" }, { status: 400 })
    }
    if (html !== undefined && !isStringMax(html, LIMITS.emailBody)) {
        return Response.json({ error: "html must be a string" }, { status: 400 })
    }
    if (!text && !html) {
        return Response.json(
            { error: "Provide at least one of: text, html" },
            { status: 400 }
        )
    }

    const to = process.env.SUMMARY_RECIPIENT_EMAIL
    if (!to) {
        return Response.json(
            { error: "SUMMARY_RECIPIENT_EMAIL is not configured" },
            { status: 500 }
        )
    }

    // 4. Send via Resend — recipient is always the configured env address,
    // so this route can never be turned into an open relay.
    const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Inbox Summary <onboarding@resend.dev>",
        to,
        subject: (subject as string | undefined) || `Inbox summary — ${new Date().toLocaleDateString()}`,
        text: text as string | undefined,
        html: html as string | undefined,
    } as Parameters<typeof resend.emails.send>[0])

    if (error) {
        console.error(`[${ROUTE}]`, error.message)
        return Response.json({ error: "Email provider error" }, { status: 502 })
    }

    return Response.json({ success: true, id: data?.id }, { status: 200 })
}
