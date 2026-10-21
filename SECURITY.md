# Security — portfoliomkv

_Last full security pass: **2026-10-19** (hardening pass 2, see §8). Previous pass: 2026-07-06._

Threat model, the controls that exist (and must keep existing), per-endpoint auth, secrets, the open-issue queue with status, and history. **Read §3 before writing any API route, rendering user content, or touching secrets.**

> ⚠️ **Nothing from the 2026-10-19 pass is live until it is deployed** (commit → push → Netlify build), **and** `supabase/security-hardening.sql` has been run in the Supabase SQL editor. Until then production still has the S-1, S-3, S-13, S-14 and S-15 exposures described below.

---

## 1. Threat model

### Assets
| Asset | Why it matters |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Full read/write on every table, bypasses RLS |
| `LOGISTICS_PASSWORD` | Admin credential for Studio (all content) and Logistics (analytics) |
| Machine secrets (`BLOG_UPLOAD_SECRET`, `DOCS_UPLOAD_SECRET`, `EMAIL_SUMMARY_SECRET`) | Each can publish content / overwrite docs / send email |
| Admin session cookie (`admin_session`) | Grants admin for up to 8 h |
| Integrity of posts & projects | Public face of the owner |
| `page_views` data | Visitor metadata (privacy) and analytics accuracy |
| Resend quota & sender reputation | Abuse burns quota or gets the sender blocked |

### Attackers & vectors considered
| Attacker | Vectors |
|---|---|
| Anonymous internet | Brute-forcing the admin password (incl. from many IPs / with forged IP headers); flooding `/api/analytics/track`; using the public anon key directly against Supabase; CSRF against a signed-in admin; probing for verbose errors; framework CVEs |
| Malicious/compromised content source | Stored XSS via markdown, raw HTML, or JSON-LD fields (post title/excerpt/tags) |
| Holder of a leaked machine secret | Content injection; **code execution via front-matter parsing**; email spam |
| Supply chain | Vulnerable dependencies (`npm audit`) |

### Trust boundaries
1. **Browser → Supabase (anon key)** — only RLS **and table grants** protect data. Every table: RLS on, minimal grants, explicit minimal policies.
2. **Browser/automation → `/api/*`** — each route authenticates, validates and rate-limits itself (no `proxy.ts`). Admin routes share `lib/admin-auth.ts`.
3. **Route handler → Supabase (service role)** — fully trusted; routes must whitelist everything they write.

## 2. Posture at a glance
| Area | Status |
|---|---|
| Framework & dependencies free of known critical/high runtime advisories | ✅ Next 16.3.8; `npm audit --omit=dev`: 0 critical/high (S-13, S-16) |
| Admin auth: password exchanged once for HttpOnly/SameSite=Strict/Secure session cookie | ✅ (S-6, partial — still single factor) |
| CSRF protection on cookie-authenticated writes | ✅ SameSite=Strict + Sec-Fetch-Site/Origin check |
| Timing-safe secret comparison, fail closed when unset | ✅ |
| Brute-force lockout — per IP (unspoofable on Netlify) + global per-route ceiling | ✅ (S-3) — in-memory, per instance (S-4) |
| Public write endpoints rate-limited | ✅ track 30/min/IP · consent 20/min/IP |
| Analytics only with explicit, server-enforced consent | ✅ (2026-10-20) |
| Input validation, PATCH whitelists, UUID ids, object-only JSON bodies | ✅ |
| Generic error responses | ✅ |
| Stored-XSS: markdown sanitize allowlist + escaped JSON-LD + `script-src-attr 'none'` | ✅ |
| No code execution from uploaded front matter | ✅ (S-14) |
| Security headers / CSP / COOP / no-store on API | ✅ (`'unsafe-inline'` scripts remain — S-7) |
| RLS + minimal grants on every table | ⚠️ **SQL written, must be run** (S-1, S-22) |
| Verified email sender domain | ❌ external (S-2) |
| CI enforcing the security tests | ❌ (PRD P1-2) |

## 3. Rules for contributors (checklist)

- [ ] **Secrets**: read only on the server via `process.env.X`; never `NEXT_PUBLIC_`; never log/return them.
- [ ] **Service-role client**: import `lib/supabase-admin.ts` only from route handlers/server-only modules — never from `"use client"` files or anything they import.
- [ ] **Admin route** (anything behind `LOGISTICS_PASSWORD`): call `checkAdminAuth(req, ROUTE)` from `lib/admin-auth.ts` first — it handles the session cookie, CSRF, lockout and the legacy header. Don't hand-roll auth.
- [ ] **Machine route** (`x-api-key`): `getClientIp` → `isAuthBlocked` → `safeEqual` against the env secret (401 if unset) → `recordAuthFailure` on failure. Own `ROUTE` constant.
- [ ] **New public write route**: `rateLimit(name, ip, limit, window)` before any work; `429` + `Retry-After`.
- [ ] **Bodies**: parse JSON in `try/catch`, then require `isJsonObject(body)` before destructuring (`JSON.parse("null")` is valid JSON).
- [ ] **Validate every field** with `lib/validation.ts`; add a `LIMITS` entry for every stored string/array; row ids must pass `isUuid`.
- [ ] **PATCH/PUT whitelist**: build `fields` field-by-field — never `update(body)` / `insert({...body})`.
- [ ] **Bulk ops** capped (100) and validated element-by-element.
- [ ] **Errors**: `console.error("[ROUTE] ctx:", err.message)`, generic `{error}` to the client.
- [ ] **Public queries** add `.eq("published", true)` even though RLS enforces it.
- [ ] **Visitor data** (anything about a visitor, their device, or their behavior) is stored only behind `allowsAnalytics(parseConsent(cookie))` on the server. Adding a data point means updating `ANALYTICS_DATA_POINTS` and bumping `CONSENT_VERSION`.
- [ ] **New table**: RLS enabled, `REVOKE` everything anon/authenticated don't need, minimal SELECT policy only if anon must read; add it to `supabase/security-hardening.sql`.
- [ ] **User-authored markdown/HTML** renders only via `MarkdownRenderer`. **JSON-LD** only via `serializeJsonLd()` (`lib/json-ld.ts`). Never `dangerouslySetInnerHTML` with `JSON.stringify` or raw content.
- [ ] **Parsing untrusted formats**: never enable an `eval`-capable parser (e.g. gray-matter's JS engine, js-yaml `load` with JS types). Keep `MATTER_OPTIONS` in the upload route.
- [ ] **External links**: `target="_blank" rel="noopener noreferrer"`.
- [ ] **CSP/headers**: changes go in `next.config.ts` **and** `__tests__/security-headers.test.ts`. Don't add inline `on*=` attributes anywhere (blocked by `script-src-attr 'none'`).
- [ ] **Dependencies**: run `npm audit --omit=dev` before adding/upgrading; keep `next` and `eslint-config-next` on the same exact version.
- [ ] **Tests**: auth, lockout, validation, mass-assignment, CSRF (for cookie routes), error-leak tests for every route (TESTING.md §6).

## 4. Controls in place

### 4.1 Admin authentication & sessions (`lib/session.ts`, `lib/admin-auth.ts`, `app/api/auth/route.ts`)
- **Sign-in**: `POST /api/auth {password}` → constant-time compare with `LOGISTICS_PASSWORD` (per-IP + global lockout, same-origin required) → sets cookie `admin_session`: `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800 (8 h); Secure` (in production). The password is never stored client-side (the old `sessionStorage._lk` is deleted on load by `AdminGate`).
- **Token**: `<expiresAtMs>.<nonce>.<HMAC-SHA256>`, key = SHA-256 of a version tag + `SESSION_SECRET` (fallback `SUPABASE_SERVICE_ROLE_KEY`) + `LOGISTICS_PASSWORD`. Consequences: unforgeable without server secrets; a stolen cookie can't be brute-forced offline into the password; **rotating the password signs everyone out**; no secret configured → sign-in returns 500 (fail closed).
- **Session check**: `GET /api/auth` → `{authenticated}`. **Sign-out**: `DELETE /api/auth` clears the cookie. Tokens are stateless — there is no server-side revocation list; password rotation is the kill switch.
- **`checkAdminAuth(req, route)`** (used by `/api/blog/posts`, `/api/projects`, `/api/analytics/stats`):
  1. Valid session cookie → allowed; non-GET/HEAD/OPTIONS additionally requires `isSameOriginRequest` (else **403**). A valid session skips the lockout, so an attacker tripping the lockout can't kick out a signed-in admin.
  2. Otherwise lockout check → `x-logistics-key` header compared in constant time (kept for scripts/backward compatibility; custom headers can't be sent cross-site without CORS, so this path is CSRF-safe) → 401 + `recordAuthFailure`.
- **Machine routes** keep `x-api-key` per-route secrets.

### 4.2 CSRF (`isSameOriginRequest` in `lib/security.ts`)
First layer: `SameSite=Strict` (browser won't send the cookie cross-site). Second layer: if `Sec-Fetch-Site` is present it must be `same-origin` (note `netlify.app` is a public suffix, so `same-site` siblings are rejected); else if `Origin` is present its host must equal `Host`; a request with neither isn't from a browser. Applied to cookie-authenticated writes and to sign-in/sign-out.

### 4.3 Brute-force damping & rate limits (`lib/rate-limit.ts`)
| Limiter | Key | Limit | Applies to |
|---|---|---|---|
| Auth failures (per IP) | `auth:<ROUTE>` × IP | 10 failures / 15 min → `429` | every authenticated route + sign-in |
| Auth failures (global) | `auth-global:<ROUTE>` × `"all"` | 100 failures / 15 min across all IPs → `429` for new sign-ins | same |
| Track | `track` × IP | 30 req / min → `429` + `Retry-After` | `POST /api/analytics/track` |
| Email sends | `email-send` × `"global"` | 10 successful-path sends / hour | `POST /api/email-summary` |

- **Client IP** (`getClientIp`): `x-nf-client-connection-ip` (set by Netlify from the connection) → first `x-forwarded-for` entry (off-Netlify fallback, e.g. local dev) → `x-real-ip` → `"unknown"`. Used only for limits/exclusion, never authorization.
- **Memory bound**: each limiter holds ≤10,000 keys; when full it drops expired buckets, then the oldest 10% (amortized O(1)).
- **Trade-off**: the global ceiling lets an attacker block *new* admin sign-ins for up to 15 min per instance; existing sessions keep working.

### 4.4 Input validation (`lib/validation.ts`)
`LIMITS`: title 300 · slug 200 · excerpt 1,000 · content 200,000 · tag 50 · tagCount 20 · coverEmoji 16 · page 300 · sessionId 100 · referrer 2,000 · userAgent 500 · emailSubject 500 · emailBody 500,000 · uploadBody 1,000,000 · projectTitle 200 · projectDescription 2,000 · category 80 · year 20 · url 500 · icon 16.
- **Bodies**: every JSON route requires a plain object (`isJsonObject`) — `null`/arrays/scalars → 400 (previously an unhandled TypeError/500).
- **Ids**: PATCH/DELETE `id` and every bulk `ids[]` entry must be a UUID (`isUuid`).
- **Slugs**: `^[a-z0-9]+(?:-[a-z0-9]+)*$`; the upload webhook slugifies and re-validates, never trusts frontmatter raw.
- **URLs** (`link`, `github`): empty or `^https?://\S+$`.
- **Enums** (`theme`, `status`): normalized, never stored raw.
- **Tags**: array (or comma string) of non-empty strings; non-strings rejected.
- **Analytics**: strict types; out-of-range numbers → `null`; UA from the header; **referrer reduced to its origin** (http/https only, else `""`).
- **Docs filenames**: `^[A-Za-z0-9][A-Za-z0-9._ -]{0,198}\.md$`.
- **Front matter** (`/api/blog/upload`): gray-matter called with `MATTER_OPTIONS`, which replaces the `js`/`javascript` engines (gray-matter `eval`s those by default) with a refusal → 400. YAML uses `safeLoad`; JSON is `JSON.parse`; unregistered languages throw → 400. Passing options also disables gray-matter's unbounded per-input cache.

### 4.5 HTTP headers (`next.config.ts`)
All routes (`/:path*`):
| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'` (+`'unsafe-eval'` dev only)`; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=()` |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains` |
| Cross-Origin-Opener-Policy | `same-origin` |
| X-DNS-Prefetch-Control | `on` |

Plus: `/api/:path*` → `Cache-Control: no-store, max-age=0` and `X-Robots-Tag: noindex, nofollow`; `/studio/:path*`, `/logistics/:path*` → `X-Robots-Tag: noindex, nofollow` (and `robots` metadata in their layouts). `poweredByHeader: false` removes `X-Powered-By`. Verified on a production build (2026-10-19): no prerendered page contains an inline `on*=` attribute, so `script-src-attr 'none'` breaks nothing. (The Contact form's `action="javascript:throw …"` is React's intentional pre-hydration guard.)

### 4.6 Stored-XSS defense
- **Markdown** (`MarkdownRenderer` + `lib/markdown-sanitize.ts`): `remark-gfm` → `rehype-raw` → **`rehype-sanitize(allowlist)`** → `rehype-highlight` (order enforced by a test). Strips script/style (with contents), event handlers, `style`, iframes/forms/objects, comments; protocols limited to http/https/mailto; checkbox-only inputs; `user-content-` id prefix. Widening it requires a test.
- **JSON-LD** (`lib/json-ld.ts`): `serializeJsonLd` escapes `<`, `>`, `&`, U+2028/2029 so stored titles/excerpts/tags can't close the `<script>` tag (previously `JSON.stringify` → stored XSS on every post page). A test asserts both layouts use it.
- **CSP** `script-src-attr 'none'` neutralizes injected `onerror=`-style handlers even if a sanitizer slips.

### 4.7 Database posture
| Table | RLS | anon/authenticated grants (after hardening SQL) | Policies |
|---|---|---|---|
| `posts` | ✅ | SELECT only | SELECT where `published = true` |
| `projects` | ✅ | SELECT only | SELECT where `published = true` |
| `project_documents` | ✅ | none | none |
| `page_views` | ❌ **live** → ✅ after `security-hardening.sql` | none | none |

`update_updated_at()` gets `search_path = ''` (Supabase advisor `function_search_path_mutable`). Public queries also filter `published = true` in code. Live check on 2026-10-19 with the anon key: drafts, hidden projects and `project_documents` returned 0 rows ✅; **`page_views` returned rows (295 total) ❌**.

### 4.8 Information leakage
DB/provider errors logged server-side with a `[route]` prefix; clients get generic messages. `/api/analytics/stats` returns `yourIp`/`excludedIps` only to an authenticated admin. No `X-Powered-By`. Admin API responses are `no-store`.

### 4.9 Email abuse (`/api/email-summary`)
Recipient fixed to `SUMMARY_RECIPIENT_EMAIL` (no relay); 10 sends/hour, counted only for valid requests; the Resend client is created per request so a missing `RESEND_API_KEY` returns a 500 instead of crashing the module at import.

### 4.10 Analytics privacy
**Analytics are opt-in since 2026-10-20 (`lib/consent.ts`).**
- **Enforcement:** `/api/analytics/track` stores nothing unless the request carries a current `java_consent` cookie with analytics on. That check is server-side and comes before any parsing, so a modified client can't bypass a "no". The browser tracker also stays idle (no `_pv_*` storage) until consent is given, and clears that storage when consent is withdrawn.
- **What a consenting visitor's page view stores:** the page path, the **referrer origin only**, the user agent, the **IP address** (only if it parses as an IP), language, timezone, screen width, load time, the random session id, the **visitor id taken from the consent cookie** (never from the request body), and the policy version.
- **What declining stores:** only a receipt in `consent_events` (random id, choice, policy version, time). **Never an IP or user agent.**
- **Disclosure** happens in the intro modal and on `/privacy`. Both render `ANALYTICS_DATA_POINTS`, so the disclosure can't drift from the code.
- **Withdrawal and erasure:** Cookie settings is on every public page. `DELETE /api/consent` erases the rows matching the caller's own visitor id (same-origin only and rate-limited, so a third-party site can't trigger erasure).
- **Still open (S-5):** a retention window. A job is ready but commented out at the end of `security-hardening.sql`.

## 5. Endpoint matrix
| Route | Methods | Auth | Rate limit / CSRF | Writes |
|---|---|---|---|---|
| `/api/auth` | GET, POST, DELETE | POST: password → session cookie | per-IP + global lockout; POST/DELETE same-origin only | session cookie |
| `/api/analytics/track` | POST | none (public); **requires a `java_consent` analytics opt-in cookie** to store anything | 30/min/IP | `page_views` insert (with IP, language, timezone, and visitor id for consenting visitors) |
| `/api/consent` | POST, DELETE | none (public); same-origin only | 20/min/IP | `consent_events` insert; DELETE removes the caller's own `page_views` rows |
| `/api/analytics/stats` | GET | session cookie **or** `x-logistics-key` | lockout | — |
| `/api/blog/posts` | GET, POST, PATCH, DELETE | session cookie **or** `x-logistics-key` | lockout; cookie writes same-origin only | `posts` (bulk delete ≤100) |
| `/api/projects` | GET, POST, PATCH, DELETE | session cookie **or** `x-logistics-key` | lockout; cookie writes same-origin only | `projects` (bulk delete ≤100) |
| `/api/blog/upload` | POST | `x-api-key` → `BLOG_UPLOAD_SECRET` | lockout; body ≤1 MB | `posts` upsert on slug |
| `/api/docs/upload` | POST | `x-api-key` → `DOCS_UPLOAD_SECRET` | lockout; body ≤1 MB | `project_documents` upsert |
| `/api/email-summary` | POST | `x-api-key` → `EMAIL_SUMMARY_SECRET` | lockout + 10 sends/hr | Resend send |

Request bodies are additionally capped by the platform (Netlify Functions: ~6 MB).

## 6. Secrets
| Secret | Grants | Used in | Rotate via |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access (+ fallback session-signing material) | `lib/supabase-admin.ts`, `lib/session.ts` | Supabase dashboard → Settings → API; update Netlify + `.env.local` (also signs out admin sessions if `SESSION_SECRET` is unset) |
| `LOGISTICS_PASSWORD` | Studio + Logistics | `/api/auth`, admin routes, session key | Netlify env — long random passphrase. Rotating it **signs out every session**. |
| `SESSION_SECRET` (optional, recommended) | Signs admin sessions | `lib/session.ts` | Netlify env (`openssl rand -base64 32`); rotating signs everyone out |
| `BLOG_UPLOAD_SECRET` | Publish posts | `/api/blog/upload` | Netlify env + every upload client |
| `DOCS_UPLOAD_SECRET` | Overwrite project docs | `/api/docs/upload` | Netlify env + automation |
| `EMAIL_SUMMARY_SECRET` | Email the owner | `/api/email-summary` | Netlify env + automation |
| `RESEND_API_KEY` | Send from the Resend account | `/api/email-summary` | Resend dashboard |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design — RLS + grants protect data (hence S-1 matters).
**Rotation procedure**: generate (`openssl rand -base64 32`) → update Netlify env → redeploy → update `.env.local` and external clients → revoke the old value at the provider. Rotate immediately if a secret was ever pasted into a chat, script, shortcut, log, or commit.

## 7. Issue queue

Status key: ✅ fixed in code (live after deploy) · 🟡 fix ready — needs your action · 🟠 partially mitigated · 🔴 open (needs external work or a product decision)

### Tally (2026-10-19 pass)
| | Count |
|---|---|
| Open items in the queue **before** this pass (S-1 – S-12) | **12** |
| New issues found during this pass (S-13 – S-22) | **10** |
| Total items worked | **22** |
| ✅ Fixed in code | **14** (S-3, S-8, S-9, S-10, S-11 + S-13 – S-21) |
| 🟡 Fix ready, needs you to run one SQL file | **2** (S-1, S-22) |
| 🟠 Partially mitigated | **3** (S-5, S-6, S-7) |
| 🔴 Still open (external / product decision) | **3** (S-2, S-4, S-12) |
| Remaining open after this pass | **8** of 22 |

### Original queue
| ID | Issue | Status | Notes |
|---|---|---|---|
| **S-1** | `page_views` RLS disabled → anyone with the public anon key can read/insert/edit/delete analytics (verified live: 295 rows readable) | 🟡 | Run `supabase/security-hardening.sql`. Schema file now enables RLS + revokes grants. Verify with the queries at the bottom of that file. |
| S-2 | Resend sender domain unverified (sandbox sender) | 🔴 | DNS in Resend dashboard, then set `RESEND_FROM_EMAIL`. Low risk: the route only ever emails the owner. Code now fails closed if the key is missing. |
| **S-3** | Rate-limit keys spoofable via `X-Forwarded-For` (verified live: forged XFF accepted as client IP) | ✅ | `getClientIp` prefers Netlify's `x-nf-client-connection-ip`; new global per-route failure ceiling caps guesses regardless of IP. **After deploy, verify**: `/logistics` "Your current IP" shows your real IP even if you send a forged `X-Forwarded-For`. |
| S-4 | Rate limiting in-memory per serverless instance | 🔴 | Needs a shared store (Upstash Redis + `@upstash/ratelimit`) — external account (PRD P2-1). Global ceiling + memory cap reduce impact. |
| S-5 | Analytics privacy / retention / notice | 🟠 | Done: referrer stored as origin only (2026-10-19); **opt-in consent enforced server-side, `/privacy` policy, Cookie settings, and self-service erasure (2026-10-20)**. Ready but commented out in the hardening SQL: a pg_cron retention job. Open: pick a retention window (PRD Q4). This matters more now that IPs are stored for consenting visitors. Not legal advice. |
| S-6 | Single-factor static password, no server session, password in `sessionStorage` | 🟠 | Done: password exchanged once for an HttpOnly/SameSite=Strict/Secure 8 h session; sign-out; CSRF checks; password no longer readable by page scripts. Open: second factor (e.g. email OTP via Resend / Supabase Auth magic link — PRD P2-3). |
| S-7 | CSP allows `'unsafe-inline'` scripts | 🟠 | Done: `script-src-attr 'none'` blocks inline handlers. Open: nonce-based CSP via `proxy.ts` (forces dynamic rendering — PRD P2-4). |
| **S-8** | Admin pages indexable | ✅ | `noindex` metadata + `X-Robots-Tag` on `/studio`, `/logistics`, `/api`. |
| **S-9** | External links without `rel="noopener noreferrer"` | ✅ | About, Contact, WorkComponent fixed; About's `http://localhost:3000/blog` link fixed too. |
| **S-10** | Upload webhook re-upload silently unpublishes | ✅ | `published` only written when present in front matter. |
| **S-11** | Third-party Google Fonts request | ✅ | `<link>` removed (the fonts were never applied — see DESIGN_SYSTEM.md §3); CSP font origins removed. Load fonts via `next/font` when doing PRD P0-2. |
| S-12 | Secret rotation hygiene | 🔴 | Owner action in Netlify/Supabase/Resend. Recommended now, since the old flow kept the admin password in browser storage. |

### Found in this pass
| ID | Severity | Issue | Status | Fix |
|---|---|---|---|---|
| **S-13** | Critical | `next@16.2.1` had 30+ advisories incl. **RCE in `next/og` `ImageResponse`** (used for OG images), unauthenticated RCE paths, SSRF, cache poisoning, middleware bypasses, info disclosure in metadata image routes | ✅ | Upgraded to `next@16.3.8` + `eslint-config-next@16.3.8` (minimal release clearing every listed advisory; ≥2 weeks old). Build, tests, lint all green. |
| **S-14** | High | gray-matter **`eval`s `---js` front matter** → anyone holding `BLOG_UPLOAD_SECRET` could run code on the server (and read the service-role key). Proven by a failing test before the fix. | ✅ | JS engines replaced with a refusal (`MATTER_OPTIONS`); tests cover `js`, `javascript`, `JS`, `JavaScript`. |
| **S-15** | High | JSON-LD built with `JSON.stringify` inside `<script>` → a post title containing `</script>` = stored XSS on public pages | ✅ | `serializeJsonLd()` escaping; both layouts use it. |
| **S-16** | High (runtime: moderate) | Vulnerable transitive deps (js-yaml DoS used by uploads, ws, nanoid, brace-expansion, browserslist, source-map-js, …) | ✅ | `npm audit fix` (in-range). Residual, accepted: `sprintf-js` (moderate, **no patched version exists**, only reachable via js-yaml's CLI arg parser, not `safeLoad`); `braces`/jest chain (dev-only tooling; audit's suggested "fix" is a bogus downgrade to eslint-config-next 14). |
| **S-17** | Medium | Non-object JSON bodies (`null`, `[]`) crashed `/api/analytics/track` (public), `/api/email-summary`, `/api/docs/upload` with unhandled 500s | ✅ | `isJsonObject` guard → 400. |
| **S-18** | Low | Row ids not validated (PostgREST `in(...)` quoting edge cases; garbage ids → 500) | ✅ | `isUuid` on every id. |
| **S-19** | Medium | Rate-limiter maps unbounded under a flood of distinct (spoofed) keys → memory exhaustion | ✅ | 10k-key cap with batched eviction. |
| **S-20** | Low | API responses cacheable; `X-Powered-By` disclosed; no COOP | ✅ | `no-store` on `/api`, `poweredByHeader: false`, COOP `same-origin`. |
| **S-21** | Low | `new Resend()` at module load throws without a key → whole route module crashes | ✅ | Lazy client, fail closed with 500. |
| **S-22** | Medium | anon/authenticated retain INSERT/UPDATE/DELETE grants on `posts`/`projects` (only RLS stands in the way); trigger function `search_path` mutable | 🟡 | Same `supabase/security-hardening.sql` revokes the grants and pins `search_path`; schema files updated. |

### How to finish the 🟡 items (≈2 minutes)
1. Supabase dashboard → **SQL Editor** → New query → paste `supabase/security-hardening.sql` → **Run**.
2. Check the two verification result sets at the end: every table `rowsecurity = true`; anon/authenticated only have `SELECT` on `posts` and `projects`.
3. Load `/logistics` (after deploying) — stats still work (service role is unaffected).

## 8. History

### 2026-10-21: Netlify deploy blocked: secrets in the Turbopack build cache
**Symptom:** the first deploy after merging PR #1 failed Netlify's secrets scan with `RESEND_API_KEY` reported as exposed.

**Investigation:** no Resend-shaped key exists in any commit, branch, or `.env` file ever committed, nor in compiled output. The cause is Next **16.3.0 enabling Turbopack's persistent build cache by default**, introduced here by the 16.2.1 → 16.3.8 security upgrade. That cache (`.next/cache/turbopack/*.sst`) stores the values of env vars read during the build. A local build with fake secrets reproduced it: a fake `EMAIL_SUMMARY_SECRET` appeared in a cache file.

**Fix:** `experimental.turbopackFileSystemCacheForBuild: false` in `next.config.ts`. With it, a rebuild with six fake secrets wrote nothing to the cache, and none of them appeared anywhere in `.next`.

**Why not the alternative:** exempting the cache path via `SECRETS_SCAN_OMIT_PATHS` was rejected. It would leave secret values persisted in Netlify's stored build cache. Never add secret names to `SECRETS_SCAN_OMIT_KEYS`, which would hide real leaks. A test guards the setting.

**After deploying the fix:** use **"Clear cache and deploy site"** once, so no cache saved by the failed build is restored.

### 2026-10-20: Visitor consent and onboarding (branch `cookie-set-up`)
The owner asked for tracking "no matter what" the visitor answers. It was built so that the answer is enforced instead: ignoring a consent choice would mislead visitors and break GDPR/ePrivacy for EU and UK visitors.
- **Consent:** a server-enforced opt-in for analytics; consent receipts without IPs; self-service erasure; a `/privacy` policy; a Cookie settings link on every public page.
- **New data, opt-in only:** IP address, language, timezone, and a visitor id.
- **Hardening along the way:**
  - The new endpoint is same-origin only and rate-limited.
  - The visitor id comes from the cookie, never the body.
  - IPs are validated with `net.isIP`, and language and timezone are validated by regex.
  - Graceful handling of schema drift.
  - Navbar accessibility: the closed mobile drawer is `inert`, and the menu buttons are labelled.
- **Tests:** 315 → 406, including a jsdom suite for the modal, consent, and tour flows; verified in headless Edge.

### 2026-10-19 — Hardening pass 2
Live verification found S-1 (analytics readable with the public anon key) and S-3 (production trusted a forged `X-Forwarded-For`). Fixed in code: S-3, S-8–S-11, S-13–S-21; SQL prepared for S-1/S-22; partial mitigations for S-5–S-7 (details in §7). New modules: `lib/session.ts`, `lib/admin-auth.ts`, `lib/json-ld.ts`, `app/api/auth/route.ts`, `components/features/AdminGate.tsx` (replaces both duplicated password gates), `supabase/security-hardening.sql`. Tests: 218 → **315** across 15 suites; tsc and lint clean; production build verified, plus 21 end-to-end checks against a local production server (cookie attributes, CSRF block, cookie-only admin reads, exploit rejection, lockout under forged XFF, headers).

### 2026-08-05 — Projects CMS (`5589a7d`)
`/api/projects` mirrored the posts route (auth + lockout, whitelist, validated URLs, normalized enums, bulk delete ≤100); `projects` RLS with public read of published rows; `/blog-editor` → `/studio`.

### 2026-07-09 — Docs sync endpoint (`f91517b`)
`/api/docs/upload` with auth + lockout, filename allowlist, body cap; `project_documents` RLS with no policies.

### 2026-07-06 — Full security pass 1 (`cf525ac`)
Constant-time secret comparison everywhere (fail closed when unset); brute-force damping (10 failures/15 min/IP/route); 30/min/IP on `/api/analytics/track`; 10 sends/hour on `/api/email-summary`; `rehype-sanitize` allowlist between `rehype-raw` and `rehype-highlight` (stored XSS); security headers + CSP; input validation and the posts PATCH whitelist (mass assignment); generic error responses; fixed recipient for email; fixes for stuck password gates, admin pages counted in analytics, the package name, and a `published` filter as defense in depth. 166 tests / 10 suites at the time.

## 9. Reporting a vulnerability
Email the address on the site's `/contact` page with subject "Security". Please don't open a public GitHub issue for an unfixed vulnerability. (`/.well-known/security.txt` is in the PRD backlog.)
