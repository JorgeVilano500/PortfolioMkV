import "server-only"
import { createHash, timingSafeEqual } from "crypto"
import { isIP } from "net"
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
 *
 * Only well-formed IPv4/IPv6 values are accepted: the result becomes a
 * rate-limit key and (with consent) a stored value, so arbitrary header text
 * must never flow through. Anything else collapses to "unknown".
 */
export function getClientIp(req: NextRequest): string {
    return (
        cleanIp(req.headers.get("x-nf-client-connection-ip")) ??
        cleanIp(req.headers.get("x-forwarded-for")?.split(",")[0]) ??
        cleanIp(req.headers.get("x-real-ip")) ??
        "unknown"
    )
}

function cleanIp(value: string | null | undefined): string | null {
    const ip = value?.trim()
    return ip && ip.length <= 64 && isIP(ip) !== 0 ? ip : null
}

/**
 * The unit a per-client limiter should count. An IPv6 host is routinely
 * handed a whole /64, so counting per address would give one attacker 2^64
 * fresh buckets — count the /64 instead. IPv4-mapped IPv6 (::ffff:1.2.3.4)
 * collapses to its IPv4 address. Anything that isn't an IP passes through.
 */
export function ipBucket(ip: string): string {
    if (isIP(ip) !== 6) return ip
    const hextets = expandIpv6(ip)
    const isV4Mapped = hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff
    if (isV4Mapped) {
        return [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff].join(".")
    }
    return `${hextets.slice(0, 4).map((h) => h.toString(16)).join(":")}::/64`
}

/** Eight numeric hextets from any valid IPv6 spelling (::, zone id, IPv4 tail). */
function expandIpv6(ip: string): number[] {
    let addr = ip.split("%")[0].toLowerCase()
    const v4Tail = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (v4Tail) {
        const [a, b, c, d] = v4Tail.slice(1).map(Number)
        addr = addr.slice(0, -v4Tail[0].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
    }
    const [head, tail] = addr.split("::")
    const headParts = head ? head.split(":") : []
    const tailParts = tail ? tail.split(":") : []
    const fill = tail === undefined ? [] : Array<string>(8 - headParts.length - tailParts.length).fill("0")
    return [...headParts, ...fill, ...tailParts].map((h) => parseInt(h, 16))
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
