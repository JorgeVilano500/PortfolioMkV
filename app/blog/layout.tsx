import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Blog",
    description:
        "Dev notes, project write-ups, and things I find interesting — by Jorge Alejandro Vilanova.",
    openGraph: {
        title: "Blog | JAVA.dev",
        description:
            "Dev notes, project write-ups, and things I find interesting.",
        url: "/blog",
        type: "website",
    },
    twitter: {
        title: "Blog | JAVA.dev",
        description:
            "Dev notes, project write-ups, and things I find interesting.",
    },
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
