# Architecture

_How the system is put together: the runtime model, data flow, the API contract, the data model, configuration, deployment, and recipes for extending it. Last verified against the code: **2026-11-09** (branch `security-email-guards`)._

Related docs: [SECURITY.md](SECURITY.md) covers the controls in depth, [PRD.md](PRD.md) covers what each feature must do, and [CODE_STYLE.md](CODE_STYLE.md) covers how to write it.

---

## 1. System overview

```mermaid
flowchart LR
    subgraph Browser
        PUB["Public pages<br/>/, /work, /about, /blog, /blog/[slug], /contact"]
        ADM["Admin pages 🔒<br/>/studio, /logistics"]
        PT["PageTracker<br/>(root layout)"]
    end

    subgraph Netlify["Next.js 16 app on Netlify"]
        SRV["Server-only code<br/>layouts (metadata, JSON-LD),<br/>OG images, sitemap, robots"]
        API["Route handlers<br/>app/api/*"]
    end

    subgraph Supabase["Supabase Postgres"]
        POSTS[("posts")]
        PROJ[("projects")]
        PV[("page_views")]
        DOCS[("project_documents")]
        CE[("consent_events")]
    end

    RESEND["Resend<br/>email API"]
    AUTO["External automations<br/>daily-status task, upload scripts"]

    PUB -- "anon key · RLS: published only" --> POSTS
    PUB -- "anon key · RLS: published only" --> PROJ
    SRV -- "anon key" --> POSTS
    PT -- "POST /api/analytics/track (only with java_consent opt-in)" --> API
    PUB -- "POST/DELETE /api/consent (receipt, erasure)" --> API
    ADM -- "session cookie (POST /api/auth once)" --> API
    AUTO -- "x-api-key" --> API
    API -- "service-role key" --> POSTS
    API -- "service-role key" --> PROJ
    API -- "service-role key" --> PV
    API -- "service-role key" --> DOCS
    API -- "service-role key" --> CE
    API --> RESEND
```

**The core rule:** the browser only ever talks to Supabase with the **anon key**, and RLS limits that key to `published = true` rows of `posts` and `projects`. Every write, and every read of private data (drafts, analytics, docs), goes through an **authenticated route handler** that uses the **service-role key**. The service-role key never leaves the server.

## 2. Tech stack

| Layer | Choice | Version (installed) | Notes |
|---|---|---|---|
| Framework | Next.js App Router | 16.4.2 | Turbopack by default. Read `node_modules/next/dist/docs/` before using any Next API. |
| UI | React | 19.2.4 | Most pages are client components (see §4) |
| Language | TypeScript | 5.9 | `strict: true`; path alias `@/*` points at the repo root |
| Styling | Tailwind CSS (`@tailwindcss/postcss`) | 4.2 | No `tailwind.config.*`. The theme lives in `app/globals.css` (`@theme inline`). See DESIGN_SYSTEM.md. |
| Database | Supabase Postgres (`@supabase/supabase-js`) | ^2.104 | Two clients: anon and service role |
| Markdown | `react-markdown` 10, `remark-gfm` 4, `rehype-raw` 7, `rehype-sanitize` 6, `rehype-highlight` 7 (highlight.js 11) | | Used only in `components/ui/MarkdownRenderer.tsx` |
| Frontmatter | `gray-matter` | ^4 | Used only by `/api/blog/upload` |
| Email | `resend` | 6.34.1 (exact pin) | `/api/email-summary`, `/api/sponsorships`, 2FA codes (`lib/two-factor.ts`) |
| 3D | `three` (WebGLRenderer, GLTFLoader, OrbitControls, RoomEnvironment) | 0.186.1 (exact pin; `@types/three` 0.186.0) | Used only by `app/laptop/LaptopViewer.tsx`, which loads through `next/dynamic` with `ssr: false`, so it ships only on `/laptop` (~635 KB uncompressed). Three.js breaks APIs between minor versions, so upgrade deliberately. |
| Icons | `react-icons` (`rx`, `fa6`, `md`, `io5`), plus inline SVG paths in `app/studio/shared.tsx` | ^5.6 | |
| Tests | Jest 30 with `babel-jest` (inline config) | | See TESTING.md |
| Lint | ESLint 9 flat config + `eslint-config-next` 16.4.2 | | `npm run lint` |
| Hosting | Netlify | | No `netlify.toml`; Netlify's Next.js runtime is auto-detected |
| Node | 20.9+ required by Next 16 | dev machine: 22.13 | |

## 3. Repository layout

```
.
├── app/
│   ├── layout.tsx                 Root layout: Geist fonts (next/font), escaped Person JSON-LD,
│   │                              Person JSON-LD, site-wide metadata, <PageTracker/>
│   ├── globals.css                Tailwind import, highlight.js theme, CSS vars, @theme inline
│   ├── page.tsx                   Home (Server Component shell → <Navbar/> + <HomeComponent/>)
│   ├── opengraph-image.tsx        Site OG image (ImageResponse, 1200×630)
│   ├── robots.ts, sitemap.ts      SEO (sitemap includes published posts)
│   ├── privacy/ page.tsx (server): privacy & cookie policy, generated from lib/consent constants
│   ├── laptop/  page.tsx (server, ISR 5 min: reads sponsor_spots) → LaptopExperience.tsx (client: spot pickers,
│   │               details, offer form) → LaptopStage.tsx (shared with Studio: toolbar, status, 2D fallback
│   │               drawings, spotTileStyle) → LaptopViewer.tsx (Three.js; next/dynamic, ssr: false: hinge,
│   │               draggable lid + power-on, camera, sticker highlight; built-in-model.ts while the GLB is missing)
│   │               + canvas-art.ts (stickers incl. uploaded
│   │               images, screen, keyboard drawn in Canvas 2D); SponsorForm.tsx ("Sponsor a spot" dialog);
│   │               stickers/[spot]/route.ts (public: a visible spot's image, from the private bucket)
│   ├── about/   page.tsx (client) + layout.tsx (metadata only)
│   ├── work/    page.tsx (client) + layout.tsx (metadata only)
│   ├── contact/ page.tsx (client) + layout.tsx (metadata only)
│   ├── blog/    page.tsx (client) + layout.tsx (metadata only)
│   │   └── [slug]/ page.tsx (client), layout.tsx (server: generateMetadata + BlogPosting JSON-LD),
│   │               opengraph-image.tsx (per-post OG)
│   ├── studio/  🔒 page.tsx (gate + tabs), BlogsPanel.tsx, ProjectsPanel.tsx, ProjectWizardModal.tsx,
│   │               SponsorshipsPanel.tsx (laptop preview, spots, offers inbox),
│   │               shared.tsx (Icon + ICON_PATHS, formatDate), layout.tsx (noindex)
│   ├── logistics/ 🔒 page.tsx (AdminGate + Dashboard), layout.tsx (noindex)
│   └── api/
│       ├── analytics/track/route.ts   POST (public)
│       ├── auth/route.ts              GET (session?) / POST (sign in → cookie) / DELETE (sign out)
│       ├── consent/route.ts           POST (consent receipt) / DELETE (erase this browser's analytics); same-origin only
│       ├── analytics/stats/route.ts   GET  (admin); also exports StatsPayload type
│       ├── blog/posts/route.ts        GET/POST/PATCH/DELETE (admin)
│       ├── blog/upload/route.ts       POST (x-api-key = BLOG_UPLOAD_SECRET)
│       ├── projects/route.ts          GET/POST/PATCH/DELETE (admin)
│       ├── docs/upload/route.ts       POST (x-api-key = DOCS_UPLOAD_SECRET)
│       ├── email-summary/route.ts     POST (x-api-key = EMAIL_SUMMARY_SECRET)
│       ├── sponsorships/route.ts      POST (public multipart: offer → sponsor_offers + private bucket + 2 emails);
│       │                              GET/PATCH/DELETE (admin: the offers inbox)
│       ├── sponsorships/spots/route.ts GET/PATCH/POST (admin: what each /laptop spot shows; revalidates /laptop)
│       ├── sponsorships/file/route.ts GET (admin: streams a stored sticker)
│       └── laptop/spots/route.ts      GET (public JSON: the spots as /laptop shows them; ISR 1 min)
├── components/
│   ├── index.tsx                  Barrel: Navbar, HomeComponent, WorkComponent, ComingSoon, ProjectList, MarkdownRenderer, Modal
│   ├── ui/                        Navbar, Home, WorkComponent, ProjectList, MarkdownRenderer, PageTracker, ComingSoon (dead)
│   ├── features/                  Modal.tsx (portal modal), AdminGate.tsx (session check, password form, SignOutButton)
│   └── onboarding/                OnboardingProvider (consent + modal + tour state, in the root layout), IntroModal,
│                                  SitePreviews (live mini components), TourToolbar (rendered by Navbar), TourSpotlight,
│                                  SiteFooter, Toast, PrivacyActions, useFocusTrap
├── lib/
│   ├── supabase.ts                Anon client (browser-safe)
│   ├── supabase-admin.ts          Service-role client (SERVER ONLY)
│   ├── blog.ts                    Post types, themeMap, getPosts/getPostContent/getPostBySlug, formatDate
│   ├── projects-data.ts           PublicProject type, projectThemeMap, getPublicProjects
│   ├── projects.ts                LEGACY hard-coded project list, used only by WorkComponent (/work)
│   ├── security.ts                safeEqual (timing-safe), getClientIp (validated), ipBucket (IPv6 /64), isSameOriginRequest (CSRF)
│   ├── session.ts                 Signed, expiring admin session tokens + cookie options (__Host- in production)
│   ├── two-factor.ts              Optional emailed sign-in code (ADMIN_2FA=email): stateless challenge + Resend send
│   ├── admin-auth.ts              checkAdminAuth: session cookie (+CSRF) or x-logistics-key, with the shared lockout
│   ├── auth-lockout.ts            Brute-force lockout: in-memory layer + Postgres layer shared by all instances
│   ├── http.ts                    readJsonBody / readBodyText: byte-capped body readers (413), BODY_LIMITS
│   ├── json-ld.ts                 serializeJsonLd: XSS-safe JSON for <script type=ld+json>
│   ├── consent.ts                 java_consent cookie model (parse/serialize, version, allowsAnalytics, data-point list)
│   ├── tour.ts                    Tour steps + navigation rules (resolveTourIndex, upcomingPageChange)
│   ├── analytics.ts               Shared skip-prefixes + language/timezone validators (tracker and route)
│   ├── theme.ts                   Accent theme map (pure data; re-exported by lib/blog)
│   ├── user-agent.ts              Coarse browser/OS summary for the dashboard
│   ├── random-id.ts               UUID v4 that also works on plain-http origins
│   ├── supabase-errors.ts         isMissingColumn / isMissingTable / isMissingFunction for graceful schema drift
│   ├── rate-limit.ts              In-memory fixed-window limiter (10k-key cap) + per-IP and global auth lockout
│   ├── validation.ts              LIMITS, type-guard validators, normalizers, slugify, estimateReadingTime
│   ├── markdown-sanitize.ts       rehype-sanitize allowlist schema
│   ├── laptop-stickers.ts         /laptop: slot layout + sample sponsors, spotAccent, GLB contract, radio-key helper (no three import)
│   ├── laptop-keyboard.ts         /laptop: the 2019 13-inch keyboard layout, drawn by the 3D viewer and the 2D fallback
│   ├── sponsorship.ts             Offer field rules shared by the form and the route (email, offer, spot, file sniffing, pixel size)
│   ├── sponsor-spots.ts           sponsor_spots row type → slots (hidden = open), stored-path pattern, Studio input rules (client-safe)
│   ├── sponsor-spots-server.ts    Server-only: table/bucket names, readSpotRecords, getPublicSlots (samples until the table exists)
│   ├── sponsor-email.ts           Server-only HTML + text templates for the two sponsorship emails
│   ├── turnstile.ts               Server-only Cloudflare Turnstile verification for the offer form (S-40)
│   ├── site.ts                    siteUrl(), CONTACT_EMAIL, mailtoLink(): one definition of the site's address
│   └── fetch-all-rows.ts          Pages a Supabase query past the 1,000-row-per-request cap
├── supabase/                      SQL to run in the Supabase SQL editor (no migration tool)
├── __tests__/                     Jest suites + helpers/test-utils.ts
├── public/                        resume.pdf + default Next SVGs (unused); models/macbook-pro-13-2019.glb expected (LAPTOP_MODEL.md)
├── next.config.ts                 Security headers/CSP, vestigial PDF loader rules, allowedDevOrigins
├── jest.config.js, eslint.config.mjs, postcss.config.mjs, tsconfig.json, pdf.d.ts
└── *.md                           AGENTS, PRD, ARCHITECTURE, DESIGN_SYSTEM, SECURITY, CODE_STYLE, TESTING, README,
                                   PROJECT_OVERVIEW (automation-maintained log), CLAUDE (→ AGENTS)
```

## 4. Rendering and data-fetching model

The app currently follows a **"client pages + server metadata"** pattern. Each page is a client component that fetches its own data in `useEffect`. The server side contributes only metadata, JSON-LD, OG images, and the sitemap.

| Route | Page rendering | Data source | Key used | Notes |
|---|---|---|---|---|
| `/` | Server shell, client `HomeComponent` | `getPublicProjects()` in `useEffect` | anon | Skills and stats are hard-coded |
| `/work` | Client | `lib/projects.ts` (static import) | none | **Not Supabase.** See PRD P1-1. |
| `/about`, `/contact` | Client | Static arrays in the file | none | |
| `/blog` | Client | `getPosts()`, then `getPostContent(id)` when the modal opens | anon | |
| `/blog/[slug]` | Client page; **server** layout | Layout: cached `getPostBySlug` for metadata and JSON-LD. Page: `getPostBySlug` again on the client. | anon | The post is fetched twice. See PRD P1-4. |
| `/blog/[slug]/opengraph-image` | Server | `getPostBySlug` | anon | `await params` (Next 16) |
| `/sitemap.xml` | Server | `getPosts()` | anon | **Static** (`○` in the 2026-10-19 build), so new posts appear only after a redeploy. |
| `/privacy` | **Server** (static) with a client `PrivacyActions` child | `lib/consent` constants | none | The intro modal never auto-opens here, so the policy stays readable |
| `/laptop` | **Server** shell, **ISR** (`revalidate = 300`, plus `revalidatePath` on every Studio save), with a client `LaptopExperience` child; the Three.js viewer is client-only (`next/dynamic`, `ssr: false`) | `getPublicSlots()`: `sponsor_spots` (visible spots only), falling back to the samples in `lib/laptop-stickers.ts` until the table exists; sticker images from `/laptop/stickers/<spot>`; the GLB from `/models/macbook-pro-13-2019.glb` | service role (server-side) | **The GLB, or a built-in stand-in:** on a 404, the viewer builds `app/laptop/built-in-model.ts`, a simpler model to the same contract, so the 3D view works before the asset exists. The 2D drawings are for no WebGL, an invalid model, or a failed load. Render on demand (no animation loop; frames run only while the camera, the lid spring, or the power fades move). Statuses: loading, ready, invalid, unsupported, error. **The lid is moved by hand:** a drag (or the Lid slider) turns the `Lid` node anywhere from 0° to 108° (the math is in `lib/laptop-lid.ts`), and the viewer reports `onOpenChange` as the lid passes 30° going up or 18° going down. The page's **open** state follows that report. A change the page starts itself (the button, a palm-rest spot) swings the lid fully open or closed. The screen boots and the keyboard lights as the lid lifts past 30°. "Sponsor a spot" opens an offer form (`SponsorForm.tsx`, in the shared `Modal`) that posts to `/api/sponsorships` (§6.9). **Highlight sync:** the selected spot lights up in its sponsor's colour on the sticker (halo + emissive glow), its tile and the details card; hovering any of them lights the others faintly (`hoveredId` is page state, reported back by the viewer). No payments. |
| All pages | `OnboardingProvider` (client) wraps everything in the root layout | `document.cookie` / storage after hydration | none | The modal, tour bar, and footer render client-side only, so static pages stay static (`○`) |
| `/studio`, `/logistics` | Client, wrapped in `<AdminGate>` | `fetch('/api/...')`; the browser attaches the HttpOnly session cookie | service role (server-side) | Renders nothing until `GET /api/auth` answers, then shows the password form or the page |

There are no Server Actions, `use cache`, or `proxy.ts`. The only route-segment config is `revalidate` on `/laptop` (300 s) and `/api/laptop/spots` (60 s), and the only `revalidatePath` calls are in `/api/sponsorships/spots`. Every API route is a plain route handler.

## 5. Data-access layer

| Module | Runs where | Purpose | Rules |
|---|---|---|---|
| `lib/supabase.ts` | Anywhere | `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)` with every auth feature off (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`), so a crafted `#access_token=` link can't plant a session | Logs a warning when env vars are missing, **but `createClient` throws on an empty URL at import time** |
| `lib/supabase-admin.ts` | **Server only** (`import "server-only"`) | Service-role client, auth features off | Never import from `"use client"` files (the build and `server-boundary.test.ts` both fail). Bypasses RLS. Also throws at import without env vars, so `lib/auth-lockout.ts` imports it lazily. |
| `lib/blog.ts` | Anywhere | `Post`, `PostWithContent`, `PostTheme`, `themeMap`; `getPosts()` (published, without content, newest first), `getPostContent(id)` (published only), `getPostBySlug(slug)` (published only; returns `null` for an invalid slug **without querying**, or on error), `formatDate` | Public reads always add `.eq("published", true)` on top of RLS, and select explicit columns (`POST_COLUMNS`), never `*` |
| `lib/projects-data.ts` | Anywhere | `PublicProject`, `projectThemeMap`, `getPublicProjects()` (published; featured first, then newest) | Same rule |
| `lib/projects.ts` | Anywhere | Legacy static `projects[]` with Tailwind classes baked in | Scheduled for deletion |
| `lib/validation.ts` | Server (pure) | `LIMITS`, `isValidSlug`, `isNonEmptyString`, `isStringMax`, `normalizeTags`, `normalizeTheme`, `normalizeProjectStatus`, `isValidUrlOrEmpty`, `estimateReadingTime`, `slugify` | Pure functions, fully unit-tested |
| `lib/security.ts` | Server only | `safeEqual` (SHA-256 both sides, then `timingSafeEqual`), `getClientIp` (`x-nf-client-connection-ip`, then first XFF entry, then `x-real-ip`, each kept only if it parses as an IP; else `"unknown"`), `ipBucket` (IPv6 → its /64, IPv4-mapped → IPv4), `isSameOriginRequest` (Sec-Fetch-Site, then Origin vs Host) | |
| `lib/session.ts` | Server only | `createSessionToken`, `verifySessionToken`, `sessionCookieOptions`, `SESSION_COOKIE` (`__Host-admin_session` in production, `admin_session` otherwise), `SESSION_TTL_SECONDS` (8 h), `getSessionKey` | The HMAC key derives from `SESSION_SECRET` (or the service-role key) plus `LOGISTICS_PASSWORD`; fails closed |
| `lib/two-factor.ts` | Server only | `isTwoFactorEnabled` (`ADMIN_2FA=email`), `isTwoFactorConfigured`, `createChallenge` / `verifyChallenge` (stateless HMAC over expiry + nonce + code, `admin-2fa-v1` prefix), `normalizeCode`, `sendCode` (Resend), `TWO_FACTOR_COOKIE` | Codes go only to `ADMIN_2FA_EMAIL` / `SUMMARY_RECIPIENT_EMAIL`; 10-minute challenges |
| `lib/admin-auth.ts` | Server only | `await checkAdminAuth(req)` returns a response to send, or null if allowed | The only auth check admin routes should use. Shares the `admin-password` lockout scope with `/api/auth`; refuses `x-logistics-key` while 2FA is on. |
| `lib/auth-lockout.ts` | Server only | `ADMIN_PASSWORD_SCOPE`, `await isAuthBlocked(scope, ip)`, `await recordAuthFailure(scope, ip)` | In-memory layer (`lib/rate-limit.ts`) plus Postgres RPCs from `auth-lockout-schema.sql`. Keys hold a hash, not the IP. Store errors fall back to memory. `AUTH_LOCKOUT_STORE=memory` skips the store (tests). |
| `lib/http.ts` | Server only | `readJsonBody(req, max)` → `{ok, body}` or `{ok:false, status: 400/413}`, `readBodyText(req, max)` (throws `BodyTooLargeError`), `BODY_LIMITS` | The only way routes read bodies; enforces the byte cap while streaming |
| `lib/json-ld.ts` | Anywhere | `serializeJsonLd(data)` | Escapes `<`, `>`, `&`, and U+2028/2029 |
| `lib/consent.ts` | Anywhere | `CONSENT_COOKIE`, `CONSENT_VERSION`, `parseConsent` (strict), `serializeConsent`, `allowsAnalytics`, `consentCookieString`, `readConsentFromCookieHeader`, `ANALYTICS_DATA_POINTS` | Cookie value `{"v","a":0/1,"t","id"}`, URI-encoded, 180 days, SameSite=Lax, readable by JS (it holds no secret) |
| `lib/tour.ts` | Anywhere | `TOUR_STEPS`, `NAV_ITEMS`, `resolveTourIndex`, `upcomingPageChange`, `firstStepForPath`, `tourPages` | Pure, unit-tested; targets map to `data-tour` attributes |
| `lib/analytics.ts` | Anywhere | `ANALYTICS_SKIP_PREFIXES`, `isTrackablePath`, `isValidPagePath` (URL path characters only), `normalizeLanguage`, `normalizeTimezone` | Replaces the old duplicated skip lists |
| `lib/supabase-errors.ts` | Server | `isMissingColumn` (42703/PGRST204), `isMissingTable` (42P01/PGRST205), `isMissingFunction` (PGRST202/42883), `warnSchemaOnce` | Lets code deploy before a SQL file runs |
| `lib/rate-limit.ts` | Server only | `rateLimit(name, key, limit, windowMs)`, the in-memory layer of the auth lockout (`isAuthBlocked` / `recordAuthFailure`, sync; routes use `lib/auth-lockout.ts` instead), `AUTH_FAIL_LIMIT` / `AUTH_GLOBAL_FAIL_LIMIT` / `AUTH_FAIL_WINDOW_MS`, `resetRateLimits()` (tests) | Module-level `Map`, so state is per process. Keys go through `ipBucket`. Each limiter is capped at 10k keys (expired buckets go first, then the oldest 10%). Auth damping: 10 failures per 15 min per IP, plus 100 per scope globally. |
| `lib/markdown-sanitize.ts` | Anywhere | `markdownSanitizeSchema` | Type-only import, so it has no runtime dependencies |

## 6. API reference

All handlers live in `app/api/**/route.ts`. Errors are always `{"error": "<generic message>"}`. Every JSON body must be a plain object (`null`, arrays, and scalars return 400). Every response carries `Cache-Control: no-store` and `X-Robots-Tag: noindex` (from `next.config.ts`).

**Admin routes** (marked "admin" below) call `await checkAdminAuth(req)` (SECURITY.md §4.1). A valid session cookie is accepted; for writes it must also pass the same-origin check, or the route returns 403. Without a cookie, the route falls back to the `x-logistics-key` header, which is refused while `ADMIN_2FA=email`. **Machine routes** take `x-api-key`. Wrong credentials count toward **10 per IP and 100 globally per 15 minutes**, after which the route returns `429 {"error":"Too many attempts. Try again later."}`. Requests with no credential get 401 but aren't counted. All four admin-password routes share one counter (scope `admin-password`); each machine route has its own.

**Bodies** are read with `lib/http.ts` and capped in bytes: 2 KB for auth and consent, 8 KB for track, 1 MB for admin CRUD, 4 MB for uploads and email. Anything larger gets `413 {"error":"Request body too large"}` before any other work.

### 6.0 `/api/auth` (session)
| Method | Body | Result |
|---|---|---|
| GET | none | `200 {authenticated: boolean}` |
| POST | `{ password }` | `200 {authenticated:true}` plus `Set-Cookie: __Host-admin_session=…; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800; Secure`. In development the cookie is `admin_session` and isn't Secure. **With `ADMIN_2FA=email`** the response is instead `200 {authenticated:false, twoFactor:"email"}` plus a 10-minute `__Host-admin_2fa` challenge cookie, and a 6-digit code is emailed to the owner. Wrong password returns `401`, a lockout `429`, a cross-site request `403`, an oversized body `413`, and a missing signing secret `500`. With 2FA on, missing email config returns `500`, a provider error `502`, and more than 5 codes in 15 min `429`. |
| POST | `{ code }` (2FA step, with the challenge cookie) | `200 {authenticated:true}` plus the session cookie; the challenge cookie is cleared. A wrong or expired code returns `401` and counts toward the lockout; a malformed code returns `400`; a missing challenge cookie returns `401`. |
| DELETE | none | Clears the session and any pending challenge. A cross-site request returns `403`. |

### 6.1 `POST /api/analytics/track` (public)
- **Consent gate (first, after IP exclusion and the rate limit):** without a current `java_consent` cookie with analytics on, the route returns `200 {ok:true, tracked:false}` and writes nothing.
- **Body** (`Content-Type: application/json` required, ≤8 KB): `{ page, session_id, referrer?, is_new_visitor?, load_time?, screen_width?, language?, timezone? }`. `page` must be a plain path (`isValidPagePath`): no `//host`, query, fragment, whitespace, or markup.
- **Opt-in fields stored:** `ip_address` (the client IP, only if it parses as an IP), `language` and `timezone` (validated, else null), `visitor_id` (**from the consent cookie, never the body**), and `consent_version`. If those columns don't exist yet (code deployed before `consent-schema.sql`), the insert is retried with the original columns and a warning is logged once.
- Success returns `200 {ok:true, tracked:true}`.
- **Order of checks:**
  1. If the IP is in `ANALYTICS_EXCLUDED_IPS`, return `200 {ok:true}` without inserting.
  2. Rate limit of **30 per minute per IP**, otherwise `429` with a `Retry-After` header.
  3. Content type, otherwise `400`. JSON parse, otherwise `400`.
  4. `page` must be a string starting with `/` (≤300 chars) and `session_id` must be 1 to 100 chars, otherwise `400`.
  5. If `page` starts with `/logistics`, `/studio`, or `/api`, return `200 {ok:true}` without inserting.
  6. Insert, then return `200 {ok:true}`, or `500 {error:"DB error"}`.
- **Server-side normalization:** `referrer` is reduced to its **origin** (http/https only; anything else, or anything over 2,000 chars, becomes `""`); `user_agent` is read **from the request header** and cut to 500; `is_new_visitor` is stored only if it is strictly `true`; `load_time` must be 0 to 120,000 ms (rounded) or it becomes null; `screen_width` must be 1 to 10,000 (rounded) or it becomes null.

### 6.2 `GET /api/analytics/stats` (admin)
Since 2026-10-20, `recentActivity[]` items also carry `ip`, `browser`, `os`, `language`, and `timezone` (null for rows recorded before opt-in existed). `consent` is `{accepted, declined, erased}` (latest choice per visitor), or `null` before `consent_events` exists. Missing new columns fall back to the original select.

Returns `StatsPayload` (exported from the route file, and imported by `app/logistics/page.tsx` as a type):
`totalViews, last30Views, uniqueVisitors, last30Unique, avgLoadTime, topPages[8], topReferrers[6], newVsReturning, devices, recentActivity[15], dailyViews[30], peakHours[24], bounceRate, yourIp, excludedIps`.
It pages through up to **50,000** newest rows with `fetchAllRows()` (a single query stops at Supabase's 1,000-row cap) and aggregates in memory. `totalViews` comes from an exact count, and `truncated: true` means the breakdowns cover only the newest 50,000. The metric definitions are in PRD.md LOG-2. A DB error returns `500 {error:"DB error"}`.

### 6.3 `/api/blog/posts` (admin)
| Method | Body | Success | Notes |
|---|---|---|---|
| GET | none | `200 Post[]` with every column Studio needs, **including drafts and `content`**, plus a computed `view_count` | `view_count` counts `page_views` rows matching `page LIKE '/blog/%'`. If that query fails, the counts become 0; the route still succeeds. |
| POST | `{ title, slug, content?, excerpt?, tags?, cover_emoji?, theme?, published? }` | `201` created row | Defaults: `content ""`, `excerpt ""`, `tags []`, `cover_emoji 📝`, `theme purple`, `published false`. `reading_time` is computed. |
| PATCH | `{ id, …any whitelisted fields }` | `200` updated row | Whitelist: title, slug, content (which recomputes `reading_time`), excerpt, tags, cover_emoji, theme, published. `400` if no updatable field is present. |
| DELETE | `{ id }` or `{ ids: uuid[1..100] }` | `200 {success:true}` or `{success:true, deleted:n}` | |

A duplicate `slug` violates the unique constraint and returns a **generic** `500 Database error`, not a 409. That is a known UX gap.

### 6.4 `/api/projects` (admin)
PATCH and DELETE ids must be UUIDs, otherwise the route returns `400` (the same rule applies in 6.3).
Same shape as 6.3, for the `projects` table.
- POST defaults: `description ""`, `icon 🚀`, `category ""`, `status planned`, `theme purple`, `tags []`, `year ""`, `link ""`, `github ""`, `featured false`, **`published true`**.
- Whitelist: title, description, icon, category, status (normalized), theme (normalized), tags, year, link and github (empty or an `http(s)` URL), featured, published.
- There is no `view_count`.

### 6.5 `POST /api/blog/upload` (`x-api-key` = `BLOG_UPLOAD_SECRET`)
- **Body:** raw markdown with YAML frontmatter, up to 1,000,000 chars (`413` if larger). The contract is in PRD.md BLOG-5.
- Upserts on `slug` and returns `201 {success:true, post:{id, slug, title, published}}`.
- Re-uploading overwrites every field it sends. `published` is written **only when the front matter contains that key**, so a re-upload without it leaves the live state alone; new posts default to `false`. `created_at` is preserved. Content longer than 200,000 chars is **silently truncated**, whereas Studio rejects it.
- Front matter must be YAML (the default) or JSON. `---js` and `---javascript` blocks, which gray-matter would otherwise `eval`, are refused with `400` (SECURITY.md S-14).

### 6.6 `POST /api/docs/upload` (`x-api-key` = `DOCS_UPLOAD_SECRET`)
- **Body (JSON, ≤1 MB):** `{ project, filename, content, title?, source? }`
  - `project` must pass the slug regex.
  - `filename` must match `^[A-Za-z0-9][A-Za-z0-9._ -]{0,198}\.md$`, which rules out slashes and leading dots.
  - `title` and `source` are at most 300 chars each.
- Upserts on `(project_slug, filename)`, computes `content_hash` (SHA-256 hex), sets `updated_at`, and returns `201 {success:true, document:{id, project_slug, filename, content_hash, updated_at}}`.

### 6.7 `/api/consent` (public, browser-only)
Both methods require a same-origin request (otherwise `403`) and are rate-limited to 20/min per IP (`429`).
| Method | Body | Result |
|---|---|---|
| POST | `{ id: uuid, analytics: boolean, version: CONSENT_VERSION }` | Inserts `{visitor_id, analytics, policy_version, action:"set"}` into `consent_events` (no IP, no user agent) and returns `200 {ok:true, logged:true}`. If the table is missing it returns `{ok:true, logged:false}`. Validation errors return `400`. |
| DELETE | none (uses the visitor id from the caller's own `java_consent` cookie) | Deletes `page_views` rows with that `visitor_id`, logs `action:"erase"`, and returns `200 {ok:true, deleted:n}`. With no cookie it returns `400`. A missing column means `deleted:0`. |

### 6.8 `POST /api/email-summary` (`x-api-key` = `EMAIL_SUMMARY_SECRET`)
- After authentication there is a **global** cap of 10 sends per hour (`429` with `Retry-After`).
- **Body (JSON):** `{ subject? ≤500, text? ≤500k, html? ≤500k }`, with at least one of `text` or `html`.
- The email always goes to `SUMMARY_RECIPIENT_EMAIL` (`500` if that is unset). It is sent from `RESEND_FROM_EMAIL`, falling back to `Inbox Summary <onboarding@resend.dev>`. The subject falls back to `Inbox summary — <date>`.
- A provider error returns `502 {error:"Email provider error"}`. Success returns `200 {success:true, id}`.
- The Resend client is created per request. If `RESEND_API_KEY` or `SUMMARY_RECIPIENT_EMAIL` is missing, the route returns `500 {error:"Email is not configured"}`. The send cap counts only valid requests.

### 6.9 `POST /api/sponsorships` (public, browser-only): "Sponsor a spot" offers from `/laptop`
- **Request:** `multipart/form-data` with `email`, `affiliation`, `offer` (USD, e.g. `1,500`), `spot` (`slot-1`…`slot-4` on the lid, `palm-left`/`palm-right` on the palm rest, or `any`), `sticker` (a file), and the honeypot `website`, which must be empty. Rules are in `lib/sponsorship.ts` and shared with the form.
- **Order of checks:**
  1. Same-origin, else `403`.
  2. The request flood cap, else `429` with `Retry-After`.
  3. Multipart, else `415`.
  4. Body ≤4.25 MB, streamed, else `413`.
  5. A filled honeypot gets a quiet `200 {ok:true}`, and nothing is stored or sent.
  6. Field and file validation, with the file sniffed by its bytes. Failures return `400 {error, fields:{email?, affiliation?, offer?, spot?, sticker?}}`.
  7. With `TURNSTILE_SECRET_KEY` set: a valid Cloudflare Turnstile token in `cf-turnstile-response`, else `400 {error, captcha:true}`; `503` if Cloudflare can't be reached (fails closed).
  8. Email configured, else `500`.
  9. The offer, recipient and global caps, else `429`.
- **Side effects, in order:**
  1. Save it for Studio: upload `offers/<uuid>/sticker.<ext>` to the **private** bucket `sponsor-stickers`, then insert the `sponsor_offers` row (`file_path` null if the upload failed). Not fatal: a missing bucket or table logs one "run supabase/sponsorships-schema.sql" warning, and the owner email says the offer wasn't saved.
  2. **Email 1** goes to `SUMMARY_RECIPIENT_EMAIL`, with `replyTo` set to the sponsor and the sticker attached (subject `Sponsorship inquiry: <affiliation> ($offer)`). If it fails, the route returns `502` and stops.
  3. **Email 2**, sent separately, goes to the sponsor: a thank-you plus the offer's details (address, spot, amount, file type and size, reference), with `replyTo` set to `SPONSOR_REPLY_TO` or the public `/contact` address. It leaves out the affiliation and the file name, because anyone can type any address into the form (SECURITY.md S-45).
- **Response:** `200 {ok:true, reference:"3F2B6C1E", confirmationSent:boolean}`. `confirmationSent` is false when email 2 failed, which with Resend's sandbox sender is always (SECURITY.md S-2).
- **Templates:** `lib/sponsor-email.ts` builds table-based HTML in the site palette, with plain-text twins. All visitor input is escaped.

### 6.10 `/api/sponsorships` GET, PATCH, DELETE (admin): the offers inbox
- `GET` → `{ offers: AdminOffer[], setup }`, newest first (paged past 1,000 rows, up to 5,000). Each offer carries `fileUrl` (`/api/sponsorships/file?path=…`) when its stored path matches `STORED_FILE_RE`. `setup: false` (and no offers) until the table exists.
- `PATCH { id, status?, notes? }` → the updated offer. Only those two fields are written; `status` is `new`, `accepted` or `declined`; notes ≤2,000 characters.
- `DELETE { id }` → `{ success, deleted }`. Also removes the offer's `offers/` file. A copy already placed on a spot (`spots/…`) stays.

### 6.11 `/api/sponsorships/spots` (admin): what each spot on `/laptop` shows
- `GET` → `{ spots: AdminSpot[], setup }`: always all six, in layout order. A spot without a row returns its built-in sample (or open). `AdminSpot` = `{ id, sponsor: {name, mark, tagline, description, theme} | null, visible, sample, offerId, imageUrl, updatedAt }`, with `imageUrl` on the admin file route.
- `PATCH { id, visible?, sponsor?, offerId?, removeImage? }` → the updated spot. `sponsor: null` clears it (open). `sponsor: {…}` is validated by `validateSponsorInput` (name ≤60, mark ≤6, tagline ≤80, description ≤400, theme). `offerId` copies that offer's file to `spots/<spot>/<uuid>.<ext>`, names the spot after the offer's affiliation (unless `sponsor` is sent too), starts it **hidden** (unless `visible` is sent), and marks the offer accepted. Every refusal (400) happens before any copy or write; `409` until the table exists.
- `POST` multipart `{ id, sticker, finish? }` → the updated spot: a new image (PNG/JPEG, ≤4 MB, pixel limits) for a spot that already has a sponsor name. `finish` is `sticker` or `logo` (anything else is a 400, checked before any read). `finish=sticker` is the sticker editor's finished die-cut design: PNG only, stored as `spots/<spot>/<uuid>-cut.png`. That suffix is the only record of it (no column): `isDieCutPath()` turns it into `sponsor.finish = "sticker"` for `/laptop` and `dieCut: true` for Studio, and the viewer and the 2D drawings then draw the image as it is, without the spot's colour and white edge.
- Every write upserts the row, deletes the spot's previous `spots/` image (never an `offers/` file), and calls `revalidatePath` for `/laptop` and `/api/laptop/spots`.

### 6.11a Studio's sticker editor and previews (client only)
- `app/studio/StickerEditor.tsx` (a `size="xl"` `Modal`) draws an offer's or spot's file with `app/studio/sticker-canvas.ts`, using the maths in `lib/sticker-print.ts` (print sizes, layout, edge-connected white removal, an exact distance field for "follow the logo" shapes, the cut line, and a pHYs chunk so the PNG says 300 DPI). Its files come from the admin file route on the same origin, so the canvas stays readable.
- **Download** and **Print** happen in the browser (an object URL, and a print-only sheet: `body.printing-sticker` in `globals.css`). **Save** is `PATCH /api/sponsorships/spots { offerId }` (when it's an offer's sticker) and then `POST … finish=sticker`. Cricut has no public API, so printing on a Cricut goes through Design Space's upload (SPONSORSHIPS.md §4a).
- **Previews** are `withPreview(slots, preview)` (`lib/laptop-stickers.ts`): a `SpotPreview` laid over one spot, marked `preview: true`, in page state only. Studio previews an offer's file or the editor's output (a `blob:` URL it revokes); `/laptop` previews a visitor's own file (a `blob:` URL, never uploaded unless they send the offer form, which `SponsorForm`'s `initialFile` pre-fills). `img-src` already allows `blob:`.

### 6.12 Sticker files and the public spot list
- `GET /api/sponsorships/file?path=<stored path>` (admin): streams a file from the bucket for Studio's thumbnails and 3D preview (same origin, so no CORS or signed URLs). `&download=1` sends it as an attachment. `400` unless the path matches `STORED_FILE_RE`; `404` if it's missing.
- `GET /laptop/stickers/<spot>` (public): a **visible** spot's image, `Cache-Control: public, max-age=300, s-maxage=300`. Outside `/api` so it can be cached (`/api/*` is `no-store`). Hidden, open or image-less spots, and unknown ids, get `404`. The page links it as `?v=<updated_at>`, so a new image is fetched at once.
- `GET /api/laptop/spots` (public): `{ spots: [{ id, surface, position, sponsor }] }`, the same data `/laptop` renders (hidden sponsors as `null`). Served from the ISR cache (`revalidate = 60`), refreshed by Studio's saves.

## 7. Data model (Supabase)

There is no migration tool. Each table has a standalone SQL file in `supabase/`, to be pasted into the Supabase SQL editor. **Live DB state can drift from these files; when in doubt, check the Supabase dashboard.**

### `posts` (from `supabase/schema.sql`)
| Column | Type | Default / constraint |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| title | text | not null |
| slug | text | not null, **unique** |
| excerpt, content | text | `''` |
| tags | text[] | `'{}'` |
| cover_emoji | text | `'📝'` |
| theme | text | `'purple'`, check `in ('purple','green','pink')` |
| reading_time | int | `1` |
| published | boolean | **`false`** |
| created_at, updated_at | timestamptz | `now()`; trigger `posts_updated_at` maintains `updated_at` |

RLS is **enabled**, with the policy "Public read published posts" (`SELECT … USING (published = true)`). There are no write policies, and anon/authenticated write grants are revoked, so anon cannot write. `schema.sql` is idempotent (drop-if-exists on the trigger and policy) and pins the trigger function's `search_path`.

### `projects` (from `supabase/projects-schema.sql`, idempotent)
id, title, description, icon (`'🚀'`), category, status (`'planned'`, check `live|wip|planned`), theme (check), tags text[], year, link, github (all text, default `''`), featured (`false`), published (**`true`**), created_at, updated_at (trigger `projects_updated_at`).
RLS is **enabled**, with the policy "Public read published projects"; anon/authenticated keep SELECT only.

### `page_views` (from `supabase/analytics-schema.sql`)
id uuid, page (not null), referrer (`''`), user_agent (`''`), session_id (not null), is_new_visitor (`false`), load_time int (nullable, ms), screen_width int (nullable, px), created_at.
Indexes are on `created_at DESC`, `session_id`, and `page`. The file now **enables RLS with no policies and revokes all anon/authenticated grants**. ⚠️ The **live** table had RLS disabled as of 2026-10-19 (SECURITY.md S-1) until `security-hardening.sql` is run. `referrer` holds only the referring origin (since 2026-10-19). The table is written by `/api/analytics/track` and read by `/api/analytics/stats` and `GET /api/blog/posts` (view counts).

**Opt-in columns** (added by `supabase/consent-schema.sql`, populated only for consenting visitors): `ip_address inet`, `language text`, `timezone text`, `visitor_id uuid` (indexed), and `consent_version smallint`.

### `consent_events` (from `supabase/consent-schema.sql`)
id uuid, visitor_id uuid (not null, indexed), analytics boolean, policy_version smallint, action text (`set` | `erase`), created_at (indexed desc).
RLS is **enabled with no policies**, and all anon/authenticated grants are revoked, so only the service role can use it. **It never stores IPs or user agents**: it's proof of consent, kept for audits.

### `project_documents` (from `supabase/documents-schema.sql`)
id, project_slug, filename, title, content, content_hash, source, created_at, updated_at; **unique (project_slug, filename)**; index on project_slug.
RLS is **enabled with no policies**, so only the service role can touch it. It is written only by `/api/docs/upload`; nothing in this app reads it yet (a future "aggregator" project will).

**Setup order on a fresh project:** `schema.sql`, then `projects-schema.sql`, then `analytics-schema.sql`, then `consent-schema.sql`, then `documents-schema.sql`.
**Existing database:** run `security-hardening.sql` once. It is idempotent: it enables RLS everywhere, revokes unneeded anon/authenticated grants, and pins the trigger function's `search_path`. It ends with two verification queries and a commented-out retention job.

### `auth_failures` (from `supabase/auth-lockout-schema.sql`)
`key text PK` (`<scope>:ip:<HMAC prefix>` keyed with a server secret, or `<scope>:global`; never a raw IP), `count int`, and `window_end timestamptz`. RLS is on, and anon/authenticated have no grants. Two functions, executable only by `service_role`:
- `auth_failure_hit(p_keys text[], p_window_seconds int)` upserts the counters, starting a fresh window when the old one ended, and deletes rows whose window ended over a day ago.
- `auth_failure_counts(p_keys text[])` returns the counts for windows that are still open.

Used by `lib/auth-lockout.ts`. The app works without this table, falling back to in-memory counting.

### Sponsorships (from `supabase/sponsorships-schema.sql`; setup steps in [SPONSORSHIPS.md](SPONSORSHIPS.md))
All three are private: RLS on with no policies, anon/authenticated revoked, service role only. The app works before the file runs: offers still arrive by email, and `/laptop` shows the built-in samples.

**`sponsor_offers`**: one row per offer from the form. `id uuid PK` (also the folder name in the bucket), `email` (≤254), `affiliation` (≤120), `offer_usd numeric(10,2)` (1–1,000,000), `spot` (a spot id or `any`), `file_path` (null if the upload failed), `file_type` (`image/png` | `image/jpeg`), `file_bytes`, `file_name` (≤120), `status` (`new` | `accepted` | `declined`, default `new`), `notes` (≤2,000, default `''`), `created_at`. Index on `created_at desc`. No IP or user agent.

**`sponsor_spots`**: what each spot shows. `id text PK`, one of the six slot ids (CHECK), `sponsor_name` (≤60; null = open), `mark` (≤6), `tagline` (≤80), `description` (≤400), `theme` (`purple` | `green` | `pink`), `image_path`, `visible bool` (false = shown as open on `/laptop`, kept in Studio), `sample bool` (labelled "Sample sponsor"), `offer_id uuid` → `sponsor_offers(id)` `ON DELETE SET NULL`, `updated_at` (also the image cache-buster). Seeded with the four sample sponsors and two open spots, `ON CONFLICT DO NOTHING`, so re-running never overwrites Studio edits. Read by `lib/sponsor-spots-server.ts`; written only by `/api/sponsorships/spots`.

**Storage bucket `sponsor-stickers`**: private, 4 MB per object, `image/png` and `image/jpeg` only, **no** `storage.objects` policies.
- `offers/<offer id>/sticker.<png|jpg>`: what a sponsor uploaded (written by the form, deleted with the offer).
- `spots/<spot id>/<uuid>.<png|jpg>`: the image a spot shows, a **copy** made when an offer is placed (or an upload from Studio), so deleting an offer never breaks `/laptop`. Replaced images are deleted.
- Paths outside these two shapes are never served (`STORED_FILE_RE` in `lib/sponsor-spots.ts`).

**`supabase/audit-exposure.sql`** is read-only. It lists tables without RLS, policies, anon/authenticated grants, functions anon can call, views that bypass RLS, storage buckets and write policies, and Auth accounts by provider. Fixes are included, commented out.

## 8. Key flows

### 8.1 Public blog read
```mermaid
sequenceDiagram
    participant B as Browser (/blog)
    participant S as Supabase (anon + RLS)
    B->>S: select id,title,slug,… from posts where published order by created_at desc
    S-->>B: Post[] (no content)
    Note over B: user clicks a card → modal
    B->>S: select content from posts where id=? and published
    S-->>B: markdown
    Note over B: MarkdownRenderer: remark-gfm → rehype-raw → rehype-sanitize → rehype-highlight
```

### 8.2 Admin sign-in and mutation (Studio)
```mermaid
sequenceDiagram
    participant U as Owner (browser)
    participant AU as /api/auth
    participant RL as lib/auth-lockout (memory + Postgres)
    participant A as /api/blog/posts
    participant DB as Supabase (service role)
    U->>AU: POST {password} (AdminGate form, same-origin)
    AU->>RL: isAuthBlocked("admin-password", ip)? (per IP + global)
    AU->>AU: safeEqual(password, LOGISTICS_PASSWORD)
    alt wrong password
        AU->>RL: recordAuthFailure
        AU-->>U: 401 (429 after 10 per IP or 100 global per 15 min)
    else ok, ADMIN_2FA off
        AU-->>U: 200 + Set-Cookie __Host-admin_session (HttpOnly, SameSite=Strict, 8 h)
    else ok, ADMIN_2FA=email
        AU->>AU: createChallenge() → code + HMAC token
        AU-->>U: email with the code (Resend → owner's inbox)
        AU-->>U: 200 {twoFactor:"email"} + Set-Cookie __Host-admin_2fa (10 min)
        U->>AU: POST {code} (challenge cookie attached)
        AU->>AU: verifyChallenge(token, code) (wrong code → recordAuthFailure, 401)
        AU-->>U: 200 + Set-Cookie __Host-admin_session, challenge cleared
    end
    U->>A: GET (cookie attached automatically)
    A->>A: checkAdminAuth: verify HMAC + expiry
    A->>DB: select posts (+ page_views for view_count)
    A-->>U: 200 Post[]
    U->>A: PATCH {id, published:true} (cookie, Sec-Fetch-Site same-origin)
    A->>A: session ok, same-origin ok, readJson, isUuid(id), validateFields(whitelist)
    A->>DB: update posts set … where id
    A-->>U: 200 updated row → UI merges into list
```

### 8.3 Page-view tracking
1. On each `pathname` change, `PageTracker` (mounted in the root layout) skips the page if it starts with a skip prefix or if `localStorage._pv_exclude === "1"`.
2. It reads or creates `sessionStorage._pv_sid` (a UUID) and the `localStorage._pv_seen` first-visit flag. It reads navigation timing on hard loads only, and `screen.width`.
3. It sends `fetch('/api/analytics/track', {keepalive:true})` and swallows any error.
4. The server re-validates the request (§6.1) and inserts a row.

### 8.4 Automation: docs sync and email digest
The external daily-status task regenerates `PROJECT_OVERVIEW.md`, POSTs it to `/api/docs/upload` (project `portfoliomkv`, which upserts one row), and then POSTs the rendered summary to `/api/email-summary`. None of this runs inside the repo; only the endpoints do.

### 8.5 First visit: intro, consent, tour
```mermaid
sequenceDiagram
    participant V as Visitor (browser)
    participant P as OnboardingProvider
    participant C as /api/consent
    participant T as /api/analytics/track
    V->>P: first page load (no java_consent cookie)
    P-->>V: IntroModal (Welcome, then Privacy; can't be dismissed yet)
    V->>P: Accept all / Necessary only / Save my choices
    P->>P: write java_consent cookie + localStorage mirror
    P->>C: POST {id, analytics, version} (receipt, fire-and-forget)
    alt analytics accepted
        P->>T: PageTracker POSTs the current page (cookie attached)
        T->>T: allowsAnalytics(cookie)? store IP, UA, language, timezone, visitor_id
    else declined
        Note over T: nothing is sent; the server would refuse anyway
    end
    P-->>V: Guide (live previews), then the tour offer
    V->>P: Start the tour
    P-->>V: TourToolbar under the Navbar, TourSpotlight on [data-tour] targets
    Note over V,P: last step on a page: Navbar highlights the next tab, and the pathname change advances the step
```
On later visits, a cookie with the current `CONSENT_VERSION` means no modal and no tour offer. A cookie with an older version re-opens only the Privacy step.

### 8.6 Sponsorship: offer → Studio → `/laptop`
```mermaid
sequenceDiagram
    participant V as Visitor (/laptop)
    participant F as POST /api/sponsorships
    participant DB as sponsor_offers / sponsor_spots + bucket
    participant S as Owner (/studio → Sponsorships)
    participant L as /laptop (ISR)
    V->>F: offer + PNG/JPG
    F->>DB: offers/<id>/sticker.* + sponsor_offers row
    F-->>S: owner email (sticker attached, link to Studio)
    S->>DB: PATCH /api/sponsorships/spots {id, offerId}: copy to spots/…, hidden, offer accepted
    S->>S: preview on Studio's laptop ("Show hidden stickers")
    S->>DB: PATCH {id, visible: true}
    DB-->>L: revalidatePath("/laptop"): next visit re-renders with the spot
    L-->>V: sticker drawn from /laptop/stickers/<spot>?v=<updated_at>
```
Studio's laptop is the same `LaptopStage` as `/laptop`, fed from `GET /api/sponsorships/spots` with image URLs on the admin file route, so hidden stickers can be previewed without ever being public. Owner steps: [SPONSORSHIPS.md](SPONSORSHIPS.md).

## 9. Auth model (summary)
- **Admin humans** share one secret, `LOGISTICS_PASSWORD`, sent once to `POST /api/auth` and exchanged for an HttpOnly, SameSite=Strict session cookie (`__Host-admin_session` in production, 8 h, HMAC-signed and stateless). The cookie guards `/api/blog/posts`, `/api/projects`, `/api/analytics/stats`, and Studio's sponsorship routes (`/api/sponsorships` GET/PATCH/DELETE, `/api/sponsorships/spots`, `/api/sponsorships/file`) through `checkAdminAuth`. Cookie-authenticated writes must be same-origin. Changing the password signs everyone out. Scripts may still send the password as `x-logistics-key`, unless 2FA is on.
- **Machines** each get their own secret in the `x-api-key` header: `BLOG_UPLOAD_SECRET`, `DOCS_UPLOAD_SECRET`, and `EMAIL_SUMMARY_SECRET`.
- **The page "gates"** (`components/features/AdminGate.tsx`) are UX only. The real protection is that every data call needs a valid session or secret.
- **Second factor (opt-in):** `ADMIN_2FA=email` adds an emailed 6-digit code after the password and disables `x-logistics-key` (S-6).
- See SECURITY.md for the threat model and limitations.

## 10. SEO plumbing
- **Root metadata** (`app/layout.tsx`): `metadataBase = NEXT_PUBLIC_SITE_URL ?? "https://java.dev"`, a title template of `%s | JAVA.dev`, OG and Twitter cards, robots allowing indexing, and Person JSON-LD.
- **Route metadata:** `about`, `work`, `contact`, and `blog` each have a `layout.tsx` that exists only to export `metadata`, because their pages are client components and cannot export metadata themselves.
- **Posts:** `blog/[slug]/layout.tsx` provides `generateMetadata` and BlogPosting JSON-LD, deduplicated with React `cache()`. `opengraph-image.tsx` renders a per-post image.
- **JSON-LD** is serialized with `serializeJsonLd` (`lib/json-ld.ts`), never raw `JSON.stringify`.
- **Robots and sitemap:** `robots.ts` disallows only `/api/`. `/studio` and `/logistics` carry `noindex` through their layouts' metadata and an `X-Robots-Tag` header. The sitemap lists the 5 static routes and every published post.

## 11. Configuration

| File | What matters |
|---|---|
| `next.config.ts` | `poweredByHeader: false`. **`experimental.turbopackFileSystemCacheForBuild: false`**: Next 16.3+ otherwise caches build work in `.next/cache/turbopack`, including env var values, which makes Netlify's secrets scan fail the deploy (a test guards this). `headers()` applies the security headers and CSP to `/:path*`, `no-store` and `noindex` to `/api/:path*`, and `noindex` to `/studio` and `/logistics` (details in SECURITY.md §4.5). `allowedDevOrigins: ["10.0.0.183"]` allows phone testing on the LAN. The `turbopack.rules['*.pdf']` and `webpack` PDF rules are **vestigial**, since `file-loader` isn't installed and nothing imports PDFs. Exported with `module.exports` so the Jest test can `require()` it. |
| `tsconfig.json` | strict, `moduleResolution: bundler`, `@/*` alias, and includes `.next/types` and `pdf.d.ts`. `src/**/*` is a leftover include; there is no `src/`. |
| `postcss.config.mjs` | Only the `@tailwindcss/postcss` plugin takes effect. Its `theme.extend.fontFamily` block is **ignored by Tailwind 4** (see DESIGN_SYSTEM.md §3). |
| `app/globals.css` | `@import "tailwindcss"`, the highlight.js theme, `:root` background and foreground vars (light and dark), and `@theme inline`, which maps `--font-sans` and `--font-mono` to Geist |
| `eslint.config.mjs` | `core-web-vitals` + `typescript` presets; ignores `.next`, `out`, `build`, `next-env.d.ts` |
| `jest.config.js` | See TESTING.md |

## 12. Environment variables

Set these in `.env.local` locally and in **Netlify, under Site settings → Environment variables**, for deploys. `NEXT_PUBLIC_*` values are **inlined at build time**, so changing one requires a redeploy.

| Name | Scope | Used by | Required? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | `lib/supabase.ts`, `lib/supabase-admin.ts` | **Yes**. Import throws without it, and the build fails. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | `lib/supabase.ts` | **Yes** (same reason) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server secret** | `lib/supabase-admin.ts` | Yes, for every API route |
| `NEXT_PUBLIC_SITE_URL` | public | Metadata, robots, sitemap, JSON-LD, security.txt, sponsorship emails | Recommended (`https://javastudios.netlify.app`); `siteUrl()` in `lib/site.ts` falls back to that same address |
| `LOGISTICS_PASSWORD` | server secret | `/api/auth`, `/api/blog/posts`, `/api/projects`, `/api/analytics/stats` (and therefore Studio and Logistics), and the session-signing key | Yes, for admin. Unset means sign-in and every admin call return 401 (fails closed). Changing it signs everyone out. |
| `SESSION_SECRET` | server secret | `lib/session.ts` | Optional but recommended (`openssl rand -base64 32`). Falls back to `SUPABASE_SERVICE_ROLE_KEY` as signing material. |
| `BLOG_UPLOAD_SECRET` | server secret | `/api/blog/upload` | Only if you use the upload webhook |
| `DOCS_UPLOAD_SECRET` | server secret | `/api/docs/upload` | Only for docs sync |
| `EMAIL_SUMMARY_SECRET` | server secret | `/api/email-summary` | Only for digests |
| `RESEND_API_KEY` | server secret | `/api/email-summary`, 2FA codes | Only for digests and 2FA. Without it, the route returns 500 (fails closed). |
| `RESEND_FROM_EMAIL` | server | `/api/email-summary` | Optional. Without it, sends use the sandbox sender, which delivers only to the owner. |
| `SUMMARY_RECIPIENT_EMAIL` | server | `/api/email-summary` | Yes, for digests |
| `ANALYTICS_EXCLUDED_IPS` | server | `/api/analytics/track`, `/api/analytics/stats` | Optional; comma-separated list |
| `ADMIN_2FA` | server | `lib/two-factor.ts`, `lib/admin-auth.ts` | Optional. `email` turns on the emailed sign-in code and disables `x-logistics-key`. Needs `RESEND_API_KEY` and a recipient, or sign-in fails closed. |
| `ADMIN_2FA_EMAIL` | server | `lib/two-factor.ts` | Optional; where 2FA codes go (default `SUMMARY_RECIPIENT_EMAIL`) |
| `AUTH_LOCKOUT_STORE` | server | `lib/auth-lockout.ts` | Tests set `memory`; leave unset in production so lockouts are shared |
| `SECURITY_CONTACT` | server | `/.well-known/security.txt` | Optional; email or `https://` URL (default: the address on `/contact`) |
| `SPONSOR_REPLY_TO` | server | `/api/sponsorships` | Optional; Reply-To on the sponsor's thank-you copy (default: the public `/contact` address). The sponsorship form also needs `RESEND_API_KEY`, `SUMMARY_RECIPIENT_EMAIL`, and, for the sponsor's copy to arrive, a `RESEND_FROM_EMAIL` on a verified domain. |
| `TURNSTILE_SECRET_KEY` | server | `/api/sponsorships` (`lib/turnstile.ts`) | Optional. Turns on the offer form's Cloudflare Turnstile check (S-40); set it together with the site key. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public, build time | `SponsorForm`, `next.config.ts` CSP, `/privacy` | Optional. Shows the widget, adds `https://challenges.cloudflare.com` to `script-src`/`frame-src`, and adds a line to `/privacy`. Redeploy after changing it. |

To add a new variable, add it to this table **and** to the README env table, read it with `process.env.X` on the server, and check that it is set before use (fail closed for secrets).

## 13. Deployment
- **Netlify** builds `next build` from `main`. There is no repo-side Netlify config. The site is at https://javastudios.netlify.app.
- **Build prerequisites:** the Supabase URL and anon key must be present, because the sitemap queries posts and `createClient` throws without them.
- Linting does **not** run during `next build` in Next 16, and there is **no CI**. Run the checks locally (see TESTING.md) until P1-2 lands.
- **Serverless caveat:** module state such as the rate-limit maps is per warm instance and resets on cold start. Auth lockouts also live in Postgres (`auth_failures`) once `auth-lockout-schema.sql` has run, so they survive both.

## 14. Recipes

### 14.1 Add a new admin-managed resource (for example, "talks")
1. Write `supabase/talks-schema.sql`, using `projects-schema.sql` as the template. Make it idempotent, enable RLS, add a `select` policy on `published = true` if the data is public, and add an `updated_at` trigger.
2. Add field limits to `LIMITS` in `lib/validation.ts`, plus any normalizers you need, and unit-test them.
3. Copy `app/api/projects/route.ts` to `app/api/talks/route.ts`, then adapt `ROUTE`, `validateFields`, the defaults, and the select columns. Keep `checkAuth`, `readJson`, `dbError`, and the bulk-delete cap.
4. Copy `__tests__/api-projects.test.ts` to `__tests__/api-talks.test.ts`. Keep the auth, lockout, mass-assignment, and error-leak tests.
5. Add a public read helper in `lib/talks-data.ts` that explicitly filters `.eq("published", true)`.
6. Add a Studio tab: extend `Tab` and `TABS` in `app/studio/page.tsx` and create `TalksPanel.tsx`, following `ProjectsPanel`.
7. Update ARCHITECTURE.md (§6, §7), PRD.md (inventory and change log), and SECURITY.md (the endpoint table in §5).

### 14.2 Add a public page
1. Create `app/<route>/page.tsx`. Prefer a **Server Component**, and add `"use client"` only to the interactive children.
2. If the page must be a client component, add a `layout.tsx` that only exports `metadata`, following `app/about/layout.tsx`.
3. Wrap it in the standard shell: `min-h-screen font-dm p-6 md:p-8 bg-[#0a0a0f]`, then `<Navbar currentLink="<Name>"/>`, then a bento grid. Add it to `NavbarLinks` in `components/ui/Navbar.tsx` if it belongs in the nav.
4. Add it to `staticRoutes` in `app/sitemap.ts`.

### 14.3 Add a field to posts or projects
Do all of the following together: add the SQL `alter table` (and update the schema file), add the `LIMITS` entry, add a `validateFields` branch **and** a POST default in the route, add tests (accept, reject, and that it can't be mass-assigned), update the TS types (both copies until P1-5 lands), add the Studio editor or wizard field, add it to the public `select(...)` column lists if public, and update the PRD model (BLOG-1 or PROJ-1).

### 14.4 Add or change a tour step
1. Edit `TOUR_STEPS` in `lib/tour.ts`. Keep each page's steps contiguous, in nav order.
2. If the step spotlights something, put `data-tour="<target>"` on that element. `__tests__/lib-tour.test.ts` fails if the anchor is missing.
3. Update the "Step 3 of 10" sample in `TourPreview` (`SitePreviews.tsx`) if the count matters there.

### 14.5 Change what analytics collect
1. Change the track route and the schema (a new SQL file, or `consent-schema.sql` with `ADD COLUMN IF NOT EXISTS`).
2. Update `ANALYTICS_DATA_POINTS` in `lib/consent.ts`; the modal and `/privacy` both render it.
3. **Bump `CONSENT_VERSION`** and `PRIVACY_POLICY_UPDATED`, so every visitor is asked again under the new terms.
4. Update the tests in `api-analytics-track.test.ts` and SECURITY.md §4.10.

## 15. Architectural decisions (current)
| Decision | Why | Revisit when |
|---|---|---|
| Public reads go from browser to Supabase with RLS | No server hop; RLS is the trust boundary | Moving the blog to Server Components (P1-4) |
| All writes go through route handlers with the service role | Keeps the service key server-side and centralizes validation | Never |
| A static shared password instead of user auth, with an optional emailed code (`ADMIN_2FA`) | A single owner, and fast to build | More than one admin |
| In-memory request limiting; auth lockouts in Postgres | No external dependency (the lockout reuses Supabase) | Abuse that per-instance flood limits can't absorb (P2-1) |
| One SQL file per table, no migration tool | Small schema; it runs in the dashboard | A second environment (staging) or frequent schema changes |
| First-party analytics in Postgres | Privacy, no third-party scripts, portfolio value | Volume nears 50k rows in the stats window, at which point stats need SQL aggregation |
| Jest with a Babel transform, not `next/jest` | Avoids a root Babel config that would disable SWC | Adopting Vitest per the bundled guide |
| Plain Three.js for `/laptop` (no react-three-fiber), with sticker, screen and keyboard art drawn on canvases from data | Demonstrates the Three.js concepts directly; adds one dependency; no image assets or network calls for artwork; the GLB stays a few flat planes (no modelled keycaps), and sponsors, keys or the desktop change without a re-export | Several 3D scenes, or declarative scene composition becomes worth a framework |
| Sponsor spots and offers in private tables, read server-side; images served same-origin; no payments | `/laptop` stays one cached server render with no public Supabase read, so hidden spots and offers can't leak through RLS mistakes. Same-origin images keep the bucket private, need no CORS for WebGL textures, and leave the CSP alone. Negotiation still happens by email. | Many more spots or sponsors (then: paginated Studio lists), or self-serve sponsorship with payment |
| Placing an offer's sticker copies its file and starts the spot hidden | A deliberate second step before anything a stranger uploaded goes public; deleting an offer can't break the laptop | Never, unless offers are pre-approved elsewhere |

## 16. Tech-debt register
| ID | Debt | Impact | Fix |
|---|---|---|---|
| TD-1 | `/work` uses static `lib/projects.ts` | Studio edits never reach /work | PRD P1-1 |
| TD-2 | Client-rendered blog content | SEO and LCP; the post is fetched twice | P1-4 |
| TD-3 | Duplicated types, slugify, skip prefixes, and theme maps (PasswordGate and the admin `checkAuth` were unified on 2026-10-19). Also: the six slot ids are listed in both `lib/laptop-stickers.ts` and the `sponsor_spots` CHECK constraint, and the sample sponsors in both `STICKER_SLOTS` and the schema's seed | Drift bugs | P1-5 |
| TD-4 | `/api/analytics/stats` loads up to 50k rows and aggregates in JS | Will slow down and eventually truncate | A SQL view or RPC that aggregates in Postgres |
| TD-5 | View counts scan all `/blog/%` rows on every Studio load | Same | Aggregate with SQL `group by page` |
| TD-6 | A duplicate slug returns a generic 500 | Confusing editor error | Map Postgres `23505` to `409 {error:"Slug already exists"}` |
| ~~TD-7~~ | ~~A blog re-upload can silently unpublish a post~~ | ✅ Fixed 2026-10-19 | |
| TD-8 | Vestigial PDF loader rules, `pdf.d.ts`, `src/**` include, dead `ComingSoon`, unused SVGs | Noise | P1-6 |
| TD-9 | The font utilities don't exist | Off-brand typography | P0-2 |
| ~~TD-10~~ | ~~`schema.sql` is not idempotent~~ | ✅ Fixed 2026-10-19 | |
