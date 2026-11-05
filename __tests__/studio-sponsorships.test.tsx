/** @jest-environment jsdom */
/**
 * Studio → Sponsorships (app/studio/SponsorshipsPanel.tsx): the spots /laptop
 * shows and the offers inbox. jsdom has no WebGL, so the 3D preview is a stub
 * that records its props (as in laptop-experience.test.tsx), and fetch is a
 * stub that plays the admin API. Covers loading, stats, the hidden-sticker
 * preview, the two-way highlight between the preview and the spot list, the
 * visibility switch, editing, placing an offer's sticker, the two-step
 * delete, the setup banner, and failures shown in words.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { STICKER_SLOTS, type StickerSlot } from "@/lib/laptop-stickers"

type MockViewerProps = {
    slots:      readonly StickerSlot[]
    selectedId: string | null
    hoveredId:  string | null
    onSelect:   (id: string) => void
    onHover:    (id: string | null) => void
    onStatus:   (status: string) => void
}
const mockViewer: { props: MockViewerProps | null } = { props: null }

jest.mock("next/dynamic", () => () => function MockLaptopViewer(props: MockViewerProps) {
    mockViewer.props = props
    return null
})

import { SponsorshipsPanel } from "@/app/studio/SponsorshipsPanel"

const viewer = () => {
    if (!mockViewer.props) throw new Error("viewer not rendered")
    return mockViewer.props
}

const OFFER_ID = "3f2b6c1e-8d4a-4f6b-9c2d-1a2b3c4d5e6f"

type Spot = {
    id: string; sponsor: { name: string; mark: string; tagline: string; description: string; theme: string } | null
    visible: boolean; sample: boolean; offerId: string | null; imageUrl: string | null; updatedAt: string
}

function baseSpots(): Spot[] {
    return STICKER_SLOTS.map((slot) => ({
        id:        slot.id,
        sponsor:   slot.sponsor ? { name: slot.sponsor.name, mark: slot.sponsor.mark, tagline: slot.sponsor.tagline, description: slot.sponsor.description, theme: slot.sponsor.theme } : null,
        visible:   slot.id !== "slot-3", // Sample Studio is hidden
        sample:    Boolean(slot.sponsor),
        offerId:   null,
        imageUrl:  null,
        updatedAt: "1970-01-01T00:00:00.000Z",
    }))
}

const baseOffer = () => ({
    id: OFFER_ID, email: "jane@bright.dev", affiliation: "Bright Labs", offer_usd: 1500, spot: "slot-4",
    file_path: `offers/${OFFER_ID}/sticker.png`, file_type: "image/png", file_bytes: 1234, file_name: "bright.png",
    status: "new", notes: "", created_at: "2026-11-01T12:00:00Z",
    fileUrl: `/api/sponsorships/file?path=${encodeURIComponent(`offers/${OFFER_ID}/sticker.png`)}`,
})

// ─── A stand-in for the admin API ─────────────────────────────────────────────

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let spots: Spot[] = []
let offers: ReturnType<typeof baseOffer>[] = []
let setup = true
let failNext: { status: number; body: unknown } | null = null
let version = 0

function respond(url: string, method: string, body: Record<string, unknown>): { status: number; body: unknown } {
    if (failNext) { const reply = failNext; failNext = null; return reply }
    if (url === "/api/sponsorships/spots" && method === "GET") return { status: 200, body: { spots, setup } }
    if (url === "/api/sponsorships" && method === "GET") return { status: 200, body: { offers, setup } }
    if (url === "/api/sponsorships/spots" && method === "PATCH") {
        const spot = { ...spots.find((s) => s.id === body.id)!, updatedAt: `2026-11-03T00:00:0${++version}.000Z`, sample: false }
        if ("visible" in body) spot.visible = body.visible as boolean
        if ("sponsor" in body) spot.sponsor = body.sponsor as Spot["sponsor"]
        if ("offerId" in body) {
            Object.assign(spot, { offerId: body.offerId, imageUrl: "/api/sponsorships/file?path=spots%2Fslot-4%2Fnew.png", sponsor: { name: "Bright Labs", mark: "BL", tagline: "", description: "", theme: "purple" } })
            if (!("visible" in body)) spot.visible = false
        }
        return { status: 200, body: spot }
    }
    if (url === "/api/sponsorships" && method === "PATCH") return { status: 200, body: { ...offers.find((o) => o.id === body.id)!, ...body } }
    if (url === "/api/sponsorships" && method === "DELETE") return { status: 200, body: { success: true, deleted: 1 } }
    return { status: 404, body: { error: "Not found" } }
}

beforeEach(() => {
    mockViewer.props = null
    calls = []
    spots = baseSpots()
    offers = [baseOffer()]
    setup = true
    failNext = null
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    })
    global.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? "GET"
        const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body ?? null
        calls.push({ url, method, body })
        const reply = respond(url, method, body ?? {})
        return { ok: reply.status < 400, status: reply.status, json: async () => reply.body } as unknown as Response
    }) as unknown as typeof fetch
})

async function renderPanel() {
    render(<SponsorshipsPanel />)
    await screen.findByRole("heading", { name: "Spots" })
}

const writes = () => calls.filter((call) => call.method !== "GET")
const spotButton = (name: RegExp) => screen.getByRole("button", { name })
const tileOf = (name: RegExp) => spotButton(name).parentElement as HTMLElement
const offerCard = () => screen.getByText("Bright Labs", { selector: "p" }).closest("li") as HTMLElement

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loading", () => {
    it("lists the six spots, the offers, and the totals", async () => {
        await renderPanel()
        expect(calls.map((call) => call.url).sort()).toEqual(["/api/sponsorships", "/api/sponsorships/spots"])
        expect(screen.getAllByRole("button", { name: /^Edit / }).map((b) => b.getAttribute("aria-label"))).toEqual([
            "Edit Lid, upper left", "Edit Lid, upper right", "Edit Lid, lower left", "Edit Lid, lower right",
            "Edit Palm rest, left of trackpad", "Edit Palm rest, right of trackpad",
        ])
        expect(within(tileOf(/Edit Lid, upper left/)).getByText("Sample")).toBeTruthy()
        expect(within(tileOf(/Edit Lid, lower left/)).getByText("Hidden", { selector: "span.rounded-full" })).toBeTruthy()
        expect(within(tileOf(/Edit Lid, lower right/)).getByText("Open spot")).toBeTruthy()
        const stats = screen.getByText("Spots taken").parentElement!
        expect(stats.textContent).toMatch(/4\/6/)
        expect(screen.getByText("Hidden", { selector: "p" }).parentElement!.textContent).toMatch(/^1/)
        expect(within(offerCard()).getByText("$1,500")).toBeTruthy()
        expect(within(offerCard()).getByRole("img", { name: "Sticker from Bright Labs" }).getAttribute("src")).toBe(baseOffer().fileUrl)
    })

    it("asks for the schema, and disables saving, before it has run", async () => {
        setup = false
        offers = []
        await renderPanel()
        expect(screen.getByText(/sponsorships-schema\.sql/).closest('[role="status"]')).not.toBeNull()
        fireEvent.click(spotButton(/Edit Lid, upper left/))
        expect((screen.getByRole("button", { name: "Save details" }) as HTMLButtonElement).disabled).toBe(true)
    })

    it("shows why loading failed", async () => {
        failNext = { status: 401, body: { error: "Unauthorized" } }
        render(<SponsorshipsPanel />)
        expect((await screen.findByRole("alert")).textContent).toMatch(/session expired/i)
    })
})

describe("the 3D preview", () => {
    it("shows hidden stickers by default, and only what visitors see when asked", async () => {
        await renderPanel()
        expect(viewer().slots.find((s) => s.id === "slot-3")?.sponsor?.name).toBe("Sample Studio")
        fireEvent.click(screen.getByRole("checkbox", { name: /Show hidden stickers/ }))
        expect(viewer().slots.find((s) => s.id === "slot-3")?.sponsor).toBeNull()
        expect(viewer().slots.find((s) => s.id === "slot-1")?.sponsor?.name).toBe("Acme Dev Tools")
    })

    it("opens a spot's editor and lights its tile when its sticker is clicked in 3D", async () => {
        await renderPanel()
        act(() => viewer().onSelect("slot-2"))
        expect(screen.getByRole("heading", { level: 2, name: "Example Cloud" })).toBeTruthy()
        expect(spotButton(/Edit Lid, upper right/).getAttribute("aria-pressed")).toBe("true")
        expect(tileOf(/Edit Lid, upper right/).style.boxShadow).not.toBe("")
        expect(viewer().selectedId).toBe("slot-2")
    })

    it("lights a sticker in 3D while its tile is pointed at, and a tile while its sticker is", async () => {
        await renderPanel()
        fireEvent.mouseEnter(tileOf(/Edit Lid, lower left/))
        expect(viewer().hoveredId).toBe("slot-3")
        fireEvent.mouseLeave(tileOf(/Edit Lid, lower left/))
        expect(viewer().hoveredId).toBeNull()
        act(() => viewer().onHover("palm-left"))
        expect(tileOf(/Edit Palm rest, left/).style.borderColor).not.toBe("")
        expect(tileOf(/Edit Palm rest, left/).style.boxShadow).toBe("")
    })
})

describe("controls", () => {
    it("hides a sponsor from /laptop with one switch", async () => {
        await renderPanel()
        const toggle = within(tileOf(/Edit Lid, upper left/)).getByRole("switch", { name: /Show Acme Dev Tools on \/laptop/ })
        expect(toggle.getAttribute("aria-checked")).toBe("true")
        await act(async () => { fireEvent.click(toggle) })
        expect(writes()).toEqual([{ url: "/api/sponsorships/spots", method: "PATCH", body: { id: "slot-1", visible: false } }])
        expect(within(tileOf(/Edit Lid, upper left/)).getByRole("switch").getAttribute("aria-checked")).toBe("false")
        expect(viewer().slots[0].sponsor?.name).toBe("Acme Dev Tools") // still previewed, as hidden
    })

    it("saves a spot's details", async () => {
        await renderPanel()
        fireEvent.click(spotButton(/Edit Lid, upper left/))
        fireEvent.change(screen.getByLabelText("Sponsor name"), { target: { value: "Acme Two" } })
        fireEvent.click(screen.getByRole("radio", { name: /Pink/ }))
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save details" })) })
        expect(writes()[0].body).toEqual({
            id: "slot-1",
            sponsor: { name: "Acme Two", mark: "ACME", tagline: STICKER_SLOTS[0].sponsor!.tagline, description: STICKER_SLOTS[0].sponsor!.description, theme: "pink" },
        })
        expect(screen.getByRole("heading", { level: 2, name: "Acme Two" })).toBeTruthy()
        expect(spotButton(/Edit Lid, upper left/).textContent).toMatch(/Acme Two/)
    })

    it("clears a spot only after a second click", async () => {
        await renderPanel()
        fireEvent.click(spotButton(/Edit Lid, upper left/))
        fireEvent.click(screen.getByRole("button", { name: "Clear spot" }))
        expect(writes()).toHaveLength(0)
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Click again to clear" })) })
        expect(writes()[0].body).toEqual({ id: "slot-1", sponsor: null })
    })

    it("places an offer's sticker from the inbox, hidden until switched on", async () => {
        await renderPanel()
        expect((within(offerCard()).getByRole("combobox", { name: /Spot to place/ }) as HTMLSelectElement).value).toBe("slot-4") // the spot they asked for
        await act(async () => { fireEvent.click(within(offerCard()).getByRole("button", { name: "Place on spot" })) })
        expect(writes()[0]).toEqual({ url: "/api/sponsorships/spots", method: "PATCH", body: { id: "slot-4", offerId: OFFER_ID } })
        expect(screen.getByRole("heading", { level: 2, name: "Bright Labs" })).toBeTruthy()
        expect(screen.getByText(/Placed as hidden/)).toBeTruthy()
        expect(within(offerCard()).getByText("accepted")).toBeTruthy()
        expect(viewer().slots.find((s) => s.id === "slot-4")?.sponsor).toMatchObject({ name: "Bright Labs", imageUrl: expect.stringContaining("spots%2Fslot-4") })
        expect(viewer().selectedId).toBe("slot-4")
    })

    it("declines an offer and keeps a note on it", async () => {
        await renderPanel()
        await act(async () => { fireEvent.click(within(offerCard()).getByRole("button", { name: "Decline" })) })
        expect(writes()[0].body).toEqual({ id: OFFER_ID, status: "declined" })
        fireEvent.change(within(offerCard()).getByRole("textbox", { name: /Notes on the offer/ }), { target: { value: "Too low" } })
        await act(async () => { fireEvent.click(within(offerCard()).getByRole("button", { name: "Save note" })) })
        expect(writes()[1].body).toEqual({ id: OFFER_ID, notes: "Too low" })
    })

    it("deletes an offer only after a second click", async () => {
        await renderPanel()
        fireEvent.click(within(offerCard()).getByRole("button", { name: "Delete" }))
        expect(writes()).toHaveLength(0)
        await act(async () => { fireEvent.click(within(offerCard()).getByRole("button", { name: "Click again to delete" })) })
        expect(writes()[0]).toEqual({ url: "/api/sponsorships", method: "DELETE", body: { id: OFFER_ID } })
        expect(screen.getByText(/No offers yet/)).toBeTruthy()
    })

    it("shows why a save failed, and leaves the spot as it was", async () => {
        await renderPanel()
        failNext = { status: 500, body: { error: "Database error" } }
        await act(async () => { fireEvent.click(within(tileOf(/Edit Lid, upper left/)).getByRole("switch")) })
        expect(within(tileOf(/Edit Lid, upper left/)).getByRole("alert").textContent).toBe("Database error")
        expect(within(tileOf(/Edit Lid, upper left/)).getByRole("switch").getAttribute("aria-checked")).toBe("true")
    })
})
