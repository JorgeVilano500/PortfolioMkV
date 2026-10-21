/**
 * lib/tour — the guided tour definition and its navigation rules.
 * Includes integrity checks against the real pages, so renaming a route or
 * deleting a data-tour anchor can't silently break the tour.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"
import {
    NAV_ITEMS,
    TOUR_STEPS,
    clampStep,
    firstStepForPath,
    resolveTourIndex,
    tourPages,
    upcomingPageChange,
} from "@/lib/tour"

const ROOT = process.cwd()

function pageFileFor(path: string): string {
    return join(ROOT, "app", ...path.split("/").filter(Boolean), "page.tsx")
}

function allSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) return allSourceFiles(full)
        return /\.tsx?$/.test(name) ? [full] : []
    })
}

describe("definition integrity", () => {
    it("has unique step ids", () => {
        const ids = TOUR_STEPS.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it("only visits pages that exist", () => {
        for (const step of TOUR_STEPS) expect(existsSync(pageFileFor(step.path))).toBe(true)
    })

    it("uses the nav key that matches each page", () => {
        for (const step of TOUR_STEPS) {
            expect(NAV_ITEMS.find((n) => n.key === step.nav)?.href).toBe(step.path)
        }
    })

    it("keeps each page's steps together (no ping-ponging between pages)", () => {
        const order = TOUR_STEPS.map((s) => s.path).filter((p, i, a) => i === 0 || a[i - 1] !== p)
        expect(new Set(order).size).toBe(order.length)
    })

    it("has a data-tour anchor in the source for every spotlight target", () => {
        const sources = [...allSourceFiles(join(ROOT, "app")), ...allSourceFiles(join(ROOT, "components"))]
            .map((f) => readFileSync(f, "utf8"))
            .join("\n")
        for (const step of TOUR_STEPS) {
            if (step.target) expect(sources).toContain(`data-tour="${step.target}"`)
        }
    })

    it("visits every main page, Home first", () => {
        expect(tourPages()).toEqual(["home", "work", "about", "blog", "contact"])
        expect(TOUR_STEPS[0].path).toBe("/")
    })
})

describe("navigation helpers", () => {
    const lastHome = TOUR_STEPS.filter((s) => s.path === "/").length - 1
    const firstWork = firstStepForPath("/work")

    it("clamps step indexes", () => {
        expect(clampStep(-3)).toBe(0)
        expect(clampStep(999)).toBe(TOUR_STEPS.length - 1)
        expect(clampStep(1.7)).toBe(1)
    })

    it("knows when the next step is on another page", () => {
        expect(upcomingPageChange(0)).toBeNull()
        expect(upcomingPageChange(lastHome)?.path).toBe("/work")
        expect(upcomingPageChange(TOUR_STEPS.length - 1)).toBeNull()
    })

    it("stays put on the current step's page", () => {
        expect(resolveTourIndex(1, "/")).toEqual({ index: 1, offRoute: false })
    })

    it("advances when the visitor clicks the highlighted tab", () => {
        expect(resolveTourIndex(lastHome, "/work")).toEqual({ index: lastHome + 1, offRoute: false })
    })

    it("jumps to the first step of a tour page the visitor skipped ahead to", () => {
        expect(resolveTourIndex(0, "/blog")).toEqual({ index: firstStepForPath("/blog"), offRoute: false })
        expect(resolveTourIndex(firstWork, "/")).toEqual({ index: 0, offRoute: false })
    })

    it("flags pages outside the tour without losing the step", () => {
        expect(resolveTourIndex(firstWork, "/blog/some-post")).toEqual({ index: firstWork, offRoute: true })
        expect(resolveTourIndex(2, "/privacy")).toEqual({ index: 2, offRoute: true })
    })
})
