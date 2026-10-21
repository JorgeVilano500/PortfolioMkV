import { type NextRequest } from "next/server"
import { Resend } from "resend"
import { safeEqual, getClientIp } from "@/lib/security"
import { isAuthBlocked, recordAuthFailure, rateLimit } from "@/lib/rate-limit"
import { LIMITS, isStringMax, isJsonObject } from "@/lib/validation"

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
    const secret = process.env.EMAIL_SUMMARY_SECRET
    if (!secret || !safeEqual(request.headers.get("x-api-key"), secret)) {
        recordAuthFailure(ROUTE, ip)
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Parse + validate body
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return Response.json({ error: "Request body must be valid JSON" }, { status: 400 })
    }
    if (!isJsonObject(body)) {
        return Response.json({ error: "Request body must be a JSON object" }, { status: 400 })
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
    const apiKey = process.env.RESEND_API_KEY
    if (!to || !apiKey) {
        // Created per request rather than at module load: `new Resend()` throws
        // without a key, which would crash the whole module instead of failing closed.
        console.error(`[${ROUTE}] SUMMARY_RECIPIENT_EMAIL or RESEND_API_KEY is not set`)
        return Response.json({ error: "Email is not configured" }, { status: 500 })
    }

    // 3. Post-auth send cap — counted only for valid, sendable requests.
    const rl = rateLimit("email-send", "global", SEND_LIMIT, SEND_WINDOW_MS)
    if (!rl.ok) {
        return Response.json(
            { error: "Send limit reached. Try again later." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        )
    }

    // 4. Send via Resend — recipient is always the configured env address,
    // so this route can never be turned into an open relay.
    const resend = new Resend(apiKey)
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
