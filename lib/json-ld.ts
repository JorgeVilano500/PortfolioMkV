/**
 * Serialize structured data for a `<script type="application/ld+json">` tag.
 *
 * JSON.stringify leaves `<`, `>` and `&` intact, so stored content such as a
 * post title containing `</script>` could close the tag and inject script
 * (stored XSS). Escaping them as unicode sequences keeps the JSON identical
 * to parsers while making it inert as HTML. U+2028/U+2029 are escaped too,
 * since older JS engines treat them as line terminators.
 * See node_modules/next/dist/docs/01-app/02-guides/json-ld.md.
 */
export function serializeJsonLd(data: unknown): string {
    return JSON.stringify(data)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029")
}
