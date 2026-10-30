/**
 * Shared analytics rules for the browser tracker (components/ui/PageTracker)
 * and the server route (/api/analytics/track), so the two can't drift.
 */

/** Pages that are never tracked (internal/admin surfaces). */
export const ANALYTICS_SKIP_PREFIXES = ["/logistics", "/studio", "/api"]

export function isTrackablePath(path: string): boolean {
    return !ANALYTICS_SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))
}

/**
 * A same-site path as the tracker sends it: URL path characters only
 * (RFC 3986 pchar plus "/"), no protocol-relative "//" prefix, no query or
 * fragment, no whitespace or markup. Every real route is ASCII, so anything
 * else is a forged request and isn't stored.
 */
const PAGE_PATH_RE = /^\/(?!\/)[A-Za-z0-9\-._~%!$&'()*+,;=:@/]*$/

export function isValidPagePath(path: string): boolean {
    return PAGE_PATH_RE.test(path)
}

/** BCP 47-ish language tag from navigator.language, e.g. "en-US", "zh-Hant-TW". */
const LANGUAGE_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/
/** IANA timezone from Intl, e.g. "America/Los_Angeles", "Etc/GMT+8", "UTC". */
const TIMEZONE_RE = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+){0,2}$/

export function normalizeLanguage(v: unknown): string | null {
    return typeof v === "string" && v.length <= 35 && LANGUAGE_RE.test(v) ? v : null
}

export function normalizeTimezone(v: unknown): string | null {
    return typeof v === "string" && v.length <= 64 && TIMEZONE_RE.test(v) ? v : null
}
