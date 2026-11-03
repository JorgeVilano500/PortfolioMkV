"use client"

/**
 * The Cloudflare Turnstile widget for the "Sponsor a spot" form (SECURITY.md
 * S-40). Rendered only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; its
 * script loads when the dialog opens, so no other page talks to Cloudflare.
 * The CSP allows https://challenges.cloudflare.com only when the key is set
 * (next.config.ts).
 */
import { useEffect, useEffectEvent, useRef, useState } from "react"

type TurnstileApi = {
    render: (el: HTMLElement, options: Record<string, unknown>) => string
    reset:  (widgetId: string) => void
    remove: (widgetId: string) => void
}

declare global {
    interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

let scriptLoad: Promise<void> | null = null

function loadScript(): Promise<void> {
    if (window.turnstile) return Promise.resolve()
    scriptLoad ??= new Promise<void>((resolve, reject) => {
        const script = document.createElement("script")
        script.src   = SCRIPT_SRC
        script.async = true
        script.onload  = () => resolve()
        script.onerror = () => {
            scriptLoad = null // allow a retry next time the dialog opens
            script.remove()
            reject(new Error("Turnstile script failed to load"))
        }
        document.head.appendChild(script)
    })
    return scriptLoad
}

/** The public site key, or "" when the check is off. Read per render so tests can toggle it. */
export function turnstileSiteKey(): string {
    return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? ""
}

type Props = {
    /** A fresh token, or null when it expired or the check errored. */
    onToken:     (token: string | null) => void
    /** Increment to get a new token (tokens are single-use). */
    resetSignal: number
}

export function Turnstile({ onToken, resetSignal }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetRef    = useRef<string | null>(null)
    const [failed, setFailed] = useState(false)
    const emit = useEffectEvent((token: string | null) => onToken(token))

    useEffect(() => {
        let cancelled = false
        loadScript()
            .then(() => {
                if (cancelled || !containerRef.current || !window.turnstile) return
                widgetRef.current = window.turnstile.render(containerRef.current, {
                    sitekey:            turnstileSiteKey(),
                    action:             "sponsorship",
                    theme:              "dark",
                    callback:           (token: string) => emit(token),
                    "expired-callback": () => emit(null),
                    "error-callback":   () => emit(null),
                })
            })
            .catch(() => { if (!cancelled) setFailed(true) })
        return () => {
            cancelled = true
            if (widgetRef.current) window.turnstile?.remove(widgetRef.current)
            widgetRef.current = null
        }
    }, [])

    useEffect(() => {
        if (resetSignal === 0 || !widgetRef.current) return
        window.turnstile?.reset(widgetRef.current)
        emit(null)
    }, [resetSignal])

    if (failed) {
        return (
            <p role="alert" className="text-xs text-pink-400">
                The spam check couldn&apos;t load. Check your connection or any content blocker, then reopen this form.
            </p>
        )
    }
    return <div ref={containerRef} className="min-h-16" data-testid="turnstile" />
}
