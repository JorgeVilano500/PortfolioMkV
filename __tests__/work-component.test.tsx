/** @jest-environment jsdom */
/**
 * components/ui/WorkComponent — the /work bento grid. The featured and side
 * cards used to hard-code "Live" and link to "#" (opening the same page in a
 * new tab) when a project had no link.
 */
import { fireEvent, render, screen, within } from "@testing-library/react"

jest.mock("next/link", () => {
    const { createElement } = jest.requireActual("react")
    return { __esModule: true, default: ({ children, ...rest }: { children?: unknown }) => createElement("a", rest, children) }
})

const base = { cat: "Game", desc: "d", tags: ["t"], cardBg: "", iconBg: "", catColor: "", tagStyle: "", icon: "🎲" }
jest.mock("@/lib/projects", () => ({
    projects: [
        { ...base, id: 1, title: "Featured WIP",  status: "wip",     featured: true,  filters: ["Games"], link: "" },
        { ...base, id: 2, title: "Side Planned",  status: "planned", featured: false, filters: ["Games"], link: "" },
        { ...base, id: 3, title: "Small Live",    status: "live",    featured: false, filters: ["Games", "UI/UX"], link: "https://example.com/live" },
    ],
}))

import { WorkComponent } from "@/components/ui/WorkComponent"

const card = (title: string) => screen.getByText(title).closest("div.rounded-2xl") as HTMLElement

it("shows each card's real status, including the featured and side cards", () => {
    render(<WorkComponent />)
    expect(within(card("Featured WIP")).getByText("In Progress")).toBeTruthy()
    expect(within(card("Side Planned")).getByText("Planned")).toBeTruthy()
    expect(within(card("Small Live")).getByText("Live")).toBeTruthy()
    expect(within(card("Featured WIP")).queryByText("Live")).toBeNull()
})

it("never renders a dead '#' link; projects without a link say so", () => {
    const { container } = render(<WorkComponent />)
    expect(container.querySelector('a[href="#"]')).toBeNull()
    expect(within(card("Featured WIP")).getByText("No link yet")).toBeTruthy()
    const live = within(card("Small Live")).getByRole("link", { name: "View →" })
    expect(live.getAttribute("href")).toBe("https://example.com/live")
    expect(live.getAttribute("rel")).toBe("noopener noreferrer")
})

it("filters, and the laptop card mentions both sticker surfaces", () => {
    render(<WorkComponent />)
    fireEvent.click(screen.getByRole("button", { name: "UI/UX" }))
    expect(screen.queryByText("Featured WIP")).toBeNull()
    expect(screen.getByText("Small Live")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Sticker the laptop/ }).textContent).toMatch(/lid and the palm rest/)
})
