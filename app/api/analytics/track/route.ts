import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

const BLOCKED_PREFIXES = ["/logistics", "/api"]

function getClientIp(req: NextRequest): string {
    // x-forwarded-for: client, proxy1, proxy2 — first entry is the real client
    const xff = req.headers.get("x-forwarded-for")
    if (xff) return xff.split(",")[0].trim()
    return req.headers.get("x-real-ip") ?? "unknown"
}

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

    if (!page || !session_id || typeof page !== "string" || typeof session_id !== "string") {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Skip internal / logistics pages
    if (BLOCKED_PREFIXES.some((prefix) => page.startsWith(prefix))) {
        return NextResponse.json({ ok: true })
    }

    const { error } = await supabaseAdmin.from("page_views").insert({
        page,
        referrer:        typeof referrer === "string" ? referrer : "",
        user_agent:      req.headers.get("user-agent") ?? "",
        session_id,
        is_new_visitor:  is_new_visitor === true,
        load_time:       typeof load_time === "number" ? load_time : null,
        screen_width:    typeof screen_width === "number" ? screen_width : null,
    })

    if (error) {
        console.error("[analytics/track]", error.message)
        return NextResponse.json({ error: "DB error" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
