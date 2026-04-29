import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Contact",
    description:
        "Get in touch with Jorge Alejandro Vilanova. Available for remote work, freelance projects, and collaboration opportunities.",
    openGraph: {
        title: "Contact | JAVA.dev",
        description:
            "Available for remote work, freelance projects, and collaboration. Reach out via email or social media.",
        url: "/contact",
    },
    twitter: {
        title: "Contact | JAVA.dev",
        description:
            "Available for remote work, freelance projects, and collaboration.",
    },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
