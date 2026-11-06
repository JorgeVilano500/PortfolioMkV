/**
 * Draws Studio's sticker designs onto canvases: the artwork (with its white
 * background cleared, if asked), the finished sticker, its cut line, and the
 * 300 DPI PNG for printing. The maths is in lib/sticker-print.ts.
 *
 * Every function returns null where there's no 2D canvas (jsdom in tests).
 */
import {
    PRINT_DPI,
    contourMask,
    cutOutline,
    distanceToInk,
    layoutSticker,
    removeEdgeWhite,
    withPngDpi,
    type StickerDesign,
    type StickerLayout,
} from "@/lib/sticker-print"

/** The editor works on artwork no bigger than this on its longest side: plenty for 300 DPI up to 20 cm. */
const ARTWORK_MAX = 2400
/** The live preview stays under this many pixels on its longest side; exports always use the full 300 DPI. */
const PREVIEW_MAX = 1200
/** Cricut's cut-line colour in Design Space, so the overlay reads the same way. */
const CUT_LINE = "#ff2bd6"

function makeCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas")
    canvas.width  = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    return canvas
}

/** Load an image from a same-origin or local (blob:) URL, so the canvas stays readable. */
export function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.decoding = "async"
        image.onload  = () => resolve(image)
        image.onerror = () => reject(new Error("The image couldn't be read."))
        image.src = url
    })
}

/** The artwork as a canvas, at most ARTWORK_MAX px across, its edge-connected white cleared if asked. */
export function prepareArtwork(image: HTMLImageElement, removeWhite: boolean, tolerance: number): HTMLCanvasElement | null {
    const scale  = Math.min(1, ARTWORK_MAX / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = makeCanvas(image.naturalWidth * scale, image.naturalHeight * scale)
    const ctx    = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    if (removeWhite) {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
        removeEdgeWhite(pixels.data, canvas.width, canvas.height, tolerance)
        ctx.putImageData(pixels, 0, 0)
    }
    return canvas
}

/** The DPI for the live preview: the full 300, unless that would be too big to redraw smoothly. */
export function previewDpi(design: Pick<StickerDesign, "widthMm" | "heightMm">): number {
    const longestInches = Math.max(design.widthMm, design.heightMm) / 25.4
    return Math.min(PRINT_DPI, Math.floor(PREVIEW_MAX / longestInches))
}

/** `colour` through an alpha mask, as a canvas to draw over the sticker. */
function maskLayer(mask: Uint8ClampedArray, width: number, height: number, colour: string): HTMLCanvasElement | null {
    const canvas = makeCanvas(width, height)
    const ctx    = canvas.getContext("2d")
    if (!ctx) return null
    ctx.fillStyle = colour
    ctx.fillRect(0, 0, width, height)
    const pixels = ctx.getImageData(0, 0, width, height)
    for (let i = 0; i < mask.length; i++) pixels.data[i * 4 + 3] = mask[i]
    ctx.putImageData(pixels, 0, 0)
    return canvas
}

/** Add the sticker's outline, `inset` pixels in from its edge, to the current path. */
function addShape(ctx: CanvasRenderingContext2D, layout: StickerLayout, design: StickerDesign, inset: number) {
    const width  = Math.max(1, layout.width - 2 * inset)
    const height = Math.max(1, layout.height - 2 * inset)
    if (design.shape === "circle") {
        ctx.moveTo(layout.width / 2 + width / 2, layout.height / 2)
        ctx.ellipse(layout.width / 2, layout.height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
    } else {
        ctx.roundRect(inset, inset, width, height, Math.max(0, layout.corner - inset))
    }
}

/**
 * The finished sticker at `dpi`, layer by layer: the sticker colour filling
 * the shape, the edge ring, then the artwork. Outside the shape stays
 * transparent, which is where Design Space cuts.
 */
export function renderSticker(artwork: HTMLCanvasElement, design: StickerDesign, dpi: number = PRINT_DPI): { canvas: HTMLCanvasElement; layout: StickerLayout } | null {
    const layout = layoutSticker(design, artwork, dpi)
    const { width, height, edge, padding, art } = layout
    const canvas = makeCanvas(width, height)
    const ctx    = canvas.getContext("2d")
    if (!ctx) return null
    ctx.imageSmoothingQuality = "high"

    if (design.shape === "contour") {
        // The artwork alone first, to find its outline; the shape grows out from it.
        const ink    = makeCanvas(width, height)
        const inkCtx = ink.getContext("2d", { willReadFrequently: true })
        if (!inkCtx) return null
        inkCtx.imageSmoothingQuality = "high"
        inkCtx.drawImage(artwork, art.x, art.y, art.width, art.height)
        const pixels = inkCtx.getImageData(0, 0, width, height).data
        const alpha  = new Uint8ClampedArray(width * height)
        for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]
        const distance = distanceToInk(alpha, width, height)
        const outer    = contourMask(distance, padding + edge)
        if (design.fill) {
            const layer = maskLayer(outer, width, height, design.fill)
            if (layer) ctx.drawImage(layer, 0, 0)
        }
        if (design.edge && edge > 0) {
            const inner = contourMask(distance, padding)
            const ring  = new Uint8ClampedArray(outer.length)
            for (let i = 0; i < ring.length; i++) ring[i] = Math.max(0, outer[i] - inner[i])
            const layer = maskLayer(ring, width, height, design.edge)
            if (layer) ctx.drawImage(layer, 0, 0)
        }
        ctx.drawImage(ink, 0, 0)
        return { canvas, layout }
    }

    if (design.fill) {
        ctx.beginPath()
        addShape(ctx, layout, design, 0)
        ctx.fillStyle = design.fill
        ctx.fill()
    }
    if (design.edge && edge > 0) {
        ctx.beginPath()
        addShape(ctx, layout, design, 0)
        addShape(ctx, layout, design, edge)
        ctx.fillStyle = design.edge
        ctx.fill("evenodd")
    }
    ctx.save()
    ctx.beginPath()
    addShape(ctx, layout, design, edge)
    ctx.clip()
    ctx.drawImage(artwork, art.x, art.y, art.width, art.height)
    ctx.restore()
    return { canvas, layout }
}

/** The cut line over a rendered sticker: the edge of its opaque pixels, in Design Space's cut-line pink. */
export function renderCutLine(sticker: HTMLCanvasElement): HTMLCanvasElement | null {
    const ctx = sticker.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    const { width, height } = sticker
    const pixels = ctx.getImageData(0, 0, width, height).data
    const alpha  = new Uint8ClampedArray(width * height)
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]
    const line = cutOutline(alpha, width, height)
    const mask = new Uint8ClampedArray(line.length)
    for (let i = 0; i < line.length; i++) mask[i] = line[i] ? 255 : 0
    return maskLayer(mask, width, height, CUT_LINE)
}

/** The sticker as a PNG that says 300 DPI, ready for Design Space or a printer. */
export async function stickerPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!blob) return null
    const bytes = withPngDpi(new Uint8Array(await blob.arrayBuffer()), PRINT_DPI)
    return new Blob([bytes.slice()], { type: "image/png" })
}
