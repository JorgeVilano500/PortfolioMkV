"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import type { Components } from "react-markdown"
import { MdContentCopy, MdCheck } from "react-icons/md"

// ─── Code block: language badge + copy button ────────────────────────────────

function CodeBlock({ children }: { children: React.ReactNode }) {
    const [copied, setCopied] = useState(false)

    // Pull language from the inner <code> element's className (set by rehype-highlight)
    const codeEl = Array.isArray(children) ? children[0] : children
    const rawClass: string =
        (codeEl as React.ReactElement<{ className?: string }>)?.props?.className ?? ""
    const language = rawClass.replace("hljs", "").replace(/language-/g, "").trim() || null

    function getText(node: React.ReactNode): string {
        if (typeof node === "string") return node
        if (Array.isArray(node)) return node.map(getText).join("")
        if (node && typeof node === "object" && "props" in (node as object)) {
            const el = node as React.ReactElement<{ children?: React.ReactNode }>
            return getText(el.props.children)
        }
        return ""
    }

    const copy = () => {
        navigator.clipboard.writeText(getText(children))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="group relative mb-4">
            {/* Header bar */}
            <div className="flex items-center justify-between bg-[#0d0c14] border border-[#2a2840] border-b-[#1e1c2e] rounded-t-xl px-4 py-2">
                <span className="text-[10px] text-[#555370] uppercase tracking-widest font-mono">
                    {language ?? "code"}
                </span>
                <button
                    onClick={copy}
                    className="flex items-center gap-1.5 text-[10px] text-[#555370] hover:text-[#c4c0d8] transition-colors cursor-pointer"
                >
                    {copied ? <MdCheck size={12} /> : <MdContentCopy size={12} />}
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>
            {/* Code area */}
            <pre className="bg-[#0a0a0f] border border-[#2a2840] border-t-0 rounded-b-xl p-4 overflow-x-auto text-sm font-mono m-0 leading-relaxed">
                {children}
            </pre>
        </div>
    )
}

// ─── Callout boxes  ([!NOTE] / [!TIP] / [!WARNING] / [!DANGER]) ──────────────
// remark-gfm v4 parses GitHub-style alerts and attaches data-gfm-alert on the
// blockquote HAST node, so we read it from node.properties rather than parsing
// the raw text.

const CALLOUT = {
    NOTE:    { bg: "bg-[#16152a]", border: "border-violet-500",  icon: "ℹ️",  label: "Note",    text: "text-[#AFA9EC]"   },
    TIP:     { bg: "bg-[#0f1a14]", border: "border-emerald-500", icon: "💡",  label: "Tip",     text: "text-emerald-400" },
    WARNING: { bg: "bg-[#1a1600]", border: "border-amber-500",   icon: "⚠️",  label: "Warning", text: "text-amber-400"   },
    DANGER:  { bg: "bg-[#1a0f0f]", border: "border-red-500",     icon: "🚨",  label: "Danger",  text: "text-red-400"     },
    IMPORTANT: { bg: "bg-[#16152a]", border: "border-violet-400", icon: "📌", label: "Important", text: "text-[#AFA9EC]" },
    CAUTION: { bg: "bg-[#1a0f0f]", border: "border-orange-500",  icon: "🔥",  label: "Caution", text: "text-orange-400"  },
} as const

type CalloutType = keyof typeof CALLOUT

// ─── Element map ─────────────────────────────────────────────────────────────

const components: Components = {

    // Headings
    h1: ({ children }) => (
        <h1 className="font-syne font-extrabold text-2xl text-[#f0eeff] mt-8 mb-4 pb-3 leading-tight tracking-tight border-b border-[#2a2840]">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="font-syne font-bold text-xl text-[#f0eeff] mt-7 mb-3 leading-snug">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="font-syne font-semibold text-lg text-[#c4c0d8] mt-5 mb-2">
            {children}
        </h3>
    ),
    h4: ({ children }) => (
        <h4 className="font-semibold text-[#c4c0d8] mt-4 mb-2">{children}</h4>
    ),

    // Paragraph & inline
    p: ({ children }) => (
        <p className="text-sm text-[#7a7890] leading-relaxed mb-4">{children}</p>
    ),
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
        >
            {children}
        </a>
    ),
    strong: ({ children }) => (
        <strong className="text-[#c4c0d8] font-semibold">{children}</strong>
    ),
    em: ({ children }) => <em className="text-[#c4c0d8] italic">{children}</em>,
    del: ({ children }) => (
        <del className="text-[#555370] line-through">{children}</del>
    ),

    // Code
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    code: ({ className, children }) => {
        const isBlock = Boolean(className?.includes("language-") || className?.includes("hljs"))
        if (isBlock) return <code className={className}>{children}</code>
        return (
            <code className="bg-[#1e1c2e] text-violet-300 px-1.5 py-0.5 rounded text-xs font-mono">
                {children}
            </code>
        )
    },

    // Lists
    ul: ({ children }) => (
        <ul className="list-disc list-inside text-sm text-[#7a7890] mb-4 space-y-1.5 pl-2">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal list-inside text-sm text-[#7a7890] mb-4 space-y-1.5 pl-2">
            {children}
        </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,

    // Task list checkboxes (remark-gfm renders <input type="checkbox"> inside <li>)
    input: ({ type, checked }) => {
        if (type !== "checkbox") return null
        return (
            <span
                className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded mr-2 border text-[10px] align-middle flex-shrink-0
                    ${checked
                        ? "bg-violet-500 border-violet-500 text-white"
                        : "border-[#2a2840] bg-[#1e1c2e]"
                    }`}
            >
                {checked ? "✓" : ""}
            </span>
        )
    },

    // Blockquotes & callouts
    // remark-gfm v4 sets dataGfmAlert on the hast node for [!NOTE] etc.
    blockquote: ({ node, children }) => {
        const alertType = (
            node?.properties as Record<string, unknown>
        )?.dataGfmAlert as string | undefined

        if (alertType) {
            const key = alertType.toUpperCase() as CalloutType
            const s = CALLOUT[key] ?? CALLOUT.NOTE
            return (
                <div className={`${s.bg} border-l-4 ${s.border} rounded-r-xl px-4 py-3 my-4`}>
                    <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2 ${s.text}`}>
                        <span>{s.icon}</span>
                        <span>{s.label}</span>
                    </div>
                    <div className="text-sm text-[#7a7890] [&>p:last-child]:mb-0">
                        {children}
                    </div>
                </div>
            )
        }

        return (
            <blockquote className="border-l-2 border-[#2a2840] pl-4 my-4 text-sm text-[#6b6880] italic">
                {children}
            </blockquote>
        )
    },

    hr: () => <hr className="border-[#2a2840] my-8" />,

    // Tables (remark-gfm)
    table: ({ children }) => (
        <div className="overflow-x-auto mb-4 rounded-xl border border-[#2a2840]">
            <table className="w-full text-sm text-[#7a7890]">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-[#1e1c2e]">{children}</thead>,
    th: ({ children }) => (
        <th className="text-left text-[#c4c0d8] font-semibold px-4 py-2.5 border-b border-[#2a2840]">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="px-4 py-2.5 border-b border-[#1e1c2e]">{children}</td>
    ),

    // Images — alt text becomes a caption
    img: ({ src, alt }) => (
        <figure className="mb-6">
            <img
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                className="rounded-xl w-full object-cover border border-[#2a2840] shadow-lg"
            />
            {alt && (
                <figcaption className="text-center text-xs text-[#555370] mt-2 italic">
                    {alt}
                </figcaption>
            )}
        </figure>
    ),
}

export function MarkdownRenderer({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeHighlight]}
            components={components}
        >
            {content}
        </ReactMarkdown>
    )
}
