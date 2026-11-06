/**
 * Print-ready stickers: the maths behind Studio's sticker editor, kept free
 * of the DOM so it can be tested without a canvas.
 *
 * - Sizes: each spot's real sticker size (LAPTOP_MODEL.md §1) at 300 DPI.
 * - Layout: where the sticker colour, the edge and the artwork go.
 * - Background removal: near-white connected to the edges becomes transparent.
 * - Contour shapes: an exact distance field from the artwork's ink, so the
 *   sticker can follow the logo's outline.
 * - The cut line: the edge of the opaque pixels, which is where Cricut Design
 *   Space's Print Then Cut cuts a transparent PNG.
 * - PNG output: a pHYs chunk so the file says 300 DPI.
 *
 * Cricut has no public API for sending a job to the machine; the editor's
 * "Download for Cricut" file is what Design Space's upload expects.
 */
import type { SpotSurface } from "./laptop-stickers"

export const PRINT_DPI   = 300
export const MM_PER_INCH = 25.4

/** The printed size of a spot's sticker, in millimetres (LAPTOP_MODEL.md §1). */
export const STICKER_PRINT_MM: Record<SpotSurface, { width: number; height: number }> = {
    "lid":       { width: 65, height: 65 },
    "palm-rest": { width: 50, height: 35 },
}

/** Millimetres to pixels at `dpi`. */
export function mmToPx(mm: number, dpi: number = PRINT_DPI): number {
    return Math.max(1, Math.round((mm / MM_PER_INCH) * dpi))
}

/** "6.5 × 6.5 cm (2.56 × 2.56 in)". */
export function formatPrintSize({ width, height }: { width: number; height: number }): string {
    const cm = (mm: number) => `${+(mm / 10).toFixed(2)}`
    const inch = (mm: number) => (mm / MM_PER_INCH).toFixed(2)
    return `${cm(width)} × ${cm(height)} cm (${inch(width)} × ${inch(height)} in)`
}

// ─── Design ───────────────────────────────────────────────────────────────────

export type StickerShape = "rounded" | "circle" | "contour"

/**
 * Everything the editor lets you change, as layers from the bottom up: the
 * sticker colour filling the shape, an optional edge ring round it, then the
 * artwork. Lengths are in millimetres.
 */
export type StickerDesign = {
    widthMm:        number
    heightMm:       number
    shape:          StickerShape
    /** Corner radius of a rounded sticker. */
    cornerMm:       number
    /** The sticker colour, filling the whole shape. null leaves it clear (unprinted paper). */
    fill:           string | null
    /** A ring of colour round the edge, inside the cut line. null for none. */
    edge:           string | null
    edgeMm:         number
    /** Space between the artwork and the edge of the sticker (a contour sticker's margin). */
    paddingMm:      number
    /** Artwork size: 1 fits the space; up to 3 zooms in, down to 0.2 shrinks. */
    scale:          number
    offsetXMm:      number
    offsetYMm:      number
    /** Turn near-white connected to the image's edges transparent (logos on a white background). */
    removeWhite:    boolean
    /** 0–100: how far from pure white still counts as background. */
    whiteTolerance: number
}

export const DESIGN_LIMITS = {
    sizeMm:    { min: 15, max: 200 },
    cornerMm:  { min: 0, max: 30 },
    edgeMm:    { min: 0, max: 8 },
    paddingMm: { min: 0, max: 15 },
    scale:     { min: 0.2, max: 3 },
    offsetMm:  { min: -40, max: 40 },
    tolerance: { min: 0, max: 100 },
} as const

/** A classic die-cut sticker for the spot: the artwork on white, with a white margin, nothing else changed. */
export function defaultDesign(surface: SpotSurface): StickerDesign {
    const size = STICKER_PRINT_MM[surface]
    return {
        widthMm:        size.width,
        heightMm:       size.height,
        shape:          "rounded",
        cornerMm:       surface === "lid" ? 9 : 6,
        fill:           "#ffffff",
        edge:           null,
        edgeMm:         1,
        paddingMm:      2.5,
        scale:          1,
        offsetXMm:      0,
        offsetYMm:      0,
        removeWhite:    false,
        whiteTolerance: 12,
    }
}

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))

/** The design with every number inside the editor's limits. */
export function clampDesign(design: StickerDesign): StickerDesign {
    return {
        ...design,
        widthMm:        clamp(design.widthMm, DESIGN_LIMITS.sizeMm),
        heightMm:       clamp(design.heightMm, DESIGN_LIMITS.sizeMm),
        cornerMm:       clamp(design.cornerMm, DESIGN_LIMITS.cornerMm),
        edgeMm:         clamp(design.edgeMm, DESIGN_LIMITS.edgeMm),
        paddingMm:      clamp(design.paddingMm, DESIGN_LIMITS.paddingMm),
        scale:          clamp(design.scale, DESIGN_LIMITS.scale),
        offsetXMm:      clamp(design.offsetXMm, DESIGN_LIMITS.offsetMm),
        offsetYMm:      clamp(design.offsetYMm, DESIGN_LIMITS.offsetMm),
        whiteTolerance: clamp(design.whiteTolerance, DESIGN_LIMITS.tolerance),
    }
}

export type Rect = { x: number; y: number; width: number; height: number }

export type StickerLayout = {
    /** The whole sticker, in pixels at the print DPI. */
    width:   number
    height:  number
    /** The edge ring's width and the padding, in pixels. */
    edge:    number
    padding: number
    /** Corner radius of a rounded sticker's outer edge, in pixels. */
    corner:  number
    /** Inside the edge ring. */
    inner:   Rect
    /** Where the artwork is drawn. */
    art:     Rect
}

/**
 * Where everything goes for `design`, with artwork of `artwork` pixels, at
 * `dpi`. The artwork is fitted (never stretched) into the space left inside
 * the edge ring and padding, then scaled and moved. A contour sticker grows
 * outward from the artwork by the same amount, so that space is reserved round it.
 */
export function layoutSticker(design: StickerDesign, artwork: { width: number; height: number }, dpi: number = PRINT_DPI): StickerLayout {
    const width   = mmToPx(design.widthMm, dpi)
    const height  = mmToPx(design.heightMm, dpi)
    const edge    = design.edge ? Math.round((design.edgeMm / MM_PER_INCH) * dpi) : 0
    const padding = Math.round((design.paddingMm / MM_PER_INCH) * dpi)
    const corner  = design.shape === "rounded" ? Math.min(Math.round((design.cornerMm / MM_PER_INCH) * dpi), Math.floor(Math.min(width, height) / 2)) : 0

    const inner: Rect = { x: edge, y: edge, width: Math.max(1, width - 2 * edge), height: Math.max(1, height - 2 * edge) }
    const room = {
        width:  Math.max(1, inner.width - 2 * padding),
        height: Math.max(1, inner.height - 2 * padding),
    }
    const fit   = Math.min(room.width / Math.max(1, artwork.width), room.height / Math.max(1, artwork.height)) * design.scale
    const artW  = artwork.width * fit
    const artH  = artwork.height * fit
    const shift = (mm: number) => (mm / MM_PER_INCH) * dpi
    const art: Rect = {
        x:      (width - artW) / 2 + shift(design.offsetXMm),
        y:      (height - artH) / 2 + shift(design.offsetYMm),
        width:  artW,
        height: artH,
    }
    return { width, height, edge, padding, corner, inner, art }
}

export type PrintQuality = "sharp" | "ok" | "low"

/** How many of the source image's pixels land on each printed inch of the artwork. */
export function artworkDpi(sourceWidth: number, art: Rect, dpi: number = PRINT_DPI): number {
    return Math.round(sourceWidth / (art.width / dpi))
}

/** 250 DPI or more prints crisply; 150 is fine at arm's length; below that it looks soft. */
export function printQuality(dpi: number): PrintQuality {
    return dpi >= 250 ? "sharp" : dpi >= 150 ? "ok" : "low"
}

// ─── Pixels ───────────────────────────────────────────────────────────────────

/**
 * Make the near-white background of RGBA `data` transparent, in place: a
 * flood fill from the image's edges, so white enclosed by the logo (a white
 * letter, an eye) stays. Already-transparent pixels count as background too.
 * Returns how many pixels it cleared.
 */
export function removeEdgeWhite(data: Uint8ClampedArray, width: number, height: number, tolerance: number): number {
    const floor = 255 - Math.round(clamp(tolerance, DESIGN_LIMITS.tolerance) * 1.28) // 100 → anything brighter than 127
    const isBackground = (pixel: number) => {
        const i = pixel * 4
        return data[i + 3] < 16 || (data[i] >= floor && data[i + 1] >= floor && data[i + 2] >= floor)
    }
    const seen  = new Uint8Array(width * height)
    const stack = new Int32Array(width * height)
    let top = 0
    const push = (pixel: number) => {
        if (seen[pixel] || !isBackground(pixel)) return
        seen[pixel] = 1
        stack[top++] = pixel
    }
    for (let x = 0; x < width; x++) {
        push(x)
        push((height - 1) * width + x)
    }
    for (let y = 0; y < height; y++) {
        push(y * width)
        push(y * width + width - 1)
    }
    let cleared = 0
    while (top > 0) {
        const pixel = stack[--top]
        data[pixel * 4 + 3] = 0
        cleared++
        const x = pixel % width
        if (x > 0) push(pixel - 1)
        if (x < width - 1) push(pixel + 1)
        if (pixel >= width) push(pixel - width)
        if (pixel < width * (height - 1)) push(pixel + width)
    }
    return cleared
}

const FAR = 1e20

/** One row or column of the exact squared distance transform (Felzenszwalb & Huttenlocher). */
function distance1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
    let k = 0
    v[0] = 0
    z[0] = -Infinity
    z[1] = Infinity
    for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
        while (s <= z[k]) {
            k--
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
        }
        k++
        v[k] = q
        z[k] = s
        z[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++
        d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
    }
}

/**
 * The squared distance, in pixels, from every pixel to the nearest one whose
 * alpha is at least `threshold`. Exact, in linear time. `alpha` holds one
 * value per pixel.
 */
export function distanceToInk(alpha: ArrayLike<number>, width: number, height: number, threshold = 128): Float32Array {
    const n   = Math.max(width, height)
    const f   = new Float64Array(n)
    const d   = new Float64Array(n)
    const v   = new Int32Array(n)
    const z   = new Float64Array(n + 1)
    const out = new Float64Array(width * height)
    for (let i = 0; i < width * height; i++) out[i] = alpha[i] >= threshold ? 0 : FAR
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) f[y] = out[y * width + x]
        distance1d(f, height, d, v, z)
        for (let y = 0; y < height; y++) out[y * width + x] = d[y]
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) f[x] = out[y * width + x]
        distance1d(f, width, d, v, z)
        for (let x = 0; x < width; x++) out[y * width + x] = d[x]
    }
    return Float32Array.from(out)
}

/** Alpha (0–255) of everything within `radius` pixels of the ink, softened over the last pixel. */
export function contourMask(distance2: ArrayLike<number>, radius: number): Uint8ClampedArray {
    const mask = new Uint8ClampedArray(distance2.length)
    for (let i = 0; i < distance2.length; i++) {
        mask[i] = Math.round(Math.min(1, Math.max(0, radius + 0.5 - Math.sqrt(distance2[i]))) * 255)
    }
    return mask
}

/**
 * The cut line: opaque pixels (alpha ≥ `threshold`) with a clear neighbour
 * or on the image's edge. Design Space cuts a transparent PNG along this edge.
 */
export function cutOutline(alpha: ArrayLike<number>, width: number, height: number, threshold = 128): Uint8Array {
    const line = new Uint8Array(width * height)
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x] >= threshold
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (solid(x, y) && !(solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1))) line[y * width + x] = 1
        }
    }
    return line
}

// ─── PNG ──────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
let crcTable: Uint32Array | null = null

function crc32(bytes: Uint8Array): number {
    if (!crcTable) {
        crcTable = new Uint32Array(256)
        for (let n = 0; n < 256; n++) {
            let c = n
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
            crcTable[n] = c >>> 0
        }
    }
    let c = 0xffffffff
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

const isPng = (png: Uint8Array) => PNG_SIGNATURE.every((byte, i) => png[i] === byte)

/**
 * The PNG with a pHYs chunk saying `dpi`, so printing software and Cricut
 * Design Space can size it correctly. Any pHYs already there is replaced.
 * Returns the input unchanged if it isn't a PNG.
 */
export function withPngDpi(png: Uint8Array, dpi: number): Uint8Array {
    if (!isPng(png) || png.length < 33) return png
    const view    = new DataView(png.buffer, png.byteOffset, png.byteLength)
    const ihdrEnd = 8 + 12 + view.getUint32(8) // signature, then IHDR: length, type, data, CRC
    const perMetre = Math.round(dpi / 0.0254)
    const body = new Uint8Array(13)
    const bodyView = new DataView(body.buffer)
    body.set([0x70, 0x48, 0x59, 0x73]) // "pHYs"
    bodyView.setUint32(4, perMetre)
    bodyView.setUint32(8, perMetre)
    body[12] = 1 // unit: metre
    const chunk = new Uint8Array(4 + body.length + 4)
    const chunkView = new DataView(chunk.buffer)
    chunkView.setUint32(0, 9)
    chunk.set(body, 4)
    chunkView.setUint32(4 + body.length, crc32(body))

    // Copy every chunk after IHDR except an existing pHYs.
    const parts: Uint8Array[] = [png.subarray(0, ihdrEnd), chunk]
    let offset = ihdrEnd
    while (offset + 12 <= png.length) {
        const length = view.getUint32(offset)
        const type   = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
        const end    = offset + 12 + length
        if (type !== "pHYs") parts.push(png.subarray(offset, end))
        offset = end
    }
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let at = 0
    for (const part of parts) {
        out.set(part, at)
        at += part.length
    }
    return out
}

/** The DPI a PNG's pHYs chunk records, or null when it has none. */
export function readPngDpi(png: Uint8Array): number | null {
    if (!isPng(png)) return null
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    let offset = 8
    while (offset + 12 <= png.length) {
        const length = view.getUint32(offset)
        const type   = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
        if (type === "pHYs" && png[offset + 16] === 1) return Math.round(view.getUint32(offset + 8) * 0.0254)
        if (type === "IDAT") return null
        offset += 12 + length
    }
    return null
}

/** Whether every chunk's CRC in `png` checks out (used by the tests and the editor's own check). */
export function pngChunksValid(png: Uint8Array): boolean {
    if (!isPng(png)) return false
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    let offset = 8
    while (offset + 12 <= png.length) {
        const length = view.getUint32(offset)
        const end    = offset + 8 + length
        if (end + 4 > png.length) return false
        if (crc32(png.subarray(offset + 4, end)) !== view.getUint32(end)) return false
        offset = end + 4
    }
    return offset === png.length
}

/** A file name for the print file: "sticker-bright-labs-lid-upper-left.png". */
export function stickerFileName(...parts: string[]): string {
    const slug = parts.join(" ").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase() // "Ü" → "u", not "u-"
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
    return `sticker${slug ? `-${slug}` : ""}.png`
}
