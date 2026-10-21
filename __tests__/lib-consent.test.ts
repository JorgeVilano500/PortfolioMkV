/**
 * lib/consent — the consent cookie is what the server trusts to decide
 * whether analytics may be stored, so parsing must be strict.
 */
import {
    CONSENT_COOKIE,
    CONSENT_MAX_AGE_DAYS,
    CONSENT_VERSION,
    allowsAnalytics,
    consentCookieString,
    isCurrentConsent,
    parseConsent,
    readConsentFromCookieHeader,
    serializeConsent,
    type ConsentState,
} from "@/lib/consent"

const state: ConsentState = {
    version: CONSENT_VERSION,
    analytics: true,
    decidedAt: 1_760_000_000_000,
    id: "7d3f4b2a-1c9e-4f60-8a1b-2c3d4e5f6a7b",
}

describe("serialize / parse", () => {
    it("round-trips", () => {
        expect(parseConsent(serializeConsent(state))).toEqual(state)
        expect(parseConsent(serializeConsent({ ...state, analytics: false }))).toEqual({ ...state, analytics: false })
    })

    it("accepts the already-decoded form (frameworks differ on decoding cookies)", () => {
        expect(parseConsent(decodeURIComponent(serializeConsent(state)))).toEqual(state)
    })

    it("stays small enough for a cookie", () => {
        expect(serializeConsent(state).length).toBeLessThan(200)
    })

    it.each([
        ["empty", ""],
        ["not JSON", "hello"],
        ["an array", "[1,1,1]"],
        ["missing id", JSON.stringify({ v: 1, a: 1, t: 1 })],
        ["non-uuid id", JSON.stringify({ v: 1, a: 1, t: 1, id: "abc" })],
        ["boolean instead of 0/1", JSON.stringify({ v: 1, a: true, t: 1, id: state.id })],
        ["analytics = 2", JSON.stringify({ v: 1, a: 2, t: 1, id: state.id })],
        ["version 0", JSON.stringify({ v: 0, a: 1, t: 1, id: state.id })],
        ["fractional version", JSON.stringify({ v: 1.5, a: 1, t: 1, id: state.id })],
        ["negative time", JSON.stringify({ v: 1, a: 1, t: -5, id: state.id })],
        ["oversized", "x".repeat(400)],
    ])("rejects %s", (_label, raw) => {
        expect(parseConsent(raw)).toBeNull()
    })
})

describe("policy versioning", () => {
    it("only counts choices made under the current version", () => {
        expect(isCurrentConsent(state)).toBe(true)
        expect(isCurrentConsent({ ...state, version: CONSENT_VERSION + 1 })).toBe(false)
        expect(isCurrentConsent(null)).toBe(false)
    })

    it("allows analytics only for a current, explicit opt-in", () => {
        expect(allowsAnalytics(state)).toBe(true)
        expect(allowsAnalytics({ ...state, analytics: false })).toBe(false)
        expect(allowsAnalytics({ ...state, version: CONSENT_VERSION + 1 })).toBe(false)
        expect(allowsAnalytics(null)).toBe(false)
    })
})

describe("cookie helpers", () => {
    it("builds a first-party, SameSite=Lax cookie that lasts the documented period", () => {
        const cookie = consentCookieString(state, true)
        expect(cookie.startsWith(`${CONSENT_COOKIE}=`)).toBe(true)
        expect(cookie).toContain(`Max-Age=${CONSENT_MAX_AGE_DAYS * 86400}`)
        expect(cookie).toContain("Path=/")
        expect(cookie).toContain("SameSite=Lax")
        expect(cookie).toContain("Secure")
        expect(consentCookieString(state, false)).not.toContain("Secure")
    })

    it("reads the consent cookie out of a full Cookie header", () => {
        const header = `theme=dark; ${CONSENT_COOKIE}=${serializeConsent(state)}; other=1`
        expect(readConsentFromCookieHeader(header)).toEqual(state)
        expect(readConsentFromCookieHeader("theme=dark")).toBeNull()
        expect(readConsentFromCookieHeader("")).toBeNull()
    })
})
