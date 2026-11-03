"use client"

import { useEffect, useRef, useState } from "react"

export type CopyState = "idle" | "copied" | "failed"

/**
 * Copy text and report what happened for a couple of seconds. "Copied!" used
 * to show even when the browser refused (no clipboard API on plain http,
 * permission denied), and the refusal was an unhandled promise rejection.
 */
export function useCopyToClipboard(resetMs = 2000) {
    const [state, setState] = useState<CopyState>("idle")
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useEffect(() => () => clearTimeout(timer.current), [])

    const copy = async (text: string): Promise<boolean> => {
        let ok = false
        try {
            await navigator.clipboard.writeText(text)
            ok = true
        } catch {
            // No clipboard API (insecure context), or permission denied.
        }
        setState(ok ? "copied" : "failed")
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setState("idle"), resetMs)
        return ok
    }

    return { state, copy }
}
