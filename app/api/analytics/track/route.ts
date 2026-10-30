import { NextRequest, NextResponse } from "next/server"
import { isIP } from "net"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { getClientIp } from "@/lib/security"
import { rateLimit } from "@/lib/rate-limit"
import { BODY_LIMITS, readJsonBody } from "@/lib/http"
import { LIMITS, isJsonObject } from "@/lib/validation"
import { isTrackablePath, isValidPagePath, normalizeLanguage, normalizeTimezone } from "@/lib/analytics"
import { CONSENT_COOKIE, CONSENT_VERSION, allowsAnalytics, parseConsent } from "@/lib/consent"
import { isMissingColumn, warnSchemaOnce } from "@/lib/supabase-errors"

const ROUTE = "analytics/track"

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

/**
 * Store only the referring origin. Full referrer URLs can carry search terms,
 * emails, or tokens in their path/query, and the dashboard only ever shows
 * the hostname — so keeping more is collecting data we don't use.
 */
function referrerOrigin(raw: unknown): string {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > LIMITS.referrer) return ""
    try {
        const url = new URL(raw)
        return url.protocol === "http:" || url.protocol === "https:" ? url.origin : ""
    } catch {
        return ""
    }
}

const notTracked = () => NextResponse.json({ ok: true, tracked: false })

export async function POST(req: NextRequest) {
    // IP-level exclusion — checked before anything else
    const clientIp    = getClientIp(req)
    const excludedIps = getExcludedIps()
    if (excludedIps.length > 0 && excludedIps.includes(clientIp)) {
        return notTracked() // silently drop
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

    // Consent is enforced HERE, not just in the browser: without a current
    // analytics opt-in in the java_consent cookie nothing is stored — no
    // matter what the client sends.
    const consent = parseConsent(req.cookies.get(CONSENT_COOKIE)?.value)
    if (!consent || !allowsAnalytics(consent)) return notTracked()

    // Reject requests that aren't JSON
    const contentType = req.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json")) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 })
    }

    // Byte-capped while streaming: a real page view is a few hundred bytes.
    const parsed = await readJsonBody(req, BODY_LIMITS.track)
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }
    const body = parsed.body
    if (!isJsonObject(body)) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 })
    }

    const { page, referrer, session_id, is_new_visitor, load_time, screen_width, language, timezone } = body

    // Strict shape validation — everything here is attacker-controlled.
    if (
        typeof page !== "string" || page.length > LIMITS.page || !isValidPagePath(page) ||
        typeof session_id !== "string" || session_id.length === 0 || session_id.length > LIMITS.sessionId
    ) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Skip internal / admin pages
    if (!isTrackablePath(page)) return notTracked()

    const baseRow = {
        page,
        referrer:        referrerOrigin(referrer),
        user_agent:      (req.headers.get("user-agent") ?? "").slice(0, LIMITS.userAgent),
        session_id,
        is_new_visitor:  is_new_visitor === true,
        load_time:       typeof load_time === "number" && Number.isFinite(load_time) && load_time >= 0 && load_time <= 120_000
                             ? Math.round(load_time) : null,
        screen_width:    typeof screen_width === "number" && Number.isFinite(screen_width) && screen_width > 0 && screen_width <= 10_000
                             ? Math.round(screen_width) : null,
    }

    // Opt-in fields (disclosed in the consent modal and on /privacy). The IP and
    // visitor id come from the server side (request + consent cookie), never the body.
    const consentRow = {
        ip_address:      isIP(clientIp) ? clientIp : null,
        language:        normalizeLanguage(language),
        timezone:        normalizeTimezone(timezone),
        visitor_id:      consent.id,
        consent_version: CONSENT_VERSION,
    }

    let { error } = await supabaseAdmin.from("page_views").insert({ ...baseRow, ...consentRow })

    // Code deployed before supabase/consent-schema.sql ran: keep counting views
    // with the original columns instead of failing every request.
    if (error && isMissingColumn(error)) {
        warnSchemaOnce(ROUTE, "run supabase/consent-schema.sql to store IP/language/timezone/visitor id")
        const retry = await supabaseAdmin.from("page_views").insert(baseRow)
        error = retry.error
    }

    if (error) {
        console.error(`[${ROUTE}]`, error.message)
        return NextResponse.json({ error: "DB error" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, tracked: true })
}
