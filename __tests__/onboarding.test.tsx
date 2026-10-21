/** @jest-environment jsdom */
/**
 * First-visit onboarding, end to end in a DOM: intro modal → privacy choice →
 * guide → tour offer, consent persistence, returning visitors, policy
 * re-consent, Cookie settings / erasure, and the guided tour's navbar
 * highlight + toolbar across page changes.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider"
import { IntroModal } from "@/components/onboarding/IntroModal"
import { SiteFooter } from "@/components/onboarding/SiteFooter"
import { Toast } from "@/components/onboarding/Toast"
import { Navbar } from "@/components/ui/Navbar"
import {
    CONSENT_COOKIE,
    CONSENT_VERSION,
    readConsentFromCookieHeader,
    serializeConsent,
} from "@/lib/consent"
import { TOUR_STEPS } from "@/lib/tour"

// ─── Next.js mocks ────────────────────────────────────────────────────────────

let mockPathname = "/"
const mockPush = jest.fn()

jest.mock("next/navigation", () => ({
    usePathname: () => mockPathname,
    useRouter: () => ({ push: mockPush, replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
}))

// A plain <a> that doesn't navigate (jsdom has no router).
jest.mock("next/link", () => {
    const { createElement } = jest.requireActual("react")
    return {
        __esModule: true,
        default: ({ children, onClick, ...rest }: { children?: unknown; onClick?: (e: unknown) => void }) =>
            createElement("a", {
                ...rest,
                onClick: (e: { preventDefault: () => void }) => { e.preventDefault(); onClick?.(e) },
            }, children),
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetchMock = jest.fn()

function App({ page = "/" }: { page?: string }) {
    return (
        <OnboardingProvider>
            <Navbar currentLink={page === "/" ? "/" : page.slice(1)} />
            <SiteFooter />
            <IntroModal />
            <Toast />
        </OnboardingProvider>
    )
}

function storedConsent() {
    return readConsentFromCookieHeader(document.cookie)
}

function setConsentCookie(analytics: boolean, version = CONSENT_VERSION) {
    const value = serializeConsent({ version, analytics, decidedAt: Date.now(), id: "7d3f4b2a-1c9e-4f60-8a1b-2c3d4e5f6a7b" })
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/`
}

function consentPosts() {
    return fetchMock.mock.calls.filter(([url, init]) => url === "/api/consent" && (init?.method ?? "GET") === "POST")
}

async function openPrivacyStep() {
    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: "Get started →" }))
    await screen.findByRole("heading", { name: "Your privacy, your choice" })
}

beforeEach(() => {
    mockPathname = "/"
    mockPush.mockReset()
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`
    localStorage.clear()
    sessionStorage.clear()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, deleted: 3 }) })
    global.fetch = fetchMock as unknown as typeof fetch
})

// ─── First visit ──────────────────────────────────────────────────────────────

describe("first visit", () => {
    it("opens the intro automatically with a welcome step", async () => {
        render(<App />)
        const dialog = await screen.findByRole("dialog", { name: "Welcome to JAVA.dev" })
        expect(within(dialog).getByText(/Jorge Alejandro Vilanova Alvarado/)).toBeTruthy()
    })

    it("can't be dismissed before a privacy choice is made", async () => {
        await openPrivacyStep()
        expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
        fireEvent.keyDown(document, { key: "Escape" })
        expect(screen.getByRole("dialog")).toBeTruthy()
    })

    it("offers rejecting as prominently as accepting, and discloses what analytics collects", async () => {
        await openPrivacyStep()
        expect(screen.getByRole("button", { name: "Necessary only" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Accept all" })).toBeTruthy()
        for (const label of ["IP address", "Browser & device", "Language & timezone", "Pages & referrer", "Visitor ID"]) {
            expect(screen.getByText(label)).toBeTruthy()
        }
        // analytics are off by default
        expect(screen.getByRole("switch", { name: "Analytics" }).getAttribute("aria-checked")).toBe("false")
    })

    it("Accept all stores an analytics opt-in, logs a receipt, and moves on to the guide", async () => {
        await openPrivacyStep()
        fireEvent.click(screen.getByRole("button", { name: "Accept all" }))

        await screen.findByRole("heading", { name: "How to use this site" })
        const consent = storedConsent()
        expect(consent).toMatchObject({ analytics: true, version: CONSENT_VERSION })

        const [, init] = consentPosts()[0]
        expect(JSON.parse(init.body)).toEqual({ id: consent!.id, analytics: true, version: CONSENT_VERSION })
    })

    it("Necessary only stores an opt-out", async () => {
        await openPrivacyStep()
        fireEvent.click(screen.getByRole("button", { name: "Necessary only" }))
        await screen.findByRole("heading", { name: "How to use this site" })
        expect(storedConsent()).toMatchObject({ analytics: false })
    })

    it("Save my choices respects the analytics switch", async () => {
        await openPrivacyStep()
        fireEvent.click(screen.getByRole("switch", { name: "Analytics" }))
        fireEvent.click(screen.getByRole("button", { name: "Save my choices" }))
        await screen.findByRole("heading", { name: "How to use this site" })
        expect(storedConsent()).toMatchObject({ analytics: true })
    })

    it("Skip intro still asks for consent, then closes without the guide", async () => {
        render(<App />)
        fireEvent.click(await screen.findByRole("button", { name: "Skip intro" }))
        fireEvent.click(await screen.findByRole("button", { name: "Necessary only" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(storedConsent()).toMatchObject({ analytics: false })
    })
})

// ─── Guide + tour offer ───────────────────────────────────────────────────────

describe("guide and tour offer", () => {
    async function openGuide() {
        await openPrivacyStep()
        fireEvent.click(screen.getByRole("button", { name: "Accept all" }))
        await screen.findByRole("heading", { name: "How to use this site" })
    }

    it("explains each section with a live preview, switchable by click or arrow keys", async () => {
        await openGuide()
        const tabs = screen.getAllByRole("tab")
        expect(tabs.map((t) => t.textContent)).toEqual(["Navigation", "Home", "Work", "About", "Blog", "Contact"])

        fireEvent.click(screen.getByRole("tab", { name: "Work" }))
        expect(screen.getByText("Click “Work” in the navigation bar.")).toBeTruthy()
        expect(screen.getByRole("figure", { name: "Preview of /work" })).toBeTruthy()

        fireEvent.keyDown(screen.getByRole("tab", { name: "Work" }), { key: "ArrowRight" })
        expect(screen.getByRole("tab", { name: "About" }).getAttribute("aria-selected")).toBe("true")
    })

    it("is dismissable after the privacy choice", async () => {
        await openGuide()
        fireEvent.keyDown(document, { key: "Escape" })
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    })

    it("declining the tour closes the intro for good", async () => {
        await openGuide()
        fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
        fireEvent.click(await screen.findByRole("button", { name: "No thanks, I'll explore" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(await screen.findByText(/Enjoy exploring/)).toBeTruthy()
    })
})

// ─── Returning visitors ───────────────────────────────────────────────────────

describe("returning visitors", () => {
    it("are not asked again (no intro, no tour offer)", async () => {
        setConsentCookie(true)
        render(<App />)
        await act(async () => { await Promise.resolve() })
        await act(async () => { await Promise.resolve() })
        expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("are asked only for consent again when the policy version changes", async () => {
        setConsentCookie(true, CONSENT_VERSION + 1)
        render(<App />)
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).getByText("Privacy update")).toBeTruthy()
        fireEvent.click(within(dialog).getByRole("button", { name: "Necessary only" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(storedConsent()).toMatchObject({ version: CONSENT_VERSION, analytics: false })
    })

    it("restore the choice from the localStorage mirror if the cookie is gone", async () => {
        const value = serializeConsent({ version: CONSENT_VERSION, analytics: true, decidedAt: Date.now(), id: "7d3f4b2a-1c9e-4f60-8a1b-2c3d4e5f6a7b" })
        localStorage.setItem(CONSENT_COOKIE, decodeURIComponent(value))
        render(<App />)
        await waitFor(() => expect(storedConsent()).toMatchObject({ analytics: true }))
        expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("don't see the intro on /privacy (so the policy stays readable)", async () => {
        mockPathname = "/privacy"
        render(<App page="/privacy" />)
        await act(async () => { await Promise.resolve() })
        await act(async () => { await Promise.resolve() })
        expect(screen.queryByRole("dialog")).toBeNull()
    })
})

// ─── Cookie settings ──────────────────────────────────────────────────────────

describe("cookie settings (footer)", () => {
    it("shows the current choice and saves a change", async () => {
        setConsentCookie(true)
        render(<App />)
        fireEvent.click(await screen.findByRole("button", { name: "Cookie settings" }))

        const dialog = await screen.findByRole("dialog", { name: "Your privacy settings" })
        expect(within(dialog).getByText(/analytics on/)).toBeTruthy()

        fireEvent.click(within(dialog).getByRole("switch", { name: "Analytics" }))
        fireEvent.click(within(dialog).getByRole("button", { name: "Save choices" }))

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(storedConsent()).toMatchObject({ analytics: false })
        expect(await screen.findByText("Privacy choices saved.")).toBeTruthy()
    })

    it("erases this browser's analytics after a confirmation click", async () => {
        setConsentCookie(true)
        render(<App />)
        fireEvent.click(await screen.findByRole("button", { name: "Cookie settings" }))

        fireEvent.click(await screen.findByRole("button", { name: "Delete my data" }))
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false)
        fireEvent.click(screen.getByRole("button", { name: "Click again to permanently delete" }))

        expect(await screen.findByText(/3 records deleted/)).toBeTruthy()
        expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/consent" && init?.method === "DELETE")).toBe(true)
        expect(storedConsent()).toMatchObject({ analytics: false })
    })
})

// ─── Guided tour ──────────────────────────────────────────────────────────────

describe("guided tour", () => {
    async function startTourFromIntro() {
        await openPrivacyStep()
        fireEvent.click(screen.getByRole("button", { name: "Accept all" }))
        fireEvent.click(await screen.findByRole("button", { name: "Continue →" }))
        fireEvent.click(await screen.findByRole("button", { name: "Start the tour →" }))
        return screen.findByRole("region", { name: "Guided tour" })
    }

    it("shows the tour bar under the navbar, starting on Home", async () => {
        const bar = await startTourFromIntro()
        expect(screen.queryByRole("dialog")).toBeNull()
        expect(within(bar).getByText(`Guided tour · Step 1 of ${TOUR_STEPS.length}`)).toBeTruthy()
        expect(within(bar).getByRole("heading", { name: TOUR_STEPS[0].title })).toBeTruthy()
        expect(mockPush).not.toHaveBeenCalled() // already on Home
    })

    it("highlights the next tab before a page change, then advances when that page opens", async () => {
        // A returning visitor starts the tour from the footer; the provider
        // (root layout) stays mounted across navigations, like in the app.
        setConsentCookie(true)
        const { rerender } = render(<App />)
        fireEvent.click(await screen.findByRole("button", { name: "Take the tour" }))
        const bar = await screen.findByRole("region", { name: "Guided tour" })

        const lastHome = TOUR_STEPS.filter((s) => s.path === "/").length - 1
        for (let i = 0; i < lastHome; i++) fireEvent.click(within(bar).getByRole("button", { name: "Next →" }))

        expect(within(bar).getByText(/Next stop: Work\./)).toBeTruthy()
        const workLink = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/work")!
        expect(workLink.textContent).toContain("Next")
        expect(workLink.textContent).toContain("(next stop on the guided tour)")

        fireEvent.click(within(bar).getByRole("button", { name: "Go to Work →" }))
        expect(mockPush).toHaveBeenCalledWith("/work")

        // The router navigates; the page re-renders at /work.
        mockPathname = "/work"
        rerender(<App page="/work" />)
        const workBar = await screen.findByRole("region", { name: "Guided tour" })
        await waitFor(() =>
            expect(within(workBar).getByRole("heading", { name: TOUR_STEPS[lastHome + 1].title })).toBeTruthy()
        )
        expect(within(workBar).getByText(`Guided tour · Step ${lastHome + 2} of ${TOUR_STEPS.length}`)).toBeTruthy()
    })

    it("walks every step to the end and finishes", async () => {
        setConsentCookie(true)
        const { rerender } = render(<App />)
        fireEvent.click(await screen.findByRole("button", { name: "Take the tour" }))

        for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
            const bar = await screen.findByRole("region", { name: "Guided tour" })
            await waitFor(() => expect(within(bar).getByRole("heading", { name: TOUR_STEPS[i].title })).toBeTruthy())
            const next = TOUR_STEPS[i + 1]
            if (next.path !== TOUR_STEPS[i].path) {
                fireEvent.click(within(bar).getByRole("button", { name: /^Go to / }))
                mockPathname = next.path
                rerender(<App page={next.path} />)
            } else {
                fireEvent.click(within(bar).getByRole("button", { name: "Next →" }))
            }
        }

        const bar = await screen.findByRole("region", { name: "Guided tour" })
        fireEvent.click(within(bar).getByRole("button", { name: "Finish" }))
        await waitFor(() => expect(screen.queryByRole("region", { name: "Guided tour" })).toBeNull())
        expect(await screen.findByText(/Tour complete/)).toBeTruthy()
    })

    it("resumes from where it was after a reload", async () => {
        sessionStorage.setItem("java_tour", JSON.stringify({ index: 4 }))
        setConsentCookie(false)
        mockPathname = TOUR_STEPS[4].path
        render(<App page={mockPathname} />)
        const bar = await screen.findByRole("region", { name: "Guided tour" })
        expect(within(bar).getByRole("heading", { name: TOUR_STEPS[4].title })).toBeTruthy()
    })

    it("offers a way back when the visitor leaves the tour route", async () => {
        sessionStorage.setItem("java_tour", JSON.stringify({ index: 0 }))
        setConsentCookie(false)
        mockPathname = "/blog/some-post"
        render(<App page="/blog" />)
        const bar = await screen.findByRole("region", { name: "Guided tour" })
        expect(within(bar).getByText("You've stepped off the tour")).toBeTruthy()
        fireEvent.click(within(bar).getByRole("button", { name: "Back to Home →" }))
        expect(mockPush).toHaveBeenCalledWith("/")
    })

    it("Esc exits the tour", async () => {
        await startTourFromIntro()
        fireEvent.keyDown(document.body, { key: "Escape" })
        await waitFor(() => expect(screen.queryByRole("region", { name: "Guided tour" })).toBeNull())
        expect(await screen.findByText(/Tour closed/)).toBeTruthy()
        expect(sessionStorage.getItem("java_tour")).toBeNull()
    })

    it("can be replayed any time from the footer", async () => {
        setConsentCookie(true)
        render(<App />)
        fireEvent.click(await screen.findByRole("button", { name: "Take the tour" }))
        expect(await screen.findByRole("region", { name: "Guided tour" })).toBeTruthy()
    })
})
