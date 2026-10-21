/**
 * Visitor consent — the single source of truth shared by the browser (intro
 * modal, PageTracker) and the server (/api/analytics/track, /api/consent).
 *
 * The choice lives in a first-party cookie so the server can enforce it:
 * analytics are recorded ONLY when the cookie says the visitor opted in. No
 * cookie, a malformed cookie, an outdated policy version, or analytics=false
 * all mean "do not track".
 *
 * Bump CONSENT_VERSION whenever what we collect or why changes — every
 * visitor is then asked again (their old choice no longer counts).
 */

export const CONSENT_COOKIE = "java_consent"
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE_DAYS = 180
/** Mirror of the cookie, so a browser that blocks cookies isn't re-prompted on every page. */
export const CONSENT_STORAGE_KEY = "java_consent"
/** Human-readable policy date shown in the modal and on /privacy. */
export const PRIVACY_POLICY_UPDATED = "October 20, 2026"

export type ConsentState = {
    /** Policy version the choice was made under. */
    version: number
    /** Optional analytics (IP, device, language, timezone, pages visited). */
    analytics: boolean
    /** When the choice was made (ms since epoch). */
    decidedAt: number
    /** Random visitor id — consent receipt, and analytics visitor id if opted in. */
    id: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_COOKIE_LENGTH = 300

/** Compact wire format: {"v":1,"a":1,"t":1760000000000,"id":"…"} (URI-encoded). */
export function serializeConsent(state: ConsentState): string {
    return encodeURIComponent(JSON.stringify({
        v: state.version,
        a: state.analytics ? 1 : 0,
        t: state.decidedAt,
        id: state.id,
    }))
}

/**
 * Parse a cookie/storage value. Accepts URI-encoded or already-decoded JSON
 * (frameworks differ on whether they decode cookie values). Returns null for
 * anything that isn't exactly the expected shape.
 */
export function parseConsent(raw: string | null | undefined): ConsentState | null {
    if (!raw || raw.length > MAX_COOKIE_LENGTH) return null
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        try {
            data = JSON.parse(decodeURIComponent(raw))
        } catch {
            return null
        }
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null
    const { v, a, t, id } = data as Record<string, unknown>
    if (!Number.isInteger(v) || (v as number) < 1) return null
    if (a !== 0 && a !== 1) return null
    if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) return null
    if (typeof id !== "string" || !UUID_RE.test(id)) return null
    return { version: v as number, analytics: a === 1, decidedAt: t, id }
}

/** A choice only counts if it was made under the current policy version. */
export function isCurrentConsent(state: ConsentState | null): state is ConsentState {
    return state !== null && state.version === CONSENT_VERSION
}

/** True only for a current, explicit analytics opt-in. */
export function allowsAnalytics(state: ConsentState | null): boolean {
    return isCurrentConsent(state) && state.analytics
}

/** Full Set-Cookie style attribute string for document.cookie. */
export function consentCookieString(state: ConsentState, secure: boolean): string {
    const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60
    return `${CONSENT_COOKIE}=${serializeConsent(state)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`
}

/** Read the consent cookie out of a raw `document.cookie` / Cookie header string. */
export function readConsentFromCookieHeader(cookieHeader: string | null | undefined): ConsentState | null {
    if (!cookieHeader) return null
    for (const part of cookieHeader.split(";")) {
        const eq = part.indexOf("=")
        if (eq === -1) continue
        if (part.slice(0, eq).trim() === CONSENT_COOKIE) return parseConsent(part.slice(eq + 1).trim())
    }
    return null
}

/** What optional analytics records — rendered in the modal and on /privacy so they never drift. */
export const ANALYTICS_DATA_POINTS: { label: string; detail: string }[] = [
    { label: "IP address",           detail: "The network address your request came from." },
    { label: "Browser & device",     detail: "Your browser's user-agent string and screen width." },
    { label: "Language & timezone",  detail: "From your browser settings, e.g. en-US · America/Los_Angeles." },
    { label: "Pages & referrer",     detail: "Which pages you view, page load time, and the site that linked you here (domain only)." },
    { label: "Visitor ID",           detail: "A random ID so repeat visits can be counted. It isn't linked to your name or email." },
]
