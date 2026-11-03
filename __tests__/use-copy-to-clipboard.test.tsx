/** @jest-environment jsdom */
/**
 * components/ui/useCopyToClipboard — used by "Copy link" on posts, "Copy
 * Email" on /contact, and code blocks. "Copied!" used to appear even when the
 * browser refused the write, and the refusal was an unhandled rejection.
 */
import { act, fireEvent, render, screen } from "@testing-library/react"
import { useCopyToClipboard } from "@/components/ui/useCopyToClipboard"

function CopyButton() {
    const { state, copy } = useCopyToClipboard()
    return <button onClick={() => void copy("hello")}>{state}</button>
}

const setClipboard = (clipboard: unknown) =>
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard })

afterEach(() => jest.useRealTimers())

it("says copied only once the browser accepted the text, then resets", async () => {
    jest.useFakeTimers()
    const writeText = jest.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    render(<CopyButton />)
    await act(async () => { fireEvent.click(screen.getByRole("button")) })
    expect(writeText).toHaveBeenCalledWith("hello")
    expect(screen.getByRole("button").textContent).toBe("copied")
    act(() => { jest.advanceTimersByTime(2000) })
    expect(screen.getByRole("button").textContent).toBe("idle")
})

it("reports a refused write instead of claiming success", async () => {
    setClipboard({ writeText: jest.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")) })
    render(<CopyButton />)
    await act(async () => { fireEvent.click(screen.getByRole("button")) })
    expect(screen.getByRole("button").textContent).toBe("failed")
})

it("reports failure where there's no clipboard API (plain http)", async () => {
    setClipboard(undefined)
    render(<CopyButton />)
    await act(async () => { fireEvent.click(screen.getByRole("button")) })
    expect(screen.getByRole("button").textContent).toBe("failed")
})
