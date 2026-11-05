"use client"

/**
 * The laptop itself: the Three.js viewer (or a 2D drawing when the model or
 * WebGL isn't available), its status line, and the open/close and reset
 * controls. Used by /laptop (LaptopExperience) and by Studio's Sponsorships
 * tab, so both show exactly the same laptop from the same slot data.
 */
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import dynamic from "next/dynamic"
import {
    LAPTOP_MODEL,
    STICKER_COLORS,
    describeSlot,
    spotAccent,
    type StickerSlot,
    type StickerSlotId,
} from "@/lib/laptop-stickers"
import { KEYBOARD_UNITS, KEY_ROWS, TOUCH_BAR } from "@/lib/laptop-keyboard"
import type { ViewerStatus } from "./LaptopViewer"

// Three.js touches `window` and WebGL, so the viewer never renders on the
// server. `ssr: false` is only allowed inside a Client Component, which is why
// this file is a client boundary and app/laptop/page.tsx stays a Server
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

export const toolbarButton =
    "text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"

/**
 * A spot tile's colours: lit in its sponsor's colour when selected (with a
 * short glow, motion permitting) and more faintly when pointed at, here or
 * on the laptop. Shared with Studio's spot list.
 */
export function spotTileStyle(slot: StickerSlot, state: { selected: boolean; hovered: boolean }): CSSProperties {
    const accent = spotAccent(slot)
    if (state.selected) {
        return { ["--spot-accent" as string]: accent, borderColor: accent, background: `${accent}33`, boxShadow: `0 0 0 1px ${accent}, 0 0 16px ${accent}73` }
    }
    if (state.hovered) return { ["--spot-accent" as string]: accent, borderColor: accent, background: `${accent}14` }
    return { ["--spot-accent" as string]: accent }
}

// ─── Stage ────────────────────────────────────────────────────────────────────

export type LaptopStageProps = {
    slots:          readonly StickerSlot[]
    open:           boolean
    onToggleOpen:   () => void
    selectedId:     StickerSlotId | null
    onSelect:       (id: StickerSlotId) => void
    /** The spot being pointed at (here or in a list): its sticker lights up faintly. */
    hoveredId?:     StickerSlotId | null
    onHover?:       (id: StickerSlotId | null) => void
    /** The status line once the 3D view is ready. */
    readyHint?:     string
    /** Extra toolbar controls, before Reset view (Studio's preview switch). */
    extraControls?: ReactNode
    className?:     string
}

export function LaptopStage({
    slots,
    open,
    onToggleOpen,
    selectedId,
    onSelect,
    hoveredId = null,
    onHover,
    readyHint = "Drag to rotate, scroll or pinch to zoom, and click a sticker to see its sponsor.",
    extraControls,
    className = "",
}: LaptopStageProps) {
    const [status, setStatus]         = useState<ViewerStatus>("loading")
    const [attempt, setAttempt]       = useState(0)
    const [resetToken, setResetToken] = useState(0)
    const reducedMotion = usePrefersReducedMotion()

    const selected = selectedId ? slots.find((slot) => slot.id === selectedId) ?? null : null
    const fallback = status === "loading" || status === "ready" ? null : FALLBACK[status]

    const retry = () => {
        setStatus("loading")
        setAttempt((n) => n + 1) // a new key remounts the viewer from scratch
    }

    const sceneLabel = `3D model of a ${LAPTOP_MODEL.label}, ${open
        ? "open, with the screen on, the keyboard backlit, and two sticker spots on the palm rest"
        : "closed, with four sticker spots on the lid"}.${selected ? ` Selected: ${describeSlot(selected)}.` : ""}`

    return (
        <section
            aria-label="Laptop preview"
            className={`bg-[#13121c] border border-[#2a2840] rounded-2xl p-3 sm:p-4 flex flex-col ${className}`}
        >
            <div
                role="img"
                aria-label={sceneLabel}
                className="relative h-80 sm:h-105 xl:h-130 rounded-xl overflow-hidden bg-[#0a0a0f]"
            >
                {!fallback && (
                    <LaptopViewer
                        key={attempt}
                        slots={slots}
                        open={open}
                        selectedId={selectedId}
                        hoveredId={hoveredId}
                        resetToken={resetToken}
                        reducedMotion={reducedMotion}
                        onSelect={onSelect}
                        onHover={onHover}
                        onStatus={setStatus}
                    />
                )}
                {status === "loading" && <ViewerSkeleton />}
                {fallback && (open
                    ? <DeckDiagram slots={slots} selectedId={selectedId} hoveredId={hoveredId} onSelect={onSelect} onHover={onHover} />
                    : <LidDiagram slots={slots} selectedId={selectedId} hoveredId={hoveredId} onSelect={onSelect} onHover={onHover} />)}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-xl"
                    style={{ background: "radial-gradient(circle at 50% 0%, rgba(124,109,255,.12) 0%, transparent 60%)" }}
                />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 px-1">
                <p role="status" className="text-xs text-[#8a88a0]">
                    {status === "loading" && "Loading the 3D laptop…"}
                    {status === "ready" && readyHint}
                    {fallback && <><span className="text-[#c4c0d8] font-medium">{fallback.title}.</span> {fallback.body}</>}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onToggleOpen}
                        className={`${toolbarButton} border-[#7c6dff] bg-[#7c6dff] text-white hover:bg-[#6a5de8]`}
                    >
                        {open ? "Close the laptop" : "Open the laptop"}
                    </button>
                    {extraControls}
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

type DiagramProps = {
    slots:      readonly StickerSlot[]
    selectedId: StickerSlotId | null
    hoveredId:  StickerSlotId | null
    onSelect:   (id: StickerSlotId) => void
    onHover?:   (id: StickerSlotId | null) => void
}

/**
 * Pointer handlers for a sticker in a 2D drawing: click selects it, hovering
 * lights up its tile. Mouse only: the drawings are aria-hidden, and the spot
 * lists are the keyboard and screen-reader control.
 */
const stickerHandlers = (id: StickerSlotId, { onSelect, onHover }: Pick<DiagramProps, "onSelect" | "onHover">) => ({
    onClick:      () => onSelect(id),
    onMouseEnter: () => onHover?.(id),
    onMouseLeave: () => onHover?.(null),
})

/** A flat drawing of the lid (seen from outside, hinge at the bottom) that mirrors and drives the selection. */
function LidDiagram({ slots, selectedId, hoveredId, onSelect, onHover }: DiagramProps) {
    return (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center p-6">
            <div className="relative w-full max-w-115 aspect-[30.41/21.24] rounded-2xl bg-linear-to-b from-[#3a3850] to-[#2a2840] border border-[#555370]/40">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-9 rounded-full bg-[#555370]/40" />
                <div className="absolute inset-[9%] grid grid-cols-2 grid-rows-2 gap-[14%]">
                    {slots.filter((slot) => slot.surface === "lid").map((slot) => {
                        const active  = slot.id === selectedId
                        const pointed = slot.id === hoveredId
                        const accent  = spotAccent(slot)
                        const ink     = slot.sponsor ? STICKER_COLORS[slot.sponsor.theme] : null
                        return (
                            <div
                                key={slot.id}
                                data-spot={slot.id}
                                {...stickerHandlers(slot.id, { onSelect, onHover })}
                                className={`relative overflow-hidden flex items-center justify-center rounded-xl border-2 text-[10px] sm:text-xs font-bold text-center px-1 cursor-pointer transition-[box-shadow,filter] ${slot.sponsor ? "" : "border-dashed"} ${active ? "motion-safe:animate-[spot-glow_700ms_ease-out_both] brightness-125" : pointed ? "brightness-110" : ""}`}
                                style={{
                                    ["--spot-accent" as string]: accent,
                                    borderColor: ink ? "#f0eeff" : accent,
                                    background:  ink ? ink.fill : "rgba(19, 18, 28, 0.8)",
                                    color:       ink ? ink.ink : "#AFA9EC",
                                    boxShadow:   active ? `0 0 0 4px ${accent}, 0 0 22px ${accent}` : pointed ? `0 0 0 2px ${accent}99` : undefined,
                                }}
                            >
                                {slot.sponsor?.imageUrl
                                    // eslint-disable-next-line @next/next/no-img-element -- a same-origin sticker, drawn at thumbnail size
                                    ? <img src={slot.sponsor.imageUrl} alt="" className="absolute inset-1 w-[calc(100%-0.5rem)] h-[calc(100%-0.5rem)] object-contain" />
                                    : slot.sponsor ? slot.sponsor.mark : "Open"}
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
function DeckDiagram({ slots, selectedId, hoveredId, onSelect, onHover }: DiagramProps) {
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
                {slots.filter((slot) => slot.surface === "palm-rest").map((slot) => {
                    const w   = 5 * CM
                    const h   = 3.5 * CM * FORESHORTEN
                    const x   = 160 + (slot.id === "palm-left" ? -10.95 : 10.95) * CM - w / 2
                    const top = baseY(16.32) - h / 2
                    const ink    = slot.sponsor ? STICKER_COLORS[slot.sponsor.theme] : null
                    const accent = spotAccent(slot)
                    const ring   = slot.id === selectedId ? 2.5 : slot.id === hoveredId ? 1.2 : 0
                    return (
                        <g key={slot.id} data-spot={slot.id} {...stickerHandlers(slot.id, { onSelect, onHover })} className="cursor-pointer">
                            {ring > 0 && <rect x={x - 3} y={top - 3} width={w + 6} height={h + 6} rx="5" fill="none" stroke={accent} strokeWidth={ring} strokeOpacity={slot.id === selectedId ? 1 : 0.6} />}
                            <rect
                                x={x} y={top} width={w} height={h} rx="3"
                                fill={ink ? ink.fill : "#13121c"}
                                stroke={ink ? "#f0eeff" : "#7c6dff"}
                                strokeWidth="1.2"
                                strokeDasharray={ink ? undefined : "3 2"}
                            />
                            {slot.sponsor?.imageUrl ? (
                                <image href={slot.sponsor.imageUrl} x={x + 1.5} y={top + 1} width={w - 3} height={h - 2} preserveAspectRatio="xMidYMid meet" />
                            ) : (
                                <text x={x + w / 2} y={top + h / 2 + 2.6} textAnchor="middle" fontSize="7.5" fontWeight="800" fill={ink ? ink.ink : "#AFA9EC"}>
                                    {slot.sponsor ? slot.sponsor.mark : "Open"}
                                </text>
                            )}
                        </g>
                    )
                })}
            </svg>
        </div>
    )
}
