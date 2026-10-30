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
 *  3. GLTFLoader: the GLB is downloaded first (a missing file never creates a
 *     WebGL context), then parsed, and its parts are found by name.
 *  4. CanvasTexture: each sticker is drawn on a 2D canvas from the sample data
 *     and mapped onto the sticker plane that was modelled in Blender.
 *  5. Raycaster: turn a click on the canvas into "which sticker is this?".
 *  6. OrbitControls + render on demand: there is no continuous loop. A frame
 *     is drawn only when something changes, so an idle page costs nothing.
 *  7. Disposal: GPU memory isn't garbage-collected, so everything created here
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
    Raycaster,
    Scene,
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
    STICKER_SLOTS,
    findSlotByNode,
    missingModelNodes,
    type StickerSlot,
    type StickerSlotId,
} from "@/lib/laptop-stickers"
import type { PostTheme } from "@/lib/theme"

export type ViewerStatus = "loading" | "ready" | "missing" | "invalid" | "unsupported" | "error"

type LaptopViewerProps = {
    selectedId:    StickerSlotId | null
    /** Increments each time the page asks for the overview again. */
    resetToken:    number
    reducedMotion: boolean
    onSelect:      (id: StickerSlotId) => void
    onStatus:      (status: ViewerStatus) => void
}

type Pose = { position: Vector3; target: Vector3 }

type ViewerApi = {
    select: (id: StickerSlotId | null, instant: boolean) => void
    reset:  (instant: boolean) => void
}

const FOV          = 35
const TWEEN_MS     = 450
const DRAG_PX      = 6      // a pointer that moved further than this was rotating, not clicking
const HALO_SCALE   = 1.16
const STICKER_PX   = 512

// glTF's convention: the front of the laptop faces +Z, so the hinge is at -Z.
// Viewing from the hinge side keeps sticker artwork upright on screen.
const TOWARD_HINGE = new Vector3(0, 0, -0.6)

// Sticker artwork uses the site palette (DESIGN_SYSTEM.md §2), with a white
// die-cut edge like a real vinyl sticker.
const STICKER_COLORS: Record<PostTheme, { fill: string; ink: string }> = {
    purple: { fill: "#7c6dff", ink: "#ffffff" },
    green:  { fill: "#97C459", ink: "#0f1a14" },
    pink:   { fill: "#ED93B1", ink: "#1a1216" },
}

export function LaptopViewer({ selectedId, resetToken, reducedMotion, onSelect, onStatus }: LaptopViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const apiRef       = useRef<ViewerApi | null>(null)

    // Effect events read the latest props without re-running the scene setup.
    const reportStatus  = useEffectEvent((status: ViewerStatus) => onStatus(status))
    const selectSlot    = useEffectEvent((id: StickerSlotId) => onSelect(id))
    const initialFocus  = useEffectEvent(() => selectedId)
    const focusSelected = useEffectEvent((id: StickerSlotId | null) => apiRef.current?.select(id, reducedMotion))
    const resetView     = useEffectEvent(() => apiRef.current?.reset(reducedMotion))

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const abort = new AbortController()
        let unmountScene: (() => void) | null = null

        // Download first: when the file is missing, no WebGL context is ever created.
        const start = async () => {
            const res = await fetch(LAPTOP_MODEL.url, { signal: abort.signal })
            if (res.status === 404) return reportStatus("missing")
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const buffer = await res.arrayBuffer()
            if (abort.signal.aborted) return
            if (buffer.byteLength > LAPTOP_MODEL.softMaxBytes) {
                console.warn(`[laptop] ${LAPTOP_MODEL.url} is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB; aim for under 1 MB (LAPTOP_MODEL.md)`)
            }
            unmountScene = mountLaptopScene(container, buffer, {
                onStatus:         (status) => reportStatus(status),
                onPick:           (id) => selectSlot(id),
                onReady:          (api) => { apiRef.current = api },
                initialSelection: () => initialFocus(),
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

    // Keyboard and pointer selection both arrive here as a prop change.
    useEffect(() => {
        focusSelected(selectedId)
    }, [selectedId])

    useEffect(() => {
        if (resetToken > 0) resetView()
    }, [resetToken])

    return <div ref={containerRef} className="absolute inset-0" />
}

// ─── Scene ────────────────────────────────────────────────────────────────────

type SceneHandlers = {
    onStatus:         (status: ViewerStatus) => void
    onPick:           (id: StickerSlotId) => void
    onReady:          (api: ViewerApi) => void
    initialSelection: () => StickerSlotId | null
}

/** Builds the scene around a downloaded GLB inside `container`. Returns the cleanup. */
function mountLaptopScene(container: HTMLElement, buffer: ArrayBuffer, handlers: SceneHandlers): () => void {
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

    // ─── 2. Lighting ─────────────────────────────────────────────────────
    const pmrem       = new PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    scene.environment = environment
    scene.add(new HemisphereLight("#f0eeff", "#0a0a0f", 0.5))
    const keyLight = new DirectionalLight("#ffffff", 1.2)
    keyLight.position.set(0.6, 1.2, -0.8)
    scene.add(keyLight)

    // ─── 6a. Render on demand, plus a small camera tween ─────────────────
    const controls = new OrbitControls(camera, canvas)
    controls.enablePan     = false
    controls.enableDamping = false // damping needs a continuous loop
    controls.maxPolarAngle = Math.PI * 0.49 // stay above the desk

    let frame = 0
    let tween: { from: Pose; to: Pose; start: number } | null = null

    const requestRender = () => {
        if (!frame) frame = requestAnimationFrame(draw)
    }
    const stepTween = (now: number) => {
        if (!tween) return
        const t     = Math.min(1, (now - tween.start) / TWEEN_MS)
        const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
        camera.position.lerpVectors(tween.from.position, tween.to.position, eased)
        controls.target.lerpVectors(tween.from.target, tween.to.target, eased)
        if (t >= 1) tween = null
        controls.update() // fires "change", which schedules the next frame
    }
    function draw(now: number) {
        frame = 0
        stepTween(now)
        renderer.render(scene, camera)
    }
    const moveTo = (pose: Pose, instant: boolean) => {
        if (instant) {
            tween = null
            camera.position.copy(pose.position)
            controls.target.copy(pose.target)
            controls.update()
        } else {
            tween = {
                from:  { position: camera.position.clone(), target: controls.target.clone() },
                to:    pose,
                start: performance.now(),
            }
        }
        requestRender()
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

    // ─── 5. Picking stickers with a raycaster ────────────────────────────
    const stickers  = new Map<StickerSlotId, Mesh>()
    const halos     = new Map<StickerSlotId, Mesh>()
    const raycaster = new Raycaster()
    const pointer   = new Vector2()

    const pick = (event: PointerEvent): StickerSlotId | null => {
        if (stickers.size === 0) return null
        const rect = canvas.getBoundingClientRect()
        pointer.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects([...stickers.values()], false)[0]
        return hit ? findSlotByNode(hit.object.name)?.id ?? null : null
    }

    let pressed: { x: number; y: number; id: number } | null = null
    let hoverFrame = 0
    const onPointerDown = (event: PointerEvent) => {
        pressed = { x: event.clientX, y: event.clientY, id: event.pointerId }
    }
    const onPointerUp = (event: PointerEvent) => {
        if (!pressed || pressed.id !== event.pointerId) return
        const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y)
        pressed = null
        if (moved > DRAG_PX) return
        const id = pick(event)
        if (id) handlers.onPick(id)
    }
    const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || hoverFrame) return
        hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0
            canvas.style.cursor = pick(event) ? "pointer" : "grab"
        })
    }
    const onContextLost = (event: Event) => {
        event.preventDefault()
        handlers.onStatus("error")
    }
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointermove", onPointerMove)
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
    let ringTexture: Texture | null = null

    const load = async () => {
        const gltf = await loader.parseAsync(buffer, "")
        const model = gltf.scene
        if (disposed) return disposeObject(model)

        // Contract check: the lid's outside and four sticker planes, by name.
        const meshNames: string[] = []
        let hasLidOuter = false
        model.traverse((object) => {
            if (object.name === LAPTOP_MODEL.lidOuterNode) hasLidOuter = true
            if ((object as Mesh).isMesh) meshNames.push(object.name)
        })
        const missing = missingModelNodes(hasLidOuter ? [...meshNames, LAPTOP_MODEL.lidOuterNode] : meshNames)
        if (missing.length > 0) {
            console.warn(`[laptop] ${LAPTOP_MODEL.url} is missing: ${missing.join(", ")} (see LAPTOP_MODEL.md)`)
            disposeObject(model)
            return handlers.onStatus("invalid")
        }
        scene.add(model)
        model.updateMatrixWorld(true)

        // ─── 4. Sticker artwork on the modelled sticker planes ───────────
        const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        ringTexture = makeRingTexture()
        for (const slot of STICKER_SLOTS) {
            const mesh = model.getObjectByName(slot.node) as Mesh
            const placeholder = mesh.material
            mesh.material = makeStickerMaterial(slot, anisotropy)
            for (const material of Array.isArray(placeholder) ? placeholder : [placeholder]) disposeMaterial(material)
            stickers.set(slot.id, mesh)
            halos.set(slot.id, addHalo(mesh, ringTexture))
        }

        // Frame the whole laptop, looking at the lid's outside.
        const bounds = new Box3().setFromObject(model)
        const center = bounds.getCenter(new Vector3())
        const radius = bounds.getSize(new Vector3()).length() / 2
        const lidUp  = averageNormal([...stickers.values()])
        controls.minDistance = radius * 0.4
        controls.maxDistance = radius * 6

        const overview = (): Pose => {
            const direction = lidUp.clone().add(TOWARD_HINGE).normalize()
            return { position: center.clone().addScaledVector(direction, fitDistance(radius, camera)), target: center.clone() }
        }
        const focusOn = (mesh: Mesh): Pose => {
            const geometry = mesh.geometry
            if (!geometry.boundingSphere) geometry.computeBoundingSphere()
            const sphere    = geometry.boundingSphere!
            const target    = sphere.center.clone().applyMatrix4(mesh.matrixWorld)
            const size      = sphere.radius * mesh.getWorldScale(new Vector3()).x
            const direction = meshNormal(mesh).add(TOWARD_HINGE.clone().multiplyScalar(0.5)).normalize()
            return { position: target.clone().addScaledVector(direction, fitDistance(size * 2.4, camera)), target }
        }

        const api: ViewerApi = {
            select: (id, instant) => {
                for (const [slotId, halo] of halos) halo.visible = slotId === id
                const mesh = id ? stickers.get(id) : undefined
                if (mesh) moveTo(focusOn(mesh), instant)
                else requestRender()
            },
            reset: (instant) => moveTo(overview(), instant),
        }
        moveTo(overview(), true)
        const preselected = handlers.initialSelection()
        if (preselected) api.select(preselected, true)
        handlers.onReady(api)
        handlers.onStatus("ready")
    }

    load().catch((error: unknown) => {
        if (disposed) return
        console.error("[laptop] model failed to parse:", error instanceof Error ? error.message : error)
        handlers.onStatus("error")
    })

    // ─── 7. Disposal ─────────────────────────────────────────────────────
    return () => {
        disposed = true
        cancelAnimationFrame(frame)
        cancelAnimationFrame(hoverFrame)
        observer.disconnect()
        canvas.removeEventListener("pointerdown", onPointerDown)
        canvas.removeEventListener("pointerup", onPointerUp)
        canvas.removeEventListener("pointermove", onPointerMove)
        canvas.removeEventListener("webglcontextlost", onContextLost)
        controls.dispose()
        disposeObject(scene)
        ringTexture?.dispose()
        environment.dispose()
        renderer.dispose()
        renderer.forceContextLoss() // free the context now, not when the GC gets to it
        canvas.remove()
    }
}

// ─── Sticker artwork ──────────────────────────────────────────────────────────

function drawSticker(slot: StickerSlot): HTMLCanvasElement {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = STICKER_PX
    const ctx = canvas.getContext("2d")
    if (!ctx) return canvas

    const inset = 18
    const size  = STICKER_PX - inset * 2
    const mid   = STICKER_PX / 2
    ctx.beginPath()
    ctx.roundRect(inset, inset, size, size, 96)
    ctx.textAlign    = "center"
    ctx.textBaseline = "middle"

    if (slot.sponsor) {
        const colors = STICKER_COLORS[slot.sponsor.theme]
        ctx.fillStyle = colors.fill
        ctx.fill()
        ctx.lineWidth   = 14
        ctx.strokeStyle = "#f0eeff"
        ctx.stroke()
        ctx.fillStyle = colors.ink
        fillFittedText(ctx, slot.sponsor.mark, mid, mid - 30, size - 90, 190, "800")
        fillFittedText(ctx, slot.sponsor.name, mid, mid + 130, size - 90, 44, "600")
    } else {
        ctx.fillStyle = "rgba(19, 18, 28, 0.88)" // #13121c, the card surface
        ctx.fill()
        ctx.setLineDash([30, 22])
        ctx.lineWidth   = 12
        ctx.strokeStyle = "#7c6dff"
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = "#AFA9EC"
        fillFittedText(ctx, "YOUR", mid, mid - 60, size - 120, 96, "800")
        fillFittedText(ctx, "LOGO", mid, mid + 40, size - 120, 96, "800")
        ctx.fillStyle = "#c4c0d8"
        fillFittedText(ctx, "Open spot", mid, mid + 140, size - 120, 40, "600")
    }
    return canvas
}

/** Shrink the font until the text fits the sticker's width. */
function fillFittedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxPx: number, weight: string) {
    let px = maxPx
    do {
        ctx.font = `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`
        px -= 4
    } while (px > 12 && ctx.measureText(text).width > maxWidth)
    ctx.fillText(text, x, y)
}

function makeStickerMaterial(slot: StickerSlot, anisotropy: number): MeshStandardMaterial {
    const texture = new CanvasTexture(drawSticker(slot))
    texture.colorSpace = SRGBColorSpace
    texture.flipY      = false // glTF UVs put v = 0 at the top of the image
    texture.anisotropy = anisotropy
    return new MeshStandardMaterial({
        map:                 texture,
        transparent:         true, // rounded corners
        roughness:           0.45, // satin vinyl
        metalness:           0,
        side:                DoubleSide, // forgiving if the plane's normal was flipped in Blender
        polygonOffset:       true, // draw over the lid even if the plane sits flush with it
        polygonOffsetFactor: -2,
        polygonOffsetUnits:  -2,
    })
}

/** A rounded violet frame, shown around the selected sticker. */
function makeRingTexture(): Texture {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext("2d")
    if (ctx) {
        ctx.beginPath()
        ctx.roundRect(10, 10, 236, 236, 52)
        ctx.lineWidth   = 14
        ctx.strokeStyle = "#ffffff" // tinted by the material colour
        ctx.stroke()
    }
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return texture
}

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
    sticker.add(halo)
    return halo
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Which way a flat sticker plane faces, in world space. */
function meshNormal(mesh: Mesh): Vector3 {
    const normals = mesh.geometry.getAttribute("normal")
    if (!normals) return new Vector3(0, 1, 0)
    return new Vector3().fromBufferAttribute(normals, 0).transformDirection(mesh.matrixWorld)
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

// ─── Disposal ─────────────────────────────────────────────────────────────────

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
