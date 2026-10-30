<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — start here

This is the entry point for AI coding agents. Claude Code loads it through `CLAUDE.md` (`@AGENTS.md`); most other agents read it automatically. Read this whole file first, then open only the doc your task needs. This file stays short on purpose. The details are in the linked docs.

_Last verified against the code: **2026-10-21**, branch `security-sweep` (on top of `feb294a`); see SECURITY.md §8 for the sweep._

---

## 1. The project in one paragraph

`portfoliomkv` is the personal portfolio site of **Jorge Alejandro Vilanova Alvarado**, branded **JAVA.dev**, live at **https://javastudios.netlify.app**. It is built on Next.js **16.3.8** (App Router), React **19.2**, TypeScript (strict), and Tailwind CSS **4**, with Supabase Postgres as the backend and Netlify for hosting. There are five public pages: Home, Work, About, Blog (with `/blog/[slug]` post pages), and Contact. There are two private, password-gated pages: **`/studio`**, a CMS for blog posts and projects, and **`/logistics`**, a visitor-analytics dashboard. Public reads go straight from the browser to Supabase using the **anon key**, and Row Level Security limits them to published rows. All writes and private reads go through **`app/api/*` route handlers** that use the **service-role key**. Separately, an external automation pushes project docs to `/api/docs/upload` and emails summaries through `/api/email-summary`.

## 2. Doc map: read the one you need

| If you are… | Read |
|---|---|
| Deciding what to build next, or checking whether a feature already exists | [PRD.md](PRD.md): feature inventory, requirements, **prioritized roadmap** |
| Touching data flow, API routes, Supabase tables, env vars, or deployment | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Building or restyling any UI | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| Touching auth, API input handling, markdown rendering, headers, or secrets | [SECURITY.md](SECURITY.md) |
| Writing any code at all | [CODE_STYLE.md](CODE_STYLE.md) |
| Adding or changing tests, or verifying a change | [TESTING.md](TESTING.md) |
| Setting up locally, or wanting the human-oriented overview | [README.md](README.md) |
| Looking for the historical daily status log | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md): written by an external automation, **stale since 2026-08-05** |

**When sources disagree, trust them in this order: code, then these docs, then PROJECT_OVERVIEW.md.** If a doc is wrong, fix it in the same change.

## 3. Commands and current baseline

```bash
npm run dev          # dev server (Turbopack) → http://localhost:3000
npm test             # Jest, all suites
npx tsc --noEmit     # type-check (strict)
npm run lint         # ESLint flat config. `next build` does NOT lint in Next 16
npm run build        # production build. Needs Supabase env vars (see §6)
```

| Check | Result on 2026-10-21 |
|---|---|
| `npm test` | ✅ **554 tests, 29 suites** (incl. two jsdom component suites), about 7 s |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ clean |
| `npm run build` | ✅ (Next 16.3.8) |
| `npm audit --omit=dev` | ✅ 0 critical/high (1 accepted moderate: `sprintf-js`, see SECURITY.md S-16) |

If you run these checks, update this table.

## 4. Non-negotiable rules

1. **Read the bundled Next.js 16 docs before using a Next API.** The differences that matter most in this repo:
   - `params` and `searchParams` are **Promises**, so always `await params` (example: `app/blog/[slug]/layout.tsx`). The same applies to `cookies()`, `headers()`, and `draftMode()`.
   - `middleware.ts` has been renamed to **`proxy.ts`**, which exports a function named `proxy` and runs on Node only. The repo has none yet.
   - Turbopack is the default bundler. `next lint` is gone, so use `npm run lint`.
   - Guides: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`, `.../02-guides/content-security-policy.md`, `.../03-api-reference/03-file-conventions/proxy.md`.
2. **Never import `lib/supabase-admin.ts` into client code.** That means any file with `"use client"`, or anything such a file imports. The service-role key bypasses RLS.
3. **Every API route that writes data or reveals private data must authenticate.** Admin routes call `const denied = await checkAdminAuth(req)` from `lib/admin-auth.ts`. It handles the session cookie, CSRF, the shared `admin-password` lockout, the legacy `x-logistics-key` header, and 2FA. Machine routes (`x-api-key`) run four steps:
   1. `getClientIp`.
   2. `await isAuthBlocked(ROUTE, ip)` from `lib/auth-lockout.ts`.
   3. `safeEqual(header, process.env.SECRET)`, failing closed if the env var is unset.
   4. `await recordAuthFailure(ROUTE, ip)`, **only when a key was sent**.

   Read bodies with `readJsonBody` / `readBodyText` from `lib/http.ts` (byte-capped, 413), never `req.json()`. Copy from `app/api/projects/route.ts` or `app/api/blog/upload/route.ts`.
4. **Validate every request field** with `lib/validation.ts` helpers and `LIMITS`. Require `isJsonObject(body)` before destructuring, and `isUuid` for row ids. On PATCH, build an explicit field whitelist. Never spread a request body into a Supabase call.
5. **Never leak DB or provider errors to clients.** Log `console.error("[route] context:", message)` and return a generic `{ error: "Database error" }` with status 500.
6. **Render user markdown only through `components/ui/MarkdownRenderer.tsx`.** The plugin order is `rehypeRaw`, then `rehypeSanitize`, then `rehypeHighlight`, and a test enforces it. Any change that widens `lib/markdown-sanitize.ts` needs a test. **JSON-LD goes through `serializeJsonLd()`** (`lib/json-ld.ts`), never `JSON.stringify` inside `dangerouslySetInnerHTML`. Never enable `eval`-capable parsers, such as gray-matter's JS front-matter engine.
7. **Don't add a root `babel.config.js`.** It would switch Next.js off SWC. Jest's Babel config lives inline in `jest.config.js`.
8. **A new Supabase table means** a new `supabase/<name>-schema.sql` file with RLS **enabled** and unneeded anon/authenticated grants revoked, plus matching lines in `supabase/security-hardening.sql` and an entry in the ARCHITECTURE.md data model.
9. **Never commit or print secrets.** `.env*` is gitignored. When you need env var names, list names only.
10. **Don't commit, push, or run destructive DB operations unless the user asks.** The branch is `main` and the remote is `github.com/JorgeVilano500/PortfolioMkV`.
11. Before calling work done, run `npm test`, `npx tsc --noEmit`, and `npm run lint`. For UI changes, also walk through the manual QA in [TESTING.md §7](TESTING.md#7-manual-qa-checklist-ui-changes).

## 5. Where things live

```
app/                      routes (App Router)
  page.tsx                Home (server shell that renders the client HomeComponent)
  work/ about/ contact/   public pages (client) + layout.tsx files that carry metadata
  blog/ blog/[slug]/      blog list + post page (client), server layout for metadata/JSON-LD, OG image
  studio/                 🔒 CMS: page.tsx (AdminGate + tabs), layout.tsx (noindex), BlogsPanel, ProjectsPanel, ProjectWizardModal, shared.tsx (icons)
  logistics/              🔒 analytics dashboard: page.tsx (AdminGate + Dashboard), layout.tsx (noindex)
  api/                    route handlers: auth (session sign-in/out), analytics/{track,stats}, blog/{posts,upload}, projects, docs/upload, email-summary
  layout.tsx              root layout: Geist fonts, Person JSON-LD, <OnboardingProvider> wrapping PageTracker, pages,
                          SiteFooter, IntroModal, TourSpotlight, Toast
  privacy/page.tsx        privacy & cookie policy (server component; generated from lib/consent constants)
  robots.ts sitemap.ts opengraph-image.tsx
components/               index.tsx barrel · ui/* (Navbar, Home, WorkComponent, ProjectList, MarkdownRenderer, PageTracker, ComingSoon†) · features/Modal, features/AdminGate (password gate + sign-out)
  onboarding/             first-visit intro + consent + guided tour: OnboardingProvider (state), IntroModal, SitePreviews,
                          TourToolbar, TourSpotlight, SiteFooter, Toast, PrivacyActions, useFocusTrap
lib/                      supabase (anon) · supabase-admin (service role) · blog · projects-data (Supabase) · projects (hard-coded, used only by /work)
                          security · rate-limit · auth-lockout (shared lockout) · http (byte-capped bodies) · validation
                          markdown-sanitize · session · two-factor (emailed code) · admin-auth · json-ld
                          consent (cookie model) · tour (steps) · analytics (shared rules) · theme · user-agent · random-id · supabase-errors
supabase/*.sql            schema for posts, projects, page_views, project_documents, consent-schema.sql (consent_events + page_views
                          opt-in columns) + security-hardening.sql (run once on an existing DB) + auth-lockout-schema.sql
                          (shared lockout) + audit-exposure.sql (read-only project audit)
app/.well-known/security.txt/route.ts   RFC 9116 vulnerability-disclosure contact
__tests__/                Jest suites + helpers/ (test-utils.ts Supabase chain mock, setup-env.ts, server-only.ts stub)
```
† `ComingSoon` is dead code.

## 6. Gotchas that will bite you

- **Two project data sources.** Home reads the Supabase `projects` table, which Studio edits. `/work` reads the **hard-coded** `lib/projects.ts`, so projects edited in Studio **do not appear on `/work`**. Migrating `/work` is roadmap item P1-1 in PRD.md.
- **The `font-syne` and `font-dm` classes compile to nothing.** `postcss.config.mjs` contains a Tailwind v3-style `theme.extend` that Tailwind 4 ignores, and `globals.css` never registers those fonts. As a result, most pages render in **Arial** and Home renders in **Geist**. The unused Google Fonts `<link>` was removed for privacy and CSP (SECURITY.md S-11), so the fix is `next/font` (DESIGN_SYSTEM.md §3).
- **Analytics are opt-in, and the server enforces it.** `/api/analytics/track` stores nothing unless the request carries a current `java_consent` cookie with analytics on (`lib/consent.ts`). The browser's `PageTracker` also waits for consent. Never add tracking that bypasses `allowsAnalytics()`. If you change what is collected, bump `CONSENT_VERSION` (everyone is asked again) and update `ANALYTICS_DATA_POINTS`, which both the modal and `/privacy` render.
- **Tour steps live in `lib/tour.ts`** and spotlight elements marked `data-tour="…"`. A test fails if a step's target anchor disappears from the source, so move the attribute when you restructure a page.
- **Layering (z-index):** spotlight 45 · highlighted nav tab 46 · tour bar 47 · docked tour bar 48 · mobile drawer 55 · intro modal 60 · toast 70. Keep new overlays inside this scale.
- **Admin auth is a session cookie.** `/studio` and `/logistics` share one password (`LOGISTICS_PASSWORD`), which `<AdminGate>` sends once to `POST /api/auth`. That returns an HttpOnly session cookie (8 h) that the browser attaches to same-origin `fetch` calls automatically. It is named `__Host-admin_session` in production and `admin_session` in dev, so always use the `SESSION_COOKIE` constant. With `ADMIN_2FA=email`, the password step is followed by an emailed 6-digit code (`lib/two-factor.ts`), and `x-logistics-key` is refused. **Don't** add `x-logistics-key` headers or store the password client-side. Changing `LOGISTICS_PASSWORD` signs everyone out.
- **Server-only modules stay server-only.** Any `lib/` file that reads a secret or imports `supabase-admin` starts with `import "server-only"`. `__tests__/server-boundary.test.ts` fails if a `"use client"` file can reach one through its imports.
- **Cookie-authenticated writes must be same-origin.** `checkAdminAuth` returns 403 when `Sec-Fetch-Site`/`Origin` says the request came from another site, so call admin APIs only from this app's pages.
- **The analytics skip-list is duplicated** in `components/ui/PageTracker.tsx` (`SKIP_PREFIXES`) and `app/api/analytics/track/route.ts` (`BLOCKED_PREFIXES`). Change both or neither.
- **Types and helpers are duplicated:** `Post` (in `lib/blog.ts` and `app/studio/BlogsPanel.tsx`), `Project` (in `lib/projects-data.ts` and `app/studio/ProjectsPanel.tsx`), `slugify` (in `lib/validation.ts` and `BlogsPanel.tsx`, and the two behave slightly differently), and the theme colour maps (in `lib/blog.ts` and `lib/projects-data.ts`).
- **A missing Supabase env var throws at import time.** `lib/supabase.ts` calls `createClient("")`, which throws `supabaseUrl is required.`. `sitemap.ts` fetches posts, so `next build` fails without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Public pages are client-rendered.** Blog post bodies are fetched in the browser, so they are not in the server HTML. Metadata, JSON-LD, and OG images are server-rendered.
- **Rate limiting is in-memory per serverless instance** (best-effort). It is keyed on Netlify's `x-nf-client-connection-ip`, falling back to `x-forwarded-for` off-Netlify, and has a global per-route failure ceiling. See SECURITY.md §4.3.
- **The live DB may lag the schema files.** Agents can't run DDL; the owner runs SQL files in the Supabase SQL editor. `security-hardening.sql` has been run (S-1 confirmed fixed on 2026-10-21). `auth-lockout-schema.sql` (the shared lockout, S-4) may not have been yet. Until it is, `lib/auth-lockout.ts` falls back to in-memory counting and warns once.
- **`/sitemap.xml` is static** (build output `○`), so new posts appear in it only after a redeploy.
- **Keep `turbopackFileSystemCacheForBuild: false`** in `next.config.ts`. Next 16.3+ would otherwise cache env var values in `.next/cache/turbopack`, and Netlify's secrets scan fails the deploy ("RESEND_API_KEY exposed"). If a deploy ever fails a secrets scan, find the file the Netlify log names before changing any setting. Don't add secret names to `SECRETS_SCAN_OMIT_KEYS`.
- There are no `error.tsx`, `not-found.tsx`, or `loading.tsx` files anywhere, so unknown routes get the default Next 404.
- `next.config.ts` has Turbopack and webpack rules for `*.pdf` that reference `file-loader`, which is **not installed**. Nothing imports a PDF (`/resume.pdf` is served from `public/`), so the rules and `pdf.d.ts` are vestigial.
- **`PROJECT_OVERVIEW.md` is maintained by an external daily-status automation**, the same one that calls `/api/docs/upload` and `/api/email-summary`. It still mentions `/blog-editor` (since renamed to `/studio`) and calls `ProjectList` dead (Home now uses it). Don't treat it as current.

## 7. Next best actions (summary)

The full prioritized list, with acceptance criteria, is in [PRD.md §7](PRD.md#7-roadmap-next-best-actions). The top items:

1. **Owner actions, outside the repo:**
   - Merge the `security-sweep` PR and deploy.
   - Run `supabase/auth-lockout-schema.sql` (S-4) and the read-only `supabase/audit-exposure.sql` (S-23).
   - Set `ADMIN_2FA=email` in Netlify (S-6).
   - Rotate `LOGISTICS_PASSWORD` (S-12), and optionally set `SESSION_SECRET`.
   - Review Supabase sign-ups and storage buckets (S-23), and decide whether the repo stays public (S-37).
   - Decide an analytics retention window (S-5), since IP addresses are now stored for visitors who opt in.
2. **P0 quick fixes still open:** the font registration (P0-2); the About page's `font-white/65` typo; the Contact page's Instagram `href="#"`.
3. **P1-1:** move `/work` onto the Supabase `projects` table and retire `lib/projects.ts`.
4. **P1-2:** add CI (GitHub Actions: lint, tsc, test). The baseline is now green, so CI can start green.
5. **P1-3:** add `not-found.tsx` and `error.tsx`. The `noindex` half is done.
6. **P1-4:** server-render the blog list and post pages for SEO.
7. **Security follow-ups:** a nonce-based CSP to drop `'unsafe-inline'` scripts (S-7, PRD P2-4), and a retention job (S-5). The second factor (S-6) and the shared lockout store (S-4) are built and need only the owner actions in item 1.

## 8. Keeping these docs true

When your change touches an area, update the matching doc in the same change:

- New or changed route, table, or env var: update ARCHITECTURE.md (and README.md's env table).
- New UI pattern, colour, or component: update DESIGN_SYSTEM.md.
- A change to auth, validation, headers, or sanitize: update SECURITY.md.
- A feature shipped, or a roadmap item started or finished: update the status in PRD.md and add a line to the PRD.md change log.
- A changed test count or check result: update §3 above and TESTING.md §3.
- Bump the "Last verified" date at the top of each doc you touched.
