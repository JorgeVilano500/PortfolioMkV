import { type NextRequest } from "next/server"
import { createHash } from "crypto"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { safeEqual, getClientIp } from "@/lib/security"
import { isAuthBlocked, recordAuthFailure } from "@/lib/rate-limit"
import { LIMITS, isValidSlug, isNonEmptyString, isStringMax } from "@/lib/validation"

const ROUTE = "docs/upload"

// Simple, safe markdown filename: no slashes, no leading dots, .md only.
const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,198}\.md$/

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    // 1. Authenticate (constant-time compare + brute-force damping)
    const ip = getClientIp(request)
    if (isAuthBlocked(ROUTE, ip)) {
        return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }
    const apiKey = request.headers.get("x-api-key")
    const secret = process.env.DOCS_UPLOAD_SECRET
    if (!secret || !safeEqual(apiKey, secret)) {
        recordAuthFailure(ROUTE, ip)
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Read + parse JSON body, with a size cap
    const raw = await request.text()
    if (raw.length > LIMITS.uploadBody) {
        return Response.json({ error: "Request body too large" }, { status: 413 })
    }
    let body: Record<string, unknown>
    try {
        body = JSON.parse(raw)
    } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 })
    }

    // 3. Validate fields — nothing is trusted raw
    const { project, filename, title, content, source } = body

    if (!isValidSlug(project)) {
        return Response.json(
            { error: "Missing or invalid field: project (lowercase letters, numbers, hyphens)" },
            { status: 400 }
        )
    }
    if (typeof filename !== "string" || !FILENAME_RE.test(filename)) {
        return Response.json(
            { error: "Missing or invalid field: filename (must be a plain .md filename)" },
            { status: 400 }
        )
    }
    if (!isNonEmptyString(content, LIMITS.uploadBody)) {
        return Response.json({ error: "Missing or invalid field: content" }, { status: 400 })
    }
    if (title !== undefined && !isStringMax(title, LIMITS.title)) {
        return Response.json({ error: "Invalid field: title" }, { status: 400 })
    }
    if (source !== undefined && !isStringMax(source, LIMITS.title)) {
        return Response.json({ error: "Invalid field: source" }, { status: 400 })
    }

    // 4. Build the row
    const doc = {
        project_slug: project,
        filename,
        title:        typeof title === "string" ? title : "",
        content,
        content_hash: createHash("sha256").update(content).digest("hex"),
        source:       typeof source === "string" ? source : "",
        updated_at:   new Date().toISOString(),
    }

    // 5. Upsert — latest-only: re-sending the same project+filename updates in place
    const { data, error } = await supabaseAdmin
        .from("project_documents")
        .upsert(doc, { onConflict: "project_slug,filename" })
        .select("id, project_slug, filename, content_hash, updated_at")
        .single()

    if (error) {
        console.error(`[${ROUTE}]`, error.message)
        return Response.json({ error: "Database error" }, { status: 500 })
    }

    return Response.json({ success: true, document: data }, { status: 201 })
}
