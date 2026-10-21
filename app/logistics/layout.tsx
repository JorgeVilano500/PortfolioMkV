import type { Metadata } from "next"

// Admin page: keep it out of search results (next.config.ts also sends X-Robots-Tag).
export const metadata: Metadata = {
    title: "Logistics",
    robots: { index: false, follow: false },
}

export default function LogisticsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
