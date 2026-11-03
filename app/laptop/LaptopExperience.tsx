"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react"
import dynamic from "next/dynamic"
import {
    LAPTOP_MODEL,
    LID_SLOTS,
    PALM_SLOTS,
    STICKER_COLORS,
    describeSlot,
    getSlot,
    nextSlotId,
    spotName,
    type SampleSponsor,
    type StickerSlot,
    type StickerSlotId,
} from "@/lib/laptop-stickers"
import { KEYBOARD_UNITS, KEY_ROWS, TOUCH_BAR } from "@/lib/laptop-keyboard"
import { themeMap } from "@/lib/theme"
import type { ViewerStatus } from "./LaptopViewer"
import { SponsorForm } from "./SponsorForm"

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
        body:  `The ${LAPTOP_MODEL.label} model hasn't been uploaded yet. The sponsor spots work the same below.`,
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

const toolbarButton =
    "text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"

// ─── Experience ───────────────────────────────────────────────────────────────

export function LaptopExperience() {
    const [selectedId, setSelectedId] = useState<StickerSlotId | null>(null)
    const [open, setOpen]             = useState(false)
    const [status, setStatus]         = useState<ViewerStatus>("loading")
    const [attempt, setAttempt]       = useState(0)
    const [resetToken, setResetToken] = useState(0)
    const reducedMotion = usePrefersReducedMotion()
    const optionRefs    = useRef(new Map<StickerSlotId, HTMLButtonElement>())
    const [formOpen, setFormOpen] = useState(false)
    const [formKey, setFormKey]   = useState(0)
    const sponsorButtonRef        = useRef<HTMLButtonElement>(null)

    const selected = selectedId ? getSlot(selectedId) : null

    // The palm rest is under the lid, so choosing one of its spots opens the laptop.
    const select = (id: StickerSlotId) => {
        setSelectedId(id)
        if (getSlot(id).surface === "palm-rest") setOpen(true)
    }
    // Each state starts from its overview; picking a spot then focuses it.
    const toggleOpen = () => {
        setOpen((current) => !current)
        setSelectedId(null)
    }

    const openForm = () => {
        setFormKey((n) => n + 1) // a fresh form each time, pre-set to the chosen spot
        setFormOpen(true)
    }
    // Return focus to the trigger explicitly: Safari doesn't focus buttons on
    // click, so the dialog's own focus-return would land on <body>.
    const closeForm = () => {
        setFormOpen(false)
        sponsorButtonRef.current?.focus()
    }
    const fallback = status === "loading" || status === "ready" ? null : FALLBACK[status]

    const retry = () => {
        setStatus("loading")
        setAttempt((n) => n + 1) // a new key remounts the viewer from scratch
    }

    const sceneLabel = `3D model of a ${LAPTOP_MODEL.label}, ${open
        ? "open, with the screen on, the keyboard backlit, and two sticker spots on the palm rest"
        : "closed, with four sticker spots on the lid"}.${selected ? ` Selected: ${describeSlot(selected)}.` : ""}`

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            {/* 3D view (or the 2D fallback) */}
            <section
                aria-label="Laptop preview"
                className="col-span-1 md:col-span-2 xl:col-span-8 bg-[#13121c] border border-[#2a2840] rounded-2xl p-3 sm:p-4 flex flex-col"
            >
                <div
                    role="img"
                    aria-label={sceneLabel}
                    className="relative h-80 sm:h-105 xl:h-130 rounded-xl overflow-hidden bg-[#0a0a0f]"
                >
                    {!fallback && (
                        <LaptopViewer
                            key={attempt}
                            open={open}
                            selectedId={selectedId}
                            resetToken={resetToken}
                            reducedMotion={reducedMotion}
                            onSelect={select}
                            onStatus={setStatus}
                        />
                    )}
                    {status === "loading" && <ViewerSkeleton />}
                    {fallback && (open ? <DeckDiagram selectedId={selectedId} /> : <LidDiagram selectedId={selectedId} />)}
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
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={toggleOpen}
                            className={`${toolbarButton} border-[#7c6dff] bg-[#7c6dff] text-white hover:bg-[#6a5de8]`}
                        >
                            {open ? "Close the laptop" : "Open the laptop"}
                        </button>
                        {status === "ready" && (
                            <button type="button" onClick={() => setResetToken((n) => n + 1)} className={`${toolbarButton} border-[#2a2840] text-[#c4c0d8] hover:bg-[#1e1c2e]`}>
                                Reset view
                            </button>
                        )}
                        {fallback?.retry && (
                            <button type="button" onClick={retry} className={`${toolbarButton} border-[#2a2840] text-[#c4c0d8] hover:bg-[#1e1c2e]`}>
                                Try again
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* Spot pickers + details */}
            <section aria-label="Sponsor spots" className="col-span-1 md:col-span-2 xl:col-span-4 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 flex flex-col gap-5">
                <SpotGroup
                    headingId="lid-spots-heading"
                    eyebrow="On the lid"
                    title="Four sponsor spots"
                    slots={LID_SLOTS}
                    selectedId={selectedId}
                    onSelect={select}
                    optionRefs={optionRefs}
                />
                <SpotGroup
                    headingId="palm-spots-heading"
                    eyebrow="Inside the laptop"
                    title="Two palm rest spots"
                    hint="Beside the trackpad, in view whenever the laptop is open. Choosing one opens it."
                    slots={PALM_SLOTS}
                    selectedId={selectedId}
                    onSelect={select}
                    optionRefs={optionRefs}
                />

                <SlotDetails slot={selected} onSponsor={openForm} buttonRef={sponsorButtonRef} />

                <p className="text-xs text-[#8a88a0] leading-relaxed">
                    Sample stickers for illustration, not real sponsors. An offer starts a conversation by email; nothing is charged on this site.
                </p>
            </section>

            <SponsorForm key={formKey} open={formOpen} onClose={closeForm} initialSpot={selectedId ?? "any"} />
        </div>
    )
}

// ─── Spot picker ──────────────────────────────────────────────────────────────

type SpotGroupProps = {
    headingId:  string
    eyebrow:    string
    title:      string
    hint?:      string
    slots:      readonly StickerSlot[]
    selectedId: StickerSlotId | null
    onSelect:   (id: StickerSlotId) => void
    optionRefs: RefObject<Map<StickerSlotId, HTMLButtonElement>>
}

/** One WAI-ARIA radio group. The two groups share a single selection. */
function SpotGroup({ headingId, eyebrow, title, hint, slots, selectedId, onSelect, optionRefs }: SpotGroupProps) {
    const hasSelection = slots.some((slot) => slot.id === selectedId)

    // Arrows move focus and selection together, within this group.
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const next = nextSlotId(hasSelection ? selectedId : null, event.key, slots)
        if (!next) return
        event.preventDefault()
        onSelect(next)
        optionRefs.current.get(next)?.focus()
    }

    return (
        <div>
            <p className="text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-1">{eyebrow}</p>
            <h2 id={headingId} className="font-syne font-bold text-xl text-[#f0eeff]">{title}</h2>
            {hint && <p className="text-xs text-[#8a88a0] leading-relaxed mt-1">{hint}</p>}
            <div role="radiogroup" aria-labelledby={headingId} className="grid grid-cols-2 gap-2 mt-3">
                {slots.map((slot, index) => {
                    const checked   = slot.id === selectedId
                    const focusable = checked || (!hasSelection && index === 0)
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
                            onClick={() => onSelect(slot.id)}
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
        </div>
    )
}

// ─── Details card ─────────────────────────────────────────────────────────────

function SlotDetails({ slot, onSponsor, buttonRef }: { slot: StickerSlot | null; onSponsor: () => void; buttonRef: RefObject<HTMLButtonElement | null> }) {
    return (
        <div aria-live="polite" className="bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4 flex flex-col gap-3 min-h-50">
            {!slot && (
                <>
                    <p className="text-sm text-[#c4c0d8] font-medium">Pick a spot</p>
                    <p className="text-sm text-[#8a88a0] leading-relaxed">
                        Choose a sticker on the laptop or in the lists to see who&apos;s there, and whether the spot is open.
                    </p>
                </>
            )}
            {slot?.sponsor && <SponsorDetails slot={slot} sponsor={slot.sponsor} />}
            {slot && !slot.sponsor && (
                <>
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] tracking-widest uppercase font-medium text-[#AFA9EC]">{spotName(slot)}</p>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                            <span className="text-xs text-emerald-400 font-medium">Available</span>
                        </div>
                    </div>
                    <h3 className="font-syne font-bold text-lg text-[#f0eeff] leading-snug">This spot is open</h3>
                    <p className="text-sm text-[#8a88a0] leading-relaxed">
                        {slot.surface === "palm-rest"
                            ? "Your logo could sit right beside the trackpad, where it's seen every time the laptop opens. Send an offer to talk it over."
                            : "Your logo could sit here. Send an offer to talk about putting your sticker on the lid."}
                    </p>
                </>
            )}
            <button
                ref={buttonRef}
                type="button"
                onClick={onSponsor}
                aria-haspopup="dialog"
                className="mt-auto inline-flex w-fit bg-[#7c6dff] hover:bg-[#6a5de8] text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0c14]"
            >
                Sponsor a spot →
            </button>
        </div>
    )
}

function SponsorDetails({ slot, sponsor }: { slot: StickerSlot; sponsor: SampleSponsor }) {
    const theme = themeMap[sponsor.theme]
    return (
        <>
            <div className="flex items-center justify-between gap-2">
                <p className={`text-[10px] tracking-widest uppercase font-medium ${theme.catColor}`}>{spotName(slot)}</p>
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
                    {LID_SLOTS.map((slot) => {
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

// The open laptop in 2D, at the model's real proportions (LAPTOP_MODEL.md §1):
// the lid upright, and the base foreshortened as if seen from a little above.
const CM          = 300 / 30.41 // drawing units per centimetre
const FORESHORTEN = 0.45
const LID_TOP     = 6
const BASE_TOP    = LID_TOP + 21.24 * CM + 3
/** A point on the base, `fromBack` cm in front of the hinge. */
const baseY = (fromBack: number) => BASE_TOP + fromBack * CM * FORESHORTEN

/** A flat drawing of the open laptop: the screen lit, the keys backlit, and the palm-rest spots. */
function DeckDiagram({ selectedId }: { selectedId: StickerSlotId | null }) {
    // Light up just after mounting, so the screen and keys fade in like the 3D view.
    const [lit, setLit] = useState(false)
    useEffect(() => {
        const frame = requestAnimationFrame(() => setLit(true))
        return () => cancelAnimationFrame(frame)
    }, [])
    const fade = `transition-opacity duration-700 motion-reduce:transition-none ${lit ? "opacity-100" : "opacity-0"}`

    const screen = { x: 10 + (30.41 - 28.65) / 2 * CM, y: LID_TOP + 1.1 * CM, width: 28.65 * CM, height: 17.9 * CM }
    const unit   = (27.9 * CM) / KEYBOARD_UNITS
    const keysX  = 10 + (30.41 - 27.9) / 2 * CM
    const rowH   = unit * FORESHORTEN
    const keys: { x: number; y: number; w: number; h: number }[] = []
    let y = baseY(0.6) + rowH * TOUCH_BAR.height
    for (const row of KEY_ROWS) {
        let x = keysX
        for (const key of row) {
            const w = (key.width ?? 1) * unit
            keys.push({ x: x + 0.9, y: y + 0.6, w: w - 1.8, h: rowH - 1.2 })
            x += w
        }
        y += rowH
    }

    return (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <svg viewBox="0 0 320 314" className="h-full w-full max-w-115">
                <defs>
                    <linearGradient id="deck-wallpaper" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#1d1648" />
                        <stop offset="0.55" stopColor="#0d0c14" />
                        <stop offset="1" stopColor="#2a1530" />
                    </linearGradient>
                    <radialGradient id="deck-glow-violet" cx="0.22" cy="0.8" r="0.6">
                        <stop offset="0" stopColor="#7c6dff" stopOpacity="0.6" />
                        <stop offset="1" stopColor="#7c6dff" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="deck-glow-pink" cx="0.84" cy="0.2" r="0.5">
                        <stop offset="0" stopColor="#ED93B1" stopOpacity="0.45" />
                        <stop offset="1" stopColor="#ED93B1" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="deck-aluminium" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#3a3850" />
                        <stop offset="1" stopColor="#2a2840" />
                    </linearGradient>
                </defs>

                {/* Lid: bezel, then the display */}
                <rect x="10" y={LID_TOP} width="300" height={21.24 * CM} rx="10" fill="#0b0b0e" stroke="#3a3850" />
                <rect {...screen} fill="#000" />
                <g className={fade}>
                    <rect {...screen} fill="url(#deck-wallpaper)" />
                    <rect {...screen} fill="url(#deck-glow-violet)" />
                    <rect {...screen} fill="url(#deck-glow-pink)" />
                    <rect x={screen.x} y={screen.y} width={screen.width} height="6" fill="#0a0a0f" fillOpacity="0.55" />
                    <text x={screen.x + 5} y={screen.y + 4.3} fontSize="4" fontWeight="700" fill="#f0eeff">JAVA.dev</text>
                    <rect x={160 - 34} y={screen.y + screen.height - 16} width="68" height="12" rx="4" fill="#ffffff" fillOpacity="0.1" />
                    {["#7c6dff", "#97C459", "#ED93B1", "#AFA9EC", "#6a5de8"].map((color, i) => (
                        <rect key={color} x={160 - 30 + i * 12.4} y={screen.y + screen.height - 14} width="8" height="8" rx="2" fill={color} />
                    ))}
                </g>

                {/* Hinge, then the base */}
                <rect x="10" y={BASE_TOP - 3} width="300" height="3" fill="#2a2840" />
                <rect x="10" y={BASE_TOP} width="300" height={21.24 * CM * FORESHORTEN} rx="6" fill="url(#deck-aluminium)" stroke="#555370" strokeOpacity="0.4" />

                {/* Touch Bar and keys; the backlight is a light edge on each key */}
                <rect x={keysX + 0.9} y={baseY(0.6) + 0.6} width={(KEYBOARD_UNITS - TOUCH_BAR.touchIdWidth) * unit - 1.8} height={rowH * TOUCH_BAR.height - 1.2} rx="1" fill="#050506" />
                {keys.map((key, i) => (
                    <rect key={i} x={key.x} y={key.y} width={key.w} height={key.h} rx="1" fill="#111114" />
                ))}
                <g className={fade}>
                    <rect x={keysX + 1.6} y={baseY(0.6) + 1.1} width={1.1 * unit} height={rowH * TOUCH_BAR.height - 2.2} rx="0.8" fill="#3a3a44" />
                    {keys.map((key, i) => (
                        <rect key={i} x={key.x} y={key.y} width={key.w} height={key.h} rx="1" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.5" />
                    ))}
                </g>

                {/* Trackpad, then the two palm-rest spots beside it */}
                <rect x={160 - 6.7 * CM} y={baseY(12.34)} width={13.4 * CM} height={8 * CM * FORESHORTEN} rx="3" fill="#34324a" stroke="#555370" strokeOpacity="0.6" />
                {PALM_SLOTS.map((slot) => {
                    const w   = 5 * CM
                    const h   = 3.5 * CM * FORESHORTEN
                    const x   = 160 + (slot.id === "palm-left" ? -10.95 : 10.95) * CM - w / 2
                    const top = baseY(16.32) - h / 2
                    const ink = slot.sponsor ? STICKER_COLORS[slot.sponsor.theme] : null
                    return (
                        <g key={slot.id}>
                            {slot.id === selectedId && <rect x={x - 3} y={top - 3} width={w + 6} height={h + 6} rx="5" fill="none" stroke="#7c6dff" strokeWidth="2.5" />}
                            <rect
                                x={x} y={top} width={w} height={h} rx="3"
                                fill={ink ? ink.fill : "#13121c"}
                                stroke={ink ? "#f0eeff" : "#7c6dff"}
                                strokeWidth="1.2"
                                strokeDasharray={ink ? undefined : "3 2"}
                            />
                            <text x={x + w / 2} y={top + h / 2 + 2.6} textAnchor="middle" fontSize="7.5" fontWeight="800" fill={ink ? ink.ink : "#AFA9EC"}>
                                {slot.sponsor ? slot.sponsor.mark : "Open"}
                            </text>
                        </g>
                    )
                })}
            </svg>
        </div>
    )
}
