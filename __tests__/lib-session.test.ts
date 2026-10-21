/**
 * lib/session — signed, expiring admin session tokens (HttpOnly cookie).
 * The token must be unforgeable, expire, die when the password rotates, and
 * fail closed when the signing secrets are missing.
 */
import {
    createSessionToken,
    verifySessionToken,
    sessionCookieOptions,
    SESSION_TTL_SECONDS,
} from "@/lib/session"

beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = "admin-password"
    process.env.SESSION_SECRET = "a-long-random-session-secret"
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe("createSessionToken / verifySessionToken", () => {
    it("round-trips a fresh token", () => {
        expect(verifySessionToken(createSessionToken())).toBe(true)
    })

    it("issues a different token every time", () => {
        expect(createSessionToken()).not.toBe(createSessionToken())
    })

    it("never contains the password", () => {
        expect(createSessionToken()).not.toContain("admin-password")
    })

    it("expires after the TTL", () => {
        const now = Date.now()
        const token = createSessionToken(now)
        expect(verifySessionToken(token, now + SESSION_TTL_SECONDS * 1000 - 1)).toBe(true)
        expect(verifySessionToken(token, now + SESSION_TTL_SECONDS * 1000)).toBe(false)
    })

    it("rejects a token whose expiry was extended", () => {
        const [, nonce, sig] = createSessionToken()!.split(".")
        const forged = `${Date.now() + 365 * 24 * 3600 * 1000}.${nonce}.${sig}`
        expect(verifySessionToken(forged)).toBe(false)
    })

    it("rejects a token signed with a different secret", () => {
        const token = createSessionToken()
        process.env.SESSION_SECRET = "attacker-guess"
        expect(verifySessionToken(token)).toBe(false)
    })

    it("signs everyone out when the admin password rotates", () => {
        const token = createSessionToken()
        process.env.LOGISTICS_PASSWORD = "new-password"
        expect(verifySessionToken(token)).toBe(false)
    })

    it("falls back to the service-role key as signing material", () => {
        delete process.env.SESSION_SECRET
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-jwt"
        expect(verifySessionToken(createSessionToken())).toBe(true)
    })

    it("fails closed when no signing material or password is configured", () => {
        delete process.env.SESSION_SECRET
        expect(createSessionToken()).toBeNull()
        process.env.SESSION_SECRET = "s"
        delete process.env.LOGISTICS_PASSWORD
        expect(createSessionToken()).toBeNull()
        expect(verifySessionToken("1.2.3")).toBe(false)
    })

    it.each([undefined, null, "", "garbage", "a.b", "a.b.c.d", "x".repeat(500), "NaN.nonce.sig"])(
        "rejects malformed token %p",
        (token) => {
            expect(verifySessionToken(token as string | null | undefined)).toBe(false)
        }
    )
})

describe("sessionCookieOptions", () => {
    it("is HttpOnly, SameSite=Strict, site-wide", () => {
        const opts = sessionCookieOptions()
        expect(opts.httpOnly).toBe(true)
        expect(opts.sameSite).toBe("strict")
        expect(opts.path).toBe("/")
        expect(opts.maxAge).toBe(SESSION_TTL_SECONDS)
    })

    it("is Secure in production", () => {
        const env = process.env as Record<string, string | undefined>
        const prev = env.NODE_ENV
        env.NODE_ENV = "production"
        expect(sessionCookieOptions().secure).toBe(true)
        env.NODE_ENV = prev
    })
})
