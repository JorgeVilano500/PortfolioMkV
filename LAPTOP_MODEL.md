# Laptop model: asset contract and Blender workflow

_The 3D asset behind `/laptop`: what the code expects, how to build it in Blender, and the exact export settings. Last verified: **2026-11-03**._

**Status: the asset doesn't exist yet.** Until `public/models/macbook-pro-13-2019.glb` is committed, `/laptop` shows its 2D fallback ("3D model coming soon"): a drawing of the lid, or of the open laptop after "Open the laptop". The spot pickers work as normal. The code was verified against a throwaway box-level stand-in that follows this contract. That stand-in was served by intercepting the browser's request, and was never added to the repo.

**Model:** 13-inch MacBook Pro (2019, Touch Bar), exported **closed**. Apple's dimensions: **30.41 cm wide × 21.24 cm deep × 1.49 cm thick**. The site opens the lid itself.

---

## 1. Contract (what the code relies on)

`app/laptop/LaptopViewer.tsx` and `lib/laptop-stickers.ts` (`LAPTOP_MODEL`, `STICKER_SLOTS`) depend on these exact values:

| Requirement | Value | Why |
|---|---|---|
| File | `public/models/macbook-pro-13-2019.glb` (one binary file, everything embedded) | The viewer fetches exactly this URL. A 404 shows the fallback. |
| Units and scale | 1 unit = 1 metre, real size, **all object scales applied (1.0)** | Camera framing and sticker size come from real dimensions |
| Up axis | Exported **+Y up** (Blender's default "+Y Up" export option, from Blender's Z-up scene) | glTF convention |
| Facing | The laptop's **front (trackpad edge) faces −Y in Blender**, so it becomes +Z in glTF. The hinge is at the back. | The closed view looks from the hinge side and the open view from the front, so artwork reads upright in both |
| State | **Lid closed** | The site opens it: it turns `Lid` around its local X axis by `LAPTOP_MODEL.openAngle` (108°) |
| Hinge | An empty named **`Lid`** with its origin **on the hinge axis**, **no rotation** (0, 0, 0), parent of everything that moves with the lid | Opening is a rotation of this one node. The viewer checks which direction lifts the lid, so a sign slip won't sink it into the base. |
| Lid outside | A separate mesh named **`Lid_Outer`** with **one** material, inside `Lid` | The lid's outer surface is its own named part |
| Lid stickers | Four square planes named **`Sticker_Slot_1`…`Sticker_Slot_4`**, children of `Lid_Outer`, **one** material each, origin at the plane's centre, UVs filling 0–1 | The viewer swaps each plane's material for the sticker artwork and raycasts against them |
| Screen | A 16:10 plane named **`Screen`** over the display area, inside `Lid`, **one** material, UVs filling 0–1 | The viewer draws the boot screen and the desktop onto it, and lights it up as the lid opens |
| Keyboard | A flat plane named **`Keyboard`** over the key area, inside `Base` (**not** `Lid`), **one** material, UVs filling 0–1 | The viewer draws the keys, legends, Touch Bar and backlight onto it from `lib/laptop-keyboard.ts`. No modelled keycaps are needed. |
| Palm-rest stickers | Two landscape planes named **`Palm_Slot_Left`** and **`Palm_Slot_Right`**, inside `Base`, **one** material each, UVs filling 0–1 | Same as the lid stickers. "Left" and "right" are as the person typing sees them. |
| Names | ASCII letters, digits and `_` only. No `.001` duplicates, no spaces or dots. | GLTFLoader strips `.` and turns spaces into `_`, so `Sticker_Slot_1.001` arrives as `Sticker_Slot_1001` and doesn't match |
| Size | **Under 1 MB** (the console warns above 2 MB) and **under ~20k triangles** | Mobile download and GPU cost |
| Materials | Principled BSDF only, exported as glTF PBR. Colour and roughness come from factors, so **no image textures are needed**. | Lightweight. Embedded textures do still work under the site's CSP. |
| Compression | **None**: no Draco, meshopt, or KTX2 | Their decoders need WebAssembly and workers, which the CSP doesn't allow (`script-src` has no `wasm-unsafe-eval`, and there is no `worker-src`) |

**Contract checks:** if any required part is missing, or on the wrong side of the hinge, the page shows "3D model needs an update". The browser console says why, for example `[laptop] … is missing: Screen, Keyboard` or `[laptop] … has Screen outside Lid`.

### Node tree

```
MacBookPro13_2019        empty: origin at the centre of the base's bottom face, on the ground (0, 0, 0)
├── Base                 mesh: bottom case; its top face is the keyboard deck
│   ├── Keyboard         plane over the key area (the site draws the keys and backlight)
│   ├── Trackpad         optional: plane, slightly darker than the deck
│   ├── Palm_Slot_Left   plane, left of the trackpad (as the typist sees it)
│   └── Palm_Slot_Right  plane, right of the trackpad
└── Lid                  empty: origin ON THE HINGE AXIS (back edge, top of the base), so rotating X opens the lid
    ├── Lid_Shell        mesh: lid edges; its inner face uses the black Bezel material
    ├── Screen           plane over the display, facing the keyboard while closed
    └── Lid_Outer        mesh: ONLY the outside face of the lid (the "A panel")
        ├── Sticker_Slot_1   plane, upper left
        ├── Sticker_Slot_2   plane, upper right
        ├── Sticker_Slot_3   plane, lower left
        └── Sticker_Slot_4   plane, lower right
```

### Positions (Blender coordinates, lid closed)

**Lid stickers.** "Upper/lower, left/right" are **as seen from outside the lid with the hinge at the bottom**, the way a person facing someone using the open laptop sees it. **Z = the top of `Lid_Outer` + 0.03 cm**, so each sticker floats 0.3 mm above the aluminium (no z-fighting). Each is a **6.5 cm square**.

| Node | Spot | X | Y |
|---|---|---|---|
| `Sticker_Slot_1` | Upper left | **+8.5 cm** | **−5.0 cm** |
| `Sticker_Slot_2` | Upper right | **−8.5 cm** | **−5.0 cm** |
| `Sticker_Slot_3` | Lower left | **+8.5 cm** | **+5.0 cm** |
| `Sticker_Slot_4` | Lower right | **−8.5 cm** | **+5.0 cm** |

**Inside parts.** The base's top is at Z = 0.95 cm. Parts on the deck float 0.3 mm above it. The screen sits 0.3 mm below the lid's inner face, so it's hidden inside the base while closed and in front of the bezel once open.

| Node | Size (X × Y) | X | Y | Z | Rotate before applying |
|---|---|---|---|---|---|
| `Screen` | **28.65 × 17.90 cm** (16:10) | 0 | **−0.57 cm** | **0.92 cm** | **180° around X** (faces down while closed) |
| `Keyboard` | **27.90 × 11.20 cm** | 0 | **+4.42 cm** | **0.98 cm** | none (faces up) |
| `Trackpad` (optional) | 13.40 × 8.00 cm | 0 | −5.72 cm | 0.97 cm | none |
| `Palm_Slot_Left` | **5.0 × 3.5 cm** | **−10.95 cm** | **−5.70 cm** | **0.98 cm** | none |
| `Palm_Slot_Right` | **5.0 × 3.5 cm** | **+10.95 cm** | **−5.70 cm** | **0.98 cm** | none |

**Which way the images point:**
- **Lid stickers:** image top **away from the hinge**, toward the front edge (−Y). Each plane is turned 180° around Z.
- **Screen:** image top **toward the lid's top edge**, which is the front (−Y) while closed. The 180° turn around X does this and also flips it to face down.
- **Keyboard and palm-rest planes:** image top **toward the hinge** (+Y), so the typist reads them upright. That's a new plane's default, so they need no rotation.

Step 8 below checks all of these with a test image.

## 2. Blender workflow (Blender 4.x)

1. **Scene units.** Open Scene Properties, then Units, and set Unit System **Metric**, Unit Scale **1.0**, and Length **Centimeters**. That unit is for display only; the export is in metres.
2. **Root.** Add an Empty (Plain Axes) at the world origin and name it `MacBookPro13_2019`.
3. **Base.** Add a cube with **Dimensions X 30.41 cm, Y 21.24 cm, Z 0.95 cm**. Move it so its bottom sits on Z = 0, centred on X and Y. Then:
   - Add a Bevel modifier: about **0.6 cm**, 3 segments, limit method Angle. That gives the rounded footprint corners.
   - Apply the modifier, and apply scale (Ctrl+A, then Scale).
   - Name it `Base` and parent it to the root (Ctrl+P, then Object (Keep Transform)).

   Real thickness split: the base is about 0.95 cm and the lid about 0.54 cm, totalling 1.49 cm. Adjust if you measure your own laptop.
4. **Lid.**
   - Add an Empty named `Lid` **on the hinge axis**: X 0, Y +10.62 cm (the back edge), Z 0.95 cm (the top of the base). Leave its rotation at 0. Parent it to the root.
   - Add a cube with **X 30.41 cm, Y 21.24 cm, Z 0.54 cm** sitting on top of the base. Bevel it like the base, apply the modifier and scale, and name it `Lid_Shell`.
   - In Edit Mode, select **only the top faces** of `Lid_Shell` (the outside of the lid). Press **P, then Selection** to split them into their own object, and rename that object **`Lid_Outer`**.
   - Still in `Lid_Shell`'s Edit Mode, select its **bottom faces** (the inside of the lid, which faces the keyboard) and assign them the `Bezel` material (step 5).
   - Parent `Lid_Shell` and `Lid_Outer` to the `Lid` empty.
5. **Materials** (Principled BSDF only):
   - `Aluminium`: Base Color `#C9CBCF` for Silver or `#7D7E80` for Space Gray, Metallic **1.0**, Roughness **0.35**. Use it on `Base` and `Lid_Shell`.
   - `Lid_Outer_Aluminium`: the same values, as a separate material so the lid can be tuned on its own. Use it on `Lid_Outer` only.
   - `Bezel`: Base Color `#050506`, Metallic **0**, Roughness **0.35**, and under Specular set **IOR Level to 0**. The page lights the model with a bright studio environment, and any reflection on a black surface facing the camera turns it grey. With IOR Level 0 the exporter writes the standard `KHR_materials_specular` extension, which three.js reads with no extra decoder, and the bezel stays black.
   - `Trackpad_Glass` (optional): Base Color like the aluminium, Metallic **0.6**, Roughness **0.45**.
   - `Sticker_Placeholder`, `Screen_Placeholder`, `Keyboard_Placeholder`: any colour. The site replaces them at runtime.
   - Skip the Apple logo. It's a trademark, and the stickers carry the visual interest.
6. **Lid sticker planes.** Repeat these steps four times:
   1. Add a Plane with Size **6.5 cm**.
   2. Place it at the X/Y in the lid-sticker table, at Z = the top of `Lid_Outer` + 0.03 cm (**1.52 cm** with the dimensions above).
   3. Rotate it **180° around Z** (R, Z, 180), so the image top points to the front edge.
   4. Apply rotation and scale (Ctrl+A, then All Transforms), then set **Object, then Set Origin, then Origin to Geometry**.
   5. Name it `Sticker_Slot_N`, give it the `Sticker_Placeholder` material, and parent it to `Lid_Outer` (Keep Transform).

   A new plane already has UVs filling 0–1, so don't re-unwrap it.
7. **Inside parts.** For each row of the inside-parts table:
   1. Add a Plane, then set its **Dimensions** in the N panel to the table's size (for example X 28.65 cm, Y 17.90 cm for the screen).
   2. Place it at the table's X, Y and Z, and apply the table's rotation, if any (the screen: **R, X, 180**).
   3. Apply rotation and scale (Ctrl+A, then All Transforms), then **Origin to Geometry**.
   4. Name it, and give it its own material: `Screen_Placeholder` for `Screen`, `Keyboard_Placeholder` for `Keyboard`, `Sticker_Placeholder` for the palm planes, `Trackpad_Glass` for `Trackpad`.
   5. Parent it with Keep Transform: **`Screen` to `Lid`**; `Keyboard`, `Trackpad`, and both `Palm_Slot_*` planes to **`Base`**.

   Scaling with Dimensions and then applying scale keeps the UVs filling 0–1. Don't re-unwrap.
8. **Check image orientation before exporting.**
   1. Temporarily give `Sticker_Placeholder`, `Screen_Placeholder`, and `Keyboard_Placeholder` an Image Texture with a text image ("Image, then New, then Color Grid" works).
   2. Select `Lid` and set its **Rotation X to −108°**: that's how far the site opens it. The lid should swing up and back. If it sinks into the base, the `Lid` empty is rotated or misplaced (step 4).
   3. **Front view (Numpad 1):** the screen's image reads normally, not upside down or mirrored.
   4. **Top view (Numpad 7):** the keyboard and both palm planes read normally with their tops toward the hinge, and `Palm_Slot_Left` is on the left.
   5. **Back view (Ctrl+Numpad 1):** you're looking at the lid's outside with the hinge at the bottom. `Sticker_Slot_1` is **upper left**, and the images read normally.
   6. Set the Lid rotation **back to 0°**, and remove the test images so they aren't exported.
9. **Lighten the model.**
   - Keep bevel segments low.
   - Delete hidden faces: the base's underside, and any inside faces you'll never see.
   - Shade Auto Smooth, then check the triangle count in the Statistics overlay. It should be **under ~20k**.
10. **Final checks:**
    - Every mesh has scale 1.0 (Ctrl+A, then Scale), and `Lid` has rotation 0.
    - Names exactly match the tree above, and each part has the right parent.
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
| Animation | Animation | ✗ (the site animates the lid itself) |

Save it as **`public/models/macbook-pro-13-2019.glb`**, then:

```bash
npm run dev    # open http://localhost:3000/laptop: the 3D view should load, and "Open the laptop" should swing it open
```

Optional: `npx @gltf-transform/cli inspect public/models/macbook-pro-13-2019.glb` prints the size, triangle count, node names, and extensions (it runs locally). The `Bezel` material should list `KHR_materials_specular`. If it doesn't, the bezel will look dark grey rather than black; that's cosmetic only.

## 4. What the site does with each part

- **Opening:** "Open the laptop", or choosing a palm-rest spot, turns `Lid` 108° over about 1.3 s while the camera swings round to the front. As on a real MacBook, the laptop wakes as the lid lifts:
  - The **screen** comes up first. On the first open it shows a JAVA.dev boot screen, then fades to a desktop in the site's colours, with a menu bar, the time, and a dock. Later opens wake straight to the desktop.
  - Then the **keyboard backlight** and the **Touch Bar** fade up. They're the keyboard texture's emissive layer, so only the legends and key edges glow.
  - **Closing** puts the display to sleep first, then lowers the lid.
- **Reduced motion:** the lid, lights and camera jump straight to their end state.
- **Stickers:**
  - Lid stickers are visible in both states. With the lid open, choosing one moves the camera behind the screen, the way someone across the table sees it.
  - The palm-rest spots are only visible, and clickable, while the laptop is open.
- **All artwork is drawn at runtime** (`app/laptop/canvas-art.ts`). Change sponsors in `lib/laptop-stickers.ts`, the keyboard layout in `lib/laptop-keyboard.ts`, and the desktop in `drawDesktop`, with no model re-export.

## 5. QA once the asset exists

TESTING.md §7.8 lists the full checklist. In short:
- The page loads the 3D view, and the status says "Drag to rotate…".
- Closed: the four stickers sit in the right corners, and their artwork reads normally.
- "Open the laptop": the lid swings up, the camera ends straight in front, the screen boots to the desktop, and the keys light up. The bezel is black, and nothing pokes through the lid or the deck.
- Both palm stickers can be clicked while open; choosing either in the list opens the laptop and focuses it. Reset view returns to the current overview.
- There are no console warnings, and the GLB is under 1 MB in DevTools → Network.
