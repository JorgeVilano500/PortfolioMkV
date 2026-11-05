"use client"

/**
 * The Three.js half of /laptop. LaptopExperience loads it with
 * `next/dynamic(..., { ssr: false })`, so Three.js never runs during server
 * rendering and only downloads on this page.
 *
 * Three.js concepts, in the order they appear below:
 *  1. WebGLRenderer + Scene + PerspectiveCamera: the minimum to draw anything.
 *  2. Image-based lighting: a RoomEnvironment baked by PMREMGenerator gives the
 *     metallic aluminium something to reflect, with no HDR file to download.
 *  3. GLTFLoader: the GLB is downloaded, then parsed, and its parts are found
 *     by name. Until it's in public/, a simpler built-in model with the same
 *     parts (built-in-model.ts) stands in, so the 3D view always works.
 *  4. CanvasTexture: each sticker, the screen, and the keyboard are drawn on 2D
 *     canvases (canvas-art.ts) and mapped onto planes modelled in Blender.
 *     Stickers come from the `slots` prop (Studio edits them live): a
 *     sponsor's image is drawn once it loads, its mark until then.
 *  5. Raycaster: turn a click on the canvas into "which sticker is this?", and
 *     a press into "is this on the lid?". A press on the lid turns the lid;
 *     anywhere else it orbits the camera.
 *  6. OrbitControls + render on demand: there is no continuous loop. A frame
 *     is drawn only when something changes, so an idle page costs nothing.
 *  7. The lid hangs from a pivot on the hinge axis, and only that pivot turns.
 *     A drag sets the angle it heads for, and a critically damped spring
 *     (lib/laptop-lid.ts) draws it there in the same frames. As it lifts past
 *     the wake angle the laptop wakes: the screen boots, then the keyboard
 *     backlight and Touch Bar fade up (emissive materials).
 *  8. Disposal: GPU memory isn't garbage-collected, so everything created here
 *     is released when the component unmounts.
 */
import { useEffect, useEffectEvent, useRef } from "react"
import {
    ACESFilmicToneMapping,
    Box3,
    CanvasTexture,
    DirectionalLight,
    DoubleSide,
    HemisphereLight,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PerspectiveCamera,
    PMREMGenerator,
    Quaternion,
    Raycaster,
    Scene,
    Spherical,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    Vector3,
    WebGLRenderer,
    type Material,
    type Object3D,
    type Texture,
} from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import {
    LAPTOP_MODEL,
    LID_SLOTS,
    PALM_SLOTS,
    STICKER_SLOTS,
    findSlotByNode,
    missingModelNodes,
    spotAccent,
    type StickerSlot,
    type StickerSlotId,
} from "@/lib/laptop-stickers"
import {
    LID_ANGLE,
    LID_JUMP,
    LID_SPRING,
    clampLid,
    dragLid,
    isLidOpen,
    lidCrossing,
    lidDragGain,
    settleLid,
    startLidDrag,
    stepLid,
    type LidDrag,
    type LidMotion,
} from "@/lib/laptop-lid"
import { buildLaptopModel } from "./built-in-model"
import { drawBootScreen, drawDesktop, drawKeyboard, drawRing, drawSticker, loadStickerImage, makeScreenCanvas, paintSticker } from "./canvas-art"

export type ViewerStatus = "loading" | "ready" | "invalid" | "unsupported" | "error"

type LaptopViewerProps = {
    /** What each sticker shows. Changing it repaints only the stickers that changed. */
    slots:         readonly StickerSlot[]
    /**
     * Whether the page wants the laptop open. When the page changes it (the
     * open/close button, a palm-rest spot), the lid swings all the way open or
     * closed. When the visitor moves the lid, the viewer reports through
     * onOpenChange instead, and the page's echo leaves the lid where it is.
     */
    open:          boolean
    selectedId:    StickerSlotId | null
    /** A spot the visitor is pointing at, here or in a list: its sticker glows faintly. */
    hoveredId?:    StickerSlotId | null
    /** Increments each time the page asks for the overview again. */
    resetToken:    number
    reducedMotion: boolean
    /** The lid slider's value in degrees: a new object for each change, even to the same angle. */
    lidRequest?:   { degrees: number } | null
    onSelect:      (id: StickerSlotId) => void
    /** The mouse moved onto (id) or off (null) a sticker, so its tile can light up too. */
    onHover?:      (id: StickerSlotId | null) => void
    onStatus:      (status: ViewerStatus) => void
    /** The visitor moved the lid past open (true) or closed (false). */
    onOpenChange:  (open: boolean) => void
    /** Where the lid is heading, in whole degrees, each time that changes. */
    onLidAngle?:   (degrees: number) => void
}

type Pose = { position: Vector3; target: Vector3 }

type ViewerApi = {
    show:     (open: boolean, id: StickerSlotId | null, instant: boolean) => void
    reset:    (instant: boolean) => void
    setSlots: (slots: readonly StickerSlot[]) => void
    hover:    (id: StickerSlotId | null) => void
    turnLid:  (degrees: number) => void
}

const FOV           = 35
const DRAG_PX       = 6      // a pointer that moved further than this was rotating, not clicking
const HALO_SCALE    = 1.16
// How much a sticker brightens: selected (plus a short flash when chosen), hovered.
const GLOW = { selected: 0.28, flash: 0.55, hovered: 0.16 } as const
const FLASH_MS = 700
const OVERLAY_LAYER = 1      // drawn by the camera, ignored by the raycaster
const MAX_FRAME_MS  = 50     // a stalled frame (a background tab) advances the lid no further than this

const FRONT_ELEVATION = MathUtils.degToRad(20) // the classic open-laptop view: in front, a little above
const ROOM_DIM        = 0.3  // the room dims slightly while the screen is on, so it reads as lit
const KEY_LIGHT       = 1.2
const X_AXIS          = new Vector3(1, 0, 0)

// glTF's convention: the front of the laptop faces +Z, so the hinge is at -Z.
// Viewing the closed lid from the hinge side keeps sticker artwork upright.
const TOWARD_HINGE = new Vector3(0, 0, -0.6)
// Offsets added to a sticker's normal when the camera focuses on it, so the
// artwork reads upright on screen and the camera stays above the desk.
const FOCUS_BIAS = {
    closedLid: new Vector3(0, 0, -0.3),  // from the hinge side
    openLid:   new Vector3(0, 0.45, 0),  // from behind the raised lid, a little above it
    palmRest:  new Vector3(0, 0, 0.5),   // from the typist's side
}

// ─── Timing ───────────────────────────────────────────────────────────────────

type Ease   = (t: number) => number
type Timing = { delay: number; duration: number }

const easeOutCubic: Ease   = (t) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const smoothstep: Ease     = (t) => t * t * (3 - 2 * t)

const GLIDE = { duration: 450, ease: easeOutCubic }    // camera between spots
const SWEEP = { duration: 1700, ease: easeInOutCubic } // camera swinging round as the lid moves

// Milliseconds after the laptop wakes, which is when the lid lifts past
// LID_ANGLE.openAt. Like a real MacBook, the display comes up first and the
// keyboard backlight after it. Sleep is quicker. The lid itself isn't timed:
// it follows the hand (or the button) through the spring in lib/laptop-lid.ts.
const WAKING: Record<"screen" | "keys" | "desktop", Timing> = {
    screen:  { delay: 0,    duration: 500 },
    keys:    { delay: 550,  duration: 900 },
    desktop: { delay: 1250, duration: 600 }, // boot screen → desktop, on the first wake only
}
const SLEEPING: Record<"screen" | "keys", Timing> = {
    screen: { delay: 0, duration: 250 },
    keys:   { delay: 0, duration: 250 },
}

/** One animated number between 0 and 1: the screen's brightness, the backlight… */
type Channel = { value: number; from: number; to: number; start: number; duration: number; ease: Ease }

const channel = (ease: Ease): Channel => ({ value: 0, from: 0, to: 0, start: 0, duration: 1, ease })

/** Start moving `c` toward `to`; with no timing it jumps straight there. */
function animate(c: Channel, to: number, timing: Timing | null, now: number) {
    c.from = c.value
    c.to   = to
    if (!timing) c.value = to
    else {
        c.start    = now + timing.delay
        c.duration = timing.duration
    }
}

/** Advance `c` to `now`. Returns true while it still has somewhere to go. */
function step(c: Channel, now: number): boolean {
    if (c.value === c.to) return false
    const t = MathUtils.clamp((now - c.start) / c.duration, 0, 1)
    c.value = t >= 1 ? c.to : c.from + (c.to - c.from) * c.ease(t)
    return c.value !== c.to
}

export function LaptopViewer({
    slots,
    open,
    selectedId,
    hoveredId = null,
    resetToken,
    reducedMotion,
    lidRequest = null,
    onSelect,
    onHover,
    onStatus,
    onOpenChange,
    onLidAngle,
}: LaptopViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const apiRef       = useRef<ViewerApi | null>(null)

    // Effect events read the latest props without re-running the scene setup.
    const reportStatus = useEffectEvent((status: ViewerStatus) => onStatus(status))
    const selectSlot   = useEffectEvent((id: StickerSlotId) => onSelect(id))
    const hoverSlot    = useEffectEvent((id: StickerSlotId | null) => onHover?.(id))
    const lidOpened    = useEffectEvent((isOpen: boolean) => onOpenChange(isOpen))
    const lidTurned    = useEffectEvent((degrees: number) => onLidAngle?.(degrees))
    const motionReduced = useEffectEvent(() => reducedMotion)
    const initialState = useEffectEvent(() => ({ open, selectedId, slots }))
    const showState    = useEffectEvent(() => apiRef.current?.show(open, selectedId, reducedMotion))
    const resetView    = useEffectEvent(() => apiRef.current?.reset(reducedMotion))

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const abort = new AbortController()
        let unmountScene: (() => void) | null = null

        // The GLB if it's there; until it's in public/, the built-in model stands in.
        const start = async () => {
            const res = await fetch(LAPTOP_MODEL.url, { signal: abort.signal })
            if (!res.ok) {
                await res.body?.cancel() // nothing to read: let the connection go
                if (res.status !== 404) throw new Error(`HTTP ${res.status}`)
            }
            const buffer = res.ok ? await res.arrayBuffer() : null
            if (abort.signal.aborted) return
            if (buffer && buffer.byteLength > LAPTOP_MODEL.softMaxBytes) {
                console.warn(`[laptop] ${LAPTOP_MODEL.url} is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB; aim for under 1 MB (LAPTOP_MODEL.md)`)
            }
            unmountScene = mountLaptopScene(container, buffer, {
                onStatus:      (status) => reportStatus(status),
                onPick:        (id) => selectSlot(id),
                onHover:       (id) => hoverSlot(id),
                onOpenChange:  (isOpen) => lidOpened(isOpen),
                onLidAngle:    (degrees) => lidTurned(degrees),
                onReady:       (api) => { apiRef.current = api },
                initialState:  () => initialState(),
                reducedMotion: () => motionReduced(),
            })
        }
        start().catch((error: unknown) => {
            if (abort.signal.aborted) return
            console.error("[laptop] model failed to load:", error instanceof Error ? error.message : error)
            reportStatus("error")
        })

        return () => {
            abort.abort()
            apiRef.current = null
            unmountScene?.()
        }
    }, [])

    // The lid toggle, keyboard selection, and pointer selection all arrive here as prop changes.
    useEffect(() => {
        showState()
    }, [open, selectedId])

    useEffect(() => {
        if (resetToken > 0) resetView()
    }, [resetToken])

    useEffect(() => {
        apiRef.current?.setSlots(slots)
    }, [slots])

    useEffect(() => {
        apiRef.current?.hover(hoveredId)
    }, [hoveredId])

    useEffect(() => {
        if (lidRequest) apiRef.current?.turnLid(lidRequest.degrees)
    }, [lidRequest])

    return <div ref={containerRef} className="absolute inset-0" />
}

// ─── Scene ────────────────────────────────────────────────────────────────────

type SceneHandlers = {
    onStatus:      (status: ViewerStatus) => void
    onPick:        (id: StickerSlotId) => void
    onHover:       (id: StickerSlotId | null) => void
    onOpenChange:  (open: boolean) => void
    onLidAngle:    (degrees: number) => void
    onReady:       (api: ViewerApi) => void
    initialState:  () => { open: boolean; selectedId: StickerSlotId | null; slots: readonly StickerSlot[] }
    reducedMotion: () => boolean
}

/** The hinge in world space, which way around it opens the lid (±1), and how far the lid reaches: what a drag needs. */
type HingeAxis = { origin: Vector3; direction: Vector3; opens: number; length: number }

/** The parts that change as the laptop opens and wakes, found once the model has loaded. */
type Rig = {
    /** Turn the lid to `degrees` from closed, around the model's own hinge pivot. */
    setLid:          (degrees: number) => void
    bootMaterial:    MeshBasicMaterial
    desktopMaterial: MeshBasicMaterial
    desktopOverlay:  Mesh
    desktopCanvas:   HTMLCanvasElement
    keysMaterial:    MeshStandardMaterial
}

/** Builds the scene inside `container` around a downloaded GLB, or the built-in model when `buffer` is null. Returns the cleanup. */
function mountLaptopScene(container: HTMLElement, buffer: ArrayBuffer | null, handlers: SceneHandlers): () => void {
    let disposed = false

    // ─── 1. Renderer, scene, camera ──────────────────────────────────────
    let renderer: WebGLRenderer
    try {
        renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch {
        handlers.onStatus("unsupported") // WebGL is disabled or unavailable
        return () => {}
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // sharper than 2× just burns GPU
    renderer.toneMapping = ACESFilmicToneMapping
    // Shader checks cost compile time and print driver noise (e.g. D3D X4122
    // warnings on Windows); keep them for development only, as three.js advises.
    renderer.debug.checkShaderErrors = process.env.NODE_ENV !== "production"
    const canvas = renderer.domElement
    canvas.setAttribute("aria-hidden", "true") // the page describes the scene in text
    canvas.className = "block w-full h-full touch-none" // touch-none: drags rotate instead of scrolling
    canvas.style.cursor = "grab"
    container.appendChild(canvas)

    const scene  = new Scene()
    const camera = new PerspectiveCamera(FOV, 1, 0.01, 20) // metres: the model is ~0.3 m wide
    camera.layers.enable(OVERLAY_LAYER)

    // ─── 2. Lighting ─────────────────────────────────────────────────────
    const pmrem       = new PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    scene.environment = environment
    scene.add(new HemisphereLight("#f0eeff", "#0a0a0f", 0.5))
    const keyLight = new DirectionalLight("#ffffff", KEY_LIGHT)
    keyLight.position.set(0.6, 1.2, -0.8)
    scene.add(keyLight)

    // ─── 6a. Render on demand, a camera tween, and the lid ───────────────
    const controls = new OrbitControls(camera, canvas)
    controls.enablePan     = false
    controls.enableDamping = false // damping needs a continuous loop
    controls.maxPolarAngle = Math.PI * 0.49 // stay above the desk

    let frame     = 0
    let lastFrame = 0 // when the previous frame ran, or 0 if the loop had gone idle
    // The camera moves in spherical coordinates around a moving target, so a
    // long move swings round the laptop instead of cutting through it.
    let tween: { fromTarget: Vector3; toTarget: Vector3; from: Spherical; to: Spherical; start: number; duration: number; ease: Ease } | null = null
    const orbit = new Spherical()

    // The lid, in degrees: where it's drawn, how fast it's turning, and where
    // it's heading. It starts slightly open and moves only when asked to.
    const lid: LidMotion = { angle: LID_ANGLE.rest, velocity: 0, target: LID_ANGLE.rest }
    let lidSpring: number = LID_SPRING.follow
    let isOpen      = false // the open state the page last agreed to
    let awake       = false // the screen and keyboard backlight are on
    let lidReported = NaN   // the angle onLidAngle last reported
    const screen  = channel(smoothstep)
    const keys    = channel(smoothstep)
    const desktop = channel(smoothstep)
    let rig: Rig | null = null

    const requestRender = () => {
        if (!frame) frame = requestAnimationFrame(draw)
    }
    const stepTween = (now: number) => {
        if (!tween) return
        const t     = Math.min(1, (now - tween.start) / tween.duration)
        const eased = tween.ease(t)
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased)
        orbit.radius = MathUtils.lerp(tween.from.radius, tween.to.radius, eased)
        orbit.phi    = MathUtils.lerp(tween.from.phi, tween.to.phi, eased)
        orbit.theta  = MathUtils.lerp(tween.from.theta, tween.to.theta, eased)
        camera.position.setFromSpherical(orbit).add(controls.target)
        if (t >= 1) tween = null
        controls.update() // fires "change", which schedules the next frame
    }
    /** Move the lid one frame along its spring, waking or sleeping the laptop as it passes the thresholds. */
    const stepHinge = (dt: number): boolean => {
        const before = lid.angle
        const reduce = handlers.reducedMotion()
        let moving   = false
        if (reduce) settleLid(lid) // direct control, with no settling after release
        else moving = stepLid(lid, dt, lidSpring)
        if (lid.angle !== before) {
            rig?.setLid(lid.angle)
            const crossing = lidCrossing(before, lid.angle)
            if (crossing) setPower(crossing === "wake", reduce)
        }
        return moving
    }
    const stepPower = (now: number): boolean => {
        const moving = [screen, keys, desktop].map((c) => step(c, now)).some(Boolean)
        if (rig) {
            rig.bootMaterial.color.setScalar(screen.value)
            rig.desktopMaterial.color.setScalar(screen.value)
            rig.desktopMaterial.opacity = desktop.value
            rig.desktopOverlay.visible  = desktop.value > 0
            rig.keysMaterial.emissiveIntensity = keys.value
            scene.environmentIntensity = 1 - ROOM_DIM * screen.value
            keyLight.intensity = KEY_LIGHT * (1 - ROOM_DIM * screen.value)
        }
        return moving
    }
    function draw(now: number) {
        frame = 0
        // Seconds since the last frame, so the lid moves at the same speed at
        // any frame rate. After an idle spell, count one ordinary frame.
        const dt = lastFrame ? Math.min(now - lastFrame, MAX_FRAME_MS) / 1000 : 1 / 60
        stepTween(now)
        const turning  = stepHinge(dt)
        const flashing = step(flash, now)
        applyHighlight()
        const moving = stepPower(now) || flashing || turning
        renderer.render(scene, camera)
        lastFrame = moving ? now : 0
        if (moving) requestRender()
    }
    const moveTo = (pose: Pose, instant: boolean, motion: { duration: number; ease: Ease }) => {
        if (instant) {
            tween = null
            camera.position.copy(pose.position)
            controls.target.copy(pose.target)
            controls.update()
        } else {
            const from = new Spherical().setFromVector3(camera.position.clone().sub(controls.target))
            const to   = new Spherical().setFromVector3(pose.position.clone().sub(pose.target))
            // Take the short way round.
            const turn = to.theta - from.theta
            to.theta = from.theta + Math.atan2(Math.sin(turn), Math.cos(turn))
            tween = { fromTarget: controls.target.clone(), toTarget: pose.target, from, to, start: performance.now(), ...motion }
        }
        requestRender()
    }
    /** Wake or sleep the laptop: the screen, the keyboard backlight, and the room light. */
    const setPower = (on: boolean, instant: boolean) => {
        if (on === awake) return
        awake = on
        const now    = performance.now()
        const timing = (t: Timing) => (instant ? null : t)
        if (on) {
            if (rig) {
                drawDesktop(rig.desktopCanvas, new Date()) // the menu-bar clock shows the time of waking
                const texture = rig.desktopMaterial.map
                if (texture) texture.needsUpdate = true
            }
            animate(screen, 1, timing(WAKING.screen), now)
            animate(keys, 1, timing(WAKING.keys), now)
            // Boot once. Later wakes go straight to the desktop, as a sleeping Mac does.
            if (desktop.to < 1) animate(desktop, 1, timing(WAKING.desktop), now)
        } else {
            animate(screen, 0, timing(SLEEPING.screen), now)
            animate(keys, 0, timing(SLEEPING.keys), now)
        }
        requestRender()
    }
    /**
     * Send the lid toward `degrees`. When a hand moved it (a drag or the
     * slider), the page hears as it passes open or closed. A move the page
     * asked for already matches the page.
     */
    const aimLid = (degrees: number, spring: number, fromHand: boolean) => {
        lid.target = clampLid(degrees)
        lidSpring  = spring
        if (fromHand) {
            const open = isLidOpen(isOpen, lid.target)
            if (open !== isOpen) {
                isOpen = open
                setPower(open, handlers.reducedMotion())
                handlers.onOpenChange(open)
            }
        }
        reportLid()
        requestRender()
    }
    const reportLid = () => {
        const rounded = Math.round(lid.target)
        if (rounded === lidReported) return
        lidReported = rounded
        handlers.onLidAngle(rounded)
    }
    controls.addEventListener("change", requestRender)
    controls.addEventListener("start", () => { tween = null }) // the visitor took over the camera

    const resize = () => {
        const width  = container.clientWidth
        const height = container.clientHeight
        if (!width || !height) return
        renderer.setSize(width, height, false) // CSS already sizes the canvas
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        requestRender()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    // ─── 5. Picking stickers and grabbing the lid with a raycaster ───────
    let model: Object3D | null = null
    let hinge: Object3D | null = null   // the Lid pivot: everything under it turns with the lid
    let axis: HingeAxis | null = null
    const stickers  = new Map<StickerSlotId, Mesh>()
    const halos     = new Map<StickerSlotId, Mesh>()

    // ─── 5a. Highlighting: the selected and hovered stickers light up ────
    // Both the frame (halo) and the sticker itself, in the spot's own colour
    // (spotAccent), matching the tile that lights up on the page.
    let selected: StickerSlotId | null = null
    let hovered:  StickerSlotId | null = null
    const accents = new Map<StickerSlotId, string>()
    const flash   = channel(easeOutCubic)
    const applyHighlight = () => {
        for (const [id, halo] of halos) {
            const material = halo.material as MeshBasicMaterial
            halo.visible = id === selected || id === hovered
            material.color.set(accents.get(id) ?? "#7c6dff")
            material.opacity = id === selected ? 1 : 0.55
        }
        for (const [id, mesh] of stickers) {
            const material = mesh.material as MeshStandardMaterial
            material.emissiveIntensity = id === selected ? GLOW.selected + GLOW.flash * flash.value : id === hovered ? GLOW.hovered : 0
        }
    }
    const raycaster = new Raycaster() // tests layer 0 only, so halos and the screen overlay don't count
    const pointer   = new Vector2()

    /** The nearest part of the model under the pointer, if any. */
    const hitAt = (event: PointerEvent) => {
        if (!model) return null
        const rect = canvas.getBoundingClientRect()
        pointer.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)
        // Test the whole model and keep the nearest hit, so a closed lid hides
        // the palm rest and an open lid hides the stickers behind it.
        return raycaster.intersectObject(model, true)[0] ?? null
    }
    const slotOf = (hit: ReturnType<typeof hitAt>) => (hit ? findSlotByNode(hit.object.name)?.id ?? null : null)
    const onLid  = (hit: ReturnType<typeof hitAt>) => Boolean(hit && hinge && isInside(hit.object, hinge))

    /** Degrees of lid per pixel of upward drag, for a press at `point` (lib/laptop-lid.ts). */
    const gainAt = (point: Vector3, hingeAxis: HingeAxis) => {
        const height = Math.max(1, canvas.clientHeight)
        // Where the point would be with the lid a degree further open, to see which way it moves on screen.
        const opened = point.clone().sub(hingeAxis.origin)
            .applyAxisAngle(hingeAxis.direction, hingeAxis.opens * MathUtils.degToRad(1))
            .add(hingeAxis.origin)
        return lidDragGain({
            depth:          point.clone().sub(camera.position).dot(camera.getWorldDirection(new Vector3())),
            fov:            camera.fov,
            viewportHeight: height,
            radius:         distanceFromAxis(point, hingeAxis),
            lidLength:      hingeAxis.length,
            risePerDegree:  ((opened.project(camera).y - point.clone().project(camera).y) * height) / 2,
        })
    }

    // One press at a time. A press on the lid turns it; anywhere else,
    // OrbitControls orbits. Either way, a press that barely moved is a click.
    let press: { id: number; x: number; y: number; drag: LidDrag | null; multi: boolean } | null = null
    let hoverFrame = 0

    const endPress = () => {
        const ended = press
        press = null // first, so the lostpointercapture fired by the release below finds nothing to end
        if (!ended?.drag) return
        controls.enabled = true
        if (canvas.hasPointerCapture(ended.id)) canvas.releasePointerCapture(ended.id)
        canvas.style.cursor = "grab"
    }
    // A capture-phase listener on the container runs before OrbitControls'
    // own pointerdown listener on the canvas, so switching the controls off
    // here means a press on the lid never orbits the camera.
    const onPressCapture = (event: PointerEvent) => {
        if (!event.isPrimary) {
            if (press) press.multi = true // a second finger: a pinch, not a click
            return
        }
        endPress() // a press whose pointerup never arrived
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, drag: null, multi: false }
        if (event.button !== 0 || !axis) return
        const hit = hitAt(event)
        if (!hit || !onLid(hit)) return
        press.drag = startLidDrag(event.clientX, event.clientY, gainAt(hit.point, axis))
        controls.enabled = false
        // Keep the moves coming when the pointer leaves the canvas, as a hand would keep hold of the lid.
        canvas.setPointerCapture(event.pointerId)
        canvas.style.cursor = "ns-resize"
    }
    const onPointerUp = (event: PointerEvent) => {
        if (!press || press.id !== event.pointerId) return
        const { x, y, drag, multi } = press
        endPress()
        // A drag leaves the lid where the hand let go; the spring settles the last degree or two.
        if (drag?.active || multi || Math.hypot(event.clientX - x, event.clientY - y) > DRAG_PX) return
        const id = slotOf(hitAt(event))
        if (id) handlers.onPick(id)
    }
    const onPointerCancel = (event: PointerEvent) => {
        if (press?.id === event.pointerId) endPress()
    }
    let pointerOver: StickerSlotId | null = null
    const reportHover = (id: StickerSlotId | null) => {
        if (id === pointerOver) return
        pointerOver = id
        handlers.onHover(id)
    }
    const onPointerMove = (event: PointerEvent) => {
        if (press?.drag && press.id === event.pointerId) {
            const next = dragLid(press.drag, event.clientX, event.clientY, lid.target, DRAG_PX)
            if (next !== null) aimLid(next, LID_SPRING.follow, true)
            return
        }
        if (event.pointerType !== "mouse" || hoverFrame) return
        hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0
            if (press?.drag) return
            const hit = hitAt(event)
            const id  = slotOf(hit)
            // A sticker can be clicked (or dragged with the lid); the rest of the lid only dragged.
            canvas.style.cursor = id ? "pointer" : onLid(hit) ? "ns-resize" : "grab"
            reportHover(id)
        })
    }
    const onPointerLeave = () => reportHover(null)
    const onContextLost = (event: Event) => {
        event.preventDefault()
        handlers.onStatus("error")
    }
    container.addEventListener("pointerdown", onPressCapture, { capture: true })
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerCancel)
    canvas.addEventListener("lostpointercapture", onPointerCancel)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("webglcontextlost", onContextLost)

    // ─── 3. Parsing the GLB ──────────────────────────────────────────────
    const loader = new GLTFLoader()
    // GLTFLoader decodes embedded images with ImageBitmapLoader, which
    // fetch()es a blob: URL that this site's CSP (connect-src 'self')
    // blocks. TextureLoader uses an <img>, which img-src allows for blob:.
    loader.register((parser) => {
        parser.textureLoader = new TextureLoader(parser.options.manager)
        return { name: "csp_safe_textures" }
    })
    const ringTextures = new Map<number, Texture>()

    const load = async () => {
        const root = buffer ? (await loader.parseAsync(buffer, "")).scene : buildLaptopModel()
        if (disposed) return disposeObject(root)

        // Contract check (LAPTOP_MODEL.md §1): every part by name, on the right side of the hinge.
        const problems = checkContract(root)
        if (problems.length > 0) {
            console.warn(`[laptop] ${LAPTOP_MODEL.url} ${problems.join("; ")} (see LAPTOP_MODEL.md)`)
            disposeObject(root)
            return handlers.onStatus("invalid")
        }
        scene.add(root)
        root.updateMatrixWorld(true)
        model = root
        const part = (name: string) => root.getObjectByName(name) as Mesh

        // ─── 4. Artwork on the modelled planes ───────────────────────────
        const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        // One canvas per sticker, repainted in place when its spot changes.
        const art = new Map<StickerSlotId, { canvas: HTMLCanvasElement; texture: CanvasTexture; key: string; version: number }>()
        for (const slot of STICKER_SLOTS) {
            const mesh    = part(slot.node)
            const canvas  = drawSticker(slot)
            const texture = makeTexture(canvas, anisotropy)
            replaceMaterial(mesh, makeStickerMaterial(texture))
            art.set(slot.id, { canvas, texture, key: JSON.stringify(slot.sponsor), version: 0 })
            let ring = ringTextures.get(slot.aspect)
            if (!ring) ringTextures.set(slot.aspect, ring = makeRingTexture(slot.aspect))
            stickers.set(slot.id, mesh)
            halos.set(slot.id, addHalo(mesh, ring))
        }
        const paint = (slot: StickerSlot) => {
            const entry = art.get(slot.id)
            const key   = JSON.stringify(slot.sponsor)
            if (!entry || entry.key === key) return
            entry.key = key
            const version = ++entry.version
            paintSticker(entry.canvas, slot)
            entry.texture.needsUpdate = true
            requestRender()
            const url = slot.sponsor?.imageUrl
            if (!url) return
            loadStickerImage(url)
                .then((image) => {
                    // A newer edit (or unmount) wins over a slow image.
                    if (disposed || entry.version !== version) return
                    paintSticker(entry.canvas, slot, image)
                    entry.texture.needsUpdate = true
                    requestRender()
                })
                .catch((error: unknown) => console.warn("[laptop]", error instanceof Error ? error.message : error))
        }
        const setSlots = (slots: readonly StickerSlot[]) => {
            for (const slot of slots) {
                accents.set(slot.id, spotAccent(slot))
                paint(slot)
            }
            applyHighlight()
            requestRender()
        }
        // The canvases start from the built-in layout; bring them up to the page's data.
        for (const entry of art.values()) entry.key = ""
        setSlots(handlers.initialState().slots)

        // The screen shows a boot screen under a desktop that fades in over it.
        const screenMesh      = part(LAPTOP_MODEL.nodes.screen)
        const bootMaterial    = makeScreenMaterial(drawBootScreen(), anisotropy)
        const desktopCanvas   = makeScreenCanvas()
        drawDesktop(desktopCanvas, new Date())
        const desktopMaterial = makeScreenMaterial(desktopCanvas, anisotropy, true)
        replaceMaterial(screenMesh, bootMaterial)
        const desktopOverlay  = addOverlay(screenMesh, desktopMaterial)

        const keysMaterial = makeKeyboardMaterial(anisotropy)
        replaceMaterial(part(LAPTOP_MODEL.nodes.keyboard), keysMaterial)

        // ─── 7. The hinge ────────────────────────────────────────────────
        // Only this pivot turns. The lid's parts hang from it, so the stickers,
        // their halos and the screen ride along; the base never moves.
        const pivot    = root.getObjectByName(LAPTOP_MODEL.nodes.lid)!
        const lidOuter = root.getObjectByName(LAPTOP_MODEL.nodes.lidOuter)!
        const closed   = pivot.quaternion.clone()
        const turn     = new Quaternion()
        let openSign   = -1 // opening is a negative turn around X when the Lid empty follows the doc
        const setLid = (degrees: number) => {
            pivot.quaternion.copy(closed).multiply(turn.setFromAxisAngle(X_AXIS, openSign * MathUtils.degToRad(degrees)))
            pivot.updateMatrixWorld(true)
        }
        // Check which way is "open": the lid's outside must rise above the
        // hinge, not swing down through the base. Tolerates a flipped empty.
        const outerHeight = (degrees: number) => {
            setLid(degrees)
            return new Box3().setFromObject(lidOuter).getCenter(new Vector3()).y
        }
        const hingeOrigin = pivot.getWorldPosition(new Vector3())
        if (outerHeight(LID_ANGLE.open / 2) < hingeOrigin.y) openSign = 1

        // What a drag needs: the hinge line in world space (turning around X
        // leaves it in place), and how far the lid reaches from it.
        setLid(LID_ANGLE.closed)
        const hingeLine = { origin: hingeOrigin, direction: X_AXIS.clone().transformDirection(pivot.matrixWorld) }
        axis  = { ...hingeLine, opens: openSign, length: farthestFromAxis(new Box3().setFromObject(lidOuter), hingeLine) }
        hinge = pivot
        setLid(lid.angle)
        rig = { setLid, bootMaterial, desktopMaterial, desktopOverlay, desktopCanvas, keysMaterial }

        /** Measure something with the lid posed at `degrees`, then put it back. */
        function withLid<T>(degrees: number, measure: () => T): T {
            setLid(degrees)
            const result = measure()
            setLid(lid.angle)
            return result
        }

        // Framing: the resting laptop from the lid's side, the open one from the front.
        const closedBounds = withLid(LID_ANGLE.rest, () => new Box3().setFromObject(root))
        const closedCenter = closedBounds.getCenter(new Vector3())
        const radius       = closedBounds.getSize(new Vector3()).length() / 2
        const openBounds   = withLid(LID_ANGLE.open, () => new Box3().setFromObject(root))
        const openCenter   = openBounds.getCenter(new Vector3())
        const openSize     = openBounds.getSize(new Vector3())
        const lidUp        = withLid(LID_ANGLE.closed, () => averageNormal(LID_SLOTS.map((slot) => stickers.get(slot.id)!)))
        controls.minDistance = radius * 0.4
        controls.maxDistance = radius * 6

        const overview = (open: boolean): Pose => {
            if (!open) {
                const direction = lidUp.clone().add(TOWARD_HINGE).normalize()
                return { position: closedCenter.clone().addScaledVector(direction, fitDistance(radius, camera)), target: closedCenter.clone() }
            }
            // The classic open-MacBook view: straight on, a little above the keyboard.
            const direction = new Vector3(0, Math.sin(FRONT_ELEVATION), Math.cos(FRONT_ELEVATION))
            const height    = openSize.y * Math.cos(FRONT_ELEVATION) + openSize.z * Math.sin(FRONT_ELEVATION)
            const distance  = fitBoxDistance(openSize.x, height, camera) + (openSize.z / 2) * Math.cos(FRONT_ELEVATION)
            return { position: openCenter.clone().addScaledVector(direction, distance), target: openCenter.clone() }
        }
        // Measured where the lid is heading, which may be anywhere the visitor left it.
        const focusOn = (slot: StickerSlot, mesh: Mesh, open: boolean): Pose => withLid(lid.target, () => {
            const geometry = mesh.geometry
            if (!geometry.boundingSphere) geometry.computeBoundingSphere()
            const sphere = geometry.boundingSphere!
            const target = sphere.center.clone().applyMatrix4(mesh.matrixWorld)
            const size   = sphere.radius * mesh.getWorldScale(new Vector3()).x
            const bias   = slot.surface === "palm-rest" ? FOCUS_BIAS.palmRest : open ? FOCUS_BIAS.openLid : FOCUS_BIAS.closedLid
            const direction = meshNormal(mesh).add(bias).normalize()
            return { position: target.clone().addScaledVector(direction, fitDistance(size * 2.4, camera)), target }
        })

        const api: ViewerApi = {
            show: (open, id, instant) => {
                // While a hand holds the lid, a different `open` can only be
                // the page catching up with an earlier report: the hand wins.
                const toggled = open !== isOpen && !press?.drag?.active
                if (toggled) {
                    isOpen = open
                    // Closing puts the display to sleep before the lid comes
                    // down; opening wakes it as the lid lifts (stepHinge).
                    if (!open) setPower(false, instant)
                    aimLid(open ? LID_ANGLE.open : LID_ANGLE.closed, LID_SPRING.move, false)
                    if (instant) {
                        settleLid(lid)
                        setLid(lid.angle)
                        setPower(open, true)
                    }
                }
                const picked = id !== selected
                if (picked) {
                    selected = id
                    // A short flash says "this one", unless motion is reduced.
                    flash.value = id && !instant ? 1 : 0
                    if (flash.value) animate(flash, 0, { delay: 0, duration: FLASH_MS }, performance.now())
                }
                applyHighlight()
                // The visitor moved the lid (and the page may have dropped a
                // spot it now hides): leave the camera where they put it.
                if (!toggled && !(picked && id)) return requestRender()
                const slot = id ? STICKER_SLOTS.find((s) => s.id === id) : undefined
                const mesh = id ? stickers.get(id) : undefined
                // Swing round with the lid when it moves; glide between spots otherwise.
                moveTo(slot && mesh ? focusOn(slot, mesh, open) : overview(open), instant, toggled ? SWEEP : GLIDE)
            },
            reset: (instant) => moveTo(overview(isOpen), instant, GLIDE),
            setSlots,
            hover: (id) => {
                hovered = id
                applyHighlight()
                requestRender()
            },
            // The slider: a step of a few degrees follows like a hand; a jump (Home, End, a click on the track) travels.
            turnLid: (degrees) => aimLid(degrees, Math.abs(degrees - lid.target) > LID_JUMP ? LID_SPRING.move : LID_SPRING.follow, true),
        }
        moveTo(overview(false), true, GLIDE)
        const initial = handlers.initialState()
        if (initial.open || initial.selectedId) api.show(initial.open, initial.selectedId, true)
        reportLid() // the slider starts where the lid rests
        handlers.onReady(api)
        handlers.onStatus("ready")
    }

    load().catch((error: unknown) => {
        if (disposed) return
        console.error("[laptop] model failed to parse:", error instanceof Error ? error.message : error)
        handlers.onStatus("error")
    })

    // ─── 8. Disposal ─────────────────────────────────────────────────────
    return () => {
        disposed = true
        cancelAnimationFrame(frame)
        cancelAnimationFrame(hoverFrame)
        observer.disconnect()
        press = null
        container.removeEventListener("pointerdown", onPressCapture, { capture: true })
        canvas.removeEventListener("pointerup", onPointerUp)
        canvas.removeEventListener("pointercancel", onPointerCancel)
        canvas.removeEventListener("lostpointercapture", onPointerCancel)
        canvas.removeEventListener("pointermove", onPointerMove)
        canvas.removeEventListener("pointerleave", onPointerLeave)
        canvas.removeEventListener("webglcontextlost", onContextLost)
        controls.dispose()
        disposeObject(scene)
        for (const ring of ringTextures.values()) ring.dispose()
        environment.dispose()
        renderer.dispose()
        renderer.forceContextLoss() // free the context now, not when the GC gets to it
        canvas.remove()
    }
}

// ─── Contract ─────────────────────────────────────────────────────────────────

/** Problems with a loaded model, as short phrases for the console. Empty means it's usable. */
function checkContract(root: Object3D): string[] {
    const { lid, lidOuter, screen, keyboard } = LAPTOP_MODEL.nodes
    const found = new Map<string, Object3D>()
    root.traverse((object) => {
        if (object.name && !found.has(object.name)) found.set(object.name, object)
    })
    // The lid and its outside may be empties or groups; every other part is a
    // single mesh (one material), because the viewer swaps its material.
    const present = [...found].filter(([name, object]) => name === lid || name === lidOuter || (object as Mesh).isMesh)
    const missing = missingModelNodes(present.map(([name]) => name))
    if (missing.length > 0) return [`is missing: ${missing.join(", ")}`]

    // Parts must hang off the right side of the hinge, or opening the lid
    // would leave the screen behind or carry the keyboard with it.
    const hinge  = found.get(lid)!
    const onLid  = [lidOuter, screen, ...LID_SLOTS.map((slot) => slot.node)]
    const offLid = [keyboard, ...PALM_SLOTS.map((slot) => slot.node)]
    return [
        ...onLid.filter((name) => !isInside(found.get(name)!, hinge)).map((name) => `has ${name} outside ${lid}`),
        ...offLid.filter((name) => isInside(found.get(name)!, hinge)).map((name) => `has ${name} inside ${lid}`),
    ]
}

function isInside(object: Object3D, ancestor: Object3D): boolean {
    for (let node = object.parent; node; node = node.parent) if (node === ancestor) return true
    return false
}

// ─── Materials (the artwork itself is drawn in canvas-art.ts) ─────────────────

function makeTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.flipY      = false // glTF UVs put v = 0 at the top of the image
    texture.anisotropy = anisotropy
    return texture
}

function makeStickerMaterial(map: CanvasTexture): MeshStandardMaterial {
    return new MeshStandardMaterial({
        map,
        emissive:            "#ffffff",
        emissiveMap:         map, // lights the sticker's own colours when it's selected or hovered
        emissiveIntensity:   0,
        transparent:         true, // rounded corners
        roughness:           0.45, // satin vinyl
        metalness:           0,
        side:                DoubleSide, // forgiving if the plane's normal was flipped in Blender
        polygonOffset:       true, // draw over the surface even if the plane sits flush with it
        polygonOffsetFactor: -2,
        polygonOffsetUnits:  -2,
    })
}

function makeRingTexture(aspect: number): Texture {
    const texture = new CanvasTexture(drawRing(aspect))
    texture.colorSpace = SRGBColorSpace
    return texture
}

/** A violet frame around a sticker, shown while it's selected. */
function addHalo(sticker: Mesh, ring: Texture): Mesh {
    const halo = new Mesh(sticker.geometry, new MeshBasicMaterial({
        map:                 ring,
        color:               "#7c6dff",
        transparent:         true,
        depthWrite:          false,
        side:                DoubleSide,
        polygonOffset:       true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits:  -1,
    }))
    // Grow around the plane's centre rather than its origin, wherever that is.
    if (!sticker.geometry.boundingBox) sticker.geometry.computeBoundingBox()
    const center = sticker.geometry.boundingBox!.getCenter(new Vector3())
    halo.scale.setScalar(HALO_SCALE)
    halo.position.copy(center).multiplyScalar(1 - HALO_SCALE)
    halo.name    = `${sticker.name}_Halo`
    halo.visible = false
    halo.layers.set(OVERLAY_LAYER)
    // Draw before the sticker: its see-through margin still writes depth, which
    // would otherwise hide the ring's inner edge behind a square-cornered frame.
    halo.renderOrder = -1
    sticker.add(halo)
    return halo
}

/** A display: unlit (it makes its own light) and exempt from tone mapping, so colours stay true. */
function makeScreenMaterial(canvas: HTMLCanvasElement, anisotropy: number, overlay = false): MeshBasicMaterial {
    return new MeshBasicMaterial({
        map:         makeTexture(canvas, anisotropy),
        color:       "#000000", // brightness: 0 is off; the timeline raises it
        toneMapped:  false,
        side:        DoubleSide,
        ...(overlay && {
            transparent:         true,
            opacity:             0,
            depthWrite:          false,
            polygonOffset:       true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits:  -1,
        }),
    })
}

/** A copy of `mesh` in the same place, for a second image that fades in over the first. */
function addOverlay(mesh: Mesh, material: MeshBasicMaterial): Mesh {
    const overlay = new Mesh(mesh.geometry, material)
    overlay.name    = `${mesh.name}_Overlay`
    overlay.visible = false
    overlay.layers.set(OVERLAY_LAYER)
    mesh.add(overlay)
    return overlay
}

/** Keycaps in daylight as the colour map, the backlight as the emissive map. */
function makeKeyboardMaterial(anisotropy: number): MeshStandardMaterial {
    return new MeshStandardMaterial({
        map:                 makeTexture(drawKeyboard("caps"), anisotropy),
        emissiveMap:         makeTexture(drawKeyboard("glow"), anisotropy),
        emissive:            "#ffffff",
        emissiveIntensity:   0, // the backlight: the timeline raises it
        transparent:         true, // the aluminium shows between the keys
        roughness:           0.55,
        metalness:           0,
        side:                DoubleSide,
        polygonOffset:       true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits:  -2,
    })
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Which way a flat plane faces, in world space. */
function meshNormal(mesh: Mesh): Vector3 {
    const normals = mesh.geometry.getAttribute("normal")
    if (!normals) return new Vector3(0, 1, 0)
    return new Vector3().fromBufferAttribute(normals, 0).transformDirection(mesh.matrixWorld)
}

/** How far `point` is from a line through `origin` along the unit vector `direction`. */
function distanceFromAxis(point: Vector3, { origin, direction }: Pick<HingeAxis, "origin" | "direction">): number {
    const offset = point.clone().sub(origin)
    return offset.addScaledVector(direction, -offset.dot(direction)).length()
}

/** The farthest corner of `box` from the line: how far the lid reaches from its hinge. */
function farthestFromAxis(box: Box3, line: Pick<HingeAxis, "origin" | "direction">): number {
    let farthest = 0
    for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) farthest = Math.max(farthest, distanceFromAxis(new Vector3(x, y, z), line))
        }
    }
    return farthest
}

/** The lid's outward direction, averaged over the sticker planes that sit on it. */
function averageNormal(meshes: Mesh[]): Vector3 {
    const sum = meshes.reduce((acc, mesh) => acc.add(meshNormal(mesh)), new Vector3())
    return sum.lengthSq() > 1e-6 ? sum.normalize() : new Vector3(0, 1, 0)
}

/** Camera distance at which a sphere of `radius` fills the narrower field of view. */
function fitDistance(radius: number, camera: PerspectiveCamera): number {
    const vertical   = MathUtils.degToRad(camera.fov)
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect)
    return (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.05
}

/** Camera distance at which a face-on rectangle fits the view, with a small margin. */
function fitBoxDistance(width: number, height: number, camera: PerspectiveCamera): number {
    const vertical   = MathUtils.degToRad(camera.fov)
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect)
    return Math.max(width / 2 / Math.tan(horizontal / 2), height / 2 / Math.tan(vertical / 2)) * 1.12
}

// ─── Disposal ─────────────────────────────────────────────────────────────────

function replaceMaterial(mesh: Mesh, material: Material) {
    const placeholder = mesh.material
    mesh.material = material
    for (const old of Array.isArray(placeholder) ? placeholder : [placeholder]) disposeMaterial(old)
}

function disposeMaterial(material: Material) {
    for (const value of Object.values(material)) {
        if (value && typeof value === "object" && (value as Texture).isTexture) (value as Texture).dispose()
    }
    material.dispose()
}

function disposeObject(root: Object3D) {
    root.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) disposeMaterial(material)
    })
}
