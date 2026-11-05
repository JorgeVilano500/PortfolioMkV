import { getPublicSlots } from "@/lib/sponsor-spots-server"

// ─── GET /api/laptop/spots (public) ───────────────────────────────────────────
// What /laptop shows, as JSON: every spot, with its sponsor or null when it's
// open or hidden. The same data the page renders from; Studio's admin
// endpoints (/api/sponsorships/spots) are what change it.

// Served from the cache and rebuilt at most once a minute, so visitors never
// hit the database directly. Studio's saves refresh it at once (refreshLaptop).
export const revalidate = 60

export async function GET() {
    const slots = await getPublicSlots()
    return Response.json({
        spots: slots.map(({ id, surface, position, sponsor }) => ({ id, surface, position, sponsor })),
    })
}
