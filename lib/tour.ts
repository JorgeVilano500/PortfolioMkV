/**
 * Guided tour definition — pure data + navigation helpers (no React), so it
 * can be unit-tested and edited without touching UI code.
 *
 * Each step lives on one page (`path`). Steps with a `target` spotlight the
 * element marked `data-tour="<target>"` on that page. When the next step is on
 * a different page, the navbar highlights that page's tab (`nav`).
 *
 * Adding a step: add it here, then put the matching `data-tour` attribute on
 * the element. A missing target is harmless — the step just shows no spotlight.
 */

export type NavKey = "home" | "work" | "about" | "blog" | "contact"

export type TourStep = {
    id: string
    path: string
    nav: NavKey
    title: string
    body: string
    /** Value of a `data-tour` attribute on this page to spotlight. */
    target?: string
}

export const NAV_ITEMS: { key: NavKey; label: string; href: string }[] = [
    { key: "home",    label: "Home",    href: "/" },
    { key: "work",    label: "Work",    href: "/work" },
    { key: "about",   label: "About",   href: "/about" },
    { key: "blog",    label: "Blog",    href: "/blog" },
    { key: "contact", label: "Contact", href: "/contact" },
]

export const TOUR_STEPS: TourStep[] = [
    {
        id: "home-hero",
        path: "/", nav: "home",
        title: "Welcome to Home",
        body: "Home is the one-screen overview: who I am, what I'm focused on right now, and quick links to everything else.",
        target: "home-hero",
    },
    {
        id: "home-resume",
        path: "/", nav: "home",
        title: "Grab the résumé",
        body: "The violet card shows what I'm currently focused on. Use “View Resume” to download a PDF copy.",
        target: "home-resume",
    },
    {
        id: "home-projects",
        path: "/", nav: "home",
        title: "Projects at a glance",
        body: "Each tile is a live project — click one to open it in a new tab. When there are more than fit, “+ More” opens the full list.",
        target: "home-projects",
    },
    {
        id: "work-filters",
        path: "/work", nav: "work",
        title: "Work — everything I've built",
        body: "Filter projects by type: games, APIs, UI/UX, or full-stack apps. The grid updates instantly.",
        target: "work-filters",
    },
    {
        id: "work-grid",
        path: "/work", nav: "work",
        title: "Project cards",
        body: "The large card is the featured project. Every card shows its stack, its status (live, in progress, planned), and a link to view it.",
        target: "work-grid",
    },
    {
        id: "about-timeline",
        path: "/about", nav: "about",
        title: "About — the journey so far",
        body: "My story from 2020 to today, the tech I use most, and what I do when I'm not coding.",
        target: "about-timeline",
    },
    {
        id: "blog-posts",
        path: "/blog", nav: "blog",
        title: "Blog — notes & write-ups",
        body: "Click any post for a quick read in a pop-up, or open it as a full page to share the link.",
        target: "blog-posts",
    },
    {
        id: "contact-email",
        path: "/contact", nav: "contact",
        title: "Contact — let's talk",
        body: "Copy my email in one click, or find me on GitHub, LinkedIn, and more.",
        target: "contact-email",
    },
    {
        id: "contact-form",
        path: "/contact", nav: "contact",
        title: "Send a message",
        body: "Write a quick note here — it opens in your email app, ready to send.",
        target: "contact-form",
    },
    {
        id: "done",
        path: "/contact", nav: "contact",
        title: "You're all set",
        body: "That's the whole site. You can replay this tour or change your privacy choices any time from the links at the bottom of every page.",
    },
]

export function clampStep(index: number): number {
    return Math.min(Math.max(0, Math.trunc(index)), TOUR_STEPS.length - 1)
}

/** First step that lives on `path`, or -1. */
export function firstStepForPath(path: string): number {
    return TOUR_STEPS.findIndex((s) => s.path === path)
}

/** The step after `index` if it lives on a different page — i.e. the user must navigate. */
export function upcomingPageChange(index: number): TourStep | null {
    const current = TOUR_STEPS[index]
    const next = TOUR_STEPS[index + 1]
    if (!current || !next) return null
    return next.path !== current.path ? next : null
}

/**
 * Which step to show for the page the visitor is actually on.
 *  - On the current step's page → that step.
 *  - On the page of the upcoming step (they clicked the highlighted tab) → advance.
 *  - On another tour page (they jumped ahead/back via the navbar) → that page's first step.
 *  - Anywhere else (a blog post, an admin page) → keep the step, flag `offRoute`
 *    so the toolbar can offer a way back.
 */
export function resolveTourIndex(index: number, pathname: string): { index: number; offRoute: boolean } {
    const i = clampStep(index)
    if (TOUR_STEPS[i].path === pathname) return { index: i, offRoute: false }
    const upcoming = upcomingPageChange(i)
    if (upcoming && upcoming.path === pathname) return { index: i + 1, offRoute: false }
    const first = firstStepForPath(pathname)
    if (first !== -1) return { index: first, offRoute: false }
    return { index: i, offRoute: true }
}

export function navLabel(key: NavKey): string {
    return NAV_ITEMS.find((n) => n.key === key)?.label ?? key
}

/** Number of distinct pages the tour visits, in order. */
export function tourPages(): NavKey[] {
    const seen: NavKey[] = []
    for (const s of TOUR_STEPS) if (!seen.includes(s.nav)) seen.push(s.nav)
    return seen
}
