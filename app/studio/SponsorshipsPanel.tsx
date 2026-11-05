"use client"

/**
 * Studio → Sponsorships: what each sticker spot on /laptop shows, and the
 * offers sent through "Sponsor a spot".
 *
 * The laptop here is the same LaptopStage /laptop uses, drawn from the same
 * data, so what you see is what visitors get (plus, optionally, the stickers
 * you've hidden). Every change goes through the REST API in
 * app/api/sponsorships/(spots)/route.ts, and each save refreshes /laptop.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { LaptopStage, spotTileStyle, toolbarButton } from "@/app/laptop/LaptopStage"
import { STICKER_COLORS, STICKER_SLOTS, spotAccent, spotName, type StickerSlot, type StickerSlotId } from "@/lib/laptop-stickers"
import { SPOT_TEXT_LIMITS } from "@/lib/sponsor-spots"
import { STICKER_ACCEPT, formatOffer, spotLabel, type SponsorSpot } from "@/lib/sponsorship"
import type { PostTheme } from "@/lib/theme"
import type { AdminSpot } from "@/app/api/sponsorships/spots/route"
import type { AdminOffer } from "@/app/api/sponsorships/route"
import { failureMessage, formatDate } from "./shared"

type OfferStatus = AdminOffer["status"]

const THEMES: { value: PostTheme; label: string }[] = [
    { value: "purple", label: "Violet" },
    { value: "green",  label: "Green" },
    { value: "pink",   label: "Pink" },
]

const input = "w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff] placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors"
const label = "block text-[11px] tracking-widest uppercase text-[#555370] font-medium mb-1.5"
const card  = "bg-[#13121c] border border-[#2a2840] rounded-2xl"
const primaryButton   = "bg-[#7c6dff] hover:bg-[#6a5de8] disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors cursor-pointer"
const secondaryButton = "border border-[#2a2840] hover:bg-[#1e1c2e] disabled:opacity-40 text-[#c4c0d8] text-sm px-4 py-2 rounded-xl transition-colors cursor-pointer"
const dangerButton    = "border border-pink-500/40 hover:bg-pink-500/10 disabled:opacity-40 text-pink-300 text-sm px-4 py-2 rounded-xl transition-colors cursor-pointer"

/** fetch → the JSON body, or the reason it failed (in words for the panel). */
async function call<T>(url: string, init: RequestInit, fallback: string): Promise<{ data: T } | { error: string }> {
    try {
        const res = await fetch(url, init)
        if (!res.ok) return { error: await failureMessage(res, fallback) }
        return { data: (await res.json()) as T }
    } catch {
        return { error: "Network error. Check your connection and try again." }
    }
}

const json = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
})

/** A destructive button that asks once more ("Click again to…") before it acts. */
function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
    const [confirming, setConfirming] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    const click = () => {
        if (!confirming) {
            setConfirming(true)
            timer.current = setTimeout(() => setConfirming(false), 3000)
            return
        }
        if (timer.current) clearTimeout(timer.current)
        setConfirming(false)
        onConfirm()
    }

    return (
        <button type="button" onClick={click} disabled={disabled}
            className={confirming ? "bg-red-600 text-white text-sm px-4 py-2 rounded-xl cursor-pointer motion-safe:animate-pulse" : dangerButton}>
            {confirming ? confirmLabel : label}
        </button>
    )
}

/** The six spots as the laptop draws them, from Studio's data. */
function previewSlots(spots: readonly AdminSpot[], showHidden: boolean): StickerSlot[] {
    const byId = new Map(spots.map((spot) => [spot.id, spot]))
    return STICKER_SLOTS.map((slot) => {
        const spot = byId.get(slot.id)
        if (!spot) return slot
        const shown = spot.sponsor && (spot.visible || showHidden)
        return { ...slot, sponsor: shown ? { ...spot.sponsor!, sample: spot.sample, imageUrl: spot.imageUrl } : null }
    })
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function SponsorshipsPanel() {
    const [spots, setSpots]           = useState<AdminSpot[] | null>(null)
    const [offers, setOffers]         = useState<AdminOffer[]>([])
    const [setup, setSetup]           = useState(true)
    const [loadError, setLoadError]   = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<StickerSlotId | null>(null)
    const [hoveredId, setHoveredId]   = useState<StickerSlotId | null>(null)
    const [open, setOpen]             = useState(false)
    const [showHidden, setShowHidden] = useState(true)
    // Shown in the editor after an offer's sticker lands on a spot (from either place).
    const [notice, setNotice]         = useState<{ id: StickerSlotId; text: string } | null>(null)

    useEffect(() => {
        let cancelled = false
        Promise.all([
            call<{ spots: AdminSpot[]; setup: boolean }>("/api/sponsorships/spots", {}, "Couldn't load the spots."),
            call<{ offers: AdminOffer[]; setup: boolean }>("/api/sponsorships", {}, "Couldn't load the offers."),
        ]).then(([spotsResult, offersResult]) => {
            if (cancelled) return
            if ("error" in spotsResult) return setLoadError(spotsResult.error)
            if ("error" in offersResult) return setLoadError(offersResult.error)
            setSpots(spotsResult.data.spots)
            setOffers(offersResult.data.offers)
            setSetup(spotsResult.data.setup && offersResult.data.setup)
        })
        return () => { cancelled = true }
    }, [])

    const slots = useMemo(() => previewSlots(spots ?? [], showHidden), [spots, showHidden])

    const select = (id: StickerSlotId) => {
        setSelectedId(id)
        setNotice((current) => (current?.id === id ? current : null))
        if (STICKER_SLOTS.find((slot) => slot.id === id)?.surface === "palm-rest") setOpen(true)
    }
    const savedSpot  = (spot: AdminSpot) => setSpots((current) => (current ?? []).map((s) => (s.id === spot.id ? spot : s)))
    const savedOffer = (offer: AdminOffer) => setOffers((current) => current.map((o) => (o.id === offer.id ? offer : o)))
    const placed     = (spot: AdminSpot, offerId: string) => {
        savedSpot(spot)
        setOffers((current) => current.map((o) => (o.id === offerId ? { ...o, status: "accepted" } : o)))
        setShowHidden(true) // the sticker arrives hidden: make sure the preview shows it
        select(spot.id)
        setNotice({
            id:   spot.id,
            text: spot.visible
                ? "Placed, and live on /laptop."
                : "Placed as hidden. Check it on the laptop, then switch it on to show it on /laptop.",
        })
    }

    if (loadError) {
        return <div className={`${card} p-6 text-sm text-pink-300 max-w-3xl`} role="alert">{loadError}</div>
    }
    if (!spots) {
        return <div className={`${card} h-64 max-w-7xl motion-safe:animate-pulse`} aria-label="Loading sponsorships" />
    }

    const selected    = selectedId ? spots.find((spot) => spot.id === selectedId) ?? null : null
    const filled      = spots.filter((spot) => spot.sponsor).length
    const hiddenCount = spots.filter((spot) => spot.sponsor && !spot.visible).length
    const newCount    = offers.filter((offer) => offer.status === "new").length

    return (
        <div className="max-w-7xl space-y-4">
            {!setup && (
                <div className={`${card} p-4 border-amber-500/40 text-sm text-amber-200`} role="status">
                    Run <code className="text-amber-100">supabase/sponsorships-schema.sql</code> in the Supabase SQL editor (steps in SPONSORSHIPS.md) to
                    keep offers and edit spots. Until then, /laptop shows the built-in samples and these controls can&apos;t save.
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Offers",      value: offers.length },
                    { label: "New",         value: newCount },
                    { label: "Spots taken", value: `${filled}/${spots.length}` },
                    { label: "Hidden",      value: hiddenCount },
                ].map((stat) => (
                    <div key={stat.label} className={`${card} px-4 py-3`}>
                        <p className="text-xl font-syne font-bold text-[#f0eeff]">{stat.value}</p>
                        <p className="text-[11px] tracking-widest uppercase text-[#555370] mt-0.5">{stat.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <LaptopStage
                    slots={slots}
                    open={open}
                    onToggleOpen={() => { setOpen((o) => !o); setSelectedId(null) }}
                    selectedId={selectedId}
                    onSelect={select}
                    hoveredId={hoveredId}
                    onHover={setHoveredId}
                    readyHint="What visitors see on /laptop. Click a sticker to edit its spot."
                    extraControls={
                        <label className={`${toolbarButton} border-[#2a2840] text-[#c4c0d8] inline-flex items-center gap-1.5`}>
                            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-[#7c6dff]" />
                            Show hidden stickers
                        </label>
                    }
                    className="xl:col-span-7"
                />
                <div className={`${card} p-5 xl:col-span-5`}>
                    {selected
                        ? <SpotEditor key={`${selected.id}:${selected.updatedAt}`} spot={selected} offers={offers} onSaved={savedSpot} onPlaced={placed}
                            notice={notice?.id === selected.id ? notice.text : null} disabled={!setup} />
                        : (
                            <div className="h-full flex flex-col justify-center gap-2 text-sm text-[#8a88a0]">
                                <p className="text-[#c4c0d8] font-medium">Pick a spot</p>
                                <p>Click a sticker on the laptop, or a spot below, to edit what it shows, hide it, or place an offer&apos;s sticker on it.</p>
                            </div>
                        )}
                </div>
            </div>

            <SpotList spots={spots} slots={slots} selectedId={selectedId} hoveredId={hoveredId} onSelect={select} onHover={setHoveredId} onSaved={savedSpot} disabled={!setup} />

            <OffersInbox offers={offers} spots={spots} onSaved={savedOffer} onDeleted={(id) => setOffers((current) => current.filter((o) => o.id !== id))} onPlaced={placed} disabled={!setup} />
        </div>
    )
}

// ─── Spot list ────────────────────────────────────────────────────────────────

function SpotList({ spots, slots, selectedId, hoveredId, onSelect, onHover, onSaved, disabled }: {
    spots: AdminSpot[]; slots: StickerSlot[]
    selectedId: StickerSlotId | null; hoveredId: StickerSlotId | null
    onSelect: (id: StickerSlotId) => void; onHover: (id: StickerSlotId | null) => void
    onSaved: (spot: AdminSpot) => void; disabled: boolean
}) {
    return (
        <section aria-labelledby="studio-spots-heading" className={`${card} p-5`}>
            <h2 id="studio-spots-heading" className="font-syne font-bold text-lg text-[#f0eeff] mb-3">Spots</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {STICKER_SLOTS.map((layout) => {
                    const spot = spots.find((s) => s.id === layout.id)!
                    const slot = slots.find((s) => s.id === layout.id)!
                    const checked = layout.id === selectedId
                    // The tile lights up in the sponsor's colour even when the preview hides it.
                    const tileSlot = { ...slot, sponsor: spot.sponsor ? { ...spot.sponsor } : null }
                    return (
                        <div
                            key={layout.id}
                            onMouseEnter={() => onHover(layout.id)}
                            onMouseLeave={() => onHover(null)}
                            style={spotTileStyle(tileSlot, { selected: checked, hovered: layout.id === hoveredId })}
                            className={`rounded-xl border p-3 flex gap-3 items-center transition-[background-color,border-color,box-shadow] ${checked ? "motion-safe:animate-[spot-glow_700ms_ease-out_both]" : "bg-[#0a0a0f] border-[#2a2840]"}`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(layout.id)}
                                aria-pressed={checked}
                                aria-label={`Edit ${spotName(layout)}`}
                                className="flex-1 min-w-0 flex gap-3 items-center text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60 rounded-lg"
                            >
                                <Thumb spot={spot} accent={spotAccent(tileSlot)} />
                                <span className="min-w-0">
                                    <span className="block text-[10px] tracking-widest uppercase font-medium text-[#8a88a0]">{spotName(layout)}</span>
                                    <span className="block text-sm font-medium text-[#f0eeff] truncate">{spot.sponsor?.name ?? "Open spot"}</span>
                                    <span className="flex gap-1 mt-1">
                                        {spot.sample && <Badge>Sample</Badge>}
                                        {spot.sponsor && !spot.visible && <Badge tone="amber">Hidden</Badge>}
                                        {spot.offerId && <Badge tone="green">From an offer</Badge>}
                                    </span>
                                </span>
                            </button>
                            {spot.sponsor && <VisibilitySwitch spot={spot} onSaved={onSaved} disabled={disabled} />}
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function Thumb({ spot, accent }: { spot: AdminSpot; accent: string }) {
    if (spot.imageUrl) {
        // eslint-disable-next-line @next/next/no-img-element -- a private sticker, streamed from our own admin route
        return <img src={spot.imageUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-[#13121c] border border-[#2a2840] shrink-0" />
    }
    return (
        <span aria-hidden="true" className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-extrabold"
            style={{ background: spot.sponsor ? accent : "#13121c", color: spot.sponsor ? "#0a0a0f" : "#AFA9EC", border: spot.sponsor ? "none" : `1px dashed ${accent}` }}>
            {spot.sponsor?.mark ?? "Open"}
        </span>
    )
}

function Badge({ children, tone = "violet" }: { children: React.ReactNode; tone?: "violet" | "amber" | "green" }) {
    const tones = { violet: "border-[#3a3850] text-[#c4c0d8]", amber: "border-amber-500/40 text-amber-300", green: "border-emerald-500/40 text-emerald-300" }
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${tones[tone]}`}>{children}</span>
}

/** Show or hide a spot's sponsor on /laptop. Saves at once. */
function VisibilitySwitch({ spot, onSaved, disabled }: { spot: AdminSpot; onSaved: (spot: AdminSpot) => void; disabled: boolean }) {
    const [busy, setBusy]   = useState(false)
    const [error, setError] = useState<string | null>(null)
    const toggle = async () => {
        setBusy(true)
        setError(null)
        const result = await call<AdminSpot>("/api/sponsorships/spots", json("PATCH", { id: spot.id, visible: !spot.visible }), "Couldn't change visibility.")
        setBusy(false)
        if ("error" in result) setError(result.error)
        else onSaved(result.data)
    }
    return (
        <span className="flex flex-col items-end gap-1 shrink-0">
            <button
                type="button"
                role="switch"
                aria-checked={spot.visible}
                aria-label={`Show ${spot.sponsor?.name ?? "this sponsor"} on /laptop`}
                disabled={busy || disabled}
                onClick={toggle}
                className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-40 ${spot.visible ? "bg-emerald-500" : "bg-[#2a2840]"}`}
            >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${spot.visible ? "left-5" : "left-1"}`} />
            </button>
            <span className="text-[10px] text-[#555370]">{spot.visible ? "Shown" : "Hidden"}</span>
            {error && <span role="alert" className="text-[10px] text-pink-400 max-w-32 text-right">{error}</span>}
        </span>
    )
}

// ─── Spot editor ──────────────────────────────────────────────────────────────

function SpotEditor({ spot, offers, onSaved, onPlaced, notice, disabled }: {
    spot: AdminSpot; offers: AdminOffer[]
    onSaved: (spot: AdminSpot) => void; onPlaced: (spot: AdminSpot, offerId: string) => void
    notice: string | null; disabled: boolean
}) {
    const layout = STICKER_SLOTS.find((slot) => slot.id === spot.id)!
    const [name, setName]               = useState(spot.sponsor?.name ?? "")
    const [mark, setMark]               = useState(spot.sponsor?.mark ?? "")
    const [tagline, setTagline]         = useState(spot.sponsor?.tagline ?? "")
    const [description, setDescription] = useState(spot.sponsor?.description ?? "")
    const [theme, setTheme]             = useState<PostTheme>(spot.sponsor?.theme ?? "purple")
    const [offerId, setOfferId]         = useState("")
    const [busy, setBusy]               = useState(false)
    const [error, setError]             = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const placeable = offers.filter((offer) => offer.fileUrl && offer.status !== "declined")

    // Each save hands back the spot with a new updatedAt, which remounts this
    // editor with the saved values.
    const run = async (work: () => Promise<{ data: AdminSpot } | { error: string }>, done?: (spot: AdminSpot) => void) => {
        setBusy(true)
        setError(null)
        const result = await work()
        setBusy(false)
        if ("error" in result) return setError(result.error)
        ;(done ?? onSaved)(result.data)
    }

    const save = () => run(() => call<AdminSpot>("/api/sponsorships/spots",
        json("PATCH", { id: spot.id, sponsor: { name, mark, tagline, description, theme } }), "Couldn't save the spot."))

    const clear = () => run(() => call<AdminSpot>("/api/sponsorships/spots", json("PATCH", { id: spot.id, sponsor: null }), "Couldn't clear the spot."))

    const removeImage = () => run(() => call<AdminSpot>("/api/sponsorships/spots", json("PATCH", { id: spot.id, removeImage: true }), "Couldn't remove the image."))

    const upload = (file: File) => {
        const body = new FormData()
        body.set("id", spot.id)
        body.set("sticker", file)
        void run(() => call<AdminSpot>("/api/sponsorships/spots", { method: "POST", body }, "Couldn't upload the image."))
    }

    const place = () => {
        const offer = offers.find((o) => o.id === offerId)
        if (!offer) return
        if (spot.sponsor && !spot.sample && spot.offerId !== offer.id && !confirm(`Replace ${spot.sponsor.name} with ${offer.affiliation}?`)) return
        void run(
            () => call<AdminSpot>("/api/sponsorships/spots", json("PATCH", { id: spot.id, offerId: offer.id }), "Couldn't place the sticker."),
            (saved) => onPlaced(saved, offer.id),
        )
    }

    return (
        <div className="flex flex-col gap-4" aria-labelledby="spot-editor-heading">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] tracking-widest uppercase font-medium" style={{ color: spotAccent({ sponsor: spot.sponsor }) }}>{spotName(layout)}</p>
                    <h2 id="spot-editor-heading" className="font-syne font-bold text-xl text-[#f0eeff]">{spot.sponsor?.name ?? "Open spot"}</h2>
                </div>
                {spot.sponsor && <VisibilitySwitch spot={spot} onSaved={onSaved} disabled={disabled} />}
            </div>

            {/* The sticker image */}
            <div className="flex items-center gap-3">
                <Thumb spot={spot} accent={spotAccent({ sponsor: spot.sponsor })} />
                <div className="flex flex-wrap gap-2">
                    <input ref={fileRef} type="file" accept={STICKER_ACCEPT} className="sr-only" aria-label="Sticker image (PNG or JPG)"
                        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload(file) }} />
                    <button type="button" className={secondaryButton} disabled={busy || disabled || !spot.sponsor} onClick={() => fileRef.current?.click()}>
                        {spot.imageUrl ? "Replace image" : "Upload image"}
                    </button>
                    {spot.imageUrl && (
                        <>
                            <a href={spot.imageUrl} target="_blank" rel="noopener noreferrer" className={secondaryButton}>Open</a>
                            <button type="button" className={secondaryButton} disabled={busy || disabled} onClick={removeImage}>Remove image</button>
                        </>
                    )}
                </div>
            </div>
            {!spot.sponsor && <p className="text-xs text-[#555370]">Save a sponsor name first, then add an image, or place an offer&apos;s sticker below.</p>}

            {/* Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                    <label htmlFor="spot-name" className={label}>Sponsor name</label>
                    <input id="spot-name" className={input} value={name} maxLength={SPOT_TEXT_LIMITS.name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                    <label htmlFor="spot-mark" className={label}>Mark</label>
                    <input id="spot-mark" className={input} value={mark} maxLength={SPOT_TEXT_LIMITS.mark} placeholder="ACME" onChange={(e) => setMark(e.target.value.toUpperCase())} />
                </div>
            </div>
            <div>
                <label htmlFor="spot-tagline" className={label}>Tagline</label>
                <input id="spot-tagline" className={input} value={tagline} maxLength={SPOT_TEXT_LIMITS.tagline} onChange={(e) => setTagline(e.target.value)} />
            </div>
            <div>
                <label htmlFor="spot-description" className={label}>Description</label>
                <textarea id="spot-description" rows={3} className={`${input} resize-none`} value={description} maxLength={SPOT_TEXT_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
                <span className={label}>Colour</span>
                <div className="flex gap-2" role="radiogroup" aria-label="Sticker colour">
                    {THEMES.map((option) => (
                        <button key={option.value} type="button" role="radio" aria-checked={theme === option.value} onClick={() => setTheme(option.value)}
                            className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${theme === option.value ? "border-[#f0eeff] text-[#f0eeff]" : "border-[#2a2840] text-[#8a88a0]"}`}>
                            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: STICKER_COLORS[option.value].fill }} />
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button type="button" className={primaryButton} disabled={busy || disabled || !name.trim()} onClick={save}>
                    {busy ? "Saving…" : "Save details"}
                </button>
                {spot.sponsor && <ConfirmButton label="Clear spot" confirmLabel="Click again to clear" onConfirm={clear} disabled={busy || disabled} />}
            </div>

            {/* Place an offer's sticker */}
            {placeable.length > 0 && (
                <div className="border-t border-[#2a2840] pt-4">
                    <label htmlFor="spot-offer" className={label}>Place an offer&apos;s sticker here</label>
                    <div className="flex gap-2">
                        <select id="spot-offer" className={`${input} cursor-pointer`} value={offerId} onChange={(e) => setOfferId(e.target.value)}>
                            <option value="">Choose an offer…</option>
                            {placeable.map((offer) => (
                                <option key={offer.id} value={offer.id}>{offer.affiliation} · {formatOffer(offer.offer_usd)} · wants {spotLabel(offer.spot as SponsorSpot)}</option>
                            ))}
                        </select>
                        <button type="button" className={secondaryButton} disabled={busy || disabled || !offerId} onClick={place}>Place</button>
                    </div>
                </div>
            )}

            {error && <p role="alert" className="text-xs text-pink-400">{error}</p>}
            <p role="status" className="text-xs text-emerald-300 empty:hidden">{notice}</p>
        </div>
    )
}

// ─── Offers inbox ─────────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: OfferStatus | "all"; label: string }[] = [
    { value: "all",      label: "All" },
    { value: "new",      label: "New" },
    { value: "accepted", label: "Accepted" },
    { value: "declined", label: "Declined" },
]

const STATUS_PILL: Record<OfferStatus, string> = {
    new:      "border-[#7c6dff]/50 text-[#AFA9EC]",
    accepted: "border-emerald-500/40 text-emerald-300",
    declined: "border-[#3a3850] text-[#8a88a0]",
}

function OffersInbox({ offers, spots, onSaved, onDeleted, onPlaced, disabled }: {
    offers: AdminOffer[]; spots: AdminSpot[]
    onSaved: (offer: AdminOffer) => void; onDeleted: (id: string) => void
    onPlaced: (spot: AdminSpot, offerId: string) => void; disabled: boolean
}) {
    const [filter, setFilter] = useState<OfferStatus | "all">("all")
    const shown = offers.filter((offer) => filter === "all" || offer.status === filter)

    return (
        <section aria-labelledby="studio-offers-heading" className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 id="studio-offers-heading" className="font-syne font-bold text-lg text-[#f0eeff]">Offers</h2>
                <div className="flex gap-1 bg-[#0a0a0f] p-1 rounded-xl border border-[#2a2840]">
                    {STATUS_FILTERS.map((option) => (
                        <button key={option.value} type="button" onClick={() => setFilter(option.value)} aria-pressed={filter === option.value}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${filter === option.value ? "bg-[#7c6dff] text-white" : "text-[#555370] hover:text-[#c4c0d8]"}`}>
                            {option.label} ({option.value === "all" ? offers.length : offers.filter((o) => o.status === option.value).length})
                        </button>
                    ))}
                </div>
            </div>
            {shown.length === 0 ? (
                <p className="text-sm text-[#555370]">{offers.length === 0 ? "No offers yet. They appear here as soon as someone sends one from /laptop." : "No offers with this status."}</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {shown.map((offer) => <OfferCard key={offer.id} offer={offer} spots={spots} onSaved={onSaved} onDeleted={onDeleted} onPlaced={onPlaced} disabled={disabled} />)}
                </ul>
            )}
        </section>
    )
}

function OfferCard({ offer, spots, onSaved, onDeleted, onPlaced, disabled }: {
    offer: AdminOffer; spots: AdminSpot[]
    onSaved: (offer: AdminOffer) => void; onDeleted: (id: string) => void
    onPlaced: (spot: AdminSpot, offerId: string) => void; disabled: boolean
}) {
    const preferred = STICKER_SLOTS.some((slot) => slot.id === offer.spot) ? (offer.spot as StickerSlotId) : null
    const firstOpen = spots.find((spot) => !spot.sponsor || spot.sample)?.id ?? STICKER_SLOTS[0].id
    const [target, setTarget] = useState<StickerSlotId>(preferred ?? firstOpen)
    const [notes, setNotes]   = useState(offer.notes)
    const [busy, setBusy]     = useState(false)
    const [error, setError]   = useState<string | null>(null)

    const patch = async (body: Record<string, unknown>, fallback: string) => {
        setBusy(true)
        setError(null)
        const result = await call<AdminOffer>("/api/sponsorships", json("PATCH", { id: offer.id, ...body }), fallback)
        setBusy(false)
        if ("error" in result) setError(result.error)
        else onSaved(result.data)
    }

    // Deletes the offer and its file. A copy already placed on a spot stays.
    const remove = async () => {
        setBusy(true)
        setError(null)
        const result = await call<{ success: boolean }>("/api/sponsorships", json("DELETE", { id: offer.id }), "Couldn't delete the offer.")
        setBusy(false)
        if ("error" in result) setError(result.error)
        else onDeleted(offer.id)
    }

    const place = async () => {
        const spot = spots.find((s) => s.id === target)
        if (spot?.sponsor && !spot.sample && spot.offerId !== offer.id && !confirm(`Replace ${spot.sponsor.name} on ${spotName(STICKER_SLOTS.find((s) => s.id === target)!)}?`)) return
        setBusy(true)
        setError(null)
        const result = await call<AdminSpot>("/api/sponsorships/spots", json("PATCH", { id: target, offerId: offer.id }), "Couldn't place the sticker.")
        setBusy(false)
        if ("error" in result) setError(result.error)
        else onPlaced(result.data, offer.id)
    }

    return (
        <li className="bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4 flex flex-col sm:flex-row gap-4">
            <div className="shrink-0">
                {offer.fileUrl ? (
                    <a href={offer.fileUrl} target="_blank" rel="noopener noreferrer" title="Open the sticker file">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a private sticker, streamed from our own admin route */}
                        <img src={offer.fileUrl} alt={`Sticker from ${offer.affiliation}`} className="w-24 h-24 object-contain rounded-lg bg-[#13121c] border border-[#2a2840]" />
                    </a>
                ) : (
                    <span className="w-24 h-24 rounded-lg border border-dashed border-[#2a2840] flex items-center justify-center text-[10px] text-[#555370] text-center p-2">File not saved (it&apos;s in the email)</span>
                )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[#f0eeff]">{offer.affiliation}</p>
                    <span className="text-sm font-syne font-bold text-[#AFA9EC]">{formatOffer(offer.offer_usd)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_PILL[offer.status]}`}>{offer.status}</span>
                </div>
                <p className="text-xs text-[#8a88a0]">
                    <a href={`mailto:${offer.email}?subject=${encodeURIComponent("Your sticker sponsorship offer")}`} className="text-[#AFA9EC] hover:underline">{offer.email}</a>
                    {" · wants "}{spotLabel(offer.spot as SponsorSpot)}{" · "}{formatDate(offer.created_at)}
                    {offer.file_name && <>{" · "}{offer.file_name}</>}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Spot to place this sticker on" value={target} onChange={(e) => setTarget(e.target.value as StickerSlotId)}
                        className="bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-xs text-[#c4c0d8] cursor-pointer">
                        {STICKER_SLOTS.map((slot) => <option key={slot.id} value={slot.id}>{spotName(slot)}</option>)}
                    </select>
                    <button type="button" className={secondaryButton} disabled={busy || disabled || !offer.fileUrl} onClick={place}>Place on spot</button>
                    {offer.status !== "accepted" && <button type="button" className={secondaryButton} disabled={busy || disabled} onClick={() => patch({ status: "accepted" }, "Couldn't update the offer.")}>Accept</button>}
                    {offer.status !== "declined" && <button type="button" className={secondaryButton} disabled={busy || disabled} onClick={() => patch({ status: "declined" }, "Couldn't update the offer.")}>Decline</button>}
                    {offer.fileUrl && <a href={`${offer.fileUrl}&download=1`} className={secondaryButton}>Download</a>}
                    <ConfirmButton label="Delete" confirmLabel="Click again to delete" onConfirm={remove} disabled={busy || disabled} />
                </div>
                <div className="flex gap-2 items-start">
                    <textarea aria-label={`Notes on the offer from ${offer.affiliation}`} rows={1} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notes (only you see these)" className={`${input} resize-y text-xs`} />
                    {notes !== offer.notes && <button type="button" className={secondaryButton} disabled={busy || disabled} onClick={() => patch({ notes }, "Couldn't save the note.")}>Save note</button>}
                </div>
                {error && <p role="alert" className="text-xs text-pink-400">{error}</p>}
            </div>
        </li>
    )
}
