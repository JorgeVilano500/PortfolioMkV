// GET /.well-known/security.txt — RFC 9116: tells researchers who found a
// vulnerability where to report it, instead of guessing (or giving up).

// Already public on /contact. Override with SECURITY_CONTACT (an email or an
// https:// URL) to route reports elsewhere.
const DEFAULT_CONTACT = "vilanova.jorge50@gmail.com"

// RFC 9116 wants Expires less than a year out so a forgotten file goes stale
// visibly; computed per request so it never lapses between deploys.
const EXPIRES_IN_MS = 180 * 24 * 60 * 60 * 1000

function contactUri(value: string): string {
    return /^https:\/\//.test(value) ? value : `mailto:${value}`
}

export function GET() {
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://java.dev").replace(/\/+$/, "")
    const contact = process.env.SECURITY_CONTACT?.trim() || DEFAULT_CONTACT
    const body = [
        `Contact: ${contactUri(contact)}`,
        `Expires: ${new Date(Date.now() + EXPIRES_IN_MS).toISOString()}`,
        "Preferred-Languages: en, es",
        `Canonical: ${siteUrl}/.well-known/security.txt`,
        "",
    ].join("\n")

    return new Response(body, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
        },
    })
}
