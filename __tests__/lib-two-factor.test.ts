/**
 * lib/two-factor — stateless email-code challenges for admin sign-in.
 * The challenge must prove the code without revealing it, expire, die when
 * the password rotates, and never be interchangeable with a session token.
 */
import { createSessionToken, verifySessionToken } from "@/lib/session"
import {
    TWO_FACTOR_TTL_SECONDS,
    createChallenge,
    isTwoFactorConfigured,
    isTwoFactorEnabled,
    normalizeCode,
    verifyChallenge,
} from "@/lib/two-factor"

beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = "admin-password"
    process.env.SESSION_SECRET = "a-long-random-session-secret"
})

afterEach(() => {
    delete process.env.ADMIN_2FA
    delete process.env.ADMIN_2FA_EMAIL
    delete process.env.SUMMARY_RECIPIENT_EMAIL
    delete process.env.RESEND_API_KEY
})

describe("createChallenge / verifyChallenge", () => {
    it("issues a 6-digit code that verifies against its token", () => {
        const c = createChallenge()!
        expect(c.code).toMatch(/^\d{6}$/)
        expect(verifyChallenge(c.token, c.code)).toBe(true)
    })

    it("keeps the code out of the token", () => {
        const c = createChallenge()!
        expect(c.token).not.toContain(c.code)
    })

    it("rejects any other code", () => {
        const c = createChallenge()!
        const wrong = String((Number(c.code) + 1) % 1_000_000).padStart(6, "0")
        expect(verifyChallenge(c.token, wrong)).toBe(false)
    })

    it("expires after the TTL", () => {
        const now = Date.now()
        const c = createChallenge(now)!
        expect(verifyChallenge(c.token, c.code, now + TWO_FACTOR_TTL_SECONDS * 1000 - 1)).toBe(true)
        expect(verifyChallenge(c.token, c.code, now + TWO_FACTOR_TTL_SECONDS * 1000)).toBe(false)
    })

    it("can't be extended by editing the expiry", () => {
        const c = createChallenge()!
        const [, nonce, sig] = c.token.split(".")
        expect(verifyChallenge(`${Date.now() + 10 ** 9}.${nonce}.${sig}`, c.code)).toBe(false)
    })

    it("dies when LOGISTICS_PASSWORD rotates", () => {
        const c = createChallenge()!
        process.env.LOGISTICS_PASSWORD = "rotated-password"
        expect(verifyChallenge(c.token, c.code)).toBe(false)
    })

    it("is never interchangeable with a session token", () => {
        const c = createChallenge()!
        expect(verifySessionToken(c.token)).toBe(false)
        const session = createSessionToken()!
        for (let code = 0; code < 50; code++) {
            expect(verifyChallenge(session, String(code).padStart(6, "0"))).toBe(false)
        }
    })

    it("fails closed without signing secrets", () => {
        delete process.env.SESSION_SECRET
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        expect(createChallenge()).toBeNull()
        expect(verifyChallenge("1.2.3", "123456")).toBe(false)
    })

    it.each([[null], [undefined], [""], ["x.y"], ["a.b.c.d"], ["x".repeat(500)]])("rejects malformed token %p", (token) => {
        expect(verifyChallenge(token as string | null, "123456")).toBe(false)
    })

    it("draws codes from the whole range (no obvious bias)", () => {
        const codes = new Set(Array.from({ length: 200 }, () => createChallenge()!.code))
        expect(codes.size).toBeGreaterThan(190)
    })
})

describe("normalizeCode", () => {
    it.each([["123456", "123456"], [" 123 456 ", "123456"], ["123-456", "123456"], ["000042", "000042"]])(
        "accepts %p", (input, expected) => expect(normalizeCode(input)).toBe(expected))

    it.each([["12345"], ["1234567"], ["12345a"], [123456], [null], ["1".repeat(30)]])(
        "rejects %p", (input) => expect(normalizeCode(input)).toBeNull())
})

describe("configuration", () => {
    it("is off unless ADMIN_2FA=email", () => {
        expect(isTwoFactorEnabled()).toBe(false)
        process.env.ADMIN_2FA = "yes"
        expect(isTwoFactorEnabled()).toBe(false)
        process.env.ADMIN_2FA = "email"
        expect(isTwoFactorEnabled()).toBe(true)
    })

    it("needs a recipient and a Resend key to be usable", () => {
        expect(isTwoFactorConfigured()).toBe(false)
        process.env.RESEND_API_KEY = "re_test"
        expect(isTwoFactorConfigured()).toBe(false)
        process.env.SUMMARY_RECIPIENT_EMAIL = "me@example.com"
        expect(isTwoFactorConfigured()).toBe(true)
        delete process.env.SUMMARY_RECIPIENT_EMAIL
        process.env.ADMIN_2FA_EMAIL = "owner@example.com"
        expect(isTwoFactorConfigured()).toBe(true)
    })
})
