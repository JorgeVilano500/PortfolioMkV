/** @jest-environment jsdom */
/**
 * /laptop — the sponsor-sticker experience around the Three.js viewer.
 * jsdom has no WebGL, so the viewer is replaced by a stub that records its
 * props and lets each test play the viewer's part (report a status, or a
 * sticker clicked in 3D). Covers selection by click, keyboard, and 3D pick on
 * both surfaces; opening and closing the laptop, by button or by moving the
 * lid (a drag, or the lid slider); loading, invalid-model, error, and
 * unsupported fallbacks (including the open 2D drawing); retry; reduced
 * motion; the offer form's trigger; the two-way highlight between stickers
 * (3D or 2D) and their tiles; spots from the page's data; and the link from
 * /work. The lid's own motion is covered in lib-laptop-lid.test.ts, and the
 * model drawn when the GLB is missing in laptop-built-in-model.test.ts.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react"

type MockViewerProps = {
    slots:         readonly StickerSlot[]
    open:          boolean
    selectedId:    string | null
    hoveredId:     string | null
    onHover:       (id: string | null) => void
    resetToken:    number
    reducedMotion: boolean
    lidRequest:    { degrees: number } | null
    onSelect:      (id: string) => void
    onStatus:      (status: string) => void
    onOpenChange:  (open: boolean) => void
    onLidAngle:    (degrees: number) => void
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
import { STICKER_COLORS, STICKER_SLOTS, type StickerSlot } from "@/lib/laptop-stickers"
import { WorkComponent } from "@/components/ui/WorkComponent"

const viewer = () => {
    if (!mockViewer.props) throw new Error("viewer not rendered")
    return mockViewer.props
}
const report = (status: string) => act(() => viewer().onStatus(status))
const lidGroup  = () => screen.getByRole("radiogroup", { name: "Four sponsor spots" })
const palmGroup = () => screen.getByRole("radiogroup", { name: "Two palm rest spots" })
const lidRadios = () => within(lidGroup()).getAllByRole("radio")
const details = () => screen.getByText(/Sponsor a spot/).closest("div") as HTMLElement
const toggle  = () => screen.getByRole("button", { name: /(Open|Close) the laptop/ })

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

describe("lid spot picker", () => {
    it("lists four spots in a radio group, none chosen, the first one tabbable", () => {
        render(<LaptopExperience />)
        const options = lidRadios()
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
        expect(within(details()).getByText("Lid, upper right")).toBeTruthy()
        expect(within(details()).getByText("Sample sponsor")).toBeTruthy()
        expect(viewer().selectedId).toBe("slot-2")
        expect(viewer().open).toBe(false) // lid stickers don't need the laptop open
    })

    it("marks the open spot as available", () => {
        render(<LaptopExperience />)
        fireEvent.click(screen.getByRole("radio", { name: /Lower right/ }))
        expect(within(details()).getByRole("heading", { name: "This spot is open" })).toBeTruthy()
        expect(within(details()).getByText("Available")).toBeTruthy()
        expect(within(details()).getByText(/sticker on the lid/)).toBeTruthy()
    })

    it("moves selection and focus with arrow keys, wrapping, plus Home and End", () => {
        render(<LaptopExperience />)
        const first = lidRadios()[0]
        act(() => first.focus())
        fireEvent.keyDown(first, { key: "ArrowRight" })
        expect(viewer().selectedId).toBe("slot-1") // nothing chosen yet → the first spot
        fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
        expect(document.activeElement).toBe(lidRadios()[1])
        expect(lidRadios()[1].getAttribute("aria-checked")).toBe("true")
        fireEvent.keyDown(document.activeElement!, { key: "End" })
        expect(document.activeElement).toBe(lidRadios()[3])
        fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
        expect(document.activeElement).toBe(lidRadios()[0]) // wrapped
        fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" })
        expect(viewer().selectedId).toBe("slot-4")
        fireEvent.keyDown(document.activeElement!, { key: "Home" })
        expect(viewer().selectedId).toBe("slot-1")
        // Only the chosen spot is in the tab order (roving tabindex).
        expect(lidRadios().map((o) => o.tabIndex)).toEqual([0, -1, -1, -1])
    })

    it("selects the spot clicked in the 3D view", () => {
        render(<LaptopExperience />)
        report("ready")
        act(() => viewer().onSelect("slot-3"))
        expect(screen.getByRole("radio", { name: /Lower left/ }).getAttribute("aria-checked")).toBe("true")
        expect(within(details()).getByRole("heading", { name: "Sample Studio" })).toBeTruthy()
    })
})

describe("inside the laptop: palm rest spots", () => {
    it("adds a second section with the two spots beside the trackpad", () => {
        render(<LaptopExperience />)
        expect(screen.getByText("Inside the laptop")).toBeTruthy()
        const options = within(palmGroup()).getAllByRole("radio")
        expect(options.map((o) => o.textContent)).toEqual(["Left of trackpadDemo Robotics", "Right of trackpadOpen spot"])
        expect(options.map((o) => o.tabIndex)).toEqual([0, -1]) // each group has its own tab stop
    })

    it("opens the laptop when a palm rest spot is chosen, since the lid covers it", () => {
        render(<LaptopExperience />)
        fireEvent.click(screen.getByRole("radio", { name: /Left of trackpad/ }))
        expect(viewer().open).toBe(true)
        expect(viewer().selectedId).toBe("palm-left")
        expect(within(details()).getByRole("heading", { name: "Demo Robotics" })).toBeTruthy()
        expect(within(details()).getByText("Palm rest, left of trackpad")).toBeTruthy()
        expect(toggle().textContent).toBe("Close the laptop")
    })

    it("keeps one selection across both groups", () => {
        render(<LaptopExperience />)
        fireEvent.click(screen.getByRole("radio", { name: /Upper left/ }))
        fireEvent.click(screen.getByRole("radio", { name: /Right of trackpad/ }))
        expect(screen.getAllByRole("radio").filter((o) => o.getAttribute("aria-checked") === "true")).toHaveLength(1)
        expect(within(details()).getByText(/right beside the trackpad/)).toBeTruthy()
        // The lid group has no selection now, so its first spot is its tab stop again.
        expect(lidRadios().map((o) => o.tabIndex)).toEqual([0, -1, -1, -1])
    })

    it("moves between the two palm spots with the arrow keys, wrapping", () => {
        render(<LaptopExperience />)
        const [left, right] = within(palmGroup()).getAllByRole("radio")
        act(() => left.focus())
        fireEvent.keyDown(left, { key: "ArrowRight" })
        expect(viewer().selectedId).toBe("palm-left")
        expect(viewer().open).toBe(true)
        fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
        expect(document.activeElement).toBe(right)
        fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
        expect(document.activeElement).toBe(left)
    })

    it("selects a palm rest sticker clicked in the 3D view", () => {
        render(<LaptopExperience />)
        report("ready")
        fireEvent.click(toggle())
        act(() => viewer().onSelect("palm-right"))
        expect(screen.getByRole("radio", { name: /Right of trackpad/ }).getAttribute("aria-checked")).toBe("true")
    })
})

describe("opening and closing the laptop", () => {
    it("starts closed and opens with the toggle, clearing the selection so the view starts from its overview", () => {
        render(<LaptopExperience />)
        expect(viewer().open).toBe(false)
        fireEvent.click(screen.getByRole("radio", { name: /Upper left/ }))
        fireEvent.click(toggle())
        expect(viewer().open).toBe(true)
        expect(viewer().selectedId).toBeNull()
        expect(toggle().textContent).toBe("Close the laptop")
        fireEvent.click(toggle())
        expect(viewer().open).toBe(false)
        expect(toggle().textContent).toBe("Open the laptop")
    })

    it("keeps the laptop open when a lid sticker is chosen (it's seen from behind the screen)", () => {
        render(<LaptopExperience />)
        fireEvent.click(toggle())
        fireEvent.click(screen.getByRole("radio", { name: /Lower left/ }))
        expect(viewer().open).toBe(true)
        expect(viewer().selectedId).toBe("slot-3")
    })

    it("drops a palm rest selection on closing, since the lid hides it", () => {
        render(<LaptopExperience />)
        fireEvent.click(screen.getByRole("radio", { name: /Right of trackpad/ }))
        fireEvent.click(toggle())
        expect(viewer().open).toBe(false)
        expect(viewer().selectedId).toBeNull()
        expect(screen.getByText("Pick a spot")).toBeTruthy()
    })

    it("describes the open or closed laptop and the selection to assistive tech", () => {
        render(<LaptopExperience />)
        const scene = screen.getByRole("img")
        expect(scene.getAttribute("aria-label")).toMatch(/13-inch MacBook Pro \(2019\), closed, with four sticker spots on the lid/)
        fireEvent.click(screen.getByRole("radio", { name: /Lower right/ }))
        expect(scene.getAttribute("aria-label")).toMatch(/Selected: Lid, lower right: open/)
        fireEvent.click(screen.getByRole("radio", { name: /Left of trackpad/ }))
        expect(scene.getAttribute("aria-label")).toMatch(/open, with the screen on, the keyboard backlit, and two sticker spots on the palm rest/)
        expect(scene.getAttribute("aria-label")).toMatch(/Selected: Palm rest, left of trackpad: Demo Robotics \(sample sponsor\)/)
    })
})

describe("moving the lid by hand", () => {
    const slider = () => screen.getByRole("slider", { name: "Lid angle" })

    it("follows a drag past open without moving the selection or the camera's subject", () => {
        render(<LaptopExperience />)
        report("ready")
        fireEvent.click(screen.getByRole("radio", { name: /Upper left/ }))
        act(() => viewer().onOpenChange(true))
        expect(viewer().open).toBe(true)
        expect(viewer().selectedId).toBe("slot-1") // unlike the button, which starts the view afresh
        expect(toggle().textContent).toBe("Close the laptop")
        expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/open, with the screen on/)
    })

    it("drops a palm rest selection when the lid is pushed closed over it, but keeps a lid one", () => {
        render(<LaptopExperience />)
        report("ready")
        fireEvent.click(screen.getByRole("radio", { name: /Left of trackpad/ }))
        act(() => viewer().onOpenChange(false))
        expect(viewer().open).toBe(false)
        expect(viewer().selectedId).toBeNull()
        fireEvent.click(screen.getByRole("radio", { name: /Lower left/ }))
        act(() => viewer().onOpenChange(true))
        act(() => viewer().onOpenChange(false))
        expect(viewer().selectedId).toBe("slot-3")
    })

    it("offers a labelled lid slider once the 3D view is ready, starting slightly open", () => {
        render(<LaptopExperience />)
        expect(screen.queryByRole("slider")).toBeNull()
        report("ready")
        expect(slider().getAttribute("min")).toBe("0")
        expect(slider().getAttribute("max")).toBe("108")
        expect((slider() as HTMLInputElement).value).toBe("12")
        expect(slider().getAttribute("aria-valuetext")).toBe("Open 12 degrees")
    })

    it("sends each slider change to the viewer, even a repeat of the same angle", () => {
        render(<LaptopExperience />)
        report("ready")
        fireEvent.change(slider(), { target: { value: "60" } })
        const first = viewer().lidRequest
        expect(first).toEqual({ degrees: 60 })
        expect(slider().getAttribute("aria-valuetext")).toBe("Open 60 degrees")
        fireEvent.change(slider(), { target: { value: "0" } })
        expect(viewer().lidRequest).toEqual({ degrees: 0 })
        expect(viewer().lidRequest).not.toBe(first)
    })

    it("moves the slider as the lid moves in 3D", () => {
        render(<LaptopExperience />)
        report("ready")
        act(() => viewer().onLidAngle(0))
        expect((slider() as HTMLInputElement).value).toBe("0")
        expect(slider().getAttribute("aria-valuetext")).toBe("Closed")
        act(() => viewer().onLidAngle(97))
        expect((slider() as HTMLInputElement).value).toBe("97")
    })

    it("has no slider on the 2D drawings, where the lid is simply open or closed", () => {
        render(<LaptopExperience />)
        report("unsupported")
        expect(screen.queryByRole("slider")).toBeNull()
        expect(toggle()).toBeTruthy()
    })

    it("forgets an old slider value when the viewer is rebuilt", () => {
        render(<LaptopExperience />)
        report("ready")
        fireEvent.change(slider(), { target: { value: "70" } })
        report("error")
        fireEvent.click(screen.getByRole("button", { name: "Try again" }))
        expect(viewer().lidRequest).toBeNull()
    })
})

describe("offer form trigger", () => {
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
        expect(screen.getByRole("status").textContent).toMatch(/Drag the lid to open or close it, drag beside the laptop to rotate/)
        fireEvent.click(screen.getByRole("button", { name: "Reset view" }))
        expect(viewer().resetToken).toBe(1)
    })

    it("falls back to the 2D layout without WebGL, and the picker still works", () => {
        render(<LaptopExperience />)
        report("unsupported")
        expect(screen.getByRole("status").textContent).toMatch(/3D isn't available in this browser/)
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull() // retrying can't turn WebGL on
        fireEvent.click(screen.getByRole("radio", { name: /Upper left/ }))
        expect(within(details()).getByRole("heading", { name: "Acme Dev Tools" })).toBeTruthy()
    })

    it("draws the open laptop in 2D when it's opened without 3D", () => {
        render(<LaptopExperience />)
        report("unsupported")
        const scene = screen.getByRole("img")
        expect(scene.querySelector("svg")).toBeNull() // the closed lid drawing
        expect(within(scene).getByText("ACME")).toBeTruthy()
        fireEvent.click(screen.getByRole("radio", { name: /Left of trackpad/ }))
        const drawing = scene.querySelector("svg")
        expect(drawing).not.toBeNull()
        expect(within(scene).getByText("DR")).toBeTruthy()   // the sample palm sticker
        expect(within(scene).getByText("Open")).toBeTruthy() // the open palm spot
        expect(drawing!.querySelectorAll('rect[stroke="#7c6dff"][stroke-width="2.5"]')).toHaveLength(1) // the selection ring
        fireEvent.click(toggle())
        expect(scene.querySelector("svg")).toBeNull()
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
        expect(screen.getByRole("status").textContent).not.toMatch(/Sticker_Slot|Lid_Outer|Palm_Slot|Keyboard|Screen/)
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
})

describe("highlight sync", () => {
    const tile = (name: RegExp) => screen.getByRole("radio", { name })
    const accent = (el: HTMLElement | SVGElement) => (el as HTMLElement).style.getPropertyValue("--spot-accent")
    const lit = (el: HTMLElement) => el.getAttribute("aria-checked") === "true" && el.style.boxShadow !== ""

    it("lights a sticker's tile and the details card in its colour when it's clicked in 3D", () => {
        render(<LaptopExperience />)
        report("ready")
        act(() => viewer().onSelect("slot-2")) // Example Cloud, green
        const upperRight = tile(/Upper right/)
        expect(lit(upperRight)).toBe(true)
        expect(accent(upperRight)).toBe(STICKER_COLORS.green.fill)
        expect(lidRadios().filter((o) => o.style.boxShadow !== "")).toHaveLength(1)
        expect(within(details()).getByRole("heading", { name: "Example Cloud" })).toBeTruthy()
        expect(viewer().selectedId).toBe("slot-2")
    })

    it("lights the sticker in 3D while its tile is pointed at or focused", () => {
        render(<LaptopExperience />)
        fireEvent.mouseEnter(tile(/Lower left/))
        expect(viewer().hoveredId).toBe("slot-3")
        fireEvent.mouseLeave(tile(/Lower left/))
        expect(viewer().hoveredId).toBeNull()
        fireEvent.focus(tile(/Right of trackpad/))
        expect(viewer().hoveredId).toBe("palm-right")
    })

    it("lights a tile faintly when its sticker is pointed at in 3D, without selecting it", () => {
        render(<LaptopExperience />)
        act(() => viewer().onHover("slot-1"))
        const upperLeft = tile(/Upper left/)
        expect(upperLeft.getAttribute("aria-checked")).toBe("false")
        expect(upperLeft.style.borderColor).not.toBe("")
        expect(upperLeft.style.boxShadow).toBe("")
        act(() => viewer().onHover(null))
        expect(tile(/Upper left/).style.borderColor).toBe("")
    })

    it("selects from the 2D lid drawing, and lights the drawn sticker from its tile", () => {
        render(<LaptopExperience />)
        report("unsupported")
        const sticker = (id: string) => screen.getByRole("img").querySelector(`[data-spot="${id}"]`) as HTMLElement
        fireEvent.click(sticker("slot-4"))
        expect(lit(tile(/Lower right/))).toBe(true)
        expect(within(details()).getByRole("heading", { name: "This spot is open" })).toBeTruthy()
        expect(sticker("slot-4").style.boxShadow).toMatch(/0 0 0 4px/)
        fireEvent.mouseEnter(sticker("slot-1"))
        expect(tile(/Upper left/).style.borderColor).not.toBe("")
        fireEvent.mouseEnter(tile(/Upper right/))
        expect(sticker("slot-2").style.boxShadow).toMatch(/0 0 0 2px/)
    })

    it("selects from the open 2D drawing's palm rest", () => {
        render(<LaptopExperience />)
        report("unsupported")
        fireEvent.click(toggle())
        const drawing = screen.getByRole("img").querySelector("svg")!
        fireEvent.click(drawing.querySelector('[data-spot="palm-right"]')!)
        expect(lit(tile(/Right of trackpad/))).toBe(true)
        expect(drawing.querySelectorAll('[data-spot="palm-right"] rect[stroke-width="2.5"]')).toHaveLength(1)
    })
})

describe("spots from the page", () => {
    const real: StickerSlot[] = STICKER_SLOTS.map((slot) => slot.id === "slot-1"
        ? { ...slot, sponsor: { name: "Real Co", mark: "RC", tagline: "We exist", description: "", theme: "pink", imageUrl: "/laptop/stickers/slot-1?v=1" } }
        : { ...slot, sponsor: null })

    it("draws the spots it's given, and passes them to the 3D view", () => {
        render(<LaptopExperience slots={real} />)
        expect(viewer().slots).toBe(real)
        expect(tile(/Upper left/).textContent).toMatch(/Real Co/)
        expect(tile(/Upper right/).textContent).toMatch(/Open spot/)
    })

    it("drops the sample disclaimer once no sample stickers are shown", () => {
        render(<LaptopExperience slots={real} />)
        expect(document.body.textContent).not.toMatch(/Sample stickers/)
        expect(document.body.textContent).toMatch(/nothing is charged on this site/)
    })

    it("shows an uploaded sticker image, and no sample badge, for a real sponsor", () => {
        render(<LaptopExperience slots={real} />)
        fireEvent.click(tile(/Upper left/))
        expect(within(details()).getByRole("img", { name: "Real Co sticker" }).getAttribute("src")).toBe("/laptop/stickers/slot-1?v=1")
        expect(within(details()).queryByText("Sample sponsor")).toBeNull()
    })

    it("marks the built-in samples as samples", () => {
        render(<LaptopExperience />)
        fireEvent.click(tile(/Upper left/))
        expect(within(details()).getByText("Sample sponsor")).toBeTruthy()
    })

    function tile(name: RegExp) { return screen.getByRole("radio", { name }) }
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
