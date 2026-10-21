"use client"

import { useEffect, useState } from "react"
import { useOnboarding } from "./OnboardingProvider"

type Rect = { top: number; left: number; width: number; height: number }

const PADDING = 8
const FIND_TIMEOUT_MS = 4000 // content like project tiles loads asynchronously

/**
 * Outlines the element for the current tour step (`[data-tour="<target>"]`)
 * and gently dims the rest of the page. It never blocks clicks
 * (pointer-events: none). If the target never appears, nothing is drawn —
 * the toolbar text still explains the step.
 */
export function TourSpotlight() {
    const { tour, modal } = useOnboarding()
    const target = tour.active && !tour.offRoute && !modal.open ? tour.step.target : undefined
    const [rect, setRect] = useState<Rect | null>(null)

    useEffect(() => {
        if (!target) {
            Promise.resolve().then(() => setRect(null))
            return
        }

        let el: HTMLElement | null = null
        let frame = 0
        let cancelled = false
        const started = Date.now()
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

        const measure = () => {
            if (!el) return
            const r = el.getBoundingClientRect()
            setRect({ top: r.top - PADDING, left: r.left - PADDING, width: r.width + PADDING * 2, height: r.height + PADDING * 2 })
        }
        const onViewportChange = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(measure)
        }

        const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onViewportChange) : null

        const find = () => {
            if (cancelled) return
            el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)
            if (el) {
                el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" })
                measure()
                resizeObserver?.observe(el)
                window.addEventListener("scroll", onViewportChange, { passive: true, capture: true })
                window.addEventListener("resize", onViewportChange)
            } else if (Date.now() - started < FIND_TIMEOUT_MS) {
                setTimeout(find, 150)
            } else {
                setRect(null)
            }
        }
        find()

        return () => {
            cancelled = true
            cancelAnimationFrame(frame)
            resizeObserver?.disconnect()
            window.removeEventListener("scroll", onViewportChange, { capture: true })
            window.removeEventListener("resize", onViewportChange)
        }
    }, [target])

    if (!target || !rect) return null

    return (
        <div
            aria-hidden="true"
            className="fixed z-45 rounded-2xl pointer-events-none motion-safe:transition-all motion-safe:duration-300"
            style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                // One box-shadow stack: crisp 2px outline, soft glow, then the page dim.
                // (Tailwind's ring-* is also a box-shadow, so it can't be combined with an inline one.)
                boxShadow: "0 0 0 2px #7c6dff, 0 0 28px 4px rgba(124, 109, 255, 0.45), 0 0 0 9999px rgba(5, 5, 10, 0.5)",
            }}
        />
    )
}
