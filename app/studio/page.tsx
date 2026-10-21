"use client"

import { useState } from "react"
import { Navbar } from "@/components"
import { AdminGate, SignOutButton } from "@/components/features/AdminGate"
import { BlogsPanel } from "./BlogsPanel"
import { ProjectsPanel } from "./ProjectsPanel"

type Tab = "blogs" | "projects"

const TABS: { value: Tab; label: string }[] = [
    { value: "blogs",    label: "Blogs" },
    { value: "projects", label: "Projects" },
]

function Hub() {
    const [tab, setTab] = useState<Tab>("blogs")

    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="studio" />

            <section className="px-2 mb-6">
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Internal</p>
                <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight mb-2">
                    Studio
                </h1>
                <p className="text-sm text-[#555370] max-w-sm leading-relaxed">
                    Manage blogs, projects, and anything else that lives on the site. Changes save directly to Supabase.
                </p>
            </section>

            <div className="px-2 mb-6 flex items-center justify-between gap-3">
                <div className="flex gap-1 bg-[#13121c] p-1 rounded-xl border border-[#2a2840] w-fit">
                    {TABS.map((t) => (
                        <button
                            key={t.value}
                            onClick={() => setTab(t.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                tab === t.value ? "bg-[#7c6dff] text-white" : "text-[#555370] hover:text-[#c4c0d8]"
                            }`}
                        >{t.label}</button>
                    ))}
                </div>
                <SignOutButton />
            </div>

            {tab === "blogs" ? <BlogsPanel /> : <ProjectsPanel />}
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
    return (
        <AdminGate title="Studio" description="Enter the access password to manage your content.">
            <Hub />
        </AdminGate>
    )
}
