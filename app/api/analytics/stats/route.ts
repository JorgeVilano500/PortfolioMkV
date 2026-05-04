import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export type PageViewRow = {
    page:           string
    session_id:     string
    is_new_visitor: boolean
    load_time:      number | null
    screen_width:   number | null
    referrer:       string
    created_at:     string
}

export type StatsPayload = {
    totalViews:        number
    last30Views:       number
    uniqueVisitors:    number
    last30Unique:      number
    avgLoadTime:       number | null
    topPages:          { page: string; count: number }[]
    topReferrers:      { referrer: string; count: number }[]
    newVsReturning:    { new: number; returning: number }
    devices:           { mobile: number; tablet: number; desktop: number }
    recentActivity:    { page: string; created_at: string; is_new_visitor: boolean }[]
    dailyViews:        { date: string; count: number }[]
    peakHours:         { hour: number; count: number }[]
    bounceRate:        number  // % of sessions with only 1 page view
    yourIp:            string  // IP of the dashboard viewer — for exclusion setup
    excludedIps:       string[] // IPs currently blocked via env var
}

function categoriseDevice(w: number | null): "mobile" | "tablet" | "desktop" {
    if (w === null) return "desktop"
    if (w < 768)  return "mobile"
    if (w < 1024) return "tablet"
    return "desktop"
}

function getClientIp(req: NextRequest): string {
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

function cleanReferrer(raw: string): string {
    if (!raw) return "Direct"
    try {
        const u = new URL(raw)
        // Strip www. and trailing slash
        return u.hostname.replace(/^www\./, "")
    } catch {
        return raw
    }
}

export async function GET(req: NextRequest) {
    const key = req.headers.get("x-logistics-key")
    const secret = process.env.LOGISTICS_PASSWORD

    if (!secret || key !== secret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Single fetch of all rows (reasonable for a personal portfolio)
    const { data, error } = await supabaseAdmin
        .from("page_views")
        .select("page, session_id, is_new_visitor, load_time, screen_width, referrer, created_at")
        .order("created_at", { ascending: false })
        .limit(50000)

    if (error) {
        console.error("[analytics/stats]", error.message)
        return NextResponse.json({ error: "DB error" }, { status: 500 })
    }

    const views = (data ?? []) as PageViewRow[]

    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

    const recent30 = views.filter((v) => new Date(v.created_at).getTime() >= thirtyDaysAgo)

    // ── Counts ───────────────────────────────────────────────────────────────
    const totalViews     = views.length
    const last30Views    = recent30.length
    const uniqueVisitors = new Set(views.map((v) => v.session_id)).size
    const last30Unique   = new Set(recent30.map((v) => v.session_id)).size

    // ── Avg load time ────────────────────────────────────────────────────────
    const loadTimes = views.map((v) => v.load_time).filter((t): t is number => t !== null && t > 0)
    const avgLoadTime = loadTimes.length
        ? Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length)
        : null

    // ── Top pages ────────────────────────────────────────────────────────────
    const pageCount = views.reduce<Record<string, number>>((acc, v) => {
        acc[v.page] = (acc[v.page] ?? 0) + 1
        return acc
    }, {})
    const topPages = Object.entries(pageCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([page, count]) => ({ page, count }))

    // ── Top referrers ────────────────────────────────────────────────────────
    const refCount = views.reduce<Record<string, number>>((acc, v) => {
        const key = cleanReferrer(v.referrer)
        acc[key] = (acc[key] ?? 0) + 1
        return acc
    }, {})
    const topReferrers = Object.entries(refCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([referrer, count]) => ({ referrer, count }))

    // ── New vs returning ─────────────────────────────────────────────────────
    // Count by unique session so we don't double-count multi-page sessions
    const sessionNewness = new Map<string, boolean>()
    for (const v of views) {
        if (!sessionNewness.has(v.session_id)) {
            sessionNewness.set(v.session_id, v.is_new_visitor)
        }
    }
    let newCount = 0, returningCount = 0
    for (const isNew of sessionNewness.values()) {
        if (isNew) newCount++; else returningCount++
    }
    const newVsReturning = { new: newCount, returning: returningCount }

    // ── Devices ──────────────────────────────────────────────────────────────
    const devices = { mobile: 0, tablet: 0, desktop: 0 }
    for (const v of views) {
        devices[categoriseDevice(v.screen_width)]++
    }

    // ── Recent activity (latest 15) ──────────────────────────────────────────
    const recentActivity = views.slice(0, 15).map((v) => ({
        page:           v.page,
        created_at:     v.created_at,
        is_new_visitor: v.is_new_visitor,
    }))

    // ── Daily views — last 30 days ────────────────────────────────────────────
    const dailyMap = new Map<string, number>()
    // Pre-fill last 30 days with 0 so gaps show up
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000)
        dailyMap.set(d.toISOString().slice(0, 10), 0)
    }
    for (const v of recent30) {
        const day = v.created_at.slice(0, 10)
        dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1)
    }
    const dailyViews = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }))

    // ── Peak hours (UTC) ──────────────────────────────────────────────────────
    const hourMap: Record<number, number> = {}
    for (const v of views) {
        const h = new Date(v.created_at).getUTCHours()
        hourMap[h] = (hourMap[h] ?? 0) + 1
    }
    const peakHours = Array.from({ length: 24 }, (_, h) => ({
        hour:  h,
        count: hourMap[h] ?? 0,
    }))

    // ── Bounce rate ───────────────────────────────────────────────────────────
    const sessionPageCount = new Map<string, number>()
    for (const v of views) {
        sessionPageCount.set(v.session_id, (sessionPageCount.get(v.session_id) ?? 0) + 1)
    }
    const totalSessions  = sessionPageCount.size
    const bounceSessions = [...sessionPageCount.values()].filter((c) => c === 1).length
    const bounceRate     = totalSessions > 0 ? Math.round((bounceSessions / totalSessions) * 100) : 0

    const payload: StatsPayload = {
        totalViews,
        last30Views,
        uniqueVisitors,
        last30Unique,
        avgLoadTime,
        topPages,
        topReferrers,
        newVsReturning,
        devices,
        recentActivity,
        dailyViews,
        peakHours,
        bounceRate,
        yourIp:      getClientIp(req),
        excludedIps: getExcludedIps(),
    }

    return NextResponse.json(payload)
}
