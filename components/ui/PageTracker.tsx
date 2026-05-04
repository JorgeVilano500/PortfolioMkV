"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

const SKIP_PREFIXES = ["/logistics", "/api"]

function getOrCreateSessionId(): string {
    try {
        let id = sessionStorage.getItem("_pv_sid")
        if (!id) {
            id = crypto.randomUUID()
            sessionStorage.setItem("_pv_sid", id)
        }
        return id
    } catch {
        return crypto.randomUUID()
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

export function PageTracker() {
    const pathname = usePathname()
    const prevPathname = useRef<string | null>(null)

    useEffect(() => {
        if (pathname === prevPathname.current) return
        prevPathname.current = pathname

        if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return

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
            }),
        }).catch(() => {
            // Silently swallow — analytics must never break the page
        })
    }, [pathname])

    return null
}
