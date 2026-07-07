# Security — portfoliomkv

_Last security pass: 2026-07-06_

## Fixed in this pass

Every secret comparison (`x-logistics-key` on `/api/blog/posts` and `/api/analytics/stats`, `x-api-key` on `/api/blog/upload` and `/api/email-summary`) now uses a constant-time compare (`lib/security.ts` → `crypto.timingSafeEqual` over SHA-256 digests) instead of `!==`, and every check fails closed if the env secret is unset.

Brute-force damping was added on all four authenticated routes: 10 failed attempts per IP per route within 15 minutes returns 429, which protects the `/logistics` and `/blog-editor` password gates since they authenticate against those same endpoints. The unauthenticated `/api/analytics/track` endpoint is capped at 30 requests/minute/IP, and `/api/email-summary` additionally caps successful sends at 10/hour to protect the Resend quota (`lib/rate-limit.ts`).

Stored XSS through blog content was closed: content passes through `rehype-raw` (raw HTML is parsed and rendered), so a `rehype-sanitize` allowlist (`lib/markdown-sanitize.ts`) now runs between `rehype-raw` and `rehype-highlight`. It strips `<script>`, `<iframe>`, event handlers, `style` attributes, and `javascript:`/`data:` URLs while keeping code highlighting, GFM alerts, task lists, and the image size/float syntax working. This mattered doubly because the admin password sits in `sessionStorage` on the gated pages — XSS there meant credential theft.

Security headers now ship on every route via `next.config.ts`: CSP (default-src 'self', with allowances only for Supabase, Google Fonts, and inline styles/scripts Next needs), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, and HSTS.

Input validation was added across the board (`lib/validation.ts`): slug format enforcement everywhere (including the upload webhook, which previously trusted frontmatter slugs raw), length caps on every stored field, strict types on analytics payloads, and a field whitelist on the posts PATCH route that blocks mass assignment of `created_at`/`id`/arbitrary columns. Supabase and Resend error messages are logged server-side but no longer leaked to clients. `/api/email-summary` always sends to the env-configured recipient, so it cannot be used as a relay.

Bugs fixed along the way: both password gates could hang on "Checking…" forever on a network error (missing try/catch); `/blog-editor` visits were being recorded in analytics (only `/logistics` was excluded); `package.json` was still named `portfoliomkiv`; unpublished post content now has a `published = true` filter as defense-in-depth alongside RLS.

Tests: `npm test` runs 166 Jest tests across 10 suites covering auth rejection/lockout on every route, validation edge cases, rate-limit windows, the sanitize schema, header configuration, and feature logic (stats aggregation, reading time, slugs, frontmatter parsing).

## Known limitations that need outside action

These could not be fully fixed from inside the repo:

1. **Rate limiting is in-memory.** On Netlify serverless, each warm function instance keeps its own counters, so limits are best-effort damping, not a hard guarantee. A hard guarantee needs a shared store — e.g. a free Upstash Redis instance with `@upstash/ratelimit`, or Netlify's edge rate limiting. Requires creating an external account/service.

2. **Resend sender domain is unverified.** `RESEND_FROM_EMAIL` still uses the `onboarding@resend.dev` sandbox sender, which can only deliver to your own signup address. Verify a domain in the Resend dashboard (DNS records) and update the env var.

3. **Single-factor static passwords.** `/logistics` and `/blog-editor` are protected by one shared password with no second factor and no server-side session (the key is kept in `sessionStorage` and replayed on each request). Lockout now limits brute force, but if the password leaks there is no second layer. Real auth (e.g. Supabase Auth with magic links, or at least the one-time-code-via-Resend idea from the backlog) needs product decisions and external setup.

4. **Secret rotation.** If any of `LOGISTICS_PASSWORD`, `BLOG_UPLOAD_SECRET`, or `EMAIL_SUMMARY_SECRET` were ever pasted into chats, scripts, or Shortcuts, rotate them in Netlify env settings. Rotation can only be done in the Netlify/Supabase/Resend dashboards.

5. **Analytics privacy / GDPR.** `page_views` stores `session_id`, referrer, user agent, and screen width indefinitely with no retention policy or privacy notice. Adding a retention cron (Supabase scheduled function) and a privacy blurb on the site are external/product tasks. Consider deleting rows older than ~12 months.

6. **`page_views` has RLS disabled.** It's only ever touched with the service-role key, but enabling RLS with no policies (deny-all for anon) in the Supabase dashboard would be free defense-in-depth if the anon key is ever misused.

7. **CSP still allows `'unsafe-inline'` scripts.** Next.js injects inline scripts for hydration; removing `'unsafe-inline'` requires nonce-based CSP via middleware, which is invasive and version-sensitive. Reasonable to defer, but worth doing if the site ever handles more sensitive data.

## Testing

```
npm test          # run all suites
npm run test:watch
```

Jest uses a Babel transform (`jest.config.js`) rather than `next/jest`. Deliberately no `babel.config.js` at the repo root — that would switch Next's own builds off SWC.
