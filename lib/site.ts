/**
 * Site-wide facts shared by pages, metadata and routes, so a new address is a
 * one-line change. Client-safe: no secrets.
 */

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
