"use client"

import { useState, useEffect } from "react"
import { Navbar } from "@/components"
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer"

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
}

const THEMES: { value: PostTheme; label: string; color: string }[] = [
    { value: "purple", label: "Purple", color: "#7c6dff" },
    { value: "green",  label: "Green",  color: "#97C459" },
    { value: "pink",   label: "Pink",   color: "#ED93B1" },
]

function slugify(t: string) {
    return t.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim()
}

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: (key: string) => void }) {
    const [value, setValue]   = useState("")
    const [error, setError]   = useState(false)
    const [loading, setLoad]  = useState(false)

    const attempt = async () => {
        if (!value) return
        setLoad(true)
        setError(false)
        const res = await fetch("/api/blog/posts", {
            headers: { "x-logistics-key": value },
        })
        setLoad(false)
        if (res.ok) {
            try { sessionStorage.setItem("_lk", value) } catch { /* ignore */ }
            onAuth(value)
        } else {
            setError(true)
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
            <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-8 w-full max-w-sm">
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Restricted</p>
                <h1 className="font-syne font-extrabold text-2xl text-[#f0eeff] mb-1">Blog Editor</h1>
                <p className="text-sm text-[#555370] mb-6">Enter the access password to manage posts.</p>
                <input
                    type="password"
                    placeholder="Password"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && attempt()}
                    className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-4 py-3 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors mb-3"
                />
                {error && <p className="text-xs text-pink-400 mb-3">Incorrect password.</p>}
                <button
                    onClick={attempt}
                    disabled={loading || !value}
                    className="w-full bg-[#7c6dff] hover:bg-[#6a5de8] disabled:opacity-40 text-white font-medium text-sm py-3 rounded-xl transition-colors cursor-pointer"
                >
                    {loading ? "Checking…" : "Enter"}
                </button>
            </div>
        </div>
    )
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
    post,
    authKey,
    onSaved,
    onDeleted,
}: {
    post: Post
    authKey: string
    onSaved: (updated: Post) => void
    onDeleted: (id: string) => void
}) {
    const [editing, setEditing]       = useState(false)
    const [showPreview, setPreview]   = useState(false)
    const [showSettings, setSettings] = useState(false)
    const [saving, setSaving]         = useState(false)
    const [deleting, setDeleting]     = useState(false)
    const [error, setError]           = useState<string | null>(null)

    const [title, setTitle]           = useState(post.title)
    const [slug, setSlug]             = useState(post.slug)
    const [content, setContent]       = useState(post.content)
    const [excerpt, setExcerpt]       = useState(post.excerpt)
    const [coverEmoji, setEmoji]      = useState(post.cover_emoji)
    const [tags, setTags]             = useState<string[]>(post.tags ?? [])
    const [theme, setTheme]           = useState<PostTheme>(post.theme ?? "purple")
    const [newTag, setNewTag]         = useState("")

    // Sync local state with prop when post is updated externally (e.g. publish toggle)
    useEffect(() => {
        if (!editing) {
            setTitle(post.title)
            setSlug(post.slug)
            setContent(post.content)
            setExcerpt(post.excerpt)
            setEmoji(post.cover_emoji)
            setTags(post.tags ?? [])
            setTheme(post.theme ?? "purple")
        }
    }, [post, editing])

    const cancel = () => {
        setTitle(post.title); setSlug(post.slug); setContent(post.content)
        setExcerpt(post.excerpt); setEmoji(post.cover_emoji)
        setTags(post.tags ?? []); setTheme(post.theme ?? "purple")
        setNewTag(""); setEditing(false); setPreview(false); setSettings(false); setError(null)
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
                headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
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

    const togglePublished = async () => {
        const res = await fetch("/api/blog/posts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
            body: JSON.stringify({ id: post.id, published: !post.published }),
        })
        if (res.ok) onSaved(await res.json())
    }

    const deletePost = async () => {
        if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return
        setDeleting(true)
        const res = await fetch("/api/blog/posts", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
            body: JSON.stringify({ id: post.id }),
        })
        if (res.ok) onDeleted(post.id)
        else setDeleting(false)
    }

    return (
        <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex items-start gap-3">
                    {post.cover_emoji && (
                        <span className="text-2xl leading-none mt-0.5 shrink-0">{post.cover_emoji}</span>
                    )}
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-[#f0eeff] truncate">{post.title}</h2>
                        <p className="text-xs text-[#555370] mt-0.5">
                            {new Date(post.created_at).toLocaleDateString("en-US", {
                                year: "numeric", month: "long", day: "numeric",
                            })}
                            <span className="mx-1.5">·</span>
                            {post.reading_time} min read
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={togglePublished}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                            post.published
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                : "bg-[#1e1c2e] border-[#2a2840] text-[#555370] hover:bg-[#2a2840]"
                        }`}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${post.published ? "bg-emerald-400" : "bg-[#555370]"}`} />
                        {post.published ? "Public" : "Draft"}
                    </button>

                    {editing ? (
                        <>
                            <button
                                onClick={cancel}
                                className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2840] text-[#888] hover:bg-[#1e1c2e] transition-colors"
                            >Cancel</button>
                            <button
                                onClick={save}
                                disabled={saving}
                                className="text-xs px-3 py-1.5 rounded-lg bg-[#7c6dff] text-white hover:bg-[#6a5de8] disabled:opacity-40 transition-colors"
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setEditing(true)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2840] text-[#888] hover:bg-[#1e1c2e] transition-colors"
                        >Edit</button>
                    )}

                    <button
                        onClick={deletePost}
                        disabled={deleting}
                        className="text-[#555370] hover:text-pink-400 transition-colors p-1.5 rounded-lg hover:bg-pink-400/10 disabled:opacity-40"
                        aria-label="Delete post"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="border-t border-[#2a2840] px-6 py-4">
                {error && <p className="text-xs text-pink-400 mb-3">{error}</p>}

                {editing ? (
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
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Post Settings
                                </span>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className={`w-3.5 h-3.5 text-[#555370] transition-transform duration-200 ${showSettings ? "rotate-180" : ""}`}
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
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
                                        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.75rem]">
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
                ) : (
                    /* Collapsed — content preview */
                    <div className="relative">
                        <div className="max-h-28 overflow-hidden">
                            <MarkdownRenderer content={post.content || "_No content yet._"} />
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#13121c] to-transparent pointer-events-none" />
                        {post.excerpt && (
                            <p className="mt-3 text-xs text-[#555370] italic border-t border-[#2a2840] pt-3">{post.excerpt}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── New Post Form ────────────────────────────────────────────────────────────

function NewPostForm({ authKey, onCreated }: { authKey: string; onCreated: (p: Post) => void }) {
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
                headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
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
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
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

// ─── Editor view (authenticated) ─────────────────────────────────────────────

function Editor({ authKey }: { authKey: string }) {
    const [posts, setPosts]  = useState<Post[]>([])
    const [loading, setLoad] = useState(true)
    const [error, setError]  = useState<string | null>(null)

    useEffect(() => {
        fetch("/api/blog/posts", { headers: { "x-logistics-key": authKey } })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((data: Post[]) => { setPosts(data); setLoad(false) })
            .catch(() => { setError("Failed to load posts."); setLoad(false) })
    }, [authKey])

    const handleSaved   = (updated: Post) => setPosts((p) => p.map((x) => x.id === updated.id ? updated : x))
    const handleDeleted = (id: string)    => setPosts((p) => p.filter((x) => x.id !== id))
    const handleCreated = (post: Post)    => setPosts((p) => [post, ...p])

    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="blog" />

            <section className="px-2 mb-8">
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Internal</p>
                <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight mb-2">
                    Blog Editor
                </h1>
                <p className="text-sm text-[#555370] max-w-sm leading-relaxed">
                    Manage posts, edit content, and toggle visibility. Changes save directly to Supabase.
                </p>
            </section>

            <div className="max-w-3xl space-y-4">
                <NewPostForm authKey={authKey} onCreated={handleCreated} />

                {error && (
                    <div className="bg-[#1a0f14] border border-[#2e1f28] rounded-2xl p-6 text-pink-300 text-sm">{error}</div>
                )}

                {loading && (
                    <div className="space-y-4 animate-pulse">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-[#13121c] border border-[#2a2840] rounded-2xl h-32" />
                        ))}
                    </div>
                )}

                {!loading && !error && posts.length === 0 && (
                    <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-12 text-center">
                        <p className="text-[#555370] text-sm">No posts yet. Create your first post above.</p>
                    </div>
                )}

                {!loading && posts.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        authKey={authKey}
                        onSaved={handleSaved}
                        onDeleted={handleDeleted}
                    />
                ))}
            </div>
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BlogEditorPage() {
    const [authKey, setAuthKey]     = useState<string | null>(null)
    const [hydrated, setHydrated]   = useState(false)

    useEffect(() => {
        Promise.resolve()
            .then(() => { try { return sessionStorage.getItem("_lk") } catch { return null } })
            .then((saved) => { if (saved) setAuthKey(saved); setHydrated(true) })
    }, [])

    if (!hydrated) return null
    if (!authKey)  return <PasswordGate onAuth={setAuthKey} />
    return <Editor authKey={authKey} />
}
