"use client"

import { useEffect, useRef, useState } from "react"
import { useOnboarding } from "./OnboardingProvider"
import { navLabel } from "@/lib/tour"

/**
 * The guided-tour bar rendered under the navbar on every page while the tour
 * runs. It explains the current page, and when the next step is on another
 * page it says which tab to click (the navbar highlights that tab too).
 * If the bar scrolls out of view, a compact copy docks to the top of the
 * viewport so the instructions are never lost.
 */
export function TourToolbar() {
    const { tour, nextTourStep, prevTourStep, endTour } = useOnboarding()
    const barRef = useRef<HTMLDivElement>(null)
    const [docked, setDocked] = useState(false)

    useEffect(() => {
        const el = barRef.current
        if (!tour.active || !el || typeof IntersectionObserver === "undefined") return
        const observer = new IntersectionObserver(
            ([entry]) => setDocked(!entry.isIntersecting && entry.boundingClientRect.top < 0),
            { threshold: 0 }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [tour.active])

    if (!tour.active) return null

    const { step, index, total, nextPage, offRoute } = tour
    const isLast   = index === total - 1
    const progress = Math.round(((index + 1) / total) * 100)

    const primaryLabel = offRoute
        ? `Back to ${navLabel(step.nav)}`
        : isLast ? "Finish"
        : nextPage ? `Go to ${navLabel(nextPage.nav)}`
        : "Next"

    const title = offRoute ? "You've stepped off the tour" : step.title
    const body  = offRoute
        ? `The tour is paused on ${navLabel(step.nav)}. Use the highlighted tab or the button to continue, or exit any time.`
        : step.body

    const actions = (compact: boolean) => (
        <div className="flex items-center gap-2 shrink-0">
            {!compact && index > 0 && !offRoute && (
                <button type="button" onClick={prevTourStep} className="text-xs px-3 py-1.5 rounded-lg text-[#8a88a0] hover:text-[#e8e6f0] hover:bg-[#1e1c2e] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60">
                    ← Back
                </button>
            )}
            <button
                type="button"
                onClick={nextTourStep}
                className="text-xs font-medium px-3.5 py-1.5 rounded-lg bg-[#7c6dff] hover:bg-[#6a5de8] text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#13121c]"
            >
                {primaryLabel}{!isLast && " →"}
            </button>
        </div>
    )

    const exitButton = (
        <button
            type="button"
            onClick={() => endTour(false)}
            aria-label="Exit tour"
            className="p-1 rounded-md text-[#555370] hover:text-[#f0eeff] hover:bg-[#1e1c2e] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
    )

    return (
        <>
            <section
                ref={barRef}
                aria-label="Guided tour"
                className="relative z-47 mx-2 md:mx-12 mb-8 rounded-2xl border border-[#7c6dff]/40 bg-[#13121c] shadow-lg shadow-[#7c6dff]/5 motion-safe:animate-[intro-in_.25s_ease-out]"
            >
                <div className="p-4 md:p-5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium">
                            Guided tour · Step {index + 1} of {total}
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="hidden sm:inline text-[11px] text-[#555370]">Esc to exit</span>
                            {exitButton}
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                        <div aria-live="polite" className="min-w-0">
                            <h2 className="font-syne font-bold text-lg text-[#f0eeff] leading-snug">{title}</h2>
                            <p className="text-sm text-[#8a88a0] leading-relaxed mt-1 max-w-2xl">{body}</p>
                            {nextPage && !offRoute && (
                                <p className="text-sm text-[#e8e6f0] mt-2">
                                    <span className="text-[#AFA9EC] font-medium">Next stop: {navLabel(nextPage.nav)}.</span>{" "}
                                    Click the highlighted <span className="font-medium">{navLabel(nextPage.nav)}</span> tab above, or use the button.
                                </p>
                            )}
                        </div>
                        {actions(false)}
                    </div>
                </div>
                <div className="h-1 rounded-b-2xl bg-[#1e1c2e] overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-[#7c6dff] motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${progress}%` }} />
                </div>
            </section>

            {docked && (
                <div className="fixed top-0 inset-x-0 z-48 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
                    <div className="mx-auto max-w-3xl flex items-center justify-between gap-3 rounded-xl border border-[#7c6dff]/40 bg-[#13121c]/95 backdrop-blur px-3 py-2 shadow-lg">
                        <p className="text-xs text-[#e8e6f0] truncate">
                            <span className="text-[#7c6dff] font-medium">Tour {index + 1}/{total}</span>
                            <span className="mx-1.5 text-[#555370]">·</span>
                            {title}
                        </p>
                        <div className="flex items-center gap-1">
                            {actions(true)}
                            {exitButton}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
