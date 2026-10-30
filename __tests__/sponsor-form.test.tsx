/** @jest-environment jsdom */
/**
 * The "Sponsor a spot" dialog on /laptop: opens from the details card with the
 * chosen spot, validates before uploading, posts multipart to
 * /api/sponsorships, and turns into a receipt that's honest about whether an
 * email copy went out. Also: focus handling, no closing mid-send, and a
 * honeypot hidden from people and assistive tech.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

jest.mock("next/dynamic", () => () => function MockLaptopViewer() { return null })
jest.mock("next/link", () => {
    const { createElement } = jest.requireActual("react")
    return {
        __esModule: true,
        default: ({ children, ...rest }: { children?: unknown }) => createElement("a", rest, children),
    }
})

import { LaptopExperience } from "@/app/laptop/LaptopExperience"

const fetchMock = jest.fn()
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const dialog = () => screen.getByRole("dialog")
const field = (label: RegExp) => within(dialog()).getByLabelText(label) as HTMLInputElement

function openForm(spot?: RegExp) {
    render(<LaptopExperience />)
    if (spot) fireEvent.click(screen.getByRole("radio", { name: spot }))
    fireEvent.click(screen.getByRole("button", { name: /Sponsor a spot/ }))
}

function fillValid(file: File = new File([PNG], "logo.png", { type: "image/png" })) {
    fireEvent.change(field(/Your email/), { target: { value: "jane@acme.dev" } })
    fireEvent.change(field(/Affiliation/), { target: { value: "Acme Dev Tools" } })
    fireEvent.change(field(/Your offer/), { target: { value: "1,500" } })
    fireEvent.change(field(/Sticker file/), { target: { files: [file] } })
}

const submit = () => fireEvent.click(within(dialog()).getByRole("button", { name: /Send offer/ }))
const respond = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body })

beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
})

describe("opening", () => {
    it("opens a dialog from 'Sponsor a spot', with the selected spot pre-chosen and focus on email", () => {
        openForm(/Upper right/)
        expect(dialog().getAttribute("aria-modal")).toBe("true")
        expect(within(dialog()).getByRole("heading", { name: "Sponsor a spot" })).toBeTruthy()
        expect((field(/Preferred spot/) as unknown as HTMLSelectElement).value).toBe("slot-2")
        expect(document.activeElement).toBe(field(/Your email/))
    })

    it("defaults to 'Any spot' when none is selected", () => {
        openForm()
        expect((field(/Preferred spot/) as unknown as HTMLSelectElement).value).toBe("any")
    })

    it("asks for exactly the four details plus the spot", () => {
        openForm()
        for (const label of [/Your email/, /Affiliation/, /Your offer \(USD\)/, /Sticker file to print/, /Preferred spot/]) {
            expect(field(label)).toBeTruthy()
        }
        expect(field(/Sticker file/).getAttribute("accept")).toMatch(/\.png.*\.pdf/)
    })

    it("hides the honeypot from people and assistive tech", () => {
        openForm()
        const trap = dialog().querySelector('input[name="website"]') as HTMLInputElement
        expect(trap.tabIndex).toBe(-1)
        expect(trap.closest('[aria-hidden="true"]')).toBeTruthy()
    })

    it("offers plain email as an alternative, and links the privacy policy", () => {
        openForm()
        expect(within(dialog()).getByRole("link", { name: /Contact me directly/ }).getAttribute("href")).toBe("/contact")
        expect(within(dialog()).getByRole("link", { name: /privacy policy/ }).getAttribute("href")).toBe("/privacy")
    })
})

describe("validation before upload", () => {
    it("flags every missing field, focuses the first, and sends nothing", () => {
        openForm()
        submit()
        for (const message of [/valid email/, /who the sticker is for/, /amount in US dollars/, /Attach the sticker/]) {
            expect(within(dialog()).getByText(message)).toBeTruthy()
        }
        expect(field(/Your email/).getAttribute("aria-invalid")).toBe("true")
        expect(document.activeElement).toBe(field(/Your email/))
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("rejects an oversized file as soon as it's picked", () => {
        openForm()
        const big = new File([PNG], "huge.png", { type: "image/png" })
        Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 })
        fireEvent.change(field(/Sticker file/), { target: { files: [big] } })
        expect(within(dialog()).getByText(/over 4 MB/)).toBeTruthy()
    })

    it("clears a field's error as soon as it's edited", () => {
        openForm()
        submit()
        fireEvent.change(field(/Your email/), { target: { value: "j" } })
        expect(within(dialog()).queryByText(/valid email/)).toBeNull()
    })
})

describe("sending", () => {
    it("posts multipart form data with every field and the file", async () => {
        openForm(/Upper right/)
        fillValid()
        respond(200, { ok: true, confirmationSent: true, reference: "3F2B6C1E" })
        submit()
        await screen.findByText(/I'll be in touch/)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe("/api/sponsorships")
        expect(init.method).toBe("POST")
        const body = init.body as FormData
        expect(body.get("email")).toBe("jane@acme.dev")
        expect(body.get("affiliation")).toBe("Acme Dev Tools")
        expect(body.get("offer")).toBe("1,500")
        expect(body.get("spot")).toBe("slot-2")
        expect((body.get("sticker") as File).name).toBe("logo.png")
        expect(body.get("website")).toBeNull()
    })

    it("shows a receipt with the details and says a copy is on its way", async () => {
        openForm()
        fillValid()
        respond(200, { ok: true, confirmationSent: true, reference: "3F2B6C1E" })
        submit()
        await screen.findByText(/A copy is on its way to your inbox/)
        const receipt = within(dialog()).getByText("Offer sent").closest('[role="status"]') as HTMLElement
        for (const value of ["jane@acme.dev", "Acme Dev Tools", "$1,500 (negotiable)", "logo.png", "3F2B6C1E"]) {
            expect(within(receipt).getAllByText(value, { exact: false }).length).toBeGreaterThan(0)
        }
        expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: "Done" }))
    })

    it("is honest when the email copy couldn't be sent", async () => {
        openForm()
        fillValid()
        respond(200, { ok: true, confirmationSent: false, reference: "3F2B6C1E" })
        submit()
        await screen.findByText(/couldn't email you a copy just now/)
        expect(within(dialog()).queryByText(/on its way/)).toBeNull()
    })

    it("can't be closed while the offer is sending", async () => {
        openForm()
        fillValid()
        let finish: (value: unknown) => void = () => {}
        fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
        submit()
        const button = within(dialog()).getByRole("button", { name: /Sending/ }) as HTMLButtonElement
        expect(button.disabled).toBe(true)
        fireEvent.keyDown(document, { key: "Escape" })
        expect(screen.getByRole("dialog")).toBeTruthy()
        await act(async () => finish({ ok: true, status: 200, json: async () => ({ ok: true, confirmationSent: true }) }))
        await screen.findByText(/I'll be in touch/)
    })
})

describe("server responses", () => {
    it("shows the server's field errors", async () => {
        openForm()
        fillValid()
        respond(400, { error: "Please fix the highlighted fields.", fields: { sticker: "That file isn't a real PNG, JPG, WebP, or PDF." } })
        submit()
        await screen.findByText(/isn't a real PNG/)
        expect(within(dialog()).getByRole("alert").textContent).toMatch(/fix the highlighted fields/)
    })

    it("shows the rate-limit message", async () => {
        openForm()
        fillValid()
        respond(429, { error: "Too many offers from here. Please try again later, or email me directly." })
        submit()
        expect((await within(dialog()).findByRole("alert")).textContent).toMatch(/Too many offers/)
    })

    it("handles a network failure and lets them try again", async () => {
        openForm()
        fillValid()
        fetchMock.mockRejectedValueOnce(new Error("offline"))
        submit()
        expect((await within(dialog()).findByRole("alert")).textContent).toMatch(/Network error/)
        expect((within(dialog()).getByRole("button", { name: /Send offer/ }) as HTMLButtonElement).disabled).toBe(false)
    })
})

describe("closing", () => {
    it("closes with Esc and returns focus to 'Sponsor a spot'", async () => {
        openForm()
        const trigger = screen.getByRole("button", { name: /Sponsor a spot/, hidden: true })
        fireEvent.keyDown(document, { key: "Escape" })
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(document.activeElement).toBe(trigger)
    })

    it("starts fresh each time it opens", async () => {
        openForm()
        fireEvent.change(field(/Your email/), { target: { value: "draft@acme.dev" } })
        fireEvent.keyDown(document, { key: "Escape" })
        fireEvent.click(screen.getByRole("button", { name: /Sponsor a spot/ }))
        expect(field(/Your email/).value).toBe("")
    })
})
