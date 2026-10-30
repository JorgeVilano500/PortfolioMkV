import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { checkAdminAuth } from "@/lib/admin-auth"
import { BODY_LIMITS, readJsonBody } from "@/lib/http"
import {
    LIMITS,
    isValidSlug,
    isNonEmptyString,
    isStringMax,
    isUuid,
    isJsonObject,
    normalizeTags,
    normalizeTheme,
    estimateReadingTime,
} from "@/lib/validation"

const ROUTE = "blog/posts"

const checkAuth = (req: NextRequest) => checkAdminAuth(req)

/** Size-capped JSON object body, or the error response to send. */
async function readJson(req: NextRequest): Promise<Record<string, unknown> | NextResponse> {
    const parsed = await readJsonBody(req, BODY_LIMITS.admin)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    return isJsonObject(parsed.body) ? parsed.body : NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
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
    const denied = await checkAuth(req)
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
    const denied = await checkAuth(req)
    if (denied) return denied

    const body = await readJson(req)
    if (body instanceof NextResponse) return body

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
    const denied = await checkAuth(req)
    if (denied) return denied

    const body = await readJson(req)
    if (body instanceof NextResponse) return body

    const { id } = body
    if (!isUuid(id)) return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 })

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
    const denied = await checkAuth(req)
    if (denied) return denied

    const body = await readJson(req)
    if (body instanceof NextResponse) return body

    // Accepts { id } for a single delete or { ids } for a group delete.
    const { id, ids } = body

    if (Array.isArray(ids)) {
        if (
            ids.length === 0 ||
            ids.length > MAX_BULK_DELETE ||
            !ids.every(isUuid)
        ) {
            return NextResponse.json(
                { error: `ids must be 1–${MAX_BULK_DELETE} uuids` },
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

    if (!isUuid(id)) return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 })

    const { error } = await supabaseAdmin
        .from("posts")
        .delete()
        .eq("id", id)

    if (error) return dbError("DELETE", error.message)
    return NextResponse.json({ success: true })
}
