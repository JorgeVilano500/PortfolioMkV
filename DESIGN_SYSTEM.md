# Design System

_The visual language of JAVA.dev: tokens, typography, layout, components, motion, and the rules for new UI. Every value below is pulled from the current code. Where the code is inconsistent, §10 lists the conflict and the canonical choice to converge on. Last verified: **2026-11-05** (branch `sticker-studio`)._

**Read this before building or restyling any UI.** When you introduce a new pattern, add it here.

---

## 1. Principles

1. **Dark, quiet, and violet-accented.** Near-black surfaces, low-contrast borders, one strong accent (violet `#7c6dff`), and two supporting accents (green and pink) used as themes, never mixed at random.
2. **Bento grid everywhere.** Every page is a grid of rounded cards with varying spans. Cards are the unit of composition.
3. **Small type, big hierarchy.** Tiny uppercase eyebrow labels, bold display headings, muted body text, and very few mid-sized elements.
4. **Subtle life.** Cards lift on hover, live indicators pulse, the timeline reveals on scroll. Motion stays under 500 ms and is never decorative for its own sake.
5. **Emoji as iconography** for content (post covers, project icons), and line icons for UI controls.
6. **Dark-only.** There is no light theme (see §10, item 11).

## 2. Colour tokens

Tailwind 4 is used with **arbitrary hex values** inline (for example `bg-[#13121c]`). No colour tokens are registered yet; §11 proposes them. Until that migration happens, **use exactly these hex values**. Do not invent new near-blacks.

### 2.1 Surfaces and lines
| Role | Hex | Typical classes | Used in |
|---|---|---|---|
| Page background | `#0a0a0f` | `bg-[#0a0a0f]` | Every page shell, inputs in Studio, code blocks, OG images |
| Inset / deepest panel | `#0d0c14` | `bg-[#0d0c14]` | Code-block header, ProjectList rows, image captions |
| **Card (default / purple)** | `#13121c` | `bg-[#13121c] border border-[#2a2840]` | Most cards, modals, the password gate |
| Card alt (warm) | `#16131a` | `bg-[#16131a] border border-[#2a2840]` | Quote card, hobbies, "virtual coffee" |
| Raised fill / track / skeleton | `#1e1c2e` | `bg-[#1e1c2e]` | Progress tracks, skeleton blocks, purple icon tiles, hover fill, inline code |
| **Border / divider** | `#2a2840` | `border-[#2a2840]` | Card borders, dividers, inactive pill borders |
| Overlay | black/60 or black/70 | `bg-black/60 backdrop-blur-sm` | Modal backdrops |

### 2.2 Text
| Role | Hex / class | Notes |
|---|---|---|
| Heading / primary | `#f0eeff` | All display headings and card titles |
| Strong secondary | `#c4c0d8` (and `#e8e6f0` for timeline titles) | Labels inside cards, table headers, strong/em in markdown |
| Body | `#7a7890` (markdown, About), `#6b6880` (card descriptions) | Today's canonical values are body `#7a7890` and description `#6b6880`. **Both are below WCAG AA on cards** (see §9.5), so the target for new work is `#8a88a0`. |
| Meta / eyebrow (dim) | `#555370` | Dates, counts, section eyebrows, placeholders |
| Nav inactive | `#888` | Navbar links, inactive filter pills |
| Disabled / ghost | `#3a3850` | "No link yet" |
| Tailwind greys (legacy) | `text-gray-300/500/600/700` | Used on Home and Contact. **Prefer the hex roles above in new code.** |

### 2.3 Accent themes
Posts and projects each have a `theme` of `purple`, `green`, or `pink`. The class bundles live in `lib/blog.ts` (`themeMap`) and `lib/projects-data.ts` (`projectThemeMap`); they are identical apart from `cardBg` and `borderAccent`.

| Theme | Accent text (`catColor`) | Card (`cardBg`) | Icon tile (`iconBg`) | Tag pill (`tagStyle`) | Left border |
|---|---|---|---|---|---|
| **purple** (default) | `#AFA9EC` | `bg-[#13121c] border-[#2a2840]` | `#1e1c2e` | `border-[#534AB7] text-[#AFA9EC] bg-[#13111e]` | `border-l-violet-500` |
| **green** | `#97C459` | `bg-[#0f1a14] border-[#1a2e20]` | `#121f17` | `border-[#3B6D11] text-[#97C459] bg-[#0f1a0a]` | `border-l-emerald-500` |
| **pink** | `#ED93B1` | `bg-[#1a1216] border-[#2e1f28]` | `#1a0f14` | `border-[#993556] text-[#ED93B1] bg-[#1a0f14]` | `border-l-pink-500` |

Swatch hex values used in pickers (Studio theme selector) and in Logistics charts: purple `#7c6dff`, green `#97C459`, pink `#ED93B1`. The green family also uses `#121f17` (tile), `#1e3024` (tile border), `#1a2e1f` (tile hover), `#4a9e6a` (filled rating dot), and `#1a2e20` (empty dot and dividers).

**Rule:** always pull theme classes from the theme map. Don't hand-write them, and don't mix themes within one card.

### 2.4 Brand accent (violet)
| Role | Value |
|---|---|
| **Primary** | `#7c6dff`: active nav link, primary buttons, focus borders, eyebrows on page headers, chart bars |
| Primary hover | `#6a5de8` |
| Light accent text | `#AFA9EC` |
| Solid hero cards | Home "Currently focused on" uses `bg-violet-600`; the About avatar card uses `bg-[#7c6dff]`. **Canonical: `bg-[#7c6dff]`** (see §10) |
| Glow | `radial-gradient(circle, rgba(124,109,255,.15–.35) 0%, transparent 70%)` |

### 2.5 Semantic and status colours
| Meaning | Colour | Pattern |
|---|---|---|
| **Live / available / success** | `emerald-400` (dot `emerald-300` on solid cards) | `w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse` + `text-xs text-emerald-400 font-medium` |
| **In progress (wip)** | `amber-400` | Dot without pulse |
| **Planned** | `orange-400` | Dot without pulse. ⚠️ `ProjectList` uses `pink-400` instead (see §10) |
| Error | `pink-400` (inline), `pink-300` (error card) | `text-xs text-pink-400` under forms; card `bg-[#1a1216] border-[#2e1f28] text-pink-300` |
| Destructive action | `pink-400` | `border-pink-400/30 text-pink-400 hover:bg-pink-400/10` |
| Bounce-rate thresholds | `emerald-400` ≤40 %, `amber-400` ≤70 %, `pink-400` otherwise | Logistics |

### 2.6 Markdown callouts (`MarkdownRenderer`)
| Type | Background | Left border | Text | Icon |
|---|---|---|---|---|
| NOTE | `#16152a` | `violet-500` | `#AFA9EC` | ℹ️ |
| IMPORTANT | `#16152a` | `violet-400` | `#AFA9EC` | 📌 |
| TIP | `#0f1a14` | `emerald-500` | `emerald-400` | 💡 |
| WARNING | `#1a1600` | `amber-500` | `amber-400` | ⚠️ |
| CAUTION | `#1a0f0f` | `orange-500` | `orange-400` | 🔥 |
| DANGER | `#1a0f0f` | `red-500` | `red-400` | 🚨 |

## 3. Typography

### 3.1 Font families
| Role | Face | How it loads |
|---|---|---|
| Display / headings (`font-syne`) | **Syne** (variable, 400–800) | `next/font/google` in `app/layout.tsx` → `--font-syne-face`, registered as `--font-syne` in `globals.css` `@theme inline` |
| Body (`font-dm` on page shells) | **DM Sans** (variable) | Same, as `--font-dm-face` → `--font-dm` |
| Home shell (`font-sans`) | Geist | `next/font` (the Next starter default; Home doesn't use `font-dm`) |
| Code (`font-mono`) | Geist Mono | `next/font` |

Fixed on 2026-11-03 (PRD P0-2). Until then no Tailwind utility mapped `font-syne` or `font-dm` (a Tailwind v3 block in `postcss.config.mjs` that Tailwind 4 ignored), so both fell back to **Arial**. next/font self-hosts the files, so the CSP needs no font host; **don't** add a Google Fonts `<link>` (the CSP blocks it, and a test enforces this). Syne is a wide face: headings take more room than they did in Arial, so check 360 px layouts when adding long headings. The `body` rule in `globals.css` still says Arial, for anything outside a `font-dm` shell.

### 3.2 Type scale (as used)
| Role | Classes |
|---|---|
| Eyebrow / section label | `text-[11px] tracking-widest uppercase font-medium`, coloured `text-[#7c6dff]` (page headers) or `text-[#555370]` (card sections) |
| Card meta label | `text-[10px] tracking-widest uppercase font-medium` + the theme's `catColor` |
| Page H1 | `font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight` |
| Hero H1 (Home, Contact) | `font-extrabold text-4xl text-white leading-tight tracking-tight` |
| Featured card title | `font-syne font-extrabold text-2xl text-[#f0eeff] leading-tight` |
| Card title | `font-syne font-bold text-xl` (side card) or `text-lg` (grid card), `text-[#f0eeff] leading-snug` |
| Body | `text-sm text-[#7a7890] leading-relaxed` |
| Description | `text-sm` or `text-xs text-[#6b6880] leading-relaxed`, with `line-clamp-2`/`-3` in grids |
| Meta | `text-xs text-[#555370]` |
| Big number | `text-5xl font-extrabold tracking-tight` (Home, Contact); `font-syne font-extrabold text-4xl` (Logistics) |
| Code inline | `bg-[#1e1c2e] text-violet-300 px-1.5 py-0.5 rounded text-xs font-mono` |

## 4. Layout

### 4.1 Page shell
```tsx
<div className="min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]">
    <Navbar currentLink="About" />
    {/* optional page header */}
    <section className="px-2 mb-8">
        <p className="text-[11px] tracking-widest uppercase text-[#7c6dff] font-medium mb-2">Eyebrow</p>
        <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-[#f0eeff] tracking-tight mb-2">Title</h1>
        <p className="text-sm text-gray-500 max-w-sm leading-relaxed">One-line description.</p>
    </section>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">{/* cards */}</div>
</div>
```
`currentLink` matches the nav item case-insensitively (`"About"` and `"about"` both work); use `"/"` for Home. Admin pages pass `"studio"` or `"logistics"`, which highlights nothing.

### 4.2 Bento grid
- Columns: **1** by default, **2** from `md` (768 px), **12** from `xl` (1280 px). Gap `gap-4`.
- Spans are set per card with `col-span-1 md:col-span-{1|2} xl:col-span-N`.
- Proven `xl` row compositions: **7 + 5** (hero rows), **8 + 4** (featured + side), **4 + 4 + 4** (grids), **4 + 8** and **8 + 4** (About), **3 + 3 + 3 + 3** (stat tiles), **12** (full-width strip).
- Rows should sum to 12 at `xl`. At `md`, give a featured card `md:col-span-2` so it spans the row.

### 4.3 Containers and widths
| Context | Width |
|---|---|
| Public pages | Full width inside the `p-6 md:p-8` shell |
| Blog post reading column | `max-w-3xl mx-auto` |
| Studio content | `max-w-5xl` |
| Modals | `max-w-xl` (md) or `max-w-3xl` (lg); `max-h-[85vh]`–`88vh` with internal scroll |
| Password gate card | `max-w-sm`, centred on the full screen |

## 5. Shape, borders, elevation

| Element | Radius | Padding |
|---|---|---|
| Card | `rounded-2xl` | `p-6` (`p-8` for the gate) |
| Inner tile, input, code block, table wrapper, modal | `rounded-xl` | `px-3 py-2` / `px-4 py-3` for inputs |
| Small button, menu item, icon button | `rounded-lg` | `px-3 py-1.5` / `p-1.5` |
| Pill, tag, status chip, avatar | `rounded-full` | Tags `px-2.5 py-0.5`, filter pills `px-4 py-2` |

- Borders are always 1 px (`border`), using the role colours from §2. The only exceptions are the 4 px left border on callouts and the 2 px left border on ProjectList hover.
- **No drop shadows** on cards. Depth comes from surface steps (`#0a0a0f`, then `#13121c`, then `#1e1c2e`) and the hover lift. `shadow-lg` and `shadow-xl` appear only on images and modals.
- Card minimum heights: hero rows `min-h-[200px]` to `260px`; stat tiles `min-h-[130px]` to `150px`.

## 6. Motion

| Pattern | Classes / spec | Where |
|---|---|---|
| **Card lift** | `hover:-translate-y-1 transition-transform duration-300` | Almost every card. Add it to new cards. |
| Tile pop | `hover:scale-105 transition-all duration-200` | Home project tiles, Contact socials |
| Live pulse | `animate-pulse` on a 1.5–2 px dot | Availability and live status |
| Skeleton | `animate-pulse` + `bg-[#1e1c2e]` blocks matching the final layout | Blog, post, Logistics, Studio |
| Scroll reveal | `opacity-0 translate-y-5` to `opacity-100 translate-y-0`, `duration-500 ease-out`, staggered by `i * 100ms`, triggered by an IntersectionObserver at threshold 0.15 | About timeline |
| Mobile nav drawer | `-translate-x-full` to `translate-x-0`, `duration-400 ease-in-out` | Navbar |
| Bars | `transition-all duration-700` on width | Logistics |
| Laptop lid (3D) | **Direct, not timed.** A drag sets the hinge angle, and the lid follows it through a critically damped spring: stiffness 36/s, about 55 ms behind a moving hand, settled about 0.15 s after release, never overshooting. The open/close button, Home/End and palm-spot opens use stiffness 5/s (about a second, easing in and out) while the camera swings round in spherical coordinates over 1.7 s. **Waking**, as the lid passes 30°: the screen comes up at once (500 ms), the keyboard backlight at +550 ms (900 ms), and the boot screen gives way to the desktop at +1.25 s (first wake only). **Sleeping**, below 18° or at once from the button: display and keys off in 250 ms. Camera moves between spots: 450 ms ease-out. | `/laptop` (`lib/laptop-lid.ts` `LID_SPRING`, `LaptopViewer.tsx` `WAKING`/`SLEEPING`) |
| Laptop open (2D fallback) | Screen and key glow fade in with `transition-opacity duration-700 motion-reduce:transition-none` | `/laptop` `DeckDiagram` |
| **Spot glow** (selection) | `motion-safe:animate-[spot-glow_700ms_ease-out_both]`: the `spot-glow` keyframes in `globals.css` flare a `var(--spot-accent)` ring and halo, then settle. Re-key the element per spot so it replays on each pick. In 3D, the sticker's emissive glow flashes from 0.55 to its resting 0.28 over the same 700 ms (instant under reduced motion). | `/laptop` and Studio: spot tiles, details card, 2D stickers, 3D stickers |

⚠️ `prefers-reduced-motion` is handled only in newer UI so far: `TourSpotlight`, and `/laptop`, where the camera and the button's lid moves jump instead of animating (a dragged lid follows the pointer with no settling), the screen and keys light instantly, and pulses are `motion-safe:`. In new code, wrap non-essential motion in `motion-safe:` (for example `motion-safe:hover:-translate-y-1`). For JS-driven motion, read the preference with `useSyncExternalStore` over `matchMedia("(prefers-reduced-motion: reduce)")` (see `usePrefersReducedMotion` in `app/laptop/LaptopStage.tsx`). Retrofit the rest during the P1-8 accessibility pass.

## 7. Component catalogue

### 7.1 Shared components (`components/`)
| Component | Path | API / notes |
|---|---|---|
| `Navbar` | `components/ui/Navbar.tsx` | `currentLink: string`. Links are `work`, `about`, `blog`, `contact`, and the `JAVA.dev` wordmark goes home. Below `md` it shows a hamburger that opens a full-screen drawer. |
| `Modal` | `components/features/Modal.tsx` | `isOpen`, `onClose`, `title?`, `variant: "default" \| "dark"` (**always use `dark`**), `size: "md" \| "lg"`, `contentClassName?`, `bodyClassName?`. Renders through a portal into `document.body`, closes on Esc and on backdrop click, and locks scroll. **Traps focus** (since 2026-10-30): focus moves to a `[data-autofocus]` child (or the box), Tab wraps, and focus returns to the opener on close. |
| `MarkdownRenderer` | `components/ui/MarkdownRenderer.tsx` | `content: string`. The **only** way to render user markdown (see SECURITY.md). Styles every element (§7.4). |
| `ProjectList` | `components/ui/ProjectList.tsx` | `projects: PublicProject[]`. A compact row list: icon tile, title, category, 2-line description, tags, status, year, and a "View →" link that appears on hover. |
| `HomeComponent`, `WorkComponent` | `components/ui/` | Page bodies. They are not reusable. |
| `PageTracker` | `components/ui/PageTracker.tsx` | Invisible; mounted once in the root layout |
| `useCopyToClipboard` | `components/ui/useCopyToClipboard.ts` | Returns `{ state: "idle" \| "copied" \| "failed", copy(text) }`. Copy buttons show "Copied!" only after the browser accepts the write, otherwise "Couldn't copy", inside an `aria-live="polite"` span; resets after 2 s. |
| `ComingSoon` | `components/ui/ComingSoon.tsx` | Dead code. Don't use it; delete it (P1-6). |

### 7.1b Onboarding and tour (`components/onboarding/`, added 2026-10-20)
| Component | Pattern |
|---|---|
| `IntroModal` | **Bottom sheet on phones** (`items-end`, `rounded-t-2xl`), centred card from `sm` up with a **fixed height** of `sm:h-[min(88vh,46rem)]`, so the dialog doesn't jump between steps. It has a sticky header (wordmark, step dots, ✕ when allowed), a scrolling body (`StepBody`), and a sticky footer (`StepFooter`). On phones the footer buttons stack with the primary action on top. Enters with `motion-safe:animate-[intro-in_.25s_ease-out]` (keyframes in `globals.css`). |
| Step heading | Eyebrow plus `font-syne font-extrabold text-2xl sm:text-3xl`. It receives focus on each step (`data-step-heading`, `tabIndex=-1`) so screen readers announce it. |
| Consent buttons | **"Necessary only" (secondary, `border-[#3a3850]`) and "Accept all" (primary) are the same size**: equal prominence is a compliance requirement, not a style choice. "Save my choices" is ghost. |
| Category card | `bg-[#0d0c14] border border-[#2a2840] rounded-xl p-4`; "Always on" pill `text-emerald-400 border-emerald-500/30`; switch per §7.3 with `role="switch"` |
| `PreviewFrame` | A browser-chrome frame (3 dots, monospace URL, "LIVE PREVIEW" label) around **real components rendered small and `inert`**. Use it for any "here's what X looks like" content instead of screenshots. |
| Guide tabs | Vertical `role="tablist"` from `md` up and a horizontal scroll row on phones. The active tab is `bg-[#7c6dff] text-white`. Arrow, Home, and End keys move focus. |
| `TourToolbar` | `border-[#7c6dff]/40 bg-[#13121c] rounded-2xl` under the nav row, with a 1 px progress bar on the bottom edge. When scrolled away, a compact copy docks at the top (`fixed top-0`, `bg-[#13121c]/95 backdrop-blur`). |
| Next-tab highlight | `ring-2 ring-[#7c6dff] bg-[#7c6dff]/15 text-white` plus a ping ring and a `NEXT` pill: floated above the link in the desktop nav, inline after the link in the mobile drawer. The ☰ button gets the ring and a ping dot. |
| `TourSpotlight` | Fixed box around the target. A **single inline `box-shadow` stack**: 2 px `#7c6dff` outline, glow, then a `9999px rgba(5,5,10,.5)` page dim. `pointer-events: none`. Don't use Tailwind `ring-*` on it, because the inline shadow overrides it. |
| `Toast` | Bottom-centre, `bg-[#13121c] border-[#2a2840] rounded-xl`, `role="status"`, auto-hides after 4.5 s |
| `SiteFooter` | `border-t border-[#1e1c2e]`, `text-xs text-[#8a88a0]`, with links for Privacy · Cookie settings · Take the tour. Hidden on admin pages. |

**Z-index scale** (keep new overlays inside it): spotlight `z-45` · highlighted nav tab `z-46` · tour bar `z-47` · docked tour bar `z-48` · mobile drawer `z-55` · modal `z-60` · toast `z-70`. Use Tailwind's canonical integer classes (`z-46`, not `z-[46]`).

### 7.1c 3D laptop (`app/laptop/`, added 2026-10-30, inside view 2026-11-03)
| Element | Pattern |
|---|---|
| Viewer card | A standard card at `p-3 sm:p-4`, wrapping a **canvas well**: `relative h-80 sm:h-105 xl:h-130 rounded-xl overflow-hidden bg-[#0a0a0f]` with the violet top glow (`radial-gradient(circle at 50% 0%, rgba(124,109,255,.12) 0%, transparent 60%)`, `pointer-events-none`). The well is `role="img"` with a text description; the canvas inside is `aria-hidden`. |
| Viewer status line | Below the well: `role="status"`, `text-xs text-[#8a88a0]`. Fallback titles are in `text-[#c4c0d8] font-medium`. The ready hint is "Drag the lid to open or close it, drag beside the laptop to rotate, scroll or pinch to zoom, and click a sticker to see its sponsor." Controls sit on the right. First, in 3D only, the **Lid slider**: a "Lid" label in the status colour, then a `w-24 sm:w-28` range input styled by `.lid-slider` in `globals.css` (a 4 px `#2a2840` track filled `#7c6dff` up to the angle through `--fill`, and a 14 px `#f0eeff` thumb with a 2 px violet border), with `aria-label="Lid angle"` and `aria-valuetext` "Open N degrees" or "Closed". Then the **primary** "Open the laptop" / "Close the laptop" toggle (`bg-[#7c6dff] text-white`, `text-xs px-3 py-1.5 rounded-lg`; the label changes, no `aria-pressed`), then the secondary Reset view and Try again. |
| Lid drag (3D) | The canvas cursor is `ns-resize` over the lid (anything under the `Lid` node), `pointer` over a sticker, and `grab` elsewhere. A press on the lid turns it and never orbits; a press elsewhere orbits. The camera stays put while the lid moves, so the visitor stays in control of the view. |
| Loading | A lid-shaped skeleton (`aspect-[30.41/21.24]`, `bg-[#1e1c2e] motion-safe:animate-pulse`) centred in the well |
| 2D fallback | A flat lid drawing (`bg-linear-to-b from-[#3a3850] to-[#2a2840]`, hinge bar at the bottom). The four spots are drawn as stickers (theme fill, `#f0eeff` edge, the mark or the uploaded image), with a dashed violet border on an open one. **Clickable and hoverable** (mouse only; `data-spot` on each): the selected one gets a 4 px ring and a 22 px glow in its **spot accent** plus `brightness-125` and the spot glow; a pointed-at one a 2 px ring at 60%. It's `aria-hidden`, because the picker is the accessible control. **Open:** an inline SVG (`DeckDiagram`) at the model's real proportions: a `#0b0b0e` lid with the lit wallpaper and dock, then the base foreshortened ×0.45 with the keys (from `lib/laptop-keyboard.ts`, white 0.45-opacity edges as the backlight), the trackpad, and the two palm spots as sticker-coloured chips (selected: a 2.5 px ring in the spot accent; pointed at: 1.2 px at 60%). |
| Spot pickers | Two sections, each an eyebrow + Syne `text-xl` heading + `role="radiogroup"` of `grid-cols-2` tiles: "On the lid · Four sponsor spots" (2×2) and "Inside the laptop · Two palm rest spots" (1×2, with a `text-xs text-[#8a88a0]` hint). **One selection across both groups**; each group has its own roving tab stop; arrows/Home/End move within a group. Colours come from `spotTileStyle(slot, { selected, hovered })` (`app/laptop/LaptopStage.tsx`), in the **spot accent** (`spotAccent`: the sticker's fill, or `#7c6dff` for an open spot). Unchecked: `bg-[#0a0a0f] border-[#2a2840]`. Pointed at (here, in 3D, or in the drawing): accent border, accent at 8% behind. Checked: accent border, accent at 20% behind, `0 0 0 1px` + `0 0 16px` accent halo, `text-white`, and the spot glow. The eyebrow is the position, after a 6 px dot in the accent so the tile visibly matches its sticker; the label is the sponsor or "Open spot". |
| **Highlight sync** (rule) | The selected spot lights up in its accent **everywhere at once**: 3D sticker, 2D drawing, tile, details card (Studio: spot card and editor eyebrow). Pointing at any of them lights the others faintly. `selectedId` and `hoveredId` live in the page and flow down; any new view of the spots takes both and reports hover back. Never colour a selection violet when the sponsor's accent is something else. |
| Details card | Inset panel (`bg-[#0d0c14] border-[#2a2840] rounded-xl p-4`, `aria-live="polite"`); with a spot chosen, the border takes its accent and a re-keyed overlay plays the spot glow. An uploaded sticker shows as a `w-24 h-24 object-contain` thumbnail. The eyebrow is the full spot name ("Lid, upper left", "Palm rest, left of trackpad"). Sponsor: theme `catColor` eyebrow, a **"Sample sponsor" pill** (`border-[#3a3850] text-[#c4c0d8]`) for samples only, Syne title, tagline in `catColor`. Open spot: the emerald "Available" status. It always ends with the primary pill "Sponsor a spot →", which opens the offer dialog (§7.1d). |
| Sticker artwork (canvas) | Rounded square (lid) or 5:3.5 landscape badge (palm rest) with a `#f0eeff` die-cut edge. purple `#7c6dff` fill with white ink, green `#97C459` with `#0f1a14` ink, pink `#ED93B1` with `#1a1216` ink. Open spot: `#13121c` at 88% opacity, a dashed `#7c6dff` border, and "YOUR LOGO" in `#AFA9EC`. **Uploaded image:** the theme fill, then the image contain-fitted inside a 26 px margin and clipped to the rounded shape, then the die-cut edge on top; the mark shows until the image loads. **Highlight:** the selected sticker gets a frame (halo) in its spot accent, drawn before the sticker so its clear margin never clips it, and glows (an emissive map of its own artwork at 0.28, flashing to 0.55 on selection); a pointed-at sticker gets the halo at 55% and a 0.16 glow. |
| Screen (canvas, 1280×800) | Unlit and not tone-mapped, so colours stay true. **Boot:** black with the `JAVA` (`#f0eeff`) `.dev` (`#7c6dff`) wordmark and a thin progress bar. **Desktop:** a diagonal `#1d1648 → #0d0c14 → #2a1530` wallpaper with soft violet, pink and green glows and two violet ribbons; a 30 px `rgba(10,10,15,.55)` menu bar with the wordmark, Work · About · Blog · Contact, and the local time; a frosted dock of five letter tiles (H W A B C) in the accent colours. While the screen is on, the room light dims 30%. No Apple marks. |
| Keyboard (canvas, 1280 wide) | US 2019 butterfly layout with the Touch Bar (`lib/laptop-keyboard.ts`). Colour map: `#1d1d22 → #0e0e11` keycaps with `#5d5d68` legends, clear gaps so the deck shows. Emissive map (the backlight, white): legends plus a 16% edge glow, and the Touch Bar (esc, a violet→pink `JAVA.dev` pill, brightness and volume buttons). Modifier names sit in a bottom corner with the symbol (⌘ ⌥ ⌃ ⇧) in the top corner. |

### 7.1d Sponsorship form and emails (added 2026-10-30)
| Element | Pattern |
|---|---|
| Offer dialog | The shared `Modal` (`variant="dark"`, title "Sponsor a spot"). With Turnstile configured (S-40), Cloudflare's widget (`theme: "dark"`, `min-h-16` slot) sits above the privacy line; if its script can't load, a `text-xs text-pink-400` alert says so. Intro in `text-sm text-[#8a88a0]`. Fields use the **Studio input style**, with labels in `text-xs font-medium text-[#c4c0d8]`, hints in `text-xs text-[#8a88a0]` below, and errors in `text-xs text-pink-400` with a `border-pink-400` field (`aria-invalid`, `aria-describedby` to hint + error). The offer input has a `$` prefix. The file input styles its button with `file:` utilities (`file:bg-[#1e1c2e] file:border-[#2a2840] file:rounded-lg`). The full-width primary submit reads "Sending…" while busy. A ghost line below links to Contact. |
| Receipt | Replaces the form in place: the emerald "Offer sent" status, a Syne title, and an inset `<dl>` (`bg-[#0d0c14]`) of what was sent. The copy says honestly whether an email copy went out. A full-width "Done" button gets focus. |
| Emails (HTML) | Table layout, inline styles, `color-scheme: dark`. A `#0a0a0f` page; the `JAVA.dev` wordmark (violet dot); a `#13121c` card with a 1 px `#2a2840` border, a **3 px `#7c6dff` top border**, and 16 px radius; a violet uppercase eyebrow, a 24 px `#f0eeff` heading, `#c4c0d8` body; an inset details panel (`#0d0c14`) with `#8a88a0` uppercase labels over `#f0eeff` values; a violet pill button (owner email only); a `#8a88a0` 12 px footer. Plain-text twin always. Reuse `layout()` in `lib/sponsor-email.ts` for new emails. |

### 7.1e Studio → Sponsorships (`app/studio/SponsorshipsPanel.tsx`, added 2026-11-03)
| Element | Pattern |
|---|---|
| Layout | `max-w-7xl space-y-4`: a 4-up stats row (standard cards, Syne `text-xl` value over an `text-[11px]` uppercase label), then `xl:grid-cols-12`: the laptop (`xl:col-span-7`) beside the spot editor card (`xl:col-span-5`), then the Spots card, then the Offers card. |
| Laptop preview | The same `LaptopStage` as `/laptop`, with a "Show hidden stickers" checkbox styled as a secondary toolbar button (`extraControls`). Ready hint: "What visitors see on /laptop. Click a sticker to edit its spot." |
| Setup banner | A card with `border-amber-500/40 text-amber-200`, `role="status"`, naming `supabase/sponsorships-schema.sql`. Controls stay visible but disabled. |
| Spot cards | `grid sm:grid-cols-2 lg:grid-cols-3` of tiles styled by `spotTileStyle` (the same highlight sync as `/laptop`). Each: a 48 px thumbnail (the image, or the mark on the theme fill, or a dashed "Open"), the spot name eyebrow, the sponsor name, badges (`text-[10px] rounded-full border`: Sample (violet-grey), Hidden (amber), From an offer (emerald)), and a **visibility switch** on the right. |
| Visibility switch | `role="switch"`, `w-10 h-6 rounded-full`, `bg-emerald-500` on / `bg-[#2a2840]` off, a white 16 px knob, a `text-[10px]` "Shown"/"Hidden" caption, saves at once, error under it in `text-[10px] text-pink-400`. |
| Spot editor | Eyebrow in the spot accent, Syne `text-xl` title, the switch; thumbnail + Upload/Replace, Open, Remove image (secondary buttons); Studio inputs with uppercase `text-[11px]` labels; a colour `radiogroup` of chips with an accent dot; primary "Save details"; danger "Clear spot"; "Place an offer's sticker here" select + Place. Saved notices in `text-xs text-emerald-300` (`role="status"`), errors in `text-xs text-pink-400` (`role="alert"`). |
| Offer row | `bg-[#0d0c14] border-[#2a2840] rounded-xl p-4`, a 96 px thumbnail linking to the file, affiliation + Syne offer amount + status pill (new: violet, accepted: emerald, declined: grey), a meta line (mailto, preferred spot, date, file name), then actions and a notes field ("Save note" appears once it changes). Status filter: the segmented control from the Studio tabs, with counts. |
| Two-step destructive button | Danger outline (`border-pink-500/40 text-pink-300`); the first click turns it `bg-red-600 text-white` with "Click again to …" (pulsing, motion permitting) for 3 s. Used for Clear spot and Delete offer. |
| Preview banner | Above the laptop while a sticker is previewed: a standard card with a `border-[#7c6dff]/60` border, `role="status"`, a pulsing violet dot (motion permitting), "Previewing <name> on <spot>. Only you see this, and nothing is saved.", then **Back to the editor** (from the editor) and **End preview** as secondary buttons. |
| Offer actions | **Edit & print** is the offer's primary button; **Preview on laptop** sits with the secondary ones. The thumbnail (on the `sticker-checkerboard`, `cursor-zoom-in`) opens the editor too. |

### 7.1f Sticker editor (`app/studio/StickerEditor.tsx`, added 2026-11-05)
| Element | Pattern |
|---|---|
| Frame | The shared `Modal`, `variant="dark" size="xl"` (`max-w-6xl max-h-[94vh]`), body `p-0!`. Two columns from `lg`: the sticker (`flex-1`) and the controls (`lg:w-88`, `border-l border-[#2a2840]`, scrolling on their own); stacked on phones, sticker first. |
| View | A toolbar of small outline buttons (`text-xs px-2.5 py-1.5 rounded-lg border-[#2a2840]`): − / zoom % / + / Fit / Actual pixels, and a **Cut line** checkbox (`accent-[#ff2bd6]`) on the right. The well is `sticker-checkerboard` (`globals.css`: a 16 px `#13121c`/`#1e1c2e` checkerboard showing transparency), `h-[44vh] lg:h-[52vh] rounded-xl`, `cursor-grab`, focusable, with wheel and pinch zoom, drag or arrow keys to move, double-click to fit. Above 200% the pixels render `pixelated`, so you can inspect the file. |
| Cut line | Design Space's cut-line pink, `#ff2bd6`, one pixel along the edge of the opaque pixels, drawn on its own canvas over the sticker. |
| Readout | Under the well, `text-xs text-[#8a88a0]`: the printed size in cm and inches, the pixels at 300 DPI, and the artwork's own DPI with its verdict in `text-emerald-300` (sharp), `text-amber-300` (fine) or `text-pink-300` (may print soft, plus one line of advice). |
| Actions | Under the readout, never below the fold: primary **Download for Cricut (PNG, 300 DPI)**, then secondary **Print at real size** with a Copies field (1–20), **Preview on the laptop**, and **Save as <spot>'s sticker**. Results in `text-xs` emerald (`role="status"`) or pink (`role="alert"`). A `<details>` "Cutting it on a Cricut" holds the four steps. |
| Controls | Sections with the `text-[11px] tracking-widest uppercase text-[#555370]` eyebrow: Size (a select of the six spots plus Custom), Shape (a radiogroup of chips; selected `border-[#7c6dff] bg-[#7c6dff]/20 text-white`), then **Layer 1 · Sticker colour**, **Layer 2 · Edge**, **Layer 3 · Artwork**. Sliders reuse `.lid-slider` with the value on the right in `tabular-nums`. |
| Colour swatches | A radiogroup of 28 px rounded squares: Clear (checkerboard), White, Black, and the three sticker colours, then a conic-gradient tile that opens the colour picker. Selected: `ring-2 ring-[#7c6dff] ring-offset-2 ring-offset-[#13121c]`. |
| Print sheet | A portal shown only in print (`.sticker-print-sheet`, with `body.printing-sticker` hiding everything else): the copies at their real size in millimetres, 4 mm apart. |

### 7.1g Logo preview on `/laptop` (`LaptopExperience.tsx`, added 2026-11-05)
| Element | Pattern |
|---|---|
| Trigger | In the details card, beside **Sponsor a spot →**, a secondary pill (`rounded-full border-[#2a2840] text-[#c4c0d8]`): "Preview your logo on the laptop" (no spot chosen), "Preview your logo here", or "Move your logo here" once one is showing. It opens a hidden PNG/JPG file input. |
| Preview card | The details card bordered in the spot's accent, with a **Preview** pill (`border-[#7c6dff]/60 text-[#AFA9EC]`), the logo as a 96 px thumbnail, "Your logo, on the laptop", one line saying only the visitor sees it and the file stays in their browser, then **Send this as an offer →** (primary), **Try another image** (secondary), and a quiet **Remove preview** text button. |
| On the laptop | The previewed spot's tile reads "Your logo", and the 3D and 2D stickers draw it the way an accepted logo would look (on the spot's colour, in the white edge). The scene description says "(preview)". |

### 7.2 Studio-local primitives (`app/studio/shared.tsx`)
- The admin gate now lives in `components/features/AdminGate.tsx`, shared by `/studio` and `/logistics`. `<AdminGate title description>` checks the session and otherwise shows a centred card with the "Restricted" eyebrow, a password input, an inline error, and a primary button. `<SignOutButton/>` is a secondary-style button for admin page headers.
- `Icon({ d, className = "w-4 h-4" })` with `ICON_PATHS` (edit, external, share, link, trash, warning, kebab, close, check, search, plus, chevron, chevronLeft, gear, eye, eyeOff, star, rocket): 24 px outline paths with stroke 2 in the Heroicons style. **Use these for admin UI icons**; add new paths here instead of pulling in another icon set.
- **Card quick actions:** `useCardAction()` runs a grid card's publish toggle or delete one at a time (the toggle is `disabled` with `disabled:opacity-50 disabled:cursor-wait` meanwhile), and `<CardActionError message>` shows a failure under the card's content in `text-[11px] text-pink-400` (`role="alert"`). A 401 reads "Your session expired. Reload the page to sign in again."
- Public pages use `react-icons` (`rx`, `fa6`, `md`, `io5`) at sizes 12–20.

### 7.3 Patterns (copy these class strings)

**Card**
```
bg-[#13121c] border border-[#2a2840] rounded-2xl p-6 hover:-translate-y-1 transition-transform duration-300
```

**Accent hero card** (one per page at most)
```
bg-[#7c6dff] rounded-2xl p-6 …   (text white; secondary text white/60; eyebrow white/50)
```
Contact uses `bg-pink-600` as its hero accent. That is acceptable as the page's theme, but keep it to one solid card per page.

**Tag pill**
```
text-xs px-2.5 py-0.5 rounded-full border font-medium ${theme.tagStyle}
```
On dense cards use `text-[10px] px-2 py-0.5`.

**Status indicator**
```tsx
<div className="flex items-center gap-1.5">
    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
    <span className="text-xs text-emerald-400 font-medium">Live</span>
</div>
```

**Filter pills** (public)
```
base:     text-xs px-4 py-2 rounded-full border transition-all duration-200 cursor-pointer
active:   bg-[#7c6dff] text-white border-[#7c6dff]
inactive: border-[#2a2840] text-[#888] hover:border-[#7c6dff] hover:text-[#c4c0d8]
```

**Segmented control** (Studio tabs, status filter)
```
container: flex gap-1 bg-[#13121c] p-1 rounded-xl border border-[#2a2840] w-fit   (bg-[#0a0a0f] when nested in a card)
item:      px-4 py-2 rounded-lg text-sm font-medium transition-colors   (px-3 py-1 text-xs when small)
active:    bg-[#7c6dff] text-white      inactive: text-[#555370] hover:text-[#c4c0d8]
```

**Buttons**
| Variant | Classes |
|---|---|
| Primary (form, full width) | `w-full bg-[#7c6dff] hover:bg-[#6a5de8] disabled:opacity-40 text-white font-medium text-sm py-3 rounded-xl transition-colors cursor-pointer` |
| Primary pill | `bg-[#7c6dff] hover:bg-[#6a5de8] text-white text-sm font-medium px-6 py-2.5 rounded-full transition-colors` (Contact currently uses `bg-violet-600`) |
| Inverse pill (on a solid accent card) | `bg-white text-violet-600 text-sm font-medium px-5 py-2.5 rounded-full hover:opacity-90` |
| Secondary | `text-xs px-3 py-1.5 rounded-lg border border-[#2a2840] text-[#c4c0d8] hover:bg-[#1e1c2e] transition-colors` |
| Text link / action | `text-xs text-[#7c6dff] hover:text-[#6a5de8] font-medium` or `hover:underline` |
| Icon button | `p-1.5 rounded-lg text-[#555370] hover:text-[#f0eeff] hover:bg-[#1e1c2e]`, **always with `aria-label`** |
| Destructive | `text-xs px-3 py-1.5 rounded-lg border border-pink-400/30 text-pink-400 hover:bg-pink-400/10 disabled:opacity-40`. It **must be two-step**: the first click arms it (the label or icon changes to a warning), and the second confirms. |

**Inputs** (canonical: the Studio style)
```
w-full bg-[#0a0a0f] border border-[#2a2840] rounded-xl px-3 py-2 text-sm text-[#f0eeff]
placeholder-[#555370] outline-none focus:border-[#7c6dff] transition-colors
```
Labels: `block text-xs font-medium text-[#888] mb-1.5`. Selects use the input classes plus `cursor-pointer`. Textareas for markdown add `font-mono resize-y`.

**Toggle switch**
```
track: relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? "bg-[#7c6dff]" : "bg-[#2a2840]"}
knob:  inline-block h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}
```
For publish-style toggles, use `bg-emerald-500` when on. Always add `role="switch"` and `aria-checked` (missing today).

**Progress bar / meter**
```
track: bg-[#1e1c2e] h-1 (or h-1.5) rounded-full overflow-hidden
fill:  h-full rounded-full bg-violet-500 (or inline background colour), width via style
```

**States.** Every data-driven view needs all four:
| State | Pattern |
|---|---|
| Loading | Skeleton cards with the same grid spans and `animate-pulse`, `bg-[#1e1c2e]` bars |
| Empty | Card `p-12` centred: emoji `text-4xl`, title `text-[#c4c0d8] font-medium`, hint `text-xs text-[#555370]`, optional action link |
| Error | `bg-[#1a1216] border border-[#2e1f28] rounded-2xl p-6 text-pink-300 text-sm` |
| Inline form error | `text-xs text-pink-400` above the submit button |

### 7.4 Markdown output (`MarkdownRenderer`)
- **Headings:** h1 is Syne extrabold `text-2xl` with a bottom border; h2 `text-xl`; h3 `text-lg #c4c0d8`. All of them have `clear-both` so floated images don't bleed into the next section.
- **Paragraphs** use `text-sm text-[#7a7890] leading-relaxed mb-4`. A paragraph that contains an image renders as a `<div>` to avoid an invalid `<p><figure>` (a hydration error).
- **Links** are violet-400 and underlined, and open in a new tab with `noopener noreferrer`.
- **Code blocks** have a header bar (`#0d0c14`) with a language badge and a Copy button, and a body on `#0a0a0f` with atom-one-dark tokens (the `.hljs` background is forced transparent in `globals.css`).
- **Tables** sit in a rounded, bordered, horizontally scrollable wrapper with a `#1e1c2e` header row.
- **Task lists** use custom checkbox spans (violet when checked).
- **Images:** see PRD.md BLOG-3 for the `|size` and `|left`/`|right` syntax. Images are rounded with a border and an optional italic caption.

### 7.5 OG images
`app/opengraph-image.tsx` and `app/blog/[slug]/opengraph-image.tsx` (1200×630) share one style: a `#0a0a0f` background, a violet radial glow in the top right, an eyebrow in `#7c6dff` (uppercase, 0.25em tracking), a title in `#f0eeff` at weight 900, a tagline in `#6b6880`, and a pill on `#13121c`/`#2a2840`. Keep new generated images in this style. Note that `ImageResponse` requires `display: "flex"` on every element that has children.

## 8. Content and voice
- The brand is written **`JAVA.dev`**, and the full name is **Jorge Alejandro Vilanova Alvarado**.
- Tone: confident, friendly, brief. Arrows mark actions: "View Project →", "Read post →", "Open full page ↗".
- Use emoji only as content icons or for small flourishes ("always on ☕"), never in nav or buttons.
- Use **sentence case** for headings; eyebrows are uppercased by CSS (write them in normal case in JSX).
- Render apostrophes as `&apos;` in JSX (ESLint `react/no-unescaped-entities`).

## 9. Accessibility rules (for new and edited UI)
1. Icon-only buttons need an `aria-label`. _Gaps: the Navbar hamburger and close buttons, and the Logistics tracking switch._
2. Interactive cards must be `<button>` or `<a>`, never a `<div onClick>`. The blog cards are buttons ✅. The Home "+ More" cell is an `<a>` without `href`; make it a `<button>`.
3. Modals: `role="dialog"`, `aria-modal`, and `aria-labelledby`, close on Esc, focus trap and focus return ✅ (shared `Modal`). If the opener might not have focus (Safari doesn't focus buttons on click), focus it explicitly on close, as `LaptopExperience` does.
4. Keep a visible focus indicator. Inputs use `focus:border-[#7c6dff]`. Buttons and cards need `focus-visible:ring-2 focus-visible:ring-[#7c6dff]/60` (missing today).
5. Contrast against a `#13121c` card, computed with WCAG relative luminance (approximate):

   | Text colour | Ratio | Verdict |
   |---|---|---|
   | `#555370` | about 2.5:1 | Decorative or meta text only |
   | `#6b6880` | about 3.5:1 | Fails AA for small text |
   | `#7a7890` | about 4.3:1 | Just under AA |
   | `#8a88a0` | about 5.4:1 | Passes |
   | `#c4c0d8` | well above 7:1 | Passes |

   On the `#0a0a0f` page background, `#7a7890` reaches about 4.6:1. **When you touch body or description text on cards, move toward `#8a88a0`** (or `--color-fg-body` once tokens land). Never put information users need in `#555370`.
6. Toggles need `role="switch"` and `aria-checked`, and filter pills need `aria-pressed`.
7. Every image needs `alt`. Markdown uses the caption as alt text.

## 10. Known inconsistencies (converge toward the ✅ choice)
| # | Inconsistency | Where | ✅ Canonical |
|---|---|---|---|
| ~~1~~ ✅ | ~~Display and body fonts don't load~~ | Global | Fixed 2026-11-03 (P0-2, §3.1) |
| 2 | Violet as `#7c6dff` vs Tailwind `violet-400/500/600` | Home hero card, Contact button, links | `#7c6dff` for fills and borders, `#AFA9EC` for light text. Keep `violet-400` only for markdown links until tokens land. |
| 3 | Planned status is `orange-400` vs `pink-400` | `ProjectList` uses pink | `orange-400` |
| 4 | Body grey varies: `#7a7890`, `#6b6880`, `text-gray-500`, and the darker two fail AA on cards | Pages | Body `#8a88a0`, descriptions `#7a7890` (see §9.5) |
| 5 | Eyebrow colour `text-gray-600` vs `#555370`; sizes `10px`/`11px`/`xs` | Home, Contact | `text-[11px] … text-[#555370]` |
| 6 | Home stat tile label and sub at `text-2xl` (oversized) | `Home.tsx` | Label as eyebrow, sub `text-xs text-[#555370]` |
| 7 | Unstyled section labels `<p>Projects</p>` and `<p>Tech Language</p>` | Home, About | The eyebrow style |
| 8 | Contact inputs (`bg-[#1e1c2e]`, `text-gray-300`, `focus:border-violet-500`) differ from Studio inputs | Contact | The Studio input style |
| 9 | Two modal systems: `components/features/Modal` (portal, black/60) vs hand-rolled Studio modals (no portal, black/70) | Studio | Extend `Modal` (header slot, footer slot, `size="xl"`) and migrate the Studio modals onto it |
| 10 | The `/work` featured and side cards always show "Live" | `WorkComponent` | Render from `status` like the small cards |
| 11 | `globals.css` defines a light palette for `prefers-color-scheme: light`, so `body` is white in light mode (visible on overscroll, and in `Modal variant="default"`) | `globals.css` | Make dark unconditional (`--background: #0a0a0f`, `--foreground: #ededed`) and `color-scheme: dark` |
| ~~12~~ | ~~Off-palette colours in the Navbar~~. **Fixed 2026-10-20**: both menu buttons now use the §7.3 icon-button style and have `aria-label`s, and the closed drawer is `inert`. | Navbar | |
| 13 | Class typos: `w-filt` (meant `w-fit`) on the resume button; `font-white/65` (meant `text-white/65`) on About; conflicting `w-full w-16` on the Work featured icon; `tracking-light` (does not exist) | Home, About, Work | Fix during P0-3 or P1-1 |
| 14 | Home shell uses `p-8 font-sans`; the other pages use `p-6 md:p-8 font-dm` | `app/page.tsx` | `p-6 md:p-8 font-dm` |

## 11. Proposed tokens (not implemented yet; adopt incrementally)
Register semantic tokens in `app/globals.css` so classes read `bg-surface-card border-line` instead of hex values. Tailwind 4 generates utilities from `--color-*` and `--font-*` theme variables:

```css
@theme {
  --color-surface-page:  #0a0a0f;
  --color-surface-inset: #0d0c14;
  --color-surface-card:  #13121c;
  --color-surface-warm:  #16131a;
  --color-surface-raised:#1e1c2e;
  --color-line:          #2a2840;

  --color-fg:            #f0eeff;
  --color-fg-strong:     #c4c0d8;
  --color-fg-body:       #8a88a0;   /* lifted from #7a7890 for AA contrast on cards */
  --color-fg-muted:      #7a7890;   /* replaces #6b6880 */
  --color-fg-dim:        #555370;

  --color-brand:         #7c6dff;
  --color-brand-hover:   #6a5de8;
  --color-brand-soft:    #AFA9EC;
  --color-leaf:          #97C459;
  --color-blush:         #ED93B1;
}
```

**Migration rule:** once the tokens exist, use them in all new code, and replace the hex values in a file whenever you're already editing it. Don't do a repo-wide find-and-replace in one go. Pair this with moving the theme maps into a single `lib/theme.ts` (PRD P1-5).

## 12. Checklist for any UI change
- [ ] Uses the page shell, the bento grid, and the card pattern
- [ ] Colours come from §2 (or §11 tokens); no new hex values without adding them here
- [ ] Has loading, empty, and error states if it shows remote data
- [ ] Works at 360 px, 768 px, and 1280 px or wider
- [ ] Hover lift on cards; nothing animates over 500 ms (the 700 ms bar fill is the only exception)
- [ ] Icon buttons labelled; keyboard reachable; focus visible
- [ ] External links have `target="_blank" rel="noopener noreferrer"`
- [ ] No `<img>` outside `MarkdownRenderer`; use `next/image` instead
- [ ] This doc is updated if you added a pattern
