/**
 * lib/sticker-print.ts — the maths behind Studio's sticker editor: print
 * sizes, the layout of the layers, background removal, the distance field
 * for "follow the logo" shapes, the cut line, and the 300 DPI PNG marker.
 */
import { deflateSync } from "zlib"
import { LAPTOP_MODEL, STICKER_SLOTS } from "@/lib/laptop-stickers"
import {
    DESIGN_LIMITS,
    PRINT_DPI,
    STICKER_PRINT_MM,
    artworkDpi,
    clampDesign,
    contourMask,
    cutOutline,
    defaultDesign,
    distanceToInk,
    formatPrintSize,
    layoutSticker,
    mmToPx,
    pngChunksValid,
    printQuality,
    readPngDpi,
    removeEdgeWhite,
    stickerFileName,
    withPngDpi,
    type StickerDesign,
} from "@/lib/sticker-print"

const lid = (overrides: Partial<StickerDesign> = {}): StickerDesign => ({ ...defaultDesign("lid"), ...overrides })

describe("sizes", () => {
    it("prints each spot at its real size: 6.5 cm square lid stickers, 5 × 3.5 cm palm-rest ones", () => {
        expect(STICKER_PRINT_MM.lid).toEqual({ width: 65, height: 65 })
        expect(STICKER_PRINT_MM["palm-rest"]).toEqual({ width: 50, height: 35 })
        // The same shapes the laptop draws them in.
        for (const slot of STICKER_SLOTS) {
            const size = STICKER_PRINT_MM[slot.surface]
            expect(size.width / size.height).toBeCloseTo(slot.aspect, 6)
        }
        expect(STICKER_PRINT_MM.lid.width).toBeLessThan(LAPTOP_MODEL.dimensions.width * 1000)
    })

    it("converts millimetres to pixels at 300 DPI", () => {
        expect(PRINT_DPI).toBe(300)
        expect(mmToPx(25.4)).toBe(300)
        expect(mmToPx(65)).toBe(768)
        expect(mmToPx(65, 150)).toBe(384)
        expect(mmToPx(0)).toBe(1) // never a zero-sized canvas
    })

    it("names the size in centimetres and inches", () => {
        expect(formatPrintSize({ width: 65, height: 65 })).toBe("6.5 × 6.5 cm (2.56 × 2.56 in)")
        expect(formatPrintSize({ width: 50, height: 35 })).toBe("5 × 3.5 cm (1.97 × 1.38 in)")
    })
})

describe("design", () => {
    it("starts as a classic die-cut sticker for the spot: the artwork on white, no edge ring", () => {
        expect(defaultDesign("lid")).toMatchObject({ widthMm: 65, heightMm: 65, shape: "rounded", fill: "#ffffff", edge: null, scale: 1, removeWhite: false })
        expect(defaultDesign("palm-rest")).toMatchObject({ widthMm: 50, heightMm: 35 })
    })

    it("keeps every number inside the editor's limits", () => {
        const wild = clampDesign(lid({ widthMm: 9999, heightMm: -5, cornerMm: 99, edgeMm: -1, paddingMm: 50, scale: 40, offsetXMm: -400, offsetYMm: Number.NaN, whiteTolerance: 300 }))
        expect(wild.widthMm).toBe(DESIGN_LIMITS.sizeMm.max)
        expect(wild.heightMm).toBe(DESIGN_LIMITS.sizeMm.min)
        expect(wild.cornerMm).toBe(DESIGN_LIMITS.cornerMm.max)
        expect(wild.edgeMm).toBe(0)
        expect(wild.paddingMm).toBe(DESIGN_LIMITS.paddingMm.max)
        expect(wild.scale).toBe(DESIGN_LIMITS.scale.max)
        expect(wild.offsetXMm).toBe(DESIGN_LIMITS.offsetMm.min)
        expect(wild.offsetYMm).toBe(DESIGN_LIMITS.offsetMm.min) // not a number → the low end
        expect(wild.whiteTolerance).toBe(100)
    })
})

describe("layout", () => {
    const square = { width: 1000, height: 1000 }
    const wide   = { width: 2000, height: 1000 }

    it("fits the artwork inside the edge and padding, centred, without stretching it", () => {
        const layout = layoutSticker(lid({ edge: "#7c6dff", edgeMm: 1, paddingMm: 2 }), wide)
        const edge = Math.round(300 / 25.4)
        const pad  = Math.round(2 * 300 / 25.4)
        expect(layout).toMatchObject({ width: 768, height: 768, edge, padding: pad })
        expect(layout.inner).toEqual({ x: edge, y: edge, width: 768 - 2 * edge, height: 768 - 2 * edge })
        expect(layout.art.width).toBeCloseTo(768 - 2 * edge - 2 * pad, 6)
        expect(layout.art.width / layout.art.height).toBeCloseTo(2, 6)
        expect(layout.art.x + layout.art.width / 2).toBeCloseTo(384, 6)
        expect(layout.art.y + layout.art.height / 2).toBeCloseTo(384, 6)
    })

    it("has no edge ring when the edge is off, whatever its width says", () => {
        expect(layoutSticker(lid({ edge: null, edgeMm: 5 }), square).edge).toBe(0)
    })

    it("scales and moves the artwork by the sliders", () => {
        const base   = layoutSticker(lid(), square)
        const bigger = layoutSticker(lid({ scale: 1.5 }), square)
        expect(bigger.art.width).toBeCloseTo(base.art.width * 1.5, 6)
        const moved = layoutSticker(lid({ offsetXMm: 10, offsetYMm: -5 }), square)
        expect(moved.art.x - base.art.x).toBeCloseTo(10 * 300 / 25.4, 6)
        expect(moved.art.y - base.art.y).toBeCloseTo(-5 * 300 / 25.4, 6)
    })

    it("reserves the same room round the artwork for a contour sticker, and has no corners", () => {
        const rounded = layoutSticker(lid({ shape: "rounded" }), square)
        const contour = layoutSticker(lid({ shape: "contour" }), square)
        expect(contour.art).toEqual(rounded.art)
        expect(contour.corner).toBe(0)
        expect(rounded.corner).toBe(Math.round(9 * 300 / 25.4))
    })

    it("never rounds a corner past half the sticker", () => {
        const layout = layoutSticker({ ...lid({ widthMm: 20, heightMm: 20 }), cornerMm: 30 }, square)
        expect(layout.corner).toBe(Math.floor(layout.width / 2))
    })

    it("works at a lower DPI for the live preview", () => {
        expect(layoutSticker(lid(), square, 150).width).toBe(384)
    })
})

describe("print quality", () => {
    it("measures the artwork's own pixels per printed inch", () => {
        expect(artworkDpi(1200, { x: 0, y: 0, width: 600, height: 600 })).toBe(600) // 600 px wide at 300 DPI = 2 in
        expect(artworkDpi(300, { x: 0, y: 0, width: 600, height: 600 })).toBe(150)
    })

    it("calls 250+ sharp, 150+ fine, and less soft", () => {
        expect(printQuality(300)).toBe("sharp")
        expect(printQuality(250)).toBe("sharp")
        expect(printQuality(200)).toBe("ok")
        expect(printQuality(149)).toBe("low")
    })
})

/** RGBA pixels from a map of characters: "w" white, "k" black, "g" light grey (230), "." clear. */
function pixels(rows: string[]): { data: Uint8ClampedArray; width: number; height: number } {
    const width = rows[0].length
    const data  = new Uint8ClampedArray(width * rows.length * 4)
    const colours: Record<string, number[]> = { w: [255, 255, 255, 255], k: [0, 0, 0, 255], g: [230, 230, 230, 255], ".": [0, 0, 0, 0] }
    rows.forEach((row, y) => [...row].forEach((c, x) => data.set(colours[c], (y * width + x) * 4)))
    return { data, width, height: rows.length }
}
const alphaMap = ({ data, width, height }: ReturnType<typeof pixels>) =>
    Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (data[(y * width + x) * 4 + 3] ? "#" : ".")).join(""))

describe("removing a white background", () => {
    it("clears white connected to the edges, and keeps white the logo encloses", () => {
        const image = pixels([
            "wwwwwww",
            "wkkkkkw",
            "wkwwwkw",
            "wkkkkkw",
            "wwwwwww",
        ])
        const cleared = removeEdgeWhite(image.data, image.width, image.height, 10)
        expect(cleared).toBe(20)
        expect(alphaMap(image)).toEqual([
            ".......",
            ".#####.",
            ".#####.", // the white inside the ring stays
            ".#####.",
            ".......",
        ])
    })

    it("treats off-white as background only with enough tolerance", () => {
        const strict = pixels(["ggg", "gkg", "ggg"])
        expect(removeEdgeWhite(strict.data, 3, 3, 5)).toBe(0)
        const loose = pixels(["ggg", "gkg", "ggg"])
        expect(removeEdgeWhite(loose.data, 3, 3, 30)).toBe(8)
    })

    it("flows through pixels that are already transparent", () => {
        const image = pixels(["..w", "kkw", "ww."])
        removeEdgeWhite(image.data, 3, 3, 10)
        expect(alphaMap(image)).toEqual(["...", "##.", "..."])
    })
})

describe("distance field and contour", () => {
    it("is the exact squared distance to the nearest ink", () => {
        const alpha = new Uint8Array(25)
        alpha[12] = 255 // the centre of a 5 × 5
        const d = distanceToInk(alpha, 5, 5)
        expect(d[12]).toBe(0)
        expect(d[0]).toBe(8)  // a corner: 2² + 2²
        expect(d[2]).toBe(4)  // the middle of the top edge: 2²
        expect(d[7]).toBe(1)
    })

    it("matches a brute-force search on an irregular shape", () => {
        const width = 13, height = 9
        const alpha = new Uint8Array(width * height)
        for (const [x, y] of [[1, 1], [7, 2], [12, 8], [4, 6], [5, 6]]) alpha[y * width + x] = 200
        const d = distanceToInk(alpha, width, height)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let best = Infinity
                for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) if (alpha[j * width + i] >= 128) best = Math.min(best, (i - x) ** 2 + (j - y) ** 2)
                expect(d[y * width + x]).toBe(best)
            }
        }
    })

    it("is far away everywhere when there's no ink", () => {
        expect(Math.min(...distanceToInk(new Uint8Array(9), 3, 3))).toBeGreaterThan(1e6)
    })

    it("grows a mask out to the radius, softened over the last pixel", () => {
        const mask = contourMask([0, 1, 4, 8, 9], 2)
        expect([...mask]).toEqual([255, 255, 128, 0, 0])
    })
})

describe("the cut line", () => {
    it("traces the edge of the opaque pixels, not their inside", () => {
        const rows = ["......", ".####.", ".####.", ".####.", ".####.", "......"]
        const alpha = rows.flatMap((row) => [...row].map((c) => (c === "#" ? 255 : 0)))
        const line = cutOutline(alpha, 6, 6)
        const drawn = Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, (_, x) => (line[y * 6 + x] ? "x" : ".")).join(""))
        expect(drawn).toEqual(["......", ".xxxx.", ".x..x.", ".x..x.", ".xxxx.", "......"])
    })

    it("counts the image's own border as an edge", () => {
        expect([...cutOutline([255, 255, 255, 255], 2, 2)]).toEqual([1, 1, 1, 1])
    })
})

/** A real 2 × 2 PNG, built by hand. */
function tinyPng(): Uint8Array {
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
    const crc = (bytes: Buffer) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
    const chunk = (type: string, data: Buffer) => {
        const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
        const body = Buffer.concat([Buffer.from(type), data])
        const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body))
        return Buffer.concat([length, body, sum])
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 6
    const raw = Buffer.from([0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 0])
    return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]))
}
const chunkTypes = (png: Uint8Array) => {
    const types: string[] = []
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    for (let offset = 8; offset < png.length; offset += 12 + view.getUint32(offset)) types.push(String.fromCharCode(...png.subarray(offset + 4, offset + 8)))
    return types
}

describe("the PNG file", () => {
    it("says 300 DPI, right after the header, with every checksum intact", () => {
        const png = tinyPng()
        expect(readPngDpi(png)).toBeNull()
        const marked = withPngDpi(png, 300)
        expect(readPngDpi(marked)).toBe(300)
        expect(pngChunksValid(marked)).toBe(true)
        expect(chunkTypes(marked)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"])
    })

    it("replaces an earlier DPI rather than adding a second", () => {
        const twice = withPngDpi(withPngDpi(tinyPng(), 72), 300)
        expect(chunkTypes(twice).filter((type) => type === "pHYs")).toHaveLength(1)
        expect(readPngDpi(twice)).toBe(300)
    })

    it("leaves anything that isn't a PNG alone", () => {
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
        expect(withPngDpi(jpeg, 300)).toBe(jpeg)
        expect(readPngDpi(jpeg)).toBeNull()
        expect(pngChunksValid(jpeg)).toBe(false)
    })

    it("notices a damaged file", () => {
        const marked = withPngDpi(tinyPng(), 300)
        marked[40] ^= 0xff
        expect(pngChunksValid(marked)).toBe(false)
    })

    it("names the file after the sponsor and the spot", () => {
        expect(stickerFileName("Bright Labs", "Lid, upper left")).toBe("sticker-bright-labs-lid-upper-left.png")
        expect(stickerFileName("Café Ünïcode!!")).toBe("sticker-cafe-unicode.png")
        expect(stickerFileName("")).toBe("sticker.png")
    })
})
