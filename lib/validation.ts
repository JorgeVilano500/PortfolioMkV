/** Shared input-validation helpers for API routes. */

export const LIMITS = {
    title: 300,
    slug: 200,
    excerpt: 1_000,
    content: 200_000,
    tag: 50,
    tagCount: 20,
    coverEmoji: 16,
    page: 300,
    sessionId: 100,
    referrer: 2_000,
    userAgent: 500,
    emailSubject: 500,
    emailBody: 500_000,
    uploadBody: 1_000_000,
} as const

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSlug(slug: unknown): slug is string {
    return typeof slug === "string" && slug.length <= LIMITS.slug && SLUG_RE.test(slug)
}

export function isNonEmptyString(v: unknown, max: number): v is string {
    return typeof v === "string" && v.trim().length > 0 && v.length <= max
}

export function isStringMax(v: unknown, max: number): v is string {
    return typeof v === "string" && v.length <= max
}

export function normalizeTags(value: unknown): string[] | null {
    let tags: unknown[]
    if (Array.isArray(value)) tags = value
    else if (typeof value === "string") tags = value.split(",").map((t) => t.trim()).filter(Boolean)
    else if (value === undefined || value === null) return []
    else return null

    if (tags.length > LIMITS.tagCount) return null
    const out: string[] = []
    for (const t of tags) {
        if (typeof t !== "string" || t.length === 0 || t.length > LIMITS.tag) return null
        out.push(t)
    }
    return out
}

export function normalizeTheme(value: unknown): "purple" | "green" | "pink" {
    if (value === "green" || value === "pink") return value
    return "purple"
}

export function estimateReadingTime(content: string): number {
    const words = content.trim().split(/\s+/).filter(Boolean).length
    return Math.max(1, Math.ceil(words / 200))
}

export function slugify(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
}
