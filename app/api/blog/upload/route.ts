import { type NextRequest } from "next/server"
import matter from "gray-matter"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { safeEqual, getClientIp } from "@/lib/security"
import { isAuthBlocked, recordAuthFailure } from "@/lib/rate-limit"
import {
    LIMITS,
    isValidSlug,
    slugify,
    normalizeTags,
    normalizeTheme,
    estimateReadingTime,
} from "@/lib/validation"

const ROUTE = "blog/upload"

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    // 1. Authenticate (constant-time compare + brute-force damping)
    const ip = getClientIp(request)
    if (isAuthBlocked(ROUTE, ip)) {
        return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }
    const apiKey = request.headers.get("x-api-key")
    const secret = process.env.BLOG_UPLOAD_SECRET
    if (!secret || !safeEqual(apiKey, secret)) {
        recordAuthFailure(ROUTE, ip)
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Read raw body (the .md file content), with a size cap
    const raw = await request.text()
    if (!raw.trim()) {
        return Response.json({ error: "Request body is empty" }, { status: 400 })
    }
    if (raw.length > LIMITS.uploadBody) {
        return Response.json({ error: "Request body too large" }, { status: 413 })
    }

    // 3. Parse YAML frontmatter + markdown body
    let parsed: ReturnType<typeof matter>
    try {
        parsed = matter(raw)
    } catch {
        return Response.json({ error: "Could not parse frontmatter" }, { status: 400 })
    }

    const { data: meta, content } = parsed

    // 4. Validate required fields
    if (!meta.title || typeof meta.title !== "string" || meta.title.length > LIMITS.title) {
        return Response.json(
            { error: "Missing or invalid frontmatter field: title" },
            { status: 400 }
        )
    }

    // 5. Build the row — slug is always normalized/validated, never trusted raw
    const rawSlug = typeof meta.slug === "string" ? meta.slug : meta.title
    const slug = isValidSlug(rawSlug) ? rawSlug : slugify(rawSlug)
    if (!isValidSlug(slug)) {
        return Response.json(
            { error: "Could not derive a valid slug from frontmatter (use lowercase letters, numbers, hyphens)" },
            { status: 400 }
        )
    }

    const tags = normalizeTags(meta.tags)

    const post = {
        title:        meta.title,
        slug,
        excerpt:      typeof meta.excerpt === "string" ? meta.excerpt.slice(0, LIMITS.excerpt) : "",
        content:      content.trim().slice(0, LIMITS.content),
        tags:         tags ?? [],
        cover_emoji:  typeof meta.cover_emoji === "string" ? meta.cover_emoji.slice(0, LIMITS.coverEmoji) : "📝",
        theme:        normalizeTheme(meta.theme),
        reading_time: typeof meta.reading_time === "number" && meta.reading_time > 0 && meta.reading_time < 1000
                          ? Math.round(meta.reading_time)
                          : estimateReadingTime(content),
        published:    meta.published === true,
    }

    // 6. Upsert — re-sending the same file (same slug) updates the existing post
    const { data, error } = await supabaseAdmin
        .from("posts")
        .upsert(post, { onConflict: "slug" })
        .select("id, slug, title, published")
        .single()

    if (error) {
        console.error(`[${ROUTE}]`, error.message)
        return Response.json({ error: "Database error" }, { status: 500 })
    }

    return Response.json(
        { success: true, post: data },
        { status: 201 }
    )
}
