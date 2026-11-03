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

const STATUSES: readonly ProjectStatus[] = ["live", "wip", "planned"]
const THEMES: readonly ProjectTheme[]    = ["purple", "green", "pink"]

const text = (v: unknown) => (typeof v === "string" ? v : "")
const httpUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\/\S+$/i.test(v) ? v : "")

/**
 * Coerce a row into the shape the UI relies on. Studio's API validates every
 * write, but a row edited by hand in the Supabase dashboard could hold a
 * status like "Live" or null tags, and a single such row used to crash Home
 * (ProjectList indexes its lookup tables by these values). Links that aren't
 * http(s) are dropped rather than rendered.
 */
export function normalizeProject(row: Record<string, unknown>): PublicProject {
    return {
        id:          text(row.id),
        title:       text(row.title),
        description: text(row.description),
        icon:        text(row.icon),
        category:    text(row.category),
        status:      STATUSES.includes(row.status as ProjectStatus) ? (row.status as ProjectStatus) : "planned",
        theme:       THEMES.includes(row.theme as ProjectTheme) ? (row.theme as ProjectTheme) : "purple",
        tags:        Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
        year:        text(row.year),
        link:        httpUrl(row.link),
        github:      httpUrl(row.github),
        featured:    row.featured === true,
        created_at:  text(row.created_at),
    }
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
    return ((data ?? []) as Record<string, unknown>[]).map(normalizeProject)
}
