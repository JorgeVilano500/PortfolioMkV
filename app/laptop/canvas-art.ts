/**
 * The 2D artwork LaptopViewer maps onto the model: stickers, the screen (a
 * boot screen and a desktop), and the keyboard with its backlight. Plain
 * Canvas 2D with no Three.js; the viewer turns each canvas into a texture.
 *
 * glTF UVs put v = 0 at the top of an image, so every canvas is drawn the
 * right way up and the viewer sets `texture.flipY = false`.
 */
import { STICKER_COLORS, type StickerSlot } from "@/lib/laptop-stickers"
import { KEYBOARD_UNITS, KEY_ROWS, TOUCH_BAR, type KeyCap } from "@/lib/laptop-keyboard"

const FONT         = `system-ui, -apple-system, "Segoe UI", sans-serif`
const STICKER_PX   = 512  // sticker height; the width follows the slot's aspect
const SCREEN_PX    = { width: 1280, height: 800 } // 16:10, the 2019 13-inch display's shape
const KEYBOARD_PX  = 1280 // keyboard width; the height follows the layout
const KEYBOARD_PAD = 14

function makeCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas")
    canvas.width  = width
    canvas.height = height
    return canvas
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fillStyle = fill
    ctx.fill()
}

/** Shrink the font until the text fits the width. */
function fillFittedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxPx: number, weight: string) {
    let px = maxPx
    do {
        ctx.font = `${weight} ${px}px ${FONT}`
        px -= 4
    } while (px > 12 && ctx.measureText(text).width > maxWidth)
    ctx.fillText(text, x, y)
}

// ─── Stickers ─────────────────────────────────────────────────────────────────

export function drawSticker(slot: StickerSlot): HTMLCanvasElement {
    const canvas = makeCanvas(Math.round(STICKER_PX * slot.aspect), STICKER_PX)
    paintSticker(canvas, slot)
    return canvas
}

/**
 * (Re)draw a sticker into its canvas, so the viewer can update it in place
 * when Studio edits a spot. With `image` (the sponsor's sticker file), the
 * image is fitted inside the die-cut shape on the theme colour, never
 * cropped; without it, the sponsor's mark and name are drawn instead.
 */
export function paintSticker(canvas: HTMLCanvasElement, slot: StickerSlot, image?: HTMLImageElement | null) {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // A finished die-cut design (Studio's sticker editor) already has its
    // shape, border and colours: draw it as it is, filling the spot.
    if (slot.sponsor?.finish === "sticker" && image && image.naturalWidth > 0) {
        const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
        const w = image.naturalWidth * scale
        const h = image.naturalHeight * scale
        ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
        return
    }

    const inset  = 18
    const width  = canvas.width - inset * 2
    const size   = STICKER_PX - inset * 2
    const midX   = canvas.width / 2
    const mid    = STICKER_PX / 2
    const radius = slot.aspect > 1 ? 72 : 96
    ctx.beginPath()
    ctx.roundRect(inset, inset, width, size, radius)
    ctx.textAlign    = "center"
    ctx.textBaseline = "middle"

    if (slot.sponsor && image && image.naturalWidth > 0) {
        ctx.fillStyle = STICKER_COLORS[slot.sponsor.theme].fill
        ctx.fill()
        ctx.save()
        ctx.clip()
        const pad   = 26
        const scale = Math.min((width - pad * 2) / image.naturalWidth, (size - pad * 2) / image.naturalHeight)
        const w = image.naturalWidth * scale
        const h = image.naturalHeight * scale
        ctx.drawImage(image, midX - w / 2, mid - h / 2, w, h)
        ctx.restore()
        ctx.beginPath()
        ctx.roundRect(inset, inset, width, size, radius)
        ctx.lineWidth   = 14
        ctx.strokeStyle = "#f0eeff" // a white die-cut edge, like a real vinyl sticker
        ctx.stroke()
    } else if (slot.sponsor) {
        const colors = STICKER_COLORS[slot.sponsor.theme]
        ctx.fillStyle = colors.fill
        ctx.fill()
        ctx.lineWidth   = 14
        ctx.strokeStyle = "#f0eeff"
        ctx.stroke()
        ctx.fillStyle = colors.ink
        fillFittedText(ctx, slot.sponsor.mark, midX, mid - 30, width - 90, 190, "800")
        fillFittedText(ctx, slot.sponsor.name, midX, mid + 130, width - 90, 44, "600")
    } else {
        ctx.fillStyle = "rgba(19, 18, 28, 0.88)" // #13121c, the card surface
        ctx.fill()
        ctx.setLineDash([30, 22])
        ctx.lineWidth   = 12
        ctx.strokeStyle = "#7c6dff"
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = "#AFA9EC"
        fillFittedText(ctx, "YOUR", midX, mid - 60, width - 120, 96, "800")
        fillFittedText(ctx, "LOGO", midX, mid + 40, width - 120, 96, "800")
        ctx.fillStyle = "#c4c0d8"
        fillFittedText(ctx, "Open spot", midX, mid + 140, width - 120, 40, "600")
    }
}

/** Load an image for a sticker (same-origin URLs, so the canvas stays usable by WebGL). */
export function loadStickerImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.decoding = "async"
        image.onload  = () => resolve(image)
        image.onerror = () => reject(new Error(`sticker image failed to load: ${url}`))
        image.src = url
    })
}

/** A rounded frame in white (the material tints it), shown around the selected sticker. */
export function drawRing(aspect: number): HTMLCanvasElement {
    const canvas = makeCanvas(Math.round(256 * aspect), 256)
    const ctx = canvas.getContext("2d")
    if (ctx) {
        ctx.beginPath()
        ctx.roundRect(10, 10, canvas.width - 20, 236, 52)
        ctx.lineWidth   = 14
        ctx.strokeStyle = "#ffffff"
        ctx.stroke()
    }
    return canvas
}

// ─── Screen ───────────────────────────────────────────────────────────────────

/** What the display shows while booting: the wordmark where a Mac shows its logo. */
export function drawBootScreen(): HTMLCanvasElement {
    const { width, height } = SCREEN_PX
    const canvas = makeCanvas(width, height)
    const ctx = canvas.getContext("2d")
    if (!ctx) return canvas
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, width, height)
    ctx.font         = `800 64px ${FONT}`
    ctx.textBaseline = "middle"
    ctx.textAlign    = "left"
    const java = ctx.measureText("JAVA").width
    const left = (width - java - ctx.measureText(".dev").width) / 2
    ctx.fillStyle = "#f0eeff"
    ctx.fillText("JAVA", left, height / 2 - 24)
    ctx.fillStyle = "#7c6dff"
    ctx.fillText(".dev", left + java, height / 2 - 24)
    roundedRect(ctx, width / 2 - 110, height / 2 + 48, 220, 6, 3, "#2a2840") // progress bar
    roundedRect(ctx, width / 2 - 110, height / 2 + 48, 140, 6, 3, "#f0eeff")
    return canvas
}

/** A blank canvas the size of the display, for drawDesktop to (re)draw into. */
export function makeScreenCanvas(): HTMLCanvasElement {
    return makeCanvas(SCREEN_PX.width, SCREEN_PX.height)
}

/** The desktop: a wallpaper in the site's palette, a menu bar, and a dock of the site's pages. */
export function drawDesktop(canvas: HTMLCanvasElement, now: Date) {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { width: w, height: h } = canvas

    const base = ctx.createLinearGradient(0, 0, w, h)
    base.addColorStop(0, "#1d1648")
    base.addColorStop(0.55, "#0d0c14")
    base.addColorStop(1, "#2a1530")
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    const glow = (x: number, y: number, r: number, color: string) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, color)
        g.addColorStop(1, "rgba(0, 0, 0, 0)")
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
    }
    glow(w * 0.22, h * 0.8, w * 0.55, "rgba(124, 109, 255, 0.55)")
    glow(w * 0.84, h * 0.2, w * 0.45, "rgba(237, 147, 177, 0.38)")
    glow(w * 0.62, h * 1.05, w * 0.35, "rgba(151, 196, 89, 0.2)")
    // Two ribbons sweeping across, like a light trail.
    const ribbon = (y: number, thickness: number, color: string) => {
        ctx.beginPath()
        ctx.moveTo(0, h * y)
        ctx.bezierCurveTo(w * 0.3, h * (y - 0.28), w * 0.62, h * (y + 0.18), w, h * (y - 0.22))
        ctx.lineTo(w, h * (y - 0.22 + thickness))
        ctx.bezierCurveTo(w * 0.62, h * (y + 0.18 + thickness * 1.6), w * 0.3, h * (y - 0.28 + thickness * 0.4), 0, h * (y + thickness))
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
    }
    ribbon(0.6, 0.08, "rgba(175, 169, 236, 0.16)")
    ribbon(0.7, 0.05, "rgba(124, 109, 255, 0.28)")

    // Menu bar
    const bar = 30
    ctx.fillStyle = "rgba(10, 10, 15, 0.55)"
    ctx.fillRect(0, 0, w, bar)
    ctx.textBaseline = "middle"
    ctx.textAlign    = "left"
    ctx.font = `700 15px ${FONT}`
    ctx.fillStyle = "#f0eeff"
    ctx.fillText("JAVA.dev", 20, bar / 2)
    let x = 20 + ctx.measureText("JAVA.dev").width + 24
    ctx.font = `500 14px ${FONT}`
    ctx.fillStyle = "#c4c0d8"
    for (const item of ["Work", "About", "Blog", "Contact"]) {
        ctx.fillText(item, x, bar / 2)
        x += ctx.measureText(item).width + 20
    }
    ctx.textAlign = "right"
    ctx.fillText(now.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }), w - 20, bar / 2)

    // Dock
    const tiles: [string, string][] = [["H", "#7c6dff"], ["W", "#97C459"], ["A", "#ED93B1"], ["B", "#AFA9EC"], ["C", "#6a5de8"]]
    const size = 58, gap = 14, pad = 12
    const dockW = tiles.length * size + (tiles.length - 1) * gap + pad * 2
    const dockH = size + pad * 2
    const dockX = (w - dockW) / 2
    const dockY = h - dockH - 16
    roundedRect(ctx, dockX, dockY, dockW, dockH, 22, "rgba(255, 255, 255, 0.1)")
    ctx.lineWidth   = 1.5
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)"
    ctx.stroke()
    ctx.textAlign = "center"
    tiles.forEach(([letter, color], i) => {
        const tx = dockX + pad + i * (size + gap)
        const ty = dockY + pad
        roundedRect(ctx, tx, ty, size, size, 14, color)
        const shine = ctx.createLinearGradient(0, ty, 0, ty + size)
        shine.addColorStop(0, "rgba(255, 255, 255, 0.28)")
        shine.addColorStop(0.6, "rgba(255, 255, 255, 0)")
        ctx.fillStyle = shine
        ctx.fill()
        ctx.font = `800 26px ${FONT}`
        ctx.fillStyle = "#ffffff"
        ctx.fillText(letter, tx + size / 2, ty + size / 2 + 1)
    })
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────

/**
 * One layer of the keyboard, drawn from the shared layout. "caps" is what you
 * see in daylight (dark keycaps, grey legends, see-through gaps so the
 * aluminium shows). "glow" is the backlight: only the legends, the key edges,
 * and the Touch Bar's contents are light, so used as an emissive map, only
 * they light up.
 */
export function drawKeyboard(kind: "caps" | "glow"): HTMLCanvasElement {
    const unit   = (KEYBOARD_PX - KEYBOARD_PAD * 2) / KEYBOARD_UNITS
    const canvas = makeCanvas(KEYBOARD_PX, Math.round(KEYBOARD_PAD * 2 + unit * (KEY_ROWS.length + TOUCH_BAR.height)))
    const ctx = canvas.getContext("2d")
    if (!ctx) return canvas
    const glow  = kind === "glow"
    const inset = unit * 0.08
    if (glow) {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // Touch Bar row: the OLED strip (with a virtual esc key), then Touch ID.
    const barH   = unit * TOUCH_BAR.height
    const idW    = unit * TOUCH_BAR.touchIdWidth
    const stripW = KEYBOARD_PX - KEYBOARD_PAD * 2 - idW
    const strip  = { x: KEYBOARD_PAD + inset, y: KEYBOARD_PAD + inset, w: stripW - inset * 2, h: barH - inset * 2 }
    if (glow) drawTouchBar(ctx, strip, unit)
    else {
        roundedRect(ctx, strip.x, strip.y, strip.w, strip.h, unit * 0.1, "#050506")
        roundedRect(ctx, strip.x + stripW, strip.y, idW - inset * 2, strip.h, unit * 0.1, "#0c0c0e")
    }

    let y = KEYBOARD_PAD + barH
    for (const row of KEY_ROWS) {
        let x = KEYBOARD_PAD
        for (const key of row) {
            const w = (key.width ?? 1) * unit
            if (key.stack) {
                const half = (unit - inset * 3) / 2
                drawKey(ctx, kind, { label: key.stack[0] }, x + inset, y + inset, w - inset * 2, half, unit)
                drawKey(ctx, kind, { label: key.stack[1] }, x + inset, y + inset * 2 + half, w - inset * 2, half, unit)
            } else {
                drawKey(ctx, kind, key, x + inset, y + inset, w - inset * 2, unit - inset * 2, unit)
            }
            x += w
        }
        y += unit
    }
    return canvas
}

function drawKey(ctx: CanvasRenderingContext2D, kind: "caps" | "glow", key: KeyCap, x: number, y: number, w: number, h: number, unit: number) {
    const radius = unit * 0.12
    if (kind === "caps") {
        const cap = ctx.createLinearGradient(0, y, 0, y + h)
        cap.addColorStop(0, "#1d1d22")
        cap.addColorStop(1, "#0e0e11")
        roundedRect(ctx, x, y, w, h, radius, cap)
    } else {
        // Light leaking round the key's edge.
        ctx.beginPath()
        ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, radius)
        ctx.lineWidth   = 3
        ctx.strokeStyle = "rgba(255, 255, 255, 0.16)"
        ctx.stroke()
    }

    ctx.fillStyle = kind === "caps" ? "#5d5d68" : "#ffffff"
    const s = unit // legend sizes follow a full-height key, even on half-height ones
    if (key.align) {
        // Modifiers: the name in a bottom corner, any symbol in the top corner.
        const edge = key.align === "left" ? x + s * 0.13 : x + w - s * 0.13
        ctx.textAlign    = key.align
        ctx.textBaseline = "alphabetic"
        ctx.font = `500 ${s * 0.15}px ${FONT}`
        ctx.fillText(key.label, edge, y + h - s * 0.13)
        if (key.glyph) {
            ctx.textAlign    = key.align === "left" ? "right" : "left"
            ctx.textBaseline = "top"
            ctx.font = `400 ${s * 0.2}px ${FONT}`
            ctx.fillText(key.glyph, key.align === "left" ? x + w - s * 0.13 : x + s * 0.13, y + s * 0.1)
        }
        return
    }
    ctx.textAlign    = "center"
    ctx.textBaseline = "middle"
    if (key.shift) {
        ctx.font = `500 ${s * 0.2}px ${FONT}`
        ctx.fillText(key.shift, x + w / 2, y + h * 0.32)
        ctx.fillText(key.label, x + w / 2, y + h * 0.68)
    } else if (key.label) {
        ctx.font = `500 ${s * (/^[A-Z]$/.test(key.label) ? 0.27 : 0.18)}px ${FONT}`
        ctx.fillText(key.label, x + w / 2, y + h / 2)
    }
}

/** The Touch Bar's lit contents: esc, a JAVA.dev pill, and brightness and volume buttons. */
function drawTouchBar(ctx: CanvasRenderingContext2D, strip: { x: number; y: number; w: number; h: number }, unit: number) {
    const pad  = strip.h * 0.14
    const h    = strip.h - pad * 2
    const midY = strip.y + strip.h / 2
    const escW = unit * TOUCH_BAR.escWidth - pad * 2
    roundedRect(ctx, strip.x + pad, strip.y + pad, escW, h, h * 0.22, "#3a3a44")
    ctx.fillStyle    = "#ffffff"
    ctx.textAlign    = "center"
    ctx.textBaseline = "middle"
    ctx.font = `500 ${h * 0.45}px ${FONT}`
    ctx.fillText("esc", strip.x + pad + escW / 2, midY)

    const pillW = unit * 3.2
    const pillX = strip.x + (strip.w - pillW) / 2
    const pill  = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0)
    pill.addColorStop(0, "#7c6dff")
    pill.addColorStop(1, "#ED93B1")
    roundedRect(ctx, pillX, strip.y + pad, pillW, h, h * 0.22, pill)
    ctx.fillStyle = "#ffffff"
    ctx.font = `700 ${h * 0.48}px ${FONT}`
    ctx.fillText("JAVA.dev", pillX + pillW / 2, midY)

    // Brightness (a sun) and volume (a speaker), at the right end like the Control Strip.
    const buttonW = unit * 0.9
    const icons: ((cx: number, r: number) => void)[] = [
        (cx, r) => {
            ctx.beginPath()
            ctx.arc(cx, midY, r * 0.38, 0, Math.PI * 2)
            ctx.fill()
            ctx.lineWidth = r * 0.14
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2
                ctx.beginPath()
                ctx.moveTo(cx + Math.cos(a) * r * 0.6, midY + Math.sin(a) * r * 0.6)
                ctx.lineTo(cx + Math.cos(a) * r * 0.85, midY + Math.sin(a) * r * 0.85)
                ctx.stroke()
            }
        },
        (cx, r) => {
            ctx.beginPath()
            ctx.moveTo(cx - r * 0.8, midY - r * 0.3)
            ctx.lineTo(cx - r * 0.4, midY - r * 0.3)
            ctx.lineTo(cx, midY - r * 0.7)
            ctx.lineTo(cx, midY + r * 0.7)
            ctx.lineTo(cx - r * 0.4, midY + r * 0.3)
            ctx.lineTo(cx - r * 0.8, midY + r * 0.3)
            ctx.closePath()
            ctx.fill()
            ctx.lineWidth = r * 0.14
            ctx.beginPath()
            ctx.arc(cx + r * 0.1, midY, r * 0.5, -0.9, 0.9)
            ctx.stroke()
        },
    ]
    icons.forEach((icon, i) => {
        const bx = strip.x + strip.w - pad - (icons.length - i) * (buttonW + pad)
        roundedRect(ctx, bx, strip.y + pad, buttonW, h, h * 0.22, "#2c2c34")
        ctx.fillStyle   = "#ffffff"
        ctx.strokeStyle = "#ffffff"
        icon(bx + buttonW / 2, h * 0.42)
    })
}
