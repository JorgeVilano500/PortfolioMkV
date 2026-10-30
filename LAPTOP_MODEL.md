# Laptop model: asset contract and Blender workflow

_The 3D asset behind `/laptop`: what the code expects, how to build it in Blender, and the exact export settings. Last verified: **2026-10-30**._

**Status: the asset doesn't exist yet.** Until `public/models/macbook-pro-13-2019.glb` is committed, `/laptop` shows its 2D fallback ("3D model coming soon"), and the spot picker works as normal. The code was verified against a throwaway box-level stand-in that follows this contract. That stand-in was served by intercepting the browser's request, and was never added to the repo.

**Model:** 13-inch MacBook Pro (2019), closed. Apple's dimensions: **30.41 cm wide × 21.24 cm deep × 1.49 cm thick**.

---

## 1. Contract (what the code relies on)

`app/laptop/LaptopViewer.tsx` and `lib/laptop-stickers.ts` (`LAPTOP_MODEL`, `STICKER_SLOTS`) depend on these exact values:

| Requirement | Value | Why |
|---|---|---|
| File | `public/models/macbook-pro-13-2019.glb` (one binary file, everything embedded) | The viewer fetches exactly this URL. A 404 shows the fallback. |
| Units and scale | 1 unit = 1 metre, real size, **all object scales applied (1.0)** | Camera framing and sticker size come from real dimensions |
| Up axis | Exported **+Y up** (Blender's default "+Y Up" export option, from Blender's Z-up scene) | glTF convention |
| Facing | The laptop's **front (trackpad edge) faces −Y in Blender**, so it becomes +Z in glTF. The hinge is at the back. | The default camera looks from the hinge side, so sticker artwork reads upright |
| State | **Lid closed** | The lid's outside faces up for the default view |
| Lid outside | A separate mesh named **`Lid_Outer`** with **one** material | The lid's outer surface is its own named part |
| Sticker spots | Four square planes named **`Sticker_Slot_1`…`Sticker_Slot_4`**, children of `Lid_Outer`, **one** material each, origin at the plane's centre, UVs filling 0–1 | The viewer swaps each plane's material for the sticker artwork and raycasts against them |
| Names | ASCII letters, digits and `_` only. No `.001` duplicates, no spaces or dots. | GLTFLoader strips `.` and turns spaces into `_`, so `Sticker_Slot_1.001` arrives as `Sticker_Slot_1001` and doesn't match |
| Size | **Under 1 MB** (the console warns above 2 MB) and **under ~20k triangles** | Mobile download and GPU cost |
| Materials | Principled BSDF only, exported as glTF PBR. Colour and roughness come from factors, so **no image textures are needed**. | Lightweight. Embedded textures do still work under the site's CSP. |
| Compression | **None**: no Draco, meshopt, or KTX2 | Their decoders need WebAssembly and workers, which the CSP doesn't allow (`script-src` has no `wasm-unsafe-eval`, and there is no `worker-src`) |

**Missing parts:** if `Lid_Outer` or any `Sticker_Slot_N` mesh is missing, the page shows "3D model needs an update". The browser console names the missing node, for example `[laptop] … is missing: Sticker_Slot_4`.

### Node tree

```
MacBookPro13_2019        empty: origin at the centre of the base's bottom face, on the ground (0, 0, 0)
├── Base                 mesh: bottom case (+ keyboard deck if you model it)
└── Lid                  empty: origin ON THE HINGE AXIS (back edge, top of the base), so rotating X opens the lid
    ├── Lid_Shell        mesh: lid edges and the inside (bezel and screen, optional)
    └── Lid_Outer        mesh: ONLY the outside face of the lid (the "A panel")
        ├── Sticker_Slot_1   plane, upper left
        ├── Sticker_Slot_2   plane, upper right
        ├── Sticker_Slot_3   plane, lower left
        └── Sticker_Slot_4   plane, lower right
```

### Sticker positions

"Upper/lower, left/right" are **as seen from outside the lid with the hinge at the bottom**, the way a person facing someone using the open laptop sees it. Positions are in Blender coordinates with the lid closed. **Z = the top of `Lid_Outer` + 0.03 cm**, so each sticker floats 0.3 mm above the aluminium (no z-fighting). Each sticker is a **6.5 cm square**, which leaves room for a centre logo area.

| Node | Spot | X | Y |
|---|---|---|---|
| `Sticker_Slot_1` | Upper left | **+8.5 cm** | **−5.0 cm** |
| `Sticker_Slot_2` | Upper right | **−8.5 cm** | **−5.0 cm** |
| `Sticker_Slot_3` | Lower left | **+8.5 cm** | **+5.0 cm** |
| `Sticker_Slot_4` | Lower right | **−8.5 cm** | **+5.0 cm** |

Each plane's **image top must point away from the hinge**, toward the front edge (−Y). Step 7 below shows how to check this with a test image.

## 2. Blender workflow (Blender 4.x)

1. **Scene units.** Open Scene Properties, then Units, and set Unit System **Metric**, Unit Scale **1.0**, and Length **Centimeters**. That unit is for display only; the export is in metres.
2. **Root.** Add an Empty (Plain Axes) at the world origin and name it `MacBookPro13_2019`.
3. **Base.** Add a cube with **Dimensions X 30.41 cm, Y 21.24 cm, Z 0.95 cm**. Move it so its bottom sits on Z = 0, centred on X and Y. Then:
   - Add a Bevel modifier: about **0.6 cm**, 3 segments, limit method Angle. That gives the rounded footprint corners.
   - Apply the modifier, and apply scale (Ctrl+A, then Scale).
   - Name it `Base` and parent it to the root (Ctrl+P, then Object (Keep Transform)).

   Real thickness split: the base is about 0.95 cm and the lid about 0.54 cm, totalling 1.49 cm. Adjust if you measure your own laptop.
4. **Lid.**
   - Add an Empty named `Lid` **on the hinge axis**: X 0, Y +10.62 cm (the back edge), Z 0.95 cm (the top of the base). Parent it to the root.
   - Add a cube with **X 30.41 cm, Y 21.24 cm, Z 0.54 cm** sitting on top of the base. Bevel it like the base, apply the modifier and scale, and name it `Lid_Shell`.
   - In Edit Mode, select **only the top faces** of `Lid_Shell` (the outside of the lid). Press **P, then Selection** to split them into their own object, and rename that object **`Lid_Outer`**.
   - Parent `Lid_Shell` and `Lid_Outer` to the `Lid` empty.
5. **Materials** (Principled BSDF only):
   - `Aluminium`: Base Color `#C9CBCF` for Silver or `#7D7E80` for Space Gray, Metallic **1.0**, Roughness **0.35**. Use it on `Base` and `Lid_Shell`.
   - `Lid_Outer_Aluminium`: the same values, as a separate material so the lid can be tuned on its own. Use it on `Lid_Outer` only.
   - `Sticker_Placeholder`: any grey. The site replaces it at runtime.
   - Skip the Apple logo. It's a trademark, and the stickers carry the visual interest.
6. **Sticker planes.** Repeat these steps four times:
   1. Add a Plane with Size **6.5 cm**.
   2. Place it at the X/Y in the table above, at Z = the top of `Lid_Outer` + 0.03 cm (**1.52 cm** with the dimensions above).
   3. Rotate it **180° around Z** (R, Z, 180), so the image top points to the front edge.
   4. Apply rotation and scale (Ctrl+A, then All Transforms), then set **Object, then Set Origin, then Origin to Geometry**.
   5. Name it `Sticker_Slot_N`, give it the `Sticker_Placeholder` material, and parent it to `Lid_Outer` (Keep Transform).

   A new plane already has UVs filling 0–1, so don't re-unwrap it.
7. **Check sticker orientation before exporting.**
   1. Temporarily give `Sticker_Placeholder` an Image Texture with a text image ("Image, then New, then Color Grid" works).
   2. Select `Lid` and set its **Rotation X to −90°** to open it, then switch to the **Back view (Ctrl+Numpad 1)**. You're now looking at the lid's outside with the hinge at the bottom.
   3. Check that `Sticker_Slot_1` is **upper left** and the image reads **normally**: not upside down, not mirrored.
   4. Set the Lid rotation **back to 0°**, and remove the test image so it isn't exported.
8. **Lighten the model.**
   - Keep bevel segments low.
   - Delete hidden faces: the base's underside, and any inside faces you'll never see.
   - Shade Auto Smooth, then check the triangle count in the Statistics overlay. It should be **under ~20k**.
9. **Final checks:**
   - Every mesh has scale 1.0 (Ctrl+A, then Scale).
   - Names exactly match the tree above.
   - The lid is closed.
   - Nothing extra is in the scene (cameras and lights aren't exported; see below).

## 3. Export settings (File → Export → glTF 2.0)

Select the `MacBookPro13_2019` hierarchy (right-click the root, then Select Hierarchy), then set:

| Section | Setting | Value |
|---|---|---|
| Format | Format | **glTF Binary (.glb)** |
| Include | Limit to | **Selected Objects** ✓ |
| Include | Custom Properties, Cameras, Punctual Lights | ✗ (off) |
| Transform | +Y Up | ✓ (on, the default) |
| Data → Mesh | Apply Modifiers | ✓ |
| Data → Mesh | UVs, Normals | ✓ |
| Data → Mesh | Tangents, Vertex Colors / Attributes, Loose Edges, Loose Points | ✗ |
| Data → Material | Materials | **Export** |
| Data → Material | Images | **Automatic** (and none should be used in v1) |
| Data → Shape Keys, Skinning, Armature | | ✗ |
| Data → Compression | Compression (Draco) | **✗ (must stay off, CSP)** |
| Animation | Animation | ✗ |

Save it as **`public/models/macbook-pro-13-2019.glb`**, then:

```bash
npm run dev    # open http://localhost:3000/laptop: the 3D view should load, and clicking a sticker selects its spot
```

Optional: `npx @gltf-transform/cli inspect public/models/macbook-pro-13-2019.glb` prints the size, triangle count, and node names (it runs locally).

## 4. QA once the asset exists

TESTING.md §7.8 lists the full checklist. In short:
- The page loads the 3D view and the status says "Drag to rotate…".
- The four stickers sit in the right corners and their artwork reads normally.
- Clicking a sticker selects its spot; choosing a spot in the list moves the camera to it; Reset view returns to the overview.
- There are no console warnings, and the GLB is under 1 MB in DevTools → Network.
