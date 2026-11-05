import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components"
import { LAPTOP_MODEL } from "@/lib/laptop-stickers"
import { getPublicSlots } from "@/lib/sponsor-spots-server"
import { LaptopExperience } from "./LaptopExperience"

// The spots come from the sponsor_spots table (Studio → Sponsorships). Studio
// refreshes this page on every save (revalidatePath); this is the fallback.
export const revalidate = 300

const DESCRIPTION =
    `A Three.js ${LAPTOP_MODEL.label} with sponsor-sticker spots on the lid and the palm rest. Rotate it, open it up, and see who's on it.`

export const metadata: Metadata = {
    title: "Laptop stickers",
    description: DESCRIPTION,
    alternates: { canonical: "/laptop" },
    openGraph: {
        title: "Laptop stickers | JAVA.dev",
        description: DESCRIPTION,
        url: "/laptop",
        type: "website",
    },
    twitter: {
        title: "Laptop stickers | JAVA.dev",
        description: DESCRIPTION,
    },
}

// A Server Component: the shell and the spot data render on the server, and
// only LaptopExperience (the client boundary) ships JavaScript to the browser.
export default async function LaptopPage() {
    const slots = await getPublicSlots()
    return (
        <div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
            <Navbar currentLink="Work" />
            <section className="px-2 mb-8">
                <Link
                    href="/work"
                    className="inline-block text-xs text-[#7c6dff] hover:text-[#6a5de8] font-medium mb-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
                >
                    ← Back to work
                </Link>
                <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">3D experiment</p>
                <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight mb-2">Sticker the laptop</h1>
                <p className="text-sm text-[#8a88a0] max-w-md leading-relaxed">
                    A {LAPTOP_MODEL.label}, rebuilt in Three.js, with four sponsor-sticker spots on the lid and
                    two more beside the trackpad. Open it up to see the screen and the backlit keyboard.
                    The stickers shown are samples.
                </p>
            </section>
            <LaptopExperience slots={slots} />
        </div>
    )
}
