/**
 * lib/json-ld — JSON-LD is injected with dangerouslySetInnerHTML inside a
 * <script> tag, and post titles/excerpts/tags are stored content. Plain
 * JSON.stringify leaves "</script>" intact, so a post title could close the
 * tag and run arbitrary script on the public blog (stored XSS).
 */
import { serializeJsonLd } from "@/lib/json-ld"

const hostile = {
    "@type": "BlogPosting",
    headline: "</script><script>alert(document.cookie)</script>",
    description: "<!-- & <img src=x onerror=alert(1)>",
    keywords: "a\u2028b\u2029c",
}

describe("serializeJsonLd", () => {
    it("never emits a raw < or > (cannot close the script tag)", () => {
        const out = serializeJsonLd(hostile)
        expect(out).not.toMatch(/[<>]/)
        expect(out.toLowerCase()).not.toContain("</script")
    })

    it("escapes & and the JS line separators", () => {
        const out = serializeJsonLd(hostile)
        expect(out).not.toContain("&")
        expect(out).not.toMatch(/[\u2028\u2029]/)
    })

    it("round-trips to the exact same data", () => {
        expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile)
    })

    it("is used by every layout that renders JSON-LD", () => {
        const { readFileSync } = jest.requireActual("fs") as typeof import("fs")
        for (const file of ["app/layout.tsx", "app/blog/[slug]/layout.tsx"]) {
            const source = readFileSync(`${process.cwd()}/${file}`, "utf8")
            expect(source).toContain("serializeJsonLd(")
            expect(source).not.toMatch(/__html:\s*JSON\.stringify/)
        }
    })
})
