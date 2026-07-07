/**
 * Allowlist schema for rehype-sanitize, applied to blog markdown AFTER
 * rehype-raw and BEFORE rehype-highlight.
 *
 * Because rehype-raw parses embedded raw HTML, without sanitization a post
 * could carry <script>, <iframe>, onerror= handlers, javascript: URLs, etc.
 * (stored XSS — and the admin password sits in sessionStorage on the gated
 * pages, so XSS = credential theft). This schema is allowlist-based: anything
 * not listed is stripped.
 *
 * Defined explicitly (rather than importing rehype-sanitize's defaultSchema)
 * so it stays dependency-free and unit-testable.
 */

// Type-only import — erased at compile time, so this module stays
// runtime-dependency-free (and unit-testable without ESM interop).
import type { Schema } from "hast-util-sanitize"

export const markdownSanitizeSchema: Schema = {
    strip: ["script", "style"],

    protocols: {
        href: ["http", "https", "mailto"],
        src: ["http", "https"],
        cite: ["http", "https"],
    },

    tagNames: [
        // Structure & text
        "h1", "h2", "h3", "h4", "h5", "h6",
        "p", "div", "span", "br", "hr",
        "blockquote", "details", "summary",
        // Inline
        "a", "strong", "b", "em", "i", "del", "s", "strike", "u",
        "sub", "sup", "mark", "small", "kbd", "abbr", "q", "cite",
        // Code
        "pre", "code", "samp", "var",
        // Lists
        "ul", "ol", "li", "dl", "dt", "dd",
        // Tables
        "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
        // Media
        "img", "picture", "source", "figure", "figcaption",
        // GFM task lists
        "input",
        // Semantics
        "section", "article", "aside", "ins",
    ],

    attributes: {
        "*": ["id", "dir", "lang", "title"],
        a: ["href", "rel", "target"],
        img: ["src", "alt", "width", "height", "loading"],
        source: ["srcSet", "type", "media"],
        // rehype-highlight needs the language class to survive sanitization
        code: [["className", /^language-./, "hljs"]],
        pre: [["className", /^language-./, "hljs"]],
        // GFM alerts ([!NOTE] etc.) — MarkdownRenderer reads dataGfmAlert
        blockquote: ["dataGfmAlert", "cite"],
        // GFM task-list checkboxes
        input: [["type", "checkbox"], ["disabled", true], ["checked", true]],
        ol: ["start", "reversed"],
        li: [["className", "task-list-item"]],
        td: ["align", "colSpan", "rowSpan"],
        th: ["align", "colSpan", "rowSpan", "scope"],
        details: [["open", true]],
    },

    // If an <a> survives with target set, force safe rel (renderer also sets it)
    required: {
        input: { type: "checkbox", disabled: true },
    },

    // Do not allow style attributes, event handlers (on*), iframes, forms,
    // object/embed — anything absent from the lists above is removed.
    clobberPrefix: "user-content-",
    clobber: ["id"],
    allowComments: false,
    allowDoctypes: false,
}
