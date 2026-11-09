# PRD: JAVA.dev Portfolio (portfoliomkv)

_Product requirements, current feature inventory, and the prioritized roadmap. Last verified against the code: **2026-11-09** (branch `security-email-guards`)._

Requirement IDs (`PUB-3`, `BLOG-2`, …) and roadmap IDs (`P0-1`, `S-1`, …) are stable, so reference them in commits, PRs, and other docs.

---

## 1. Product summary

**JAVA.dev** is the personal portfolio of **Jorge Alejandro Vilanova Alvarado**, a full-stack developer in California who is open to remote, freelance, full-time, and contract work. It is "mkV", the fifth iteration. The previous iteration lives in a sibling `PortfolioMkIV` folder and is reference only.

The site is three things at once:

1. **A shop window.** It should convince a recruiter or client, in under a minute, who the owner is, what they build, and how to reach them.
2. **A portfolio piece in itself.** The dark bento-grid UI, the interaction polish, the security hardening, and the test suite are all part of the pitch.
3. **A small content platform.** It has a blog, a self-built CMS ("Studio"), and private analytics ("Logistics"), so content changes never need a code deploy.

## 2. Goals and non-goals

### Goals
| ID | Goal | How we know |
|---|---|---|
| G1 | A visitor understands who, what, and how to contact within one screen of Home | Hero, focus card, and resume download are above the fold on desktop and mobile |
| G2 | Show real, current work | Every project shown comes from one managed source (Supabase `projects`) and has a live link where one exists |
| G3 | Publishing a post is frictionless | Write in `/studio` or POST a markdown file to `/api/blog/upload`; it is live on publish, with no deploy |
| G4 | The owner manages all site content without code | Posts and projects have full CRUD in `/studio` |
| G5 | The owner understands traffic | `/logistics` shows volume, sources, devices, and engagement |
| G6 | The site is safe to run in public | Every admin and automation endpoint is authenticated, validated, and rate-limited (see SECURITY.md) |

### Non-goals (for now)
- Visitor accounts, comments, and public sign-up
- Payments or e-commerce
- Internationalization (the site is English only)
- Multiple admins or roles (there is one owner and one password)
- A light theme. The site is dark-only by design; a theme toggle is in the backlog.
- A third-party analytics service. Analytics are first-party in Supabase on purpose.

## 3. Users

| Persona | Wants | Primary surfaces |
|---|---|---|
| **Recruiter / hiring manager** | A quick read on skills and proof, plus the resume | `/`, `/work`, `/about`, `/resume.pdf` |
| **Client / collaborator** | To see what has been built and to get in touch | `/work`, `/contact` |
| **Developer / reader** | Technical writing | `/blog`, `/blog/[slug]` |
| **Owner (admin)** | To manage content and watch traffic | `/studio`, `/logistics` |
| **Automations** (machine clients) | To push docs, posts, and email digests | `/api/docs/upload`, `/api/blog/upload`, `/api/email-summary` |

Known automations: an external **daily-status task**. It regenerates `PROJECT_OVERVIEW.md`, POSTs it to `/api/docs/upload`, and sends an email digest through `/api/email-summary`; its last visible run was 2026-08-05. Upload scripts or shortcuts may also POST markdown to `/api/blog/upload`.

## 4. Feature inventory (current state)

Legend: ✅ working · ⚠️ working but has a known gap · ❌ missing or broken · 🔒 password-gated

### 4.1 Public site
| Feature | Where | Status | Notes |
|---|---|---|---|
| Home bento: hero, "Currently focused on" card with resume download, skills bars, projects grid, 3 stat tiles, quote | `app/page.tsx`, `components/ui/Home.tsx` | ⚠️ | Projects come from Supabase. Skills and stats are **hard-coded** ("6+ projects", "4yr", "14+"). Hero copy reads "Building things people together", which needs owner review. The "Projects" and card labels are unstyled `<p>`s. |
| Home projects grid | `Home.tsx` + `components/ui/ProjectList.tsx` + `Modal` | ✅ | 6 cells. If there are more than 6 projects, it shows 5 plus a "+ More" cell that opens a modal listing all of them. Empty slots render as dashed cells. |
| Work: filterable showcase (featured card, side card, grid) | `app/work/page.tsx`, `components/ui/WorkComponent.tsx` | ⚠️ | Reads **hard-coded `lib/projects.ts`** (7 entries), not Supabase. Filters are All, Games, API's, UI/UX, and Full Stack. The featured and side cards always show "Live" whatever the status. Links lack `rel`. |
| About: intro, avatar card, scroll-animated timeline (2020 to 2025), tech stack (dots), hobbies | `app/about/page.tsx` | ⚠️ | "Reading" hobby links to `http://localhost:3000/blog`. `font-white/65` is an invalid class. The timeline stops at 2025. |
| Blog list: featured, side, and grid cards; per-post theme; quick-read modal with "Open full page" | `app/blog/page.tsx` | ✅ | Client-fetched with the anon key. Has skeleton, empty, and error states. |
| Blog post page: header, tags, reading time, copy link, rendered markdown | `app/blog/[slug]/page.tsx` | ⚠️ | Content is client-fetched, so it is not in the SSR HTML. The post is fetched twice (once server-side for metadata, once client-side). |
| Markdown rendering: GFM, alerts, code highlighting with copy button, image size and float syntax, sanitized raw HTML | `components/ui/MarkdownRenderer.tsx` | ✅ | See BLOG-3 |
| Contact: copy email, socials, mailto form, location, status, response-time, and coffee tiles | `app/contact/page.tsx` | ⚠️ | The Instagram card links to `#`. The form opens the visitor's mail client and does not send server-side. |
| SEO: per-route metadata, root and per-post OG images, robots, sitemap, Person and BlogPosting JSON-LD | `app/**/layout.tsx`, `app/opengraph-image.tsx`, `app/blog/[slug]/opengraph-image.tsx`, `robots.ts`, `sitemap.ts` | ✅ | The `metadataBase` fallback is `https://java.dev`, which only matters if `NEXT_PUBLIC_SITE_URL` is unset. `/studio` and `/logistics` are neither `noindex` nor disallowed. |
| Page-view tracking | `components/ui/PageTracker.tsx`, `POST /api/analytics/track` | ✅ | **Opt-in only** (consent cookie, enforced server-side). For consenting visitors it records IP, language, timezone, and a visitor id. Skips `/logistics`, `/studio`, and `/api`. Supports per-device opt-out and per-IP exclusion. |
| **First-visit intro modal** | `components/onboarding/IntroModal.tsx` | ✅ | 4 steps: Welcome → Privacy choice → "How to use this site" guide (live previews built from real components) → tour offer. Shown once per browser; re-asks only the privacy step when `CONSENT_VERSION` changes. |
| **Cookie consent** | `lib/consent.ts`, `/api/consent`, `java_consent` cookie | ✅ | Necessary (always on) + Analytics (off by default). "Necessary only" is as prominent as "Accept all". A receipt is logged to `consent_events` (no IP). |
| **Guided tour** | `lib/tour.ts`, `TourToolbar`, `TourSpotlight`, `Navbar` | ✅ | 10 steps across Home → Work → About → Blog → Contact. A bar under the navbar explains each page and highlights the next tab (desktop links, or the ☰ menu on phones); key elements are spotlighted. It survives reloads, docks to the top when scrolled away, and exits with Esc. |
| **Site footer** | `components/onboarding/SiteFooter.tsx` | ✅ | Privacy · Cookie settings · Take the tour, on every public page |
| **Privacy page** | `/privacy` | ✅ | Plain-language policy covering every storage key and data point (generated from the same constants as the modal), plus a "Manage cookie settings" button |
| **Cookie settings / erasure** | footer → settings dialog, `DELETE /api/consent` | ✅ | Change the choice any time; "Delete my data" erases this browser's analytics rows |
| **3D sponsor-sticker laptop** | `/laptop` (`app/laptop/*`, `lib/laptop-stickers.ts`), linked from `/work` | ⚠️ | v1 shipped in code, but **the GLB isn't in `public/` yet**, so visitors see a simpler 3D laptop built in code, which the GLB will replace (LAPTOP_MODEL.md). Three.js viewer of a 13-inch 2019 MacBook Pro with four spots on the lid and **two on the palm rest**, a **draggable lid** (plus an Open the laptop button and a Lid slider; screen boot, backlit keyboard), sponsors **managed in Studio** (sample sponsors until the table exists, labelled as samples), spot pickers (radio groups) that **light up with their sticker** in the sponsor's colour, a details card, and a **"Sponsor a spot" offer form** (email, affiliation, offer, spot, PNG/JPG sticker) that emails the owner (Reply-To: the sponsor), sends the sponsor a copy, and saves the offer for Studio. No payments. ⚠️ The sponsor's copy needs a verified Resend domain (S-2), and `supabase/sponsorships-schema.sql` must be run (SPONSORSHIPS.md). |
| Error and 404 pages | none | ❌ | Uses Next.js defaults |

### 4.2 Admin 🔒
| Feature | Where | Status | Notes |
|---|---|---|---|
| Admin sign-in (shared by Studio and Logistics) | `components/features/AdminGate.tsx`, `/api/auth` | ✅ | The password is sent once and exchanged for an HttpOnly session cookie (8 h). There is a "Sign out" button on both pages. Nothing is stored client-side. |
| **Studio, Blogs tab**: stats (posts, published, drafts, views); New Post form (title, auto-slug, content); grid cards with publish toggle and kebab menu (edit, open, copy link, share, two-step delete); preview/edit modal (Write/Preview tabs, Post Settings: excerpt, emoji, tags, theme, slug); search; status filter; tag filter; 6 sort modes (including "Most popular" by view count); select mode with bulk publish, unpublish, and delete | `app/studio/BlogsPanel.tsx` | ✅ | Bulk delete uses `window.confirm` and is capped at 100 |
| **Studio, Projects tab**: grid cards (featured star, edit, live and GitHub links, public/hidden toggle, two-click delete); 4-step wizard (Basics, Details, Links, Review) for create and edit, with emoji suggestions; filters, sort, bulk ops | `app/studio/ProjectsPanel.tsx`, `ProjectWizardModal.tsx` | ✅ | Lint error at `ProjectWizardModal.tsx:420` |
| **Studio, Sponsorships tab**: stats (offers, new, spots taken, hidden); a copy of the `/laptop` 3D laptop (same component and data, with a "Show hidden stickers" switch); six spot cards (Sample / Hidden / From an offer badges, thumbnail, show/hide switch) that light up with their sticker; a spot editor (name, mark, tagline, description, colour, upload/replace/remove image, two-step clear, place an offer's sticker); an offers inbox (status filter, thumbnail, open/download, mailto, place on a spot, accept/decline, notes, two-step delete) | `app/studio/SponsorshipsPanel.tsx`, `/api/sponsorships`, `/api/sponsorships/spots`, `/api/sponsorships/file` | ✅ | A banner asks for `sponsorships-schema.sql` until it has run; saves refresh `/laptop` at once. Setup: SPONSORSHIPS.md |
| **Logistics**: KPIs (total views, unique sessions, last-30-day views and uniques, average load time), top pages, 30-day daily bars, referrers, devices, new vs returning, bounce rate, peak hours (UTC), recent activity (15), this-device tracking toggle, current IP, excluded IP list | `app/logistics/page.tsx`, `GET /api/analytics/stats` | ✅ | Computed from the latest 50,000 rows in memory |

### 4.3 Integration endpoints
| Endpoint | Purpose | Status |
|---|---|---|
| `POST /api/blog/upload` | Upsert a post from a markdown file with YAML frontmatter (keyed on slug) | ✅ |
| `POST /api/docs/upload` | Upsert a project doc (latest only, per project and filename) into `project_documents` | ✅ |
| `POST /api/email-summary` | Send a pre-built subject, text, and HTML email through Resend to the fixed recipient | ⚠️ The sender domain is unverified (sandbox `onboarding@resend.dev`), so mail reaches only the account owner's address |

## 5. Functional requirements

These are invariants. A change must not break them; if one needs to change, update it here.

### 5.1 Public site (PUB)
- **PUB-1** Every public page renders the dark theme correctly from 360 px up to wide desktop. Bento grids collapse from 12 columns (`xl`) to 2 (`md`) to 1.
- **PUB-2** Every public page renders `<Navbar currentLink=…>` with the active link highlighted. Below `md`, a full-screen drawer replaces the inline links.
- **PUB-3** The resume is downloadable from Home at `/resume.pdf` (a static file in `public/`).
- **PUB-4** Only published content is ever visible publicly. Two layers enforce this: an RLS policy (`published = true`) **and** an explicit `.eq("published", true)` in every public query (`lib/blog.ts`, `lib/projects-data.ts`).
- **PUB-5** Public pages degrade gracefully when Supabase fails. The blog shows an error card; the Home project grid shows empty slots; the post page shows "Post not found".
- **PUB-6** Analytics never break or slow a page. Tracking is fire-and-forget (`keepalive`, errors swallowed), and the track endpoint answers quickly.
- **PUB-7** Every external link opens in a new tab with `rel="noopener noreferrer"`. _(Holds as of 2026-10-19.)_

### 5.2 Blog (BLOG)
- **BLOG-1 Post model.** Fields are `title` (required, ≤300), `slug` (required, unique, `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤200), `excerpt` (≤1,000), `content` (markdown, ≤200,000), `tags` (≤20 tags of ≤50 chars each), `cover_emoji` (≤16), `theme` (`purple` | `green` | `pink`, defaulting to `purple`), `reading_time`, `published` (defaulting to `false`), and the timestamps `created_at` and `updated_at`.
- **BLOG-2 Reading time.** The server recomputes it whenever content changes: `ceil(words / 200)`, with a minimum of 1. An upload may override it with a frontmatter number from 1 to 999.
- **BLOG-3 Markdown features** (keep these working, since tests and posts depend on them):
  - GFM: tables, task lists, strikethrough, autolinks
  - GitHub alerts `> [!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]`, plus a custom `DANGER` style
  - Fenced code with highlight.js (atom-one-dark tokens), a language badge, and a Copy button
  - Image syntax `![Caption|modifier](url)`, where the modifier is `small`/`sm` (320 px), `medium`/`md` (448 px), `large`/`lg` (672 px), `full`, `left`, or `right` (float). The default is 512 px, centred.
  - Raw HTML only from the sanitize allowlist (see SECURITY.md)
- **BLOG-4** Every published post has a page title and description (from its excerpt), a generated OG image at `/blog/[slug]/opengraph-image`, BlogPosting JSON-LD, and a sitemap entry.
- **BLOG-5** There are two authoring paths: Studio and `POST /api/blog/upload`. Uploading the same slug again **updates** the post. A new upload is published only when the frontmatter says `published: true` exactly. A re-upload that omits `published` leaves the post's current state unchanged. Front matter must be YAML or JSON (`---js` is refused).
- **BLOG-6** Per-post view counts are computed at request time by counting `page_views` rows whose `page` is `/blog/<slug>`. They are visible only in Studio today.

**Upload frontmatter contract** (`POST /api/blog/upload`, header `x-api-key: $BLOG_UPLOAD_SECRET`, raw markdown body ≤1 MB):

```markdown
---
title: My Post            # required
slug: my-post             # optional: derived from title; invalid slugs are slugified, never trusted raw
excerpt: Short preview    # optional
tags: [Web Dev, Next.js]  # optional: array, or comma-separated string
cover_emoji: 🚀           # optional, defaults to 📝
theme: green              # optional: purple | green | pink
reading_time: 4           # optional: otherwise computed
published: true           # optional: only literal true publishes
---
# Body in markdown…
```

### 5.3 Projects (PROJ)
- **PROJ-1 Project model.** Fields are `title` (required, ≤200), `description` (≤2,000), `icon` (emoji, ≤16, defaulting to 🚀), `category` (≤80, a free-text label such as "Game" or "Featured project"), `status` (`live` | `wip` | `planned`; unknown values become `planned`), `theme` (`purple` | `green` | `pink`), `tags` (as for posts), `year` (≤20, free text), `link` and `github` (empty, or an `http(s)://` URL of ≤500), `featured`, and `published` (defaulting to **true**).
- **PROJ-2** Home shows published projects ordered by `featured` descending, then `created_at` descending, in a 6-cell grid with the overflow modal described in §4.1.
- **PROJ-3 (target, not yet true).** `/work` reads the same Supabase table, so Studio is the single source of truth. Today `/work` reads `lib/projects.ts`. See P1-1.
- **PROJ-4** Status displays consistently everywhere: Live (emerald, pulsing), In Progress (amber), Planned (orange). _`ProjectList` currently uses pink for Planned; see DESIGN_SYSTEM.md §10._

### 5.4 Studio (STU) 🔒
- **STU-1** Access requires `LOGISTICS_PASSWORD`, checked server-side with a constant-time compare at `POST /api/auth`. That call sets an HttpOnly, SameSite=Strict session cookie (8 h). The client never stores the password. Sign-out clears the cookie, and changing the password signs everyone out.
- **STU-2** Every read and mutation goes through `/api/blog/posts`, `/api/projects`, or the sponsorship routes (`/api/sponsorships`, `/api/sponsorships/spots`, `/api/sponsorships/file`), authenticated by the HttpOnly session cookie from sign-in (no password header). Studio never touches Supabase directly.
- **STU-3** Destructive actions require explicit confirmation: a two-step button or `confirm()`. Bulk operations are capped at 100 ids.
- **STU-4** Studio is excluded from analytics on both the client and the server.
- **STU-5** The UI changes only after the server responds successfully; there are no optimistic writes. On failure, an inline pink error appears and the busy state always resets. _This is currently violated by the grid-card quick actions: `togglePublished` and the delete handlers in `PostGridCard` (`BlogsPanel.tsx`) and `ProjectGridCard` (`ProjectsPanel.tsx`) ignore non-OK responses and have no `try/catch`, so a failure does nothing visible. See P1-9._

- **STU-6** **Sponsorships tab:** every spot on `/laptop` can be shown or hidden with one switch. Hiding keeps the sponsor in Studio and shows the spot as open on `/laptop`. Each spot's name, mark, tagline, description, colour and image can be edited, and a spot can be cleared.
- **STU-7** Studio's laptop preview is the same component and data as `/laptop`, plus hidden stickers when "Show hidden stickers" is on. Selecting a sticker there or a spot card selects both, and both light up in the sponsor's colour; pointing at either lights the other faintly.
- **STU-8** Every offer from the form is listed (newest first) with its file, which can be opened or downloaded. An offer's sticker can be placed on any spot; it arrives **hidden** (a preview step before it goes public), the spot takes the affiliation as its name, and the offer is marked accepted. Offers can be accepted, declined, annotated, or deleted (two clicks; a placed copy stays).
- **STU-9** Every sponsorship change refreshes `/laptop` on its next visit (`revalidatePath`), and `GET /api/laptop/spots` exposes the same public view as JSON.
- **STU-10** **Sticker editor:** an offer's file (or a spot's image) opens in an editor to check it at any zoom, with the cut line, its print size and how sharply it will print. Layers (sticker colour, an edge ring, the artwork's size and position, white-background removal) and shape (rounded, circle, follow the logo) can be changed. It downloads as a 300 DPI PNG for Cricut Design Space's Print Then Cut, prints at real size, previews on the laptop, and saves as the spot's sticker (drawn as designed on `/laptop`). A Cricut can't be driven directly from the site: Cricut has no public API.
- **STU-11** Any offer's sticker, or the editor's result, can be previewed on Studio's laptop without saving, with a banner to end the preview (or go back to the editor).

### 5.5 Logistics (LOG) 🔒
- **LOG-1** The gate is the same as STU-1. Stats are computed server-side from up to 50,000 of the most recent `page_views` rows.
- **LOG-2 Metric definitions** (keep these stable or document any change):
  - *Unique visitor* means a distinct `session_id`. That id is a per-tab-session UUID in `sessionStorage._pv_sid`, so this really counts **sessions**, not people.
  - *New visitor* means the first-ever visit from a browser (`localStorage._pv_seen`). New vs returning is counted **per session**.
  - *Bounce rate* is the percentage of sessions with exactly one view.
  - *Device* is decided by `screen.width`: under 768 is mobile, under 1024 is tablet, anything else (including null) is desktop.
  - *Daily views* cover the last 30 days in UTC, zero-filled. *Peak hours* use UTC.
  - *Average load time* is the mean of positive `load_time` values, which are recorded only on hard loads (`navigation` timing).
- **LOG-4** Since 2026-10-20 **every metric covers only visitors who accepted analytics.** Totals will drop compared with the pre-consent era. The Consent card shows how many visitors accepted, declined, or erased their data (latest choice per visitor), and Recent Activity shows IP, browser·OS, language, and timezone for consenting visitors.
- **LOG-3** The owner can exclude themselves per device (`localStorage._pv_exclude = "1"`, toggled from the dashboard) or per IP (the `ANALYTICS_EXCLUDED_IPS` env var, comma-separated, which needs a redeploy).

### 5.6 Onboarding, consent, and tour (ONB / CON / TOUR)
- **ONB-1** On a first visit to any page except `/studio`, `/logistics`, and `/privacy`, the intro modal opens automatically. A visitor whose current-version choice is already stored (cookie, or the localStorage mirror within 180 days) never sees it again, and is never offered the tour again.
- **ONB-2** The intro steps are Welcome → Privacy → Guide → Tour offer. "Skip intro" jumps to Privacy, then closes after the choice. The modal **cannot be dismissed until a privacy choice is made**; after that, ✕, Esc, and a backdrop click close it.
- **ONB-3** The guide previews are built from real components and data (the real `Navbar`, `lib/projects`, `lib/theme`), never screenshots, so they can't go stale.
- **CON-1** Analytics are **off by default**. "Necessary only" and "Accept all" have equal prominence; "Save my choices" honors the switch.
- **CON-2** Without a current analytics opt-in, nothing is written to `page_views`. This is enforced in `/api/analytics/track`, not just in the browser. Declining stores only a receipt (random id, choice, version, time) in `consent_events`.
- **CON-3** Everything analytics collects is disclosed in the modal and on `/privacy`. Both render `ANALYTICS_DATA_POINTS`, so they can't diverge.
- **CON-4** Withdrawing must be as easy as giving: the Cookie settings link appears on every public page, and "Delete my data" erases this browser's rows.
- **CON-5** Changing what is collected means bumping `CONSENT_VERSION`, which re-asks everyone (only the privacy step).
- **TOUR-1** The tour visits every main page in nav order. On each page's last step, the navbar highlights the next tab (with a "Next" badge, or a ring on ☰ on mobile), and either the tab or the bar's "Go to …" button advances it.
- **TOUR-2** Navigating elsewhere mid-tour is handled: another tour page jumps to that page's first step, and a non-tour page shows "You've stepped off the tour" with a way back. Tour progress survives a reload (sessionStorage) and ends with Esc, ✕, or Finish.
- **TOUR-3** Spotlights never block clicks, and every target is a `data-tour` anchor that a test verifies exists.

### 5.6b 3D laptop stickers (LAP)
- **LAP-1** `/laptop` shows a Three.js model of a **13-inch 2019 MacBook Pro**, loaded from `public/models/macbook-pro-13-2019.glb`. The lid's outside is the distinct part `Lid_Outer`, carrying four sticker planes, `Sticker_Slot_1–4`; the lid hangs from the hinge empty `Lid`, which also carries the `Screen`; the base carries the `Keyboard` plane and two palm-rest sticker planes, `Palm_Slot_Left/Right` (contract: LAPTOP_MODEL.md).
- **LAP-2** Selecting a spot, by clicking the sticker in 3D, in the 2D drawing, or in the spot list (mouse or keyboard), shows its sponsor details. They stay in sync, and the camera moves to the chosen sticker. The selected sticker, its spot tile and the details card light up in the sponsor's colour (a short glow, motion permitting); pointing at a sticker or a tile lights the other faintly.
- **LAP-3** Sponsors come from Studio (STU-6): only shown spots appear, and a hidden or cleared spot reads as open. Until `sponsorships-schema.sql` has run, the built-in sample sponsors appear, labelled as samples (the disclaimer disappears once no samples are shown). Uploaded sticker images are drawn on the stickers. "Sponsor a spot" opens an offer form (SPN-1 to SPN-6). Nothing is sold or paid for on the site, and the page says so.
- **LAP-4** States: loading skeleton; a built-in 3D model, drawn in code to the same contract, while the GLB is missing; a 2D fallback when the model is invalid, WebGL is unavailable, or loading fails (with Try again for failures). The spot picker works in every state.
- **LAP-5** Keyboard: the spot list is a WAI-ARIA radio group, and the lid has a labelled slider ("Lid angle"). Reduced motion: the camera jumps instead of gliding, and nothing pulses. Responsive at 360/768/1280+.
- **LAP-6** Three.js loads only on `/laptop` (client-only dynamic import); the model stays under 1 MB with no Draco, meshopt or KTX2 (CSP).
- **LAP-7** The lid moves like a real one. Dragging it, by mouse or touch, turns it continuously around the model's hinge, between 0° and 108°. Up opens and down closes; from behind, once the lid leans toward the viewer, it's the other way round, so the grabbed edge follows the hand. Reversing the drag reverses the lid at once. Light damping settles it where it was let go. It never opens or closes by itself, and it starts slightly open (12°). A drag on the lid never orbits the camera; a drag beside it does. The Lid slider does the same from the keyboard, and "Open the laptop" carries the lid fully open in about a second while the camera swings round to the classic front view. As the lid lifts past 30°, the screen lights (a JAVA.dev boot screen on the first open, then a desktop in the site palette), then the keyboard backlight and Touch Bar fade up. Below 18° it sleeps (the button sleeps the display first). Reduced motion: no settling, and the button's moves jump. Without WebGL, a 2D drawing of the open laptop takes its place.
- **LAP-9** A visitor can preview their own logo (PNG or JPG) on any spot of the laptop. It stays in their browser, is labelled as a preview, and can be sent straight to the offer form with that spot and file filled in.
- **LAP-8** Two palm-rest spots, left and right of the trackpad, in a second picker section ("Inside the laptop"). Choosing one opens the laptop and focuses it; they're clickable in 3D only while open (the closed lid hides them). The offer form lists all six spots by full name ("Palm rest, left of trackpad"), and both emails name the spot.

### 5.6c Sponsorship offers (SPN)
- **SPN-1** "Sponsor a spot" opens a dialog with **email**, **affiliation**, **preferred spot** (pre-set to the selected one, or "Any"), **offer in USD** (negotiable), and the **sticker file to print** (PNG or JPG, up to 4 MB, 64–8,000 px on a side; WebP and PDF were dropped on 2026-11-03 so every sticker can be drawn on the laptop). Everything is required.
- **SPN-2** Sending triggers **two separate emails** in the site's look:
  - (a) To `SUMMARY_RECIPIENT_EMAIL`: "someone is inquiring about a sponsorship", with all details, the sticker attached, and **Reply-To set to the sponsor** so replying continues the negotiation.
  - (b) To the sponsor: thanks, "I'll get back to you as soon as possible", and the offer's details. It leaves out the affiliation, free text a stranger could fill with a scam, because anyone can type any address (SECURITY.md S-45).
- **SPN-3** The offer is saved for Studio: a `sponsor_offers` row, and the file in the private bucket `sponsor-stickers` (`offers/<id>/`). The form still works if either is missing; the owner's email then says it's the only copy. The owner's email links to Studio → Sponsorships.
- **SPN-4** The dialog shows a receipt of what was sent, and says honestly whether the email copy went out.
- **SPN-5** Abuse limits: same-origin, honeypot, 3 offers per hour per client, 2 thank-you emails per day per inbox (`name+tag@` and Gmail's dotted spellings count as one), 20 offers per day overall. No web addresses in text, in any script. Files are checked by their bytes (SECURITY.md §4.9).
- **SPN-6** Accessible dialog: focus moves in and is trapped, Esc closes (not while sending), focus returns to the trigger, and errors are tied to their fields. `/privacy` explains what the form collects and keeps.

### 5.7 Automation endpoints (AUTO)
- **AUTO-1** `POST /api/docs/upload` takes the header `x-api-key: $DOCS_UPLOAD_SECRET` and the JSON body `{ project: slug, filename: "X.md", content, title?, source? }`. It upserts on `(project_slug, filename)`, stores the SHA-256 `content_hash`, and returns `201 { success, document }`.
- **AUTO-2** `POST /api/email-summary` takes the header `x-api-key: $EMAIL_SUMMARY_SECRET` and the JSON body `{ subject?, text?, html? }`, where at least one of `text` or `html` is required. It always sends to `SUMMARY_RECIPIENT_EMAIL`; any `to` in the body is ignored. Sends are capped at 10 per hour.

## 6. Non-functional requirements

| Area | Requirement | Current |
|---|---|---|
| Security | Everything in SECURITY.md §4 (controls) holds for every new route | ✅ for existing routes; open items in SECURITY.md §7 |
| Quality gates | `npm test`, `npx tsc --noEmit`, and `npm run lint` all clean before merge | ✅ All clean (315 tests). ⚠️ There is no CI, so nothing enforces this. |
| Performance (target) | Mobile Lighthouse Performance ≥ 90 and LCP < 2.5 s on Home and a blog post | Not measured yet |
| Accessibility (target) | WCAG 2.1 AA: labelled icon buttons, keyboard-operable menus and modals, visible focus, contrast ≥ 4.5:1 for body text | Partial; see DESIGN_SYSTEM.md §9 |
| SEO | Every public route has a title and description, an OG image, and a sitemap entry; admin routes are not indexed | ✅ Admin routes are `noindex` |
| Privacy | Analytics run only with explicit opt-in (server-enforced). For consenting visitors: page, referrer **origin**, user agent, IP address, language, timezone, screen width, load time, session and visitor ids. Policy at `/privacy`; self-service erasure. | ⚠️ A privacy notice now exists. **Still no retention policy** (SECURITY.md S-5); a job is ready but commented out in `security-hardening.sql`. |
| Browser support | The Next 16 baseline: Chrome, Edge, and Firefox 111+, Safari 16.4+ | Inherited |

## 7. Roadmap: next best actions

Work through these roughly top to bottom. Each item is sized for one focused session unless noted. After shipping an item, mark it ✅ with the date and add a line to the change log (§10).

### S: Security items (do first; mostly outside the repo)
| ID | Action | Acceptance |
|---|---|---|
| ~~S-1~~ ✅ | ~~Run `supabase/security-hardening.sql`~~. Done; verified live 2026-10-21 (anon gets `permission denied` on `page_views`). | |
| ~~S-38~~ ✅ | ~~Upgrade `next` + `eslint-config-next` to ≥16.4.1~~. Done: PR #5 (Next 16.4.2), merged and deployed 2026-11-03. | |
| **Deploy** | The `security-sweep` PR is merged (2026-10-29); still to do: run `supabase/auth-lockout-schema.sql` (S-4); set `ADMIN_2FA=email` in Netlify (S-6); rotate `LOGISTICS_PASSWORD` (S-12) | Sign-in asks for an emailed code; `auth_failures` fills with hashed keys after a wrong password; `/.well-known/security.txt` loads |
| S-23 | Run the read-only `supabase/audit-exposure.sql`. Then decide per app whether to disable open Supabase sign-ups and set size/MIME limits on the public storage buckets | Every section matches its "Expect" comment, or the difference is intentional |
| S-37 | Decide whether the GitHub repo stays public (SECURITY.md lists open issues) | Repo private, or open items kept out of the public copy |
| **S-2** | Verify a sending domain in Resend (needs a domain you own, not `*.netlify.app`) and set `RESEND_FROM_EMAIL`. **This now blocks sponsors' thank-you emails** (SPN-2b). | A sponsorship offer from a non-owner address gets its copy (`confirmationSent: true`) |
| **Sponsorships** | Run `supabase/sponsorships-schema.sql` in the SQL editor (step by step: SPONSORSHIPS.md §2) | Its verify queries show the private bucket, RLS on both tables, six spots, and no unscoped storage policies; a test offer appears in Studio → Sponsorships and under Storage → `sponsor-stickers/offers/` (SPONSORSHIPS.md §3) |
| S-40 | Switch on the sponsorship form's spam check: create a Cloudflare Turnstile widget, add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Netlify, and redeploy (the code is done, 2026-11-03; steps in SECURITY.md §7) | The dialog shows the check; an offer sent without it gets a 400 |
| ~~S-3~~ ✅ | ~~Key rate limits on a client IP the platform sets~~. Done 2026-10-19: `x-nf-client-connection-ip` plus a global failure ceiling. **After deploy:** confirm `/logistics` shows your real IP even when you send a forged `X-Forwarded-For`. | |

### P0: Quick correctness fixes (under 1 hour in total)
| ID | Action | Acceptance |
|---|---|---|
| ~~P0-1~~ ✅ | ~~Fix the lint error at `ProjectWizardModal.tsx:420`~~. Done 2026-10-19. | |
| ~~P0-2~~ ✅ | ~~Register the fonts~~. Done 2026-11-03: Syne and DM Sans load through `next/font` (variable fonts, self-hosted), registered as `--font-syne` / `--font-dm`; the dead postcss block is gone. | |
| ~~P0-3~~ ✅ | ~~About: `font-white/65` → `text-white/65`~~. Done 2026-11-03. | |
| ~~P0-4~~ ✅ | ~~Add `rel="noopener noreferrer"` to every `target="_blank"` link~~. Done 2026-10-19. | |
| ~~P0-5~~ ✅ | ~~Give Instagram a real URL~~. Done 2026-11-03: it links to the @java.dev_ handle shown on the card (confirm it's the right account). | |

### P1: Product and engineering gaps
| ID | Action | Acceptance |
|---|---|---|
| **P1-1** | **Move `/work` onto Supabase.** Make `WorkComponent` use `getPublicProjects()` and `projectThemeMap`; take the status pill from `project.status` (it is currently hard-coded "Live" on the featured and side cards). Replace the `filters[]` concept by filtering on `tags` or `category`, or add a `filters text[]` column (in the schema, `LIMITS`, the route, the wizard, and tests). Write a one-off seed SQL from `lib/projects.ts`, then delete `lib/projects.ts`. Add loading and empty states like the blog's. | Editing a project in Studio changes `/work` without a deploy; `lib/projects.ts` is gone |
| P1-2 | Add CI with `.github/workflows/ci.yml` running `npm ci`, `npm run lint`, `npx tsc --noEmit`, and `npm test` on push and PR. A template is in TESTING.md §8. | A green check appears on GitHub |
| P1-3 | Add `app/not-found.tsx` and `app/error.tsx` in the site style (dark card, Navbar, "Back home"). (The `noindex` half for `/studio` and `/logistics` was done on 2026-10-19.) | An unknown URL shows the branded 404 |
| P1-4 | **Server-render the blog.** Make `app/blog/page.tsx` and `app/blog/[slug]/page.tsx` Server Components that fetch with the anon client, and move the interactive parts (quick-read modal, copy-link) into small client children. Reuse the cached `fetchPost` from the slug layout so the post isn't fetched twice. Read `01-app/01-getting-started/05-server-and-client-components.md`, `06-fetching-data.md`, and `08-caching.md` first. | View-source of a post contains its body text; no client fetch happens on first load |
| P1-5 | **Remove duplication.** (The password gate and admin auth check were unified on 2026-10-19.) Remaining: shared `Post` and `Project` types (export them from `lib/`), the single `slugify` from `lib/validation`, one `ANALYTICS_SKIP_PREFIXES` constant, and one theme map (`lib/theme.ts`). | Each concept is defined once; tests are still green |
| P1-6 | **Remove dead code:** `ComingSoon` and its barrel export, the default Next SVGs in `public/` (verify they're unused first), the PDF loader rules in `next.config.ts`, `pdf.d.ts`, and the stray `src/**/*` include in `tsconfig.json` | Build, test, and lint are all clean |
| P1-7 | Make the Home stats real: derive "Projects Built" from the project count and drop or justify the other hard-coded numbers. Review the hero copy with the owner. | The numbers match the data |
| P1-8 | Accessibility pass. (Done 2026-10-20: Navbar menu labels, `aria-expanded`, an inert closed drawer, and the intro modal's focus trap. `useFocusTrap` in `components/onboarding/` can be reused.) Remaining: focus trap and focus return in `Modal`, visible `focus-visible` rings on interactive cards, `aria-pressed` on the filter pills, and an `aria-label` on the Logistics tracking switch. | Keyboard-only navigation works across all pages; axe shows no critical issues |
| ~~P1-9~~ ✅ | ~~Surface failures from the Studio card quick actions~~. Done 2026-11-03: `useCardAction()` in `app/studio/shared.tsx` shows the reason on the card and disables the toggle while it runs. | |

### P2: Ops and security (some need external accounts)
| ID | Action |
|---|---|
| ~~P2-1~~ ✅ | ~~Shared rate-limit store so lockouts hold across serverless instances~~. Done 2026-10-21 without a new account: auth lockouts use Postgres (`auth-lockout-schema.sql`, `lib/auth-lockout.ts`). Request limiters stay per instance; revisit with Upstash only if floods get past them. |
| P2-2 | Analytics retention: a Supabase scheduled job deleting `page_views` rows older than an agreed window (90 days to 12 months), plus a short privacy note in the site footer or on Contact |
| ~~P2-3~~ ✅ | ~~Second factor for admin sign-in~~. Done 2026-10-21: an emailed 6-digit code through Resend, a step in `POST /api/auth` before the session cookie (`lib/two-factor.ts`). Off until `ADMIN_2FA=email` is set. |
| P2-4 | Nonce-based CSP through `proxy.ts` to drop `'unsafe-inline'` scripts (see the bundled CSP guide). Note that this forces dynamic rendering. (`script-src-attr 'none'` was added on 2026-10-19 as a partial mitigation.) |
| P2-5 | A `GET /api/health` route that checks Supabase connectivity, as groundwork for uptime monitoring |

### P3: Enhancement backlog (curated; pick by interest)
Already done, so **don't re-propose**: per-post OG images, BlogPosting JSON-LD, bulk publish and unpublish, code-block copy buttons, wiring `ProjectList` into Home.

- **Blog:** public view counts and a "most viewed" widget; a tag filter on `/blog`; related posts by shared tags; an RSS feed (`app/feed.xml/route.ts`); a reading-progress bar; draft preview links (token-gated, using the bundled `draft-mode.md` guide); scheduled publishing (a `publish_at` column); a "recently updated" badge
- **Studio:** sort and filter state in the URL query; soft delete with an undo window for bulk delete; a keyboard shortcut sheet; a manual "sync now" for docs
- **Logistics:** CSV export; outbound-click and resume-download events (needs an `event` column); timezone-aware peak hours; a sanitized public stats page as a portfolio flex
- **Site:** a `/uses` or `/now` page; a Cmd+K command palette; a light/dark toggle built on theme tokens; a "last deployed" or git SHA badge in the footer; Project JSON-LD on `/work` (`/.well-known/security.txt` shipped 2026-10-21)
- **Automation:** skip the daily email when `content_hash` is unchanged; Netlify deploy webhook to an email ping; an aggregator page across `project_documents`

## 8. Open questions for the owner

Ask before acting on any of these:

1. The hero copy "Building things people together": is it intentional, or should it be "Building things that bring people together"?
2. Contact form: keep it `mailto:`, or send it server-side through Resend? Server-side sending would need spam protection (a honeypot plus a rate limit) and a fixed recipient.
3. `/work` filters: reuse `tags`, reuse `category`, or add a dedicated `filters` column?
4. How long should analytics data be kept?
5. Custom domain: will `java.dev` (the metadata fallback) or another domain replace `javastudios.netlify.app`?
6. Should the self-assessed skill percentages and dot levels stay, or switch to a non-numeric display?
7. Should the About timeline get a 2026 entry?

## 9. Glossary
| Term | Meaning |
|---|---|
| **Studio** | `/studio`, the password-gated CMS (formerly `/blog-editor`, renamed 2026-08-05) |
| **Logistics** | `/logistics`, the password-gated analytics dashboard |
| **Theme** | A per-post or per-project accent: `purple`, `green`, or `pink` (see DESIGN_SYSTEM.md §2.3) |
| **Featured** | A project pinned first (Home ordering; the large card on `/work`) |
| **Bento grid** | The 12-column card layout used on every public page |
| **Service role / anon** | The two Supabase keys: the server-only full-access key, and the public RLS-limited key |
| **mkV / mkIV** | Portfolio iterations 5 (this repo) and 4 (the sibling folder, reference only) |

## 10. Change log
_Newest first. One line per shipped change that affects product behaviour._

- 2026-11-09 (branch `security-email-guards`): **Safer sponsorship emails** (SPN-2b, SPN-5; SECURITY.md S-45). The thank-you copy no longer repeats the affiliation, the 2-per-day cap counts `name+tag@` and Gmail's dotted spellings as one inbox, and the no-web-addresses rule also catches look-alike dots and non-Latin domains.

- 2026-11-05 (branch `sticker-studio`): **Sticker editor and logo previews** (STU-10, STU-11, LAP-9). Studio can check, adjust and print a sponsor's sticker (Cricut-ready 300 DPI PNG, or real-size print), try it on the laptop, and save it as the spot's sticker; visitors can try their own logo on the laptop and send it as an offer.

- 2026-11-05 (branch `laptop-lid-drag`): **A built-in 3D laptop** (LAP-4). While `public/models/macbook-pro-13-2019.glb` doesn't exist, the viewer builds a simpler laptop in code to the same contract, so `/laptop` and Studio get the draggable lid, rotation and stickers now instead of the 2D drawing. The 2D drawing stays for browsers without WebGL.
- 2026-11-04 (branch `laptop-lid-drag`): **Draggable laptop lid** (LAP-5, LAP-7). Visitors drag the lid itself, by mouse or touch, to open or close it, continuously and with light damping. A Lid slider does the same from the keyboard. The lid starts slightly open and never moves by itself, a drag on the lid no longer orbits the camera, and the open/close button moves the lid through the same hinge spring.

- 2026-11-03 (branch `studio-sponsorships`): **Studio → Sponsorships** (STU-6 to STU-9, LAP-2, LAP-3, SPN-1, SPN-3).
  - **Studio:** a Sponsorships tab with a copy of the 3D laptop, show/hide per spot, a spot editor (text, colour, image, clear), and an offers inbox (place a sticker on a spot as a hidden draft, accept/decline, notes, download, delete).
  - **`/laptop`:** sponsors now come from the `sponsor_spots` table (samples until it exists), with uploaded sticker images; the page re-renders after each Studio change. Selected and pointed-at stickers light up together with their tile and the details card, in 3D and in the 2D drawings.
  - **Offers:** saved as a `sponsor_offers` row plus the file (no more `inquiry.json`); PNG/JPG only, with pixel limits (S-44). New setup file `supabase/sponsorships-schema.sql` replaces `sponsor-stickers-schema.sql`; guide in SPONSORSHIPS.md.
  - **Fixed:** the screen-reader label called every sponsor a "sample sponsor".

- 2026-11-03 (branch `security-patch`): **Security patch and bug fixes.**
  - **Security:** optional Cloudflare Turnstile check on the sponsorship form (S-40); `resend` 6.34.1 (S-39); no raw DB errors on `/blog` (S-41); stricter offer email (S-42); safe project rows on Home (S-43).
  - **Analytics:** Logistics totals and Studio view counts no longer stop at 1,000 rows; page views after the first no longer repeat the landing referrer and load time.
  - **UI:** Syne and DM Sans finally load (P0-2); Studio quick actions show failures (P1-9); `/work` cards show their real status and no dead `#` links; the contact form keeps what you typed and Instagram has a real link (P0-5); copy buttons only say "Copied!" when it worked; About's subtitle colour (P0-3); the site URL no longer falls back to `java.dev`.

- 2026-11-03 (branch `laptop-sponsorships`): **Inside the laptop** (LAP-7, LAP-8).
  - **Opening:** "Open the laptop" swings the lid open with the camera, boots the screen to a JAVA.dev desktop, and lights the backlit keyboard and Touch Bar (artwork drawn in Canvas 2D, `app/laptop/canvas-art.ts`; layout in `lib/laptop-keyboard.ts`).
  - **Two palm-rest spots** beside the trackpad, with the same offer form; spot names now say which surface ("Lid, upper left").
  - **Model contract** gains `Lid` (hinge), `Screen`, `Keyboard` and `Palm_Slot_Left/Right`, checked for their side of the hinge (LAPTOP_MODEL.md). Also fixed: the selection frame no longer gets clipped by the sticker's clear margin.

- 2026-10-30 (branch `laptop-sponsorships`): **"Sponsor a spot" offer form** (SPN-1 to SPN-6).
  - **Flow:** `POST /api/sponsorships` stores a private copy in the `sponsor-stickers` bucket (new `supabase/sponsor-stickers-schema.sql`) and sends two separate site-styled emails (owner notice with Reply-To and attachment; sponsor copy).
  - **Protection:** abuse caps and file sniffing.
  - **Accessibility:** the shared `Modal` gained a focus trap and focus return.
  - **Privacy:** `/privacy` explains offers.
  - **Tests:** 590 → 697.
- 2026-10-30 (branch `laptop-sponsorships`): `/laptop` 3D sponsor-sticker experience (LAP-1–6), linked from `/work`.
  - **Viewer:** plain Three.js (`three` 0.186.1, client-only via `next/dynamic`), with sticker artwork drawn on canvases from sample data, raycast picking, OrbitControls, render-on-demand, and a GLTFLoader texture path that works under the CSP.
  - **Page:** a spot-picker radio group, a details card, and "Sponsor a spot" → `/contact`; loading, missing, invalid, no-WebGL and error fallbacks; reduced motion.
  - **Model:** asset contract and Blender workflow in LAPTOP_MODEL.md. **The GLB itself isn't committed yet.**
  - **Tests:** 554 → 590. Verified in headless Edge against a QA stand-in model.

- 2026-10-21 (branch `security-sweep`):
  - **Admin sign-in:** optional emailed 2FA code (`ADMIN_2FA=email`), with a code step in the sign-in screen; one brute-force lockout shared by every admin-password route and, once its SQL runs, by every server instance; `__Host-` session cookies.
  - **Requests:** byte-capped request bodies (413) on every route; forged tracked paths rejected; blog slug lookups validated.
  - **Hardening:** IPv6 counted per /64; `server-only` guards; Supabase clients never adopt sessions; CSP `connect-src` narrowed to this project; more Permissions-Policy, `X-Permitted-Cross-Domain-Policies`, and CORP on the API.
  - **New files:** `/.well-known/security.txt`; `supabase/auth-lockout-schema.sql` and the read-only `supabase/audit-exposure.sql`.
  - **Tests:** 407 → 554.
  - Details are in SECURITY.md §7 and §8.

- 2026-10-20 (branch `cookie-set-up`): First-visit intro modal (welcome, privacy choice, live-component guide, tour offer); opt-in analytics enforced server-side, now recording IP, language, timezone, and visitor id for consenting visitors; `/api/consent` (receipts + self-service erasure); 10-step guided tour with navbar next-tab highlight, guide bar, and spotlight; site footer; `/privacy` page; Logistics Consent card plus IP and browser in recent activity; Navbar accessibility fixes; `supabase/consent-schema.sql`. Tests went from 315 to 406 (including a jsdom component suite); verified in headless Edge on desktop and mobile.
- 2026-10-19 (security pass 2, commit `233b7dd`): Next upgraded from 16.2.1 to 16.3.8 (critical advisories); gray-matter JS front-matter RCE closed; JSON-LD XSS closed; admin auth moved to an HttpOnly session cookie with CSRF checks and sign-out; IP spoofing past the lockout closed and a global ceiling added; UUID and object-body validation; analytics referrer reduced to origin; `noindex` on admin pages; header hardening; `rel` on external links; re-uploads no longer unpublish; Google Fonts link removed; `security-hardening.sql` written (S-1). Tests went from 218 to 315 and lint is clean. Details are in SECURITY.md §7 and §8.
- 2026-10-19: Docs split into AGENTS, PRD, ARCHITECTURE, DESIGN_SYSTEM, SECURITY, CODE_STYLE, TESTING, and README. Baseline at that point: 218 tests in 12 suites, tsc clean, 1 lint error.
- 2026-08-05 (`5589a7d`): Added Supabase `projects` with `/api/projects` CRUD and tests; `/blog-editor` became `/studio` with Blogs and Projects tabs; added the project wizard; Home's project grid reads Supabase with the `ProjectList` overflow modal.
- 2026-07-15 (`8ceab29`): Editor rewrite with search, filters, sort, bulk select, and per-post view counts; bulk delete (`{ids}`) API.
- 2026-07-09 (`f91517b`): Added `/api/docs/upload` and the `project_documents` table.
- 2026-07-06 (`cf525ac`): Security pass (see SECURITY.md §8) and the Jest suite.
- 2026-06-29 (`23ba027`): In-browser blog editor.
- 2026-06-22 (`181e34c`): `/api/email-summary`.
- Earlier: initial site, logistics, SEO, modal, styling passes.
