"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Icon, ICON_PATHS } from "./shared"
import { ProjectWizardModal } from "./ProjectWizardModal"

export type ProjectStatus = "live" | "wip" | "planned"
export type ProjectTheme = "purple" | "green" | "pink"

export type Project = {
    id: string
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
    created_at: string
}

type StatusFilter = "all" | ProjectStatus
type SortKey = "newest" | "oldest" | "featured" | "title-az" | "title-za"

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "newest",   label: "Date added (newest)" },
    { value: "oldest",   label: "Date added (oldest)" },
    { value: "featured", label: "Featured first" },
    { value: "title-az", label: "Title A–Z" },
    { value: "title-za", label: "Title Z–A" },
]

const STATUS_META: Record<ProjectStatus, { label: string; dot: string; text: string }> = {
    live:    { label: "Live",        dot: "bg-emerald-400", text: "text-emerald-400" },
    wip:     { label: "In Progress", dot: "bg-amber-400",   text: "text-amber-400" },
    planned: { label: "Planned",     dot: "bg-orange-400",  text: "text-orange-400" },
}

// ─── Dangerous delete button — deliberately reads as destructive ─────────────

function DangerDeleteButton({ onConfirm }: { onConfirm: () => void }) {
    const [confirming, setConfirming] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirming) {
            setConfirming(true)
            timer.current = setTimeout(() => setConfirming(false), 3000)
            return
        }
        if (timer.current) clearTimeout(timer.current)
        setConfirming(false)
        onConfirm()
    }

    return (
        <button
            onClick={handleClick}
            aria-label={confirming ? "Confirm delete" : "Delete project"}
            title={confirming ? "Click again to permanently delete" : "Delete project"}
            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                confirming
                    ? "bg-red-600 text-white animate-pulse"
                    : "text-red-500/70 hover:text-white hover:bg-red-600"
            }`}
        >
            <Icon d={confirming ? ICON_PATHS.warning : ICON_PATHS.trash} className="w-4 h-4" />
        </button>
    )
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function ProjectGridCard({
    project,
    authKey,
    onSaved,
    onDeleted,
    onEdit,
    selectMode,
    selected,
    onToggleSelect,
}: {
    project: Project
    authKey: string
    onSaved: (updated: Project) => void
    onDeleted: (id: string) => void
    onEdit: () => void
    selectMode: boolean
    selected: boolean
    onToggleSelect: (id: string) => void
}) {
    const togglePublished = async (e: React.MouseEvent) => {
        e.stopPropagation()
        const res = await fetch("/api/projects", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
            body: JSON.stringify({ id: project.id, published: !project.published }),
        })
        if (res.ok) onSaved(await res.json())
    }

    const deleteProject = async () => {
        const res = await fetch("/api/projects", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
            body: JSON.stringify({ id: project.id }),
        })
        if (res.ok) onDeleted(project.id)
    }

    const status = STATUS_META[project.status]

    return (
        <div
            onClick={() => selectMode && onToggleSelect(project.id)}
            role={selectMode ? "button" : undefined}
            tabIndex={selectMode ? 0 : undefined}
            onKeyDown={(e) => {
                if (selectMode && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault()
                    onToggleSelect(project.id)
                }
            }}
            className={`group bg-[#13121c] border rounded-2xl p-5 flex flex-col gap-3 transition-colors ${
                selected ? "border-[#7c6dff]" : "border-[#2a2840] hover:border-[#3d3a5c]"
            } ${selectMode ? "cursor-pointer" : ""}`}
        >
            {/* Top row: emoji + featured + checkbox/actions */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-3xl leading-none">{project.icon || "🚀"}</span>
                    {project.featured && (
                        <Icon d={ICON_PATHS.star} className="w-4 h-4 text-amber-400" />
                    )}
                </div>
                <div className="flex items-center gap-1">
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
                        <>
                            {/* Edit — distinct accent color, clearly interactive */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onEdit() }}
                                aria-label="Edit project"
                                title="Edit project"
                                className="p-1.5 rounded-lg cursor-pointer text-sky-400/80 hover:text-sky-300 hover:bg-sky-400/10 transition-colors"
                            >
                                <Icon d={ICON_PATHS.edit} className="w-4 h-4" />
                            </button>
                            {/* Delete — styled to read as destructive, requires a second click */}
                            <DangerDeleteButton onConfirm={deleteProject} />
                        </>
                    )}
                </div>
            </div>

            {/* Title + category + description */}
            <div className="min-w-0">
                {project.category && (
                    <p className="text-[10px] tracking-widest uppercase text-[#AFA9EC] font-medium mb-1">{project.category}</p>
                )}
                <h2 className="text-sm font-semibold text-[#f0eeff] leading-snug line-clamp-2">{project.title}</h2>
                {project.description && (
                    <p className="text-xs text-[#555370] mt-1.5 leading-relaxed line-clamp-2">{project.description}</p>
                )}
            </div>

            {/* Tags */}
            {(project.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {project.tags.slice(0, 3).map((tag, i) => (
                        <span key={i} className="bg-[#1e1c2e] border border-[#2a2840] text-[#AFA9EC] text-[10px] px-2 py-0.5 rounded-full">
                            {tag}
                        </span>
                    ))}
                    {project.tags.length > 3 && (
                        <span className="text-[10px] text-[#555370] px-1 py-0.5">+{project.tags.length - 3}</span>
                    )}
                </div>
            )}

            {/* Links */}
            {(project.link || project.github) && (
                <div className="flex items-center gap-3">
                    {project.link && (
                        <a
                            href={project.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-[11px] text-[#7c6dff] hover:text-[#6a5de8] transition-colors font-medium"
                        >
                            <Icon d={ICON_PATHS.external} className="w-3 h-3" />
                            Live
                        </a>
                    )}
                    {project.github && (
                        <a
                            href={project.github}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-[11px] text-[#555370] hover:text-[#c4c0d8] transition-colors font-medium"
                        >
                            <Icon d={ICON_PATHS.external} className="w-3 h-3" />
                            GitHub
                        </a>
                    )}
                </div>
            )}

            {/* Footer: status + year + published */}
            <div className="mt-auto pt-3 border-t border-[#2a2840] flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${status.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${project.status === "live" ? "animate-pulse" : ""}`} />
                    {status.label}
                    {project.year && <span className="text-[#555370] font-normal">· {project.year}</span>}
                </span>
                <button
                    onClick={togglePublished}
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 transition-colors ${
                        project.published
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-[#1e1c2e] border-[#2a2840] text-[#555370] hover:bg-[#2a2840]"
                    }`}
                >
                    <span className={`w-1 h-1 rounded-full ${project.published ? "bg-emerald-400" : "bg-[#555370]"}`} />
                    {project.published ? "Public" : "Hidden"}
                </button>
            </div>
        </div>
    )
}

// ─── Projects panel ───────────────────────────────────────────────────────────

export function ProjectsPanel({ authKey }: { authKey: string }) {
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoad]      = useState(true)
    const [error, setError]       = useState<string | null>(null)

    // Toolbar state
    const [search, setSearch]       = useState("")
    const [status, setStatus]       = useState<StatusFilter>("all")
    const [tagFilter, setTagFilter] = useState<string>("all")
    const [sort, setSort]           = useState<SortKey>("newest")

    // Bulk selection
    const [selectMode, setSelectMode] = useState(false)
    const [selected, setSelected]     = useState<Set<string>>(new Set())
    const [bulkBusy, setBulkBusy]     = useState(false)
    const [bulkError, setBulkError]   = useState<string | null>(null)

    // Add/edit wizard modal — null id + open=true means "create"
    const [wizard, setWizard] = useState<{ id: string | null } | null>(null)

    useEffect(() => {
        fetch("/api/projects", { headers: { "x-logistics-key": authKey } })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((data: Project[]) => { setProjects(data); setLoad(false) })
            .catch(() => { setError("Failed to load projects."); setLoad(false) })
    }, [authKey])

    const handleSaved = (saved: Project) =>
        setProjects((p) => (p.some((x) => x.id === saved.id) ? p.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...p]))
    const handleDeleted = (id: string) => {
        setProjects((p) => p.filter((x) => x.id !== id))
        setSelected((s) => { const next = new Set(s); next.delete(id); return next })
    }

    const allTags = useMemo(
        () => Array.from(new Set(projects.flatMap((p) => p.tags ?? []))).sort((a, b) => a.localeCompare(b)),
        [projects]
    )

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase()
        const filtered = projects.filter((p) => {
            if (status !== "all" && p.status !== status) return false
            if (tagFilter !== "all" && !(p.tags ?? []).includes(tagFilter)) return false
            if (q) {
                const haystack = [p.title, p.description, p.category, ...(p.tags ?? [])].join(" ").toLowerCase()
                if (!haystack.includes(q)) return false
            }
            return true
        })
        const byNewest = (a: Project, b: Project) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        switch (sort) {
            case "oldest":   return filtered.sort((a, b) => byNewest(b, a))
            case "featured": return filtered.sort((a, b) => Number(b.featured) - Number(a.featured) || byNewest(a, b))
            case "title-az": return filtered.sort((a, b) => a.title.localeCompare(b.title))
            case "title-za": return filtered.sort((a, b) => b.title.localeCompare(a.title))
            default:         return filtered.sort(byNewest)
        }
    }, [projects, search, status, tagFilter, sort])

    const hasActiveFilters = search.trim() !== "" || status !== "all" || tagFilter !== "all"
    const clearFilters = () => { setSearch(""); setStatus("all"); setTagFilter("all") }

    const liveCount     = projects.filter((p) => p.status === "live").length
    const featuredCount = projects.filter((p) => p.featured).length
    const wizardProject = wizard?.id ? projects.find((p) => p.id === wizard.id) ?? null : null

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
        if (!confirm(`Delete ${ids.length} project${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return
        setBulkBusy(true)
        setBulkError(null)
        try {
            const res = await fetch("/api/projects", {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
                body: JSON.stringify({ ids }),
            })
            if (!res.ok) { setBulkError((await res.json()).error ?? "Delete failed"); return }
            setProjects((p) => p.filter((x) => !selected.has(x.id)))
            exitSelectMode()
        } catch {
            setBulkError("Network error")
        } finally {
            setBulkBusy(false)
        }
    }

    const bulkSetPublished = async (published: boolean) => {
        const targets = projects.filter((p) => selected.has(p.id) && p.published !== published)
        if (targets.length === 0) return
        setBulkBusy(true)
        setBulkError(null)
        try {
            const results = await Promise.all(
                targets.map((p) =>
                    fetch("/api/projects", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
                        body: JSON.stringify({ id: p.id, published }),
                    }).then((r) => (r.ok ? r.json() as Promise<Project> : null)).catch(() => null)
                )
            )
            const updated = new Map(results.filter((r): r is Project => r !== null).map((r) => [r.id, r]))
            setProjects((p) => p.map((x) => updated.get(x.id) ?? x))
            if (updated.size < targets.length) setBulkError("Some projects failed to update.")
        } finally {
            setBulkBusy(false)
        }
    }

    return (
        <div className="max-w-5xl space-y-4">

            {/* Stats */}
            {!loading && !error && projects.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: "Projects", value: projects.length },
                        { label: "Live",     value: liveCount },
                        { label: "Featured", value: featuredCount },
                        { label: "Hidden",   value: projects.filter((p) => !p.published).length },
                    ].map((s) => (
                        <div key={s.label} className="bg-[#13121c] border border-[#2a2840] rounded-2xl px-4 py-3">
                            <p className="text-xl font-syne font-bold text-[#f0eeff]">{s.value}</p>
                            <p className="text-[11px] tracking-widest uppercase text-[#555370] mt-0.5">{s.label}</p>
                        </div>
                    ))}
                </div>
            )}

            <button
                onClick={() => setWizard({ id: null })}
                className="flex items-center gap-2 text-sm text-[#7c6dff] hover:text-[#6a5de8] transition-colors font-medium"
            >
                <Icon d={ICON_PATHS.plus} />
                New Project
            </button>

            {/* Toolbar */}
            {!loading && !error && projects.length > 0 && (
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Icon d={ICON_PATHS.search} className="w-4 h-4 text-[#555370] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search title, description, category, or tags…"
                                className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl pl-9 pr-3 py-2 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
                                type="text"
                            />
                        </div>

                        {/* Sort */}
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as SortKey)}
                            aria-label="Sort projects"
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
                            {([["all", "All"], ["live", "Live"], ["wip", "In Progress"], ["planned", "Planned"]] as const).map(([value, label]) => (
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
                            {visible.length} of {projects.length} project{projects.length === 1 ? "" : "s"}
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
                                className="text-xs px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
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
                        <div key={i} className="bg-[#13121c] border border-[#2a2840] rounded-2xl h-52" />
                    ))}
                </div>
            )}

            {!loading && !error && projects.length === 0 && (
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-12 text-center">
                    <p className="text-[#555370] text-sm">No projects yet. Create your first one above.</p>
                </div>
            )}

            {!loading && !error && projects.length > 0 && visible.length === 0 && (
                <div className="bg-[#13121c] border border-[#2a2840] rounded-2xl p-12 text-center">
                    <p className="text-[#555370] text-sm mb-3">No projects match your filters.</p>
                    <button
                        onClick={clearFilters}
                        className="text-xs text-[#7c6dff] hover:text-[#6a5de8] transition-colors font-medium"
                    >Clear filters</button>
                </div>
            )}

            {!loading && visible.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visible.map((project) => (
                        <ProjectGridCard
                            key={project.id}
                            project={project}
                            authKey={authKey}
                            onSaved={handleSaved}
                            onDeleted={handleDeleted}
                            onEdit={() => setWizard({ id: project.id })}
                            selectMode={selectMode}
                            selected={selected.has(project.id)}
                            onToggleSelect={toggleSelect}
                        />
                    ))}
                </div>
            )}

            {wizard && (
                <ProjectWizardModal
                    key={wizard.id ?? "new"}
                    project={wizardProject}
                    authKey={authKey}
                    onSaved={handleSaved}
                    onClose={() => setWizard(null)}
                />
            )}
        </div>
    )
}
