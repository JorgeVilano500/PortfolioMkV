# Code Style

_Conventions for writing code in this repo, inferred from the code that exists. The repo has **no Prettier or EditorConfig**, so this doc and ESLint are the only formatting authority. Last verified: **2026-10-19**._

**The prime rule: make new code read like the code around it.** Where older files differ (most of them are create-next-app leftovers), follow this doc in new code, and don't reformat untouched lines in unrelated changes.

---

## 1. Formatting

| Rule | Convention | Notes |
|---|---|---|
| Indent | **4 spaces** | `lib/`, `app/api/`, `app/studio/`, and most components. `app/layout.tsx`, `app/page.tsx`, and the config `.mjs` files use 2 (create-next-app defaults); leave them as they are unless you're rewriting them. |
| Semicolons | **None** | The same leftover files use semicolons. |
| Quotes | **Double quotes** for strings and JSX attributes | A few older imports use single quotes. |
| Trailing commas | Yes, in multi-line objects, arrays, and params | |
| Line length | Soft limit around 120. Long Tailwind class strings may exceed it. | |
| Alignment | Related declarations are often column-aligned. Optional, but keep alignment intact when editing such a block. | See the example below |
| Blank lines | One between logical blocks. No runs of blank lines in JSX. | Several older components have stray blank lines; tidy them only when you're already editing the file. |

```ts
// Aligned groups are common and welcome:
const [search, setSearch]         = useState("")
const [status, setStatus]         = useState<StatusFilter>("all")
const [tagFilter, setTagFilter]   = useState<string>("all")

const TRACK_LIMIT     = 30
const TRACK_WINDOW_MS = 60_000
```

Use numeric separators for large literals (`60_000`, `200_000`, `1_000_000`).

## 2. TypeScript
- `strict` is on. **Never use `any`.** Use `unknown` at trust boundaries (request bodies, JSON) and narrow it with type guards. `lib/validation.ts` guards return `v is string`.
- Prefer **`type` aliases** over `interface`; the codebase uses `type` throughout.
- Use **string-literal unions** for enums (`"purple" | "green" | "pink"`) and `as const` arrays or objects for option lists (`SORT_OPTIONS`, `TABS`, `CALLOUT`, `LIMITS`, `ICON_PATHS`).
- Use `Record<Union, …>` for lookup tables keyed by a union (`themeMap`, `STATUS_META`).
- **Type-only imports:** `import type { X }` or inline `type X` inside the braces.
- Casting with `as` is acceptable only right after validation, or for library typing gaps. Leave a comment if it isn't obvious why.
- Use discriminated results instead of throwing for expected failures: `{ error: string } | { fields: Record<string, unknown> }`, checked with `"error" in result`.
- Don't redefine a shared type. Import it from `lib/`. The existing duplicates (`Post`, `Project`, and others) are tech debt (PRD P1-5); don't add more.

## 3. Naming
| Kind | Convention | Examples |
|---|---|---|
| Components and types | PascalCase | `PostGridCard`, `StatsPayload`, `PublicProject` |
| Functions and variables | camelCase | `getPublicProjects`, `toggleSelect`, `allVisibleSelected` |
| Module constants | UPPER_SNAKE | `ROUTE`, `LIMITS`, `MAX_BULK_DELETE`, `SKIP_PREFIXES`, `GRID_SIZE` |
| Component files | PascalCase `.tsx` | `components/ui/Navbar.tsx`, `app/studio/ProjectsPanel.tsx` |
| lib files | kebab-case `.ts` | `rate-limit.ts`, `projects-data.ts`, `markdown-sanitize.ts` |
| Route folders | lowercase, kebab-case | `app/api/email-summary/` |
| DB columns and API JSON | **snake_case**, matching Postgres | `cover_emoji`, `reading_time`, `view_count`, `session_id` |
| Booleans | `is…`, `has…`, or a plain adjective | `isOpen`, `hasOverflow`, `published`, `featured` |
| Event handlers | `handleX` or a verb | `handleSaved`, `toggleModal`, `copyEmail`, `bulkDelete` |
| `useState` setters | `setX`; a short alias is acceptable when it aids alignment | `const [loading, setLoad] = useState(true)` |
| Storage keys | Underscore-prefixed and short. **Never store credentials in web storage** (admin auth uses an HttpOnly cookie). | `_pv_sid`, `_pv_seen`, `_pv_exclude` |

## 4. Files, imports, and exports
- **Path alias:** use `@/…` for anything outside the current folder (`@/lib/validation`, `@/components`). Use relative imports only for siblings in the same feature folder (`./shared`, `./ProjectsPanel`).
- **Import order:** (1) React and Next, (2) third-party, (3) `@/` modules, (4) relative, (5) types. Let ESLint settle anything else.
- **Components** are **named exports** (`export function Navbar(...)`). **Pages, layouts, and route-convention files** use `export default` (Next requires it), while route handlers export named `GET`, `POST`, and so on.
- **Barrel:** `components/index.tsx` re-exports public components, so `import { Navbar } from "@/components"` is fine. **Inside `components/`, import siblings directly** (`./ProjectList`, `../features/Modal`), not from `../index`. `Home.tsx` does the latter today; fix it when you touch that file.
- **One feature, one folder.** Admin feature components live next to their page (`app/studio/*`). Promote a component to `components/` only once a second page uses it.
- **Server-only modules:** keep anything that reads secrets or uses `supabaseAdmin` out of files that client components import. If you create a new one, consider adding `import "server-only"` at the top (the package would need adding).

## 5. React and Next.js patterns

### 5.1 Server vs client
- Default to a **Server Component**. Add `"use client"` (as the first line) only when the file needs state, effects, event handlers, or browser APIs.
- **Exports from `"use client"` pages can't include `metadata`.** That's why `about`, `work`, `contact`, and `blog` each have a metadata-only `layout.tsx`; follow the same pattern.
- **Next 16:** `params` and `searchParams` are Promises (`const { slug } = await params`). Before using any Next API, read the bundled docs in `node_modules/next/dist/docs/`. Don't rely on memory of older versions.

### 5.2 Components
- Define props inline for small components (`({ cols }: { cols: string })`) or as a `type XProps` above larger ones. Destructure in the signature and set defaults there (`variant = "default"`).
- Keep sub-components in the same file until they're reused. Separate sections of large files with **box-drawing dividers**:
  ```ts
  // ─── Grid card ────────────────────────────────────────────────────────────────
  ```
- Derive state with `useMemo` (for filters and sorting) instead of storing derived arrays in state.
- Track the selected or open entity **by id** (`useState<{ id: string; editing: boolean } | null>`), so list updates flow into the open modal.
- Use **inline IIFEs in JSX** (`{x && (() => { const t = …; return <…/> })()}`) only where the codebase already does so. Prefer extracting a small component instead.

### 5.3 Effects and state
- The React Hooks lint rules flag a synchronous `setState` inside an effect body. The codebase's pattern is to set state inside `.then()` callbacks:
  ```ts
  useEffect(() => {
      Promise.resolve()
          .then(() => { try { return localStorage.getItem("_pv_exclude") === "1" } catch { return false } })
          .then((v) => setExcluded(v))
  }, [])
  ```
- Wrap **every** `localStorage` or `sessionStorage` access in `try/catch`, because private mode can throw.
- Gate client-only UI on a `hydrated` flag to avoid hydration mismatches (as in `/studio` and `/logistics`).
- Event listeners in effects must be cleaned up, and any body-scroll lock must restore the previous value.

### 5.4 Data fetching from client components
```ts
const save = async () => {
    setSaving(true)
    setError(null)
    try {
        const res = await fetch("/api/projects", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-logistics-key": authKey },
            body: JSON.stringify({ id, ...fields }),
        })
        if (!res.ok) { setError((await res.json()).error ?? "Save failed"); return }
        onSaved(await res.json())
    } catch {
        setError("Network error")
    } finally {
        setSaving(false)          // never leave a button stuck on "Saving…"
    }
}
```
- Update the UI **after** the server confirms; don't write optimistically (PRD STU-5).
- Show server `error` strings inline (`text-xs text-pink-400`).
- Analytics calls are fire-and-forget: `.catch(() => {})` with a comment saying why.

## 6. API route handlers

Every admin route follows this shape. `app/api/projects/route.ts` is the reference implementation. Machine routes (`x-api-key`) follow `app/api/blog/upload/route.ts` instead.

```ts
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { checkAdminAuth } from "@/lib/admin-auth"
import { LIMITS, isNonEmptyString, isStringMax, isUuid, isJsonObject } from "@/lib/validation"

const ROUTE = "things"

// Session cookie (+ same-origin check for writes) or x-logistics-key, with lockout
const checkAuth = (req: NextRequest) => checkAdminAuth(req, ROUTE)

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
    try {
        const body: unknown = await req.json()
        return isJsonObject(body) ? body : null   // JSON.parse("null") is valid JSON, so check the shape
    } catch {
        return null
    }
}
function validateFields(body: Record<string, unknown>, { requireCore }: { requireCore: boolean }) { /* whitelist */ }
function dbError(context: string, message: string): NextResponse {
    console.error(`[${ROUTE}] ${context}:`, message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
}

export async function POST(req: NextRequest) {
    const denied = checkAuth(req)
    if (denied) return denied

    const body = await readJson(req)
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

    const result = validateFields(body, { requireCore: true })
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const { data, error } = await supabaseAdmin.from("things").insert({ ...DEFAULTS, ...result.fields }).select().single()
    if (error) return dbError("POST", error.message)
    return NextResponse.json(data, { status: 201 })
}
```

- **Ids:** PATCH and DELETE take row ids that must pass `isUuid` (`400` otherwise), including every entry of a bulk `ids` array.
- **Client calls to admin routes** send no auth header. The browser attaches the HttpOnly session cookie to same-origin `fetch` calls automatically, so never put the password in client code or storage.
- **Responses:** errors are `{ error: string }`. Status codes: `400` validation, `401` auth, `403` cross-site request, `413` body too large, `429` limits (with `Retry-After` where there is a window), `500` DB, `502` upstream provider, `201` create, `200` otherwise.
- **Error messages** must be human-readable and must not leak schema details (`"title is required (string, max 300 chars)"` is good).
- Use `NextResponse.json` in the CRUD routes. The upload and email routes use `Response.json`; either is fine, but stay consistent within a file.
- Number your steps in comments for linear handlers (`// 1. Authenticate`, `// 2. Read raw body…`), as the upload routes do.

## 7. Styling (Tailwind 4)
- Use utility classes inline. **Take colours and patterns from DESIGN_SYSTEM.md**, and don't invent new hex values.
- Build conditional classes with template literals and ternaries. The codebase does not use `clsx` or `cn`, so don't add them for a single use.
  ```tsx
  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${active ? "bg-[#7c6dff] text-white" : "text-[#555370] hover:text-[#c4c0d8]"}`}
  ```
- Use inline `style={{}}` **only** for data-driven values (bar widths, chart colours, transition delays).
- Shared class strings inside a component can live in a local `const inputClass = "…"` (as in `ProjectWizardModal`).
- There is no CSS-in-JS. Global CSS changes go in `app/globals.css`; keep them minimal.
- **Tailwind 4 has no `tailwind.config.js`.** Theme extensions go in `@theme` in `globals.css`. Anything in `postcss.config.mjs` other than the plugin is ignored.

## 8. Comments and docs
- Comment the **why**: security reasoning, ordering constraints, and workarounds. Good examples are in the repo:
  - `// Order matters: raw HTML is parsed, then sanitized (XSS protection), then highlighted`
  - `// suppressHydrationWarning: browser extensions … modify external <a> elements`
  - `// Whitelist — only explicitly validated fields ever reach the DB (prevents mass-assignment …)`
- Put `/** JSDoc */` on exported `lib/` functions and on any non-obvious exported type field.
- Put a file-header block comment on modules with non-obvious constraints (`lib/rate-limit.ts`, `lib/markdown-sanitize.ts`, `jest.config.js`).
- Don't leave commented-out JSX or code blocks behind (there's a dead "Contact card" block in `Home.tsx`), and don't leave `// need to make filter still` style TODOs. Track work in PRD.md instead.
- When a change makes a doc wrong, update the doc in the same change (see AGENTS.md §8).

## 9. Accessibility and HTML
- Use semantic elements: `<button>` for actions, `<a>`/`<Link>` for navigation, and headings in order.
- Give icon-only buttons an `aria-label`. Dialogs get `role="dialog" aria-modal="true" aria-labelledby`.
- Internal navigation uses `next/link`. External links use `target="_blank" rel="noopener noreferrer"`.
- Use `next/image` for images. `<img>` is allowed only in `MarkdownRenderer`, with the existing eslint-disable comment.
- Escape entities in JSX text (`&apos;`, `&ldquo;`, `&rdquo;`); ESLint enforces this.

## 10. Dependencies
- Ask before adding a runtime dependency. The current set is deliberately small (see ARCHITECTURE.md §2). Prefer platform APIs (`crypto.randomUUID`, `IntersectionObserver`, `navigator.clipboard`, `navigator.share`).
- Dev dependencies for testing (for example jsdom or Testing Library) are fine when they come with tests that use them.
- Never add a root `babel.config.js` (it disables SWC for Next).
- Pin Next-coupled packages (`next`, `eslint-config-next`) to the same version.

## 11. Git
- Branch: `main` (there is no branching model yet). **Don't commit or push unless the user asks.**
- Commit messages: the existing history is informal ("Finished some touch ups"). Going forward, use an **imperative summary of 72 characters or fewer** that says what changed, optionally followed by a body explaining why and referencing PRD or SECURITY IDs:
  ```
  Move /work onto Supabase projects (PRD P1-1)

  WorkComponent now reads getPublicProjects(); lib/projects.ts removed.
  Seed SQL for the old static entries is in supabase/seed-projects.sql.
  ```
- AI agents append whatever attribution trailer their harness specifies.
- Never commit `.env*`, `.next/`, `coverage/`, or `node_modules/` (all gitignored).

## 12. Before you finish
```bash
npm run lint && npx tsc --noEmit && npm test
```
All three must pass; the baseline is in AGENTS.md §3. Lint isn't run by `next build` and there's no CI yet, so **you** are the gate.
