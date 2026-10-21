"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useOnboarding } from "./OnboardingProvider"

const HIDDEN_ON = ["/studio", "/logistics"]

const linkClass = "hover:text-[#e8e6f0] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 rounded"

/**
 * Site-wide footer. Its privacy controls are what makes consent revocable
 * at any time (as easy to withdraw as to give), and it's where the tour
 * can be replayed.
 */
export function SiteFooter() {
    const pathname = usePathname() ?? "/"
    const { openSettings, startTour } = useOnboarding()

    if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null

    return (
        <footer className="mt-auto border-t border-[#1e1c2e] bg-[#0a0a0f] px-6 md:px-8 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8a88a0]">
                <p>© {new Date().getFullYear()} JAVA.dev · Jorge Alejandro Vilanova Alvarado</p>
                <nav aria-label="Footer" className="flex items-center gap-4">
                    <Link href="/privacy" className={linkClass}>Privacy</Link>
                    <button type="button" onClick={openSettings} className={linkClass}>Cookie settings</button>
                    <button type="button" onClick={startTour} className={linkClass}>Take the tour</button>
                </nav>
            </div>
        </footer>
    )
}
