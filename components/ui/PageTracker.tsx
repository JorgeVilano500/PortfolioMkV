"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { useOnboarding } from "@/components/onboarding/OnboardingProvider"
import { isTrackablePath } from "@/lib/analytics"
import { randomId } from "@/lib/random-id"

function getOrCreateSessionId(): string {
    try {
        let id = sessionStorage.getItem("_pv_sid")
        if (!id) {
            id = randomId()
            sessionStorage.setItem("_pv_sid", id)
        }
        return id
    } catch {
        return randomId()
    }
}

function checkIsNewVisitor(): boolean {
    try {
        const key = "_pv_seen"
        if (!localStorage.getItem(key)) {
            localStorage.setItem(key, "1")
            return true
        }
        return false
    } catch {
        return false
    }
}

/**
 * Records page views — but only after the visitor opted in to analytics in
 * the intro modal / Cookie settings. Nothing (not even the session/visitor
 * storage below) is written before that. The server enforces the same rule
 * via the consent cookie, so this is the polite half of a two-sided check.
 */
export function PageTracker() {
    const pathname = usePathname()
    const { analyticsAllowed } = useOnboarding()
    const lastTracked = useRef<string | null>(null)

    useEffect(() => {
        if (!analyticsAllowed) {
            lastTracked.current = null // re-track the current page if consent is given later
            return
        }
        if (!pathname || pathname === lastTracked.current) return
        lastTracked.current = pathname

        if (!isTrackablePath(pathname)) return

        // Device-level opt-out — set from the /logistics dashboard
        try { if (localStorage.getItem("_pv_exclude") === "1") return } catch { /* ignore */ }

        const sessionId    = getOrCreateSessionId()
        const isNewVisitor = checkIsNewVisitor()
        const referrer     = document.referrer ?? ""

        // Navigation timing — only available on initial hard load
        let loadTime: number | null = null
        try {
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
            if (nav && nav.loadEventEnd > 0) {
                loadTime = Math.round(nav.loadEventEnd - nav.fetchStart)
            }
        } catch {
            // ignore
        }

        let timezone: string | null = null
        try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null } catch { /* ignore */ }

        fetch("/api/analytics/track", {
            method:    "POST",
            headers:   { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
                page:           pathname,
                referrer,
                session_id:     sessionId,
                is_new_visitor: isNewVisitor,
                load_time:      loadTime,
                screen_width:   window.screen?.width ?? null,
                language:       navigator.language ?? null,
                timezone,
            }),
        }).catch(() => {
            // Silently swallow — analytics must never break the page
        })
    }, [pathname, analyticsAllowed])

    return null
}
