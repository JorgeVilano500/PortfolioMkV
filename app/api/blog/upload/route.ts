import { type NextRequest } from "next/server"
import matter from "gray-matter"
import { supabaseAdmin } from "@/lib/supabase-admin"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim()
}

function estimateReadingTime(content: string): number {
    const words = content.trim().split(/\s+/).length
    return Math.max(1, Math.ceil(words / 200))
}

function normalizeTheme(value: unknown): "purple" | "green" | "pink" {
    if (value === "green" || value === "pink") return value
    return "purple"
}

function normalizeTags(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String)
    if (typeof value === "string") return value.split(",").map((t) => t.trim()).filter(Boolean)
    return []
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    // 1. Authenticate
    const apiKey = request.headers.get("x-api-key")
    if (!apiKey || apiKey !== process.env.BLOG_UPLOAD_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Read raw body (the .md file content)
    const raw = await request.text()
    if (!raw.trim()) {
        return Response.json({ error: "Request body is empty" }, { status: 400 })
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
    if (!meta.title || typeof meta.title !== "string") {
        return Response.json(
            { error: "Missing required frontmatter field: title" },
            { status: 400 }
        )
    }

    // 5. Build the row
    const slug: string = typeof meta.slug === "string" ? meta.slug : slugify(meta.title)

    const post = {
        title:        meta.title as string,
        slug,
        excerpt:      typeof meta.excerpt === "string" ? meta.excerpt : "",
        content:      content.trim(),
        tags:         normalizeTags(meta.tags),
        cover_emoji:  typeof meta.cover_emoji === "string" ? meta.cover_emoji : "📝",
        theme:        normalizeTheme(meta.theme),
        reading_time: typeof meta.reading_time === "number"
                          ? meta.reading_time
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
        return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json(
        { success: true, post: data },
        { status: 201 }
    )
}
