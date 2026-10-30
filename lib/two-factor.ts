/**
 * Optional email second factor for admin sign-in (ADMIN_2FA=email).
 *
 * With it on, the right password alone no longer opens Studio/Logistics:
 * POST /api/auth emails a 6-digit code to the owner and answers with a
 * short-lived challenge cookie; the code is then exchanged for the session.
 * The email doubles as an alarm — a code nobody asked for means someone has
 * the password.
 *
 * Challenge: `<expiresAtMs>.<nonce>.<sig>`, sig = HMAC-SHA256(sessionKey,
 * "admin-2fa-v1\0<expiresAtMs>.<nonce>\0<code>"). Stateless like the session:
 * the code never leaves the server except in the email, can't be recovered
 * from the cookie, and rotating LOGISTICS_PASSWORD voids pending challenges.
 * The "admin-2fa-v1" prefix keeps a challenge from ever verifying as a
 * session token (or the reverse). Wrong codes count toward the same lockout
 * as wrong passwords.
 */
import "server-only"
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto"
import { Resend } from "resend"
import { getSessionKey } from "./session"

export const TWO_FACTOR_COOKIE = process.env.NODE_ENV === "production" ? "__Host-admin_2fa" : "admin_2fa"
export const TWO_FACTOR_TTL_SECONDS = 10 * 60

const CODE_RE = /^\d{6}$/
const MAX_TOKEN_LENGTH = 200

export function isTwoFactorEnabled(): boolean {
    return process.env.ADMIN_2FA === "email"
}

/** Where codes go: ADMIN_2FA_EMAIL, else the inbox-summary recipient. */
function recipient(): string | null {
    return process.env.ADMIN_2FA_EMAIL?.trim() || process.env.SUMMARY_RECIPIENT_EMAIL?.trim() || null
}

/** Enabled but unable to deliver codes → sign-in must refuse, never skip the factor. */
export function isTwoFactorConfigured(): boolean {
    return Boolean(recipient() && process.env.RESEND_API_KEY)
}

function sign(key: Buffer, payload: string, code: string): string {
    return createHmac("sha256", key).update(`admin-2fa-v1\0${payload}\0${code}`).digest("base64url")
}

/** Normalise what a person types ("123 456", " 123456 ") to six digits, or null. */
export function normalizeCode(input: unknown): string | null {
    if (typeof input !== "string" || input.length > 20) return null
    const digits = input.replace(/[\s-]/g, "")
    return CODE_RE.test(digits) ? digits : null
}

/** A fresh code and the challenge token that proves it, or null without a signing key. */
export function createChallenge(now = Date.now()): { code: string; token: string } | null {
    const key = getSessionKey()
    if (!key) return null
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0")
    const payload = `${now + TWO_FACTOR_TTL_SECONDS * 1000}.${randomBytes(16).toString("base64url")}`
    return { code, token: `${payload}.${sign(key, payload, code)}` }
}

export function verifyChallenge(token: string | null | undefined, code: string | null, now = Date.now()): boolean {
    if (!token || token.length > MAX_TOKEN_LENGTH || !code || !CODE_RE.test(code)) return false
    const key = getSessionKey()
    if (!key) return false

    const parts = token.split(".")
    if (parts.length !== 3) return false
    const [exp, nonce, sig] = parts
    const expiresAt = Number(exp)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false

    const expected = Buffer.from(sign(key, `${exp}.${nonce}`, code))
    const provided = Buffer.from(sig)
    return provided.length === expected.length && timingSafeEqual(provided, expected)
}

/** Email the code to the owner. Returns false if the provider refused. */
export async function sendCode(code: string, context: { ip: string; device: string }): Promise<boolean> {
    const to = recipient()
    const apiKey = process.env.RESEND_API_KEY
    if (!to || !apiKey) return false

    const minutes = TWO_FACTOR_TTL_SECONDS / 60
    const text = [
        `Your admin sign-in code is ${code}`,
        "",
        `It expires in ${minutes} minutes and works once you've entered the password.`,
        `Requested from ${context.ip} (${context.device}) at ${new Date().toUTCString()}.`,
        "",
        "Didn't try to sign in? Then someone knows your admin password —",
        "change LOGISTICS_PASSWORD in your hosting settings now. That also",
        "signs out every session and voids this code.",
    ].join("\n")

    try {
        const resend = new Resend(apiKey)
        const { error } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || "Admin sign-in <onboarding@resend.dev>",
            to,
            subject: "Admin sign-in code", // code stays out of the subject (lock-screen previews)
            text,
        })
        if (error) {
            console.error("[two-factor] email provider error:", error.message)
            return false
        }
        return true
    } catch (err) {
        console.error("[two-factor] email send failed:", err instanceof Error ? err.message : err)
        return false
    }
}
