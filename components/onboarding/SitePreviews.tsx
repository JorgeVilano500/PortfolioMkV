"use client"

/**
 * Live, non-interactive miniatures of the real site, used by the intro guide.
 * Built from the same components, data, and theme tokens as the pages (the
 * navigation preview IS the real <Navbar/>), so they stay accurate when the
 * design changes — unlike screenshots, which go stale.
 */

import { Navbar } from "@/components/ui/Navbar"
import { projects } from "@/lib/projects"
import { themeMap } from "@/lib/theme"
import { FaGithub, FaLinkedin } from "react-icons/fa6"
import { MdContentCopy, MdEmail } from "react-icons/md"

// ─── Frame ────────────────────────────────────────────────────────────────────

export function PreviewFrame({ path, children }: { path: string; children: React.ReactNode }) {
    return (
        <figure className="rounded-xl border border-[#2a2840] bg-[#0a0a0f] overflow-hidden" aria-label={`Preview of ${path}`}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e1c2e] bg-[#0d0c14]" aria-hidden="true">
                <span className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#2a2840]" />
                    <span className="w-2 h-2 rounded-full bg-[#2a2840]" />
                    <span className="w-2 h-2 rounded-full bg-[#2a2840]" />
                </span>
                <span className="flex-1 text-center text-[10px] font-mono text-[#555370] truncate">javastudios.netlify.app{path}</span>
                <span className="text-[9px] uppercase tracking-widest text-[#7c6dff] font-medium">Live preview</span>
            </div>
            {/* inert: previews are pictures, not controls — keep them out of tab order */}
            <div className="p-3 pointer-events-none select-none" inert>
                {children}
            </div>
        </figure>
    )
}

// ─── Navigation (the real Navbar, scaled down) ───────────────────────────────

export function NavPreview() {
    return (
        <div className="overflow-hidden rounded-lg border border-[#1e1c2e] h-[72px]">
            <div className="origin-top-left scale-[0.6] w-[166.7%]">
                <Navbar currentLink="/" />
            </div>
        </div>
    )
}

// ─── Home ─────────────────────────────────────────────────────────────────────

export function HomePreview() {
    const tiles = projects.slice(0, 6)
    return (
        <div className="grid grid-cols-6 gap-2">
            <div className="col-span-4 bg-[#13121c] border border-[#2a2840] rounded-xl p-3 flex flex-col justify-end min-h-[92px]">
                <p className="text-[8px] tracking-widest uppercase text-violet-400 mb-1">Full Stack Developer</p>
                <p className="font-extrabold text-sm text-white leading-tight">Building things</p>
                <p className="text-[9px] text-gray-500 mt-1">Interactive apps, clean code, and interfaces worth remembering</p>
            </div>
            <div className="col-span-2 bg-[#7c6dff] rounded-xl p-3 flex flex-col justify-between">
                <p className="text-[8px] text-white/70">Currently focused on</p>
                <span className="self-start bg-white text-[#7c6dff] text-[8px] font-medium px-2 py-1 rounded-full">View Resume →</span>
            </div>
            <div className="col-span-6 bg-[#0f1a14] border border-[#1a2e20] rounded-xl p-2 grid grid-cols-6 gap-1.5">
                {tiles.map((p) => (
                    <div key={p.id} className="aspect-square rounded-lg border border-[#1e3024] bg-[#121f17] flex flex-col items-center justify-center">
                        <span className="text-sm leading-none">{p.icon}</span>
                        <span className="text-[6px] text-emerald-600 truncate w-full text-center px-0.5 mt-0.5">{p.title}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Work ─────────────────────────────────────────────────────────────────────

export function WorkPreview() {
    const featured = projects.find((p) => p.featured) ?? projects[0]
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
                {["All", "Games", "API's", "UI/UX", "Full Stack"].map((f, i) => (
                    <span
                        key={f}
                        className={`text-[8px] px-2 py-1 rounded-full border ${i === 0 ? "bg-[#7c6dff] text-white border-[#7c6dff]" : "border-[#2a2840] text-[#888]"}`}
                    >{f}</span>
                ))}
            </div>
            <div className={`${featured.cardBg} rounded-xl p-3`}>
                <div className={`${featured.iconBg} w-8 h-8 rounded-lg flex items-center justify-center text-base mb-2`}>{featured.icon}</div>
                <p className={`text-[7px] tracking-widest uppercase font-medium ${featured.catColor}`}>{featured.cat}</p>
                <p className="font-bold text-xs text-[#f0eeff] mb-1">{featured.title}</p>
                <div className="flex flex-wrap gap-1 mb-2">
                    {featured.tags.slice(0, 3).map((t) => (
                        <span key={t} className={`text-[7px] px-1.5 py-0.5 rounded-full border ${featured.tagStyle}`}>{t}</span>
                    ))}
                </div>
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[8px] text-emerald-400">
                        <span className="w-1 h-1 rounded-full bg-emerald-400" /> Live
                    </span>
                    <span className="text-[8px] text-[#7c6dff]">View Project →</span>
                </div>
            </div>
        </div>
    )
}

// ─── About ────────────────────────────────────────────────────────────────────

export function AboutPreview() {
    const items = [
        { year: "2025", title: "Building Portfolio Apps" },
        { year: "2024", title: "Learning and Growing" },
        { year: "2023", title: "Graduated & pursuing software" },
    ]
    return (
        <div className="bg-[#13121c] border border-[#2a2840] rounded-xl p-3">
            <p className="text-[8px] tracking-widest uppercase text-[#555370] mb-2">Journey</p>
            {items.map((item, i) => (
                <div key={item.year} className="flex gap-2">
                    <div className="flex flex-col items-center">
                        <span className="text-[7px] text-[#7c6dff]">{item.year}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7c6dff]" />
                        {i < items.length - 1 && <span className="w-px flex-1 bg-[#2a2840] my-0.5 min-h-[10px]" />}
                    </div>
                    <p className="text-[9px] text-[#e8e6f0] pt-2 pb-1">{item.title}</p>
                </div>
            ))}
        </div>
    )
}

// ─── Blog ─────────────────────────────────────────────────────────────────────

export function BlogPreview() {
    const cards = [
        { theme: themeMap.purple, emoji: "🚀", title: "Shipping a Supabase-backed blog", tag: "Next.js" },
        { theme: themeMap.green,  emoji: "🔐", title: "Hardening a portfolio site",      tag: "Security" },
    ]
    return (
        <div className="grid grid-cols-2 gap-2">
            {cards.map((c) => (
                <div key={c.title} className={`${c.theme.cardBg} rounded-xl p-3`}>
                    <div className={`${c.theme.iconBg} w-7 h-7 rounded-lg flex items-center justify-center text-sm mb-2`}>{c.emoji}</div>
                    <p className="font-bold text-[10px] text-[#f0eeff] leading-snug mb-1.5">{c.title}</p>
                    <div className="flex items-center justify-between">
                        <span className={`text-[7px] px-1.5 py-0.5 rounded-full border ${c.theme.tagStyle}`}>{c.tag}</span>
                        <span className={`text-[8px] ${c.theme.catColor}`}>Read →</span>
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Contact ──────────────────────────────────────────────────────────────────

export function ContactPreview() {
    return (
        <div className="grid grid-cols-5 gap-2">
            <div className="col-span-3 bg-[#1a1216] border border-[#2e1f28] rounded-xl p-3">
                <p className="flex items-center gap-1 text-[8px] tracking-widest uppercase text-gray-600 mb-2">
                    <MdEmail className="text-pink-400" /> Direct email
                </p>
                <span className="inline-flex items-center gap-1 bg-[#2e1f28] text-pink-200 text-[8px] px-2 py-1 rounded-full border border-[#3e2535]">
                    <MdContentCopy /> Copy Email
                </span>
            </div>
            <div className="col-span-2 bg-[#13121c] border border-[#2a2840] rounded-xl p-3 flex flex-col gap-1.5">
                <span className="flex items-center gap-1 text-[8px] text-gray-300"><FaGithub /> GitHub</span>
                <span className="flex items-center gap-1 text-[8px] text-blue-400"><FaLinkedin /> LinkedIn</span>
            </div>
        </div>
    )
}

// ─── Tour (what the guide bar looks like) ────────────────────────────────────

export function TourPreview() {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-[#1e1c2e] px-3 py-2">
                <span className="text-[10px] font-bold text-[#888]">JAVA.dev</span>
                <span className="flex gap-3 text-[9px] text-[#888]">
                    <span className="text-[#7c6dff]">Home</span>
                    <span className="relative rounded px-1 ring-2 ring-[#7c6dff] text-white bg-[#7c6dff]/15">
                        Work
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[6px] uppercase tracking-widest bg-[#7c6dff] text-white px-1 rounded-full">Next</span>
                    </span>
                    <span>About</span><span>Blog</span><span>Contact</span>
                </span>
            </div>
            <div className="rounded-lg border border-[#7c6dff]/40 bg-[#13121c] p-2.5">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[7px] tracking-widest uppercase text-[#7c6dff]">Guided tour · Step 3 of 10</span>
                    <span className="text-[8px] text-[#555370]">✕ Exit</span>
                </div>
                <p className="text-[10px] font-bold text-[#f0eeff]">Projects at a glance</p>
                <p className="text-[8px] text-[#8a88a0] mb-2">Next stop: Work — click the highlighted tab.</p>
                <div className="h-1 rounded-full bg-[#1e1c2e] overflow-hidden"><div className="h-full w-[30%] bg-[#7c6dff]" /></div>
            </div>
        </div>
    )
}
