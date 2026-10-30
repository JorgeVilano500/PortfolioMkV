/** @jest-environment jsdom */
/**
 * /laptop — the sponsor-sticker experience around the Three.js viewer.
 * jsdom has no WebGL, so the viewer is replaced by a stub that records its
 * props and lets each test play the viewer's part (report a status, or a
 * sticker clicked in 3D). Covers selection by click, keyboard, and 3D pick;
 * loading, missing-model, error, and unsupported fallbacks; retry; reduced
 * motion; the contact CTA; and the link from /work.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react"

type MockViewerProps = {
    selectedId:    string | null
    resetToken:    number
    reducedMotion: boolean
    onSelect:      (id: string) => void
    onStatus:      (status: string) => void
}

const mockViewer: { props: MockViewerProps | null; mounts: number } = { props: null, mounts: 0 }

// next/dynamic(() => import("./LaptopViewer"), { ssr: false }) → the stub.
jest.mock("next/dynamic", () => {
    const { useEffect } = jest.requireActual("react")
    return () => function MockLaptopViewer(props: MockViewerProps) {
        mockViewer.props = props
        useEffect(() => { mockViewer.mounts++ }, [])
        return null
    }
})

// A plain <a> that doesn't navigate (jsdom has no router).
jest.mock("next/link", () => {
    const { createElement } = jest.requireActual("react")
    return {
        __esModule: true,
        default: ({ children, ...rest }: { children?: unknown }) => createElement("a", rest, children),
    }
})

import { LaptopExperience } from "@/app/laptop/LaptopExperience"
import { WorkComponent } from "@/components/ui/WorkComponent"

const viewer = () => {
    if (!mockViewer.props) throw new Error("viewer not rendered")
    return mockViewer.props
}
const report = (status: string) => act(() => viewer().onStatus(status))
const radios = () => screen.getAllByRole("radio")
const details = () => screen.getByText(/Sponsor a spot/).closest("div") as HTMLElement

function setReducedMotion(reduce: boolean) {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: jest.fn(() => ({ matches: reduce, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    })
}

beforeEach(() => {
    mockViewer.props  = null
    mockViewer.mounts = 0
    setReducedMotion(false)
})

describe("spot picker", () => {
    it("lists four spots in a radio group, none chosen, the first one tabbable", () => {
        render(<LaptopExperience />)
        const group = screen.getByRole("radiogroup", { name: "Four sponsor spots" })
        const options = within(group).getAllByRole("radio")
        expect(options).toHaveLength(4)
        expect(options.every((o) => o.getAttribute("aria-checked") === "false")).toBe(true)
        expect(options.map((o) => o.tabIndex)).toEqual([0, -1, -1, -1])
        expect(screen.getByText("Pick a spot")).toBeTruthy()
    })

    it("shows a sponsor's details when its spot is clicked, and tells the viewer", () => {
        render(<LaptopExperience />)
        fireEvent.click(screen.getByRole("radio", { name: /Upper right/ }))
        expect(screen.getByRole("radio", { name: /Upper right/ }).getAttribute("aria-checked")).toBe("true")
        expect(within(details()).getByRole("heading", { name: "Example Cloud" })).toBeTruthy()
        expect(within(details()).getByText("Sample sponsor")).toBeTruthy()
        expect(viewer().selectedId).toBe("slot-2")
    })

    it("marks the open spot as available", () => {
        render(<LaptopExperience />)
        fireEvent.click(screen.getByRole("radio", { name: /Lower right/ }))
        expect(within(details()).getByRole("heading", { name: "This spot is open" })).toBeTruthy()
        expect(within(details()).getByText("Available")).toBeTruthy()
    })

    it("moves selection and focus with arrow keys, wrapping, plus Home and End", () => {
        render(<LaptopExperience />)
        const first = radios()[0]
        first.focus()
        fireEvent.keyDown(first, { key: "ArrowRight" })
        expect(viewer().selectedId).toBe("slot-1") // nothing chosen yet → the first spot
        fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
        expect(document.activeElement).toBe(radios()[1])
        expect(radios()[1].getAttribute("aria-checked")).toBe("true")
        fireEvent.keyDown(document.activeElement!, { key: "End" })
        expect(document.activeElement).toBe(radios()[3])
        fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
        expect(document.activeElement).toBe(radios()[0]) // wrapped
        fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" })
        expect(viewer().selectedId).toBe("slot-4")
        fireEvent.keyDown(document.activeElement!, { key: "Home" })
        expect(viewer().selectedId).toBe("slot-1")
        // Only the chosen spot is in the tab order (roving tabindex).
        expect(radios().map((o) => o.tabIndex)).toEqual([0, -1, -1, -1])
    })

    it("selects the spot clicked in the 3D view", () => {
        render(<LaptopExperience />)
        report("ready")
        act(() => viewer().onSelect("slot-3"))
        expect(screen.getByRole("radio", { name: /Lower left/ }).getAttribute("aria-checked")).toBe("true")
        expect(within(details()).getByRole("heading", { name: "Sample Studio" })).toBeTruthy()
    })
})

describe("sponsor call to action", () => {
    it("opens the offer form (a dialog) and never claims to take payment", () => {
        render(<LaptopExperience />)
        const cta = screen.getByRole("button", { name: /Sponsor a spot/ })
        expect(cta.getAttribute("aria-haspopup")).toBe("dialog")
        expect(document.body.textContent).toMatch(/nothing is charged on this site/i)
        expect(document.body.textContent).not.toMatch(/checkout|buy now|card number|\$\d/i)
        fireEvent.click(cta)
        expect(screen.getByRole("dialog")).toBeTruthy()
        expect(document.body.textContent).toMatch(/nothing is charged here/i)
        expect(document.body.textContent).not.toMatch(/checkout|buy now|card number/i)
    })

    it("labels every sticker as a sample, not a real sponsor", () => {
        render(<LaptopExperience />)
        expect(document.body.textContent).toMatch(/Sample stickers for illustration, not real sponsors/)
    })
})

describe("viewer states", () => {
    it("shows a loading skeleton until the viewer is ready, then the controls hint and Reset view", () => {
        render(<LaptopExperience />)
        expect(screen.getByRole("status").textContent).toMatch(/Loading the 3D laptop/)
        expect(screen.queryByRole("button", { name: "Reset view" })).toBeNull()
        report("ready")
        expect(screen.getByRole("status").textContent).toMatch(/Drag to rotate/)
        fireEvent.click(screen.getByRole("button", { name: "Reset view" }))
        expect(viewer().resetToken).toBe(1)
    })

    it("falls back to the 2D layout when the model file is missing, and the picker still works", () => {
        render(<LaptopExperience />)
        report("missing")
        expect(screen.getByRole("status").textContent).toMatch(/3D model coming soon/)
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull() // retrying can't conjure the file
        fireEvent.click(screen.getByRole("radio", { name: /Upper left/ }))
        expect(within(details()).getByRole("heading", { name: "Acme Dev Tools" })).toBeTruthy()
    })

    it("explains when WebGL isn't available", () => {
        render(<LaptopExperience />)
        report("unsupported")
        expect(screen.getByRole("status").textContent).toMatch(/3D isn't available in this browser/)
    })

    it("explains an invalid model without exposing internals", () => {
        render(<LaptopExperience />)
        report("invalid")
        expect(screen.getByRole("status").textContent).toMatch(/model needs an update/)
        expect(screen.getByRole("status").textContent).not.toMatch(/Sticker_Slot|Lid_Outer/)
    })

    it("offers a retry after a load error that remounts the viewer from scratch", () => {
        render(<LaptopExperience />)
        expect(mockViewer.mounts).toBe(1)
        report("error")
        expect(screen.getByRole("status").textContent).toMatch(/didn't load/)
        fireEvent.click(screen.getByRole("button", { name: "Try again" }))
        expect(mockViewer.mounts).toBe(2)
        expect(screen.getByRole("status").textContent).toMatch(/Loading the 3D laptop/)
    })

    it("describes the scene and the current selection to assistive tech", () => {
        render(<LaptopExperience />)
        fireEvent.click(screen.getByRole("radio", { name: /Lower right/ }))
        const scene = screen.getByRole("img")
        expect(scene.getAttribute("aria-label")).toMatch(/13-inch MacBook Pro \(2019\) with four sticker spots/)
        expect(scene.getAttribute("aria-label")).toMatch(/Selected: Lower right spot: open/)
    })
})

describe("reduced motion", () => {
    it("passes the visitor's reduced-motion preference to the viewer", () => {
        setReducedMotion(true)
        render(<LaptopExperience />)
        expect(viewer().reducedMotion).toBe(true)
    })

    it("animates by default", () => {
        render(<LaptopExperience />)
        expect(viewer().reducedMotion).toBe(false)
    })
})

describe("/work", () => {
    it("links to the 3D laptop page", () => {
        render(<WorkComponent />)
        expect(screen.getByRole("link", { name: /Sticker the laptop/ }).getAttribute("href")).toBe("/laptop")
    })
})
