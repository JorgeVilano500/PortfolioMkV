/** @jest-environment jsdom */
/**
 * <AdminGate> — the Studio / Logistics sign-in screen.
 * Security: children render only after the server says the session is valid;
 * with 2FA on, a correct password leads to the code step, not the content;
 * the password is never kept in browser storage.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { AdminGate } from "@/components/features/AdminGate"

type Reply = { status?: number; body: unknown }

function mockServer(replies: Reply[]) {
    const calls: { method: string; body: unknown }[] = []
    global.fetch = jest.fn(async (_url: unknown, init?: { method?: string; body?: string }) => {
        calls.push({ method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined })
        const reply = replies.shift() ?? { status: 500, body: {} }
        return { ok: (reply.status ?? 200) < 400, status: reply.status ?? 200, json: async () => reply.body } as Response
    }) as unknown as typeof fetch
    return calls
}

const gate = () => render(
    <AdminGate title="Studio" description="Sign in to manage posts.">
        <p>secret dashboard</p>
    </AdminGate>
)

const type = async (label: string, value: string) =>
    fireEvent.change(await screen.findByLabelText(label), { target: { value } })

afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
})

describe("AdminGate", () => {
    it("shows the content straight away for an existing session", async () => {
        mockServer([{ body: { authenticated: true } }])
        gate()
        expect(await screen.findByText("secret dashboard")).toBeTruthy()
    })

    it("signs in with the password alone when 2FA is off", async () => {
        const calls = mockServer([{ body: { authenticated: false } }, { body: { authenticated: true } }])
        gate()
        await type("Password", "hunter2")
        fireEvent.click(await screen.findByRole("button", { name: "Enter" }))
        expect(await screen.findByText("secret dashboard")).toBeTruthy()
        expect(calls[1]).toEqual({ method: "POST", body: { password: "hunter2" } })
    })

    it("asks for the emailed code when 2FA is on, then signs in", async () => {
        const calls = mockServer([
            { body: { authenticated: false } },
            { body: { authenticated: false, twoFactor: "email" } },
            { body: { authenticated: true } },
        ])
        gate()
        await type("Password", "hunter2")
        fireEvent.click(await screen.findByRole("button", { name: "Enter" }))

        // Correct password is NOT enough — the code step appears instead of the content.
        await screen.findByLabelText("Sign-in code")
        expect(screen.queryByText("secret dashboard")).toBeNull()
        expect((screen.getByLabelText("Sign-in code") as HTMLInputElement).value).toBe("") // password cleared

        await type("Sign-in code", "123456")
        fireEvent.click(screen.getByRole("button", { name: "Verify" }))
        expect(await screen.findByText("secret dashboard")).toBeTruthy()
        expect(calls[2]).toEqual({ method: "POST", body: { code: "123456" } })
    })

    it("shows the server's message for a wrong code and lets the user start over", async () => {
        mockServer([
            { body: { authenticated: false } },
            { body: { authenticated: false, twoFactor: "email" } },
            { status: 401, body: { error: "Incorrect or expired code." } },
        ])
        gate()
        await type("Password", "hunter2")
        fireEvent.click(await screen.findByRole("button", { name: "Enter" }))
        await type("Sign-in code", "000000")
        fireEvent.click(screen.getByRole("button", { name: "Verify" }))

        expect((await screen.findByRole("alert")).textContent).toBe("Incorrect or expired code.")
        expect(screen.queryByText("secret dashboard")).toBeNull()

        fireEvent.click(screen.getByRole("button", { name: /start over/i }))
        expect(await screen.findByLabelText("Password")).toBeTruthy()
    })

    it("says so when locked out", async () => {
        mockServer([{ body: { authenticated: false } }, { status: 429, body: { error: "Too many attempts. Try again later." } }])
        gate()
        await type("Password", "guess")
        fireEvent.click(await screen.findByRole("button", { name: "Enter" }))
        expect((await screen.findByRole("alert")).textContent).toMatch(/too many attempts/i)
    })

    it("never stores the password in browser storage", async () => {
        mockServer([{ body: { authenticated: false } }, { body: { authenticated: true } }])
        sessionStorage.setItem("_lk", "legacy-password") // what old builds left behind
        gate()
        await type("Password", "hunter2")
        fireEvent.click(await screen.findByRole("button", { name: "Enter" }))
        await screen.findByText("secret dashboard")
        await waitFor(() => expect(sessionStorage.getItem("_lk")).toBeNull())
        const stored = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage })
        expect(stored).not.toContain("hunter2")
    })
})
