"use client"

import { useState, useEffect } from "react"
import { Icon, ICON_PATHS } from "./shared"
import type { Project, ProjectStatus, ProjectTheme } from "./ProjectsPanel"

const THEMES: { value: ProjectTheme; label: string; color: string }[] = [
    { value: "purple", label: "Purple", color: "#7c6dff" },
    { value: "green",  label: "Green",  color: "#97C459" },
    { value: "pink",   label: "Pink",   color: "#ED93B1" },
]

const STATUSES: { value: ProjectStatus; label: string; dot: string; text: string }[] = [
    { value: "live",    label: "Live",        dot: "bg-emerald-400", text: "text-emerald-400" },
    { value: "wip",     label: "In Progress", dot: "bg-amber-400",   text: "text-amber-400" },
    { value: "planned", label: "Planned",     dot: "bg-orange-400",  text: "text-orange-400" },
]

// A grab-bag of emoji that read well as project icons — shuffled for suggestions.
const EMOJI_POOL = [
    "🚀", "🎲", "🎮", "🕹️", "🎡", "🎱", "🧩", "🤖", "🧠", "💻",
    "🖥️", "📱", "⌨️", "🖱️", "🛰️", "🌐", "☁️", "🗄️", "📊", "📈",
    "🔧", "⚙️", "🔩", "🧪", "🔬", "💡", "🔦", "🎨", "🖌️", "📐",
    "🧭", "🗺️", "📡", "🔒", "🔑", "🛡️", "⚡", "🔥", "✨", "🌈",
    "🐍", "☕", "🍕", "🎯", "🏆", "📚", "📝", "🗂️", "🔍", "🧵",
]

function randomEmojis(n: number): string[] {
    const pool = [...EMOJI_POOL]
    const out: string[] = []
    for (let i = 0; i < n && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length)
        out.push(pool.splice(idx, 1)[0])
    }
    return out
}

type Draft = {
    title: string
    description: string
    icon: string
    category: string
    status: ProjectStatus
    theme: ProjectTheme
    tags: string[]
    year: string
    link: string
    github: string
    featured: boolean
    published: boolean
}

function draftFrom(project: Project | null): Draft {
    return {
        title: project?.title ?? "",
        description: project?.description ?? "",
        icon: project?.icon || "🚀",
        category: project?.category ?? "",
        status: project?.status ?? "planned",
        theme: project?.theme ?? "purple",
        tags: project?.tags ?? [],
        year: project?.year ?? String(new Date().getFullYear()),
        link: project?.link ?? "",
        github: project?.github ?? "",
        featured: project?.featured ?? false,
        published: project?.published ?? true,
    }
}

const STEPS = ["Basics", "Details", "Links", "Review"] as const

export function ProjectWizardModal({
    project,
    onSaved,
    onClose,
}: {
    project: Project | null
    onSaved: (project: Project) => void
    onClose: () => void
}) {
    const isEdit = project !== null
    const [step, setStep]       = useState(0)
    const [draft, setDraft]     = useState<Draft>(() => draftFrom(project))
    const [suggestions, setSuggestions] = useState<string[]>(() => randomEmojis(8))
    const [newTag, setNewTag]   = useState("")
    const [saving, setSaving]   = useState(false)
    const [error, setError]     = useState<string | null>(null)

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

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

    const addTag = () => {
        const t = newTag.trim()
        if (t && !draft.tags.includes(t)) set("tags", [...draft.tags, t])
        setNewTag("")
    }

    const canLeaveBasics = draft.title.trim().length > 0
    const canGoNext = step !== 0 || canLeaveBasics

    const submit = async () => {
        if (!draft.title.trim()) { setStep(0); setError("Title is required."); return }
        setSaving(true)
        setError(null)
        try {
            const res = await fetch("/api/projects", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isEdit ? { id: project!.id, ...draft } : draft),
            })
            if (!res.ok) { setError((await res.json()).error ?? "Save failed"); return }
            const saved: Project = await res.json()
            onSaved(saved)
            onClose()
        } catch {
            setError("Network error")
        } finally {
            setSaving(false)
        }
    }

    const inputClass = "w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
    const labelClass = "block text-xs font-medium text-[#888] mb-1.5"

    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? "Edit project" : "Add project"}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-[#13121c] border border-[#2a2840] rounded-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-[#2a2840] flex items-center justify-between gap-4 shrink-0">
                    <div>
                        <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium">
                            {isEdit ? "Edit Project" : "New Project"}
                        </p>
                        <h2 className="text-base font-semibold text-[#f0eeff] mt-0.5">{STEPS[step]}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 rounded-lg text-[#555370] hover:text-[#f0eeff] hover:bg-[#1e1c2e] transition-colors"
                    >
                        <Icon d={ICON_PATHS.close} />
                    </button>
                </div>

                {/* Step indicator */}
                <div className="px-6 pt-4 flex items-center gap-2 shrink-0">
                    {STEPS.map((label, i) => (
                        <button
                            key={label}
                            onClick={() => setStep(i)}
                            className="flex items-center gap-2 group"
                            aria-label={`Go to ${label}`}
                            aria-current={i === step}
                        >
                            <span
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                                    i === step
                                        ? "bg-[#7c6dff] text-white"
                                        : i < step
                                            ? "bg-[#7c6dff]/20 text-[#AFA9EC]"
                                            : "bg-[#1e1c2e] text-[#555370] group-hover:text-[#888]"
                                }`}
                            >
                                {i < step ? <Icon d={ICON_PATHS.check} className="w-3 h-3" /> : i + 1}
                            </span>
                            {i < STEPS.length - 1 && <span className={`w-6 h-px ${i < step ? "bg-[#7c6dff]/40" : "bg-[#2a2840]"}`} />}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="px-6 py-5 overflow-y-auto flex-1">
                    {error && <p className="text-xs text-pink-400 mb-3">{error}</p>}

                    {step === 0 && (
                        <div className="space-y-4">
                            <div>
                                <label className={labelClass}>Title</label>
                                <input
                                    value={draft.title}
                                    onChange={(e) => set("title", e.target.value)}
                                    placeholder="Interactive Dice Roller"
                                    className={inputClass}
                                    type="text"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Description</label>
                                <textarea
                                    value={draft.description}
                                    onChange={(e) => set("description", e.target.value)}
                                    rows={4}
                                    placeholder="What does this project do?"
                                    className={`${inputClass} resize-none`}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Category</label>
                                <input
                                    value={draft.category}
                                    onChange={(e) => set("category", e.target.value)}
                                    placeholder="e.g. Game, API, Full Stack, Portfolio"
                                    className={inputClass}
                                    type="text"
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className={labelClass + " mb-0"}>
                                        Icon
                                        <span className="text-[#555370] font-normal ml-1">— pick a suggestion or type your own</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setSuggestions(randomEmojis(8))}
                                        className="flex items-center gap-1 text-[11px] text-[#7c6dff] hover:text-[#6a5de8] transition-colors font-medium"
                                    >
                                        🎲 Shuffle
                                    </button>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-14 h-14 rounded-xl border-2 border-dashed border-[#2a2840] flex items-center justify-center text-3xl shrink-0 bg-[#0a0a0f]">
                                        {draft.icon || "🚀"}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex flex-wrap gap-1.5">
                                            {suggestions.map((e, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => set("icon", e)}
                                                    className={`w-8 h-8 rounded-lg border flex items-center justify-center text-base transition-colors ${
                                                        draft.icon === e
                                                            ? "border-[#7c6dff] bg-[#7c6dff]/10"
                                                            : "border-[#2a2840] hover:border-[#555370] bg-[#0a0a0f]"
                                                    }`}
                                                >{e}</button>
                                            ))}
                                        </div>
                                        <input
                                            value={draft.icon}
                                            onChange={(e) => set("icon", e.target.value)}
                                            placeholder="or type a custom emoji"
                                            maxLength={4}
                                            className="w-40 bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-1.5 text-sm text-center text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                                            type="text"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-4">
                            <div>
                                <p className={labelClass}>Status</p>
                                <div className="flex gap-2 flex-wrap">
                                    {STATUSES.map((s) => (
                                        <button
                                            key={s.value}
                                            type="button"
                                            onClick={() => set("status", s.value)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                                                draft.status === s.value
                                                    ? `border-current ${s.text} bg-current/10`
                                                    : "border-[#2a2840] text-[#555370] hover:border-[#555370]"
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className={labelClass}>Theme <span className="text-[#555370] font-normal">— accent color for the card</span></p>
                                <div className="flex gap-2 flex-wrap">
                                    {THEMES.map((t) => (
                                        <button
                                            key={t.value}
                                            type="button"
                                            onClick={() => set("theme", t.value)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                                                draft.theme === t.value ? "scale-105" : "border-[#2a2840] text-[#555370] hover:border-[#555370]"
                                            }`}
                                            style={draft.theme === t.value ? { backgroundColor: t.color + "22", borderColor: t.color, color: t.color } : {}}
                                        >
                                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className={labelClass}>Tags <span className="text-[#555370] font-normal">— press Enter or click Add</span></label>
                                <div className="flex flex-wrap gap-1.5 mb-2 min-h-7">
                                    {draft.tags.map((tag, ti) => (
                                        <span key={ti} className="inline-flex items-center gap-1 bg-[#1e1c2e] border border-[#2a2840] text-[#AFA9EC] text-xs px-2.5 py-0.5 rounded-full">
                                            {tag}
                                            <button
                                                type="button"
                                                onClick={() => set("tags", draft.tags.filter((_, j) => j !== ti))}
                                                className="ml-0.5 hover:text-white transition-colors leading-none"
                                                aria-label="Remove tag"
                                            >×</button>
                                        </span>
                                    ))}
                                    {draft.tags.length === 0 && <span className="text-xs text-[#555370] italic">No tags yet</span>}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
                                        placeholder="e.g. React, REST API…"
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

                            <div>
                                <label className={labelClass}>Year</label>
                                <input
                                    value={draft.year}
                                    onChange={(e) => set("year", e.target.value)}
                                    placeholder="2026"
                                    className={inputClass}
                                    type="text"
                                />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <div>
                                <label className={labelClass}>Live link</label>
                                <input
                                    value={draft.link}
                                    onChange={(e) => set("link", e.target.value)}
                                    placeholder="https://your-project.com"
                                    className={inputClass}
                                    type="text"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>GitHub repo</label>
                                <input
                                    value={draft.github}
                                    onChange={(e) => set("github", e.target.value)}
                                    placeholder="https://github.com/you/repo"
                                    className={inputClass}
                                    type="text"
                                />
                            </div>
                            <div className="flex items-center justify-between rounded-xl border border-[#2a2840] px-4 py-3">
                                <div>
                                    <p className="text-sm text-[#f0eeff] font-medium">Featured</p>
                                    <p className="text-xs text-[#555370]">Highlight this project first on the public page</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => set("featured", !draft.featured)}
                                    aria-pressed={draft.featured}
                                    className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${draft.featured ? "bg-[#7c6dff]" : "bg-[#2a2840]"}`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${draft.featured ? "translate-x-5" : "translate-x-0.5"}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between rounded-xl border border-[#2a2840] px-4 py-3">
                                <div>
                                    <p className="text-sm text-[#f0eeff] font-medium">Published</p>
                                    <p className="text-xs text-[#555370]">Visible on the public site when on</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => set("published", !draft.published)}
                                    aria-pressed={draft.published}
                                    className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${draft.published ? "bg-emerald-500" : "bg-[#2a2840]"}`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${draft.published ? "translate-x-5" : "translate-x-0.5"}`} />
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <p className="text-xs text-[#555370]">Here&apos;s how this project will look. Go back to any step to make changes.</p>
                            <div className="bg-[#0a0a0f] border border-[#2a2840] rounded-2xl p-5">
                                <div className="flex items-start justify-between gap-2 mb-3">
                                    <span className="text-3xl leading-none">{draft.icon || "🚀"}</span>
                                    {draft.featured && <Icon d={ICON_PATHS.star} className="w-4 h-4 text-amber-400" />}
                                </div>
                                <h3 className="text-sm font-semibold text-[#f0eeff] leading-snug">{draft.title || "Untitled project"}</h3>
                                {draft.category && <p className="text-[10px] tracking-widest uppercase text-[#AFA9EC] font-medium mt-1">{draft.category}</p>}
                                {draft.description && <p className="text-xs text-[#555370] mt-2 leading-relaxed">{draft.description}</p>}
                                {draft.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-3">
                                        {draft.tags.map((tag, i) => (
                                            <span key={i} className="bg-[#1e1c2e] border border-[#2a2840] text-[#AFA9EC] text-[10px] px-2 py-0.5 rounded-full">{tag}</span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2a2840]">
                                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${STATUSES.find((s) => s.value === draft.status)!.text}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${STATUSES.find((s) => s.value === draft.status)!.dot}`} />
                                        {STATUSES.find((s) => s.value === draft.status)!.label}
                                    </span>
                                    <span className="text-[11px] text-[#555370]">{draft.year}</span>
                                </div>
                            </div>
                            {!draft.published && (
                                <p className="text-xs text-amber-400/80">This project will be hidden from the public site until Published is turned on.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[#2a2840] flex items-center justify-between gap-2 shrink-0 bg-[#13121c]">
                    <button
                        onClick={() => setStep((s) => Math.max(0, s - 1))}
                        disabled={step === 0}
                        className="flex items-center gap-1 text-xs px-4 py-2 rounded-lg border border-[#2a2840] text-[#888] hover:bg-[#1e1c2e] disabled:opacity-0 disabled:pointer-events-none transition-colors"
                    >
                        <Icon d={ICON_PATHS.chevronLeft} className="w-3.5 h-3.5" />
                        Back
                    </button>

                    {step < STEPS.length - 1 ? (
                        <button
                            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                            disabled={!canGoNext}
                            className="text-xs px-4 py-2 rounded-lg bg-[#7c6dff] text-white hover:bg-[#6a5de8] disabled:opacity-40 transition-colors"
                        >Next</button>
                    ) : (
                        <button
                            onClick={submit}
                            disabled={saving || !draft.title.trim()}
                            className="text-xs px-4 py-2 rounded-lg bg-[#7c6dff] text-white hover:bg-[#6a5de8] disabled:opacity-40 transition-colors"
                        >
                            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Project"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
