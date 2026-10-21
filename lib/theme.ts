/**
 * Accent themes shared by blog posts, project cards, and the onboarding
 * previews. Pure data (no Supabase import), so UI can use it freely.
 * See DESIGN_SYSTEM.md §2.3.
 */

export type PostTheme = "purple" | "green" | "pink"

export const themeMap: Record<PostTheme, {
    cardBg: string
    catColor: string
    iconBg: string
    tagStyle: string
    borderAccent: string
}> = {
    purple: {
        cardBg:      "bg-[#13121c] border border-[#2a2840]",
        catColor:    "text-[#AFA9EC]",
        iconBg:      "bg-[#1e1c2e]",
        tagStyle:    "border-[#534AB7] text-[#AFA9EC] bg-[#13111e]",
        borderAccent: "border-l-violet-500",
    },
    green: {
        cardBg:      "bg-[#0f1a14] border border-[#1a2e20]",
        catColor:    "text-[#97C459]",
        iconBg:      "bg-[#121f17]",
        tagStyle:    "border-[#3B6D11] text-[#97C459] bg-[#0f1a0a]",
        borderAccent: "border-l-emerald-500",
    },
    pink: {
        cardBg:      "bg-[#1a1216] border border-[#2e1f28]",
        catColor:    "text-[#ED93B1]",
        iconBg:      "bg-[#1a0f14]",
        tagStyle:    "border-[#993556] text-[#ED93B1] bg-[#1a0f14]",
        borderAccent: "border-l-pink-500",
    },
}
