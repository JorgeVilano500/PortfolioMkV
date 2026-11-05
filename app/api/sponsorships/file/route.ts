import { type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { checkAdminAuth } from "@/lib/admin-auth"
import { STORED_FILE_RE } from "@/lib/sponsor-spots"
import { STICKER_BUCKET } from "@/lib/sponsor-spots-server"

const ROUTE = "sponsorships/file"

// ─── GET /api/sponsorships/file?path=offers/<id>/sticker.png (admin) ─────────
// Streams a file from the private sticker bucket, for Studio's previews and
// downloads. Same-origin, so the 3D preview can draw it without CORS, and no
// signed URL ever leaves the server.

export async function GET(req: NextRequest) {
    const denied = await checkAdminAuth(req)
    if (denied) return denied

    const path = req.nextUrl.searchParams.get("path") ?? ""
    // Only the two shapes this app writes; no "..", no other buckets' paths.
    if (!STORED_FILE_RE.test(path)) return Response.json({ error: "Invalid path" }, { status: 400 })

    const { data, error } = await supabaseAdmin.storage.from(STICKER_BUCKET).download(path)
    if (error || !data) {
        if (error) console.error(`[${ROUTE}]`, error.message)
        return Response.json({ error: "Not found" }, { status: 404 })
    }
    const download = req.nextUrl.searchParams.get("download") === "1"
    const name = path.split("/").slice(-2).join("-")
    return new Response(await data.arrayBuffer(), {
        headers: {
            "Content-Type":        path.endsWith(".png") ? "image/png" : "image/jpeg",
            "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
            // Never on a CDN. Each path's bytes never change (new uploads get new paths).
            "Cache-Control":       "private, max-age=3600",
        },
    })
}
