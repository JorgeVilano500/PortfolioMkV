import { supabase } from "./supabase"

export type ProjectStatus = "live" | "wip" | "planned"
export type ProjectTheme = "purple" | "green" | "pink"

export type PublicProject = {
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
    created_at: string
}

export const projectThemeMap: Record<ProjectTheme, {
    catColor: string
    iconBg: string
    tagStyle: string
}> = {
    purple: {
        catColor: "text-[#AFA9EC]",
        iconBg:   "bg-[#1e1c2e]",
        tagStyle: "border-[#534AB7] text-[#AFA9EC] bg-[#13111e]",
    },
    green: {
        catColor: "text-[#97C459]",
        iconBg:   "bg-[#121f17]",
        tagStyle: "border-[#3B6D11] text-[#97C459] bg-[#0f1a0a]",
    },
    pink: {
        catColor: "text-[#ED93B1]",
        iconBg:   "bg-[#1a0f14]",
        tagStyle: "border-[#993556] text-[#ED93B1] bg-[#1a0f14]",
    },
}

/** Published projects only — relies on the "Public read published projects" RLS policy. */
export async function getPublicProjects(): Promise<PublicProject[]> {
    const { data, error } = await supabase
        .from("projects")
        .select("id, title, description, icon, category, status, theme, tags, year, link, github, featured, created_at")
        .eq("published", true)
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false })

    if (error) throw error
    return (data ?? []) as PublicProject[]
}
