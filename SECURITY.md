# Security — portfoliomkv

_Last full security pass: **2026-11-03** (security patch, branch `security-patch`, see §8). Previous passes: 2026-10-21, 2026-10-19, 2026-07-06. Last updated: **2026-11-03** (Studio sponsorships, branch `studio-sponsorships`)._

Threat model, the controls that exist (and must keep existing), per-endpoint auth, secrets, the open-issue queue with status, and history. **Read §3 before writing any API route, rendering user content, or touching secrets.**

> ⚠️ **Still needs you (all in §7):** run `supabase/auth-lockout-schema.sql` in the Supabase SQL editor (S-4; until then lockouts stay per instance and the logs warn once); set `ADMIN_2FA=email` in Netlify for the second factor (S-6); verify a Resend sending domain (S-2); add the Cloudflare Turnstile keys to switch on the sponsorship form's spam check (S-40); and run `supabase/sponsorships-schema.sql` so offers and spots are saved for Studio ([SPONSORSHIPS.md](SPONSORSHIPS.md) §2). The 2026-10-19 SQL (`security-hardening.sql`) has been run: anon gets `permission denied` on `page_views`, `consent_events` and `project_documents` (verified live 2026-10-21).

---

## 1. Threat model

### Assets
| Asset | Why it matters |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Full read/write on every table, bypasses RLS |
| `LOGISTICS_PASSWORD` | Admin credential for Studio (all content) and Logistics (analytics) |
| Machine secrets (`BLOG_UPLOAD_SECRET`, `DOCS_UPLOAD_SECRET`, `EMAIL_SUMMARY_SECRET`) | Each can publish content / overwrite docs / send email |
| Admin session cookie (`__Host-admin_session` in production, `admin_session` in dev) | Grants admin for up to 8 h |
| Integrity of posts & projects | Public face of the owner |
| `page_views` data | Visitor metadata (privacy) and analytics accuracy |
| Resend quota & sender reputation | Abuse burns quota or gets the sender blocked |

### Attackers & vectors considered
| Attacker | Vectors |
|---|---|
| Anonymous internet | Brute-forcing the admin password (incl. from many IPs / with forged IP headers); flooding `/api/analytics/track`; **abusing the sponsorship form** to email-bomb or link-spam a third party's address, flood the owner's inbox, burn the Resend quota, or upload malware for the owner to open; using the public anon key directly against Supabase; CSRF against a signed-in admin; probing for verbose errors; framework CVEs |
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
| Framework & dependencies free of known critical/high runtime advisories | ✅ Next 16.4.2 (S-38, PR #5, deployed 2026-11-03); `resend` 6.34.1 (S-39). `npm audit --omit=dev`: 0 critical/high/moderate; the one low (`deepmerge`) is used only by Jest, a dev tool. |
| Admin auth: password exchanged once for a `__Host-` HttpOnly/SameSite=Strict/Secure session cookie | ✅ |
| Second factor for admin sign-in | 🟡 built, off by default — set `ADMIN_2FA=email` (S-6) |
| CSRF protection on cookie-authenticated writes | ✅ SameSite=Strict + Sec-Fetch-Site/Origin check |
| Timing-safe secret comparison, fail closed when unset | ✅ |
| Brute-force lockout: per IP (unspoofable on Netlify, IPv6 per /64), global ceiling, **one counter for every admin-password route** | ✅ (S-3, S-25, S-27) |
| Lockout shared across serverless instances | 🟡 code ready — run `auth-lockout-schema.sql` (S-4) |
| Public write endpoints rate-limited | ✅ track 30/min/IP · consent 20/min/IP · sponsorships: 10 req/10 min, 3 offers/hr per client, 2 emails/day per recipient, 20/day overall |
| Public sponsorship form: uploads + email to a typed address | ✅ same-origin only, honeypot, byte-capped multipart, files judged by their bytes (PNG/JPEG only, no SVG) and their pixel size (S-44), link-free text, escaped emails, private bucket and tables. 🟡 Cloudflare Turnstile check built, off until its keys are set (S-40). |
| Sponsor stickers on `/laptop`, managed in Studio | ✅ offers, unplaced files and hidden spots are never public; a shown spot's image is served from this origin by `/laptop/stickers/<spot>` (bucket stays private, no signed URLs, CSP unchanged); Studio's routes use `checkAdminAuth` and whitelist every field. |
| Request bodies byte-capped before parsing, on every route | ✅ (S-24) |
| Analytics only with explicit, server-enforced consent | ✅ (2026-10-20) |
| Input validation, PATCH whitelists, UUID ids, object-only JSON bodies | ✅ |
| Generic error responses | ✅ |
| Stored-XSS: markdown sanitize allowlist + escaped JSON-LD + `script-src-attr 'none'` | ✅ |
| No code execution from uploaded front matter | ✅ (S-14) |
| Secret-holding modules can't be bundled for the browser (`server-only` + boundary test) | ✅ (S-35) |
| Security headers / CSP (project-only `connect-src`) / COOP / CORP on API / Permissions-Policy | ✅ (`'unsafe-inline'` scripts remain — S-7) |
| RLS + minimal grants on every table | ✅ verified live 2026-10-21 (S-1, S-22) |
| Supabase project settings (sign-ups, storage buckets) | 🔴 needs your review — `supabase/audit-exposure.sql` (S-23) |
| `/.well-known/security.txt` | ✅ (S-36) |
| Verified email sender domain | ❌ external (S-2) |
| CI enforcing the security tests | ❌ (PRD P1-2) |

## 3. Rules for contributors (checklist)

- [ ] **Secrets**: read only on the server via `process.env.X`; never `NEXT_PUBLIC_`; never log/return them. A `lib/` module that reads a secret starts with `import "server-only"` (`__tests__/server-boundary.test.ts` enforces this).
- [ ] **Service-role client**: import `lib/supabase-admin.ts` only from route handlers/server-only modules — never from `"use client"` files or anything they import (the boundary test walks the import graph).
- [ ] **Admin route** (anything behind `LOGISTICS_PASSWORD`): `const denied = await checkAdminAuth(req)` from `lib/admin-auth.ts` first. It handles the session cookie, CSRF, the shared lockout, the legacy header and 2FA. Don't hand-roll auth.
- [ ] **Machine route** (`x-api-key`): `getClientIp` → `await isAuthBlocked(ROUTE, ip)` (from `lib/auth-lockout.ts`) → `safeEqual` against the env secret (401 if unset) → `await recordAuthFailure(ROUTE, ip)` **only when a key was actually sent**. Own `ROUTE` constant.
- [ ] **New public write route**: `rateLimit(name, ip, limit, window)` before any work; `429` + `Retry-After`.
- [ ] **Bodies**: never `req.json()` / `req.text()`. Use `readJsonBody(req, BODY_LIMITS.x)` or `readBodyText` from `lib/http.ts`, which caps bytes while streaming (413). Then require `isJsonObject(body)` before destructuring (`JSON.parse("null")` is valid JSON).
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

### 4.1 Admin authentication & sessions (`lib/session.ts`, `lib/two-factor.ts`, `lib/admin-auth.ts`, `app/api/auth/route.ts`)
- **Sign-in**: `POST /api/auth {password}`, same-origin required, behind the shared admin lockout (§4.3). A constant-time compare against `LOGISTICS_PASSWORD` then sets the session cookie with `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800 (8 h); Secure`. In production the cookie is named **`__Host-admin_session`**, so browsers refuse a copy set by any subdomain, or one without `Secure` or with a narrower `Path` (no cookie tossing or session fixation). Dev keeps `admin_session`, because plain-http dev servers can't set a Secure cookie. The password is never stored client-side (`AdminGate` deletes the old `sessionStorage._lk` on load).
- **Token**: `<expiresAtMs>.<nonce>.<HMAC-SHA256>`, key = SHA-256 of a version tag + `SESSION_SECRET` (fallback `SUPABASE_SERVICE_ROLE_KEY`) + `LOGISTICS_PASSWORD`. Consequences: unforgeable without server secrets; a stolen cookie can't be brute-forced offline into the password; **rotating the password signs everyone out**; no secret configured → sign-in returns 500 (fail closed).
- **Second factor (opt-in, `ADMIN_2FA=email`)**:
  1. The right password no longer earns a session. Instead the server emails a 6-digit code (from `crypto.randomInt`) to `ADMIN_2FA_EMAIL`, falling back to `SUMMARY_RECIPIENT_EMAIL`. Only the configured address is used, never one from the request.
  2. It answers `{authenticated:false, twoFactor:"email"}` and sets a 10-minute `__Host-admin_2fa` challenge cookie.
  3. `POST /api/auth {code}` with that cookie exchanges the code for the session.

  Properties:
  - **The challenge is stateless.** Its HMAC covers the expiry, a nonce and the code, under the session key with an `admin-2fa-v1` prefix. The code can't be recovered from the cookie, a challenge can never verify as a session (or the reverse), and rotating the password voids pending codes.
  - **Wrong codes count toward the same lockout as wrong passwords.** Malformed codes (not 6 digits) get a 400 and don't count.
  - **Sends are capped** at 5 codes per 15 minutes.
  - **The code stays out of the email subject**, so it doesn't show in lock-screen previews.
  - **The email doubles as an intrusion alarm.** An unrequested code means the password has leaked: rotate it.
  - **It fails closed.** With 2FA on, a missing Resend key or recipient returns 500, and a provider error returns 502. Neither issues a cookie; the factor is never skipped.
- **Session check**: `GET /api/auth` → `{authenticated}`. **Sign-out**: `DELETE /api/auth` clears the session and any pending challenge. Tokens are stateless, with no server-side revocation list; password rotation is the kill switch.
- **`await checkAdminAuth(req)`** (used by `/api/blog/posts`, `/api/projects`, `/api/analytics/stats`):
  1. Valid session cookie → allowed; non-GET/HEAD/OPTIONS additionally requires `isSameOriginRequest` (else **403**). A valid session skips the lockout, so an attacker tripping the lockout can't kick out a signed-in admin.
  2. Otherwise the request passes through the shared lockout check, then the `x-logistics-key` header is compared in constant time. The header is kept for scripts and backward compatibility. Custom headers can't be sent cross-site without CORS, so this path is CSRF-safe. A wrong key returns 401 and counts as a failure; a request **with no key** gets a 401 and isn't counted.
  3. **With `ADMIN_2FA=email` the header is refused outright, without being compared.** A password-only path would skip the factor, and comparing would turn the route into a password oracle.
- **Machine routes** keep `x-api-key` per-route secrets.

### 4.2 CSRF (`isSameOriginRequest` in `lib/security.ts`)
First layer: `SameSite=Strict` (browser won't send the cookie cross-site). Second layer: if `Sec-Fetch-Site` is present it must be `same-origin` (note `netlify.app` is a public suffix, so `same-site` siblings are rejected); else if `Origin` is present its host must equal `Host`; a request with neither isn't from a browser. Applied to cookie-authenticated writes and to sign-in/sign-out.

### 4.3 Brute-force damping & rate limits (`lib/auth-lockout.ts`, `lib/rate-limit.ts`)
| Limiter | Scope / key | Limit | Applies to |
|---|---|---|---|
| Admin password failures (per IP) | `admin-password` × IP bucket | 10 failures / 15 min → `429` | **one shared counter** for `/api/auth` (passwords and 2FA codes), `/api/blog/posts`, `/api/projects`, `/api/analytics/stats` |
| Admin password failures (global) | `admin-password` × all | 100 failures / 15 min across all IPs → `429` for new sign-ins | same |
| Machine-secret failures (per IP / global) | `<ROUTE>` × IP bucket / all | 10 / 100 per 15 min | `/api/blog/upload`, `/api/docs/upload`, `/api/email-summary` (each its own scope, since each has its own secret) |
| Track | `track` × IP bucket | 30 req / min → `429` + `Retry-After` | `POST /api/analytics/track` |
| Consent | `consent` × IP bucket | 20 req / min | `/api/consent` |
| Email sends | `email-send` × `"global"` | 10 successful-path sends / hour | `POST /api/email-summary` |
| 2FA code sends | `2fa-send` × `"global"` | 5 / 15 min | `POST /api/auth` with `ADMIN_2FA=email` |
| Sponsorship requests | `sponsorships-requests` × IP bucket | 10 / 10 min, checked **before** reading the body | `POST /api/sponsorships` |
| Sponsorship offers | `sponsorships-sends` × IP bucket | 3 valid offers / hour | same |
| Sponsorship recipient | `sponsorships-recipient` × SHA-256 of the email | 2 thank-you emails / day to one address | same (no email-bombing a stranger) |
| Sponsorship global | `sponsorships-global` × `"all"` | 20 offers / day | same (Resend quota, owner inbox) |

- **Two layers for auth failures.**
  - **Layer 1** is in-process and instant.
  - **Layer 2** is Postgres (`supabase/auth-lockout-schema.sql`: table `auth_failures`, plus RPCs `auth_failure_hit` / `auth_failure_counts` that only `service_role` can execute). It is shared by every serverless instance and survives cold starts.
  - Keys are `scope:ip:<HMAC prefix>`, keyed with `SESSION_SECRET` (or the service-role key), never the raw IP. An unkeyed hash of an IPv4 address could be reversed by hashing all 2^32 of them.
  - If the functions are missing or the database errors (or the client throws), the check falls back to layer 1 and warns once. It never locks everyone out or 500s.
  - `AUTH_LOCKOUT_STORE=memory` disables layer 2 (tests do this).
- **Only real guesses count.** A request without a credential (no header, empty or non-string password, oversized body, malformed 2FA code) gets its 401/400/413 but isn't recorded. Otherwise anyone could trip the global ceiling without guessing, and the owner could lock themselves out by clicking around Studio after the session expired.
- **Client IP** (`getClientIp`): `x-nf-client-connection-ip` (set by Netlify from the connection) → first `x-forwarded-for` entry (off-Netlify fallback, e.g. local dev) → `x-real-ip` → `"unknown"`. **Each value must parse as an IP (`net.isIP`, ≤64 chars) or it is skipped**, so header text never becomes a limiter key or a stored value. Used only for limits/exclusion, never authorization.
- **IP buckets** (`ipBucket`): IPv6 addresses count per **/64**, since one host usually controls a whole /64 and could otherwise rotate through 2^64 fresh buckets. IPv4-mapped IPv6 collapses to the IPv4 address. Applied to every per-client limiter and to the shared lockout keys.
- **Memory bound**: each limiter holds ≤10,000 keys; when full it drops expired buckets, then the oldest 10% (amortized O(1)).
- **Trade-off**: the global ceiling lets an attacker block *new* admin sign-ins for up to 15 min; existing sessions keep working. Request limiters (track, consent, email) stay per instance, which is acceptable for flood damping.

### 4.4 Input validation (`lib/validation.ts`)
`LIMITS`: title 300 · slug 200 · excerpt 1,000 · content 200,000 · tag 50 · tagCount 20 · coverEmoji 16 · page 300 · sessionId 100 · referrer 2,000 · userAgent 500 · emailSubject 500 · emailBody 500,000 · uploadBody 1,000,000 · projectTitle 200 · projectDescription 2,000 · category 80 · year 20 · url 500 · icon 16.
- **Body size** (`lib/http.ts`): every route reads its body through `readJsonBody` / `readBodyText`. These reject from `Content-Length` before reading, then count bytes while streaming (a missing or lying header doesn't help) and cancel the stream past the cap → **413**, before any parsing, DB work, email, or lockout counting. Caps (`BODY_LIMITS`): `tiny` 2 KB (`/api/auth`, `/api/consent`) · `track` 8 KB · `admin` 1 MB (`/api/blog/posts`, `/api/projects`) · `upload` 4 MB (`/api/blog/upload`, `/api/docs/upload`, `/api/email-summary`; the upload routes then also apply the 1M-character `LIMITS.uploadBody`).
- **Bodies**: every JSON route requires a plain object (`isJsonObject`) — `null`/arrays/scalars → 400 (previously an unhandled TypeError/500).
- **Tracked page paths** (`isValidPagePath`): URL path characters only. No protocol-relative `//host`, query, fragment, whitespace, markup, or non-ASCII; anything else → 400.
- **Blog slugs on read** (`getPostBySlug`): a URL segment that isn't a valid slug returns "not found" without querying Supabase. Post queries list their columns explicitly (no `select("*")`), so a future column never ships to browsers by default. (Posts inserted by hand in SQL with a non-conforming slug would become unreachable; both write paths already enforce the format.)
- **Ids**: PATCH/DELETE `id` and every bulk `ids[]` entry must be a UUID (`isUuid`).
- **Slugs**: `^[a-z0-9]+(?:-[a-z0-9]+)*$`; the upload webhook slugifies and re-validates, never trusts frontmatter raw.
- **URLs** (`link`, `github`): empty or `^https?://\S+$`.
- **Enums** (`theme`, `status`): normalized, never stored raw.
- **Tags**: array (or comma string) of non-empty strings; non-strings rejected.
- **Analytics**: strict types; out-of-range numbers → `null`; UA from the header; **referrer reduced to its origin** (http/https only, else `""`).
- **Docs filenames**: `^[A-Za-z0-9][A-Za-z0-9._ -]{0,198}\.md$`.
- **Sponsorship offers** (`lib/sponsorship.ts`, shared by the form and the route):
  - **Email:** a strict pattern with no spaces, quotes, `?`, `&`, `%`, or CR/LF, so no header or mailto tricks (in a `mailto:` link, `%3F` and `%26` decode to `?` and `&`).
  - **Affiliation:** at most 120 characters, control characters stripped, and **no URLs or domain-shaped text**. Mail clients auto-link domains, and this text goes to a typed-in address.
  - **Offer:** $1–$1,000,000 with at most 2 decimals. **Spot:** from a fixed list (`SPOT_CHOICES`: four lid spots, two palm-rest spots, or "any").
  - **File:** at most 4 MB, and **sniffed by its magic bytes**: PNG or JPEG only (WebP and PDF were dropped on 2026-11-03, since every sticker can now be drawn on `/laptop`). SVG and everything else are refused, whatever the name or declared type. The file name is shown only after cleaning (no path or reserved characters).
  - **Pixel size (S-44):** read from the PNG `IHDR` chunk or the JPEG frame header without decoding: 64–8,000 px on a side and at most 40 megapixels. A few-KB file can declare a huge canvas that would stall every visitor's browser once drawn on `/laptop`.
- **Studio spot edits** (`lib/sponsor-spots.ts`, `app/api/sponsorships/spots`): the spot id must be one of the six (`isSlotId`), offer ids must be UUIDs, and the sponsor text is bounded (name 60, mark 6, tagline 80, description 400) with `theme` from the three accents. The PATCH builds the row from those fields only, and every check that can refuse the request runs **before** a file is copied or a row is written. Uploaded spot images get the same type and pixel checks as offers.
- **Stored file paths:** the file routes serve only `offers/<id>/sticker.(png|jpg)` or `spots/<spot>/<id>.(png|jpg)` (`STORED_FILE_RE`, lowercase, no `..`), whether the path comes from a query string or from a row edited by hand.
- **Front matter** (`/api/blog/upload`): gray-matter called with `MATTER_OPTIONS`, which replaces the `js`/`javascript` engines (gray-matter `eval`s those by default) with a refusal → 400. YAML uses `safeLoad`; JSON is `JSON.parse`; unregistered languages throw → 400. Passing options also disables gray-matter's unbounded per-input cache.

### 4.5 HTTP headers (`next.config.ts`)
All routes (`/:path*`):
| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'` (+`'unsafe-eval'` dev only)`; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self' <this project's Supabase origin>; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `accelerometer, browsing-topics, camera, display-capture, geolocation, gyroscope, hid, idle-detection, magnetometer, microphone, midi, payment, screen-wake-lock, serial, usb, xr-spatial-tracking` all `=()` (clipboard and fullscreen stay allowed) |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains` |
| Cross-Origin-Opener-Policy | `same-origin` |
| X-Permitted-Cross-Domain-Policies | `none` |
| X-DNS-Prefetch-Control | `on` |

**3D assets (`/laptop`).** No header changes were needed for Three.js. WebGL needs no CSP source. The GLB is a same-origin `fetch`. Sticker, screen and keyboard artwork is drawn on canvases, so it makes no requests. The bezel's `KHR_materials_specular` is a plain material extension that GLTFLoader reads itself (no decoder).
- **Embedded textures:** `GLTFLoader` normally decodes them by `fetch()`ing a `blob:` URL, which `connect-src 'self'` blocks. The viewer swaps it to `TextureLoader`, which uses an `<img>` that `img-src blob:` already allows. This was verified with a textured QA model: no CSP violations.
- **Compressed geometry:** Draco, meshopt and KTX2 decoders need WebAssembly and workers, which the CSP doesn't allow (`script-src` has no `wasm-unsafe-eval`, and there is no `worker-src`). LAPTOP_MODEL.md requires uncompressed exports, so **don't loosen the CSP to load a model; re-export it instead.**

**Sponsor sticker images.** No header changes. `/laptop` and the 3D viewer load sticker images from this origin (`/laptop/stickers/<spot>`, Studio's `/api/sponsorships/file`), so `img-src 'self'` covers them, WebGL textures aren't tainted, and the private bucket never needs CORS. The public route sits outside `/api` so it can carry its own `Cache-Control: public, max-age=300`; it 404s anything not currently shown.

**Cloudflare Turnstile (the sponsorship form's spam check, S-40).** Only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set at build time, `script-src` gains `https://challenges.cloudflare.com` and `frame-src https://challenges.cloudflare.com` is added; otherwise the CSP is unchanged (a test covers both). It has to be site-wide: a page reached by client-side navigation keeps the CSP of the page the visit started on. The token is verified server-side, so `connect-src` doesn't change. The widget's script loads only when the offer dialog opens.

**`connect-src`** is built from `NEXT_PUBLIC_SUPABASE_URL` at build time: exactly that origin, https only (http allowed in dev). It used to be `https://*.supabase.co`, which let script that slipped past sanitization send data to *any* Supabase project, including an attacker's. If the variable is unset or malformed, `connect-src` is just `'self'` (fails closed).

Plus: `/api/:path*` → `Cache-Control: no-store, max-age=0`, `X-Robots-Tag: noindex, nofollow` and `Cross-Origin-Resource-Policy: same-origin` (another site can't pull an API response into its process via `<script>`/`<img>`); `/studio/:path*`, `/logistics/:path*` → `X-Robots-Tag: noindex, nofollow` (and `robots` metadata in their layouts). `poweredByHeader: false` removes `X-Powered-By`. Verified on a production build (2026-10-19): no prerendered page contains an inline `on*=` attribute, so `script-src-attr 'none'` breaks nothing. (The Contact form's `action="javascript:throw …"` is React's intentional pre-hydration guard.)

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
| `page_views` | ✅ (verified live 2026-10-21) | none | none |
| `consent_events` | ✅ | none | none |
| `auth_failures` (after `auth-lockout-schema.sql`) | ✅ | none; its two functions are `service_role`-only | none |
| `sponsor_offers` (after `sponsorships-schema.sql`) | ✅ | none | none (service role only: the public form inserts through the API) |
| `sponsor_spots` (after `sponsorships-schema.sql`) | ✅ | none | none (`/laptop` reads it server-side and shows visible spots only) |
| Storage bucket `sponsor-stickers` (after `sponsorships-schema.sql`) | n/a | **private** bucket; 4 MB cap; PNG/JPEG only | **none**, so only the service role can read or write. The schema file's verify query lists any unscoped `storage.objects` policy, which would apply to every bucket including this one. |

`update_updated_at()` gets `search_path = ''` (Supabase advisor `function_search_path_mutable`), and so do the lockout functions. Public queries also filter `published = true` in code.
- **2026-10-19, anon key:** drafts, hidden projects and `project_documents` returned 0 rows, but `page_views` returned 295 rows (S-1).
- **2026-10-21, anon key:** `page_views`, `consent_events` and `project_documents` all return `42501 permission denied`.

**Project-wide** (outside this app's tables, found 2026-10-21; S-23):
- **Sign-ups:** email/Google/GitHub sign-ups are open and auto-confirmed, so anyone can become `authenticated`.
- **Storage:** buckets `ahc-test`, `blog-assets` and `jackpot-photos` are public, with no size or MIME limits.

The project may be shared with other apps. `supabase/audit-exposure.sql` is a read-only audit (RLS, policies, grants, RPC-executable functions, RLS-bypassing views, buckets, storage write policies, accounts) with commented-out fixes.

### 4.8 Information leakage
DB/provider errors logged server-side with a `[route]` prefix; clients get generic messages. `/api/analytics/stats` returns `yourIp`/`excludedIps` only to an authenticated admin. No `X-Powered-By`. Admin API responses are `no-store`.

### 4.9 Email abuse (`/api/email-summary`, `/api/sponsorships`)
**`/api/email-summary`:** the recipient is fixed to `SUMMARY_RECIPIENT_EMAIL` (no relay). Sends are capped at 10 per hour, counted only for valid requests. The Resend client is created per request, so a missing `RESEND_API_KEY` returns a 500 instead of crashing the module at import.

**`/api/sponsorships`** is the one route that emails an address a stranger typed in, so it gets the most guards:
- **Recipients are fixed per message.** The owner's notice goes to `SUMMARY_RECIPIENT_EMAIL`, with Reply-To set to the sponsor and the sticker attached. The thank-you copy goes **only** to the address in the form, with Reply-To set to the public `/contact` address (or `SPONSOR_REPLY_TO`). The private summary inbox is never exposed.
- **Caps:** §4.3, including **2 thank-you emails per recipient per day**.
- **Content:** every visitor value is HTML-escaped. The affiliation can't contain web addresses. The sponsor's copy omits the original file name, which could be domain-shaped. The only link built from input is the owner's `mailto:` to the validated address.
- **Bots:** a honeypot field gets a fake "ok" and nothing is stored or sent.
- **Failures:** if the owner's notice fails, the visitor gets a generic 502 and no copy is sent. If only the copy fails, the response says `confirmationSent: false` and the page tells the visitor honestly. With the Resend sandbox sender, that is every time until a domain is verified (S-2).
- **Spam check (optional, S-40):** with `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set, every offer needs a Cloudflare Turnstile token, verified by `lib/turnstile.ts` after field validation (so a typo doesn't spend the single-use token) and before any cap, storage or email. No token or a rejected one → `400 {captcha:true}`; Cloudflare unreachable → `503` (fails closed). A secret without a site key logs once, since nobody could pass.
- **Limitation:** until those keys are set, the caps are the only limit, and they're in-memory per instance, so a distributed sender gets more.

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
| `/api/auth` | GET, POST, DELETE | POST: password → session cookie; with `ADMIN_2FA=email`, password → emailed code → session | shared admin lockout; POST/DELETE same-origin only; body ≤2 KB; 5 codes/15 min | session cookie, 2FA challenge cookie |
| `/api/analytics/track` | POST | none (public); **requires a `java_consent` analytics opt-in cookie** to store anything | 30/min/IP; body ≤8 KB | `page_views` insert (with IP, language, timezone, and visitor id for consenting visitors) |
| `/api/consent` | POST, DELETE | none (public); same-origin only | 20/min/IP; body ≤2 KB | `consent_events` insert; DELETE removes the caller's own `page_views` rows |
| `/api/analytics/stats` | GET | session cookie **or** `x-logistics-key` (header refused under 2FA) | shared admin lockout | — |
| `/api/blog/posts` | GET, POST, PATCH, DELETE | session cookie **or** `x-logistics-key` (header refused under 2FA) | shared admin lockout; cookie writes same-origin only; body ≤1 MB | `posts` (bulk delete ≤100) |
| `/api/projects` | GET, POST, PATCH, DELETE | session cookie **or** `x-logistics-key` (header refused under 2FA) | shared admin lockout; cookie writes same-origin only; body ≤1 MB | `projects` (bulk delete ≤100) |
| `/api/blog/upload` | POST | `x-api-key` → `BLOG_UPLOAD_SECRET` | lockout; body ≤4 MB / 1M chars | `posts` upsert on slug |
| `/api/docs/upload` | POST | `x-api-key` → `DOCS_UPLOAD_SECRET` | lockout; body ≤4 MB / 1M chars | `project_documents` upsert |
| `/api/email-summary` | POST | `x-api-key` → `EMAIL_SUMMARY_SECRET` | lockout + 10 sends/hr; body ≤4 MB | Resend send |
| `/api/sponsorships` | POST (multipart) | none (public); same-origin only; honeypot; a Turnstile token when configured (S-40) | 10 req/10 min, 3 offers/hr per client, 2 emails/day per recipient, 20/day overall; body ≤4.25 MB, file ≤4 MB (magic bytes, pixel size) | `sponsor_offers` insert + private bucket `sponsor-stickers` (`offers/<id>/sticker.*`); 2 Resend sends (owner notice + sponsor copy) |
| `/api/sponsorships` | GET, PATCH, DELETE | session cookie **or** `x-logistics-key` (header refused under 2FA) | shared admin lockout; cookie writes same-origin only; body ≤1 MB | `sponsor_offers` (`status`, `notes` only); DELETE also removes the offer's `offers/` file |
| `/api/sponsorships/spots` | GET, PATCH, POST (multipart) | session cookie **or** `x-logistics-key` (header refused under 2FA) | shared admin lockout; cookie writes same-origin only; JSON ≤1 MB, image ≤4 MB | `sponsor_spots` upsert; bucket `spots/<spot>/<id>.*` (copy or upload, old image removed); offer marked accepted; revalidates `/laptop` |
| `/api/sponsorships/file` | GET | session cookie **or** `x-logistics-key` | shared admin lockout; `path` must match `STORED_FILE_RE` | — |
| `/api/laptop/spots` | GET | none (public) | served from the ISR cache (≤1 rebuild/min) | — (visible spots only) |
| `/laptop/stickers/<spot>` | GET | none (public) | cached 5 min | — (a visible spot's image; otherwise 404) |
| `/.well-known/security.txt` | GET | none (public) | — | — (RFC 9116 contact; `Expires` 180 days ahead, computed per request) |

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
| `RESEND_API_KEY` | Send from the Resend account | `/api/email-summary`, 2FA codes | Resend dashboard |
| `TURNSTILE_SECRET_KEY` (optional) | Verifying the sponsorship form's spam check | `lib/turnstile.ts` | Cloudflare dashboard → Turnstile → the widget → Rotate secret key |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design — RLS + grants protect data (hence S-1 matters).

**Security settings (not secrets)**:

| Variable | Effect |
|---|---|
| `ADMIN_2FA` | `email` turns on the emailed second factor for admin sign-in and disables `x-logistics-key`. Any other value or unset means off. |
| `ADMIN_2FA_EMAIL` | Where 2FA codes go (default `SUMMARY_RECIPIENT_EMAIL`). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public. Shows the Turnstile widget on the offer form and adds Cloudflare's origin to the CSP. Baked in at build time, so redeploy after changing it. |
| `AUTH_LOCKOUT_STORE` | `memory` skips the shared Postgres lockout (tests only). Leave unset in production. |
| `SECURITY_CONTACT` | Email or `https://` URL for `security.txt` (default: the address on `/contact`). |
**Rotation procedure**: generate (`openssl rand -base64 32`) → update Netlify env → redeploy → update `.env.local` and external clients → revoke the old value at the provider. Rotate immediately if a secret was ever pasted into a chat, script, shortcut, log, or commit.

## 7. Issue queue

Status key: ✅ fixed in code (live after deploy) · 🟡 fix ready — needs your action · 🟠 partially mitigated · 🔴 open (needs external work or a product decision)

### Tally (2026-10-21 sweep)
| | Count |
|---|---|
| Open items in the queue **before** this sweep (S-1, S-2, S-4, S-5, S-6, S-7, S-12, S-22) | **8** |
| New issues found during this sweep (S-23 – S-37) | **15** |
| Total items worked | **23** |
| ✅ Fixed (S-1 and S-22 confirmed live, plus S-24 – S-36) | **15** |
| 🟡 Fix ready, needs you (S-4: run one SQL file; S-6: set one env var) | **2** |
| 🟠 Partially mitigated (S-5, S-7) | **2** |
| 🔴 Still open: external or your decision (S-2, S-12, S-23, S-37) | **4** |
| Remaining open after this sweep | **8** of 23 |

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
| **S-1** | `page_views` RLS disabled → anyone with the public anon key can read/insert/edit/delete analytics (verified live: 295 rows readable) | ✅ | `supabase/security-hardening.sql` was run. Verified live 2026-10-21: anon gets `42501 permission denied` on `page_views`, `consent_events`, `project_documents`. |
| S-2 | Resend sender domain unverified (sandbox sender) | 🔴 | Add DNS records in the Resend dashboard for a domain you own, then set `RESEND_FROM_EMAIL`. A Netlify subdomain can't be verified. **Since 2026-10-30 this also blocks the sponsor's thank-you email**: the sandbox only delivers to the Resend account owner. The owner's notice still works, and the page tells sponsors no copy was sent. Code fails closed if the key is missing. |
| **S-3** | Rate-limit keys spoofable via `X-Forwarded-For` (verified live: forged XFF accepted as client IP) | ✅ | `getClientIp` prefers Netlify's `x-nf-client-connection-ip`; new global per-route failure ceiling caps guesses regardless of IP. **After deploy, verify**: `/logistics` "Your current IP" shows your real IP even if you send a forged `X-Forwarded-For`. |
| S-4 | Rate limiting in-memory per serverless instance | 🟡 | **Auth lockouts now have a shared Postgres layer**, with no new account needed (2026-10-21, `lib/auth-lockout.ts`). Run `supabase/auth-lockout-schema.sql` to switch it on; until then it falls back to per-instance counting and warns once. Request limiters (track, consent, email) stay per instance, which is acceptable for flood damping. |
| S-5 | Analytics privacy / retention / notice | 🟠 | Done: referrer stored as origin only (2026-10-19); **opt-in consent enforced server-side, `/privacy` policy, Cookie settings, and self-service erasure (2026-10-20)**. Ready but commented out in the hardening SQL: a pg_cron retention job. Open: pick a retention window (PRD Q4). This matters more now that IPs are stored for consenting visitors. Not legal advice. |
| S-6 | Single-factor static password, no server session, password in `sessionStorage` | 🟡 | Done 2026-10-19: password exchanged once for an HttpOnly/SameSite=Strict/Secure 8 h session; sign-out; CSRF checks; password no longer readable by page scripts. **Done 2026-10-21: emailed one-time code as a second factor (§4.1), off by default.** Set `ADMIN_2FA=email` in Netlify to turn it on (it uses the existing `RESEND_API_KEY` and `SUMMARY_RECIPIENT_EMAIL`). |
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
| **S-22** | Medium | anon/authenticated retain INSERT/UPDATE/DELETE grants on `posts`/`projects` (only RLS stands in the way); trigger function `search_path` mutable | ✅ | `supabase/security-hardening.sql` was run (see S-1). Section 3 of `supabase/audit-exposure.sql` confirms the grants at any time. |

### Found in the 2026-10-21 sweep
| ID | Severity | Issue | Status | Fix |
|---|---|---|---|---|
| S-23 | Medium | **Supabase project settings**: email/Google/GitHub sign-ups are open and auto-confirmed (anyone can become `authenticated`). Buckets `ahc-test`, `blog-assets`, `jackpot-photos` are public with no size or MIME limits. The project looks shared with other apps. | 🔴 | Your call, per app. Run the read-only `supabase/audit-exposure.sql` and act on what it shows: disable sign-ups if nothing uses Supabase Auth, set bucket limits, and drop write policies for `authenticated` (the fixes are commented at the end). |
| **S-24** | Medium | Unbounded request bodies: every route buffered the whole body (`req.json()` / `req.text()`) before validating it, including the public `track`/`consent` routes and `/api/auth`, so each request could make a function read and parse megabytes | ✅ | `lib/http.ts`: byte cap from `Content-Length`, enforced while streaming → 413 before any work. Per-route caps in §4.4. |
| **S-25** | Medium | The admin password had **four separate lockout counters** (`/api/auth`, blog posts, projects, stats), giving 40 guesses per IP and 400 globally per window instead of 10 / 100 | ✅ | One `admin-password` scope for all four, and for 2FA codes. A test spreads guesses across routes. |
| **S-26** | Low | Requests with **no credential** counted as failures: anyone could trip the global ceiling without guessing, and the owner locked themselves out by using Studio after the session expired | ✅ | Only real guesses are recorded (§4.3). |
| **S-27** | Medium | Per-IP limits keyed on the exact IPv6 address: an attacker controlling a /64 (typical) got ~2^64 fresh buckets for the login lockout and the `track` flood limit | ✅ | `ipBucket`: IPv6 counted per /64, IPv4-mapped collapsed. |
| **S-28** | Low | `getClientIp` passed any header text through (off-Netlify), letting arbitrary strings become limiter keys and stored values | ✅ | Each header must parse as an IP (`net.isIP`, ≤64 chars). |
| **S-29** | Low | Both Supabase clients ran with default auth: the browser client would adopt a session from a crafted `#access_token=` link (session planting) and persisted auth state | ✅ | `persistSession`, `autoRefreshToken`, `detectSessionInUrl` all off; the site never signs visitors in. |
| **S-30** | Medium | CSP `connect-src https://*.supabase.co` let script that slipped past sanitization exfiltrate to **any** Supabase project | ✅ | Exactly this project's origin, from `NEXT_PUBLIC_SUPABASE_URL`, and fails closed to `'self'`. Verified in a browser that the blog still loads. |
| **S-31** | Low | Header gaps: Permissions-Policy covered 4 features; no `X-Permitted-Cross-Domain-Policies`; no CORP on API responses | ✅ | 16 features denied; `X-Permitted-Cross-Domain-Policies: none`; `Cross-Origin-Resource-Policy: same-origin` on `/api/*`. |
| **S-32** | Low | `/api/analytics/track` stored any string starting with `/` as the page: protocol-relative `//evil.com`, markup, and query strings carrying emails or tokens | ✅ | `isValidPagePath` allowlist. |
| **S-33** | Low | `getPostBySlug` sent any URL segment to the database and selected `*`, so a future column would have shipped to every browser | ✅ | Slug validated first; explicit column list. |
| **S-34** | Low | Session cookie without the `__Host-` prefix: a compromised sibling subdomain could plant or overwrite it | ✅ | `__Host-admin_session` (and `__Host-admin_2fa`) in production. |
| **S-35** | Medium | Modules holding secrets (`supabase-admin`, `session`, `admin-auth`, …) had no build-time guard: one stray import from a Client Component would bundle service-role code for browsers | ✅ | `import "server-only"` in every such module, plus `__tests__/server-boundary.test.ts`, which walks the import graph from every `"use client"` file. |
| **S-36** | Info | No `/.well-known/security.txt` (§9 promised one) | ✅ | RFC 9116 route; contact overridable with `SECURITY_CONTACT`. |
| S-37 | Info | The GitHub repository is public, so this file's open-issue queue tells anyone which weaknesses are still open | 🔴 | Your decision: make the repo private, or keep open items out of the public copy and use GitHub's private vulnerability reporting. |

### Found after the sweep (2026-10-30)
| ID | Severity | Issue | Status | Fix |
|---|---|---|---|---|
| **S-38** | **Critical** (per advisory) | **`next` 16.0.0–16.4.0**: unauthenticated RCE in the Image Optimization API when SVGs are used (GHSA-2464-fhr4-w9xw); DoS in the App Router via Server Actions (GHSA-p3m5-59mp-jv5r); RCE in `use cache` functions returning typed arrays (GHSA-673q-mjm6-r5xr). Published after the 16.3.8 pin. | ✅ | Upgraded `next` and `eslint-config-next` to **16.4.2** (PR #5, merged and deployed 2026-11-03; `/laptop` and the rest of the merged code are live). `npm audit` shows no critical, high or moderate advisories. |
| S-40 | Medium | The public sponsorship form had no CAPTCHA. A honeypot, per-client/per-recipient/global caps, link-free text and escaping bound the abuse, but the caps are per serverless instance, so a determined, distributed sender could still push unwanted thank-you emails to strangers. | 🟡 | **Built 2026-11-03:** an optional Cloudflare Turnstile check (`lib/turnstile.ts`, `app/laptop/Turnstile.tsx`), verified server-side, failing closed, with the CSP widened only while it's on. Switch it on with two env vars (below). |
| S-39 | Low | `deepmerge` prototype poisoning (GHSA-gcqx-w48m-w2h4), reached through `resend` → `@react-email/render` → `html-to-text`. | ✅ | `resend` 4.8.0 → **6.34.1** (2026-11-03), where `@react-email/render` is an optional peer that isn't installed. The remaining `deepmerge` is Jest's (dev only). |

### Found in the 2026-11-03 patch
| ID | Severity | Issue | Status | Fix |
|---|---|---|---|---|
| S-41 | Low | `/blog` printed the raw Supabase error message to visitors when loading failed; it can name tables, columns or policies | ✅ | Generic message for visitors; the detail goes to the console |
| S-42 | Low | The offer form's email pattern allowed `%`, so `%3F` / `%26` could smuggle `?` / `&` into the owner's `mailto:` link | ✅ | `%` refused (test added) |
| S-43 | Info | Home rendered project rows as stored: a row edited by hand in the Supabase dashboard could crash the page or carry a non-http(s) link | ✅ | `normalizeProject()` coerces status/theme/tags and drops non-http(s) links |

### Found while building Studio sponsorships (2026-11-03)
| ID | Severity | Issue | Status | Fix |
|---|---|---|---|---|
| S-44 | Low | Sticker uploads were checked for type and byte size, but not pixel size. Once stickers are drawn on `/laptop`, a small PNG declaring a 50,000 × 50,000 canvas (a "decompression bomb") would make every visitor's browser try to allocate gigabytes. | ✅ | `imageSize()` reads the declared size from the header without decoding; the form route and Studio's upload refuse anything outside 64–8,000 px a side or over 40 MP (tests added). |

### How to finish the 🟡 items (≈3 minutes)
1. **S-4:** Supabase dashboard → **SQL Editor** → New query → paste `supabase/auth-lockout-schema.sql` → **Run**. Its last two result sets should show `rowsecurity = true`, with only `postgres` and `service_role` able to execute the two functions.
2. **S-6 (optional, recommended):** Netlify → Site configuration → Environment variables → add `ADMIN_2FA` = `email` → redeploy. The next sign-in asks for the emailed code. Scripts using `x-logistics-key` stop working while it's on.
3. **S-23:** paste `supabase/audit-exposure.sql` the same way and read each result tab. It changes nothing.
4. **S-40 (optional, recommended once S-2 is done):** Cloudflare dashboard → **Turnstile** → **Add widget** → hostname `javastudios.netlify.app`, widget mode **Managed** → copy the **site key** and **secret key**. In Netlify → Environment variables, add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (site key) and `TURNSTILE_SECRET_KEY` (secret) → **redeploy** (the site key and the CSP allowance are built in at build time). The "Sponsor a spot" dialog then shows the check, and an offer without it gets a 400.

## 8. History

### 2026-11-03: Studio sponsorships (branch `studio-sponsorships`)
Offers are now saved for Studio, and Studio controls what `/laptop` shows.
- **New data, all private:** `sponsor_offers` and `sponsor_spots` (RLS on, no policies, anon/authenticated revoked, also covered by `security-hardening.sql`), and the `sponsor-stickers` bucket narrowed to PNG/JPEG. Run `supabase/sponsorships-schema.sql` ([SPONSORSHIPS.md](SPONSORSHIPS.md)); until then the form still emails and `/laptop` shows the built-in samples.
- **New routes (§5):** admin `GET/PATCH/DELETE /api/sponsorships`, `/api/sponsorships/spots` and `/api/sponsorships/file`, all behind `checkAdminAuth`; public `/api/laptop/spots` and `/laptop/stickers/<spot>`, which expose only visible spots.
- **What the public can now see:** a shown sponsor's name, mark, tagline, description, colour and image. Never: offers, emails, amounts, notes, hidden spots, or files that haven't been placed and shown. Placing an offer's sticker starts it **hidden**, so nothing reaches `/laptop` without a second, deliberate switch.
- **Spot images are copies** (`spots/…`), so deleting an offer can't break `/laptop`, and clearing a spot can't delete an offer's file.
- **Fixed:** S-44 (pixel limits). An offer row holds what the form asked for and nothing else: no IP address or user agent (tested).
- **Verified:** 915 tests, `tsc`, lint and build.

### 2026-11-03: Security patch (branch `security-patch`)
A whole-app audit after PRs #4 and #5 merged: code, configuration, dependencies, the Supabase SQL, the live deployment's headers and caching, and the full git history.
- **No open critical issue.** The only critical item, S-38, was fixed by PR #5 and is deployed. No secret was ever committed (the history's `process.env.X = "…"` lines are all test fixtures), the API bypasses Netlify's cache in production, and the lockout functions are executable by `service_role` only.
- **Fixed:** S-40 built (optional Turnstile, fails closed), S-39 (`resend` 6.34.1), S-41 (raw DB errors on `/blog`), S-42 (`%` in the offer email), S-43 (hand-edited project rows).
- **Docs:** this file still called S-38 open after the merge; corrected.
- **Verified:** 783 tests, `tsc`, lint and build; Turnstile end to end in headless Edge with Cloudflare's public test keys (always-pass and always-fail secrets) against a local production server with junk Resend and Supabase keys, so nothing was sent or stored.

### 2026-11-03: inside the laptop (branch `laptop-sponsorships`)
- **No new attack surface.** The open/close animation, screen and keyboard are client-side drawing from static data; the CSP is unchanged.
- **The offer form accepts two more spot values** (`palm-left`, `palm-right`), still from the fixed `SPOT_CHOICES` list that the route validates; anything else is refused (tested). Spot labels in emails come from that list, never from input.

### 2026-10-30: "Sponsor a spot" offer form (branch `laptop-sponsorships`)
The first public route that accepts files and emails a typed-in address. Controls are in §4.3, §4.4, §4.7 and §4.9: same-origin only, honeypot, flood/offer/recipient/global caps, byte-capped multipart parsed only after the cap, magic-byte file checks (no SVG), link-free text, escaped HTML emails, Reply-To routing that never exposes the private inbox, and a **private** bucket with no policies.
- **No payment, no accounts.** Nothing is public: stored offers are reachable only with the service role.
- **Verified end to end against a local production server** running with junk Resend and Supabase keys, so nothing could be sent or stored: the 403, 415, 413, 400 (fields and a disguised SVG), honeypot and 502 paths. The form UI was driven in headless Edge with the API intercepted.
- **The shared `Modal` gained a focus trap and focus return**, closing a long-standing DESIGN_SYSTEM §9.3 gap for every modal.
- **New open items:** S-40 (CAPTCHA). S-2 now blocks the sponsor's copy.

### 2026-10-30: `/laptop` 3D sponsor stickers (branch `laptop-sponsorships`)
- **No new attack surface:** no database, payment, upload, or write API.
- **Sponsor data** is static sample data rendered as text (no HTML injection path). The only call to action links to `/contact`.
- **Three.js** is a new exact-pinned runtime dependency (`three` 0.186.1). It loads only on `/laptop`, and the CSP is unchanged (§4.5).
- **`npm audit`** at install time surfaced S-38 and S-39. Neither comes from `three`.

### 2026-10-21: Security sweep (branch `security-sweep`)
A whole-app pass covering code, configuration, headers, the live deployment, and the Supabase project as seen from outside. Of 8 open queue items, 2 were confirmed fixed and 2 moved to "ready, needs you". 15 new issues were found; 13 are fixed in code and 2 need your decision (§7).
- **Auth:**
  - One shared lockout scope for the admin password, backed by Postgres across instances.
  - Only real guesses count.
  - IPv6 counted per /64, and IP headers validated.
  - `__Host-` cookies.
  - Optional emailed second factor, which disables the password header while on.
- **Requests:** byte-capped body reading on every route, page-path validation on `track`, and slug validation plus explicit columns for blog reads.
- **Boundary:** `server-only` guards and an import-graph test.
- **Supabase clients:** never adopt or persist sessions.
- **Headers:** project-only `connect-src`, a wider Permissions-Policy, `X-Permitted-Cross-Domain-Policies`, and CORP on the API.
- **Disclosure:** `/.well-known/security.txt`.
- **Supabase project:** read-only `supabase/audit-exposure.sql` for the project-level findings (S-23).
- **Tests:** 407 → 554 across 29 suites, with tsc, lint and the production build clean.
- **End to end on a local production server, with the lockout kept in memory so nothing was written to the database:**
  - 17 API checks: body caps, forged paths, the `__Host-` cookie attributes, the cross-route lockout, and a session surviving a lockout.
  - 2FA fail-closed checks, both with email unconfigured and with the provider refusing.
  - Headless-Edge checks: every public page loads with no CSP or Permissions-Policy console errors, the blog still reads from Supabase under the narrowed CSP, an invalid slug makes no query, and the 2FA step renders on desktop and mobile.

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
Email the address on the site's `/contact` page, which is also in [`/.well-known/security.txt`](https://javastudios.netlify.app/.well-known/security.txt), with the subject "Security". Please don't open a public GitHub issue for an unfixed vulnerability.
