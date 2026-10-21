"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
    CONSENT_MAX_AGE_DAYS,
    CONSENT_STORAGE_KEY,
    CONSENT_VERSION,
    allowsAnalytics,
    consentCookieString,
    isCurrentConsent,
    parseConsent,
    readConsentFromCookieHeader,
    serializeConsent,
    type ConsentState,
} from "@/lib/consent"
import { randomId } from "@/lib/random-id"
import {
    TOUR_STEPS,
    clampStep,
    resolveTourIndex,
    upcomingPageChange,
    type NavKey,
    type TourStep,
} from "@/lib/tour"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModalMode = "onboarding" | "settings" | "reconsent"
export type ModalStep = "welcome" | "privacy" | "guide" | "tour"

export type TourView = {
    active: boolean
    index: number
    step: TourStep
    total: number
    /** Set when the next step is on another page — the navbar highlights this tab. */
    nextPage: TourStep | null
    /** Visitor wandered off the tour's pages (e.g. into a blog post). */
    offRoute: boolean
    highlightNav: NavKey | null
}

type OnboardingContextValue = {
    ready: boolean
    consent: ConsentState | null
    analyticsAllowed: boolean
    modal: { open: boolean; mode: ModalMode; step: ModalStep }
    goToStep: (step: ModalStep) => void
    closeModal: () => void
    openSettings: () => void
    saveConsent: (analytics: boolean) => void
    eraseMyData: () => Promise<number | null>
    tour: TourView
    startTour: () => void
    nextTourStep: () => void
    prevTourStep: () => void
    endTour: (completed: boolean) => void
    toast: string | null
    notify: (message: string) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOUR_STORAGE_KEY = "java_tour"
/** Pages where the intro modal never opens on its own. */
const NO_AUTO_MODAL_PREFIXES = ["/studio", "/logistics", "/privacy"]
/** PageTracker's device storage — cleared when analytics consent is withdrawn. */
const ANALYTICS_STORAGE = { local: ["_pv_seen"], session: ["_pv_sid"] }

const INACTIVE_TOUR: TourView = {
    active: false,
    index: 0,
    step: TOUR_STEPS[0],
    total: TOUR_STEPS.length,
    nextPage: null,
    offRoute: false,
    highlightNav: null,
}

const noop = () => {}

// Safe defaults so components (e.g. Navbar) also render outside the provider.
const OnboardingContext = createContext<OnboardingContextValue>({
    ready: false,
    consent: null,
    analyticsAllowed: false,
    modal: { open: false, mode: "onboarding", step: "welcome" },
    goToStep: noop,
    closeModal: noop,
    openSettings: noop,
    saveConsent: noop,
    eraseMyData: async () => null,
    tour: INACTIVE_TOUR,
    startTour: noop,
    nextTourStep: noop,
    prevTourStep: noop,
    endTour: noop,
    toast: null,
    notify: noop,
})

export const useOnboarding = () => useContext(OnboardingContext)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isExpired(state: ConsentState): boolean {
    return Date.now() - state.decidedAt > CONSENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
}

/** Cookie first (what the server enforces); localStorage mirror for cookie-blocking browsers. */
function loadStoredConsent(): ConsentState | null {
    const fromCookie = readConsentFromCookieHeader(document.cookie)
    if (fromCookie) return fromCookie
    let mirrored: ConsentState | null = null
    try { mirrored = parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY)) } catch { /* storage blocked */ }
    if (!mirrored || isExpired(mirrored)) return null
    persistConsent(mirrored) // restore the cookie so the server sees the same choice
    return mirrored
}

function persistConsent(state: ConsentState): void {
    document.cookie = consentCookieString(state, window.location.protocol === "https:")
    try { localStorage.setItem(CONSENT_STORAGE_KEY, decodeURIComponent(serializeConsent(state))) } catch { /* ignore */ }
}

function clearAnalyticsStorage(): void {
    try {
        ANALYTICS_STORAGE.local.forEach((k) => localStorage.removeItem(k))
        ANALYTICS_STORAGE.session.forEach((k) => sessionStorage.removeItem(k))
    } catch { /* ignore */ }
}

function loadTour(): { active: boolean; index: number } {
    try {
        const raw = JSON.parse(sessionStorage.getItem(TOUR_STORAGE_KEY) ?? "null") as { index?: unknown } | null
        if (raw && typeof raw.index === "number") return { active: true, index: clampStep(raw.index) }
    } catch { /* ignore */ }
    return { active: false, index: 0 }
}

function saveTour(state: { active: boolean; index: number }): void {
    try {
        if (state.active) sessionStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ index: state.index }))
        else sessionStorage.removeItem(TOUR_STORAGE_KEY)
    } catch { /* ignore */ }
}

function autoModalAllowed(pathname: string): boolean {
    return !NO_AUTO_MODAL_PREFIXES.some((p) => pathname.startsWith(p))
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() ?? "/"
    const router   = useRouter()

    const [ready, setReady]     = useState(false)
    const [consent, setConsent] = useState<ConsentState | null>(null)
    const [modal, setModal]     = useState<{ open: boolean; mode: ModalMode; step: ModalStep }>({
        open: false, mode: "onboarding", step: "welcome",
    })
    const [tourState, setTourState] = useState({ active: false, index: 0 })
    const [toast, setToast]         = useState<string | null>(null)

    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Latest tour state for event handlers/effects that shouldn't re-run on every step.
    const tourRef = useRef(tourState)
    useEffect(() => { tourRef.current = tourState }, [tourState])

    // Restore saved choices once, after hydration (deferred so setState isn't
    // called synchronously in the effect body).
    useEffect(() => {
        Promise.resolve()
            .then(() => ({ stored: loadStoredConsent(), tour: loadTour() }))
            .then(({ stored, tour }) => {
                setConsent(stored)
                setTourState(tour)
                setReady(true)
            })
    }, [])

    // First visit (or a policy update): open the intro. Pages like /privacy are
    // left readable; the modal opens once the visitor moves to a regular page.
    useEffect(() => {
        if (!ready || modal.open || isCurrentConsent(consent) || !autoModalAllowed(pathname)) return
        Promise.resolve().then(() => setModal(
            consent
                ? { open: true, mode: "reconsent", step: "privacy" } // known visitor, new policy
                : { open: true, mode: "onboarding", step: "welcome" }
        ))
    }, [ready, consent, pathname, modal.open])

    // Keep the stored tour step in sync with the page the visitor navigated to.
    useEffect(() => {
        const current = tourRef.current
        if (!current.active) return
        const resolved = resolveTourIndex(current.index, pathname)
        if (resolved.index !== current.index) {
            Promise.resolve().then(() => {
                const next = { active: true, index: resolved.index }
                setTourState(next)
                saveTour(next)
            })
        }
    }, [pathname])

    const notify = useCallback((message: string) => {
        setToast(message)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 4500)
    }, [])

    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

    // ── Modal ──
    const goToStep    = useCallback((step: ModalStep) => setModal((m) => ({ ...m, step })), [])
    const closeModal  = useCallback(() => setModal((m) => ({ ...m, open: false })), [])
    const openSettings = useCallback(() => setModal({ open: true, mode: "settings", step: "privacy" }), [])

    // ── Consent ──
    /** Store the choice (cookie + mirror), log a receipt, and apply it immediately. */
    const applyConsent = useCallback((analytics: boolean) => {
        const state: ConsentState = {
            version: CONSENT_VERSION,
            analytics,
            decidedAt: Date.now(),
            id: consent?.id ?? randomId(), // keep one id per browser across changes
        }
        persistConsent(state)
        if (!analytics) clearAnalyticsStorage()
        setConsent(state)

        // Consent receipt — fire-and-forget; the choice already applies locally
        // and is enforced server-side via the cookie.
        fetch("/api/consent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: state.id, analytics, version: CONSENT_VERSION }),
            keepalive: true,
        }).catch(() => { /* never block the visitor on logging */ })
    }, [consent])

    const saveConsent = useCallback((analytics: boolean) => {
        applyConsent(analytics)
        if (modal.mode === "onboarding") {
            setModal((m) => ({ ...m, step: "guide" }))
        } else {
            setModal((m) => ({ ...m, open: false }))
            notify("Privacy choices saved.")
        }
    }, [applyConsent, modal.mode, notify])

    const eraseMyData = useCallback(async (): Promise<number | null> => {
        applyConsent(false) // withdraw first so nothing new is recorded
        try {
            const res = await fetch("/api/consent", { method: "DELETE" })
            if (!res.ok) return null
            const data = (await res.json()) as { deleted?: number }
            return typeof data.deleted === "number" ? data.deleted : 0
        } catch {
            return null
        }
    }, [applyConsent])

    // ── Tour ──
    const setTour = useCallback((next: { active: boolean; index: number }) => {
        setTourState(next)
        saveTour(next)
    }, [])

    const startTour = useCallback(() => {
        setModal((m) => ({ ...m, open: false }))
        setTour({ active: true, index: 0 })
        if (pathname !== TOUR_STEPS[0].path) router.push(TOUR_STEPS[0].path)
    }, [pathname, router, setTour])

    const endTour = useCallback((completed: boolean) => {
        setTour({ active: false, index: 0 })
        notify(completed
            ? "Tour complete — replay it any time from the link at the bottom of the page."
            : "Tour closed. You can replay it from the link at the bottom of the page.")
    }, [notify, setTour])

    const resolved = resolveTourIndex(tourState.index, pathname)

    const nextTourStep = useCallback(() => {
        const { index, offRoute } = resolveTourIndex(tourRef.current.index, pathname)
        if (offRoute) {
            router.push(TOUR_STEPS[index].path)
            return
        }
        if (index >= TOUR_STEPS.length - 1) {
            endTour(true)
            return
        }
        const upcoming = upcomingPageChange(index)
        if (upcoming) router.push(upcoming.path) // the step advances when the page changes
        else setTour({ active: true, index: index + 1 })
    }, [endTour, pathname, router, setTour])

    const prevTourStep = useCallback(() => {
        const { index } = resolveTourIndex(tourRef.current.index, pathname)
        if (index === 0) return
        const prev = TOUR_STEPS[index - 1]
        setTour({ active: true, index: index - 1 })
        if (prev.path !== pathname) router.push(prev.path)
    }, [pathname, router, setTour])

    // Esc leaves the tour (unless the visitor is typing or a dialog is open).
    useEffect(() => {
        if (!tourState.active || modal.open) return
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null
            if (e.key !== "Escape" || el?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
            endTour(false)
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [tourState.active, modal.open, endTour])

    const tour: TourView = useMemo(() => {
        if (!tourState.active) return INACTIVE_TOUR
        const step = TOUR_STEPS[resolved.index]
        const nextPage = resolved.offRoute ? null : upcomingPageChange(resolved.index)
        return {
            active: true,
            index: resolved.index,
            step,
            total: TOUR_STEPS.length,
            nextPage,
            offRoute: resolved.offRoute,
            highlightNav: resolved.offRoute ? step.nav : nextPage?.nav ?? null,
        }
    }, [tourState.active, resolved.index, resolved.offRoute])

    const value = useMemo<OnboardingContextValue>(() => ({
        ready,
        consent,
        analyticsAllowed: allowsAnalytics(consent),
        modal,
        goToStep,
        closeModal,
        openSettings,
        saveConsent,
        eraseMyData,
        tour,
        startTour,
        nextTourStep,
        prevTourStep,
        endTour,
        toast,
        notify,
    }), [ready, consent, modal, goToStep, closeModal, openSettings, saveConsent, eraseMyData,
        tour, startTour, nextTourStep, prevTourStep, endTour, toast, notify])

    return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}
