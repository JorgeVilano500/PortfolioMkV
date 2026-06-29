import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

function auth(req: NextRequest): boolean {
    const key    = req.headers.get("x-logistics-key")
    const secret = process.env.LOGISTICS_PASSWORD
    return Boolean(secret && key === secret)
}

function estimateReadingTime(content: string): number {
    const words = content.trim().split(/\s+/).length
    return Math.max(1, Math.ceil(words / 200))
}

export async function GET(req: NextRequest) {
    if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabaseAdmin
        .from("posts")
        .select("id, title, slug, excerpt, content, tags, cover_emoji, theme, reading_time, published, created_at")
        .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
    if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { title, slug, content = "", excerpt = "", tags = [], cover_emoji = "📝", theme = "purple", published = false } = body

    if (!title || !slug) {
        return NextResponse.json({ error: "title and slug are required" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
        .from("posts")
        .insert({
            title,
            slug,
            content,
            excerpt,
            tags,
            cover_emoji,
            theme,
            published,
            reading_time: estimateReadingTime(content),
        })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
    if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { id, ...fields } = body
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    if (typeof fields.content === "string") {
        fields.reading_time = estimateReadingTime(fields.content)
    }

    const { data, error } = await supabaseAdmin
        .from("posts")
        .update(fields)
        .eq("id", id)
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
    if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const { error } = await supabaseAdmin
        .from("posts")
        .delete()
        .eq("id", id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
