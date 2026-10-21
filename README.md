# JAVA.dev: Portfolio mkV

The personal portfolio, blog, and content studio of **Jorge Alejandro Vilanova Alvarado**, full-stack developer.

**Live:** https://javastudios.netlify.app · **Repo:** https://github.com/JorgeVilano500/PortfolioMkV

Built with **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS 4**, and **Supabase**, and deployed on **Netlify**.

---

## What's inside

| Area | Route | What it does |
|---|---|---|
| Home | `/` | Bento-grid landing page: intro, current focus, resume download, skills, projects, quick stats |
| Work | `/work` | Filterable project showcase |
| About | `/about` | Bio, animated career timeline, tech stack, hobbies |
| Blog | `/blog`, `/blog/[slug]` | Markdown posts stored in Supabase, with themed cards, callouts, syntax highlighting, and per-post OG images |
| Contact | `/contact` | Email, socials, quick message form |
| Privacy | `/privacy` | Plain-language privacy and cookie policy, with cookie settings |
| First-visit intro | every page | Welcome → privacy choice (analytics off by default, enforced server-side) → how-to guide with live previews → optional guided tour that highlights the next navbar tab on each page |
| Studio 🔒 | `/studio` | Password-gated CMS: create, edit, publish, and bulk-manage blog posts and projects |
| Logistics 🔒 | `/logistics` | Password-gated, first-party visitor analytics |

Behind the pages are API routes for analytics tracking and stats, CMS writes, a markdown-upload webhook, a docs-sync endpoint, and an email-summary endpoint (Resend). Every write is authenticated, validated, and rate-limited. See [SECURITY.md](SECURITY.md).

## Quick start

**Prerequisites:** Node.js **20.9+** (developed on 22), npm, and a free [Supabase](https://supabase.com) project.

```bash
git clone https://github.com/JorgeVilano500/PortfolioMkV.git
cd PortfolioMkV
npm install
```

**1. Create the database.** In the Supabase dashboard, open SQL Editor → New query and run these files in order:

1. `supabase/schema.sql`: `posts`
2. `supabase/projects-schema.sql`: `projects`
3. `supabase/analytics-schema.sql`: `page_views`
4. `supabase/consent-schema.sql`: `consent_events`, plus the opt-in `page_views` columns (IP, language, timezone, visitor id)
5. `supabase/documents-schema.sql`: `project_documents`

**Already have a database from before 2026-10-20?** Run `supabase/security-hardening.sql` and `supabase/consent-schema.sql` once each (both are safe to re-run). They lock the analytics table away from the public anon key, tighten grants, and add the consent tables (SECURITY.md S-1, S-22, S-5).

**2. Configure the environment.** Create `.env.local` in the repo root:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL (the app and build fail without it) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key; RLS limits it to published content |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only key used by the API routes. **Never expose it.** |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical URL for metadata and the sitemap, e.g. `http://localhost:3000` |
| `LOGISTICS_PASSWORD` | for admin | Password for `/studio` and `/logistics`, exchanged for an 8-hour HttpOnly session cookie. Changing it signs everyone out. |
| `SESSION_SECRET` | recommended | Random string used to sign admin sessions (`openssl rand -base64 32`); falls back to the service-role key |
| `BLOG_UPLOAD_SECRET` | optional | Secret for `POST /api/blog/upload` |
| `DOCS_UPLOAD_SECRET` | optional | Secret for `POST /api/docs/upload` |
| `EMAIL_SUMMARY_SECRET` | optional | Secret for `POST /api/email-summary` |
| `RESEND_API_KEY` | optional | Resend API key (needed only if you use email summaries) |
| `RESEND_FROM_EMAIL` | optional | Verified sender, e.g. `Site <hello@yourdomain.com>` |
| `SUMMARY_RECIPIENT_EMAIL` | optional | Where email summaries are delivered |
| `ANALYTICS_EXCLUDED_IPS` | optional | Comma-separated IPs to leave out of analytics |

**3. Run it.**
```bash
npm run dev        # → http://localhost:3000
```
Sign in at `/studio` with your `LOGISTICS_PASSWORD` to add your first post or project.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build and serve (needs the Supabase env vars) |
| `npm test` / `npm run test:watch` | Jest suite (407 tests, including jsdom component tests; Supabase and Resend are mocked, so no secrets are needed) |
| `npm run lint` | ESLint (in Next 16, `next build` no longer lints) |
| `npx tsc --noEmit` | Type-check |

## Project structure

```
app/            Routes: pages, layouts (metadata), API route handlers, OG images, robots, sitemap
  studio/       🔒 CMS (Blogs and Projects tabs)
  logistics/    🔒 analytics dashboard
  api/          analytics, blog, projects, docs, email-summary
components/     Shared UI: Navbar, Modal, MarkdownRenderer, ProjectList, PageTracker, page bodies
lib/            Supabase clients, data helpers, validation, security, rate limiting, sanitize schema
supabase/       SQL schema files (run in the Supabase SQL editor)
__tests__/      Jest suites
public/         resume.pdf and static assets
```

## Documentation

| Doc | Read it for |
|---|---|
| [AGENTS.md](AGENTS.md) | **Start here** if you're an AI agent or new contributor: rules, gotchas, next actions |
| [PRD.md](PRD.md) | Product goals, feature inventory, requirements, **roadmap** |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, API reference, data model, env vars, deployment, recipes |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Colours, typography, layout, components, motion, accessibility |
| [SECURITY.md](SECURITY.md) | Threat model, controls, open issues, secrets |
| [CODE_STYLE.md](CODE_STYLE.md) | Conventions for TypeScript, React, API routes, and styling |
| [TESTING.md](TESTING.md) | Test setup, patterns, coverage, manual QA, CI |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | Historical status log kept by an external automation (may be out of date) |

## Deployment

The site deploys on **Netlify**, which builds `main` with `next build`; no `netlify.toml` is needed.

1. Add every variable from the table above in **Site settings → Environment variables**.
2. `NEXT_PUBLIC_*` values are baked in at build time, so **redeploy after changing them**.
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL so metadata, the sitemap, and OG images use the right domain.

## Status

The site is live. Tests, type-check, lint, and the production build all pass. A security hardening pass on 2026-10-19 is summarized in [SECURITY.md §7](SECURITY.md#7-issue-queue); it takes effect once deployed and once `supabase/security-hardening.sql` has been run. Next steps are prioritized in [PRD.md §7](PRD.md#7-roadmap-next-best-actions). Highlights: moving `/work` onto Supabase, fixing font loading, and adding CI.
