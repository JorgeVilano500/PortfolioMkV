/**
 * app/laptop/built-in-model.ts — the laptop drawn in code while the GLB isn't
 * in public/. It must meet the same contract as the real model
 * (LAPTOP_MODEL.md §1), because the viewer treats the two alike: every part
 * by name, on the right side of the hinge, at real size, with the hinge empty
 * on the back edge, and every drawn-on plane facing the right way with its
 * image upright and unmirrored, closed and open.
 */
import { Box3, MathUtils, Quaternion, Vector3, type Mesh, type Object3D } from "three"
import { buildLaptopModel } from "@/app/laptop/built-in-model"
import { LAPTOP_MODEL, LID_SLOTS, PALM_SLOTS, missingModelNodes } from "@/lib/laptop-stickers"

const model = () => {
    const root = buildLaptopModel()
    root.updateMatrixWorld(true)
    return root
}
const part = (root: Object3D, name: string) => {
    const found = root.getObjectByName(name)
    if (!found) throw new Error(`no ${name}`)
    return found
}
/** A mesh's own bounds in world space, without its children (the deck's planes float above the base). */
const ownBox = (object: Object3D) => {
    const mesh = object as Mesh
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)
}
const inside = (object: Object3D, ancestor: Object3D) => {
    for (let node = object.parent; node; node = node.parent) if (node === ancestor) return true
    return false
}

/** The world-space centre of a plane's vertices whose UV component `axis` equals `value` (an image edge). */
function edge(mesh: Mesh, axis: "x" | "y", value: 0 | 1): Vector3 {
    const position = mesh.geometry.getAttribute("position")
    const uv       = mesh.geometry.getAttribute("uv")
    const sum      = new Vector3()
    let count      = 0
    for (let i = 0; i < uv.count; i++) {
        if (Math.abs((axis === "x" ? uv.getX(i) : uv.getY(i)) - value) > 1e-6) continue
        sum.add(new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld))
        count++
    }
    return sum.divideScalar(count)
}
/** Where the image's top (v = 0, glTF's convention) and left (u = 0) point, in world space. */
const imageUp    = (mesh: Mesh) => edge(mesh, "y", 0).sub(edge(mesh, "y", 1)).normalize()
const imageRight = (mesh: Mesh) => edge(mesh, "x", 1).sub(edge(mesh, "x", 0)).normalize()
const facing     = (mesh: Mesh) => new Vector3().fromBufferAttribute(mesh.geometry.getAttribute("normal"), 0).transformDirection(mesh.matrixWorld)

const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1)
const pointsAlong = (v: Vector3, axis: Vector3) => v.dot(axis) > 0.99

describe("the parts", () => {
    it("has every part the viewer needs, by its exact name", () => {
        const names: string[] = []
        model().traverse((object) => { if (object.name) names.push(object.name) })
        expect(missingModelNodes(names)).toEqual([])
        expect(new Set(names).size).toBe(names.length) // no duplicates
    })

    it("makes every drawn-on part a single-material mesh", () => {
        const root = model()
        const { screen, keyboard } = LAPTOP_MODEL.nodes
        for (const name of [screen, keyboard, ...LID_SLOTS.map((s) => s.node), ...PALM_SLOTS.map((s) => s.node)]) {
            const mesh = part(root, name) as Mesh
            expect(mesh.isMesh).toBe(true)
            expect(Array.isArray(mesh.material)).toBe(false)
        }
    })

    it("hangs the lid's parts from the hinge and keeps the keyboard and palm rest off it", () => {
        const root  = model()
        const hinge = part(root, LAPTOP_MODEL.nodes.lid)
        for (const name of [LAPTOP_MODEL.nodes.lidOuter, LAPTOP_MODEL.nodes.screen, ...LID_SLOTS.map((s) => s.node)]) {
            expect(inside(part(root, name), hinge)).toBe(true)
        }
        for (const name of [LAPTOP_MODEL.nodes.keyboard, ...PALM_SLOTS.map((s) => s.node)]) {
            expect(inside(part(root, name), hinge)).toBe(false)
        }
    })
})

describe("size and hinge", () => {
    it("is Apple's closed size, sitting on the ground and centred", () => {
        const box  = new Box3().setFromObject(model())
        const size = box.getSize(new Vector3())
        const { width, depth, height } = LAPTOP_MODEL.dimensions
        expect(size.x).toBeCloseTo(width, 3)
        expect(size.z).toBeCloseTo(depth, 3)
        expect(size.y).toBeCloseTo(height, 3)
        expect(box.min.y).toBeCloseTo(0, 4)
        expect(box.getCenter(new Vector3()).x).toBeCloseTo(0, 4)
        expect(box.getCenter(new Vector3()).z).toBeCloseTo(0, 4)
    })

    it("puts the hinge empty on the back edge at the top of the base, unrotated", () => {
        const root  = model()
        const hinge = part(root, LAPTOP_MODEL.nodes.lid)
        const base  = ownBox(part(root, "Base"))
        const at    = hinge.getWorldPosition(new Vector3())
        expect(at.y).toBeCloseTo(base.max.y, 4)
        expect(at.z).toBeCloseTo(base.min.z, 4)
        expect(hinge.quaternion.equals(new Quaternion())).toBe(true)
    })

    it("lifts the lid clear of the base when opened the contract's way (a negative turn around X)", () => {
        const root  = model()
        const hinge = part(root, LAPTOP_MODEL.nodes.lid)
        hinge.rotation.x = -MathUtils.degToRad(LAPTOP_MODEL.openAngle)
        root.updateMatrixWorld(true)
        const lid  = ownBox(part(root, "Lid_Shell"))
        const base = ownBox(part(root, "Base"))
        expect(lid.min.y).toBeGreaterThan(base.max.y - 0.006) // its back corner dips only behind the hinge
        expect(lid.max.y).toBeGreaterThan(0.18)               // standing up
        expect(lid.max.z).toBeLessThan(base.min.z + 0.02)     // over the back edge, not the keyboard
    })
})

describe("drawn-on planes", () => {
    it("puts the lid stickers on top of the closed lid, facing up, in their corners, images upright from the hinge side", () => {
        const root = model()
        const top  = ownBox(part(root, "Lid_Shell")).max.y
        const at = (node: string) => part(root, node).getWorldPosition(new Vector3())
        for (const slot of LID_SLOTS) {
            const mesh = part(root, slot.node) as Mesh
            expect(pointsAlong(facing(mesh), Y)).toBe(true)
            expect(at(slot.node).y).toBeGreaterThan(top)
            expect(at(slot.node).y - top).toBeLessThan(0.001)
            // Seen from above with the hinge at the bottom: up is away from the hinge (+Z), right is -X.
            expect(pointsAlong(imageUp(mesh), Z)).toBe(true)
            expect(pointsAlong(imageRight(mesh), X.clone().negate())).toBe(true)
        }
        // "Upper left" is away from the hinge and on the viewer's left (+X).
        expect(at("Sticker_Slot_1").x).toBeGreaterThan(0)
        expect(at("Sticker_Slot_1").z).toBeGreaterThan(at("Sticker_Slot_3").z)
        expect(at("Sticker_Slot_2").x).toBeLessThan(0)
        expect(at("Sticker_Slot_4").z).toBeLessThan(at("Sticker_Slot_2").z)
    })

    it("lays the keyboard and palm-rest planes on the deck, readable by the typist, left on the left", () => {
        const root = model()
        const deck = ownBox(part(root, "Base")).max.y
        for (const node of [LAPTOP_MODEL.nodes.keyboard, ...PALM_SLOTS.map((s) => s.node)]) {
            const mesh = part(root, node) as Mesh
            expect(pointsAlong(facing(mesh), Y)).toBe(true)
            expect(mesh.getWorldPosition(new Vector3()).y).toBeGreaterThan(deck)
            // The typist sits at the front: up is toward the hinge (-Z), right is +X.
            expect(pointsAlong(imageUp(mesh), Z.clone().negate())).toBe(true)
            expect(pointsAlong(imageRight(mesh), X)).toBe(true)
        }
        expect(part(root, "Palm_Slot_Left").getWorldPosition(new Vector3()).x).toBeLessThan(0)
        expect(part(root, "Palm_Slot_Right").getWorldPosition(new Vector3()).x).toBeGreaterThan(0)
    })

    it("hides the screen face-down while closed, and shows it upright to someone in front once open", () => {
        const root   = model()
        const screen = part(root, LAPTOP_MODEL.nodes.screen) as Mesh
        expect(pointsAlong(facing(screen), Y.clone().negate())).toBe(true)
        expect(screen.getWorldPosition(new Vector3()).y).toBeLessThanOrEqual(ownBox(part(root, "Base")).max.y)
        part(root, LAPTOP_MODEL.nodes.lid).rotation.x = -Math.PI / 2 // straight up
        root.updateMatrixWorld(true)
        expect(pointsAlong(facing(screen), Z)).toBe(true)
        expect(pointsAlong(imageUp(screen), Y)).toBe(true)
        expect(pointsAlong(imageRight(screen), X)).toBe(true)
    })

    it("draws the screen at 16:10 and each lid sticker square", () => {
        const root = model()
        const size = (node: string) => new Box3().setFromObject(part(root, node)).getSize(new Vector3())
        const screen = size(LAPTOP_MODEL.nodes.screen)
        expect(screen.x / screen.z).toBeCloseTo(16 / 10, 1)
        for (const slot of LID_SLOTS) expect(size(slot.node).x).toBeCloseTo(size(slot.node).z, 4)
    })
})
