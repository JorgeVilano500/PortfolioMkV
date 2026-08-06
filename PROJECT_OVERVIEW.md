# Portfolio mkV — Project Overview

_Last updated: 2026-08-05_

## What this is

`portfoliomkv` is Alejandro's personal portfolio site (mkV, the current active version — the prior iteration lives in the sibling `PortfolioMkIV` folder for reference only). Built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind 4. Covers Home, About, Work, Blog, and Contact pages, backed by a Supabase-driven blog system with an in-browser password-gated editor, a visitor-analytics pipeline surfaced on a password-gated `/logistics` dashboard, and an email-summary endpoint (Resend-powered) used for daily status reports like this one. Deployed at `javastudios.netlify.app`.

## Tech stack

- Next.js 16 / React 19 / TypeScript
- Tailwind CSS 4 (`@tailwindcss/postcss`)
- Supabase (`@supabase/supabase-js`) — Postgres backing the blog (`posts` table), analytics (`page_views` table), and synced docs (`project_documents` table)
- Resend (`resend`) — transactional email for `/api/email-summary`
- `gray-matter` — YAML frontmatter parsing for markdown blog uploads
- `react-markdown` + `remark-gfm` + `rehype-highlight` + `rehype-raw` + `rehype-sanitize` — blog post rendering
- `react-icons`
- Deployed on Netlify (despite README's default Vercel-deploy boilerplate — that section is unedited create-next-app leftover)

No new dependencies since the last report (`package.json` unchanged).

## Project structure

```
app/
  page.tsx                  — Home
  about/, work/, contact/   — static-ish pages, each with layout.tsx
  blog/                     — blog list (page.tsx) + blog/[slug] detail
  blog-editor/              — password-gated CRUD editor for posts (major rewrite 2026-07-15 — sort/filter/bulk-select)
  logistics/                — password-gated analytics dashboard
  api/
    blog/posts/route.ts     — CRUD for posts (x-logistics-key auth); GET attaches per-post view_count, DELETE supports bulk {ids: [...]}
    blog/upload/route.ts    — markdown+frontmatter upload webhook (x-api-key auth, BLOG_UPLOAD_SECRET)
    email-summary/route.ts  — sends a pre-built subject/text/html via Resend (x-api-key auth, EMAIL_SUMMARY_SECRET)
    analytics/track/route.ts  — records page views to Supabase
    analytics/stats/route.ts  — aggregated stats for /logistics (x-logistics-key auth)
    docs/upload/route.ts      — project markdown doc sync, upserts into `project_documents` (x-api-key auth, DOCS_UPLOAD_SECRET)
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
  documents-schema.sql  — project_documents table (RLS enabled, no policies — service-role only)
public/
  assets/ (currently empty), resume.pdf, favicon/svg icons
__tests__/              — 11 Jest suites, 186 tests (confirmed via fresh `npm test` run 2026-08-05, up from 181 last confirmed 07-09) + helpers/test-utils.ts
jest.config.js, SECURITY.md
```

No `middleware.ts`, no CI config observed (still no `.github/workflows`).

## Current status

**Built:** full page set (Home/About/Work/Blog/Contact); Supabase-backed blog with password-gated in-browser editor (sort/search/tag/status filters, bulk-select with confirm-before-delete, per-post view counts) and a markdown-upload webhook; visitor analytics tracked via `PageTracker` and viewable on a password-gated `/logistics` dashboard (top pages, referrers, device split, bounce rate, daily views, peak hours); this email-summary endpoint itself; a docs-sync endpoint (`/api/docs/upload`) that upserts markdown docs like this tracker into a `project_documents` table, latest-only per project+filename; SEO basics (robots, sitemap, OG image); static resume PDF.

**Changed today (2026-08-05):** No new commits since `8ceab29` (2026-07-15) — repo has now been quiet for 21 days, working tree clean aside from this file. The substantive update today is a confirmation, not a code change: ran a full fresh `npm test` and it completed cleanly — **186 tests passed across 11 suites**, resolving the "not freshly re-verified" flag from the 07-29 report (that count reflects the 07-15 blog-editor rewrite's added coverage for view-count and bulk-delete behavior). PortfolioMkIV sibling still inactive (last commit 2026-06-15).

**Stubbed / missing:**
- `ComingSoon` **and** `ProjectList` components built but never imported anywhere in `app/` — two dead exports (sixth consecutive report).
- `RESEND_FROM_EMAIL` still the default `onboarding@resend.dev` sandbox sender — no verified domain, so Resend can currently only deliver to the account's own signup address. (Needs Resend dashboard + DNS — see SECURITY.md.)
- `public/assets/` is still empty — no custom brand imagery beyond the generated OG image.
- Rate limiting is in-memory only — best-effort on serverless; hard guarantee needs a shared store (see SECURITY.md).
- No CI — 186 Jest tests exist and pass, but nothing runs them automatically on push.
- `view_count` is currently only surfaced inside `/blog-editor` — not yet shown on the public blog list/detail pages.

## Data model notes

- `posts` (Supabase): `id, title, slug (unique), excerpt, content, tags[], cover_emoji, theme (purple|green|pink), reading_time, published, created_at, updated_at`. RLS enabled — public `select` allowed only where `published = true`; all writes go through the service-role key via API routes. `view_count` is not a stored column — it's computed at request time in `GET /api/blog/posts` by counting matching `page_views` rows.
- `page_views` (Supabase): `id, page, referrer, user_agent, session_id, is_new_visitor, load_time, screen_width, created_at`. RLS disabled entirely — table is never touched by the anon key, only by service-role API routes. No stated retention/cleanup policy — rows accumulate indefinitely. Also read (not just written) by the blog-posts route to compute view counts.
- `project_documents` (Supabase): `id, project_slug, filename, title, content, content_hash (sha256), source, created_at, updated_at`, unique on `(project_slug, filename)` — latest-only, upserted by `/api/docs/upload`. RLS enabled with no policies (service-role only, anon gets zero access). Low retention risk since it's upsert-only, not an append log.
- No `context/`-style client state modules exist in this app — state here is mostly server-driven (Supabase) plus local component `useState` (the blog-editor rewrite added a fair amount of local state: search/status/tag/sort filters, bulk-select set, modal state).

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
- `DOCS_UPLOAD_SECRET` — auth for `/api/docs/upload` (used to sync this tracker to Supabase).

No secret values are stored in this file — names/purposes only.

## Recommended workflow / next steps

1. Get a commit landed — even something small — to break the 21-day streak of silence since `8ceab29` (2026-07-15).
2. Decide the fate of `ComingSoon` and `ProjectList` — six reports running now. Wire in or delete.
3. Verify a custom sending domain in Resend and update `RESEND_FROM_EMAIL` — still the biggest remaining SECURITY.md item.
4. Add a GitHub Actions workflow that runs `npm test` on every push, now that there are 186 passing tests worth protecting.
5. Surface `view_count` publicly (blog list/detail pages) now that the server-side plumbing exists — currently editor-only.
6. Move rate limiting to a shared store (e.g. Upstash Redis free tier) so lockouts hold across serverless instances.
7. Add a `page_views` retention policy (e.g. scheduled delete of rows older than 90 days) plus a short privacy blurb on the site.
8. Populate `public/assets/` with real brand imagery, or remove the empty folder.

## Design to-do list

- `ComingSoon` **and** `ProjectList` both unused — apply to real UI or delete (two dead exports, six reports running).
- `public/assets/` empty — no custom screenshots/social-preview art beyond the generated OG image.
- The blog-editor UI (sort/filter/bulk-select, ~1,175 line diff from 07-15) still hasn't had a dedicated pass to confirm it holds up on mobile widths given how much surface area it added.
- `Home.tsx` uses muted/dashed styling ("opacity-50 border-dashed") for some project grid slots — confirm intentional vs. leftover (unchanged, not re-inspected in detail this cycle).
- Still no dedicated loading/error-state design pass on `/blog-editor` or `/logistics` beyond the password gate itself.

## Brainstormed ideas backlog

- RSS feed (`feed.xml`) for the blog — cheap add since posts already live in Supabase.
- Surface post `view_count` on the public blog (list badge + detail page) — the data's already computed for the editor, this is mostly a UI pass now.
- Bulk publish/unpublish to pair with the existing bulk-delete, reusing the same selection UI.
- Soft-delete / short undo window for bulk deletes, given the 100-post blast radius.
- Push the editor's sort/filter state into URL query params so a filtered view is bookmarkable/shareable.
- A "most viewed this week" widget on the public blog list page.
- Weekly rollup digest (in addition to this daily one) summarizing analytics trends and content changes.
- Sanitized public version of `/logistics` as a portfolio flex (totals/uptime-style stats only), keeping the detailed dashboard private.
- Site-wide theme extension — blog posts already have per-post accent themes (purple/green/pink); extend that palette system site-wide with a toggle.
- Cmd+K command palette for quick nav between Work/Blog/About/Contact.
- Tie a "site redeployed" notification into the existing Resend/email-summary wiring.
- Automated Lighthouse/performance check as part of this daily report.
- One-time-code email step (via existing Resend setup) as a second factor before treating `/logistics` as production-grade admin surface.
- Investigate whether `ProjectList` is actually a half-finished refactor of the Work page grid rather than pure dead code, before deleting it.
- Lightweight "last deployed" badge in the footer, sourced from a Netlify build hook or a git SHA baked in at build time.
- A tiny `/api/health` route (checks Supabase connectivity) as groundwork before adding real uptime monitoring.
- Dark/light mode toggle, using the existing per-post accent theme system as a base for a broader site-wide palette.
- Keyboard shortcut cheatsheet or light onboarding tooltip for the blog editor, since it's now an even denser custom CRUD UI post-rewrite.
- Turn this tracker's Change Log into its own public "now"/changelog page as a subtle portfolio flex.
- Basic uptime check (e.g. a free monitor pinging the homepage every few minutes) feeding into this daily report.
- Image optimization audit — confirm `next/image` is used consistently once `public/assets/` gets populated.
- GitHub Actions badge in the README once CI exists.
- JSON-LD structured data (BlogPosting schema) on blog detail pages for richer search results.
- Per-post OG images (dynamic `opengraph-image.tsx` under `blog/[slug]`) instead of one site-wide image.
- Reading-progress bar on blog detail pages.
- CSV export button on `/logistics` for pulling analytics into a spreadsheet.
- Scheduled/draft publishing: a `publish_at` column on `posts`, queueable from the editor.
- A `/uses` or `/now` page — low-effort content portfolio reviewers actually read.
- Netlify deploy-succeeded webhook → email-summary endpoint for deploy pings.
- Small internal "aggregator" page reading across all synced `project_documents` rows (multiple projects, one dashboard).
- Use the `content_hash` column to skip sending the daily email when nothing's changed since yesterday.
- A `security.txt` file (RFC 9116) at `/.well-known/security.txt`, repurposing what's already in `SECURITY.md`.
- Tag-based filtering UI on the blog list page — the editor now has this internally; extend the same pattern to the public blog list.
- "Recently updated" badge on blog posts whose `updated_at` is within the last N days.
- Manual "sync now" trigger for docs-upload so changes don't have to wait for the daily schedule to test.
- A "last commit" / "days since last deploy" badge to make momentum visible and self-motivating. _(added 2026-08-05)_
- Draft-mode preview links for unpublished posts — a shareable, token-gated URL for pre-publish feedback. _(added 2026-08-05)_
- Syntax-highlighted code-copy buttons on blog post code blocks (rehype-highlight already in place). _(added 2026-08-05)_
- Webmention or simple comment system for blog posts, even a minimal Supabase-backed guestbook per post. _(added 2026-08-05)_
- Auto-generate and cache blog post reading-time and word-count for consistency instead of a manually-set value. _(added 2026-08-05)_
- A "related posts" section on blog detail pages using shared tags. _(added 2026-08-05)_

## Legal & personal concerns

(Not legal advice — flagging for your own judgment.)

- Analytics (`page_views`) stores `session_id`, `referrer`, `user_agent`, `screen_width`, `load_time` indefinitely with no stated retention policy or visible privacy notice on the site. If publicly reachable, GDPR/UK-GDPR can apply to EU/UK visitors regardless of hosting location — worth a short privacy blurb if this stays public.
- Bulk delete on posts (up to 100 at once) still has no soft-delete/undo, just a confirm step — worth a beat of thought given the blast radius of a mistake.
- The `project_documents` table remains low-risk by design — upsert-only, one row per project+filename, no unbounded accumulation.
- Secrets handling looks correct — `.env*` gitignored; all expected keys present locally.
- `/logistics` and `/blog-editor` each rely on one static password — brute-force lockout exists, but if the password leaks there's still no second factor.

## Change log

- 2026-08-05 — No new commits since `8ceab29` (2026-07-15) — repo now quiet 21 days, working tree clean. Ran a fresh full `npm test`: 186 tests passed across 11 suites (up from 181 last confirmed 07-09), resolving the unverified-count flag from the 07-29 report. `ComingSoon`/`ProjectList` still dead (6th report). No new dependencies, no structural changes. Sent daily status email successfully (`{"success":true}`).
- 2026-07-29 — Repo quiet since 07-15 (14 days), working tree clean. Caught up on two commits since last report: `f91517b` (07-09) committed the previously-uncommitted docs-upload endpoint/schema/tests; `8ceab29` (07-15) added per-post `view_count` (computed from `page_views`) to `GET /api/blog/posts`, bulk delete (`{ids:[...]}`, capped at 100) to `DELETE /api/blog/posts`, and a ~1,175-line blog-editor rewrite (sort/search/tag/status filters, bulk-select mode, action menu). `ComingSoon`/`ProjectList` still dead (5th report). Could not complete a full `npm test` run in sandbox this cycle — flagged, not silently skipped. Sent daily status email successfully (`{"success":true}`).
- 2026-07-09 — No new git commits (still 16, `cf525ac` latest), but a full docs-sync feature landed uncommitted: `/api/docs/upload` route, `supabase/documents-schema.sql`, and a new test suite (166→181 tests, 10→11 suites). This is the endpoint used to sync this very tracker today — confirmed working end to end. Recommend committing it next. Sent daily status email successfully (`{"success":true}`).
- 2026-07-08 — Security pass now committed: new commit `cf525ac Test suites added` (07-06 evening) landed all tests, SECURITY.md, security libs, hardened routes, headers, and this tracker — repo at 16 commits, tree clean. No commits 07-07/07-08. Still open: Resend domain, dead `ComingSoon`/`ProjectList`, empty `public/assets/`, CI, shared rate-limit store. Sent daily status email successfully (`{"success":true}`).
- 2026-07-06 (security pass) — Full audit + fixes: timing-safe auth on all four routes, brute-force lockout + rate limiting, security headers/CSP, rehype-sanitize XSS protection for blog markdown, input validation + PATCH whitelisting, generic error responses, password-gate error-handling bug fix, `/blog-editor` analytics exclusion, package renamed `portfoliomkv`. Added Jest (Babel transform, `jest.config.js`) with 166 tests across 10 suites — run with `npm test`. New deps: `rehype-sanitize`; dev: `jest`, `@types/jest`, `babel-jest`, `@babel/core`, `@babel/preset-env`, `@babel/preset-typescript`. Items that need outside action (Resend domain verification, distributed rate-limit store, `page_views` RLS + retention policy, secret rotation, real auth/2FA, nonce-based CSP) are documented in `SECURITY.md`.
- 2026-07-06 — No new commits since 2026-07-04 (still 15 commits, last commit `23ba027`). New finding: `ProjectList` is also unused/dead code alongside `ComingSoon`. `PROJECT_OVERVIEW.md` itself confirmed still uncommitted (staged only). PortfolioMkIV sibling inactive since 2026-06-15. Sent daily status email successfully (`{"success":true}`).
- 2026-07-04 — Initial snapshot. First-ever report/tracker for this project (portfoliomkv). Confirmed live at javastudios.netlify.app, 15 commits, working tree clean. Flagged: no rate limiting/security headers, static (non-timing-safe) secret checks, unverified Resend sending domain, unused `ComingSoon` component, empty `public/assets/`. Sent first daily status email successfully (`{"success":true}`).
