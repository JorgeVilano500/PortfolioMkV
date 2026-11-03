/**
 * lib/laptop-keyboard — the keyboard layout the 3D viewer and the 2D fallback
 * both draw. Rows that don't add up would leave keys hanging off the plane.
 */
import { KEYBOARD_UNITS, KEY_ROWS, TOUCH_BAR } from "@/lib/laptop-keyboard"

const width = (row: readonly { width?: number }[]) => row.reduce((sum, key) => sum + (key.width ?? 1), 0)

describe("keyboard layout", () => {
    it("has five rows of keys under the Touch Bar", () => {
        expect(KEY_ROWS).toHaveLength(5)
    })

    it.each(KEY_ROWS.map((row, i) => [i + 1, row] as const))("row %i fills the full width", (_, row) => {
        expect(width(row)).toBeCloseTo(KEYBOARD_UNITS)
    })

    it("leaves room on the Touch Bar row for esc, the strip, and Touch ID", () => {
        expect(TOUCH_BAR.escWidth + TOUCH_BAR.touchIdWidth).toBeLessThan(KEYBOARD_UNITS / 2)
        expect(TOUCH_BAR.height).toBeGreaterThan(0)
        expect(TOUCH_BAR.height).toBeLessThan(1)
    })

    it("has the full alphabet once, plus the 2019 layout's landmarks", () => {
        const labels = KEY_ROWS.flat().map((key) => key.label)
        const letters = labels.filter((label) => /^[A-Z]$/.test(label)).sort()
        expect(letters.join("")).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        for (const label of ["delete", "tab", "caps lock", "return", "shift", "fn", "control", "option", "command"]) {
            expect(labels).toContain(label)
        }
        // Butterfly-era arrows: full-height left and right, half-height up and down stacked between them.
        expect(KEY_ROWS[4].find((key) => key.stack)?.stack).toEqual(["▲", "▼"])
    })

    it("prints modifier names in a corner and symbol pairs stacked", () => {
        for (const key of KEY_ROWS.flat()) {
            if (key.label.length > 1 && !key.stack) expect(key.align).toBeDefined()
            if (key.shift) expect(key.align).toBeUndefined()
        }
    })
})
