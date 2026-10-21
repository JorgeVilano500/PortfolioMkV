# Architecture

_How the system is put together: the runtime model, data flow, the API contract, the data model, configuration, deployment, and recipes for extending it. Last verified against the code: **2026-10-19** (HEAD `5589a7d`)._

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
    end

    RESEND["Resend<br/>email API"]
    AUTO["External automations<br/>daily-status task, upload scripts"]

    PUB -- "anon key · RLS: published only" --> POSTS
    PUB -- "anon key · RLS: published only" --> PROJ
    SRV -- "anon key" --> POSTS
    PT -- "POST /api/analytics/track" --> API
    ADM -- "session cookie (POST /api/auth once)" --> API
    AUTO -- "x-api-key" --> API
    API -- "service-role key" --> POSTS
    API -- "service-role key" --> PROJ
    API -- "service-role key" --> PV
    API -- "service-role key" --> DOCS
    API --> RESEND
```

**The core rule:** the browser only ever talks to Supabase with the **anon key**, and RLS limits that key to `published = true` rows of `posts` and `projects`. Every write, and every read of private data (drafts, analytics, docs), goes through an **authenticated route handler** that uses the **service-role key**. The service-role key never leaves the server.

## 2. Tech stack

| Layer | Choice | Version (installed) | Notes |
|---|---|---|---|
| Framework | Next.js App Router | 16.3.8 | Turbopack by default. Read `node_modules/next/dist/docs/` before using any Next API. |
| UI | React | 19.2.4 | Most pages are client components (see §4) |
| Language | TypeScript | 5.9 | `strict: true`; path alias `@/*` points at the repo root |
| Styling | Tailwind CSS (`@tailwindcss/postcss`) | 4.2 | No `tailwind.config.*`. The theme lives in `app/globals.css` (`@theme inline`). See DESIGN_SYSTEM.md. |
| Database | Supabase Postgres (`@supabase/supabase-js`) | ^2.104 | Two clients: anon and service role |
| Markdown | `react-markdown` 10, `remark-gfm` 4, `rehype-raw` 7, `rehype-sanitize` 6, `rehype-highlight` 7 (highlight.js 11) | | Used only in `components/ui/MarkdownRenderer.tsx` |
| Frontmatter | `gray-matter` | ^4 | Used only by `/api/blog/upload` |
| Email | `resend` | 4.8 | Used only by `/api/email-summary` |
| Icons | `react-icons` (`rx`, `fa6`, `md`, `io5`), plus inline SVG paths in `app/studio/shared.tsx` | ^5.6 | |
| Tests | Jest 30 with `babel-jest` (inline config) | | See TESTING.md |
| Lint | ESLint 9 flat config + `eslint-config-next` 16.3.8 | | `npm run lint` |
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
│   ├── about/   page.tsx (client) + layout.tsx (metadata only)
│   ├── work/    page.tsx (client) + layout.tsx (metadata only)
│   ├── contact/ page.tsx (client) + layout.tsx (metadata only)
│   ├── blog/    page.tsx (client) + layout.tsx (metadata only)
│   │   └── [slug]/ page.tsx (client), layout.tsx (server: generateMetadata + BlogPosting JSON-LD),
│   │               opengraph-image.tsx (per-post OG)
│   ├── studio/  🔒 page.tsx (gate + tabs), BlogsPanel.tsx, ProjectsPanel.tsx, ProjectWizardModal.tsx,
│   │               shared.tsx (Icon + ICON_PATHS, formatDate), layout.tsx (noindex)
│   ├── logistics/ 🔒 page.tsx (AdminGate + Dashboard), layout.tsx (noindex)
│   └── api/
│       ├── analytics/track/route.ts   POST (public)
│       ├── auth/route.ts              GET (session?) / POST (sign in → cookie) / DELETE (sign out)
│       ├── analytics/stats/route.ts   GET  (admin); also exports StatsPayload type
│       ├── blog/posts/route.ts        GET/POST/PATCH/DELETE (admin)
│       ├── blog/upload/route.ts       POST (x-api-key = BLOG_UPLOAD_SECRET)
│       ├── projects/route.ts          GET/POST/PATCH/DELETE (admin)
│       ├── docs/upload/route.ts       POST (x-api-key = DOCS_UPLOAD_SECRET)
│       └── email-summary/route.ts     POST (x-api-key = EMAIL_SUMMARY_SECRET)
├── components/
│   ├── index.tsx                  Barrel: Navbar, HomeComponent, WorkComponent, ComingSoon, ProjectList, MarkdownRenderer, Modal
│   ├── ui/                        Navbar, Home, WorkComponent, ProjectList, MarkdownRenderer, PageTracker, ComingSoon (dead)
│   └── features/                  Modal.tsx (portal modal), AdminGate.tsx (session check, password form, SignOutButton)
├── lib/
│   ├── supabase.ts                Anon client (browser-safe)
│   ├── supabase-admin.ts          Service-role client (SERVER ONLY)
│   ├── blog.ts                    Post types, themeMap, getPosts/getPostContent/getPostBySlug, formatDate
│   ├── projects-data.ts           PublicProject type, projectThemeMap, getPublicProjects
│   ├── projects.ts                LEGACY hard-coded project list, used only by WorkComponent (/work)
│   ├── security.ts                safeEqual (timing-safe), getClientIp, isSameOriginRequest (CSRF)
│   ├── session.ts                 Signed, expiring admin session tokens + cookie options
│   ├── admin-auth.ts              checkAdminAuth: session cookie (+CSRF) or x-logistics-key, with lockout
│   ├── json-ld.ts                 serializeJsonLd: XSS-safe JSON for <script type=ld+json>
│   ├── rate-limit.ts              In-memory fixed-window limiter (10k-key cap) + per-IP and global auth lockout
│   ├── validation.ts              LIMITS, type-guard validators, normalizers, slugify, estimateReadingTime
│   └── markdown-sanitize.ts       rehype-sanitize allowlist schema
├── supabase/                      SQL to run in the Supabase SQL editor (no migration tool)
├── __tests__/                     Jest suites + helpers/test-utils.ts
├── public/                        resume.pdf + default Next SVGs (unused)
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
| `/studio`, `/logistics` | Client, wrapped in `<AdminGate>` | `fetch('/api/...')`; the browser attaches the HttpOnly session cookie | service role (server-side) | Renders nothing until `GET /api/auth` answers, then shows the password form or the page |

There are no Server Actions, `use cache`, `revalidate*` calls, `proxy.ts`, or route-segment config anywhere. Every API route is a plain route handler.

## 5. Data-access layer

| Module | Runs where | Purpose | Rules |
|---|---|---|---|
| `lib/supabase.ts` | Anywhere | `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)` | Logs a warning when env vars are missing, **but `createClient` throws on an empty URL at import time** |
| `lib/supabase-admin.ts` | **Server only** | Service-role client, `persistSession: false` | Never import from `"use client"` files. Bypasses RLS. |
| `lib/blog.ts` | Anywhere | `Post`, `PostWithContent`, `PostTheme`, `themeMap`; `getPosts()` (published, without content, newest first), `getPostContent(id)` (published only), `getPostBySlug(slug)` (published only, `null` on error), `formatDate` | Public reads always add `.eq("published", true)` on top of RLS |
| `lib/projects-data.ts` | Anywhere | `PublicProject`, `projectThemeMap`, `getPublicProjects()` (published; featured first, then newest) | Same rule |
| `lib/projects.ts` | Anywhere | Legacy static `projects[]` with Tailwind classes baked in | Scheduled for deletion |
| `lib/validation.ts` | Server (pure) | `LIMITS`, `isValidSlug`, `isNonEmptyString`, `isStringMax`, `normalizeTags`, `normalizeTheme`, `normalizeProjectStatus`, `isValidUrlOrEmpty`, `estimateReadingTime`, `slugify` | Pure functions, fully unit-tested |
| `lib/security.ts` | Server | `safeEqual` (SHA-256 both sides, then `timingSafeEqual`), `getClientIp` (`x-nf-client-connection-ip`, then first XFF entry, then `x-real-ip`, then `"unknown"`), `isSameOriginRequest` (Sec-Fetch-Site, then Origin vs Host) | |
| `lib/session.ts` | Server | `createSessionToken`, `verifySessionToken`, `sessionCookieOptions`, `SESSION_COOKIE`, `SESSION_TTL_SECONDS` (8 h) | The HMAC key derives from `SESSION_SECRET` (or the service-role key) plus `LOGISTICS_PASSWORD`; fails closed |
| `lib/admin-auth.ts` | Server | `checkAdminAuth(req, route)` returns a response to send, or null if allowed | The only auth check admin routes should use |
| `lib/json-ld.ts` | Anywhere | `serializeJsonLd(data)` | Escapes `<`, `>`, `&`, and U+2028/2029 |
| `lib/rate-limit.ts` | Server | `rateLimit(name, key, limit, windowMs)`, `isAuthBlocked(route, ip)`, `recordAuthFailure(route, ip)`, `resetRateLimits()` (tests) | Module-level `Map`, so state is per process. Each limiter is capped at 10k keys (expired buckets go first, then the oldest 10%). Auth damping: 10 failures per 15 min per IP, plus 100 per route globally. |
| `lib/markdown-sanitize.ts` | Anywhere | `markdownSanitizeSchema` | Type-only import, so it has no runtime dependencies |

## 6. API reference

All handlers live in `app/api/**/route.ts`. Errors are always `{"error": "<generic message>"}`. Every JSON body must be a plain object (`null`, arrays, and scalars return 400). Every response carries `Cache-Control: no-store` and `X-Robots-Tag: noindex` (from `next.config.ts`).

**Admin routes** (marked "admin" below) call `checkAdminAuth` (SECURITY.md §4.1). A valid `admin_session` cookie is accepted; for writes it must also pass the same-origin check, or the route returns 403. Without a cookie, the route falls back to the `x-logistics-key` header. **Machine routes** take `x-api-key`. Failed attempts count toward **10 per IP and 100 per route globally per 15 minutes**, after which the route returns `429 {"error":"Too many attempts. Try again later."}`.

### 6.0 `/api/auth` (session)
| Method | Body | Result |
|---|---|---|
| GET | none | `200 {authenticated: boolean}` |
| POST | `{ password }` | `200 {authenticated:true}` plus `Set-Cookie: admin_session=…; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800; Secure` (Secure in production only). Wrong password returns `401`, a lockout `429`, a cross-site request `403`, and a missing signing secret `500`. |
| DELETE | none | Clears the cookie. A cross-site request returns `403`. |

### 6.1 `POST /api/analytics/track` (public)
- **Body** (`Content-Type: application/json` required): `{ page, session_id, referrer?, is_new_visitor?, load_time?, screen_width? }`
- **Order of checks:**
  1. If the IP is in `ANALYTICS_EXCLUDED_IPS`, return `200 {ok:true}` without inserting.
  2. Rate limit of **30 per minute per IP**, otherwise `429` with a `Retry-After` header.
  3. Content type, otherwise `400`. JSON parse, otherwise `400`.
  4. `page` must be a string starting with `/` (≤300 chars) and `session_id` must be 1 to 100 chars, otherwise `400`.
  5. If `page` starts with `/logistics`, `/studio`, or `/api`, return `200 {ok:true}` without inserting.
  6. Insert, then return `200 {ok:true}`, or `500 {error:"DB error"}`.
- **Server-side normalization:** `referrer` is reduced to its **origin** (http/https only; anything else, or anything over 2,000 chars, becomes `""`); `user_agent` is read **from the request header** and cut to 500; `is_new_visitor` is stored only if it is strictly `true`; `load_time` must be 0 to 120,000 ms (rounded) or it becomes null; `screen_width` must be 1 to 10,000 (rounded) or it becomes null.

### 6.2 `GET /api/analytics/stats` (admin)
Returns `StatsPayload` (exported from the route file, and imported by `app/logistics/page.tsx` as a type):
`totalViews, last30Views, uniqueVisitors, last30Unique, avgLoadTime, topPages[8], topReferrers[6], newVsReturning, devices, recentActivity[15], dailyViews[30], peakHours[24], bounceRate, yourIp, excludedIps`.
It reads up to **50,000** newest rows and aggregates in memory. The metric definitions are in PRD.md LOG-2. A DB error returns `500 {error:"DB error"}`.

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

### 6.7 `POST /api/email-summary` (`x-api-key` = `EMAIL_SUMMARY_SECRET`)
- After authentication there is a **global** cap of 10 sends per hour (`429` with `Retry-After`).
- **Body (JSON):** `{ subject? ≤500, text? ≤500k, html? ≤500k }`, with at least one of `text` or `html`.
- The email always goes to `SUMMARY_RECIPIENT_EMAIL` (`500` if that is unset). It is sent from `RESEND_FROM_EMAIL`, falling back to `Inbox Summary <onboarding@resend.dev>`. The subject falls back to `Inbox summary — <date>`.
- A provider error returns `502 {error:"Email provider error"}`. Success returns `200 {success:true, id}`.
- The Resend client is created per request. If `RESEND_API_KEY` or `SUMMARY_RECIPIENT_EMAIL` is missing, the route returns `500 {error:"Email is not configured"}`. The send cap counts only valid requests.

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

### `project_documents` (from `supabase/documents-schema.sql`)
id, project_slug, filename, title, content, content_hash, source, created_at, updated_at; **unique (project_slug, filename)**; index on project_slug.
RLS is **enabled with no policies**, so only the service role can touch it. It is written only by `/api/docs/upload`; nothing in this app reads it yet (a future "aggregator" project will).

**Setup order on a fresh project:** `schema.sql`, then `projects-schema.sql`, then `analytics-schema.sql`, then `documents-schema.sql`.
**Existing database:** run `security-hardening.sql` once. It is idempotent: it enables RLS everywhere, revokes unneeded anon/authenticated grants, and pins the trigger function's `search_path`. It ends with two verification queries and a commented-out retention job.

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
    participant RL as lib/rate-limit (in-memory)
    participant A as /api/blog/posts
    participant DB as Supabase (service role)
    U->>AU: POST {password} (AdminGate form, same-origin)
    AU->>RL: isAuthBlocked(route, ip)? (per IP + global)
    AU->>AU: safeEqual(password, LOGISTICS_PASSWORD)
    alt wrong password
        AU->>RL: recordAuthFailure
        AU-->>U: 401 (429 after 10 per IP or 100 global per 15 min)
    else ok
        AU-->>U: 200 + Set-Cookie admin_session (HttpOnly, SameSite=Strict, 8 h)
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

## 9. Auth model (summary)
- **Admin humans** share one secret, `LOGISTICS_PASSWORD`, sent once to `POST /api/auth` and exchanged for an HttpOnly, SameSite=Strict session cookie (`admin_session`, 8 h, HMAC-signed and stateless). The cookie guards `/api/blog/posts`, `/api/projects`, and `/api/analytics/stats` through `checkAdminAuth`. Cookie-authenticated writes must be same-origin. Changing the password signs everyone out. Scripts may still send the password as `x-logistics-key`.
- **Machines** each get their own secret in the `x-api-key` header: `BLOG_UPLOAD_SECRET`, `DOCS_UPLOAD_SECRET`, and `EMAIL_SUMMARY_SECRET`.
- **The page "gates"** (`components/features/AdminGate.tsx`) are UX only. The real protection is that every data call needs a valid session or secret.
- See SECURITY.md for the threat model and limitations. A second factor is still open (S-6, PRD P2-3).

## 10. SEO plumbing
- **Root metadata** (`app/layout.tsx`): `metadataBase = NEXT_PUBLIC_SITE_URL ?? "https://java.dev"`, a title template of `%s | JAVA.dev`, OG and Twitter cards, robots allowing indexing, and Person JSON-LD.
- **Route metadata:** `about`, `work`, `contact`, and `blog` each have a `layout.tsx` that exists only to export `metadata`, because their pages are client components and cannot export metadata themselves.
- **Posts:** `blog/[slug]/layout.tsx` provides `generateMetadata` and BlogPosting JSON-LD, deduplicated with React `cache()`. `opengraph-image.tsx` renders a per-post image.
- **JSON-LD** is serialized with `serializeJsonLd` (`lib/json-ld.ts`), never raw `JSON.stringify`.
- **Robots and sitemap:** `robots.ts` disallows only `/api/`. `/studio` and `/logistics` carry `noindex` through their layouts' metadata and an `X-Robots-Tag` header. The sitemap lists the 5 static routes and every published post.

## 11. Configuration

| File | What matters |
|---|---|
| `next.config.ts` | `poweredByHeader: false`. `headers()` applies the security headers and CSP to `/:path*`, `no-store` and `noindex` to `/api/:path*`, and `noindex` to `/studio` and `/logistics` (details in SECURITY.md §4.5). `allowedDevOrigins: ["10.0.0.183"]` allows phone testing on the LAN. The `turbopack.rules['*.pdf']` and `webpack` PDF rules are **vestigial**, since `file-loader` isn't installed and nothing imports PDFs. Exported with `module.exports` so the Jest test can `require()` it. |
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
| `NEXT_PUBLIC_SITE_URL` | public | Metadata, robots, sitemap, JSON-LD | Recommended (`https://javastudios.netlify.app`); falls back to `https://java.dev` |
| `LOGISTICS_PASSWORD` | server secret | `/api/auth`, `/api/blog/posts`, `/api/projects`, `/api/analytics/stats` (and therefore Studio and Logistics), and the session-signing key | Yes, for admin. Unset means sign-in and every admin call return 401 (fails closed). Changing it signs everyone out. |
| `SESSION_SECRET` | server secret | `lib/session.ts` | Optional but recommended (`openssl rand -base64 32`). Falls back to `SUPABASE_SERVICE_ROLE_KEY` as signing material. |
| `BLOG_UPLOAD_SECRET` | server secret | `/api/blog/upload` | Only if you use the upload webhook |
| `DOCS_UPLOAD_SECRET` | server secret | `/api/docs/upload` | Only for docs sync |
| `EMAIL_SUMMARY_SECRET` | server secret | `/api/email-summary` | Only for digests |
| `RESEND_API_KEY` | server secret | `/api/email-summary` | Only for digests. Without it, the route returns 500 (fails closed). |
| `RESEND_FROM_EMAIL` | server | `/api/email-summary` | Optional. Without it, sends use the sandbox sender, which delivers only to the owner. |
| `SUMMARY_RECIPIENT_EMAIL` | server | `/api/email-summary` | Yes, for digests |
| `ANALYTICS_EXCLUDED_IPS` | server | `/api/analytics/track`, `/api/analytics/stats` | Optional; comma-separated list |

To add a new variable, add it to this table **and** to the README env table, read it with `process.env.X` on the server, and check that it is set before use (fail closed for secrets).

## 13. Deployment
- **Netlify** builds `next build` from `main`. There is no repo-side Netlify config. The site is at https://javastudios.netlify.app.
- **Build prerequisites:** the Supabase URL and anon key must be present, because the sitemap queries posts and `createClient` throws without them.
- Linting does **not** run during `next build` in Next 16, and there is **no CI**. Run the checks locally (see TESTING.md) until P1-2 lands.
- **Serverless caveat:** module state such as the rate-limit maps is per warm instance and resets on cold start.

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

## 15. Architectural decisions (current)
| Decision | Why | Revisit when |
|---|---|---|
| Public reads go from browser to Supabase with RLS | No server hop; RLS is the trust boundary | Moving the blog to Server Components (P1-4) |
| All writes go through route handlers with the service role | Keeps the service key server-side and centralizes validation | Never |
| A static shared password instead of user auth | A single owner, and fast to build | P2-3 |
| In-memory rate limiting | No external dependency | P2-1 |
| One SQL file per table, no migration tool | Small schema; it runs in the dashboard | A second environment (staging) or frequent schema changes |
| First-party analytics in Postgres | Privacy, no third-party scripts, portfolio value | Volume nears 50k rows in the stats window, at which point stats need SQL aggregation |
| Jest with a Babel transform, not `next/jest` | Avoids a root Babel config that would disable SWC | Adopting Vitest per the bundled guide |

## 16. Tech-debt register
| ID | Debt | Impact | Fix |
|---|---|---|---|
| TD-1 | `/work` uses static `lib/projects.ts` | Studio edits never reach /work | PRD P1-1 |
| TD-2 | Client-rendered blog content | SEO and LCP; the post is fetched twice | P1-4 |
| TD-3 | Duplicated types, slugify, skip prefixes, and theme maps (PasswordGate and the admin `checkAuth` were unified on 2026-10-19) | Drift bugs | P1-5 |
| TD-4 | `/api/analytics/stats` loads up to 50k rows and aggregates in JS | Will slow down and eventually truncate | A SQL view or RPC that aggregates in Postgres |
| TD-5 | View counts scan all `/blog/%` rows on every Studio load | Same | Aggregate with SQL `group by page` |
| TD-6 | A duplicate slug returns a generic 500 | Confusing editor error | Map Postgres `23505` to `409 {error:"Slug already exists"}` |
| ~~TD-7~~ | ~~A blog re-upload can silently unpublish a post~~ | ✅ Fixed 2026-10-19 | |
| TD-8 | Vestigial PDF loader rules, `pdf.d.ts`, `src/**` include, dead `ComingSoon`, unused SVGs | Noise | P1-6 |
| TD-9 | The font utilities don't exist | Off-brand typography | P0-2 |
| ~~TD-10~~ | ~~`schema.sql` is not idempotent~~ | ✅ Fixed 2026-10-19 | |
