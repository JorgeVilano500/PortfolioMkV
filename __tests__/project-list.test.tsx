/** @jest-environment jsdom */
/**
 * Home's project list (lib/projects-data + components/ui/ProjectList). A row
 * edited by hand in the Supabase dashboard (status "Live", theme null, tags
 * null) used to crash the whole Home page, and the "View →" link was
 * invisible on touch screens.
 */
import { render, screen } from "@testing-library/react"

jest.mock("@/lib/supabase", () => ({ supabase: {} }))

import { normalizeProject } from "@/lib/projects-data"
import { ProjectList } from "@/components/ui/ProjectList"

const good = {
    id: "p1", title: "Dice", description: "Roll", icon: "🎲", category: "Game", status: "live", theme: "green",
    tags: ["React"], year: "2025", link: "https://dice.example", github: "", featured: true, created_at: "2025-01-01",
}

describe("normalizeProject", () => {
    it("keeps a valid row as it is", () => {
        expect(normalizeProject(good)).toEqual(good)
    })

    it("coerces hand-edited values instead of passing them on", () => {
        const row = normalizeProject({ id: "p2", title: "Odd", status: "Live", theme: null, tags: null, featured: "yes", description: null })
        expect(row).toMatchObject({ status: "planned", theme: "purple", tags: [], featured: false, description: "", link: "" })
    })

    it("drops links that aren't http(s)", () => {
        expect(normalizeProject({ ...good, link: "javascript:alert(1)", github: "ftp://x" })).toMatchObject({ link: "", github: "" })
    })

    it("drops non-string tags", () => {
        expect(normalizeProject({ ...good, tags: ["React", 7, null, "Go"] }).tags).toEqual(["React", "Go"])
    })
})

describe("ProjectList", () => {
    it("renders a hand-edited row instead of crashing", () => {
        render(<ProjectList projects={[normalizeProject(good), normalizeProject({ id: "p2", title: "Odd", status: "Live", theme: null, tags: null })]} />)
        expect(screen.getByText("Odd")).toBeTruthy()
        expect(screen.getByText("Planned")).toBeTruthy()
        expect(screen.getByText("No link yet")).toBeTruthy()
    })

    it("keeps the link visible without hover (touch) and on keyboard focus", () => {
        render(<ProjectList projects={[normalizeProject(good)]} />)
        const link = screen.getByRole("link", { name: "View →" })
        expect(link.className).toMatch(/\[@media\(hover:none\)\]:opacity-100/)
        expect(link.className).toMatch(/group-focus-within:opacity-100/)
    })
})
