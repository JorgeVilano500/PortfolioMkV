import { supabaseAdmin } from "@/lib/supabase-admin"
import { getClientIp } from "@/lib/security"
import { rateLimit } from "@/lib/rate-limit"
import { STORED_FILE_RE, isSlotId } from "@/lib/sponsor-spots"
import { STICKER_BUCKET, readSpotRecords } from "@/lib/sponsor-spots-server"

// ─── GET /laptop/stickers/<spot> (public) ─────────────────────────────────────
// The sticker image a spot shows on /laptop. Served from this origin (the
// bucket stays private) and only while the spot is visible: hiding a sponsor
// in Studio makes this a 404. Outside /api, so it can be cached briefly.

// Short, so a hidden sticker stops being served within minutes. The page
// links ?v=<updated_at>, so a changed image is fetched fresh at once.
const CACHE = "public, max-age=300, s-maxage=300"

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } })

// Per client, before any database or storage work (SECURITY.md S-47). A visit
// to /laptop asks for at most six stickers and the CDN answers most repeats,
// but a "?v=" that changes on every request skips the CDN, and each miss reads
// the table and downloads up to 4 MB from storage.
const STICKER_LIMIT     = 60
const STICKER_WINDOW_MS = 60_000

export async function GET(req: Request, { params }: { params: Promise<{ spot: string }> }) {
    const { spot } = await params
    if (!isSlotId(spot)) return notFound()

    const rl = rateLimit("laptop-stickers", getClientIp(req), STICKER_LIMIT, STICKER_WINDOW_MS)
    if (!rl.ok) {
        // no-store: a CDN must never hand one client's 429 to everyone else
        return new Response("Too many requests", {
            status: 429,
            headers: { "Retry-After": String(rl.retryAfterSeconds), "Cache-Control": "no-store" },
        })
    }

    const { records } = await readSpotRecords()
    const record = records?.find((r) => r.id === spot)
    if (!record || !record.visible || !record.sponsor_name || !record.image_path || !STORED_FILE_RE.test(record.image_path)) {
        return notFound()
    }

    const { data, error } = await supabaseAdmin.storage.from(STICKER_BUCKET).download(record.image_path)
    if (error || !data) {
        if (error) console.error("[laptop/stickers]", error.message)
        return notFound()
    }
    return new Response(await data.arrayBuffer(), {
        headers: {
            "Content-Type":  record.image_path.endsWith(".png") ? "image/png" : "image/jpeg",
            "Cache-Control": CACHE,
        },
    })
}
