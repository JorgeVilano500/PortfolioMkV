"use client"

import { useState, useEffect } from "react"
import { Navbar } from "@/components"
import type { StatsPayload } from "@/app/api/analytics/stats/route"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + "k"
    return String(n)
}

function relTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60_000)
    if (m < 1)   return "just now"
    if (m < 60)  return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24)  return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}

function pageLabel(path: string): string {
    if (path === "/") return "Home"
    return path.replace(/^\//, "").replace(/-/g, " ")
        .split("/").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" › ")
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    sub,
    accent = "#7c6dff",
}: {
    label: string
    value: string
    sub?: string
    accent?: string
}) {
    return (
        <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 flex flex-col justify-between min-h-[140px] hover:-translate-y-1 transition-transform duration-300">
            <p className="text-xs tracking-widest uppercase text-[#555370] font-medium">{label}</p>
            <p className="font-syne font-extrabold text-4xl text-[#f0eeff] tracking-tight leading-none mt-3"
               style={{ color: accent }}>
                {value}
            </p>
            {sub && <p className="text-xs text-[#555370] mt-2">{sub}</p>}
        </div>
    )
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
    const pct = max > 0 ? Math.round((count / max) * 100) : 0
    return (
        <div className="flex items-center gap-3 py-2">
            <span className="text-xs text-[#c4c0d8] font-medium w-36 truncate shrink-0">{label}</span>
            <div className="flex-1 bg-[#1e1c2e] h-1.5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-xs text-[#555370] w-10 text-right shrink-0">{fmtNum(count)}</span>
        </div>
    )
}

// Mini bar chart for daily views (30 bars)
function SparkBars({ data }: { data: { date: string; count: number }[] }) {
    const max = Math.max(...data.map((d) => d.count), 1)
    return (
        <div className="flex items-end gap-0.5 h-16 w-full mt-3">
            {data.map((d) => {
                const h = Math.max(Math.round((d.count / max) * 100), d.count > 0 ? 6 : 2)
                return (
                    <div
                        key={d.date}
                        title={`${d.date}: ${d.count} views`}
                        className="flex-1 rounded-sm transition-all duration-300"
                        style={{
                            height: `${h}%`,
                            background: d.count > 0 ? "#7c6dff" : "#1e1c2e",
                            opacity: d.count > 0 ? 1 : 0.5,
                        }}
                    />
                )
            })}
        </div>
    )
}

// 24-hour heatmap as a row of dots
function HourHeatmap({ data }: { data: { hour: number; count: number }[] }) {
    const max = Math.max(...data.map((d) => d.count), 1)
    return (
        <div className="flex gap-1 mt-3 flex-wrap">
            {data.map(({ hour, count }) => {
                const intensity = count / max
                return (
                    <div
                        key={hour}
                        title={`${hour}:00 — ${count} views`}
                        className="rounded-sm cursor-default"
                        style={{
                            width: 20,
                            height: 20,
                            background: `rgba(124,109,255,${0.08 + intensity * 0.92})`,
                            border: "1px solid rgba(42,40,64,0.6)",
                        }}
                    >
                        <span className="sr-only">{hour}:00</span>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Password gate ────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: (key: string) => void }) {
    const [value, setValue] = useState("")
    const [error, setError]  = useState(false)
    const [loading, setLoading] = useState(false)

    const attempt = async () => {
        if (!value) return
        setLoading(true)
        setError(false)
        const res = await fetch("/api/analytics/stats", {
            headers: { "x-logistics-key": value },
        })
        setLoading(false)
        if (res.ok) {
            try { sessionStorage.setItem("_lk", value) } catch { /* ignore */ }
            onAuth(value)
        } else {
            setError(true)
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
            <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-8 w-full max-w-sm">
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Restricted</p>
                <h1 className="font-syne font-extrabold text-2xl text-[#f0eeff] mb-1">Logistics</h1>
                <p className="text-sm text-[#555370] mb-6">Enter the access password to view site stats.</p>
                <input
                    type="password"
                    placeholder="Password"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && attempt()}
                    className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-4 py-3 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors mb-3"
                />
                {error && (
                    <p className="text-xs text-pink-400 mb-3">Incorrect password.</p>
                )}
                <button
                    onClick={attempt}
                    disabled={loading || !value}
                    className="w-full bg-[#7c6dff] hover:bg-[#6a5de8] disabled:opacity-40 text-white font-medium text-sm py-3 rounded-xl transition-colors cursor-pointer"
                >
                    {loading ? "Checking…" : "Enter"}
                </button>
            </div>
        </div>
    )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

function Dashboard({ authKey }: { authKey: string }) {
    const [stats, setStats]             = useState<StatsPayload | null>(null)
    const [loading, setLoading]         = useState(true)
    const [lastRefresh, setLast]        = useState<Date>(new Date())
    const [tick, setTick]               = useState(0)
    const [deviceExcluded, setExcluded] = useState(false)
    const [copied, setCopied]           = useState(false)

    // Read device exclusion flag from localStorage (deferred to avoid SSR mismatch)
    useEffect(() => {
        Promise.resolve()
            .then(() => { try { return localStorage.getItem("_pv_exclude") === "1" } catch { return false } })
            .then((v) => setExcluded(v))
    }, [])

    // setState calls are inside .then()/.catch() callbacks — not synchronous in the effect body
    useEffect(() => {
        fetch("/api/analytics/stats", { headers: { "x-logistics-key": authKey } })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: StatsPayload | null) => {
                if (data) { setStats(data); setLast(new Date()) }
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [authKey, tick])

    const refresh = () => { setLoading(true); setTick((t) => t + 1) }

    const toggleExclusion = () => {
        try {
            if (deviceExcluded) {
                localStorage.removeItem("_pv_exclude")
            } else {
                localStorage.setItem("_pv_exclude", "1")
            }
            setExcluded((v) => !v)
        } catch { /* ignore */ }
    }

    const copyIp = (ip: string) => {
        navigator.clipboard.writeText(ip).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }).catch(() => {})
    }

    if (loading && !stats) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 animate-pulse">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className={`${i < 4 ? "xl:col-span-3" : "xl:col-span-4"} bg-[#13121c] border border-[#2a2840] rounded-2xl min-h-[140px]`} />
                ))}
            </div>
        )
    }

    if (!stats) return null

    const totalTraffic = stats.topPages.reduce((a, p) => a + p.count, 0) || 1
    const maxRef       = stats.topReferrers[0]?.count ?? 1
    const deviceTotal  = stats.devices.mobile + stats.devices.tablet + stats.devices.desktop || 1

    return (
        <div className="space-y-4">

            {/* Refresh bar */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-[#555370]">
                    Last refreshed {lastRefresh.toLocaleTimeString()}
                </p>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="text-xs text-[#7c6dff] hover:underline disabled:opacity-40 cursor-pointer"
                >
                    {loading ? "Refreshing…" : "Refresh ↺"}
                </button>
            </div>

            {/* Row 1 — headline numbers */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-4">
                <StatCard
                    label="Total Page Views"
                    value={fmtNum(stats.totalViews)}
                    sub="All time"
                    accent="#7c6dff"
                />
                <StatCard
                    label="Unique Visitors"
                    value={fmtNum(stats.uniqueVisitors)}
                    sub="All time sessions"
                    accent="#AFA9EC"
                />
                <StatCard
                    label="Last 30 Days"
                    value={fmtNum(stats.last30Views)}
                    sub={`${fmtNum(stats.last30Unique)} unique`}
                    accent="#97C459"
                />
                <StatCard
                    label="Avg Load Time"
                    value={stats.avgLoadTime !== null ? `${stats.avgLoadTime}ms` : "—"}
                    sub="Initial page load"
                    accent="#ED93B1"
                />
            </div>

            {/* Row 2 — top pages + daily trend */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

                {/* Top pages */}
                <div className="xl:col-span-5 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-4">Top Pages</p>
                    {stats.topPages.length === 0 ? (
                        <p className="text-xs text-[#555370]">No data yet.</p>
                    ) : (
                        stats.topPages.map((p) => (
                            <BarRow
                                key={p.page}
                                label={pageLabel(p.page)}
                                count={p.count}
                                max={totalTraffic}
                                color="#7c6dff"
                            />
                        ))
                    )}
                </div>

                {/* Daily trend */}
                <div className="xl:col-span-7 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium">Daily Traffic</p>
                        <span className="text-xs text-[#555370]">Last 30 days</span>
                    </div>
                    <SparkBars data={stats.dailyViews} />
                    <div className="flex justify-between mt-2">
                        <span className="text-[10px] text-[#555370]">
                            {stats.dailyViews[0]?.date}
                        </span>
                        <span className="text-[10px] text-[#555370]">
                            {stats.dailyViews[stats.dailyViews.length - 1]?.date}
                        </span>
                    </div>
                </div>
            </div>

            {/* Row 3 — referrers, devices, new/returning */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Referrers */}
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-4">Traffic Sources</p>
                    {stats.topReferrers.length === 0 ? (
                        <p className="text-xs text-[#555370]">No data yet.</p>
                    ) : (
                        stats.topReferrers.map((r) => (
                            <BarRow
                                key={r.referrer}
                                label={r.referrer}
                                count={r.count}
                                max={maxRef}
                                color="#ED93B1"
                            />
                        ))
                    )}
                </div>

                {/* Device breakdown */}
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-4">Devices</p>
                    <div className="space-y-4">
                        {[
                            { label: "Desktop", icon: "🖥️", count: stats.devices.desktop, color: "#7c6dff" },
                            { label: "Mobile",  icon: "📱", count: stats.devices.mobile,  color: "#97C459" },
                            { label: "Tablet",  icon: "📲", count: stats.devices.tablet,  color: "#ED93B1" },
                        ].map(({ label, icon, count, color }) => (
                            <div key={label} className="flex items-center gap-3">
                                <span className="text-lg">{icon}</span>
                                <div className="flex-1">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-[#c4c0d8]">{label}</span>
                                        <span className="text-[#555370]">
                                            {Math.round((count / deviceTotal) * 100)}%
                                        </span>
                                    </div>
                                    <div className="bg-[#1e1c2e] h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${Math.round((count / deviceTotal) * 100)}%`, background: color }}
                                        />
                                    </div>
                                </div>
                                <span className="text-xs text-[#555370] w-8 text-right">{fmtNum(count)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* New vs returning + bounce rate */}
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-4">Visitors</p>
                    <div className="space-y-4">
                        {(() => {
                            const total = stats.newVsReturning.new + stats.newVsReturning.returning || 1
                            return [
                                { label: "New Visitors",       count: stats.newVsReturning.new,       color: "#7c6dff" },
                                { label: "Returning Visitors", count: stats.newVsReturning.returning, color: "#97C459" },
                            ].map(({ label, count, color }) => (
                                <div key={label}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-[#c4c0d8]">{label}</span>
                                        <span className="text-[#555370]">
                                            {fmtNum(count)} ({Math.round((count / total) * 100)}%)
                                        </span>
                                    </div>
                                    <div className="bg-[#1e1c2e] h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{ width: `${Math.round((count / total) * 100)}%`, background: color }}
                                        />
                                    </div>
                                </div>
                            ))
                        })()}
                        <div className="border-t border-[#2a2840] pt-4 mt-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-[#c4c0d8]">Bounce Rate</span>
                                <span className={`text-sm font-bold ${stats.bounceRate > 70 ? "text-pink-400" : stats.bounceRate > 40 ? "text-amber-400" : "text-emerald-400"}`}>
                                    {stats.bounceRate}%
                                </span>
                            </div>
                            <p className="text-[10px] text-[#555370] mt-0.5">
                                Sessions with only 1 page view
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 4 — peak hours + recent activity */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

                {/* Peak hours heatmap */}
                <div className="xl:col-span-5 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-1">Peak Hours</p>
                    <p className="text-[10px] text-[#555370] mb-1">UTC — hover a cell to see count</p>
                    <HourHeatmap data={stats.peakHours} />
                    <div className="flex justify-between mt-2">
                        <span className="text-[10px] text-[#555370]">12am</span>
                        <span className="text-[10px] text-[#555370]">12pm</span>
                        <span className="text-[10px] text-[#555370]">11pm</span>
                    </div>
                </div>

                {/* Recent activity feed */}
                <div className="xl:col-span-7 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-4">Recent Activity</p>
                    {stats.recentActivity.length === 0 ? (
                        <p className="text-xs text-[#555370]">No visits recorded yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {stats.recentActivity.map((a, i) => (
                                <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#1e1c2e] last:border-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">{a.is_new_visitor ? "🆕" : "👤"}</span>
                                        <span className="text-sm text-[#c4c0d8] font-medium font-mono">
                                            {pageLabel(a.page)}
                                        </span>
                                    </div>
                                    <span className="text-xs text-[#555370] shrink-0">{relTime(a.created_at)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Row 5 — IP exclusion / this device */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* This device */}
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-4">
                        This Device
                    </p>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-xs text-[#c4c0d8] font-medium mb-0.5">Device tracking</p>
                            <p className="text-[10px] text-[#555370]">
                                {deviceExcluded ? "Your visits on this browser are not being recorded." : "Your visits on this browser are being recorded."}
                            </p>
                        </div>
                        <button
                            onClick={toggleExclusion}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer shrink-0 ${deviceExcluded ? "bg-[#7c6dff]" : "bg-[#2a2840]"}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${deviceExcluded ? "translate-x-6" : "translate-x-1"}`}
                            />
                        </button>
                    </div>
                    <p className="text-[10px] text-[#555370] leading-relaxed">
                        Toggle this on every browser / device you use. The flag is stored in localStorage — it survives refreshes but will reset if you clear site data.
                    </p>
                </div>

                {/* IP exclusion */}
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-6">
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-4">
                        IP Exclusion
                    </p>
                    <div className="mb-4">
                        <p className="text-xs text-[#c4c0d8] font-medium mb-1">Your current IP</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 bg-[#0a0a0f] border border-[#2a2840] rounded-lg px-3 py-2 text-xs text-[#7c6dff] font-mono">
                                {stats.yourIp}
                            </code>
                            <button
                                onClick={() => copyIp(stats.yourIp)}
                                className="shrink-0 text-xs px-3 py-2 rounded-lg border border-[#2a2840] text-[#888] hover:border-[#7c6dff] hover:text-[#c4c0d8] transition-colors cursor-pointer"
                            >
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        </div>
                    </div>
                    {stats.excludedIps.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs text-[#c4c0d8] font-medium mb-2">Blocked IPs</p>
                            <div className="space-y-1">
                                {stats.excludedIps.map((ip) => (
                                    <div key={ip} className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                        <code className="text-xs text-[#555370] font-mono">{ip}</code>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="text-[10px] text-[#555370] leading-relaxed">
                        To permanently block an IP (works across all browsers), add it to{" "}
                        <code className="text-[#7c6dff]">ANALYTICS_EXCLUDED_IPS</code> in your{" "}
                        <code className="text-[#7c6dff]">.env.local</code> as a comma-separated list, then redeploy.
                    </p>
                </div>

            </div>

        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Logistics() {
    const [authKey, setAuthKey] = useState<string | null>(null)
    const [hydrated, setHydrated] = useState(false)

    // Restore saved key from sessionStorage — deferred into .then() so setState
    // is never called synchronously inside the effect body
    useEffect(() => {
        Promise.resolve()
            .then(() => { try { return sessionStorage.getItem("_lk") } catch { return null } })
            .then((saved) => { if (saved) setAuthKey(saved); setHydrated(true) })
    }, [])

    if (!hydrated) return null

    if (!authKey) {
        return <PasswordGate onAuth={setAuthKey} />
    }

    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="logistics" />

            <section className="px-2 mb-8">
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Internal</p>
                <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight mb-2">
                    Site Logistics
                </h1>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                    Real-time analytics for JAVA.dev — visits, traffic sources, and load performance.
                </p>
            </section>

            <Dashboard authKey={authKey} />
        </div>
    )
}
