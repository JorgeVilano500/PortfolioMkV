/**
 * The 2019 13-inch MacBook Pro keyboard (US layout, butterfly keys, Touch Bar),
 * as data. The 3D viewer draws its keys and backlight from this, and the 2D
 * fallback draws the same layout, so the two can't drift apart.
 *
 * Widths are in key units: one letter key, including its share of the gaps.
 * Every row adds up to KEYBOARD_UNITS.
 */

export type KeyCap = {
    /** Main legend. Modifier keys use their printed name ("tab", "shift"). */
    label:  string
    /** The legend above it, on number and symbol keys ("!" over "1"). */
    shift?: string
    /** Width in key units; 1 when omitted. */
    width?: number
    /** Where a modifier's legend sits: MacBook modifiers print in a corner. */
    align?: "left" | "right"
    /** A small symbol printed above a modifier's name ("⌘" on command). */
    glyph?: string
    /** Two half-height keys stacked in one slot (the ▲/▼ arrow pair). */
    stack?: readonly [string, string]
}

export const KEYBOARD_UNITS = 14.5

/** The Touch Bar row: a virtual esc key, the OLED strip, then Touch ID. */
export const TOUCH_BAR = {
    escWidth:     1.25,
    touchIdWidth: 1,
    /** Row height as a fraction of a key row. */
    height:       0.6,
} as const

export const KEY_ROWS: readonly (readonly KeyCap[])[] = [
    [
        { label: "`", shift: "~" }, { label: "1", shift: "!" }, { label: "2", shift: "@" }, { label: "3", shift: "#" },
        { label: "4", shift: "$" }, { label: "5", shift: "%" }, { label: "6", shift: "^" }, { label: "7", shift: "&" },
        { label: "8", shift: "*" }, { label: "9", shift: "(" }, { label: "0", shift: ")" }, { label: "-", shift: "_" },
        { label: "=", shift: "+" }, { label: "delete", width: 1.5, align: "right" },
    ],
    [
        { label: "tab", width: 1.5, align: "left" },
        ..."QWERTYUIOP".split("").map((label) => ({ label })),
        { label: "[", shift: "{" }, { label: "]", shift: "}" }, { label: "\\", shift: "|" },
    ],
    [
        { label: "caps lock", width: 1.75, align: "left" },
        ..."ASDFGHJKL".split("").map((label) => ({ label })),
        { label: ";", shift: ":" }, { label: "'", shift: "\"" },
        { label: "return", width: 1.75, align: "right" },
    ],
    [
        { label: "shift", width: 2.25, align: "left", glyph: "⇧" },
        ..."ZXCVBNM".split("").map((label) => ({ label })),
        { label: ",", shift: "<" }, { label: ".", shift: ">" }, { label: "/", shift: "?" },
        { label: "shift", width: 2.25, align: "right", glyph: "⇧" },
    ],
    [
        { label: "fn", align: "left" },
        { label: "control", align: "left", glyph: "⌃" },
        { label: "option", align: "left", glyph: "⌥" },
        { label: "command", width: 1.25, align: "left", glyph: "⌘" },
        { label: "", width: 5 }, // space bar
        { label: "command", width: 1.25, align: "right", glyph: "⌘" },
        { label: "option", align: "right", glyph: "⌥" },
        { label: "◀" }, { label: "", stack: ["▲", "▼"] }, { label: "▶" },
    ],
]
