"use client"
import { useId, useState } from "react"
import Link from "next/link"
import { RxHamburgerMenu, RxCross2 } from "react-icons/rx"
import { useOnboarding } from "@/components/onboarding/OnboardingProvider"
import { TourToolbar } from "@/components/onboarding/TourToolbar"
import type { NavKey } from "@/lib/tour"

type NavbarProps = {
    currentLink: string
}

const NAV_LINKS: NavKey[] = ["work", "about", "blog", "contact"]

// Tour highlight for the tab the visitor should click next. z-46 lifts it
// above the spotlight's dimming layer so it stays visible.
const highlightClass = "relative z-46 rounded-md px-2 py-1 -mx-2 -my-1 ring-2 ring-[#7c6dff] bg-[#7c6dff]/15 text-white!"

// "above" floats the badge over a horizontal nav link; "inline" sits beside a
// link in the vertical mobile drawer (above would collide with the link before it).
function NextBadge({ placement = "above" }: { placement?: "above" | "inline" }) {
    const badge = "whitespace-nowrap uppercase tracking-widest font-medium bg-[#7c6dff] text-white rounded-full pointer-events-none"
    return (
        <>
            <span className="absolute inset-0 rounded-md ring-2 ring-[#7c6dff] motion-safe:animate-ping pointer-events-none" aria-hidden="true" />
            {placement === "above" ? (
                <span className={`absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] px-1.5 py-0.5 ${badge}`} aria-hidden="true">Next</span>
            ) : (
                <span className={`ml-3 align-middle text-xs px-2 py-0.5 ${badge}`} aria-hidden="true">Next</span>
            )}
            <span className="sr-only"> (next stop on the guided tour)</span>
        </>
    )
}

export function Navbar({ currentLink }: NavbarProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { tour } = useOnboarding()
    const drawerId = useId()

    const current   = currentLink.toLowerCase()
    const highlight = tour.highlightNav
    const isHomeCurrent = currentLink === "/"

    return (
        <div className={current === "work" ? "" : "mb-16 md:mb-0 lg:mb-0"}>
            <div className="flex flex-row justify-between p-8 lg:p-12 md:p-12">

                <Link
                    href="/"
                    className={`${isHomeCurrent ? "text-[#7c6dff] " : "text-[#888] hover:text-white "} text-2xl font-bold ${highlight === "home" ? highlightClass : ""}`}
                >
                    JAVA.dev
                    {highlight === "home" && <NextBadge />}
                </Link>

                <ul className="hidden md:flex lg:flex flex-row gap-6 md:gap-8 list-none">
                    {NAV_LINKS.map((link) => (
                        <li key={link}>
                            <Link
                                href={`/${link}`}
                                aria-current={link === current ? "page" : undefined}
                                className={`${link === current ? "text-[#7c6dff] " : "text-[#888] hover:text-white "} capitalize ${highlight === link ? highlightClass : ""}`}
                            >
                                {link}
                                {highlight === link && <NextBadge />}
                            </Link>
                        </li>
                    ))}
                </ul>

                <section className="flex md:hidden lg:hidden self-center">
                    <button
                        type="button"
                        onClick={() => setIsOpen(true)}
                        aria-label={highlight ? "Open menu (the tour's next stop is inside)" : "Open menu"}
                        aria-expanded={isOpen}
                        aria-controls={drawerId}
                        className={`relative m-1 p-1.5 rounded-lg text-[#888] hover:text-white hover:bg-[#1e1c2e] transition-colors ${highlight ? "ring-2 ring-[#7c6dff] text-white z-46" : ""}`}
                    >
                        <RxHamburgerMenu className="self-center" aria-hidden="true" />
                        {highlight && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#7c6dff] motion-safe:animate-ping" aria-hidden="true" />
                        )}
                    </button>

                    <div
                        id={drawerId}
                        inert={!isOpen}
                        className={`${isOpen ? "translate-x-0" : "-translate-x-full"} bg-[#0a0a0f] fixed z-55 top-0 left-0 h-full flex flex-row text-slate-500 shadow-lg transform duration-300 ease-in-out w-full`}
                    >
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            aria-label="Close menu"
                            className="p-2 rounded-lg text-[#555370] hover:text-[#f0eeff] hover:bg-[#1e1c2e] transition-colors absolute top-4 right-4"
                        >
                            <RxCross2 aria-hidden="true" />
                        </button>
                        <nav aria-label="Mobile" className="p-12 text-2xl flex gap-6">
                            <ul className="space-y-3">
                                <li>
                                    <Link
                                        href="/"
                                        onClick={() => setIsOpen(false)}
                                        className={`${isHomeCurrent ? "text-[#7c6dff] font-extrabold" : "font-bold text-[#888] hover:text-white"} capitalize ${highlight === "home" ? highlightClass : ""}`}
                                    >
                                        Home
                                        {highlight === "home" && <NextBadge placement="inline" />}
                                    </Link>
                                </li>
                                {NAV_LINKS.map((link) => (
                                    <li key={link}>
                                        <Link
                                            href={`/${link}`}
                                            onClick={() => setIsOpen(false)}
                                            className={`${link === current ? "text-[#7c6dff] font-extrabold" : "font-bold text-[#888] hover:text-white"} capitalize ${highlight === link ? highlightClass : ""}`}
                                        >
                                            {link}
                                            {highlight === link && <NextBadge placement="inline" />}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </div>
                </section>
            </div>

            <TourToolbar />
        </div>
    )
}
