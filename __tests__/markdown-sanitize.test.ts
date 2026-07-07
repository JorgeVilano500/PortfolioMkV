/**
 * XSS defence — the sanitization schema applied to blog markdown, plus a
 * wiring check that MarkdownRenderer actually uses it in the right order.
 *
 * Blog content passes through rehype-raw (raw HTML is parsed and rendered),
 * so the sanitize schema is the only thing standing between a malicious
 * post body and script execution on every reader's browser — including the
 * admin's, whose password sits in sessionStorage.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { markdownSanitizeSchema } from "@/lib/markdown-sanitize"

const schema = markdownSanitizeSchema

describe("markdownSanitizeSchema — dangerous tags", () => {
    it.each(["script", "iframe", "object", "embed", "form", "style", "link", "meta", "base", "frame", "frameset", "math", "svg", "template", "slot", "dialog"])(
        "does not allow <%s>",
        (tag) => {
            expect(schema.tagNames).not.toContain(tag)
        }
    )

    it("explicitly strips script and style contents", () => {
        expect(schema.strip).toEqual(expect.arrayContaining(["script", "style"]))
    })

    it("allows the tags markdown actually produces", () => {
        for (const tag of ["h1", "p", "a", "img", "pre", "code", "blockquote", "table", "ul", "ol", "li", "input", "figure", "figcaption"]) {
            expect(schema.tagNames).toContain(tag)
        }
    })
})

describe("markdownSanitizeSchema — dangerous attributes", () => {
    const allAttrLists = Object.values(schema.attributes ?? {})

    it("never allowlists event handlers (on*) anywhere", () => {
        for (const list of allAttrLists) {
            for (const attr of list) {
                const name = (typeof attr === "string" ? attr : attr[0]).toLowerCase()
                expect(name.startsWith("on")).toBe(false)
            }
        }
    })

    it("never allowlists style or srcdoc attributes", () => {
        for (const list of allAttrLists) {
            for (const attr of list) {
                const name = (typeof attr === "string" ? attr : attr[0]).toLowerCase()
                expect(name).not.toBe("style")
                expect(name).not.toBe("srcdoc")
            }
        }
    })

    it("restricts href/src to http(s)/mailto — no javascript: or data: URLs", () => {
        expect(schema.protocols?.href).toEqual(["http", "https", "mailto"])
        expect(schema.protocols?.src).toEqual(["http", "https"])
        expect(schema.protocols?.href).not.toContain("javascript")
        expect(schema.protocols?.src).not.toContain("data")
    })

    it("restricts input elements to checkboxes", () => {
        const inputAttrs = schema.attributes?.input ?? []
        const typeRule = inputAttrs.find((a) => Array.isArray(a) && a[0] === "type")
        expect(typeRule).toEqual(["type", "checkbox"])
    })

    it("clobbers user-supplied ids to prevent DOM clobbering", () => {
        expect(schema.clobber).toContain("id")
        expect(schema.clobberPrefix).toBe("user-content-")
    })
})

describe("markdownSanitizeSchema — renderer features still work", () => {
    it("lets rehype-highlight language classes through on code", () => {
        const codeAttrs = schema.attributes?.code ?? []
        const classRule = codeAttrs.find((a) => Array.isArray(a) && a[0] === "className") as
            | [string, ...unknown[]]
            | undefined
        expect(classRule).toBeDefined()
        const values = classRule!.slice(1)
        expect(values.some((v) => v instanceof RegExp && String(v).includes("language-"))).toBe(true)
        expect(values).toContain("hljs")
    })

    it("lets GFM alert markers through on blockquote", () => {
        expect(schema.attributes?.blockquote).toContain("dataGfmAlert")
    })

    it("lets img size/float modifiers work (src, alt, loading allowed)", () => {
        const imgAttrs = (schema.attributes?.img ?? []).map((a) => (typeof a === "string" ? a : a[0]))
        expect(imgAttrs).toEqual(expect.arrayContaining(["src", "alt", "loading"]))
    })
})

describe("MarkdownRenderer wiring", () => {
    const source = readFileSync(
        join(process.cwd(), "components/ui/MarkdownRenderer.tsx"),
        "utf8"
    )

    it("imports rehype-sanitize and the schema", () => {
        expect(source).toContain('from "rehype-sanitize"')
        expect(source).toContain("markdownSanitizeSchema")
    })

    it("runs sanitize AFTER rehypeRaw and BEFORE rehypeHighlight", () => {
        const pluginLine = source.match(/rehypePlugins=\{\[([\s\S]+?)\]\}/)?.[1] ?? ""
        const rawIdx = pluginLine.indexOf("rehypeRaw")
        const sanitizeIdx = pluginLine.indexOf("rehypeSanitize")
        const highlightIdx = pluginLine.indexOf("rehypeHighlight")
        expect(rawIdx).toBeGreaterThanOrEqual(0)
        expect(sanitizeIdx).toBeGreaterThan(rawIdx)
        expect(highlightIdx).toBeGreaterThan(sanitizeIdx)
    })
})
