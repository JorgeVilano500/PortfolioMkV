import { NextRequest, NextResponse } from "next/server"
import { safeEqual, getClientIp, isSameOriginRequest } from "./security"
import { isAuthBlocked, recordAuthFailure } from "./rate-limit"
import { SESSION_COOKIE, verifySessionToken } from "./session"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Auth for every route behind LOGISTICS_PASSWORD. Accepts either:
 *  1. the HttpOnly session cookie issued by POST /api/auth (the Studio and
 *     Logistics UI), or
 *  2. the password itself in `x-logistics-key` (scripts / backward compat).
 *
 * A valid session is checked first: it's an HMAC that can't be guessed, so it
 * skips the brute-force lockout — an attacker tripping the lockout can block
 * new sign-ins but can't kick out a signed-in admin. Cookies ride along on
 * cross-site requests, so cookie-authenticated mutations must also come from
 * our own origin (SameSite=Strict is the first layer, this is the second).
 *
 * Returns a response to send, or null when the request is allowed.
 */
export function checkAdminAuth(req: NextRequest, route: string): NextResponse | null {
    if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
        if (!SAFE_METHODS.has(req.method) && !isSameOriginRequest(req)) {
            return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
        }
        return null
    }

    const ip = getClientIp(req)
    if (isAuthBlocked(route, ip)) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }
    const secret = process.env.LOGISTICS_PASSWORD
    if (!secret || !safeEqual(req.headers.get("x-logistics-key"), secret)) {
        recordAuthFailure(route, ip)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
}
