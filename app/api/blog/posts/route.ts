import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { safeEqual, getClientIp } from "@/lib/security"
import { isAuthBlocked, recordAuthFailure } from "@/lib/rate-limit"
import {
    LIMITS,
    isValidSlug,
    isNonEmptyString,
    isStringMax,
    normalizeTags,
    normalizeTheme,
    estimateReadingTime,
} from "@/lib/validation"

const ROUTE = "blog/posts"

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

/** Validate the mutable post fields present in `body`. Returns error string or normalized fields. */
function validateFields(
    body: Record<string, unknown>,
    { requireCore }: { requireCore: boolean }
): { error: string } | { fields: Record<string, unknown> } {
    const fields: Record<string, unknown> = {}

    if (requireCore || "title" in body) {
        if (!isNonEmptyString(body.title, LIMITS.title)) {
            return { error: `title is required (string, max ${LIMITS.title} chars)` }
        }
        fields.title = body.title
    }
    if (requireCore || "slug" in body) {
        if (!isValidSlug(body.slug)) {
            return { error: "slug is required and must be lowercase letters, numbers, and hyphens" }
        }
        fields.slug = body.slug
    }
    if ("content" in body) {
        if (!isStringMax(body.content, LIMITS.content)) {
            return { error: `content must be a string (max ${LIMITS.content} chars)` }
        }
        fields.content = body.content
        fields.reading_time = estimateReadingTime(body.content as string)
    }
    if ("excerpt" in body) {
        if (!isStringMax(body.excerpt, LIMITS.excerpt)) {
            return { error: `excerpt must be a string (max ${LIMITS.excerpt} chars)` }
        }
        fields.excerpt = body.excerpt
    }
    if ("tags" in body) {
        const tags = normalizeTags(body.tags)
        if (tags === null) {
            return { error: `tags must be an array of strings (max ${LIMITS.tagCount} tags, ${LIMITS.tag} chars each)` }
        }
        fields.tags = tags
    }
    if ("cover_emoji" in body) {
        if (!isStringMax(body.cover_emoji, LIMITS.coverEmoji)) {
            return { error: "cover_emoji must be a short string" }
        }
        fields.cover_emoji = body.cover_emoji
    }
    if ("theme" in body) {
        fields.theme = normalizeTheme(body.theme)
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
        .from("posts")
        .select("id, title, slug, excerpt, content, tags, cover_emoji, theme, reading_time, published, created_at")
        .order("created_at", { ascending: false })

    if (error) return dbError("GET", error.message)
    const posts = data ?? []

    // Attach per-post view counts from analytics so the editor can sort by
    // popularity. Degrade to 0 on error — post listing must not depend on it.
    const viewsBySlug: Record<string, number> = {}
    const { data: viewRows, error: viewError } = await supabaseAdmin
        .from("page_views")
        .select("page")
        .like("page", "/blog/%")
    if (viewError) {
        console.error(`[${ROUTE}] GET view counts:`, viewError.message)
    } else {
        for (const row of (viewRows ?? []) as { page?: string }[]) {
            if (typeof row.page !== "string") continue
            const slug = row.page.slice("/blog/".length).replace(/\/+$/, "")
            if (slug) viewsBySlug[slug] = (viewsBySlug[slug] ?? 0) + 1
        }
    }

    return NextResponse.json(
        posts.map((p: { slug: string }) => ({ ...p, view_count: viewsBySlug[p.slug] ?? 0 }))
    )
}

export async function POST(req: NextRequest) {
    const denied = checkAuth(req)
    if (denied) return denied

    const body = await readJson(req)
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    const result = validateFields(body, { requireCore: true })
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const row = {
        content: "",
        excerpt: "",
        tags: [] as string[],
        cover_emoji: "📝",
        theme: "purple",
        published: false,
        reading_time: estimateReadingTime(typeof body.content === "string" ? body.content : ""),
        ...result.fields,
    }

    const { data, error } = await supabaseAdmin
        .from("posts")
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
        .from("posts")
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
            .from("posts")
            .delete()
            .in("id", ids)
        if (error) return dbError("DELETE", error.message)
        return NextResponse.json({ success: true, deleted: ids.length })
    }

    if (!isNonEmptyString(id, 100)) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const { error } = await supabaseAdmin
        .from("posts")
        .delete()
        .eq("id", id)

    if (error) return dbError("DELETE", error.message)
    return NextResponse.json({ success: true })
}
