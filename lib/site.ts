/**
 * Site-wide facts shared by pages, metadata and routes, so a new address is a
 * one-line change. Client-safe: no secrets.
 */

/** The live site, used when NEXT_PUBLIC_SITE_URL isn't set (local builds, previews). */
const DEFAULT_SITE_URL = "https://javastudios.netlify.app"

/**
 * The site's origin, without a trailing slash. NEXT_PUBLIC_SITE_URL overrides
 * it (e.g. a custom domain). The fallback used to be "https://java.dev", a
 * domain this site doesn't own, which went into the sitemap, robots.txt,
 * canonical metadata and security.txt whenever the variable was missing.
 * Read per call, so routes and tests see the current environment.
 */
export function siteUrl(): string {
    return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, "")
}

/** The public address shown on /contact. */
export const CONTACT_EMAIL = "vilanova.jorge50@gmail.com"

/**
 * A mailto: link with the subject and body percent-encoded (RFC 6068). Raw
 * spaces or "&" in a subject can cut it short in some mail apps.
 */
export function mailtoLink(subject: string, body?: string): string {
    const query = [`subject=${encodeURIComponent(subject)}`]
    if (body) query.push(`body=${encodeURIComponent(body)}`)
    return `mailto:${CONTACT_EMAIL}?${query.join("&")}`
}
