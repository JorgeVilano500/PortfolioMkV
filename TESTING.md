# Testing

_How the project is tested, what's covered, how to write new tests, and how to verify changes that tests can't reach. Last verified: **2026-10-21**._

---

## 1. Quick reference

```bash
npm test                                   # all suites (Jest)
npm run test:watch                         # watch mode
npx jest __tests__/api-projects.test.ts    # one file
npx jest -t "mass assignment"              # tests whose name matches
npx jest --coverage                        # coverage report → ./coverage (gitignored)
npx tsc --noEmit                           # type-check
npm run lint                               # ESLint (Next 16's `next build` does NOT lint)
```

**Definition of done** for any change: `npm test`, `npx tsc --noEmit`, and `npm run lint` all pass, and UI changes have been through the manual QA in §7. There is no CI yet (§8), so nothing else will catch a regression.

## 2. Setup

| Item | Value | Why |
|---|---|---|
| Runner | Jest 30 | |
| Transform | `babel-jest` with `@babel/preset-env` (targets current Node) and `@babel/preset-typescript`, **configured inline in `jest.config.js`** | A root `babel.config.js` would make Next.js drop SWC. **Never add one.** |
| Environment | `testEnvironment: "node"` | Every test exercises server code (route handlers and pure libs) |
| Test files | `testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"]` | `.tsx` suites are component tests |
| JSX | `@babel/preset-react` (automatic runtime) in the inline Babel config | Needed for `.tsx` suites |
| DOM | `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/dom` (dev only) | Opt in per file with `/** @jest-environment jsdom */` as the **first line**; everything else stays on `node` |
| Path alias | `moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" }` | Matches the tsconfig `@/*` alias |
| `server-only` | `moduleNameMapper: { "^server-only$": "<rootDir>/__tests__/helpers/server-only.ts" }` (an empty module) | Next resolves `import "server-only"` itself; plain Node has no such package |
| Setup | `setupFiles: ["<rootDir>/__tests__/helpers/setup-env.ts"]` sets `AUTH_LOCKOUT_STORE=memory` | Keeps the lockout off the (mocked) database; `lib-auth-lockout.test.ts` opts back in |
| Mocks | `clearMocks: true` | Call history is reset between tests |
| Type checking | Babel strips types without checking them | Run `npx tsc --noEmit` separately |

The bundled Next.js guides for alternatives (Vitest, Playwright, Cypress) are in `node_modules/next/dist/docs/01-app/02-guides/testing/`.

## 3. Current suites

**Baseline (2026-10-21, security sweep): 554 tests, 29 suites, all passing, about 7 s.** Update these numbers when they change, and update AGENTS.md §3 too.

Added or extended on 2026-10-21 (security sweep):
| Suite | Tests | Covers |
|---|---|---|
| `lib-two-factor.test.ts` | 27 | Code ↔ token round-trip; the code never appears in the token; wrong code, expiry, edited expiry, password rotation all fail; **a challenge never verifies as a session and the reverse**; fails closed without secrets; malformed tokens; code distribution; `normalizeCode`; enable/configured flags |
| `api-auth-2fa.test.ts` | 20 | With `ADMIN_2FA=email` (Resend mocked): the password emails a code instead of signing in. The code goes only to the configured owner, stays out of the subject, and the email names the IP. The challenge cookie is HttpOnly/Strict/10 min. No email for a wrong password. **Fails closed** without email config (500) or on a provider error (502). 5-code send cap. The right code → session and challenge cleared; spaced input accepted; wrong code 401; a code without the challenge 401. **Wrong codes trip the lockout**, malformed codes don't count. Sign-out clears the challenge. **`x-logistics-key` refused, with identical answers for right and wrong passwords**, and a two-factor session works on the admin API |
| `body-limits.test.ts` | 17 | Every body-reading route (auth, consent, track, posts, projects, both uploads, email) returns **413 with no DB write or email** past its cap, both streamed and declared via Content-Length; oversized sign-ins aren't counted as guesses |
| `lib-http.test.ts` | 13 | Under/at/over the cap; Content-Length rejection without reading; **stream cancelled once the cap is crossed** (no full read); bytes not characters; bogus Content-Length; JSON 400/413; never throws on a broken stream |
| `server-boundary.test.ts` | 12 | Walks the import graph of `app/`, `components/`, `lib/`. Every secret-holding module keeps `import "server-only"`; every module reading a secret env var is server-only or a route handler; **no `"use client"` file reaches server-only code**; a positive control proves the walker follows imports |
| `lib-auth-lockout.test.ts` | 13 | With `AUTH_LOCKOUT_STORE=supabase` and `rpc` mocked: per-IP and global keys; **raw IP never sent, and the IP hash is keyed with a server secret** (not reversible by enumerating IPv4); distinct keys per IP and scope; blocks on another instance's count; just-under stays open; global ceiling; 15-minute window on hits; memory short-circuit; missing SQL → memory fallback with one warning; store down still counts in memory; **a throwing client doesn't 500 or lock out**; `memory` mode never calls the store |
| `admin-lockout.test.ts` | 6 | **Guesses spread over `/api/projects`, `/api/blog/posts`, and `/api/auth` add up to one lockout**, enforced on every admin route including stats; other IPs unaffected; key-less requests and empty passwords never lock anyone out; upload-secret failures don't touch the admin scope |
| `admin-gate.test.tsx` (jsdom) | 6 | Existing session shows content; password-only sign-in; **2FA: the correct password shows the code step, not the content**, then the code signs in; server errors shown and Start over; lockout message; the password is never in browser storage and the legacy `_lk` is removed |
| `security-txt.test.ts` | 4 | RFC 9116 fields; `Expires` in the future and under a year; `SECURITY_CONTACT`; `Canonical` from the site URL |
| `lib-security.test.ts` (+14) | 30 | `getClientIp` ignores garbage, markup, hostnames, ports, over-long and out-of-range values, and skips a malformed platform header; IPv6 accepted; **`ipBucket`**: /64 grouping, separate /64s, every spelling normalized (zero-padding, case, zone id), IPv4-mapped collapse, compressed edge cases |
| `security-headers.test.ts` (+8) | 22 | **`connect-src` is exactly the project origin and fails closed to `'self'`** when the URL is unset, malformed, plain http, or `javascript:`; Permissions-Policy denies 9 key features (clipboard allowed); `X-Permitted-Cross-Domain-Policies: none`; CORP on `/api` |
| `api-analytics-track.test.ts` (+3) | 33 | Forged paths rejected (`//evil.com`, query, fragment, whitespace, markup, newline, backslash, non-ASCII); every real route shape accepted; 413 before parsing |
| `lib-rate-limit.test.ts` (+3) | 16 | IPv6 /64 rotation can't dodge the lockout or the request limiter; IPv4-mapped equals IPv4 |
| `lib-session.test.ts` (+1) | 20 | **`__Host-admin_session` in production** with Secure, `Path=/`, no Domain; bare name in dev |

Added on 2026-10-20:
| Suite | Tests | Covers |
|---|---|---|
| `onboarding.test.tsx` (jsdom) | 23 | Intro opens on a first visit; can't be dismissed before a privacy choice; reject is as prominent as accept; analytics off by default; Accept / Necessary only / Save my choices set the cookie and POST a receipt; Skip intro; guide tabs (click and arrow keys); declining the tour; **returning visitors never see the intro**; a policy version bump re-asks only privacy; localStorage mirror restore; no auto-open on `/privacy`; Cookie settings change; two-step data erasure; tour bar, **next-tab highlight and advance on page change**, a full walk to Finish, resume after reload, the off-route "Back to" link, Esc to exit, replay from the footer |
| `api-analytics-track.test.ts` (+8) | 30 | **Stores nothing** without a cookie, when declined, with an outdated version, or with a malformed cookie; opt-in fields (IP, language, timezone, visitor id, version); visitor id and IP come from the server, never the body; malformed values dropped; fallback when columns are missing |
| `lib-consent.test.ts` | 18 | Round-trip; encoded and decoded forms; 11 malformed shapes rejected; version currency; `allowsAnalytics`; cookie attributes; Cookie-header parsing |
| `api-consent.test.ts` | 15 | Receipt has no IP or UA; validation; cross-site 403; rate limit; missing table; error hiding; erasure scoped to the cookie's visitor id; cookie required; CSRF; missing column |
| `lib-tour.test.ts` | 12 | Unique ids; every step's page exists; nav keys match; pages contiguous; **every spotlight target exists as a `data-tour` attribute in the source**; `resolveTourIndex` cases |
| `lib-analytics-helpers.test.ts` | 11 | Skip prefixes; language and timezone validation; UA summaries (Chrome, Edge, Safari, iOS, Android, Firefox, bots); `randomId` without `crypto.randomUUID` |
| `api-analytics-stats.test.ts` (+4) | 13 | Recent activity IP, browser, OS, and locale; latest-choice-per-visitor consent summary; null consent before the table exists; column fallback |

| Suite | Tests | Covers |
|---|---|---|
| `api-projects.test.ts` | 45 | Auth (401 for each method, wrong key, unset secret, lockout, per-IP isolation); GET; POST validation, defaults, status and theme normalization, link/github URL rules; PATCH whitelist and mass-assignment block; DELETE single and bulk (≤100); **UUID-only ids** (injection-shaped ids rejected); **session cookie auth**: cookie-only access, same-origin writes allowed, cross-site writes 403, mismatched Origin 403, tampered or expired cookie 401, password rotation signs out, a valid cookie bypasses the IP lockout |
| `api-blog-posts.test.ts` | 35 | The same auth set; GET view-count merge and degradation; POST validation and defaults; PATCH whitelist, mass assignment, reading-time recompute; DELETE single and bulk; UUID-only ids; cookie auth plus the cross-site block |
| `lib-validation.test.ts` | 33 | `isValidSlug`, `slugify`, `isNonEmptyString`, `isStringMax`, `normalizeTags`, `normalizeTheme`, `estimateReadingTime`, **`isUuid`, `isJsonObject`** |
| `markdown-sanitize.test.ts` | 28 | Dangerous tags and attributes are not allowlisted; protocols; checkbox-only inputs; id clobbering; renderer features survive; **source-level check of plugin order** in `MarkdownRenderer.tsx` |
| `api-blog-upload.test.ts` | 23 | Auth and lockout; empty and oversized bodies; missing title; frontmatter to row; slug derivation and sanitizing; **`---js`, `---javascript`, `---JS`, and `---JavaScript` front matter refused and never executed** (RCE regression); unregistered languages refused; YAML and JSON still work; `published` set only on a literal `true` and **omitted when absent**, so a re-upload can't unpublish; reading-time bounds; upsert on slug; error hiding |
| `api-analytics-track.test.ts` | 22 | Happy path; content type, JSON, page, and session validation; **non-object bodies return 400**; **referrer stored as origin only**, with non-URL or oversized referrers dropped; user-agent truncation; absurd numbers nulled; boolean coercion; blocked prefixes; excluded IPs; 30/min per IP |
| `api-email-summary.test.ts` | 20 | Auth and lockout; fixed recipient (no relay); default subject; a missing recipient or **missing `RESEND_API_KEY` returns 500 without crashing**; provider error → 502; validation, including **non-object bodies**; invalid requests don't use up the send cap; 10 sends/hr cap |
| `api-docs-upload.test.ts` | 19 | Auth and lockout; invalid JSON, oversize, and **non-object bodies**; slug, filename traversal, `.md` only, empty content; upsert on `project_slug,filename`; defaults; error hiding |
| `lib-session.test.ts` | 19 | Token round-trip; uniqueness; the password never appears in a token; expiry; forged expiry extension; wrong secret; password rotation; service-role fallback; fails closed without secrets; malformed tokens; cookie attributes (HttpOnly, SameSite=Strict, Secure in production) |
| `api-auth.test.ts` | 16 | Sign-in sets an HttpOnly, SameSite=Strict cookie that doesn't contain the password; wrong, empty, non-string, and oversized passwords return 401; invalid JSON; fails closed (no password, no signing secret); per-IP lockout; **global ceiling across 100 IPs**; login CSRF returns 403; session status (valid, absent, forged); sign-out clears the cookie; cross-site sign-out returns 403 |
| `lib-security.test.ts` | 16 | `safeEqual` cases; `getClientIp` **prefers `x-nf-client-connection-ip` and can't be reset by rotating XFF**, plus the XFF and x-real-ip fallbacks; `isSameOriginRequest` (Sec-Fetch-Site same-origin, cross-site, and same-site; Origin vs Host; a `null` origin; non-browser clients) |
| `lib-rate-limit.test.ts` | 13 | Limits, isolation, window reset (fake timers), per-IP lockout threshold, isolation, and expiry, **global ceiling**, **10k-key memory bound under a key flood** |
| `security-headers.test.ts` | 14 | Turbopack build cache stays off (keeps env values out of build artifacts); all headers present, including COOP; DENY framing; nosniff; CSP `object-src`, `base-uri`, and `form-action`; **`script-src-attr 'none'`**; Supabase is the only third-party origin (no Google Fonts); no `unsafe-eval` outside dev; HSTS of at least a year; `poweredByHeader: false`; `/api` gets no-store and noindex; admin pages get noindex |
| `api-analytics-stats.test.ts` | 9 | Auth and lockout; aggregation (counts, uniques, devices, bounce); positive-only load average; referrer cleaning; 30 and 24 zero-filled buckets; error hiding |
| `lib-json-ld.test.ts` | 4 | No raw `<`, `>`, `&`, U+2028, or U+2029 in the output; exact round-trip; **both layouts use `serializeJsonLd`** (stored-XSS regression) |

### Not covered (known gaps)
- **Most React components and pages.** jsdom and Testing Library now exist, but only the onboarding flow (provider, modal, Navbar tour states, footer, toast) and `AdminGate` have component tests. Studio CRUD flows, `Modal`, and the `MarkdownRenderer` output are still untested.
- **`lib/blog.ts` and `lib/projects-data.ts`** (the anon-client query builders), and `formatDate`. The slug guard and explicit columns in `getPostBySlug` were verified in a browser, not by a unit test.
- **The real 2FA email** (Resend is mocked in tests) and **the Postgres lockout functions** (the RPCs are mocked). Check both by hand after running `auth-lockout-schema.sql` / setting `ADMIN_2FA` (§7.3).
- **End-to-end flows**, such as creating a post in Studio and seeing it on `/blog`.
- **RLS policies**, which live in the database. Verify them manually (§7.4).
- **Visual, responsive, and accessibility regressions.**

## 4. Patterns used in the suites

### 4.1 Mocking Supabase (`__tests__/helpers/test-utils.ts`)
`createChain(state)` returns a fake query builder. Every method (`from`, `select`, `order`, `limit`, `insert`, `update`, `upsert`, `delete`, `eq`, `in`, `like`, `single`, `rpc`) records itself in `state.calls` and returns the chain. Awaiting the chain resolves to the next entry in `state.queue`, or to `state.result` once the queue is empty.

```ts
jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { GET, POST, PATCH, DELETE } from "@/app/api/projects/route"   // import AFTER jest.mock

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state
```

- **Routes that make several queries** (for example `GET /api/blog/posts`: posts, then page_views) take a queue: `mockDb.queue = [{ data: posts, error: null }, { data: views, error: null }]`.
- **To assert what reached the DB**, use `firstCallArg(mockDb, "insert" | "update" | "upsert")`, or search `mockDb.calls` (for example to read the `onConflict` option).
- If a route uses a new query-builder method, add it to the `methods` list in `createChain`.

### 4.2 Requests
```ts
makeRequest(URL, { method: "GET", headers: { "x-logistics-key": KEY } })
jsonRequest(URL, "PATCH", { id: ID /* must be a uuid */, title: "T" }, { "x-logistics-key": KEY })

// Admin routes also accept the session cookie. Set SESSION_SECRET and LOGISTICS_PASSWORD first.
const cookie = `${SESSION_COOKIE}=${createSessionToken()}`
makeRequest(URL, { headers: { cookie } })                                      // reads
jsonRequest(URL, "PATCH", body, { cookie, "sec-fetch-site": "same-origin" })   // writes must be same-origin
```
Both build a real `NextRequest`, with the `duplex: "half"` flag that undici needs for bodies. Row ids in PATCH and DELETE bodies must be valid UUIDs, or the route returns 400 before touching the mock DB.

### 4.3 Per-test hygiene (copy this `beforeEach`)
```ts
beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = KEY          // set the secrets the route needs
    resetRateLimits()                             // limiter state is module-global
    mockDb.result = { data: { id: "1" }, error: null }
    mockDb.queue = []
    mockDb.calls = []
    jest.spyOn(console, "error").mockImplementation(() => {})   // routes log DB errors on purpose
})
afterEach(() => jest.restoreAllMocks())
```
- Use a **distinct `x-forwarded-for`** for lockout tests so they don't bleed into each other (for example `"6.6.6.6"`). Remember the four admin-password routes **share** one lockout scope, and that IPv6 addresses in the same /64 count as one client.
- **Lockout counting:** only requests that carry a credential count. A lockout test must send a wrong key or password, not omit it.
- **The shared lockout store** is off in every suite (`AUTH_LOCKOUT_STORE=memory` from `setup-env.ts`). To test it, set `process.env.AUTH_LOCKOUT_STORE = "supabase"` in `beforeEach` and assert on `rpc` calls, as `lib-auth-lockout.test.ts` does.
- **Oversized bodies:** use a body over the route's `BODY_LIMITS` cap and expect 413. Keep normal test payloads under the cap; the `track` cap is only 8 KB.
- For time windows, use `jest.useFakeTimers()` with `jest.advanceTimersByTime(ms)`, and reset to real timers in `beforeEach`.
- To test fail-closed behaviour, `delete process.env.SECRET` inside the test.

### 4.4 Mocking third-party SDKs
`resend` is mocked by its module path, and the shared `send` mock is exposed through a `__mockSend` export:
```ts
jest.mock("resend", () => {
    const send = jest.fn()
    return { Resend: jest.fn().mockImplementation(() => ({ emails: { send } })), __mockSend: send }
})
```

### 4.5 Testing ESM-heavy or JSX modules without a DOM
`markdown-sanitize.test.ts` reads `components/ui/MarkdownRenderer.tsx` **as text** and asserts the plugin order with a regex, which avoids loading ESM-only unified plugins under Babel. Use this technique sparingly, only for wiring invariants that matter for security.

### 4.5b Component tests (jsdom) — see `__tests__/onboarding.test.tsx`
- The first line must be `/** @jest-environment jsdom */`.
- **Mock Next's client modules.** `next/navigation` returns a mutable `mockPathname` and a `mockPush` spy. `next/link` becomes a plain `<a>`, built with `jest.requireActual("react").createElement`. Jest forbids out-of-scope names in mock factories, which includes **TypeScript DOM type names** like `HTMLAnchorElement`, so keep the factory's types structural.
- **Simulate navigation** by setting `mockPathname` and calling `rerender(<App page="/work" />)` on the **same** tree. The provider lives in the root layout and survives real navigations.
- Stub `global.fetch` with a `jest.fn()` and assert on the URL, method, and JSON body.
- Reset `document.cookie` (set `Max-Age=0`), `localStorage`, and `sessionStorage` in `beforeEach`.
- Don't render `TourSpotlight` in jsdom: there's no layout, `CSS.escape`, or `ResizeObserver`. Covering it is what browser verification (§7.6) is for.
- **Sanity-check new component tests with a quick mutation.** Break the behavior under test (for example, make the modal always closable) and confirm a test fails.

### 4.6 Config tests
`security-headers.test.ts` calls `require("../next.config")` and awaits `headers()`. This is why `next.config.ts` ends with `module.exports = nextConfig`; keep it that way, or update the test.

## 5. What to test, by change type
| Change | Required tests |
|---|---|
| New or changed **API route** | Auth (401 missing or wrong key, unset secret, lockout, other IPs unaffected); validation (each field: wrong type, too long, malformed); a mass-assignment attempt; the happy path asserting the exact row sent to the DB; DB error → generic message; rate limits if the route is public |
| New **`lib/` helper** | Unit tests for normal, edge, and hostile inputs |
| **Sanitize schema** change | A test proving the new tag or attribute is allowed **and** that a dangerous variant is still stripped |
| **CSP or headers** change | Update `security-headers.test.ts` |
| **Bug fix** | A failing test that reproduces the bug first, where it's testable |
| **UI-only** change | Manual QA (§7). Add component tests once the infrastructure in §9 exists. |

## 6. Template: tests for a new authenticated route
```ts
/**
 * /api/things — CRUD with x-logistics-key auth.
 * Security: auth rejection, brute-force lockout, mass-assignment prevention,
 * input validation, no DB error leakage.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { makeRequest, jsonRequest, firstCallArg, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: null, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { GET, POST, PATCH, DELETE } from "@/app/api/things/route"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state
const URL = "http://localhost/api/things"
const KEY = "test-logistics-password"
const auth = { "x-logistics-key": KEY }

beforeEach(() => { /* §4.3 */ })
afterEach(() => jest.restoreAllMocks())

describe("auth", () => {
    it.each([["GET", GET], ["POST", POST], ["PATCH", PATCH], ["DELETE", DELETE]] as const)(
        "%s rejects a missing key with 401",
        async (method, handler) => {
            expect((await handler(makeRequest(URL, { method }))).status).toBe(401)
        }
    )
    it("locks an IP out with 429 after 10 failed attempts", async () => {
        const headers = { "x-logistics-key": "wrong", "x-forwarded-for": "6.6.6.6" }
        for (let i = 0; i < 10; i++) await GET(makeRequest(URL, { headers }))
        expect((await GET(makeRequest(URL, { headers }))).status).toBe(429)
    })
})

describe("PATCH", () => {
    it("blocks mass assignment", async () => {
        await PATCH(jsonRequest(URL, "PATCH", { id: "1", title: "ok", created_at: "1999", is_admin: true }, auth))
        const update = firstCallArg(mockDb, "update") as Record<string, unknown>
        expect(update).toEqual({ title: "ok" })
    })
})

describe("errors", () => {
    it("hides DB error details", async () => {
        mockDb.result = { data: null, error: { message: "relation things does not exist" } }
        const res = await GET(makeRequest(URL, { headers: auth }))
        expect(res.status).toBe(500)
        expect(JSON.stringify(await res.json())).not.toContain("relation")
    })
})
```

## 7. Manual QA checklist (UI changes)

Run `npm run dev` with a working `.env.local`. Use browser devtools device mode at **360 px, 768 px, and 1280 px or wider**.

### 7.1 Every touched page
- [ ] No console errors, and no hydration warnings in the dev overlay
- [ ] Layout holds at all three widths (the bento grid collapses 12 → 2 → 1)
- [ ] Navbar: the right link is highlighted; the mobile drawer opens and closes
- [ ] Loading, empty, and error states render (simulate errors with devtools offline mode or a bad Supabase URL)
- [ ] Keyboard: you can Tab to every control, focus is visible, and Esc closes modals
- [ ] External links open in a new tab

### 7.2 Blog
- [ ] `/blog` lists only published posts; the modal opens with content; "Open full page" navigates correctly
- [ ] `/blog/<slug>` renders. Check a post exercising **every BLOG-3 feature**: tables, task list, every alert type, code with copy, `|small`, `|left`, and `|full` images, and raw HTML
- [ ] Any raw `<script>` or `onerror=` in content is stripped (paste one into a draft post's preview in Studio)
- [ ] A draft's slug shows "Post not found" on the public page

### 7.3 Studio and Logistics
- [ ] A wrong password shows "Incorrect password." and the button recovers; the 11th wrong try in 15 minutes shows "Too many attempts. Try again later."
- [ ] After signing in, devtools → Application → Cookies shows `__Host-admin_session` (production) or `admin_session` (dev) as HttpOnly and SameSite=Strict, and nothing is in sessionStorage. Reloading keeps you signed in, and "Sign out" returns you to the gate.
- [ ] **With `ADMIN_2FA=email`:** the right password shows "We emailed a 6-digit code…", and an "Admin sign-in code" email arrives within a minute with the requesting IP. The code signs you in; a wrong code says "Incorrect or expired code."; "Start over" returns to the password. A script sending `x-logistics-key` now gets 401.
- [ ] **After `auth-lockout-schema.sql`:** five wrong passwords, then `select key, count from auth_failures` in the SQL editor shows hashed keys (no raw IPs) with counts. The function logs no longer warn about the schema.
- [ ] Create, edit (every field), publish, unpublish, and delete a post; bulk select, publish, and delete
- [ ] Create a project through the wizard (all 4 steps), edit it, toggle Public/Hidden, two-click delete; check that Home reflects the change
- [ ] Logistics loads, refreshes, toggles device tracking, and copies the IP
- [ ] Studio and Logistics visits are **not** recorded (check that the Logistics recent-activity list doesn't show them)

### 7.4 Database and RLS (after any schema change)
- [ ] With the **anon** key (browser console on the site, or a REST call), drafts and hidden projects are not returned; inserts and updates on `posts` and `projects` are denied; `page_views`, `consent_events` and `project_documents` return `42501 permission denied` (true since 2026-10-21); calling `/rest/v1/rpc/auth_failure_counts` is denied
- [ ] Run `supabase/audit-exposure.sql` (read-only) and compare each section with its "Expect" comment
- [ ] The schema SQL file in `supabase/` matches what you ran

### 7.5 Production build
- [ ] `npm run build` succeeds (it needs the Supabase env vars), then `npm start` and smoke-test `/`, `/blog`, `/sitemap.xml`, `/robots.txt`, and `/opengraph-image`

### 7.6 Onboarding and tour (use a private window, or clear site data)
- [ ] The first visit shows Welcome; the Privacy step can't be dismissed; Accept / Necessary only / Save my choices each work
- [ ] DevTools → Application → Cookies shows `java_consent` with `"a":1` or `"a":0`. With `"a":0`, the Network tab shows **no** `/api/analytics/track` requests.
- [ ] Reload: no modal. Footer → Cookie settings shows the current choice; Delete my data asks for confirmation.
- [ ] The tour starts on Home, the spotlight outlines each target, and on step 3 the **Work tab shows a "Next" badge**. Clicking it advances. Scrolling down docks a compact bar at the top. Esc exits.
- [ ] At 390 px: the modal is a bottom sheet with stacked buttons; during the tour the ☰ button is ringed, and in the drawer the next link has an inline "Next" pill.

### 7.7 Headless-browser verification (how the 2026-10-20 run was done)
There's no `chromium-cli` on the dev machine and no Chrome, but Microsoft Edge works through **`playwright-core`** (driver only, no browser download).
1. Install `playwright-core@1.63.0` into a scratch directory outside the repo.
2. Run `npx next build && npx next start -p 3999`.
3. Run a Node script that does `createRequire(<scratch>/package.json)("playwright-core").chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" })` and walks the flow with `getByRole`.
4. **Intercept `/api/analytics/track` and `/api/consent` with `page.route`.** The local server talks to the production Supabase, and test clicks must not create fake analytics.
5. Capture `console` errors and `pageerror`, and check `document.documentElement.scrollWidth <= innerWidth` for horizontal overflow at 1366 px and 390 px.
6. Stop the server by its port's PID. Stopping `npx` alone leaves the Node child holding the port.

## 8. CI (not set up yet; PRD P1-2)
Proposed `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test -- --ci
```
Lint, tsc, and the tests are all clean as of 2026-10-19, so CI should start green. The tests mock Supabase and Resend, so CI needs **no secrets**. Consider adding `npm audit --omit=dev --audit-level=high` as a step. Don't add `npm run build` to CI unless you provide Supabase env vars as repository secrets, because the sitemap queries posts at build time. Once CI is green, add a status badge to the README.

## 9. Growing the suite (recommended next steps)
1. **More component tests** (the infrastructure exists as of 2026-10-20; see §4.5b): `Modal` (Esc, backdrop, scroll lock), `AdminGate` (session check, wrong password, the 429 message, sign-out), and `ProjectList` (status rendering).
2. **Lib tests for `lib/blog.ts` and `lib/projects-data.ts`:** mock `@/lib/supabase` with `createChain`, and assert that the `published` filter and the ordering are always applied (PUB-4).
3. **E2E:** Playwright (see the bundled `testing/playwright.md`), with a smoke flow per public page and one Studio CRUD flow against a dedicated Supabase test project. This needs secrets, so keep it out of the default CI job.
4. **Accessibility:** `@axe-core/playwright` on each public page once E2E exists.
