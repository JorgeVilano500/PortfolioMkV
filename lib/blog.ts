import { supabase } from "./supabase"
import type { PostTheme } from "./theme"
import { isValidSlug } from "./validation"

// Re-exported so existing imports keep working; the definitions live in lib/theme.ts.
export { themeMap, type PostTheme } from "./theme"

export type Post = {
    id: string
    title: string
    slug: string
    excerpt: string
    tags: string[]
    cover_emoji: string
    theme: PostTheme
    reading_time: number
    published: boolean
    created_at: string
}

export type PostWithContent = Post & { content: string }

const POST_COLUMNS = "id, title, slug, excerpt, tags, cover_emoji, theme, reading_time, published, created_at"

export async function getPosts(): Promise<Post[]> {
    const { data, error } = await supabase
        .from("posts")
        .select(POST_COLUMNS)
        .eq("published", true)
        .order("created_at", { ascending: false })

    if (error) throw error
    return (data ?? []) as Post[]
}

export async function getPostContent(id: string): Promise<string> {
    const { data, error } = await supabase
        .from("posts")
        .select("content")
        .eq("id", id)
        .eq("published", true) // defense-in-depth alongside RLS
        .single()

    if (error) throw error
    return (data as { content: string }).content
}

export async function getPostBySlug(slug: string): Promise<PostWithContent | null> {
    // The slug comes straight from the URL: anything that isn't a slug can't
    // match a post, so don't send it to the database at all.
    if (!isValidSlug(slug)) return null

    // Explicit columns: a column added to `posts` later (notes, drafts…) must
    // not start shipping to every visitor's browser by default.
    const { data, error } = await supabase
        .from("posts")
        .select(`${POST_COLUMNS}, content`)
        .eq("slug", slug)
        .eq("published", true)
        .single()

    if (error) return null
    return data as PostWithContent
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    })
}
