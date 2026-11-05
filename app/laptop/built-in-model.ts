/**
 * A simple 13-inch MacBook Pro built in code, for when the GLB isn't in
 * public/ yet (LAPTOP_MODEL.md). It follows the same contract as the real
 * model: the same part names and parents, glTF's axes (+Y up, the front facing
 * +Z, the hinge at -Z), real dimensions in metres, and glTF-style UVs (v = 0
 * at the image top) on every plane the viewer draws onto. So the viewer treats
 * it exactly like the GLB, the lid drags the same way, and the real model
 * takes over as soon as it exists.
 *
 * Only LaptopViewer imports this, so it ships in the same client-only chunk
 * as Three.js and never runs on the server.
 */
import {
    ExtrudeGeometry,
    Group,
    Mesh,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    PlaneGeometry,
    Shape,
    ShapeGeometry,
    type BufferGeometry,
} from "three"
import { LAPTOP_MODEL } from "@/lib/laptop-stickers"

const { width: W, depth: D } = LAPTOP_MODEL.dimensions
const BASE_H  = 0.0095 // the base, up to the keyboard deck (LAPTOP_MODEL.md §2 step 3)
const LID_H   = 0.0054 // the lid; together 1.49 cm
const CORNER  = 0.008  // footprint corner radius
const BEVEL   = 0.001  // rounding on every edge of the slabs
const STICKER = 0.065

/** A rounded rectangle centred on the origin, in the XY plane. */
function roundedRect(width: number, depth: number, radius: number): Shape {
    const x = width / 2
    const y = depth / 2
    const r = Math.min(radius, x, y)
    const shape = new Shape()
    shape.moveTo(-x + r, -y)
    shape.lineTo(x - r, -y)
    shape.quadraticCurveTo(x, -y, x, -y + r)
    shape.lineTo(x, y - r)
    shape.quadraticCurveTo(x, y, x - r, y)
    shape.lineTo(-x + r, y)
    shape.quadraticCurveTo(-x, y, -x, y - r)
    shape.lineTo(-x, -y + r)
    shape.quadraticCurveTo(-x, -y, -x + r, -y)
    return shape
}

/** An aluminium slab `width` × `height` × `depth` with rounded corners and softened edges, centred on the origin. */
function slab(width: number, height: number, depth: number): BufferGeometry {
    // The bevel grows the outline and the thickness, so start that much smaller.
    const geometry = new ExtrudeGeometry(roundedRect(width - 2 * BEVEL, depth - 2 * BEVEL, CORNER - BEVEL), {
        depth:          height - 2 * BEVEL,
        bevelEnabled:   true,
        bevelThickness: BEVEL,
        bevelSize:      BEVEL,
        bevelSegments:  3,
        curveSegments:  6,
    })
    geometry.rotateX(-Math.PI / 2) // extruded along +Z; turn so the thickness is +Y
    geometry.center()
    return geometry
}

/** A flat plane with glTF's UVs (three's PlaneGeometry puts v = 1 at the image top). */
function gltfPlane(width: number, height: number): PlaneGeometry {
    const geometry = new PlaneGeometry(width, height)
    const uv = geometry.getAttribute("uv")
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    return geometry
}

/** A rounded panel just inside a slab's flat face (the lid's outside, the bezel). Normal +Z until turned. */
function panel(width: number, depth: number): ShapeGeometry {
    return new ShapeGeometry(roundedRect(width - 4 * BEVEL, depth - 4 * BEVEL, CORNER - 2 * BEVEL), 6)
}

/** The closed laptop, its origin at the centre of the base's underside, as LAPTOP_MODEL.md's node tree. */
export function buildLaptopModel(): Group {
    const aluminium   = new MeshStandardMaterial({ name: "Aluminium", color: "#c9cbcf", metalness: 1, roughness: 0.35 })
    const placeholder = () => new MeshStandardMaterial({ name: "Placeholder", color: "#888888" }) // the viewer swaps these

    const root = new Group()
    root.name = "MacBookPro13_2019"

    // ─── Base: the bottom case, then what sits on its deck ────────────────
    const base = new Mesh(slab(W, BASE_H, D), aluminium)
    base.name = "Base"
    base.position.y = BASE_H / 2
    root.add(base)
    const deck = BASE_H / 2 // the deck's height in the base's own space

    // Planes float 0.3 mm above the deck, with their image tops toward the hinge (-Z).
    const keyboard = new Mesh(gltfPlane(0.279, 0.112), placeholder())
    keyboard.name = LAPTOP_MODEL.nodes.keyboard
    keyboard.rotation.x = -Math.PI / 2
    keyboard.position.set(0, deck + 0.0003, -0.0442)
    base.add(keyboard)

    const trackpad = new Mesh(panel(0.138, 0.084), new MeshStandardMaterial({ name: "Trackpad_Glass", color: "#b9bbbf", metalness: 0.6, roughness: 0.45 }))
    trackpad.name = "Trackpad"
    trackpad.rotation.x = -Math.PI / 2
    trackpad.position.set(0, deck + 0.0002, 0.0572)
    base.add(trackpad)

    for (const [name, x] of [["Palm_Slot_Left", -0.1095], ["Palm_Slot_Right", 0.1095]] as const) {
        const plane = new Mesh(gltfPlane(0.05, 0.035), placeholder())
        plane.name = name
        plane.rotation.x = -Math.PI / 2
        plane.position.set(x, deck + 0.0003, 0.057)
        base.add(plane)
    }

    // ─── Lid: an empty on the hinge axis (back edge, top of the base) ─────
    const lid = new Group()
    lid.name = LAPTOP_MODEL.nodes.lid
    lid.position.set(0, BASE_H, -D / 2)
    root.add(lid)

    const shell = new Mesh(slab(W, LID_H, D), aluminium)
    shell.name = "Lid_Shell"
    shell.position.set(0, LID_H / 2, D / 2)
    lid.add(shell)

    // The outside of the lid, facing +Y while closed. Its local +Z is the lid's
    // outward normal, and its local -Y points away from the hinge.
    const outer = new Mesh(panel(W, D), new MeshStandardMaterial({ name: "Lid_Outer_Aluminium", color: "#c9cbcf", metalness: 1, roughness: 0.35 }))
    outer.name = LAPTOP_MODEL.nodes.lidOuter
    outer.rotation.x = -Math.PI / 2
    outer.position.set(0, LID_H + 0.0001, D / 2)
    lid.add(outer)

    // Seen from outside with the hinge at the bottom: "upper" is away from the hinge.
    // Each plane is turned 180° so its image top points away from the hinge, as in Blender (§1).
    const stickers = [["Sticker_Slot_1", 0.085, -0.05], ["Sticker_Slot_2", -0.085, -0.05], ["Sticker_Slot_3", 0.085, 0.05], ["Sticker_Slot_4", -0.085, 0.05]] as const
    for (const [name, x, y] of stickers) {
        const plane = new Mesh(gltfPlane(STICKER, STICKER), placeholder())
        plane.name = name
        plane.rotation.z = Math.PI
        plane.position.set(x, y, 0.0003)
        outer.add(plane)
    }

    // Inside: a black bezel over the inner face, then the 16:10 screen just in
    // front of it. Both face -Y while closed, image tops away from the hinge.
    // Specular 0 keeps the black bezel black under the studio lighting (§2 step 5).
    const bezel = new Mesh(panel(W, D), new MeshPhysicalMaterial({ name: "Bezel", color: "#050506", metalness: 0, roughness: 0.35, specularIntensity: 0 }))
    bezel.name = "Bezel"
    bezel.rotation.x = Math.PI / 2
    bezel.position.set(0, -0.0001, D / 2)
    lid.add(bezel)

    const screen = new Mesh(gltfPlane(0.2865, 0.179), placeholder())
    screen.name = LAPTOP_MODEL.nodes.screen
    screen.rotation.x = Math.PI / 2
    screen.position.set(0, -0.0003, D - 0.011 - 0.179 / 2)
    lid.add(screen)

    return root
}
