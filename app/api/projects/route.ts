import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { safeEqual, getClientIp } from "@/lib/security"
import { isAuthBlocked, recordAuthFailure } from "@/lib/rate-limit"
import {
    LIMITS,
    isNonEmptyString,
    isStringMax,
    normalizeTags,
    normalizeTheme,
    normalizeProjectStatus,
    isValidUrlOrEmpty,
} from "@/lib/validation"

const ROUTE = "projects"

/**
 * Auth with brute-force damping: constant-time compare, and after 10 failed
 * attempts in 15 min an IP gets 429 instead of more oracle queries.
 * Returns a response to send, or null if authenticated.
 */
function checkAuth(req: NextRequest): NextResponse | null {
    const ip = getClientIp(req)
    if (isAuthBlocked(ROUTE, ip)) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }
    const key = req.headers.get("x-logistics-key")
    const secret = process.env.LOGISTICS_PASSWORD
    if (!secret || !safeEqual(key, secret)) {
        recordAuthFailure(ROUTE, ip)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
}

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
    try {
        const body = await req.json()
        if (!body || typeof body !== "object" || Array.isArray(body)) return null
        return body as Record<string, unknown>
    } catch {
        return null
    }
}

/** Validate the mutable project fields present in `body`. Returns error string or normalized fields. */
function validateFields(
    body: Record<string, unknown>,
    { requireCore }: { requireCore: boolean }
): { error: string } | { fields: Record<string, unknown> } {
    const fields: Record<string, unknown> = {}

    if (requireCore || "title" in body) {
        if (!isNonEmptyString(body.title, LIMITS.projectTitle)) {
            return { error: `title is required (string, max ${LIMITS.projectTitle} chars)` }
        }
        fields.title = body.title
    }
    if ("description" in body) {
        if (!isStringMax(body.description, LIMITS.projectDescription)) {
            return { error: `description must be a string (max ${LIMITS.projectDescription} chars)` }
        }
        fields.description = body.description
    }
    if ("icon" in body) {
        if (!isStringMax(body.icon, LIMITS.icon)) {
            return { error: "icon must be a short string" }
        }
        fields.icon = body.icon
    }
    if ("category" in body) {
        if (!isStringMax(body.category, LIMITS.category)) {
            return { error: `category must be a string (max ${LIMITS.category} chars)` }
        }
        fields.category = body.category
    }
    if ("status" in body) {
        fields.status = normalizeProjectStatus(body.status)
    }
    if ("theme" in body) {
        fields.theme = normalizeTheme(body.theme)
    }
    if ("tags" in body) {
        const tags = normalizeTags(body.tags)
        if (tags === null) {
            return { error: `tags must be an array of strings (max ${LIMITS.tagCount} tags, ${LIMITS.tag} chars each)` }
        }
        fields.tags = tags
    }
    if ("year" in body) {
        if (!isStringMax(body.year, LIMITS.year)) {
            return { error: `year must be a string (max ${LIMITS.year} chars)` }
        }
        fields.year = body.year
    }
    if ("link" in body) {
        if (!isValidUrlOrEmpty(body.link)) {
            return { error: "link must be empty or a valid http(s) URL" }
        }
        fields.link = body.link
    }
    if ("github" in body) {
        if (!isValidUrlOrEmpty(body.github)) {
            return { error: "github must be empty or a valid http(s) URL" }
        }
        fields.github = body.github
    }
    if ("featured" in body) {
        if (typeof body.featured !== "boolean") {
            return { error: "featured must be a boolean" }
        }
        fields.featured = body.featured
    }
    if ("published" in body) {
        if (typeof body.published !== "boolean") {
            return { error: "published must be a boolean" }
        }
        fields.published = body.published
    }

    return { fields }
}

function dbError(context: string, message: string): NextResponse {
    // Log the real error server-side; never leak schema details to clients.
    console.error(`[${ROUTE}] ${context}:`, message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
}

export async function GET(req: NextRequest) {
    const denied = checkAuth(req)
    if (denied) return denied

    const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id, title, description, icon, category, status, theme, tags, year, link, github, featured, published, created_at")
        .order("created_at", { ascending: false })

    if (error) return dbError("GET", error.message)
    return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
    const denied = checkAuth(req)
    if (denied) return denied

    const body = await readJson(req)
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    const result = validateFields(body, { requireCore: true })
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const row = {
        description: "",
        icon: "🚀",
        category: "",
        status: "planned",
        theme: "purple",
        tags: [] as string[],
        year: "",
        link: "",
        github: "",
        featured: false,
        published: true,
        ...result.fields,
    }

    const { data, error } = await supabaseAdmin
        .from("projects")
        .insert(row)
        .select()
        .single()

    if (error) return dbError("POST", error.message)
    return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
    const denied = checkAuth(req)
    if (denied) return denied

    const body = await readJson(req)
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    const { id } = body
    if (!isNonEmptyString(id, 100)) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    // Whitelist — only explicitly validated fields ever reach the DB
    // (prevents mass-assignment of id / created_at / arbitrary columns).
    const result = validateFields(body, { requireCore: false })
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })
    if (Object.keys(result.fields).length === 0) {
        return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
        .from("projects")
        .update(result.fields)
        .eq("id", id)
        .select()
        .single()

    if (error) return dbError("PATCH", error.message)
    return NextResponse.json(data)
}

const MAX_BULK_DELETE = 100

export async function DELETE(req: NextRequest) {
    const denied = checkAuth(req)
    if (denied) return denied

    const body = await readJson(req)
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    // Accepts { id } for a single delete or { ids } for a group delete.
    const { id, ids } = body

    if (Array.isArray(ids)) {
        if (
            ids.length === 0 ||
            ids.length > MAX_BULK_DELETE ||
            !ids.every((v) => isNonEmptyString(v, 100))
        ) {
            return NextResponse.json(
                { error: `ids must be 1–${MAX_BULK_DELETE} non-empty strings` },
                { status: 400 }
            )
        }
        const { error } = await supabaseAdmin
            .from("projects")
            .delete()
            .in("id", ids)
        if (error) return dbError("DELETE", error.message)
        return NextResponse.json({ success: true, deleted: ids.length })
    }

    if (!isNonEmptyString(id, 100)) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const { error } = await supabaseAdmin
        .from("projects")
        .delete()
        .eq("id", id)

    if (error) return dbError("DELETE", error.message)
    return NextResponse.json({ success: true })
}
