/**
 * Server/client boundary.
 * Security: code that reads a secret or holds the service-role client must be
 * impossible to ship to the browser. Next.js already fails the build when a
 * Client Component imports a module marked `import "server-only"`; this
 * suite catches it in seconds instead, and also catches the guard being
 * dropped from a module that needs it.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import path from "path"

const ROOT = path.resolve(__dirname, "..")
const SOURCE_DIRS = ["app", "components", "lib"]

/** Env vars that must never reach a client bundle (NEXT_PUBLIC_* are public by design). */
const SECRET_ENV_RE =
    /process\.env\.(SUPABASE_SERVICE_ROLE_KEY|SESSION_SECRET|LOGISTICS_PASSWORD|RESEND_API_KEY|ANALYTICS_EXCLUDED_IPS|SUMMARY_RECIPIENT_EMAIL|[A-Z_]*_SECRET)\b/
const SERVER_ONLY_RE = /^\s*import\s+["']server-only["']/m
const USE_CLIENT_RE = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/
// Static imports/re-exports, side-effect imports, and dynamic import(). `import type` is erased at build time.
const IMPORT_RE =
    /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g

/** Modules that hold secrets or the service-role client — the guard must stay. */
const MUST_BE_SERVER_ONLY = [
    "lib/supabase-admin.ts",
    "lib/session.ts",
    "lib/admin-auth.ts",
    "lib/auth-lockout.ts",
    "lib/security.ts",
    "lib/rate-limit.ts",
    "lib/http.ts",
]

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (statSync(full).isDirectory()) walk(full, out)
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full)
    }
    return out
}

const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
const source = new Map(files.map((f) => [f, readFileSync(f, "utf8")]))
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/")

function resolveImport(from: string, spec: string): string | null {
    let base: string
    if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2))
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec)
    else return null // package — outside our graph
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
        if (source.has(candidate)) return candidate
        if (existsSync(candidate) && statSync(candidate).isFile() && /\.(ts|tsx)$/.test(candidate)) return candidate
    }
    return null
}

function importsOf(file: string): string[] {
    const code = source.get(file) ?? ""
    const deps: string[] = []
    for (const m of code.matchAll(IMPORT_RE)) {
        if (m[1]) continue // `import type` / `export type`
        const spec = m[2] ?? m[3]
        const resolved = spec ? resolveImport(file, spec) : null
        if (resolved) deps.push(resolved)
    }
    return deps
}

const isServerOnly = (f: string) => SERVER_ONLY_RE.test(source.get(f) ?? "")
const readsSecret = (f: string) => SECRET_ENV_RE.test(source.get(f) ?? "")
const isClient = (f: string) => USE_CLIENT_RE.test(source.get(f) ?? "")
const isRouteHandler = (f: string) => /^app\/.*\/route\.ts$/.test(rel(f))

/** First import chain from `start` to a server-only or secret-reading module, if any. */
function findServerChain(start: string): string[] | null {
    const seen = new Set<string>([start])
    const queue: string[][] = [[start]]
    while (queue.length) {
        const chain = queue.shift()!
        for (const dep of importsOf(chain[chain.length - 1])) {
            if (seen.has(dep)) continue
            seen.add(dep)
            const next = [...chain, dep]
            if (isServerOnly(dep) || readsSecret(dep)) return next
            queue.push(next)
        }
    }
    return null
}

describe("server/client boundary", () => {
    it("finds the source tree (guards against a vacuous pass)", () => {
        expect(files.length).toBeGreaterThan(20)
        expect(files.filter(isClient).length).toBeGreaterThan(5)
    })

    it("follows imports transitively (positive control)", () => {
        // /api/projects imports the service-role client first; the walker must see it.
        const chain = findServerChain(path.join(ROOT, "app/api/projects/route.ts"))
        expect(chain?.map(rel)).toEqual(["app/api/projects/route.ts", "lib/supabase-admin.ts"])
    })

    it.each(MUST_BE_SERVER_ONLY)("%s keeps its server-only guard", (file) => {
        expect(isServerOnly(path.join(ROOT, file))).toBe(true)
    })

    it("every module that reads a secret is server-only or a route handler", () => {
        const offenders = files
            .filter(readsSecret)
            .filter((f) => !isServerOnly(f) && !isRouteHandler(f))
            .map(rel)
        expect(offenders).toEqual([])
    })

    it("no Client Component can reach server-only code through its imports", () => {
        const leaks = files
            .filter(isClient)
            .map((f) => findServerChain(f))
            .filter((chain): chain is string[] => chain !== null)
            .map((chain) => chain.map(rel).join(" → "))
        expect(leaks).toEqual([])
    })

    it("no Client Component reads a secret env var directly", () => {
        expect(files.filter((f) => isClient(f) && readsSecret(f)).map(rel)).toEqual([])
    })
})
