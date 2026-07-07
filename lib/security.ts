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
 * Best-effort client IP. x-forwarded-for is set by the hosting proxy
 * (Netlify) — first entry is the original client. Spoofable in theory, so
 * never use for authorization, only for rate limiting / analytics exclusion.
 */
export function getClientIp(req: NextRequest): string {
    const xff = req.headers.get("x-forwarded-for")
    if (xff) return xff.split(",")[0].trim()
    return req.headers.get("x-real-ip") ?? "unknown"
}
