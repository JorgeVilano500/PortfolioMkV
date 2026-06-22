import { type NextRequest } from "next/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

// ─── Route handler ───────────────────────────────────────────────────────────
// POST /api/email-summary
// Sends a pre-built summary (e.g. a daily inbox digest) to your inbox via Resend.
// This route does NOT fetch or categorize emails itself — that happens upstream
// (e.g. a Cowork scheduled task with Gmail access), which POSTs the finished
// subject/text/html here and this route just delivers it.
//
// Auth: same pattern as /api/blog/upload — send the secret as `x-api-key`.

export async function POST(request: NextRequest) {
    // 1. Authenticate
    const apiKey = request.headers.get("x-api-key")
    if (!apiKey || apiKey !== process.env.EMAIL_SUMMARY_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Parse body
    let body: { subject?: string; text?: string; html?: string }
    try {
        body = await request.json()
    } catch {
        return Response.json({ error: "Request body must be valid JSON" }, { status: 400 })
    }

    const { subject, text, html } = body

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

    // 3. Send via Resend
    const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Inbox Summary <onboarding@resend.dev>",
        to,
        subject: subject || `Inbox summary — ${new Date().toLocaleDateString()}`,
        text,
        html,
    } as Parameters<typeof resend.emails.send>[0])

    if (error) {
        return Response.json({ error: error.message }, { status: 502 })
    }

    return Response.json({ success: true, id: data?.id }, { status: 200 })
}
