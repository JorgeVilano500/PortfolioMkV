/** @jest-environment jsdom */
/**
 * app/studio/shared — the grid cards' quick actions (publish toggle, delete).
 * They used to fail silently: a refused or offline request left the card
 * unchanged with no message, so a post could look handled when it wasn't.
 * (PRD P1-9)
 */
import { act, fireEvent, render, screen } from "@testing-library/react"
import { CardActionError, failureMessage, useCardAction } from "@/app/studio/shared"

// jsdom has no fetch Response; failureMessage only reads status and json().
const json = (status: number, body: unknown) => ({ status, json: async () => body }) as unknown as Response
const notJson = (status: number) => ({ status, json: async () => { throw new SyntaxError("Unexpected token <") } }) as unknown as Response

describe("failureMessage", () => {
    it("tells the admin to sign in again when the session expired", async () => {
        expect(await failureMessage(json(401, { error: "Unauthorized" }), "x")).toMatch(/session expired/i)
    })

    it("shows the server's reason when there is one", async () => {
        expect(await failureMessage(json(400, { error: "slug is required" }), "x")).toBe("slug is required")
    })

    it("falls back when the body isn't JSON (e.g. a gateway error page)", async () => {
        expect(await failureMessage(notJson(502), "Couldn't delete this post.")).toBe("Couldn't delete this post.")
    })
})

function Card({ action }: { action: () => Promise<string | null> }) {
    const { pending, error, run } = useCardAction()
    return (
        <div>
            <button disabled={pending} onClick={() => void run(action)}>Publish</button>
            <CardActionError message={error} />
        </div>
    )
}

describe("useCardAction", () => {
    it("shows the returned error on the card", async () => {
        render(<Card action={async () => "Couldn't publish this post."} />)
        await act(async () => { fireEvent.click(screen.getByText("Publish")) })
        expect(screen.getByRole("alert").textContent).toBe("Couldn't publish this post.")
    })

    it("turns a thrown fetch (offline) into a message instead of an unhandled rejection", async () => {
        render(<Card action={async () => { throw new TypeError("Failed to fetch") }} />)
        await act(async () => { fireEvent.click(screen.getByText("Publish")) })
        expect(screen.getByRole("alert").textContent).toMatch(/network error/i)
    })

    it("clears the error after a later success", async () => {
        let fail = true
        render(<Card action={async () => (fail ? "Nope" : null)} />)
        await act(async () => { fireEvent.click(screen.getByText("Publish")) })
        expect(screen.getByRole("alert")).toBeTruthy()
        fail = false
        await act(async () => { fireEvent.click(screen.getByText("Publish")) })
        expect(screen.queryByRole("alert")).toBeNull()
    })

    it("runs one action at a time and disables the control meanwhile", async () => {
        let release!: () => void
        const action = jest.fn(() => new Promise<null>((resolve) => { release = () => resolve(null) }))
        render(<Card action={action} />)
        const button = screen.getByText("Publish") as HTMLButtonElement
        await act(async () => { fireEvent.click(button) })
        expect(button.disabled).toBe(true)
        fireEvent.click(button) // ignored while pending
        await act(async () => { release() })
        expect(action).toHaveBeenCalledTimes(1)
        expect(button.disabled).toBe(false)
    })
})
