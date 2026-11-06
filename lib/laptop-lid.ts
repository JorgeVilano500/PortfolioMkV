/**
 * How the 3D laptop's lid moves on /laptop and in Studio, as plain numbers in
 * degrees, so it can be tested without WebGL. LaptopViewer turns the angle
 * into a rotation of the model's `Lid` hinge; nothing here imports `three`.
 *
 * - A vertical drag maps straight onto the hinge, and the grabbed point
 *   travels about as far along its arc as the pointer moves at that depth, so
 *   the lid keeps pace with the hand at any canvas size or zoom. Up opens and
 *   down closes, unless the lid visibly leans toward the viewer (seen from
 *   behind the hinge, well open): then the grabbed edge comes down the screen
 *   as it opens, so pulling down opens it and pushing up closes it, as with a
 *   real lid. Each press settles this once, so a drag never changes direction.
 * - The drawn angle follows that target through a critically damped spring:
 *   it never overshoots, and it takes the same path at 30 or 144 frames a
 *   second. Under reduced motion the viewer skips the spring.
 * - Nothing moves the lid on its own: it rests where the hand, the slider, or
 *   the open/close button last put it.
 */
import { LAPTOP_MODEL } from "./laptop-stickers"

/** Hinge angles in degrees from closed. */
export const LID_ANGLE = {
    /** Resting on the base, as the model is exported. */
    closed:   0,
    /** Slightly open, so the lid invites a drag. Still counts as closed. */
    rest:     12,
    /** As far as it goes: the angle LAPTOP_MODEL.md has the modeller check for clipping. */
    open:     LAPTOP_MODEL.openAngle,
    /** Rising past this, the laptop counts as open: the screen wakes and the page shows the open state. */
    openAt:   30,
    /** Falling below this, it counts as closed again. The gap stops flicker when the lid hovers near one angle. */
    closedAt: 18,
} as const

/**
 * Spring stiffness (per second). `follow` trails a moving hand by about
 * 2/36 s and settles within ~0.16 s of letting go; `move` carries the lid
 * across its whole range in about a second (the open/close button, Home/End).
 */
export const LID_SPRING = { follow: 36, move: 5 } as const

/** A slider or keyboard change bigger than this travels with the `move` spring. */
export const LID_JUMP = 10

/** The drawn angle, how fast it's turning (degrees per second), and where it's heading. */
export type LidMotion = { angle: number; velocity: number; target: number }

const SETTLED_ANGLE = 0.005 // degrees
const SETTLED_SPEED = 0.05  // degrees per second
/** Grabbing nearer the hinge than this share of the lid turns it no faster, so a press by the hinge can't flick it. */
const MIN_ARM = 0.4
/**
 * When a grabbed point moves down the screen by more than this share of its
 * travel as the lid opens, the lid leans toward the viewer and dragging down
 * opens it. Below that the motion is too faint to read, and up opens.
 */
const LEAN = 0.25

/** `angle` held within the hinge's limits. */
export function clampLid(angle: number): number {
    return Math.min(LID_ANGLE.open, Math.max(LID_ANGLE.closed, angle))
}

/**
 * Advance the lid `dt` seconds toward its target with a critically damped
 * spring of `stiffness`. The step is the spring's exact solution, so frame
 * length doesn't change the path. The lid never passes its target, so it stops
 * where it was left rather than bouncing. Returns true while it's still moving.
 */
export function stepLid(lid: LidMotion, dt: number, stiffness: number): boolean {
    const offset = lid.angle - lid.target
    if (offset === 0) {
        lid.velocity = 0 // already there: any speed left would carry it past
        return false
    }
    if (dt <= 0) return true
    const decay    = Math.exp(-stiffness * dt)
    const carry    = (lid.velocity + stiffness * offset) * dt
    let next       = (offset + carry) * decay
    let velocity   = (lid.velocity - stiffness * carry) * decay
    if (next * offset < 0) {
        // It would have crossed the target this step: stop on it instead.
        next     = 0
        velocity = 0
    }
    if (Math.abs(next) < SETTLED_ANGLE && Math.abs(velocity) < SETTLED_SPEED) {
        lid.angle    = lid.target
        lid.velocity = 0
        return false
    }
    lid.angle    = clampLid(lid.target + next)
    lid.velocity = velocity
    return true
}

/** Jump straight to the target (reduced motion, or an instant change). */
export function settleLid(lid: LidMotion) {
    lid.angle    = lid.target
    lid.velocity = 0
}

export type LidGrab = {
    /** The grabbed point's distance in front of the camera, in metres. */
    depth:          number
    /** The camera's vertical field of view, in degrees. */
    fov:            number
    /** The canvas height in CSS pixels. */
    viewportHeight: number
    /** The grabbed point's distance from the hinge axis, in metres. */
    radius:         number
    /** The lid's length from the hinge to its far edge, in metres. */
    lidLength:      number
    /** How many pixels up the screen the grabbed point moves as the lid opens one degree (negative: down). */
    risePerDegree:  number
}

/**
 * Degrees of lid per pixel of upward drag (negative when dragging down opens
 * it). One pixel spans `2·depth·tan(fov/2)/height` metres at the grabbed
 * point; turning the lid by that length over its arm moves the point as far
 * as the pointer went. The result scales with the canvas, so a drag across
 * the same share of the view turns the lid equally far on a phone or a desktop.
 */
export function lidDragGain({ depth, fov, viewportHeight, radius, lidLength, risePerDegree }: LidGrab): number {
    const metresPerPixel = (2 * depth * Math.tan((fov * Math.PI) / 360)) / viewportHeight
    const arm            = Math.min(lidLength, Math.max(radius, lidLength * MIN_ARM))
    const gain           = (metresPerPixel / arm) * (180 / Math.PI)
    // How much of the point's travel along its arc shows as upward movement on screen.
    const arcPerDegree = (radius * Math.PI) / 180 / metresPerPixel
    const rise         = arcPerDegree > 0 ? risePerDegree / arcPerDegree : 0
    return rise < -LEAN ? -gain : gain
}

/** A pointer holding the lid. */
export type LidDrag = { startX: number; startY: number; lastY: number; gain: number; active: boolean }

export function startLidDrag(x: number, y: number, gain: number): LidDrag {
    return { startX: x, startY: y, lastY: y, gain, active: false }
}

/**
 * The lid's new target once the pointer has moved to (x, y), or null while it
 * hasn't yet moved more than `slop` pixels (still a click). Each move adds to
 * the target, so reversing the pointer reverses the lid at once, even after
 * it has hit a limit. `gain` comes from lidDragGain and keeps its sign for
 * the whole drag.
 */
export function dragLid(drag: LidDrag, x: number, y: number, target: number, slop: number): number | null {
    if (!drag.active) {
        if (Math.hypot(x - drag.startX, y - drag.startY) <= slop) return null
        drag.active = true // the movement so far counts too, so the lid doesn't lag the hand by `slop`
    }
    const next = clampLid(target + (drag.lastY - y) * drag.gain)
    drag.lastY = y
    return next
}

/** Whether the lid counts as open at `angle`, given whether it did before (hysteresis). */
export function isLidOpen(wasOpen: boolean, angle: number): boolean {
    return wasOpen ? angle > LID_ANGLE.closedAt : angle >= LID_ANGLE.openAt
}

/** "wake" when the lid rose past `openAt` between two frames, "sleep" when it fell to `closedAt`. */
export function lidCrossing(from: number, to: number): "wake" | "sleep" | null {
    if (from < LID_ANGLE.openAt && to >= LID_ANGLE.openAt) return "wake"
    if (from > LID_ANGLE.closedAt && to <= LID_ANGLE.closedAt) return "sleep"
    return null
}

/** What the lid slider announces. */
export function describeLid(degrees: number): string {
    return degrees <= LID_ANGLE.closed ? "Closed" : `Open ${degrees} degrees`
}
