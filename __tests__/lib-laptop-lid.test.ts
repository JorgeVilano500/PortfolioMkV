/**
 * lib/laptop-lid.ts — the lid's drag mapping and damping, without WebGL.
 * Covers dragging both ways across the whole range, reversing mid-drag and at
 * the limits, the click tolerance, a mapping that holds across canvas sizes
 * and keeps the grabbed point with the pointer, a spring that never
 * overshoots and takes the same path at any frame rate, the open/closed
 * hysteresis, and when the laptop wakes and sleeps.
 */
import {
    LID_ANGLE,
    LID_SPRING,
    clampLid,
    describeLid,
    dragLid,
    isLidOpen,
    lidCrossing,
    lidDragGain,
    settleLid,
    startLidDrag,
    stepLid,
    type LidGrab,
    type LidMotion,
} from "@/lib/laptop-lid"
import { LAPTOP_MODEL } from "@/lib/laptop-stickers"

const SLOP = 6
// The closed overview on a desktop canvas: the camera ~0.65 m away, a 520 px tall canvas, and
// the lid's far edge, which travels ~4.4 px per degree and rises ~2 px of that as the lid opens.
const DESKTOP: LidGrab = { depth: 0.65, fov: 35, viewportHeight: 520, radius: 0.2, lidLength: 0.2124, risePerDegree: 2 }

/** Drag from (x, y0) in `steps` equal moves to y1; returns the target after each move. */
function sweep(start: number, y0: number, y1: number, gain: number, steps = 40): number[] {
    const drag    = startLidDrag(100, y0, gain)
    const targets = [] as number[]
    let target    = start
    for (let i = 1; i <= steps; i++) {
        const next = dragLid(drag, 100, y0 + ((y1 - y0) * i) / steps, target, SLOP)
        if (next !== null) target = next
        targets.push(target)
    }
    return targets
}

/** Run the spring for `seconds` at `fps`, returning the angle after each frame. */
function run(lid: LidMotion, seconds: number, fps: number, stiffness: number): number[] {
    const angles = [] as number[]
    for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
        stepLid(lid, 1 / fps, stiffness)
        angles.push(lid.angle)
    }
    return angles
}

const increasing = (values: number[]) => values.every((v, i) => i === 0 || v >= values[i - 1])
const decreasing = (values: number[]) => values.every((v, i) => i === 0 || v <= values[i - 1])

describe("limits", () => {
    it("opens no further than the model contract checks, and rests slightly open but closed", () => {
        expect(LID_ANGLE.open).toBe(LAPTOP_MODEL.openAngle)
        expect(LID_ANGLE.closed).toBe(0)
        expect(LID_ANGLE.closed < LID_ANGLE.rest && LID_ANGLE.rest < LID_ANGLE.closedAt).toBe(true)
        expect(LID_ANGLE.closedAt < LID_ANGLE.openAt && LID_ANGLE.openAt < LID_ANGLE.open).toBe(true)
        expect(isLidOpen(false, LID_ANGLE.rest)).toBe(false)
    })

    it("clamps any angle to the hinge's range", () => {
        expect(clampLid(-20)).toBe(0)
        expect(clampLid(500)).toBe(LID_ANGLE.open)
        expect(clampLid(45)).toBe(45)
    })
})

describe("dragging the lid", () => {
    const gain = lidDragGain(DESKTOP)

    it("treats a move within the click tolerance as a click: the lid doesn't move", () => {
        const drag = startLidDrag(100, 300, gain)
        expect(dragLid(drag, 103, 296, 12, SLOP)).toBeNull()
        expect(drag.active).toBe(false)
    })

    it("opens all the way when dragged up, never turning back, then holds at the open limit", () => {
        const targets = sweep(LID_ANGLE.closed, 520, -200, gain)
        expect(increasing(targets)).toBe(true)
        expect(targets.at(-1)).toBe(LID_ANGLE.open)
        expect(targets.some((t) => t > 0 && t < LID_ANGLE.open)).toBe(true) // it passed through the range, not jumped
    })

    it("closes all the way when dragged down, never turning back, then holds at closed", () => {
        const targets = sweep(LID_ANGLE.open, -200, 520, gain)
        expect(decreasing(targets)).toBe(true)
        expect(targets.at(-1)).toBe(LID_ANGLE.closed)
    })

    it("counts the movement so far once the drag starts, so the lid doesn't lag the hand", () => {
        const drag = startLidDrag(100, 300, gain)
        expect(dragLid(drag, 100, 290, 12, SLOP)).toBeCloseTo(12 + 10 * gain, 10)
    })

    it("reverses the lid on the first move back, mid-drag", () => {
        const drag = startLidDrag(100, 300, gain)
        let target = 12
        for (const y of [280, 260, 240, 220]) target = dragLid(drag, 100, y, target, SLOP)!
        const back = dragLid(drag, 100, 221, target, SLOP)!
        expect(back).toBeLessThan(target)
        // And forward again just as quickly.
        expect(dragLid(drag, 100, 219, back, SLOP)!).toBeGreaterThan(back)
    })

    it("returns the lid to where it started when the pointer returns, within the limits", () => {
        const drag = startLidDrag(100, 300, gain)
        let target = 40
        for (const y of [250, 180, 260, 330, 300]) target = dragLid(drag, 100, y, target, SLOP)!
        expect(target).toBeCloseTo(40, 10)
    })

    it("reverses at once even after pushing past a limit", () => {
        const drag = startLidDrag(100, 300, gain)
        let target = 100
        target = dragLid(drag, 100, 0, target, SLOP)! // far past fully open
        expect(target).toBe(LID_ANGLE.open)
        expect(dragLid(drag, 100, 10, target, SLOP)!).toBeLessThan(LID_ANGLE.open)
    })

    it("ignores sideways movement", () => {
        const drag = startLidDrag(100, 300, gain)
        expect(dragLid(drag, 160, 300, 30, SLOP)).toBe(30)
    })
})

describe("drag gain", () => {
    it("turns the lid equally far for a drag across the same share of the canvas, at any size", () => {
        const share = (height: number) => lidDragGain({ ...DESKTOP, viewportHeight: height }) * height * 0.3
        expect(share(320)).toBeCloseTo(share(520), 10)  // phone and desktop
        expect(share(1040)).toBeCloseTo(share(520), 10) // a tall or high-zoom window
    })

    it("keeps the grabbed point with the pointer: the arc it travels equals the pointer's travel at its depth", () => {
        const pixels         = 50
        const degrees        = lidDragGain(DESKTOP) * pixels
        const arc            = (degrees * Math.PI / 180) * DESKTOP.radius
        const metresPerPixel = (2 * DESKTOP.depth * Math.tan((DESKTOP.fov * Math.PI) / 360)) / DESKTOP.viewportHeight
        expect(arc).toBeCloseTo(metresPerPixel * pixels, 10)
    })

    it("turns more slowly when zoomed in, where the lid is bigger on screen", () => {
        expect(lidDragGain({ ...DESKTOP, depth: 0.3 })).toBeLessThan(lidDragGain(DESKTOP))
    })

    it("caps the speed of a press right by the hinge, and treats a press past the edge as the edge", () => {
        const nearHinge = lidDragGain({ ...DESKTOP, radius: 0.001 })
        expect(nearHinge).toBeCloseTo(lidDragGain({ ...DESKTOP, radius: DESKTOP.lidLength * 0.4 }), 10)
        expect(lidDragGain({ ...DESKTOP, radius: 0.5 })).toBeCloseTo(lidDragGain({ ...DESKTOP, radius: DESKTOP.lidLength }), 10)
    })

    it("opens on an upward drag when the grabbed edge rises on screen, or barely moves up or down", () => {
        expect(lidDragGain(DESKTOP)).toBeGreaterThan(0)
        expect(lidDragGain({ ...DESKTOP, risePerDegree: 0 })).toBeGreaterThan(0)    // face-on: up opens
        expect(lidDragGain({ ...DESKTOP, risePerDegree: -0.5 })).toBeGreaterThan(0) // a faint dip is still read as up
    })

    it("opens on a downward drag when the lid leans toward the viewer, so the edge follows the hand", () => {
        const leaning = lidDragGain({ ...DESKTOP, risePerDegree: -3 })
        expect(leaning).toBeLessThan(0)
        expect(Math.abs(leaning)).toBeCloseTo(lidDragGain(DESKTOP), 10) // same speed, other way
        // Pushing up (y decreasing) now closes it; pulling down opens it.
        const drag = startLidDrag(100, 300, leaning)
        expect(dragLid(drag, 100, 280, 90, SLOP)!).toBeLessThan(90)
        expect(dragLid(drag, 100, 300, 80, SLOP)!).toBeGreaterThan(80)
    })

    it("opens fully within a comfortable drag from the lid's far edge: a third to the whole canvas height", () => {
        const pixels = LID_ANGLE.open / lidDragGain(DESKTOP)
        expect(pixels / DESKTOP.viewportHeight).toBeGreaterThan(1 / 3)
        expect(pixels / DESKTOP.viewportHeight).toBeLessThanOrEqual(1)
    })
})

describe("the spring", () => {
    it("carries the lid across with the move spring in about a second, without overshoot", () => {
        const lid: LidMotion = { angle: LID_ANGLE.rest, velocity: 0, target: LID_ANGLE.open }
        const angles = run(lid, 3, 60, LID_SPRING.move)
        const share  = (angle: number) => (angle - LID_ANGLE.rest) / (LID_ANGLE.open - LID_ANGLE.rest)
        expect(increasing(angles)).toBe(true)
        expect(Math.max(...angles)).toBeLessThanOrEqual(LID_ANGLE.open)
        expect(share(angles[29])).toBeGreaterThan(0.3) // 0.5 s: well on its way
        expect(share(angles[29])).toBeLessThan(0.9)
        expect(share(angles[71])).toBeGreaterThan(0.98) // 1.2 s: there to the eye
        expect(angles.at(-1)).toBe(LID_ANGLE.open)      // then exactly, and still
        expect(lid.velocity).toBe(0)
    })

    it("takes the same path at 30 and 144 frames a second", () => {
        const at = (fps: number, seconds: number) => {
            const lid: LidMotion = { angle: 0, velocity: 0, target: 90 }
            run(lid, seconds, fps, LID_SPRING.move)
            return lid.angle
        }
        // Each step is the spring's exact solution, so the frame length doesn't matter at all.
        // (Times that are whole frames at both rates: 0.5 s is 15 and 72 frames.)
        expect(at(30, 0.5)).toBeCloseTo(at(144, 0.5), 6)
        expect(at(30, 1)).toBeCloseTo(at(144, 1), 6)
    })

    it("follows a moving hand closely, then settles where the hand let go without passing it", () => {
        const lid: LidMotion = { angle: 12, velocity: 0, target: 12 }
        const angles = [] as number[]
        // The hand lifts the lid at 120°/s for half a second, then lets go at 72°.
        for (let frame = 1; frame <= 30; frame++) {
            lid.target = 12 + 120 * (frame / 60)
            stepLid(lid, 1 / 60, LID_SPRING.follow)
            angles.push(lid.angle)
            expect(lid.target - lid.angle).toBeLessThan(120 * 0.08) // never more than ~80 ms behind
        }
        let frames = 0
        while (stepLid(lid, 1 / 60, LID_SPRING.follow)) {
            angles.push(lid.angle)
            frames++
        }
        expect(lid.angle).toBe(72)
        expect(Math.max(...angles)).toBeLessThanOrEqual(72)
        expect(frames).toBeLessThan(20) // settled within a third of a second
    })

    it("never goes past where the hand has been when the hand turns back", () => {
        const lid: LidMotion = { angle: 20, velocity: 0, target: 20 }
        let highest = 20
        const path = [...Array.from({ length: 20 }, (_, i) => 20 + 3 * (i + 1)), ...Array.from({ length: 20 }, (_, i) => 80 - 3 * (i + 1))]
        for (const target of path) {
            lid.target = target
            highest    = Math.max(highest, target)
            stepLid(lid, 1 / 60, LID_SPRING.follow)
            expect(lid.angle).toBeLessThanOrEqual(highest)
        }
    })

    it("stops dead when it's already on target, and does nothing for an empty frame", () => {
        const lid: LidMotion = { angle: 30, velocity: 50, target: 30 }
        expect(stepLid(lid, 1 / 60, LID_SPRING.follow)).toBe(false)
        expect(lid.velocity).toBe(0)
        const moving: LidMotion = { angle: 30, velocity: 0, target: 60 }
        expect(stepLid(moving, 0, LID_SPRING.follow)).toBe(true)
        expect(moving.angle).toBe(30)
    })

    it("jumps straight to the target for reduced motion", () => {
        const lid: LidMotion = { angle: 10, velocity: 40, target: 90 }
        settleLid(lid)
        expect(lid).toEqual({ angle: 90, velocity: 0, target: 90 })
    })
})

describe("open, closed, awake", () => {
    it("counts as open past openAt and closed below closedAt, with no flicker in between", () => {
        expect(isLidOpen(false, LID_ANGLE.openAt - 1)).toBe(false)
        expect(isLidOpen(false, LID_ANGLE.openAt)).toBe(true)
        expect(isLidOpen(true, LID_ANGLE.openAt - 1)).toBe(true)   // still open on the way down
        expect(isLidOpen(true, LID_ANGLE.closedAt + 1)).toBe(true)
        expect(isLidOpen(true, LID_ANGLE.closedAt)).toBe(false)
    })

    it("wakes as the lid rises past openAt and sleeps as it falls to closedAt, once each", () => {
        expect(lidCrossing(29, 31)).toBe("wake")
        expect(lidCrossing(31, 40)).toBeNull()
        expect(lidCrossing(19, 18)).toBe("sleep")
        expect(lidCrossing(18, 10)).toBeNull()
        expect(lidCrossing(25, 22)).toBeNull() // between the two: no change
        expect(lidCrossing(0, LID_ANGLE.open)).toBe("wake")
        expect(lidCrossing(LID_ANGLE.open, 0)).toBe("sleep")
    })

    it("describes the angle for the lid slider", () => {
        expect(describeLid(0)).toBe("Closed")
        expect(describeLid(45)).toBe("Open 45 degrees")
    })
})
