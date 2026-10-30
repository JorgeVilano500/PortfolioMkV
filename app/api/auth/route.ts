import { NextRequest, NextResponse } from "next/server"
import { safeEqual, getClientIp, isSameOriginRequest } from "@/lib/security"
import { ADMIN_PASSWORD_SCOPE, isAuthBlocked, recordAuthFailure } from "@/lib/auth-lockout"
import { BODY_LIMITS, readJsonBody } from "@/lib/http"
import { rateLimit } from "@/lib/rate-limit"
import { isJsonObject } from "@/lib/validation"
import { summarizeUserAgent } from "@/lib/user-agent"
import {
    SESSION_COOKIE,
    createSessionToken,
    verifySessionToken,
    sessionCookieOptions,
} from "@/lib/session"
import {
    TWO_FACTOR_COOKIE,
    TWO_FACTOR_TTL_SECONDS,
    createChallenge,
    isTwoFactorConfigured,
    isTwoFactorEnabled,
    normalizeCode,
    sendCode,
    verifyChallenge,
} from "@/lib/two-factor"

const ROUTE = "auth"
const MAX_PASSWORD_LENGTH = 500

// Codes are only sent after the right password, but cap them anyway: protects
// the email quota and the owner's inbox if the password leaks.
const CODE_SEND_LIMIT = 5
const CODE_SEND_WINDOW_MS = 15 * 60 * 1000

function crossSite(): NextResponse {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
}

function signedIn(): NextResponse {
    const token = createSessionToken()
    if (!token) {
        console.error(`[${ROUTE}] cannot sign sessions: set SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY`)
        return NextResponse.json({ error: "Sign-in is not configured" }, { status: 500 })
    }
    const res = NextResponse.json({ authenticated: true })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
    return res
}

// ─── GET /api/auth — is there a valid admin session? (gates call this on load)

export async function GET(req: NextRequest) {
    return NextResponse.json({ authenticated: verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value) })
}

// ─── POST /api/auth { password } — exchange the admin password for a session
// With ADMIN_2FA=email the password earns a challenge instead, and a second
// POST /api/auth { code } exchanges the emailed code for the session.

export async function POST(req: NextRequest) {
    if (!isSameOriginRequest(req)) return crossSite()

    // Same lockout scope as every other route that checks this password —
    // wrong 2FA codes count here too.
    const ip = getClientIp(req)
    if (await isAuthBlocked(ADMIN_PASSWORD_SCOPE, ip)) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }

    const parsed = await readJsonBody(req, BODY_LIMITS.tiny)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    const body = isJsonObject(parsed.body) ? parsed.body : {}

    if ("code" in body) return verifyCodeStep(req, ip, body.code)

    const password = body.password
    const secret = process.env.LOGISTICS_PASSWORD
    const isGuess = typeof password === "string" && password.length > 0 && password.length <= MAX_PASSWORD_LENGTH
    if (!secret || !isGuess || !safeEqual(password, secret)) {
        // Only real guesses count toward the lockout; malformed bodies can't reveal anything.
        if (isGuess) await recordAuthFailure(ADMIN_PASSWORD_SCOPE, ip)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return isTwoFactorEnabled() ? startTwoFactor(req, ip) : signedIn()
}

async function startTwoFactor(req: NextRequest, ip: string): Promise<NextResponse> {
    if (!isTwoFactorConfigured()) {
        // Fail closed: skipping the factor because email is down would make it optional.
        console.error(`[${ROUTE}] ADMIN_2FA=email needs RESEND_API_KEY and ADMIN_2FA_EMAIL or SUMMARY_RECIPIENT_EMAIL`)
        return NextResponse.json({ error: "Two-factor sign-in is not configured" }, { status: 500 })
    }

    const rl = rateLimit("2fa-send", "global", CODE_SEND_LIMIT, CODE_SEND_WINDOW_MS)
    if (!rl.ok) {
        return NextResponse.json(
            { error: "Too many codes requested. Try again later." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
        )
    }

    const challenge = createChallenge()
    if (!challenge) {
        console.error(`[${ROUTE}] cannot sign challenges: set SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY`)
        return NextResponse.json({ error: "Sign-in is not configured" }, { status: 500 })
    }

    const ua = summarizeUserAgent(req.headers.get("user-agent"))
    const sent = await sendCode(challenge.code, { ip, device: `${ua.browser} on ${ua.os}` })
    if (!sent) return NextResponse.json({ error: "Could not send the sign-in code. Try again." }, { status: 502 })

    const res = NextResponse.json({ authenticated: false, twoFactor: "email" })
    res.cookies.set(TWO_FACTOR_COOKIE, challenge.token, sessionCookieOptions(TWO_FACTOR_TTL_SECONDS))
    return res
}

async function verifyCodeStep(req: NextRequest, ip: string, input: unknown): Promise<NextResponse> {
    if (!isTwoFactorEnabled()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = req.cookies.get(TWO_FACTOR_COOKIE)?.value
    if (!token) {
        return NextResponse.json({ error: "Your code expired. Enter the password again." }, { status: 401 })
    }
    const code = normalizeCode(input)
    if (!code) return NextResponse.json({ error: "Enter the 6-digit code from the email." }, { status: 400 })

    if (!verifyChallenge(token, code)) {
        await recordAuthFailure(ADMIN_PASSWORD_SCOPE, ip)
        return NextResponse.json({ error: "Incorrect or expired code." }, { status: 401 })
    }

    const res = signedIn()
    res.cookies.set(TWO_FACTOR_COOKIE, "", sessionCookieOptions(0))
    return res
}

// ─── DELETE /api/auth — sign out

export async function DELETE(req: NextRequest) {
    if (!isSameOriginRequest(req)) return crossSite()
    const res = NextResponse.json({ authenticated: false })
    res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0))
    res.cookies.set(TWO_FACTOR_COOKIE, "", sessionCookieOptions(0))
    return res
}
