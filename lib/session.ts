/**
 * Signed, expiring admin sessions for the Studio / Logistics UI.
 *
 * The UI used to keep the raw admin password in sessionStorage and replay it
 * on every request — readable by any script running on the page. Now the
 * password is sent once (POST /api/auth) and exchanged for an HttpOnly,
 * SameSite=Strict cookie that scripts can't read.
 *
 * Token: `<expiresAtMs>.<nonce>.<sig>`, sig = HMAC-SHA256(key, "<expiresAtMs>.<nonce>").
 * The key mixes a high-entropy server secret (SESSION_SECRET, falling back to
 * SUPABASE_SERVICE_ROLE_KEY) with LOGISTICS_PASSWORD, so a stolen cookie can't
 * be used to brute-force the password offline, and rotating the password
 * signs every session out. Tokens are stateless: sign-out clears the cookie,
 * and rotation is the server-side kill switch.
 */
import "server-only"
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto"

const isProduction = process.env.NODE_ENV === "production"

/**
 * `__Host-` in production: browsers then refuse the cookie unless it's
 * Secure, Path=/ and has no Domain, so a sibling subdomain can't plant or
 * overwrite it (cookie tossing / session fixation). Plain-http dev servers
 * can't set a Secure cookie, so development keeps the bare name.
 */
export const SESSION_COOKIE = isProduction ? "__Host-admin_session" : "admin_session"
export const SESSION_TTL_SECONDS = 8 * 60 * 60

const MAX_TOKEN_LENGTH = 200

/** Also signs two-factor challenges (lib/two-factor.ts), domain-separated there. */
export function getSessionKey(): Buffer | null {
    const password = process.env.LOGISTICS_PASSWORD
    const material = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!password || !material) return null
    return createHash("sha256").update(`portfoliomkv-session-v1\0${material}\0${password}`).digest()
}

function sign(key: Buffer, payload: string): string {
    return createHmac("sha256", key).update(payload).digest("base64url")
}

/** A fresh session token, or null when sessions can't be signed (fail closed). */
export function createSessionToken(now = Date.now()): string | null {
    const key = getSessionKey()
    if (!key) return null
    const payload = `${now + SESSION_TTL_SECONDS * 1000}.${randomBytes(16).toString("base64url")}`
    return `${payload}.${sign(key, payload)}`
}

export function verifySessionToken(token: string | null | undefined, now = Date.now()): boolean {
    if (!token || token.length > MAX_TOKEN_LENGTH) return false
    const key = getSessionKey()
    if (!key) return false

    const parts = token.split(".")
    if (parts.length !== 3) return false
    const [exp, nonce, sig] = parts
    const expiresAt = Number(exp)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false

    const expected = Buffer.from(sign(key, `${exp}.${nonce}`))
    const provided = Buffer.from(sig)
    return provided.length === expected.length && timingSafeEqual(provided, expected)
}

/** Cookie attributes for the session (and 2FA challenge) cookie; pass maxAge 0 to clear it. */
export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
    return {
        httpOnly: true,
        secure: isProduction, // required by the __Host- prefix
        sameSite: "strict" as const,
        path: "/",            // required by the __Host- prefix (and no `domain`)
        maxAge,
    }
}
