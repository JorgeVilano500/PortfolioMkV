# Portfolio mkV — Project Overview

_Last updated: 2026-07-09_

## What this is

`portfoliomkv` is Alejandro's personal portfolio site (mkV, the current active version — the prior iteration lives in the sibling `PortfolioMkIV` folder for reference only). Built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind 4. Covers Home, About, Work, Blog, and Contact pages, backed by a Supabase-driven blog system with an in-browser password-gated editor, a visitor-analytics pipeline surfaced on a password-gated `/logistics` dashboard, and an email-summary endpoint (Resend-powered) used for daily status reports like this one. Deployed at `javastudios.netlify.app`.

## Tech stack

- Next.js 16 / React 19 / TypeScript
- Tailwind CSS 4 (`@tailwindcss/postcss`)
- Supabase (`@supabase/supabase-js`) — Postgres backing the blog (`posts` table) and analytics (`page_views` table)
- Resend (`resend`) — transactional email for `/api/email-summary`
- `gray-matter` — YAML frontmatter parsing for markdown blog uploads
- `react-markdown` + `remark-gfm` + `rehype-highlight` + `rehype-raw` — blog post rendering
- `react-icons`
- Deployed on Netlify (despite README's default Vercel-deploy boilerplate — that section is unedited create-next-app leftover)

## Project structure

```
app/
  page.tsx                  — Home
  about/, work/, contact/   — static-ish pages, each with layout.tsx
  blog/                     — blog list (page.tsx) + blog/[slug] detail
  blog-editor/              — password-gated CRUD editor for posts
  logistics/                — password-gated analytics dashboard
  api/
    blog/posts/route.ts     — CRUD for posts (x-logistics-key auth)
    blog/upload/route.ts    — markdown+frontmatter upload webhook (x-api-key auth, BLOG_UPLOAD_SECRET)
    email-summary/route.ts  — sends a pre-built subject/text/html via Resend (x-api-key auth, EMAIL_SUMMARY_SECRET)
    analytics/track/route.ts  — records page views to Supabase
    analytics/stats/route.ts  — aggregated stats for /logistics (x-logistics-key auth)
    docs/upload/route.ts      — NEW (untracked): project markdown doc sync, upserts into `project_documents` (x-api-key auth, DOCS_UPLOAD_SECRET)
  robots.ts, sitemap.ts, opengraph-image.tsx — SEO
components/
  index.tsx                 — barrel export
  ui/Navbar.tsx, Home.tsx, WorkComponent.tsx, ProjectList.tsx (unused), ComingSoon.tsx (unused), MarkdownRenderer.tsx, PageTracker.tsx
  features/Modal.tsx
lib/
  supabase.ts, supabase-admin.ts, projects.ts, blog.ts
  rate-limit.ts, security.ts, validation.ts, markdown-sanitize.ts  — security-pass additions
supabase/
  schema.sql            — posts table + RLS (public read of published posts)
  analytics-schema.sql  — page_views table (service-role only, RLS disabled)
  documents-schema.sql  — NEW (untracked): project_documents table (RLS enabled, no policies — service-role only)
public/
  assets/ (currently empty), resume.pdf, favicon/svg icons
__tests__/              — 11 Jest suites (181 tests) + helpers/test-utils.ts
jest.config.js, SECURITY.md
```

No `middleware.ts`, no CI config observed.

## Current status

**Built:** full page set (Home/About/Work/Blog/Contact); Supabase-backed blog with password-gated in-browser editor and a markdown-upload webhook (e.g. for an iPhone Shortcut); visitor analytics tracked via `PageTracker` and viewable on a password-gated `/logistics` dashboard (top pages, referrers, device split, bounce rate, daily views, peak hours); this email-summary endpoint itself; a new docs-sync endpoint (`/api/docs/upload`) that upserts markdown docs like this tracker into a `project_documents` table, latest-only per project+filename; SEO basics (robots, sitemap, OG image); static resume PDF.

**Fixed 2026-07-06 (security pass — see `SECURITY.md` for full detail):**
- ~~No automated tests~~ → now 181 Jest tests across 11 suites (`npm test`), up from 166/10.
- ~~No security headers~~ → CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS via `next.config.ts` `headers()`.
- ~~No rate limiting~~ → `lib/rate-limit.ts`: 30 req/min/IP on `analytics/track`, 10-failures/15-min lockout on all authed routes (now five, including `docs/upload`), 10 sends/hour cap on `email-summary`. (In-memory — best-effort on serverless; a hard guarantee needs a shared store, see SECURITY.md.)
- ~~No timing-safe comparison~~ → all secret checks use `crypto.timingSafeEqual` via `lib/security.ts`, failing closed when the env secret is unset.
- ~~Password gates without lockout~~ → failed attempts on the backing endpoints now lock the IP out (429).
- Also closed: stored-XSS via `rehype-raw` (new `rehype-sanitize` allowlist in `lib/markdown-sanitize.ts`), mass assignment on posts PATCH, unsanitized upload-webhook slugs, DB/provider error leakage, password-gate hang on network error, `/blog-editor` leaking into analytics, `package.json` misnamed `portfoliomkiv`.

**Stubbed / missing:**
- `ComingSoon` **and** `ProjectList` components built but never imported anywhere in `app/` — two dead exports (fourth consecutive report).
- `RESEND_FROM_EMAIL` still the default `onboarding@resend.dev` sandbox sender — no verified domain, so Resend can currently only deliver to the account's own signup address. (Needs Resend dashboard + DNS — see SECURITY.md.)
- `public/assets/` is empty — no custom brand imagery beyond the generated OG image.
- Rate limiting is in-memory only — best-effort on serverless; hard guarantee needs a shared store (see SECURITY.md).
- No CI — the 181 Jest tests exist but nothing runs them automatically on push.
- New: the docs-upload endpoint, its schema, and its tests are built but not yet committed to git.

**Changed today (2026-07-09):** No new git commits since `cf525ac` (2026-07-06) — still 16 commits. But real uncommitted work landed in the working tree: `app/api/docs/upload/route.ts`, `supabase/documents-schema.sql`, and `__tests__/api-docs-upload.test.ts` — a full docs-sync feature (auth, validation, rate-limit lockout, Supabase upsert into a new `project_documents` table) built with the same hardened pattern as the other routes. This is the endpoint this very report used for its Supabase sync step today. Test suite grew 166 → 181 tests (10 → 11 suites), all passing. PortfolioMkIV sibling still inactive (last commit 2026-06-15).

## Data model notes

- `posts` (Supabase): `id, title, slug (unique), excerpt, content, tags[], cover_emoji, theme (purple|green|pink), reading_time, published, created_at, updated_at`. RLS enabled — public `select` allowed only where `published = true`; all writes go through the service-role key via API routes.
- `page_views` (Supabase): `id, page, referrer, user_agent, session_id, is_new_visitor, load_time, screen_width, created_at`. RLS disabled entirely — table is never touched by the anon key, only by service-role API routes. No stated retention/cleanup policy — rows accumulate indefinitely.
- `project_documents` (Supabase, new): `id, project_slug, filename, title, content, content_hash (sha256), source, created_at, updated_at`, unique on `(project_slug, filename)` — latest-only, upserted by `/api/docs/upload`. RLS enabled with no policies (service-role only, anon gets zero access). Low retention risk since it's upsert-only, not an append log.
- No `context/`-style client state modules exist in this app (that pattern was specific to the Photo Swiper project) — state here is mostly server-driven (Supabase) plus local component `useState`.

## API keys / secrets

All secrets live in `.env.local` (gitignored via `.env*` in `.gitignore` — confirmed not committed):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase client config.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used by `lib/supabase-admin.ts`.
- `BLOG_UPLOAD_SECRET` — auth for `/api/blog/upload`.
- `LOGISTICS_PASSWORD` — auth for `/logistics` dashboard and `/api/blog/posts`, `/api/analytics/stats` (sent as `x-logistics-key`).
- `ANALYTICS_EXCLUDED_IPS` — comma-separated IP allowlist to silently drop from analytics.
- `NEXT_PUBLIC_SITE_URL` — canonical site URL, currently `javastudios.netlify.app`.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — Resend email config (from-address still unverified sandbox default).
- `SUMMARY_RECIPIENT_EMAIL` — delivery target for `/api/email-summary`.
- `EMAIL_SUMMARY_SECRET` — auth for `/api/email-summary` (used by this reporting workflow).
- `DOCS_UPLOAD_SECRET` — new — auth for `/api/docs/upload` (used to sync this tracker to Supabase).

No secret values are stored in this file — names/purposes only.

## Recommended workflow / next steps

1. Commit the docs-upload endpoint, schema, and tests — currently untracked in the working tree, now confirmed working end to end via today's sync.
2. Verify a custom sending domain in Resend and update `RESEND_FROM_EMAIL` — biggest remaining SECURITY.md item.
3. Add a GitHub Actions workflow that runs `npm test` on every push — the 181 tests only pay off if they run automatically.
4. Decide the fate of `ComingSoon` and `ProjectList` — check first whether `ProjectList` is a half-finished Work-page refactor, then wire in or delete.
5. Move rate limiting to a shared store (e.g. Upstash Redis free tier) so lockouts hold across serverless instances.
6. Add a `page_views` retention policy (e.g. scheduled delete of rows older than 90 days) plus a short privacy blurb on the site.
7. Populate `public/assets/` with real brand imagery, or remove the empty folder.

## Design to-do list

- `ComingSoon` **and** `ProjectList` both unused — apply to real UI or delete (two dead exports now).
- `public/assets/` empty — no custom screenshots/social-preview art beyond the generated OG image.
- `Home.tsx` uses muted/dashed styling ("opacity-50 border-dashed") for some project grid slots — confirm intentional vs. leftover.
- No design pass yet on loading/error states for the blog editor or logistics dashboard beyond the password gate.

## Brainstormed ideas backlog

- RSS feed (`feed.xml`) for the blog — cheap add since posts already live in Supabase.
- Per-post "views" or "reactions" counter using the existing `posts` table.
- Sanitized public version of `/logistics` as a portfolio flex (totals/uptime-style stats only), keeping the detailed dashboard private.
- Site-wide theme extension — blog posts already have per-post accent themes (purple/green/pink); extend that palette system site-wide with a toggle.
- Cmd+K command palette for quick nav between Work/Blog/About/Contact.
- Tie a "site redeployed" notification into the existing Resend/email-summary wiring.
- Automated Lighthouse/performance check as part of this daily report, once tests exist.
- One-time-code email step (via existing Resend setup) as a second factor before treating `/logistics` as production-grade admin surface.
- Investigate whether `ProjectList` is actually a half-finished refactor of the Work page grid rather than pure dead code, before deleting it.
- Lightweight "last deployed" badge in the footer, sourced from a Netlify build hook or a git SHA baked in at build time.
- A tiny `/api/health` route (checks Supabase connectivity) as groundwork before adding real uptime monitoring.
- Dark/light mode toggle, using the existing per-post accent theme system as a base for a broader site-wide palette.
- Keyboard shortcut cheatsheet or light onboarding tooltip for the blog editor, since it's a fairly dense custom CRUD UI.
- Turn this tracker's Change Log into its own public "now"/changelog page as a subtle portfolio flex.
- Basic uptime check (e.g. a free monitor pinging the homepage every few minutes) feeding into this daily report.
- Image optimization audit — confirm `next/image` is used consistently once `public/assets/` gets populated.
- GitHub Actions badge in the README once CI exists — cheap credibility given the test suite already built. _(added 2026-07-08)_
- JSON-LD structured data (BlogPosting schema) on blog detail pages for richer search results. _(added 2026-07-08)_
- Per-post OG images (dynamic `opengraph-image.tsx` under `blog/[slug]`) instead of one site-wide image. _(added 2026-07-08)_
- Reading-progress bar on blog detail pages. _(added 2026-07-08)_
- CSV export button on `/logistics` for pulling analytics into a spreadsheet. _(added 2026-07-08)_
- Scheduled/draft publishing: a `publish_at` column on `posts`, queueable from the editor. _(added 2026-07-08)_
- A `/uses` or `/now` page — low-effort content portfolio reviewers actually read. _(added 2026-07-08)_
- Netlify deploy-succeeded webhook → email-summary endpoint for deploy pings. _(added 2026-07-08)_
- Small internal "aggregator" page reading across all synced `project_documents` rows (multiple projects, one dashboard) — hinted at in the schema comment itself. _(added 2026-07-09)_
- Use the new `content_hash` column to skip sending the daily email when nothing's changed since yesterday. _(added 2026-07-09)_
- A `security.txt` file (RFC 9116) at `/.well-known/security.txt`, repurposing what's already in `SECURITY.md`. _(added 2026-07-09)_
- Tag-based filtering UI on the blog list page — `posts.tags[]` already exists, just needs a filter control. _(added 2026-07-09)_
- "Recently updated" badge on blog posts whose `updated_at` is within the last N days. _(added 2026-07-09)_
- Manual "sync now" trigger (authenticated button or curl one-liner) so docs-upload changes don't have to wait for the daily schedule to test. _(added 2026-07-09)_

## Legal & personal concerns

- Analytics (`page_views`) stores `session_id`, `referrer`, `user_agent`, `screen_width`, `load_time` indefinitely with no stated retention policy or visible privacy notice on the site. If publicly reachable, GDPR/UK-GDPR can apply to EU/UK visitors regardless of hosting location — worth a short privacy blurb if this stays public.
- The new `project_documents` table is low-risk by design — upsert-only, one row per project+filename, no unbounded accumulation.
- Secrets handling looks correct — `.env*` gitignored; `DOCS_UPLOAD_SECRET` present locally and used successfully in today's sync.
- `/logistics` and `/blog-editor` each rely on one static password — brute-force lockout added 2026-07-06, but if the password leaks there's still no second factor (see SECURITY.md item 3).
- (Not legal advice — flagging for your own judgment on privacy-policy language while analytics keep running.)

## Change log

- 2026-07-09 — No new git commits (still 16, `cf525ac` latest), but a full docs-sync feature landed uncommitted: `/api/docs/upload` route, `supabase/documents-schema.sql`, and a new test suite (166→181 tests, 10→11 suites). This is the endpoint used to sync this very tracker today — confirmed working end to end. Recommend committing it next. Sent daily status email successfully (`{"success":true}`).
- 2026-07-08 — Security pass now committed: new commit `cf525ac Test suites added` (07-06 evening) landed all tests, SECURITY.md, security libs, hardened routes, headers, and this tracker — repo at 16 commits, tree clean. No commits 07-07/07-08. Still open: Resend domain, dead `ComingSoon`/`ProjectList`, empty `public/assets/`, CI, shared rate-limit store. Sent daily status email successfully (`{"success":true}`).
- 2026-07-06 (security pass) — Full audit + fixes: timing-safe auth on all four routes, brute-force lockout + rate limiting, security headers/CSP, rehype-sanitize XSS protection for blog markdown, input validation + PATCH whitelisting, generic error responses, password-gate error-handling bug fix, `/blog-editor` analytics exclusion, package renamed `portfoliomkv`. Added Jest (Babel transform, `jest.config.js`) with 166 tests across 10 suites — run with `npm test`. New deps: `rehype-sanitize`; dev: `jest`, `@types/jest`, `babel-jest`, `@babel/core`, `@babel/preset-env`, `@babel/preset-typescript`. Items that need outside action (Resend domain verification, distributed rate-limit store, `page_views` RLS + retention policy, secret rotation, real auth/2FA, nonce-based CSP) are documented in `SECURITY.md`.
- 2026-07-06 — No new commits since 2026-07-04 (still 15 commits, last commit `23ba027`). New finding: `ProjectList` is also unused/dead code alongside `ComingSoon`. `PROJECT_OVERVIEW.md` itself confirmed still uncommitted (staged only). PortfolioMkIV sibling inactive since 2026-06-15. Sent daily status email successfully (`{"success":true}`).
- 2026-07-04 — Initial snapshot. First-ever report/tracker for this project (portfoliomkv). Confirmed live at javastudios.netlify.app, 15 commits, working tree clean. Flagged: no rate limiting/security headers, static (non-timing-safe) secret checks, unverified Resend sending domain, unused `ComingSoon` component, empty `public/assets/`. Sent first daily status email successfully (`{"success":true}`).
