import "server-only"
import { isIP } from "net"

/**
 * Cloudflare Turnstile: the "are you human?" check on the sponsorship form
 * (SECURITY.md S-40). That form emails an address a stranger types in, and
 * its rate limits are per serverless instance, so a distributed sender could
 * otherwise push unwanted thank-you emails to people who never asked.
 *
 * Off until TURNSTILE_SECRET_KEY is set (with NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * for the widget). Once on, it fails closed: no valid token, no email.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const VERIFY_TIMEOUT_MS = 5000
const MAX_TOKEN_LENGTH = 2048 // Cloudflare's documented maximum

export type TurnstileResult = "ok" | "missing" | "invalid" | "unavailable"

export function isTurnstileEnabled(): boolean {
    return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim())
}

let warnedNoSiteKey = false

/**
 * Check a widget token with Cloudflare. "ok" when the check is off.
 * Each token is single-use: verifying spends it.
 */
export async function verifyTurnstile(token: unknown, ip: string): Promise<TurnstileResult> {
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
    if (!secret) return "ok"
    if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() && !warnedNoSiteKey) {
        warnedNoSiteKey = true
        console.error("[turnstile] TURNSTILE_SECRET_KEY is set but NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't, so the form can't show the check and every offer will be refused")
    }
    if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return "missing"

    const body = new URLSearchParams({ secret, response: token })
    if (isIP(ip)) body.set("remoteip", ip)
    try {
        const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
        if (!res.ok) {
            console.error(`[turnstile] siteverify answered ${res.status}`)
            return "unavailable"
        }
        const data = (await res.json()) as { success?: unknown; "error-codes"?: unknown }
        if (data.success === true) return "ok"
        // e.g. "invalid-input-response", "timeout-or-duplicate"; logged, never shown to the visitor
        console.warn("[turnstile] token refused:", JSON.stringify(data["error-codes"] ?? []))
        return "invalid"
    } catch (err) {
        console.error("[turnstile] siteverify failed:", err instanceof Error ? err.message : err)
        return "unavailable"
    }
}

/** Test helper — forget the one-time misconfiguration warning. */
export function resetTurnstileWarning(): void {
    warnedNoSiteKey = false
}
