import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { getClientIp } from "@/lib/security"
import { rateLimit } from "@/lib/rate-limit"
import { LIMITS } from "@/lib/validation"

const BLOCKED_PREFIXES = ["/logistics", "/blog-editor", "/api"]

// Unauthenticated public endpoint → strictest limiter in the app.
// A normal visitor generates a handful of page views per minute at most.
const TRACK_LIMIT = 30
const TRACK_WINDOW_MS = 60_000

function getExcludedIps(): string[] {
    return (process.env.ANALYTICS_EXCLUDED_IPS ?? "")
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean)
}

export async function POST(req: NextRequest) {
    // IP-level exclusion — checked before anything else
    const clientIp    = getClientIp(req)
    const excludedIps = getExcludedIps()
    if (excludedIps.length > 0 && excludedIps.includes(clientIp)) {
        return NextResponse.json({ ok: true }) // silently drop
    }

    // Rate limit per IP — this endpoint writes to the DB with no auth,
    // so without this anyone can flood the page_views table.
    const rl = rateLimit("track", clientIp, TRACK_LIMIT, TRACK_WINDOW_MS)
    if (!rl.ok) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        )
    }

    // Reject requests that aren't JSON
    const contentType = req.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json")) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 })
    }

    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const { page, referrer, session_id, is_new_visitor, load_time, screen_width } = body as {
        page?: string
        referrer?: string
        session_id?: string
        is_new_visitor?: boolean
        load_time?: number | null
        screen_width?: number | null
    }

    // Strict shape validation — everything here is attacker-controlled.
    if (
        typeof page !== "string" || !page.startsWith("/") || page.length > LIMITS.page ||
        typeof session_id !== "string" || session_id.length === 0 || session_id.length > LIMITS.sessionId
    ) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Skip internal / admin pages
    if (BLOCKED_PREFIXES.some((prefix) => page.startsWith(prefix))) {
        return NextResponse.json({ ok: true })
    }

    const { error } = await supabaseAdmin.from("page_views").insert({
        page,
        referrer:        typeof referrer === "string" ? referrer.slice(0, LIMITS.referrer) : "",
        user_agent:      (req.headers.get("user-agent") ?? "").slice(0, LIMITS.userAgent),
        session_id,
        is_new_visitor:  is_new_visitor === true,
        load_time:       typeof load_time === "number" && Number.isFinite(load_time) && load_time >= 0 && load_time <= 120_000
                             ? Math.round(load_time) : null,
        screen_width:    typeof screen_width === "number" && Number.isFinite(screen_width) && screen_width > 0 && screen_width <= 10_000
                             ? Math.round(screen_width) : null,
    })

    if (error) {
        console.error("[analytics/track]", error.message)
        return NextResponse.json({ error: "DB error" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
