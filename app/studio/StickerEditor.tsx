"use client"

/**
 * Studio's sticker editor: a sponsor's file, turned into a print-ready
 * sticker. Zoom in to check it, change its layers (the sticker colour, an
 * edge ring, the artwork itself), then download it for Cricut Design Space,
 * print it at its real size, try it on the 3D laptop, or save it to a spot.
 *
 * Cricut has no public API for sending a job to the machine, so the download
 * is the hand-off: a PNG at the sticker's real size and 300 DPI, transparent
 * outside its shape, which is where Design Space's Print Then Cut cuts.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Modal } from "@/components/features/Modal"
import { STICKER_COLORS, STICKER_SLOTS, spotName, type StickerSlotId } from "@/lib/laptop-stickers"
import {
    DESIGN_LIMITS,
    PRINT_DPI,
    STICKER_PRINT_MM,
    artworkDpi,
    clampDesign,
    defaultDesign,
    formatPrintSize,
    layoutSticker,
    printQuality,
    stickerFileName,
    type StickerDesign,
    type StickerShape,
} from "@/lib/sticker-print"
import { loadImage, prepareArtwork, previewDpi, renderCutLine, renderSticker, stickerPng } from "./sticker-canvas"

/** Where the artwork comes from: an offer's file, or a spot's current image. */
export type EditorSource = {
    url:     string
    /** The sponsor or affiliation, for file names and labels. */
    label:   string
    spotId:  StickerSlotId
    /** Set when the artwork is an offer's file (saving places that offer on the spot). */
    offerId: string | null
}

/** Everything the editor is working on, kept by the panel so "Back to editor" picks up where you left off. */
export type EditorSession = { source: EditorSource; design: StickerDesign; spotId: StickerSlotId; customSize: boolean }

export function newSession(source: EditorSource): EditorSession {
    const surface = STICKER_SLOTS.find((slot) => slot.id === source.spotId)?.surface ?? "lid"
    return { source, design: defaultDesign(surface), spotId: source.spotId, customSize: false }
}

type StickerEditorProps = {
    session:   EditorSession
    open:      boolean
    onChange:  (session: EditorSession) => void
    onClose:   () => void
    /** Show the finished sticker on the 3D laptop, on `spotId`, without saving it. */
    onPreview: (png: Blob, spotId: StickerSlotId) => void
    /** Save the finished sticker as `spotId`'s image. Resolves to an error message, or null once saved. */
    onSave:    (png: Blob, spotId: StickerSlotId) => Promise<string | null>
    canSave:   boolean
}

const SHAPES: { value: StickerShape; label: string }[] = [
    { value: "rounded", label: "Rounded" },
    { value: "circle",  label: "Circle" },
    { value: "contour", label: "Follow the logo" },
]

const SWATCHES: { value: string | null; label: string }[] = [
    { value: null,                          label: "Clear" },
    { value: "#ffffff",                     label: "White" },
    { value: "#111114",                     label: "Black" },
    { value: STICKER_COLORS.purple.fill,    label: "Violet" },
    { value: STICKER_COLORS.green.fill,     label: "Green" },
    { value: STICKER_COLORS.pink.fill,      label: "Pink" },
]

const ZOOM = { min: 0.5, max: 16 } as const
const QUALITY_TEXT = {
    sharp: { label: "sharp",          tone: "text-emerald-300" },
    ok:    { label: "fine",           tone: "text-amber-300" },
    low:   { label: "may print soft", tone: "text-pink-300" },
} as const

const sectionTitle = "text-[11px] tracking-widest uppercase text-[#555370] font-medium"
const buttonBase   = "text-sm px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
const primary      = `${buttonBase} bg-[#7c6dff] hover:bg-[#6a5de8] text-white font-medium`
const secondary    = `${buttonBase} border border-[#2a2840] hover:bg-[#1e1c2e] text-[#c4c0d8]`
const toolButton   = "text-xs px-2.5 py-1.5 rounded-lg border border-[#2a2840] text-[#c4c0d8] hover:bg-[#1e1c2e] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"

export function StickerEditor({ session, open, onChange, onClose, onPreview, onSave, canSave }: StickerEditorProps) {
    const { source, design, spotId, customSize } = session
    const spot = STICKER_SLOTS.find((slot) => slot.id === spotId) ?? STICKER_SLOTS[0]

    const [image, setImage]       = useState<HTMLImageElement | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    // zoom 1 fits the sticker in the view; x and y move it from the centre, in CSS pixels.
    const [camera, setCamera]     = useState({ zoom: 1, x: 0, y: 0 })
    const [showCut, setShowCut]   = useState(true)
    const [copies, setCopies]     = useState(1)
    const [busy, setBusy]         = useState<"save" | "preview" | "download" | "print" | null>(null)
    const [status, setStatus]     = useState<{ tone: "error" | "ok"; text: string } | null>(null)
    const [printUrl, setPrintUrl] = useState<string | null>(null)
    const [view, setView]         = useState({ width: 0, height: 0 })

    const wellRef    = useRef<HTMLDivElement>(null)
    const stickerRef = useRef<HTMLCanvasElement>(null)
    const cutRef     = useRef<HTMLCanvasElement>(null)

    const sizeMm = { width: design.widthMm, height: design.heightMm }
    const update = (next: Partial<StickerDesign>) => onChange({ ...session, design: clampDesign({ ...design, ...next }) })

    // The sponsor's file, once per source.
    useEffect(() => {
        let cancelled = false
        loadImage(source.url)
            .then((loaded) => { if (!cancelled) { setImage(loaded); setLoadError(null) } })
            .catch(() => { if (!cancelled) setLoadError("The sticker file couldn't be loaded. Try again, or download the original.") })
        return () => { cancelled = true }
    }, [source.url])

    // Redraw from a deferred copy, so dragging a slider stays smooth on big stickers.
    const drawn = useDeferredValue(design)
    const artwork = useMemo(() => (image ? prepareArtwork(image, drawn.removeWhite, drawn.whiteTolerance) : null), [image, drawn.removeWhite, drawn.whiteTolerance])
    const rendered = useMemo(() => (artwork ? renderSticker(artwork, drawn, previewDpi(drawn)) : null), [artwork, drawn])
    const cutLine = useMemo(() => (rendered && showCut ? renderCutLine(rendered.canvas) : null), [rendered, showCut])

    // The print layout, from the original file's pixels, for the size and sharpness readout.
    const print = useMemo(() => layoutSticker(design, image ? { width: image.naturalWidth, height: image.naturalHeight } : { width: 1, height: 1 }, PRINT_DPI), [design, image])
    const dpi = image ? artworkDpi(image.naturalWidth, print.art) : null
    const quality = dpi ? QUALITY_TEXT[printQuality(dpi)] : null

    // Copy the rendered sticker (and its cut line) onto the canvases on screen.
    useEffect(() => {
        const paint = (target: HTMLCanvasElement | null, from: HTMLCanvasElement | null, size: HTMLCanvasElement | null) => {
            if (!target || !size) return
            target.width  = size.width
            target.height = size.height
            const ctx = target.getContext("2d")
            if (!ctx) return
            ctx.clearRect(0, 0, target.width, target.height)
            if (from) ctx.drawImage(from, 0, 0)
        }
        paint(stickerRef.current, rendered?.canvas ?? null, rendered?.canvas ?? null)
        paint(cutRef.current, cutLine, rendered?.canvas ?? null)
    }, [rendered, cutLine, open])

    // The view's size, for fitting the sticker.
    useEffect(() => {
        const well = wellRef.current
        if (!open || !well) return
        const observer = new ResizeObserver(() => setView({ width: well.clientWidth, height: well.clientHeight }))
        observer.observe(well)
        return () => observer.disconnect()
    }, [open])

    const pixelWidth  = rendered?.canvas.width ?? 1
    const pixelHeight = rendered?.canvas.height ?? 1
    const fit   = view.width && view.height ? Math.min(view.width / pixelWidth, view.height / pixelHeight) * 0.86 : 1
    const scale = fit * camera.zoom

    /** Zoom by `factor`, keeping the point (x, y), measured from the view's centre, where it is. */
    const zoomBy = (factor: number, x = 0, y = 0) => setCamera((c) => {
        const zoom  = Math.min(ZOOM.max, Math.max(ZOOM.min, c.zoom * factor))
        const ratio = zoom / c.zoom
        return { zoom, x: x - (x - c.x) * ratio, y: y - (y - c.y) * ratio }
    })
    const moveBy = (dx: number, dy: number) => setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }))
    const fitView = () => setCamera({ zoom: 1, x: 0, y: 0 })

    // Wheel zoom needs a non-passive listener, so the modal doesn't scroll instead.
    useEffect(() => {
        const well = wellRef.current
        if (!open || !well) return
        const onWheel = (event: WheelEvent) => {
            event.preventDefault()
            const box    = well.getBoundingClientRect()
            const factor = Math.exp(-event.deltaY * 0.0015)
            setCamera((c) => {
                const zoom  = Math.min(ZOOM.max, Math.max(ZOOM.min, c.zoom * factor))
                const ratio = zoom / c.zoom
                const x = event.clientX - box.left - box.width / 2
                const y = event.clientY - box.top - box.height / 2
                return { zoom, x: x - (x - c.x) * ratio, y: y - (y - c.y) * ratio }
            })
        }
        well.addEventListener("wheel", onWheel, { passive: false })
        return () => well.removeEventListener("wheel", onWheel)
    }, [open])

    // Drag to move; two fingers to pinch.
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const last = pointers.current.get(event.pointerId)
        if (!last) return
        const now = { x: event.clientX, y: event.clientY }
        if (pointers.current.size === 2) {
            const [other] = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId).map(([, p]) => p)
            const before = Math.hypot(last.x - other.x, last.y - other.y)
            const after  = Math.hypot(now.x - other.x, now.y - other.y)
            if (before > 0) zoomBy(after / before)
        } else {
            moveBy(now.x - last.x, now.y - last.y)
        }
        pointers.current.set(event.pointerId, now)
    }
    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId) }
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = 40
        const moves: Record<string, () => void> = {
            "+":          () => zoomBy(1.25),
            "=":          () => zoomBy(1.25),
            "-":          () => zoomBy(1 / 1.25),
            "0":          fitView,
            "ArrowLeft":  () => moveBy(step, 0),
            "ArrowRight": () => moveBy(-step, 0),
            "ArrowUp":    () => moveBy(0, step),
            "ArrowDown":  () => moveBy(0, -step),
        }
        const move = moves[event.key]
        if (!move) return
        event.preventDefault()
        move()
    }

    const chooseSpot = (value: string) => {
        if (value === "custom") return onChange({ ...session, customSize: true })
        const next = STICKER_SLOTS.find((slot) => slot.id === value)
        if (!next) return
        const size = STICKER_PRINT_MM[next.surface]
        onChange({ ...session, spotId: next.id, customSize: false, design: clampDesign({ ...design, widthMm: size.width, heightMm: size.height }) })
    }

    /** The sticker at full print resolution, as a 300 DPI PNG. */
    const finishedPng = async () => {
        if (!artwork) return null
        const full = renderSticker(artwork, design, PRINT_DPI)
        return full ? stickerPng(full.canvas) : null
    }
    const withPng = async (kind: NonNullable<typeof busy>, act: (png: Blob) => Promise<void> | void) => {
        setBusy(kind)
        setStatus(null)
        try {
            const png = await finishedPng()
            if (!png) return setStatus({ tone: "error", text: "This browser couldn't draw the sticker." })
            await act(png)
        } finally {
            setBusy(null)
        }
    }

    const download = () => withPng("download", (png) => {
        const url  = URL.createObjectURL(png)
        const link = document.createElement("a")
        link.href     = url
        link.download = stickerFileName(source.label, spotName(spot))
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
        setStatus({ tone: "ok", text: `Downloaded ${link.download}. In Design Space, size it to ${formatPrintSize(sizeMm)}.` })
    })
    const printSheet = () => withPng("print", (png) => setPrintUrl(URL.createObjectURL(png)))
    const preview = () => withPng("preview", (png) => onPreview(png, spotId))
    const save = () => withPng("save", async (png) => {
        const error = await onSave(png, spotId)
        if (error) setStatus({ tone: "error", text: error })
    })

    return (
        <>
            <Modal isOpen={open} onClose={onClose} title={`Sticker: ${source.label}`} variant="dark" size="xl" bodyClassName="p-0!">
                <div className="flex flex-col lg:flex-row min-h-0">
                    {/* ─── The sticker ─────────────────────────────────────── */}
                    <div className="flex-1 min-w-0 p-4 flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className={toolButton} onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
                            <span className="text-xs text-[#c4c0d8] tabular-nums w-14 text-center" aria-live="polite">{Math.round(camera.zoom * 100)}%</span>
                            <button type="button" className={toolButton} onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
                            <button type="button" className={toolButton} onClick={fitView}>Fit</button>
                            <button type="button" className={toolButton} onClick={() => setCamera({ zoom: Math.min(ZOOM.max, Math.max(ZOOM.min, 1 / fit)), x: 0, y: 0 })}>Actual pixels</button>
                            <label className="ml-auto flex items-center gap-1.5 text-xs text-[#c4c0d8] cursor-pointer">
                                <input type="checkbox" checked={showCut} onChange={(e) => setShowCut(e.target.checked)} className="accent-[#ff2bd6]" />
                                Cut line
                            </label>
                        </div>
                        <div
                            ref={wellRef}
                            role="img"
                            tabIndex={0}
                            aria-label={`Preview of the sticker for ${spotName(spot)} at ${Math.round(camera.zoom * 100)}%`}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                            onKeyDown={onKeyDown}
                            onDoubleClick={fitView}
                            className="sticker-checkerboard relative h-[44vh] min-h-64 lg:h-[52vh] rounded-xl border border-[#2a2840] overflow-hidden touch-none cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60"
                        >
                            <div
                                className="absolute left-1/2 top-1/2"
                                style={{ width: pixelWidth, height: pixelHeight, transform: `translate(-50%, -50%) translate(${camera.x}px, ${camera.y}px) scale(${scale})` }}
                            >
                                <canvas ref={stickerRef} aria-hidden="true" className="absolute inset-0 w-full h-full" style={{ imageRendering: scale > 2 ? "pixelated" : "auto" }} />
                                <canvas ref={cutRef} aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" style={{ imageRendering: scale > 2 ? "pixelated" : "auto" }} />
                            </div>
                            {!image && (
                                <p className="absolute inset-0 flex items-center justify-center text-sm text-[#8a88a0] p-6 text-center">
                                    {loadError ?? "Loading the sticker…"}
                                </p>
                            )}
                        </div>
                        <p className="text-xs text-[#8a88a0]">
                            Prints at {formatPrintSize(sizeMm)} · {print.width} × {print.height} px at {PRINT_DPI} DPI
                            {dpi && quality && (
                                <> · artwork at about {dpi} DPI, <span className={quality.tone}>{quality.label}</span></>
                            )}
                        </p>
                        {quality?.label === QUALITY_TEXT.low.label && (
                            <p className="text-xs text-pink-300">The sponsor&apos;s file is small for this size. Ask for a bigger one, or shrink the artwork.</p>
                        )}
                        {/* What to do with it: right under the sticker, so it's never below the fold */}
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className={primary} disabled={!artwork || busy !== null} onClick={download}>
                                {busy === "download" ? "Preparing…" : "Download for Cricut (PNG, 300 DPI)"}
                            </button>
                            <button type="button" className={secondary} disabled={!artwork || busy !== null} onClick={printSheet}>
                                {busy === "print" ? "Preparing…" : "Print at real size"}
                            </button>
                            <label className="flex items-center gap-1.5 text-xs text-[#8a88a0]">
                                Copies
                                <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                                    className="w-14 bg-[#0a0a0f] border border-[#2a2840] rounded-lg px-2 py-1.5 text-sm text-[#f0eeff]" />
                            </label>
                            <button type="button" className={secondary} disabled={!artwork || busy !== null} onClick={preview}>
                                {busy === "preview" ? "Preparing…" : "Preview on the laptop"}
                            </button>
                            <button type="button" className={secondary} disabled={!artwork || busy !== null || !canSave} onClick={save}>
                                {busy === "save" ? "Saving…" : `Save as ${spotName(spot)}'s sticker`}
                            </button>
                        </div>
                        {status && <p role={status.tone === "error" ? "alert" : "status"} className={`text-xs ${status.tone === "error" ? "text-pink-400" : "text-emerald-300"}`}>{status.text}</p>}
                        <details className="text-xs text-[#8a88a0] leading-relaxed">
                            <summary className="cursor-pointer text-[#c4c0d8]">Cutting it on a Cricut</summary>
                            <ol className="list-decimal pl-4 mt-2 flex flex-col gap-1.5">
                                <li>In Cricut Design Space, choose Upload, then Upload Image, and pick the downloaded PNG.</li>
                                <li>Its outside is already transparent, so skip background removal and save it as a Print Then Cut image.</li>
                                <li>On the canvas, set its size to {formatPrintSize(sizeMm)}.</li>
                                <li>Make It, print on sticker paper, and load the mat. The machine cuts along the pink line shown here.</li>
                            </ol>
                            <p className="mt-2">Cricut doesn&apos;t offer a way for websites to send jobs to the machine, so the file goes through Design Space. &ldquo;Print at real size&rdquo; is for any printer and cutting by hand.</p>
                        </details>
                    </div>

                    {/* ─── Controls ────────────────────────────────────────── */}
                    <div className="lg:w-88 shrink-0 border-t lg:border-t-0 lg:border-l border-[#2a2840] p-4 flex flex-col gap-5 lg:max-h-[80vh] lg:overflow-y-auto">
                        <Section title="Size">
                            <select aria-label="Spot and size" value={customSize ? "custom" : spotId} onChange={(e) => chooseSpot(e.target.value)}
                                className="w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#c4c0d8] cursor-pointer">
                                {STICKER_SLOTS.map((slot) => {
                                    const size = STICKER_PRINT_MM[slot.surface]
                                    return <option key={slot.id} value={slot.id}>{spotName(slot)} ({size.width / 10} × {size.height / 10} cm)</option>
                                })}
                                <option value="custom">Custom size…</option>
                            </select>
                            {customSize && (
                                <div className="grid grid-cols-2 gap-2">
                                    <NumberField label="Width (mm)" value={design.widthMm} limits={DESIGN_LIMITS.sizeMm} onChange={(widthMm) => update({ widthMm })} />
                                    <NumberField label="Height (mm)" value={design.heightMm} limits={DESIGN_LIMITS.sizeMm} onChange={(heightMm) => update({ heightMm })} />
                                </div>
                            )}
                        </Section>

                        <Section title="Shape">
                            <div role="radiogroup" aria-label="Sticker shape" className="flex flex-wrap gap-1.5">
                                {SHAPES.map((shape) => (
                                    <button key={shape.value} type="button" role="radio" aria-checked={design.shape === shape.value} onClick={() => update({ shape: shape.value })}
                                        className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${design.shape === shape.value ? "border-[#7c6dff] bg-[#7c6dff]/20 text-white" : "border-[#2a2840] text-[#8a88a0] hover:text-[#c4c0d8]"}`}>
                                        {shape.label}
                                    </button>
                                ))}
                            </div>
                            {design.shape === "rounded" && <Slider label="Corners" unit="mm" value={design.cornerMm} limits={DESIGN_LIMITS.cornerMm} step={0.5} onChange={(cornerMm) => update({ cornerMm })} />}
                            <Slider label={design.shape === "contour" ? "Margin round the logo" : "Margin"} unit="mm" value={design.paddingMm} limits={DESIGN_LIMITS.paddingMm} step={0.5} onChange={(paddingMm) => update({ paddingMm })} />
                        </Section>

                        <Section title="Layer 1 · Sticker colour">
                            <ColourChoice label="Sticker colour" value={design.fill} onChange={(fill) => update({ fill })} />
                            {!design.fill && !design.edge && (
                                <p className="text-xs text-[#8a88a0]">With no colour, a Cricut cuts right round the artwork itself.</p>
                            )}
                        </Section>

                        <Section title="Layer 2 · Edge">
                            <label className="flex items-center gap-2 text-sm text-[#c4c0d8] cursor-pointer">
                                <input type="checkbox" checked={design.edge !== null} onChange={(e) => update({ edge: e.target.checked ? "#7c6dff" : null })} className="accent-[#7c6dff]" />
                                A coloured edge
                            </label>
                            {design.edge !== null && (
                                <>
                                    <ColourChoice label="Edge colour" value={design.edge} allowClear={false} onChange={(edge) => update({ edge })} />
                                    <Slider label="Edge width" unit="mm" value={design.edgeMm} limits={DESIGN_LIMITS.edgeMm} step={0.25} onChange={(edgeMm) => update({ edgeMm })} />
                                </>
                            )}
                        </Section>

                        <Section title="Layer 3 · Artwork">
                            <Slider label="Size" unit="%" value={Math.round(design.scale * 100)} limits={{ min: DESIGN_LIMITS.scale.min * 100, max: DESIGN_LIMITS.scale.max * 100 }} step={1} onChange={(percent) => update({ scale: percent / 100 })} />
                            <Slider label="Move left / right" unit="mm" value={design.offsetXMm} limits={DESIGN_LIMITS.offsetMm} step={0.5} onChange={(offsetXMm) => update({ offsetXMm })} />
                            <Slider label="Move up / down" unit="mm" value={design.offsetYMm} limits={DESIGN_LIMITS.offsetMm} step={0.5} onChange={(offsetYMm) => update({ offsetYMm })} />
                            <label className="flex items-center gap-2 text-sm text-[#c4c0d8] cursor-pointer">
                                <input type="checkbox" checked={design.removeWhite} onChange={(e) => update({ removeWhite: e.target.checked })} className="accent-[#7c6dff]" />
                                Remove the white background
                            </label>
                            {design.removeWhite && <Slider label="How close to white" unit="" value={design.whiteTolerance} limits={DESIGN_LIMITS.tolerance} step={1} onChange={(whiteTolerance) => update({ whiteTolerance })} />}
                            <button type="button" className="self-start text-xs text-[#AFA9EC] hover:underline cursor-pointer" onClick={() => onChange({ ...session, design: defaultDesign(spot.surface), customSize: false })}>
                                Reset the design
                            </button>
                        </Section>

                    </div>
                </div>
            </Modal>
            {printUrl && <PrintSheet url={printUrl} design={design} copies={copies} onDone={() => { URL.revokeObjectURL(printUrl); setPrintUrl(null) }} />}
        </>
    )
}

// ─── Printing ─────────────────────────────────────────────────────────────────

/**
 * The sticker at its real size, `copies` times, printed on its own: while it's
 * mounted, globals.css hides everything else from the printer
 * (body.printing-sticker). Prints once its images have loaded, then calls onDone.
 */
function PrintSheet({ url, design, copies, onDone }: { url: string; design: StickerDesign; copies: number; onDone: () => void }) {
    const sheetRef = useRef<HTMLDivElement>(null)
    const done = useRef(onDone)
    useEffect(() => { done.current = onDone })
    useEffect(() => {
        document.body.classList.add("printing-sticker")
        const finish = () => {
            document.body.classList.remove("printing-sticker")
            done.current()
        }
        let cancelled = false
        const images = [...(sheetRef.current?.querySelectorAll("img") ?? [])]
        Promise.all(images.map((img) => img.decode().catch(() => undefined))).then(() => {
            if (cancelled) return
            window.addEventListener("afterprint", finish, { once: true })
            window.print()
        })
        return () => {
            cancelled = true
            window.removeEventListener("afterprint", finish)
            document.body.classList.remove("printing-sticker")
        }
    }, [])
    return createPortal(
        <div ref={sheetRef} className="sticker-print-sheet" aria-hidden="true">
            {Array.from({ length: copies }, (_, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- a local print file, sized in millimetres
                <img key={i} src={url} alt="" style={{ width: `${design.widthMm}mm`, height: `${design.heightMm}mm` }} />
            ))}
        </div>,
        document.body,
    )
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2.5">
            <h3 className={sectionTitle}>{title}</h3>
            {children}
        </section>
    )
}

function Slider({ label, unit, value, limits, step, onChange }: { label: string; unit: string; value: number; limits: { min: number; max: number }; step: number; onChange: (value: number) => void }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-[#c4c0d8]">
            <span className="flex justify-between">
                {label}
                <span className="tabular-nums text-[#8a88a0]">{+value.toFixed(2)}{unit && ` ${unit}`}</span>
            </span>
            <input type="range" min={limits.min} max={limits.max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
                className="lid-slider w-full cursor-pointer" style={{ ["--fill" as string]: `${((value - limits.min) / (limits.max - limits.min)) * 100}%` }} />
        </label>
    )
}

function NumberField({ label, value, limits, onChange }: { label: string; value: number; limits: { min: number; max: number }; onChange: (value: number) => void }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-[#c4c0d8]">
            {label}
            <input type="number" min={limits.min} max={limits.max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))}
                className="bg-[#0a0a0f] border border-[#2a2840] rounded-lg px-2 py-1.5 text-sm text-[#f0eeff]" />
        </label>
    )
}

function ColourChoice({ label, value, onChange, allowClear = true }: { label: string; value: string | null; onChange: (value: string | null) => void; allowClear?: boolean }) {
    const custom = value && !SWATCHES.some((swatch) => swatch.value === value)
    return (
        <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.filter((swatch) => allowClear || swatch.value).map((swatch) => {
                const checked = swatch.value === value
                return (
                    <button key={swatch.label} type="button" role="radio" aria-checked={checked} aria-label={swatch.label} title={swatch.label} onClick={() => onChange(swatch.value)}
                        className={`w-7 h-7 rounded-lg border cursor-pointer ${checked ? "ring-2 ring-[#7c6dff] ring-offset-2 ring-offset-[#13121c] border-transparent" : "border-[#3a3850]"} ${swatch.value ? "" : "sticker-checkerboard"}`}
                        style={swatch.value ? { background: swatch.value } : undefined} />
                )
            })}
            <label className={`relative w-7 h-7 rounded-lg border cursor-pointer overflow-hidden ${custom ? "ring-2 ring-[#7c6dff] ring-offset-2 ring-offset-[#13121c] border-transparent" : "border-[#3a3850]"}`}
                title="Another colour" style={{ background: custom ? value! : "conic-gradient(#ED93B1, #7c6dff, #97C459, #ED93B1)" }}>
                <span className="sr-only">Another colour</span>
                <input type="color" value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
        </div>
    )
}
