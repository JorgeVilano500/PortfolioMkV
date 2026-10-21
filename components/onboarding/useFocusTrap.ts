"use client"

import { useEffect, type RefObject } from "react"

const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",")

/**
 * Keep keyboard focus inside `ref` while `active`: focus moves into the dialog
 * on open, Tab / Shift+Tab wrap around, and focus returns to whatever had it
 * before (e.g. the "Cookie settings" link) when the dialog closes.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
    useEffect(() => {
        const root = ref.current
        if (!active || !root) return

        const previouslyFocused = document.activeElement as HTMLElement | null
        const focusables = () =>
            Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[inert]"))

        // Prefer an explicit [data-autofocus] target, else the dialog itself.
        const initial = root.querySelector<HTMLElement>("[data-autofocus]") ?? root
        initial.focus({ preventScroll: true })

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return
            const items = focusables()
            if (items.length === 0) {
                e.preventDefault()
                return
            }
            const first = items[0]
            const last  = items[items.length - 1]
            const current = document.activeElement
            if (e.shiftKey && (current === first || current === root)) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && current === last) {
                e.preventDefault()
                first.focus()
            }
        }

        root.addEventListener("keydown", onKeyDown)
        return () => {
            root.removeEventListener("keydown", onKeyDown)
            if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true })
        }
    }, [ref, active])
}
