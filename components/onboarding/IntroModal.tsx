"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { useOnboarding, type ModalStep } from "./OnboardingProvider"
import { useFocusTrap } from "./useFocusTrap"
import { ANALYTICS_DATA_POINTS, PRIVACY_POLICY_UPDATED } from "@/lib/consent"
import { navLabel, tourPages } from "@/lib/tour"
import {
    PreviewFrame,
    NavPreview,
    HomePreview,
    WorkPreview,
    AboutPreview,
    BlogPreview,
    ContactPreview,
    TourPreview,
} from "./SitePreviews"

const STEPS: { key: ModalStep; label: string }[] = [
    { key: "welcome", label: "Welcome" },
    { key: "privacy", label: "Privacy" },
    { key: "guide",   label: "Guide" },
    { key: "tour",    label: "Tour" },
]

const btnPrimary   = "inline-flex items-center justify-center gap-2 bg-[#7c6dff] hover:bg-[#6a5de8] text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#13121c]"
const btnSecondary = "inline-flex items-center justify-center gap-2 border border-[#3a3850] text-[#e8e6f0] hover:bg-[#1e1c2e] text-sm font-medium px-5 py-2.5 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
const btnGhost     = "inline-flex items-center justify-center gap-1 text-sm text-[#8a88a0] hover:text-[#e8e6f0] px-3 py-2.5 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"

// ─── Shell ────────────────────────────────────────────────────────────────────

export function IntroModal() {
    const { modal, closeModal, goToStep, saveConsent } = useOnboarding()
    const dialogRef = useRef<HTMLDivElement>(null)
    const titleId   = useId()
    const [skipRest, setSkipRest] = useState(false)

    // The visitor must make a privacy choice before the onboarding flow can close.
    const closable = modal.mode === "settings" || modal.step === "guide" || modal.step === "tour"

    useFocusTrap(dialogRef, modal.open)

    useEffect(() => {
        if (!modal.open) return
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && closable) closeModal() }
        document.addEventListener("keydown", onKey)
        return () => {
            document.body.style.overflow = prevOverflow
            document.removeEventListener("keydown", onKey)
        }
    }, [modal.open, closable, closeModal])

    // Announce each new step: move focus to its heading.
    useEffect(() => {
        if (!modal.open) return
        dialogRef.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true })
    }, [modal.open, modal.step])

    if (!modal.open) return null

    const onSaveConsent = (analytics: boolean) => {
        saveConsent(analytics)
        if (skipRest && modal.mode === "onboarding") closeModal()
    }

    const stepIndex = STEPS.findIndex((s) => s.key === modal.step)

    return (
        <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center sm:p-4">
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm motion-safe:animate-[intro-fade_.2s_ease-out]"
                aria-hidden="true"
                onClick={closable ? closeModal : undefined}
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="relative w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-none sm:h-[min(88vh,46rem)] flex flex-col bg-[#13121c] border border-[#2a2840] rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none motion-safe:animate-[intro-in_.25s_ease-out]"
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-4 px-5 sm:px-6 pt-4 pb-3 border-b border-[#1e1c2e] shrink-0">
                    <span className="text-sm font-bold text-[#f0eeff]">
                        JAVA<span className="text-[#7c6dff]">.dev</span>
                    </span>
                    {modal.mode === "onboarding" ? (
                        <ol className="flex items-center gap-1.5 sm:gap-3" aria-label="Introduction progress">
                            {STEPS.map((s, i) => (
                                <li key={s.key} className="flex items-center gap-1.5" aria-current={i === stepIndex ? "step" : undefined}>
                                    <span
                                        className={`w-2 h-2 rounded-full transition-colors ${i < stepIndex ? "bg-emerald-400" : i === stepIndex ? "bg-[#7c6dff]" : "bg-[#2a2840]"}`}
                                        aria-hidden="true"
                                    />
                                    <span className={`hidden sm:inline text-[11px] ${i === stepIndex ? "text-[#e8e6f0]" : "text-[#555370]"}`}>
                                        {s.label}
                                        <span className="sr-only">{i < stepIndex ? " (done)" : i === stepIndex ? " (current)" : ""}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <span className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium">
                            {modal.mode === "reconsent" ? "Privacy update" : "Privacy settings"}
                        </span>
                    )}
                    {closable ? (
                        <button type="button" onClick={closeModal} aria-label="Close" className="p-1.5 rounded-lg text-[#555370] hover:text-[#f0eeff] hover:bg-[#1e1c2e] transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    ) : <span className="w-7" aria-hidden="true" />}
                </div>

                {modal.step === "welcome" && (
                    <WelcomeStep
                        titleId={titleId}
                        onNext={() => goToStep("privacy")}
                        onSkip={() => { setSkipRest(true); goToStep("privacy") }}
                    />
                )}
                {modal.step === "privacy" && <PrivacyStep titleId={titleId} onSave={onSaveConsent} />}
                {modal.step === "guide" && (
                    <GuideStep titleId={titleId} onBack={() => goToStep("privacy")} onNext={() => goToStep("tour")} />
                )}
                {modal.step === "tour" && <TourOfferStep titleId={titleId} onBack={() => goToStep("guide")} />}
            </div>
        </div>
    )
}

// ─── Shared step layout ───────────────────────────────────────────────────────

function StepBody({ children }: { children: React.ReactNode }) {
    return <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5">{children}</div>
}

function StepFooter({ children }: { children: React.ReactNode }) {
    return (
        <div className="shrink-0 border-t border-[#1e1c2e] px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            {children}
        </div>
    )
}

function StepHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: React.ReactNode }) {
    return (
        <div className="mb-5">
            <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">{eyebrow}</p>
            <h2 id={id} data-step-heading tabIndex={-1} className="font-syne font-extrabold text-2xl sm:text-3xl text-[#f0eeff] tracking-tight leading-tight outline-none">
                {title}
            </h2>
            {children && <div className="text-sm text-[#8a88a0] leading-relaxed mt-2 max-w-xl">{children}</div>}
        </div>
    )
}

// ─── 1. Welcome ───────────────────────────────────────────────────────────────

function WelcomeStep({ titleId, onNext, onSkip }: { titleId: string; onNext: () => void; onSkip: () => void }) {
    const highlights = [
        { icon: "🧩", title: "Projects", body: "Live apps, games, and experiments you can open and try." },
        { icon: "✍️", title: "Writing",  body: "Dev notes and write-ups from the things I build." },
        { icon: "💬", title: "Get in touch", body: "Open to remote, freelance, and full-time work." },
    ]
    return (
        <>
            <StepBody>
                <StepHeading id={titleId} eyebrow="Welcome" title="Welcome to JAVA.dev">
                    This is the portfolio of <span className="text-[#e8e6f0]">Jorge Alejandro Vilanova Alvarado</span>, a full-stack
                    developer in California. It takes about a minute to get set up.
                </StepHeading>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    {highlights.map((h) => (
                        <div key={h.title} className="bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4">
                            <span className="text-2xl" aria-hidden="true">{h.icon}</span>
                            <p className="text-sm font-semibold text-[#e8e6f0] mt-2">{h.title}</p>
                            <p className="text-xs text-[#8a88a0] leading-relaxed mt-1">{h.body}</p>
                        </div>
                    ))}
                </div>

                <div className="bg-[#16152a] border border-[#2a2840] rounded-xl p-4">
                    <p className="text-xs font-semibold text-[#AFA9EC] uppercase tracking-widest mb-2">What&apos;s next</p>
                    <ol className="text-sm text-[#8a88a0] space-y-1.5 list-decimal list-inside">
                        <li><span className="text-[#e8e6f0]">Privacy</span>: choose whether to allow analytics</li>
                        <li><span className="text-[#e8e6f0]">Guide</span>: a quick look at how the site is organized</li>
                        <li><span className="text-[#e8e6f0]">Tour</span>: an optional walkthrough of every page</li>
                    </ol>
                </div>
            </StepBody>
            <StepFooter>
                <button type="button" onClick={onSkip} className={btnGhost}>Skip intro</button>
                <button type="button" onClick={onNext} className={btnPrimary}>Get started →</button>
            </StepFooter>
        </>
    )
}

// ─── 2. Privacy (also used for "Cookie settings") ─────────────────────────────

function PrivacyStep({ titleId, onSave }: { titleId: string; onSave: (analytics: boolean) => void }) {
    const { modal, consent, closeModal, eraseMyData } = useOnboarding()
    const [analyticsOn, setAnalyticsOn] = useState(consent?.analytics ?? false)
    const [eraseState, setEraseState]   = useState<"idle" | "confirm" | "working" | "done" | "error">("idle")
    const [erased, setErased]           = useState(0)
    const switchLabelId = useId()

    const settings = modal.mode === "settings"

    const erase = async () => {
        if (eraseState !== "confirm") { setEraseState("confirm"); return }
        setEraseState("working")
        const count = await eraseMyData()
        if (count === null) { setEraseState("error"); return }
        setErased(count)
        setAnalyticsOn(false)
        setEraseState("done")
    }

    return (
        <>
            <StepBody>
                <StepHeading
                    id={titleId}
                    eyebrow={modal.mode === "reconsent" ? "Privacy policy updated" : "Privacy"}
                    title={settings ? "Your privacy settings" : "Your privacy, your choice"}
                >
                    I use cookies and similar browser storage for two things. Necessary storage keeps the site working and is
                    always on. Analytics is optional and <span className="text-[#e8e6f0]">off unless you turn it on</span>.
                </StepHeading>

                {settings && consent && (
                    <p className="text-xs text-[#8a88a0] mb-4" role="status">
                        Current choice: <span className="text-[#e8e6f0]">analytics {consent.analytics ? "on" : "off"}</span>, saved{" "}
                        {new Date(consent.decidedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                )}

                <div className="space-y-3">
                    {/* Necessary */}
                    <section className="bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4" aria-labelledby={`${switchLabelId}-necessary`}>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                            <h3 id={`${switchLabelId}-necessary`} className="text-sm font-semibold text-[#e8e6f0]">Strictly necessary</h3>
                            <span className="text-[10px] uppercase tracking-widest text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">Always on</span>
                        </div>
                        <p className="text-xs text-[#8a88a0] leading-relaxed">
                            Remembers this privacy choice and your place in the guided tour, and keeps the admin area signed in.
                            Never used to track you.
                        </p>
                    </section>

                    {/* Analytics */}
                    <section className="bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                            <h3 id={switchLabelId} className="text-sm font-semibold text-[#e8e6f0]">Analytics</h3>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={analyticsOn}
                                aria-labelledby={switchLabelId}
                                onClick={() => setAnalyticsOn((v) => !v)}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 ${analyticsOn ? "bg-[#7c6dff]" : "bg-[#2a2840]"}`}
                            >
                                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${analyticsOn ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                        </div>
                        <p className="text-xs text-[#8a88a0] leading-relaxed mb-3">
                            Helps me see which pages are useful and fix what isn&apos;t. If you allow it, each page you view records:
                        </p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                            {ANALYTICS_DATA_POINTS.map((d) => (
                                <div key={d.label}>
                                    <dt className="text-xs font-medium text-[#c4c0d8]">{d.label}</dt>
                                    <dd className="text-[11px] text-[#8a88a0] leading-snug">{d.detail}</dd>
                                </div>
                            ))}
                        </dl>
                        <p className="text-[11px] text-[#8a88a0] mt-3">
                            Stored in my own database (Supabase). Never sold, and never shared with advertisers.
                        </p>
                    </section>

                    {settings && consent && (
                        <section className="bg-[#1a1216] border border-[#2e1f28] rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-pink-200 mb-1">Delete my analytics data</h3>
                            <p className="text-xs text-[#8a88a0] leading-relaxed mb-3">
                                Removes the page views recorded for this browser and turns analytics off.
                            </p>
                            {eraseState === "done" ? (
                                <p className="text-xs text-emerald-400" role="status">
                                    Done. {erased} record{erased === 1 ? "" : "s"} deleted and analytics turned off.
                                </p>
                            ) : (
                                <button
                                    type="button"
                                    onClick={erase}
                                    disabled={eraseState === "working"}
                                    className="text-xs px-3 py-1.5 rounded-lg border border-pink-400/30 text-pink-400 hover:bg-pink-400/10 disabled:opacity-40 transition-colors"
                                >
                                    {eraseState === "confirm" ? "Click again to permanently delete" : eraseState === "working" ? "Deleting…" : "Delete my data"}
                                </button>
                            )}
                            {eraseState === "error" && <p className="text-xs text-pink-400 mt-2" role="alert">Couldn&apos;t delete right now. Please try again.</p>}
                        </section>
                    )}
                </div>

                <p className="text-xs text-[#555370] mt-4">
                    Policy updated {PRIVACY_POLICY_UPDATED}.{" "}
                    <Link href="/privacy" onClick={closeModal} className="text-[#AFA9EC] hover:text-[#f0eeff] underline underline-offset-2">
                        Read the full privacy policy
                    </Link>
                    . You can change this any time from <span className="text-[#8a88a0]">Cookie settings</span> at the bottom of every page.
                </p>
            </StepBody>
            <StepFooter>
                {settings ? (
                    <>
                        <button type="button" onClick={closeModal} className={btnGhost}>Cancel</button>
                        <button type="button" onClick={() => onSave(analyticsOn)} className={btnPrimary}>Save choices</button>
                    </>
                ) : (
                    <>
                        <button type="button" onClick={() => onSave(analyticsOn)} className={btnGhost}>
                            Save my choices
                        </button>
                        <div className="flex flex-col-reverse sm:flex-row gap-2">
                            <button type="button" onClick={() => onSave(false)} className={btnSecondary}>Necessary only</button>
                            <button type="button" onClick={() => onSave(true)} className={btnPrimary}>Accept all</button>
                        </div>
                    </>
                )}
            </StepFooter>
        </>
    )
}

// ─── 3. Guide ─────────────────────────────────────────────────────────────────

type GuideSection = {
    key: string
    label: string
    path: string
    preview: React.ReactNode
    how: string
    tips: string[]
}

const GUIDE: GuideSection[] = [
    {
        key: "nav", label: "Navigation", path: "/",
        preview: <NavPreview />,
        how: "The navigation bar sits at the top of every page.",
        tips: [
            "Click a section name (Work, About, Blog, Contact) to jump there.",
            "The JAVA.dev logo always brings you back home.",
            "On a phone, tap the ☰ menu button to open the same links.",
            "Links at the bottom of every page let you change privacy settings or replay the tour.",
        ],
    },
    {
        key: "home", label: "Home", path: "/",
        preview: <HomePreview />,
        how: "Click the JAVA.dev logo.",
        tips: [
            "Read the one-screen summary of who I am and what I'm focused on.",
            "Use “View Resume” in the violet card to download my résumé as a PDF.",
            "Click any project tile to open that project in a new tab.",
        ],
    },
    {
        key: "work", label: "Work", path: "/work",
        preview: <WorkPreview />,
        how: "Click “Work” in the navigation bar.",
        tips: [
            "Use the filter buttons to show games, APIs, UI/UX, or full-stack projects.",
            "Each card shows the tech stack and whether it's live, in progress, or planned.",
            "Click “View Project →” to open a live project.",
        ],
    },
    {
        key: "about", label: "About", path: "/about",
        preview: <AboutPreview />,
        how: "Click “About” in the navigation bar.",
        tips: [
            "Scroll the timeline to follow my path from 2020 to today.",
            "See the tech I use most, and what I do away from the keyboard.",
        ],
    },
    {
        key: "blog", label: "Blog", path: "/blog",
        preview: <BlogPreview />,
        how: "Click “Blog” in the navigation bar.",
        tips: [
            "Click a post to read it in a quick pop-up.",
            "Choose “Open full page” to get a link you can share.",
            "Code blocks have a Copy button.",
        ],
    },
    {
        key: "contact", label: "Contact", path: "/contact",
        preview: <ContactPreview />,
        how: "Click “Contact” in the navigation bar.",
        tips: [
            "“Copy Email” puts my address on your clipboard.",
            "The message form opens in your email app, ready to send.",
            "Links to GitHub, LinkedIn, and more are on the same page.",
        ],
    },
]

function GuideStep({ titleId, onBack, onNext }: { titleId: string; onBack: () => void; onNext: () => void }) {
    const [active, setActive] = useState(0)
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
    const baseId = useId()
    const section = GUIDE[active]

    // Roving focus between tabs with the arrow keys (WAI-ARIA tabs pattern).
    const onTabKey = (e: React.KeyboardEvent, i: number) => {
        const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
        if (e.key === "Home" || e.key === "End" || delta !== 0) {
            e.preventDefault()
            const next = e.key === "Home" ? 0 : e.key === "End" ? GUIDE.length - 1 : (i + delta + GUIDE.length) % GUIDE.length
            setActive(next)
            tabRefs.current[next]?.focus()
        }
    }

    return (
        <>
            <StepBody>
                <StepHeading id={titleId} eyebrow="Guide" title="How to use this site">
                    Here&apos;s where everything lives. The previews below are built from the site&apos;s own components.
                </StepHeading>

                <div className="flex flex-col md:flex-row gap-4">
                    <div role="tablist" aria-label="Site sections" aria-orientation="vertical" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:w-40 shrink-0 -mx-1 px-1 pb-1 md:pb-0">
                        {GUIDE.map((s, i) => (
                            <button
                                key={s.key}
                                ref={(el) => { tabRefs.current[i] = el }}
                                type="button"
                                role="tab"
                                id={`${baseId}-tab-${s.key}`}
                                aria-selected={i === active}
                                aria-controls={`${baseId}-panel`}
                                tabIndex={i === active ? 0 : -1}
                                onClick={() => setActive(i)}
                                onKeyDown={(e) => onTabKey(e, i)}
                                className={`shrink-0 text-left text-sm px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 ${i === active ? "bg-[#7c6dff] text-white" : "text-[#8a88a0] hover:text-[#e8e6f0] hover:bg-[#1e1c2e]"}`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <div
                        role="tabpanel"
                        id={`${baseId}-panel`}
                        aria-labelledby={`${baseId}-tab-${section.key}`}
                        className="flex-1 min-w-0 space-y-3"
                    >
                        <PreviewFrame path={section.path}>{section.preview}</PreviewFrame>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-[#555370] mb-1">How to get there</p>
                            <p className="text-sm text-[#e8e6f0]">{section.how}</p>
                        </div>
                        <ul className="space-y-1.5">
                            {section.tips.map((t) => (
                                <li key={t} className="flex gap-2 text-sm text-[#8a88a0] leading-relaxed">
                                    <span className="text-[#7c6dff] shrink-0" aria-hidden="true">→</span>
                                    <span>{t}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </StepBody>
            <StepFooter>
                <button type="button" onClick={onBack} className={btnGhost}>← Privacy settings</button>
                <button type="button" onClick={onNext} className={btnPrimary}>Continue →</button>
            </StepFooter>
        </>
    )
}

// ─── 4. Tour offer ────────────────────────────────────────────────────────────

function TourOfferStep({ titleId, onBack }: { titleId: string; onBack: () => void }) {
    const { startTour, closeModal, notify } = useOnboarding()
    const pages = tourPages()

    const decline = () => {
        closeModal()
        notify("Enjoy exploring! The tour is always available at the bottom of the page.")
    }

    return (
        <>
            <StepBody>
                <StepHeading id={titleId} eyebrow="Guided tour" title="Want a quick walkthrough?">
                    I&apos;ll take you through every page. A guide bar under the navigation explains each one and highlights
                    the next tab to click. It takes about a minute, and you can leave any time with{" "}
                    <kbd className="text-[11px] px-1.5 py-0.5 rounded border border-[#2a2840] bg-[#0d0c14] text-[#c4c0d8]">Esc</kbd>.
                </StepHeading>

                <ol className="flex flex-wrap items-center gap-2 mb-5" aria-label="Tour route">
                    {pages.map((p, i) => (
                        <li key={p} className="flex items-center gap-2">
                            <span className="text-xs px-3 py-1.5 rounded-full border border-[#2a2840] text-[#c4c0d8]">{navLabel(p)}</span>
                            {i < pages.length - 1 && <span className="text-[#555370]" aria-hidden="true">→</span>}
                        </li>
                    ))}
                </ol>

                <PreviewFrame path="/">
                    <TourPreview />
                </PreviewFrame>
            </StepBody>
            <StepFooter>
                <button type="button" onClick={onBack} className={btnGhost}>← Back to the guide</button>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <button type="button" onClick={decline} className={btnSecondary}>No thanks, I&apos;ll explore</button>
                    <button type="button" onClick={startTour} className={btnPrimary} data-autofocus>Start the tour →</button>
                </div>
            </StepFooter>
        </>
    )
}
