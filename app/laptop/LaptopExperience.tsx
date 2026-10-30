"use client"

import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
    LAPTOP_MODEL,
    SPONSOR_CTA_HREF,
    STICKER_SLOTS,
    describeSlot,
    getSlot,
    nextSlotId,
    type SampleSponsor,
    type StickerSlot,
    type StickerSlotId,
} from "@/lib/laptop-stickers"
import { themeMap } from "@/lib/theme"
import type { ViewerStatus } from "./LaptopViewer"

// Three.js touches `window` and WebGL, so the viewer never renders on the
// server. `ssr: false` is only allowed inside a Client Component, which is why
// this file is the client boundary and app/laptop/page.tsx stays a Server
// Component. The viewer and Three.js also load as their own chunk.
const LaptopViewer = dynamic(() => import("./LaptopViewer").then((mod) => mod.LaptopViewer), {
    ssr: false,
    loading: () => null, // the skeleton below covers both the chunk and the model download
})

// ─── Reduced motion ───────────────────────────────────────────────────────────

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(onChange: () => void) {
    const query = window.matchMedia?.(REDUCED_MOTION)
    query?.addEventListener("change", onChange)
    return () => query?.removeEventListener("change", onChange)
}

function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(
        subscribeReducedMotion,
        () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
        () => false,
    )
}

// ─── Fallback copy ────────────────────────────────────────────────────────────

const FALLBACK: Record<Exclude<ViewerStatus, "loading" | "ready">, { title: string; body: string; retry: boolean }> = {
    missing: {
        title: "3D model coming soon",
        body:  `The ${LAPTOP_MODEL.label} model hasn't been uploaded yet. The four sponsor spots work the same below.`,
        retry: false,
    },
    invalid: {
        title: "3D model needs an update",
        body:  "The model file is missing the parts this page expects, so the 2D layout is shown instead.",
        retry: false,
    },
    unsupported: {
        title: "3D isn't available in this browser",
        body:  "WebGL is turned off or not supported here, so the 2D layout is shown instead.",
        retry: false,
    },
    error: {
        title: "The 3D view didn't load",
        body:  "Something went wrong while loading the model. You can try again, or use the 2D layout.",
        retry: true,
    },
}

// ─── Experience ───────────────────────────────────────────────────────────────

export function LaptopExperience() {
    const [selectedId, setSelectedId] = useState<StickerSlotId | null>(null)
    const [status, setStatus]         = useState<ViewerStatus>("loading")
    const [attempt, setAttempt]       = useState(0)
    const [resetToken, setResetToken] = useState(0)
    const reducedMotion = usePrefersReducedMotion()
    const optionRefs    = useRef(new Map<StickerSlotId, HTMLButtonElement>())

    const selected = selectedId ? getSlot(selectedId) : null
    const fallback = status === "loading" || status === "ready" ? null : FALLBACK[status]

    const retry = () => {
        setStatus("loading")
        setAttempt((n) => n + 1) // a new key remounts the viewer from scratch
    }

    // WAI-ARIA radio group: arrows move focus and selection together.
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const next = nextSlotId(selectedId, event.key)
        if (!next) return
        event.preventDefault()
        setSelectedId(next)
        optionRefs.current.get(next)?.focus()
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            {/* 3D view (or the 2D fallback) */}
            <section
                aria-label="Laptop preview"
                className="col-span-1 md:col-span-2 xl:col-span-8 bg-[#13121c] border border-[#2a2840] rounded-2xl p-3 sm:p-4 flex flex-col"
            >
                <div
                    role="img"
                    aria-label={`3D model of a ${LAPTOP_MODEL.label} with four sticker spots on the lid.${selected ? ` Selected: ${describeSlot(selected)}.` : ""}`}
                    className="relative h-80 sm:h-105 xl:h-130 rounded-xl overflow-hidden bg-[#0a0a0f]"
                >
                    {!fallback && (
                        <LaptopViewer
                            key={attempt}
                            selectedId={selectedId}
                            resetToken={resetToken}
                            reducedMotion={reducedMotion}
                            onSelect={setSelectedId}
                            onStatus={setStatus}
                        />
                    )}
                    {status === "loading" && <ViewerSkeleton />}
                    {fallback && <LidDiagram selectedId={selectedId} />}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-xl"
                        style={{ background: "radial-gradient(circle at 50% 0%, rgba(124,109,255,.12) 0%, transparent 60%)" }}
                    />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 px-1">
                    <p role="status" className="text-xs text-[#8a88a0]">
                        {status === "loading" && "Loading the 3D laptop…"}
                        {status === "ready" && "Drag to rotate, scroll or pinch to zoom, and click a sticker to see its sponsor."}
                        {fallback && <><span className="text-[#c4c0d8] font-medium">{fallback.title}.</span> {fallback.body}</>}
                    </p>
                    <div className="flex gap-2">
                        {status === "ready" && (
                            <button
                                type="button"
                                onClick={() => setResetToken((n) => n + 1)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2840] text-[#c4c0d8] hover:bg-[#1e1c2e] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
                            >
                                Reset view
                            </button>
                        )}
                        {fallback?.retry && (
                            <button
                                type="button"
                                onClick={retry}
                                className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2840] text-[#c4c0d8] hover:bg-[#1e1c2e] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
                            >
                                Try again
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* Spot picker + details */}
            <section aria-labelledby="spots-heading" className="col-span-1 md:col-span-2 xl:col-span-4 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 flex flex-col gap-5">
                <div>
                    <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-1">On the lid</p>
                    <h2 id="spots-heading" className="font-syne font-bold text-xl text-[#f0eeff]">Four sponsor spots</h2>
                </div>

                <div role="radiogroup" aria-labelledby="spots-heading" className="grid grid-cols-2 gap-2">
                    {STICKER_SLOTS.map((slot, index) => {
                        const checked   = slot.id === selectedId
                        const focusable = checked || (selectedId === null && index === 0)
                        return (
                            <button
                                key={slot.id}
                                ref={(el) => {
                                    if (el) optionRefs.current.set(slot.id, el)
                                    else optionRefs.current.delete(slot.id)
                                }}
                                type="button"
                                role="radio"
                                aria-checked={checked}
                                tabIndex={focusable ? 0 : -1}
                                onClick={() => setSelectedId(slot.id)}
                                onKeyDown={handleKeyDown}
                                className={`text-left rounded-xl border px-3 py-2.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 ${checked ? "bg-[#7c6dff] border-[#7c6dff] text-white" : "bg-[#0a0a0f] border-[#2a2840] text-[#c4c0d8] hover:border-[#7c6dff]"}`}
                            >
                                <span className={`block text-[10px] tracking-widest uppercase font-medium ${checked ? "text-white/70" : "text-[#8a88a0]"}`}>
                                    {slot.position}
                                </span>
                                <span className="block text-sm font-medium truncate">
                                    {slot.sponsor ? slot.sponsor.name : "Open spot"}
                                </span>
                            </button>
                        )
                    })}
                </div>

                <SlotDetails slot={selected} />

                <p className="text-xs text-[#8a88a0] leading-relaxed">
                    Sample stickers for illustration, not real sponsors. Spots are arranged by email; nothing is sold or paid for on this site.
                </p>
            </section>
        </div>
    )
}

// ─── Details card ─────────────────────────────────────────────────────────────

function SlotDetails({ slot }: { slot: StickerSlot | null }) {
    return (
        <div aria-live="polite" className="bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4 flex flex-col gap-3 min-h-50">
            {!slot && (
                <>
                    <p className="text-sm text-[#c4c0d8] font-medium">Pick a spot</p>
                    <p className="text-sm text-[#8a88a0] leading-relaxed">
                        Choose a sticker on the laptop or in the list to see who&apos;s there, and whether the spot is open.
                    </p>
                </>
            )}
            {slot?.sponsor && <SponsorDetails position={slot.position} sponsor={slot.sponsor} />}
            {slot && !slot.sponsor && (
                <>
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] tracking-widest uppercase font-medium text-[#AFA9EC]">{slot.position} spot</p>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                            <span className="text-xs text-emerald-400 font-medium">Available</span>
                        </div>
                    </div>
                    <h3 className="font-syne font-bold text-lg text-[#f0eeff] leading-snug">This spot is open</h3>
                    <p className="text-sm text-[#8a88a0] leading-relaxed">
                        Your logo could sit here. Get in touch to talk about putting your sticker on the lid.
                    </p>
                </>
            )}
            <Link
                href={SPONSOR_CTA_HREF}
                className="mt-auto inline-flex w-fit bg-[#7c6dff] hover:bg-[#6a5de8] text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0c14]"
            >
                Sponsor a spot →
            </Link>
        </div>
    )
}

function SponsorDetails({ position, sponsor }: { position: string; sponsor: SampleSponsor }) {
    const theme = themeMap[sponsor.theme]
    return (
        <>
            <div className="flex items-center justify-between gap-2">
                <p className={`text-[10px] tracking-widest uppercase font-medium ${theme.catColor}`}>{position} spot</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium border-[#3a3850] text-[#c4c0d8]">Sample sponsor</span>
            </div>
            <h3 className="font-syne font-bold text-lg text-[#f0eeff] leading-snug">{sponsor.name}</h3>
            <p className={`text-sm font-medium ${theme.catColor}`}>{sponsor.tagline}</p>
            <p className="text-sm text-[#8a88a0] leading-relaxed">{sponsor.description}</p>
        </>
    )
}

// ─── Loading and fallback visuals ─────────────────────────────────────────────

function ViewerSkeleton() {
    return (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <div className="w-[62%] max-w-105 aspect-[30.41/21.24] rounded-2xl bg-[#1e1c2e] motion-safe:animate-pulse" />
        </div>
    )
}

/** A flat drawing of the lid (seen from outside, hinge at the bottom) that mirrors the selection. */
function LidDiagram({ selectedId }: { selectedId: StickerSlotId | null }) {
    return (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center p-6">
            <div className="relative w-full max-w-115 aspect-[30.41/21.24] rounded-2xl bg-linear-to-b from-[#3a3850] to-[#2a2840] border border-[#555370]/40">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-9 rounded-full bg-[#555370]/40" />
                <div className="absolute inset-[9%] grid grid-cols-2 grid-rows-2 gap-[14%]">
                    {STICKER_SLOTS.map((slot) => {
                        const active = slot.id === selectedId
                        const theme  = slot.sponsor ? themeMap[slot.sponsor.theme] : null
                        return (
                            <div
                                key={slot.id}
                                className={`flex items-center justify-center rounded-xl border-2 text-[10px] sm:text-xs font-bold text-center px-1 transition-shadow ${slot.sponsor ? `${theme?.tagStyle}` : "border-dashed border-[#7c6dff] text-[#AFA9EC] bg-[#13121c]/80"} ${active ? "ring-4 ring-[#7c6dff]" : ""}`}
                            >
                                {slot.sponsor ? slot.sponsor.mark : "Open"}
                            </div>
                        )
                    })}
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1/3 h-1.5 rounded-full bg-[#555370]/60" />
            </div>
        </div>
    )
}
