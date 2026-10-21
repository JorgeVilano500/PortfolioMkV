import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { getClientIp, isSameOriginRequest } from "@/lib/security"
import { rateLimit } from "@/lib/rate-limit"
import { isJsonObject, isUuid } from "@/lib/validation"
import { CONSENT_COOKIE, CONSENT_VERSION, parseConsent } from "@/lib/consent"
import { isMissingColumn, isMissingTable, warnSchemaOnce } from "@/lib/supabase-errors"

const ROUTE = "consent"

// Called once per choice from our own pages; generous for real use, tight for abuse.
const CONSENT_LIMIT = 20
const CONSENT_WINDOW_MS = 60_000

function guard(req: NextRequest): NextResponse | null {
    // Browser-only endpoint: refuse cross-site calls (no CSRF-driven erasure).
    if (!isSameOriginRequest(req)) {
        return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
    }
    const rl = rateLimit(ROUTE, getClientIp(req), CONSENT_LIMIT, CONSENT_WINDOW_MS)
    if (!rl.ok) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        )
    }
    return null
}

async function logEvent(visitorId: string, analytics: boolean, action: "set" | "erase"): Promise<"ok" | "skipped" | "error"> {
    const { error } = await supabaseAdmin.from("consent_events").insert({
        visitor_id:     visitorId,
        analytics,
        policy_version: CONSENT_VERSION,
        action,
    })
    if (!error) return "ok"
    if (isMissingTable(error)) {
        warnSchemaOnce(ROUTE, "run supabase/consent-schema.sql to keep a consent log")
        return "skipped"
    }
    console.error(`[${ROUTE}] log ${action}:`, error.message)
    return "error"
}

// ─── POST /api/consent { id, analytics, version } — record a choice ─────────
// Stores a minimal receipt (random id, choice, policy version, time). No IP or
// user agent: the log must stay safe to keep even for visitors who declined.

export async function POST(req: NextRequest) {
    const denied = guard(req)
    if (denied) return denied

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    if (!isJsonObject(body)) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    const { id, analytics, version } = body
    if (!isUuid(id) || typeof analytics !== "boolean" || version !== CONSENT_VERSION) {
        return NextResponse.json({ error: "id (uuid), analytics (boolean) and the current version are required" }, { status: 400 })
    }

    const result = await logEvent(id, analytics, "set")
    if (result === "error") return NextResponse.json({ error: "Database error" }, { status: 500 })
    return NextResponse.json({ ok: true, logged: result === "ok" })
}

// ─── DELETE /api/consent — erase the analytics recorded for this browser ────
// The visitor id comes from the visitor's own consent cookie, so a browser can
// only erase its own rows. Rows from before visitor ids existed can't be
// matched to anyone and are untouched.

export async function DELETE(req: NextRequest) {
    const denied = guard(req)
    if (denied) return denied

    const consent = parseConsent(req.cookies.get(CONSENT_COOKIE)?.value)
    if (!consent) {
        return NextResponse.json({ error: "No privacy choice found for this browser" }, { status: 400 })
    }

    const { error, count } = await supabaseAdmin
        .from("page_views")
        .delete({ count: "exact" })
        .eq("visitor_id", consent.id)

    let deleted = count ?? 0
    if (error) {
        if (!isMissingColumn(error)) {
            console.error(`[${ROUTE}] erase:`, error.message)
            return NextResponse.json({ error: "Database error" }, { status: 500 })
        }
        // No visitor_id column yet → nothing could have been stored against this id.
        warnSchemaOnce(`${ROUTE}/erase`, "run supabase/consent-schema.sql")
        deleted = 0
    }

    await logEvent(consent.id, false, "erase")
    return NextResponse.json({ ok: true, deleted })
}
