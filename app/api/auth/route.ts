import { NextRequest, NextResponse } from "next/server"
import { safeEqual, getClientIp, isSameOriginRequest } from "@/lib/security"
import { isAuthBlocked, recordAuthFailure } from "@/lib/rate-limit"
import { isJsonObject } from "@/lib/validation"
import {
    SESSION_COOKIE,
    createSessionToken,
    verifySessionToken,
    sessionCookieOptions,
} from "@/lib/session"

const ROUTE = "auth"
const MAX_PASSWORD_LENGTH = 500

function crossSite(): NextResponse {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
}

// ─── GET /api/auth — is there a valid admin session? (gates call this on load)

export async function GET(req: NextRequest) {
    return NextResponse.json({ authenticated: verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value) })
}

// ─── POST /api/auth { password } — exchange the admin password for a session

export async function POST(req: NextRequest) {
    if (!isSameOriginRequest(req)) return crossSite()

    const ip = getClientIp(req)
    if (isAuthBlocked(ROUTE, ip)) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const password = isJsonObject(body) ? body.password : undefined

    const secret = process.env.LOGISTICS_PASSWORD
    if (
        !secret ||
        typeof password !== "string" ||
        password.length > MAX_PASSWORD_LENGTH ||
        !safeEqual(password, secret)
    ) {
        recordAuthFailure(ROUTE, ip)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = createSessionToken()
    if (!token) {
        console.error(`[${ROUTE}] cannot sign sessions: set SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY`)
        return NextResponse.json({ error: "Sign-in is not configured" }, { status: 500 })
    }

    const res = NextResponse.json({ authenticated: true })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
    return res
}

// ─── DELETE /api/auth — sign out

export async function DELETE(req: NextRequest) {
    if (!isSameOriginRequest(req)) return crossSite()
    const res = NextResponse.json({ authenticated: false })
    res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0))
    return res
}
