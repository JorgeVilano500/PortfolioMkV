import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "About",
    description:
        "Full stack developer from California with 4+ years of experience building aesthetically driven, high-performance web apps. Passionate about clean UI and interactive design.",
    openGraph: {
        title: "About | JAVA.dev",
        description:
            "Full stack developer from California with 4+ years building interactive, aesthetically driven web apps.",
        url: "/about",
    },
    twitter: {
        title: "About | JAVA.dev",
        description:
            "Full stack developer from California with 4+ years building interactive, aesthetically driven web apps.",
    },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
