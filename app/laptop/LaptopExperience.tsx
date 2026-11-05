"use client"

import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import {
    STICKER_SLOTS,
    nextSlotId,
    spotAccent,
    spotName,
    type Sponsor,
    type StickerSlot,
    type StickerSlotId,
} from "@/lib/laptop-stickers"
import { themeMap } from "@/lib/theme"
import { LaptopStage, spotTileStyle } from "./LaptopStage"
import { SponsorForm } from "./SponsorForm"

// ─── Experience ───────────────────────────────────────────────────────────────

/**
 * /laptop's interactive part: the laptop, the spot pickers, the details card
 * and the offer form. `slots` comes from the page (the sponsor_spots table,
 * or the built-in samples before it exists).
 */
export function LaptopExperience({ slots = STICKER_SLOTS }: { slots?: readonly StickerSlot[] }) {
    const [selectedId, setSelectedId] = useState<StickerSlotId | null>(null)
    const [open, setOpen]             = useState(false)
    // Pointed at in 3D, in the 2D drawing, or in a list: lights up everywhere at once.
    const [hoveredId, setHoveredId]   = useState<StickerSlotId | null>(null)
    const optionRefs    = useRef(new Map<StickerSlotId, HTMLButtonElement>())
    const [formOpen, setFormOpen] = useState(false)
    const [formKey, setFormKey]   = useState(0)
    const sponsorButtonRef        = useRef<HTMLButtonElement>(null)

    const lidSlots  = useMemo(() => slots.filter((slot) => slot.surface === "lid"), [slots])
    const palmSlots = useMemo(() => slots.filter((slot) => slot.surface === "palm-rest"), [slots])
    const selected  = selectedId ? slots.find((slot) => slot.id === selectedId) ?? null : null
    const anySample = slots.some((slot) => slot.sponsor?.sample)

    // The palm rest is under the lid, so choosing one of its spots opens the laptop.
    const select = (id: StickerSlotId) => {
        setSelectedId(id)
        if (slots.find((slot) => slot.id === id)?.surface === "palm-rest") setOpen(true)
    }
    // Each state starts from its overview; picking a spot then focuses it.
    const toggleOpen = () => {
        setOpen((current) => !current)
        setSelectedId(null)
    }
    // The visitor moved the lid past open or closed. The camera stays put, so
    // the selection does too, unless the closed lid now hides it.
    const lidMoved = (nowOpen: boolean) => {
        setOpen(nowOpen)
        if (!nowOpen) setSelectedId((id) => (slots.find((slot) => slot.id === id)?.surface === "palm-rest" ? null : id))
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

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            {/* 3D view (or the 2D fallback) */}
            <LaptopStage
                slots={slots}
                open={open}
                onToggleOpen={toggleOpen}
                onOpenChange={lidMoved}
                selectedId={selectedId}
                onSelect={select}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                className="col-span-1 md:col-span-2 xl:col-span-8"
            />

            {/* Spot pickers + details */}
            <section aria-label="Sponsor spots" className="col-span-1 md:col-span-2 xl:col-span-4 bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 flex flex-col gap-5">
                <SpotGroup
                    headingId="lid-spots-heading"
                    eyebrow="On the lid"
                    title="Four sponsor spots"
                    slots={lidSlots}
                    selectedId={selectedId}
                    onSelect={select}
                    hoveredId={hoveredId}
                    onHover={setHoveredId}
                    optionRefs={optionRefs}
                />
                <SpotGroup
                    headingId="palm-spots-heading"
                    eyebrow="Inside the laptop"
                    title="Two palm rest spots"
                    hint="Beside the trackpad, in view whenever the laptop is open. Choosing one opens it."
                    slots={palmSlots}
                    selectedId={selectedId}
                    onSelect={select}
                    hoveredId={hoveredId}
                    onHover={setHoveredId}
                    optionRefs={optionRefs}
                />

                <SlotDetails slot={selected} onSponsor={openForm} buttonRef={sponsorButtonRef} />

                <p className="text-xs text-[#8a88a0] leading-relaxed">
                    {anySample && "Sample stickers for illustration, not real sponsors. "}
                    An offer starts a conversation by email; nothing is charged on this site.
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
    hoveredId:  StickerSlotId | null
    onHover:    (id: StickerSlotId | null) => void
    optionRefs: RefObject<Map<StickerSlotId, HTMLButtonElement>>
}

/** One WAI-ARIA radio group. The two groups share a single selection. */
function SpotGroup({ headingId, eyebrow, title, hint, slots, selectedId, onSelect, hoveredId, onHover, optionRefs }: SpotGroupProps) {
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
                    const pointed   = slot.id === hoveredId
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
                            onMouseEnter={() => onHover(slot.id)}
                            onMouseLeave={() => onHover(null)}
                            onFocus={() => onHover(slot.id)}
                            onBlur={() => onHover(null)}
                            style={spotTileStyle(slot, { selected: checked, hovered: pointed })}
                            className={`text-left rounded-xl border px-3 py-2.5 transition-[background-color,border-color,box-shadow] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 ${checked ? "text-white motion-safe:animate-[spot-glow_700ms_ease-out_both]" : "bg-[#0a0a0f] border-[#2a2840] text-[#c4c0d8]"}`}
                        >
                            <span className={`flex items-center gap-1.5 text-[10px] tracking-widest uppercase font-medium ${checked ? "text-white/80" : "text-[#8a88a0]"}`}>
                                {/* The sticker's colour, so a tile and its sticker visibly match */}
                                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: spotAccent(slot) }} />
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
        <div
            aria-live="polite"
            className="relative bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4 flex flex-col gap-3 min-h-50 transition-colors"
            style={slot ? { borderColor: spotAccent(slot) } : undefined}
        >
            {/* Re-keyed per spot, so the glow replays each time a sticker is chosen */}
            {slot && (
                <span
                    key={slot.id}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-xl motion-safe:animate-[spot-glow_700ms_ease-out_both]"
                    style={{ ["--spot-accent" as string]: spotAccent(slot), boxShadow: `0 0 0 1px ${spotAccent(slot)}, 0 0 16px ${spotAccent(slot)}40` }}
                />
            )}
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

function SponsorDetails({ slot, sponsor }: { slot: StickerSlot; sponsor: Sponsor }) {
    const theme = themeMap[sponsor.theme]
    return (
        <>
            <div className="flex items-center justify-between gap-2">
                <p className={`text-[10px] tracking-widest uppercase font-medium ${theme.catColor}`}>{spotName(slot)}</p>
                {sponsor.sample && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium border-[#3a3850] text-[#c4c0d8]">Sample sponsor</span>
                )}
            </div>
            {sponsor.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a same-origin sticker image
                <img src={sponsor.imageUrl} alt={`${sponsor.name} sticker`} className="w-24 h-24 object-contain rounded-xl bg-[#13121c] border border-[#2a2840] p-1" />
            )}
            <h3 className="font-syne font-bold text-lg text-[#f0eeff] leading-snug">{sponsor.name}</h3>
            {sponsor.tagline && <p className={`text-sm font-medium ${theme.catColor}`}>{sponsor.tagline}</p>}
            {sponsor.description && <p className="text-sm text-[#8a88a0] leading-relaxed">{sponsor.description}</p>}
        </>
    )
}
