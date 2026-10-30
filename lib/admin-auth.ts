import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { safeEqual, getClientIp, isSameOriginRequest } from "./security"
import { ADMIN_PASSWORD_SCOPE, isAuthBlocked, recordAuthFailure } from "./auth-lockout"
import { SESSION_COOKIE, verifySessionToken } from "./session"
import { isTwoFactorEnabled } from "./two-factor"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Auth for every route behind LOGISTICS_PASSWORD. Accepts either:
 *  1. the HttpOnly session cookie issued by POST /api/auth (the Studio and
 *     Logistics UI), or
 *  2. the password itself in `x-logistics-key` (scripts / backward compat) —
 *     refused while ADMIN_2FA is on, since it would skip the second factor.
 *
 * A valid session is checked first: it's an HMAC that can't be guessed, so it
 * skips the brute-force lockout — an attacker tripping the lockout can block
 * new sign-ins but can't kick out a signed-in admin. Cookies ride along on
 * cross-site requests, so cookie-authenticated mutations must also come from
 * our own origin (SameSite=Strict is the first layer, this is the second).
 *
 * Every route shares one lockout scope with POST /api/auth, so the number of
 * password guesses doesn't grow with the number of endpoints.
 *
 * Returns a response to send, or null when the request is allowed.
 */
export async function checkAdminAuth(req: NextRequest): Promise<NextResponse | null> {
    if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
        if (!SAFE_METHODS.has(req.method) && !isSameOriginRequest(req)) {
            return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
        }
        return null
    }

    const ip = getClientIp(req)
    if (await isAuthBlocked(ADMIN_PASSWORD_SCOPE, ip)) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }
    const provided = req.headers.get("x-logistics-key")
    if (isTwoFactorEnabled()) {
        // The header is password-only, so it would bypass the second factor.
        // Refuse without comparing: a different answer for the right password
        // would turn this route into a password oracle.
        return NextResponse.json(
            { error: "Password headers are disabled while two-factor sign-in is on. Sign in through the site." },
            { status: 401 }
        )
    }
    const secret = process.env.LOGISTICS_PASSWORD
    if (!secret || !safeEqual(provided, secret)) {
        // Only an actual password guess counts toward the lockout. An expired
        // session or a missing header isn't guessing — counting those would let
        // the owner lock themselves out by clicking around Studio after the
        // 8-hour session ends.
        if (provided) await recordAuthFailure(ADMIN_PASSWORD_SCOPE, ip)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
}
