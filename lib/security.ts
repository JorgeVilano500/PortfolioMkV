import { createHash, timingSafeEqual } from "crypto"
import { type NextRequest } from "next/server"

/**
 * Constant-time secret comparison.
 * Hashing both sides first means inputs of different lengths can still be
 * compared with timingSafeEqual, and no length information leaks.
 */
export function safeEqual(
    provided: string | null | undefined,
    expected: string | null | undefined
): boolean {
    if (!provided || !expected) return false
    const a = createHash("sha256").update(provided).digest()
    const b = createHash("sha256").update(expected).digest()
    return timingSafeEqual(a, b)
}

/**
 * Best-effort client IP — for rate limiting / analytics exclusion only, never
 * for authorization.
 *
 * Netlify sets x-nf-client-connection-ip from the actual connection, so it is
 * the one value a client can't choose. The first x-forwarded-for entry is
 * client-controlled (production accepted a forged one on 2026-10-19, which let
 * attackers rotate fake IPs past the auth lockout), so it is only a fallback
 * for environments without the Netlify header, such as local dev.
 */
export function getClientIp(req: NextRequest): string {
    const netlifyIp = req.headers.get("x-nf-client-connection-ip")?.trim()
    if (netlifyIp) return netlifyIp
    const xff = req.headers.get("x-forwarded-for")
    if (xff) return xff.split(",")[0].trim()
    return req.headers.get("x-real-ip") ?? "unknown"
}

/**
 * CSRF guard for cookie-authenticated requests.
 *
 * Browsers attach Sec-Fetch-Site (all current engines) and/or Origin to
 * cross-site requests and scripts can't forge either, so a mismatch means the
 * request came from another site. A request with neither header isn't coming
 * from a browser and therefore can't be a CSRF.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
    const site = req.headers.get("sec-fetch-site")
    if (site) return site === "same-origin"

    const origin = req.headers.get("origin")
    if (!origin) return true
    const host = req.headers.get("host")
    try {
        return host !== null && new URL(origin).host === host
    } catch {
        return false
    }
}
