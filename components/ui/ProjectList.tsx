import { projects, type Project, type ProjectStatus } from "@/lib/projects"

const statusConfig: Record<ProjectStatus, { dot: string; label: string; text: string }> = {
    live:    { dot: "bg-emerald-400 animate-pulse", label: "Live",        text: "text-emerald-400" },
    wip:     { dot: "bg-amber-400",                 label: "In Progress", text: "text-amber-400"   },
    planned: { dot: "bg-pink-400",                  label: "Planned",     text: "text-pink-400"    },
}

type Props = {
    limit?: number
    filterBy?: string
}

export function ProjectList({ limit, filterBy }: Props) {
    const displayed: Project[] = projects
        .filter((p) => (filterBy ? p.filters.includes(filterBy) : true))
        .slice(0, limit)

    return (
        <div className="flex flex-col divide-y divide-[#1e1c2e]">
            {displayed.map((p) => {
                const s = statusConfig[p.status]
                return (
                    <div
                        key={p.id}
                        className="flex items-start gap-4 py-4 group hover:bg-[#13121c] px-3 rounded-xl transition-colors duration-200"
                    >
                        {/* Icon */}
                        <div className={`${p.iconBg} w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 mt-0.5`}>
                            {p.icon}
                        </div>

                        {/* Body */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <p className="text-sm font-semibold text-[#f0eeff] leading-snug">
                                    {p.title}
                                </p>
                                <span className={`text-[10px] tracking-widest uppercase font-medium ${p.catColor}`}>
                                    {p.cat}
                                </span>
                            </div>

                            <p className="text-xs text-[#6b6880] leading-relaxed mb-2 line-clamp-2">
                                {p.desc}
                            </p>

                            <div className="flex flex-wrap gap-1.5">
                                {p.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${p.tagStyle}`}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Right column */}
                        <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-2">
                            <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                <span className={`text-[10px] font-medium ${s.text}`}>{s.label}</span>
                            </div>

                            {p.year && (
                                <span className="text-[10px] text-[#555370]">{p.year}</span>
                            )}

                            {p.link ? (
                                <a
                                    href={p.link}
                                    target="_blank"
                                    className={`text-[10px] font-medium ${p.catColor} opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:underline`}
                                >
                                    View →
                                </a>
                            ) : (
                                <span className="text-[10px] text-[#3a3850]">No link yet</span>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
