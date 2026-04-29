import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Work",
    description:
        "Portfolio of interactive games, full stack apps, and UI experiments built by Jorge Alejandro Vilanova — React, Next.js, TypeScript, and more.",
    openGraph: {
        title: "Work | JAVA.dev",
        description:
            "Portfolio of interactive games, full stack apps, and UI experiments by Jorge Alejandro Vilanova.",
        url: "/work",
        type: "website",
    },
    twitter: {
        title: "Work | JAVA.dev",
        description:
            "Portfolio of interactive games, full stack apps, and UI experiments by Jorge Alejandro Vilanova.",
    },
}

export default function WorkLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
