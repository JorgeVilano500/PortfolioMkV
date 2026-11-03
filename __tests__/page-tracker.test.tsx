/** @jest-environment jsdom */
/**
 * components/ui/PageTracker — what each page view reports. Client-side
 * navigation leaves document.referrer and the navigation timing entry
 * untouched, so only the document's first tracked view may carry them.
 * (Every view used to report the landing referrer and the landing page's
 * load time, inflating "top referrers" and skewing average load time.)
 */
import * as React from "react"
import { render } from "@testing-library/react"

const mockNav = { pathname: "/" }
jest.mock("next/navigation", () => ({ usePathname: () => mockNav.pathname }))
jest.mock("@/components/onboarding/OnboardingProvider", () => ({ useOnboarding: () => ({ analyticsAllowed: true }) }))

const fetchMock = jest.fn(() => Promise.resolve({ ok: true }))
const sent = () => fetchMock.mock.calls.map((call) => JSON.parse((call as unknown as [string, { body: string }])[1].body))

/** A fresh copy of the tracker module, so each test starts a new "document" (sharing this file's React). */
function loadTracker() {
    let PageTracker!: typeof import("@/components/ui/PageTracker").PageTracker
    jest.isolateModules(() => {
        jest.doMock("react", () => React)
        ;({ PageTracker } = require("@/components/ui/PageTracker"))
    })
    const view = render(<PageTracker />)
    return { rerender: () => view.rerender(<PageTracker />) }
}

beforeEach(() => {
    fetchMock.mockClear()
    global.fetch = fetchMock as unknown as typeof fetch
    localStorage.clear()
    sessionStorage.clear()
    Object.defineProperty(document, "referrer", { configurable: true, value: "https://www.google.com/search?q=java" })
    Object.defineProperty(performance, "getEntriesByType", {
        configurable: true,
        value: () => [{ name: "http://localhost/", fetchStart: 100, loadEventEnd: 900 }],
    })
})

it("sends the referrer and load time with the landing view only", () => {
    mockNav.pathname = "/"
    const { rerender } = loadTracker()
    mockNav.pathname = "/blog"
    rerender()
    mockNav.pathname = "/about"
    rerender()

    const [landing, second, third] = sent()
    expect(landing).toMatchObject({ page: "/", referrer: "https://www.google.com/search?q=java", load_time: 800, is_new_visitor: true })
    expect(second).toMatchObject({ page: "/blog", referrer: "", load_time: null, is_new_visitor: false })
    expect(third).toMatchObject({ page: "/about", referrer: "", load_time: null })
    expect(new Set(sent().map((b) => b.session_id)).size).toBe(1)
})

it("doesn't give a later page the landing page's load time", () => {
    // e.g. consent was given after navigating: the first tracked view isn't the page that was loaded
    mockNav.pathname = "/work"
    loadTracker()
    expect(sent()[0]).toMatchObject({ page: "/work", referrer: "https://www.google.com/search?q=java", load_time: null })
})

it("never tracks admin pages", () => {
    mockNav.pathname = "/studio"
    loadTracker()
    expect(fetchMock).not.toHaveBeenCalled()
})
