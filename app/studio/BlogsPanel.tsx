"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer"
import { Icon, ICON_PATHS, formatDate } from "./shared"

type PostTheme = "purple" | "green" | "pink"

type Post = {
    id: string
    title: string
    slug: string
    excerpt: string
    content: string
    tags: string[]
    cover_emoji: string
    theme: PostTheme
    reading_time: number
    published: boolean
    created_at: string
    view_count: number
}

type StatusFilter = "all" | "published" | "draft"

type SortKey = "newest" | "oldest" | "popular" | "title-az" | "title-za" | "longest-read"

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "newest",       label: "Date added (newest)" },
    { value: "oldest",       label: "Date added (oldest)" },
    { value: "popular",      label: "Most popular" },
    { value: "title-az",     label: "Title A–Z" },
    { value: "title-za",     label: "Title Z–A" },
    { value: "longest-read", label: "Longest read" },
]

const THEMES: { value: PostTheme; label: string; color: string }[] = [
    { value: "purple", label: "Purple", color: "#7c6dff" },
    { value: "green",  label: "Green",  color: "#97C459" },
    { value: "pink",   label: "Pink",   color: "#ED93B1" },
]

function slugify(t: string) {
    return t.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim()
}

function postUrl(slug: string) {
    return `${window.location.origin}/blog/${slug}`
}

// ─── Card action dropdown ─────────────────────────────────────────────────────

function PostActionMenu({
    post,
    onEdit,
    onDelete,
}: {
    post: Post
    onEdit: () => void
    onDelete: () => void
}) {
    const [open, setOpen]           = useState(false)
    const [copied, setCopied]       = useState(false)
    const [confirming, setConfirm]  = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
                setConfirm(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [open])

    const close = () => { setOpen(false); setConfirm(false) }

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(postUrl(post.slug))
            setCopied(true)
            setTimeout(() => { setCopied(false); close() }, 1200)
        } catch { /* clipboard unavailable */ }
    }

    const share = async () => {
        const url = postUrl(post.slug)
        if (navigator.share) {
            try {
                await navigator.share({ title: post.title, text: post.excerpt || post.title, url })
            } catch { /* user dismissed the share sheet */ }
            close()
        } else {
            // No native share sheet on this platform — fall back to copying
            await copyLink()
        }
    }

    const itemClass = "w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-left text-[#c4c0d8] hover:bg-[#2a2840] transition-colors"

    return (
        <div ref={ref} className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); setConfirm(false) }}
                aria-label="Post actions"
                aria-expanded={open}
                className={`p-1.5 rounded-lg transition-colors ${
                    open ? "bg-[#2a2840] text-[#f0eeff]" : "text-[#555370] hover:text-[#c4c0d8] hover:bg-[#1e1c2e]"
                }`}
            >
                <Icon d={ICON_PATHS.kebab} />
            </button>

            {open && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 w-44 bg-[#1e1c2e] border border-[#2a2840] rounded-xl shadow-xl shadow-black/40 py-1.5 z-20 overflow-hidden"
                >
                    <button onClick={() => { close(); onEdit() }} className={itemClass}>
                        <Icon d={ICON_PATHS.edit} className="w-3.5 h-3.5 shrink-0" />
                        Edit
                    </button>
                    <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={close}
                        className={itemClass}
                    >
                        <Icon d={ICON_PATHS.external} className="w-3.5 h-3.5 shrink-0" />
                        View page
                    </a>
                    <button onClick={share} className={itemClass}>
                        <Icon d={ICON_PATHS.share} className="w-3.5 h-3.5 shrink-0" />
                        Share…
                    </button>
                    <button onClick={copyLink} className={itemClass}>
                        <Icon d={copied ? ICON_PATHS.check : ICON_PATHS.link} className={`w-3.5 h-3.5 shrink-0 ${copied ? "text-emerald-400" : ""}`} />
                        {copied ? "Copied!" : "Copy link"}
                    </button>
                    <div className="my-1.5 border-t border-[#2a2840]" />
                    <button
                        onClick={() => {
                            if (!confirming) { setConfirm(true); return }
                            close()
                            onDelete()
                        }}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-left transition-colors ${
                            confirming
                                ? "text-pink-300 bg-pink-400/10 hover:bg-pink-400/20 font-semibold"
                                : "text-pink-400 hover:bg-pink-400/10"
                        }`}
                    >
                        <Icon d={ICON_PATHS.trash} className="w-3.5 h-3.5 shrink-0" />
                        {confirming ? "Confirm delete?" : "Delete"}
                    </button>
                </div>
            )}
        </div>
    )
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function PostGridCard({
    post,
    onSaved,
    onDeleted,
    onOpen,
    onEdit,
    selectMode,
    selected,
    onToggleSelect,
}: {
    post: Post
    onSaved: (updated: Post) => void
    onDeleted: (id: string) => void
    onOpen: () => void
    onEdit: () => void
    selectMode: boolean
    selected: boolean
    onToggleSelect: (id: string) => void
}) {
    const togglePublished = async (e: React.MouseEvent) => {
        e.stopPropagation()
        const res = await fetch("/api/blog/posts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: post.id, published: !post.published }),
        })
        if (res.ok) onSaved(await res.json())
    }

    const deletePost = async () => {
        const res = await fetch("/api/blog/posts", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: post.id }),
        })
        if (res.ok) onDeleted(post.id)
    }

    const snippet = post.excerpt || post.content.replace(/[#*_`>~\-\[\]()!]/g, " ").replace(/\s+/g, " ").trim()

    return (
        <div
            onClick={() => (selectMode ? onToggleSelect(post.id) : onOpen())}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    if (selectMode) onToggleSelect(post.id); else onOpen()
                }
            }}
            className={`group bg-[#13121c] border rounded-2xl p-5 flex flex-col gap-3 cursor-pointer transition-colors ${
                selected ? "border-[#7c6dff]" : "border-[#2a2840] hover:border-[#3d3a5c]"
            }`}
        >
            {/* Top row: emoji + checkbox/menu */}
            <div className="flex items-start justify-between gap-2">
                <span className="text-3xl leading-none">{post.cover_emoji || "📝"}</span>
                <div className="flex items-center gap-1.5">
                    {selectMode ? (
                        <span
                            aria-hidden
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                                selected
                                    ? "bg-[#7c6dff] border-[#7c6dff] text-white"
                                    : "border-[#2a2840] bg-[#0a0a0f] group-hover:border-[#555370]"
                            }`}
                        >
                            {selected && <Icon d={ICON_PATHS.check} className="w-3 h-3" />}
                        </span>
                    ) : (
                        <PostActionMenu post={post} onEdit={onEdit} onDelete={deletePost} />
                    )}
                </div>
            </div>

            {/* Title + snippet */}
            <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#f0eeff] leading-snug line-clamp-2">{post.title}</h2>
                {snippet && <p className="text-xs text-[#555370] mt-1.5 leading-relaxed line-clamp-2">{snippet}</p>}
            </div>

            {/* Tags */}
            {(post.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {post.tags.slice(0, 3).map((tag, i) => (
                        <span key={i} className="bg-[#1e1c2e] border border-[#2a2840] text-[#AFA9EC] text-[10px] px-2 py-0.5 rounded-full">
                            {tag}
                        </span>
                    ))}
                    {post.tags.length > 3 && (
                        <span className="text-[10px] text-[#555370] px-1 py-0.5">+{post.tags.length - 3}</span>
                    )}
                </div>
            )}

            {/* Footer: meta + status */}
            <div className="mt-auto pt-3 border-t border-[#2a2840] flex items-center justify-between gap-2">
                <p className="text-[11px] text-[#555370] truncate">
                    {new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    <span className="mx-1">·</span>
                    {post.reading_time} min
                    <span className="mx-1">·</span>
                    {post.view_count ?? 0} {post.view_count === 1 ? "view" : "views"}
                </p>
                <button
                    onClick={togglePublished}
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 transition-colors ${
                        post.published
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-[#1e1c2e] border-[#2a2840] text-[#555370] hover:bg-[#2a2840]"
                    }`}
                >
                    <span className={`w-1 h-1 rounded-full ${post.published ? "bg-emerald-400" : "bg-[#555370]"}`} />
                    {post.published ? "Public" : "Draft"}
                </button>
            </div>
        </div>
    )
}

// ─── Preview / edit modal ─────────────────────────────────────────────────────

function PostModal({
    post,
    initialEditing,
    onSaved,
    onClose,
}: {
    post: Post
    initialEditing: boolean
    onSaved: (updated: Post) => void
    onClose: () => void
}) {
    const [editing, setEditing]       = useState(initialEditing)
    const [showPreview, setPreview]   = useState(false)
    const [showSettings, setSettings] = useState(false)
    const [saving, setSaving]         = useState(false)
    const [error, setError]           = useState<string | null>(null)

    const [title, setTitle]      = useState(post.title)
    const [slug, setSlug]        = useState(post.slug)
    const [content, setContent]  = useState(post.content)
    const [excerpt, setExcerpt]  = useState(post.excerpt)
    const [coverEmoji, setEmoji] = useState(post.cover_emoji)
    const [tags, setTags]        = useState<string[]>(post.tags ?? [])
    const [theme, setTheme]      = useState<PostTheme>(post.theme ?? "purple")
    const [newTag, setNewTag]    = useState("")

    // Escape closes, and lock body scroll while open
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        document.addEventListener("keydown", onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.removeEventListener("keydown", onKey)
            document.body.style.overflow = prev
        }
    }, [onClose])

    const resetFields = () => {
        setTitle(post.title); setSlug(post.slug); setContent(post.content)
        setExcerpt(post.excerpt); setEmoji(post.cover_emoji)
        setTags(post.tags ?? []); setTheme(post.theme ?? "purple")
        setNewTag("")
    }

    const cancel = () => {
        resetFields()
        setEditing(false); setPreview(false); setSettings(false); setError(null)
    }

    const addTag = () => {
        const t = newTag.trim()
        if (t && !tags.includes(t)) setTags([...tags, t])
        setNewTag("")
    }

    const save = async () => {
        setSaving(true)
        setError(null)
        try {
            const res = await fetch("/api/blog/posts", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: post.id, title, slug, content, excerpt, cover_emoji: coverEmoji, tags, theme }),
            })
            if (!res.ok) { setError((await res.json()).error ?? "Save failed"); return }
            const updated: Post = await res.json()
            onSaved(updated)
            setEditing(false); setPreview(false); setSettings(false)
        } catch {
            setError("Network error")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={post.title}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-[#13121c] border border-[#2a2840] rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-[#2a2840] flex items-start justify-between gap-4 shrink-0">
                    <div className="min-w-0 flex items-start gap-3">
                        <span className="text-2xl leading-none mt-0.5 shrink-0">{(editing ? coverEmoji : post.cover_emoji) || "📝"}</span>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold text-[#f0eeff] truncate">{editing ? title || "Untitled" : post.title}</h2>
                            <p className="text-xs text-[#555370] mt-0.5">
                                {formatDate(post.created_at)}
                                <span className="mx-1.5">·</span>
                                {post.reading_time} min read
                                <span className="mx-1.5">·</span>
                                {post.view_count ?? 0} {post.view_count === 1 ? "view" : "views"}
                                <span className="mx-1.5">·</span>
                                <span className={post.published ? "text-emerald-400" : ""}>{post.published ? "Public" : "Draft"}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {!editing && (
                            <button
                                onClick={() => setEditing(true)}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#2a2840] text-[#c4c0d8] hover:bg-[#1e1c2e] transition-colors"
                            >
                                <Icon d={ICON_PATHS.edit} className="w-3.5 h-3.5" />
                                Edit
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="p-1.5 rounded-lg text-[#555370] hover:text-[#f0eeff] hover:bg-[#1e1c2e] transition-colors"
                        >
                            <Icon d={ICON_PATHS.close} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 overflow-y-auto flex-1">
                    {error && <p className="text-xs text-pink-400 mb-3">{error}</p>}

                    {!editing ? (
                        <MarkdownRenderer content={post.content || "_No content yet._"} />
                    ) : (
                        <>
                            {/* Write / Preview tabs */}
                            <div className="flex gap-1 mb-4 bg-[#0a0a0f] p-1 rounded-xl w-fit border border-[#2a2840]">
                                {(["Write", "Preview"] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setPreview(tab === "Preview")}
                                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                            (tab === "Preview") === showPreview
                                                ? "bg-[#7c6dff] text-white"
                                                : "text-[#555370] hover:text-[#c4c0d8]"
                                        }`}
                                    >{tab}</button>
                                ))}
                            </div>

                            {showPreview ? (
                                <div className="min-h-40 bg-[#0a0a0f] border border-[#2a2840] rounded-xl p-4">
                                    <MarkdownRenderer content={content || "_Nothing to preview yet._"} />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-[#888] mb-1.5">Title</label>
                                        <input
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                                            type="text"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-[#888] mb-1.5">Content (Markdown)</label>
                                        <textarea
                                            value={content}
                                            onChange={(e) => setContent(e.target.value)}
                                            rows={14}
                                            className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] font-mono placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors resize-y"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Post settings accordion */}
                            <div className="mt-4 rounded-xl border border-[#2a2840] overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setSettings(!showSettings)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0a0a0f] hover:bg-[#13121c] transition-colors"
                                >
                                    <span className="flex items-center gap-2 text-xs font-medium text-[#555370]">
                                        <Icon d={ICON_PATHS.gear} className="w-3.5 h-3.5" />
                                        Post Settings
                                    </span>
                                    <Icon
                                        d={ICON_PATHS.chevron}
                                        className={`w-3.5 h-3.5 text-[#555370] transition-transform duration-200 ${showSettings ? "rotate-180" : ""}`}
                                    />
                                </button>

                                {showSettings && (
                                    <div className="px-4 py-4 space-y-4 border-t border-[#2a2840] bg-[#13121c]">

                                        {/* Slug */}
                                        <div>
                                            <label className="block text-xs font-medium text-[#888] mb-1.5">
                                                URL Slug
                                                <span className="text-[#555370] font-normal ml-1">— /blog/<em>{slug || "…"}</em></span>
                                            </label>
                                            <input
                                                value={slug}
                                                onChange={(e) => setSlug(e.target.value)}
                                                className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] font-mono placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                                                type="text"
                                            />
                                        </div>

                                        {/* Cover emoji */}
                                        <div className="flex items-start gap-4">
                                            <div className="w-14 h-14 rounded-xl border-2 border-dashed border-[#2a2840] flex items-center justify-center text-3xl shrink-0 bg-[#0a0a0f]">
                                                {coverEmoji || "📝"}
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-[#888] mb-1.5">Cover Emoji</label>
                                                <input
                                                    value={coverEmoji}
                                                    onChange={(e) => setEmoji(e.target.value)}
                                                    placeholder="e.g. 🚀"
                                                    maxLength={4}
                                                    className="w-24 bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-center text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                                                    type="text"
                                                />
                                                <p className="text-xs text-[#555370] mt-1">Displayed on the post card</p>
                                            </div>
                                        </div>

                                        {/* Excerpt */}
                                        <div>
                                            <label className="block text-xs font-medium text-[#888] mb-1.5">
                                                Excerpt
                                                <span className="text-[#555370] font-normal ml-1">— shown in post previews</span>
                                            </label>
                                            <textarea
                                                value={excerpt}
                                                onChange={(e) => setExcerpt(e.target.value)}
                                                rows={3}
                                                placeholder="A short summary of this post…"
                                                className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors resize-none"
                                            />
                                        </div>

                                        {/* Tags */}
                                        <div>
                                            <label className="block text-xs font-medium text-[#888] mb-1.5">
                                                Tags
                                                <span className="text-[#555370] font-normal ml-1">— press Enter or click Add</span>
                                            </label>
                                            <div className="flex flex-wrap gap-1.5 mb-2 min-h-7">
                                                {tags.map((tag, ti) => (
                                                    <span key={ti} className="inline-flex items-center gap-1 bg-[#1e1c2e] border border-[#2a2840] text-[#AFA9EC] text-xs px-2.5 py-0.5 rounded-full">
                                                        {tag}
                                                        <button
                                                            type="button"
                                                            onClick={() => setTags(tags.filter((_, j) => j !== ti))}
                                                            className="ml-0.5 hover:text-white transition-colors leading-none"
                                                            aria-label="Remove tag"
                                                        >×</button>
                                                    </span>
                                                ))}
                                                {tags.length === 0 && (
                                                    <span className="text-xs text-[#555370] italic">No tags yet</span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    value={newTag}
                                                    onChange={(e) => setNewTag(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
                                                    placeholder="e.g. design, tutorial…"
                                                    className="flex-1 bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-1.5 text-xs text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                                                    type="text"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={addTag}
                                                    className="text-xs px-3 py-1.5 rounded-xl bg-[#1e1c2e] border border-[#2a2840] text-[#AFA9EC] hover:bg-[#2a2840] transition-colors"
                                                >Add</button>
                                            </div>
                                        </div>

                                        {/* Theme */}
                                        <div>
                                            <p className="text-xs font-medium text-[#888] mb-2">
                                                Theme
                                                <span className="text-[#555370] font-normal ml-1">— accent color for the post card</span>
                                            </p>
                                            <div className="flex gap-2 flex-wrap">
                                                {THEMES.map((t) => (
                                                    <button
                                                        key={t.value}
                                                        type="button"
                                                        onClick={() => setTheme(t.value)}
                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                                                            theme === t.value
                                                                ? "scale-105"
                                                                : "border-[#2a2840] text-[#555370] hover:border-[#555370]"
                                                        }`}
                                                        style={
                                                            theme === t.value
                                                                ? { backgroundColor: t.color + "22", borderColor: t.color, color: t.color }
                                                                : {}
                                                        }
                                                    >
                                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                                                        {t.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer — only while editing */}
                {editing && (
                    <div className="px-6 py-4 border-t border-[#2a2840] flex items-center justify-end gap-2 shrink-0 bg-[#13121c]">
                        <button
                            onClick={cancel}
                            className="text-xs px-4 py-2 rounded-lg border border-[#2a2840] text-[#888] hover:bg-[#1e1c2e] transition-colors"
                        >Cancel</button>
                        <button
                            onClick={save}
                            disabled={saving}
                            className="text-xs px-4 py-2 rounded-lg bg-[#7c6dff] text-white hover:bg-[#6a5de8] disabled:opacity-40 transition-colors"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── New Post Form ────────────────────────────────────────────────────────────

function NewPostForm({ onCreated }: { onCreated: (p: Post) => void }) {
    const [open, setOpen]           = useState(false)
    const [title, setTitle]         = useState("")
    const [slug, setSlug]           = useState("")
    const [slugManual, setManual]   = useState(false)
    const [content, setContent]     = useState("")
    const [saving, setSaving]       = useState(false)
    const [error, setError]         = useState<string | null>(null)

    const handleTitle = (v: string) => { setTitle(v); if (!slugManual) setSlug(slugify(v)) }
    const handleSlug  = (v: string) => { setSlug(v); setManual(true) }

    const create = async () => {
        if (!title.trim() || !slug.trim()) { setError("Title and slug are required."); return }
        setSaving(true); setError(null)
        try {
            const res = await fetch("/api/blog/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, slug, content }),
            })
            if (!res.ok) { setError((await res.json()).error ?? "Create failed"); return }
            const post: Post = await res.json()
            onCreated(post)
            setTitle(""); setSlug(""); setContent(""); setManual(false); setOpen(false)
        } catch {
            setError("Network error")
        } finally {
            setSaving(false)
        }
    }

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 text-sm text-[#7c6dff] hover:text-[#6a5de8] transition-colors font-medium"
            >
                <Icon d={ICON_PATHS.plus} />
                New Post
            </button>
        )
    }

    return (
        <div className="bg-[#13121c] border border-[#7c6dff]/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#7c6dff] uppercase tracking-widest">New Post</p>
                <button
                    onClick={() => { setOpen(false); setError(null) }}
                    className="text-[#555370] hover:text-[#888] text-xs transition-colors"
                >Cancel</button>
            </div>
            {error && <p className="text-xs text-pink-400">{error}</p>}
            <div>
                <label className="block text-xs font-medium text-[#888] mb-1.5">Title</label>
                <input
                    value={title}
                    onChange={(e) => handleTitle(e.target.value)}
                    placeholder="My new post"
                    className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                    type="text"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-[#888] mb-1.5">
                    Slug
                    <span className="text-[#555370] font-normal ml-1">— /blog/<em>{slug || "…"}</em></span>
                </label>
                <input
                    value={slug}
                    onChange={(e) => handleSlug(e.target.value)}
                    placeholder="my-new-post"
                    className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] font-mono placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                    type="text"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-[#888] mb-1.5">
                    Content
                    <span className="text-[#555370] font-normal ml-1">— optional, you can edit it after creating</span>
                </label>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={6}
                    placeholder={"# Hello World\n\nStart writing…"}
                    className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] font-mono placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors resize-y"
                />
            </div>
            <button
                onClick={create}
                disabled={saving || !title.trim() || !slug.trim()}
                className="w-full bg-[#7c6dff] hover:bg-[#6a5de8] disabled:opacity-40 text-white font-medium text-sm py-2.5 rounded-xl transition-colors cursor-pointer"
            >
                {saving ? "Creating…" : "Create Post"}
            </button>
        </div>
    )
}

// ─── Blogs panel ──────────────────────────────────────────────────────────────

export function BlogsPanel() {
    const [posts, setPosts]  = useState<Post[]>([])
    const [loading, setLoad] = useState(true)
    const [error, setError]  = useState<string | null>(null)

    // Toolbar state
    const [search, setSearch]         = useState("")
    const [status, setStatus]         = useState<StatusFilter>("all")
    const [tagFilter, setTagFilter]   = useState<string>("all")
    const [sort, setSort]             = useState<SortKey>("newest")

    // Bulk selection
    const [selectMode, setSelectMode] = useState(false)
    const [selected, setSelected]     = useState<Set<string>>(new Set())
    const [bulkBusy, setBulkBusy]     = useState(false)
    const [bulkError, setBulkError]   = useState<string | null>(null)

    // Preview/edit modal — track by id so saves stay in sync with the list
    const [modal, setModal] = useState<{ id: string; editing: boolean } | null>(null)

    useEffect(() => {
        fetch("/api/blog/posts")
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: Post[]) => { setPosts(data); setLoad(false) })
            .catch((status) => {
                setError(status === 401 ? "Your session expired. Reload the page to sign in again." : "Failed to load posts.")
                setLoad(false)
            })
    }, [])

    const handleSaved   = (updated: Post) => setPosts((p) => p.map((x) => x.id === updated.id ? { ...x, ...updated } : x))
    const handleDeleted = (id: string)    => {
        setPosts((p) => p.filter((x) => x.id !== id))
        setSelected((s) => { const next = new Set(s); next.delete(id); return next })
        setModal((m) => (m?.id === id ? null : m))
    }
    const handleCreated = (post: Post)    => setPosts((p) => [{ ...post, view_count: post.view_count ?? 0 }, ...p])

    const allTags = useMemo(
        () => Array.from(new Set(posts.flatMap((p) => p.tags ?? []))).sort((a, b) => a.localeCompare(b)),
        [posts]
    )

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase()
        const filtered = posts.filter((p) => {
            if (status === "published" && !p.published) return false
            if (status === "draft" && p.published) return false
            if (tagFilter !== "all" && !(p.tags ?? []).includes(tagFilter)) return false
            if (q) {
                const haystack = [p.title, p.slug, p.excerpt, ...(p.tags ?? [])].join(" ").toLowerCase()
                if (!haystack.includes(q)) return false
            }
            return true
        })
        const byNewest = (a: Post, b: Post) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        switch (sort) {
            case "oldest":       return filtered.sort((a, b) => byNewest(b, a))
            case "popular":      return filtered.sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0) || byNewest(a, b))
            case "title-az":     return filtered.sort((a, b) => a.title.localeCompare(b.title))
            case "title-za":     return filtered.sort((a, b) => b.title.localeCompare(a.title))
            case "longest-read": return filtered.sort((a, b) => (b.reading_time ?? 0) - (a.reading_time ?? 0) || byNewest(a, b))
            default:             return filtered.sort(byNewest)
        }
    }, [posts, search, status, tagFilter, sort])

    const hasActiveFilters = search.trim() !== "" || status !== "all" || tagFilter !== "all"
    const clearFilters = () => { setSearch(""); setStatus("all"); setTagFilter("all") }

    const publishedCount = posts.filter((p) => p.published).length
    const totalViews     = posts.reduce((sum, p) => sum + (p.view_count ?? 0), 0)

    const modalPost = modal ? posts.find((p) => p.id === modal.id) ?? null : null

    const toggleSelect = (id: string) =>
        setSelected((s) => {
            const next = new Set(s)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })

    const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); setBulkError(null) }

    const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id))
    const toggleSelectAll = () =>
        setSelected(allVisibleSelected ? new Set() : new Set(visible.map((p) => p.id)))

    const bulkDelete = async () => {
        const ids = [...selected]
        if (ids.length === 0) return
        if (!confirm(`Delete ${ids.length} post${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return
        setBulkBusy(true)
        setBulkError(null)
        try {
            const res = await fetch("/api/blog/posts", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            })
            if (!res.ok) { setBulkError((await res.json()).error ?? "Delete failed"); return }
            setPosts((p) => p.filter((x) => !selected.has(x.id)))
            exitSelectMode()
        } catch {
            setBulkError("Network error")
        } finally {
            setBulkBusy(false)
        }
    }

    const bulkSetPublished = async (published: boolean) => {
        const targets = posts.filter((p) => selected.has(p.id) && p.published !== published)
        if (targets.length === 0) return
        setBulkBusy(true)
        setBulkError(null)
        try {
            const results = await Promise.all(
                targets.map((p) =>
                    fetch("/api/blog/posts", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: p.id, published }),
                    }).then((r) => (r.ok ? r.json() as Promise<Post> : null)).catch(() => null)
                )
            )
            const updated = new Map(results.filter((r): r is Post => r !== null).map((r) => [r.id, r]))
            setPosts((p) => p.map((x) => {
                const u = updated.get(x.id)
                return u ? { ...x, ...u } : x
            }))
            if (updated.size < targets.length) setBulkError("Some posts failed to update.")
        } finally {
            setBulkBusy(false)
        }
    }

    return (
        <div className="max-w-5xl space-y-4">

            {/* Stats */}
            {!loading && !error && posts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: "Posts",     value: posts.length },
                        { label: "Published", value: publishedCount },
                        { label: "Drafts",    value: posts.length - publishedCount },
                        { label: "Views",     value: totalViews },
                    ].map((s) => (
                        <div key={s.label} className="bg-[#13121c] border border-[#2a2840] rounded-2xl px-4 py-3">
                            <p className="text-xl font-syne font-bold text-[#f0eeff]">{s.value}</p>
                            <p className="text-[11px] tracking-widest uppercase text-[#555370] mt-0.5">{s.label}</p>
                        </div>
                    ))}
                </div>
            )}

            <NewPostForm onCreated={handleCreated} />

            {/* Toolbar */}
            {!loading && !error && posts.length > 0 && (
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Icon d={ICON_PATHS.search} className="w-4 h-4 text-[#555370] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search title, slug, or tags…"
                                className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl pl-9 pr-3 py-2 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                                type="text"
                            />
                        </div>

                        {/* Sort */}
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as SortKey)}
                            aria-label="Sort posts"
                            className="bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#c4c0d8] outline-none focus:border-[#7c6dff] transition-colors cursor-pointer"
                        >
                            {SORT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Status pills */}
                        <div className="flex gap-1 bg-[#0a0a0f] p-1 rounded-xl border border-[#2a2840]">
                            {([["all", "All"], ["published", "Published"], ["draft", "Drafts"]] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    onClick={() => setStatus(value)}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                        status === value ? "bg-[#7c6dff] text-white" : "text-[#555370] hover:text-[#c4c0d8]"
                                    }`}
                                >{label}</button>
                            ))}
                        </div>

                        {/* Tag filter */}
                        {allTags.length > 0 && (
                            <select
                                value={tagFilter}
                                onChange={(e) => setTagFilter(e.target.value)}
                                aria-label="Filter by tag"
                                className="bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-1.5 text-xs text-[#c4c0d8] outline-none focus:border-[#7c6dff] transition-colors cursor-pointer"
                            >
                                <option value="all">All tags</option>
                                {allTags.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        )}

                        <div className="flex-1" />

                        <span className="text-xs text-[#555370]">
                            {visible.length} of {posts.length} post{posts.length === 1 ? "" : "s"}
                        </span>

                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="text-xs text-[#7c6dff] hover:text-[#6a5de8] transition-colors font-medium"
                            >Clear filters</button>
                        )}

                        <button
                            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                selectMode
                                    ? "border-[#7c6dff] text-[#AFA9EC] bg-[#7c6dff]/10"
                                    : "border-[#2a2840] text-[#888] hover:bg-[#1e1c2e]"
                            }`}
                        >{selectMode ? "Done" : "Select"}</button>
                    </div>

                    {/* Bulk action bar */}
                    {selectMode && (
                        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#2a2840]">
                            <button
                                onClick={toggleSelectAll}
                                className="text-xs text-[#7c6dff] hover:text-[#6a5de8] transition-colors font-medium"
                            >
                                {allVisibleSelected ? "Deselect all" : `Select all (${visible.length})`}
                            </button>
                            <span className="text-xs text-[#555370]">{selected.size} selected</span>
                            <div className="flex-1" />
                            <button
                                onClick={() => bulkSetPublished(true)}
                                disabled={bulkBusy || selected.size === 0}
                                className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                            >Publish</button>
                            <button
                                onClick={() => bulkSetPublished(false)}
                                disabled={bulkBusy || selected.size === 0}
                                className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2840] text-[#888] hover:bg-[#1e1c2e] disabled:opacity-40 transition-colors"
                            >Unpublish</button>
                            <button
                                onClick={bulkDelete}
                                disabled={bulkBusy || selected.size === 0}
                                className="text-xs px-3 py-1.5 rounded-lg border border-pink-400/30 text-pink-400 hover:bg-pink-400/10 disabled:opacity-40 transition-colors"
                            >
                                {bulkBusy ? "Working…" : `Delete${selected.size > 0 ? ` (${selected.size})` : ""}`}
                            </button>
                        </div>
                    )}

                    {bulkError && <p className="text-xs text-pink-400">{bulkError}</p>}
                </div>
            )}

            {error && (
                <div className="bg-[#1a0f14] border border-[#2e1f28] rounded-2xl p-6 text-pink-300 text-sm">{error}</div>
            )}

            {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="bg-[#13121c] border border-[#2a2840] rounded-2xl h-48" />
                    ))}
                </div>
            )}

            {!loading && !error && posts.length === 0 && (
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-12 text-center">
                    <p className="text-[#555370] text-sm">No posts yet. Create your first post above.</p>
                </div>
            )}

            {!loading && !error && posts.length > 0 && visible.length === 0 && (
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-12 text-center">
                    <p className="text-[#555370] text-sm mb-3">No posts match your filters.</p>
                    <button
                        onClick={clearFilters}
                        className="text-xs text-[#7c6dff] hover:text-[#6a5de8] transition-colors font-medium"
                    >Clear filters</button>
                </div>
            )}

            {!loading && visible.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visible.map((post) => (
                        <PostGridCard
                            key={post.id}
                            post={post}
                            onSaved={handleSaved}
                            onDeleted={handleDeleted}
                            onOpen={() => setModal({ id: post.id, editing: false })}
                            onEdit={() => setModal({ id: post.id, editing: true })}
                            selectMode={selectMode}
                            selected={selected.has(post.id)}
                            onToggleSelect={toggleSelect}
                        />
                    ))}
                </div>
            )}

            {modalPost && (
                <PostModal
                    key={modalPost.id}
                    post={modalPost}
                    initialEditing={modal?.editing ?? false}
                    onSaved={handleSaved}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    )
}
