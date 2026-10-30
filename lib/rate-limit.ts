import "server-only"
import { ipBucket } from "./security"

/**
 * In-memory fixed-window rate limiter.
 *
 * NOTE: state lives in the process. On serverless (Netlify functions) each
 * warm instance has its own counters, so this is best-effort abuse damping,
 * not a hard guarantee. Auth lockouts add a shared Postgres layer on top
 * (lib/auth-lockout.ts); the request limiters here stay per instance.
 *
 * Client keys go through ipBucket(), so an IPv6 attacker can't get a fresh
 * bucket per address by rotating within their /64.
 */

type Bucket = { count: number; resetAt: number }

// Hard cap per limiter so a flood of distinct keys can't exhaust memory.
const MAX_KEYS_PER_STORE = 10_000

const stores = new Map<string, Map<string, Bucket>>()

function getStore(name: string): Map<string, Bucket> {
    let store = stores.get(name)
    if (!store) {
        store = new Map()
        stores.set(name, store)
    }
    return store
}

// Called only when a limiter is full. Frees 10% at once so a flood of new keys
// costs one scan per ~1,000 inserts rather than one per insert.
function makeRoom(store: Map<string, Bucket>, now: number): void {
    for (const [k, b] of store) {
        if (b.resetAt <= now) store.delete(k)
    }
    // Still too full: evict the oldest buckets (Maps iterate in insertion order).
    let excess = store.size - Math.floor(MAX_KEYS_PER_STORE * 0.9)
    for (const k of store.keys()) {
        if (excess-- <= 0) break
        store.delete(k)
    }
}

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number }

/**
 * Count a hit against `key` in the named limiter.
 * Returns ok=false once `limit` hits inside `windowMs` are exceeded.
 */
export function rateLimit(
    name: string,
    key: string,
    limit: number,
    windowMs: number
): RateLimitResult {
    const store = getStore(name)
    const now = Date.now()
    key = ipBucket(key)

    const bucket = store.get(key)
    if (!bucket || bucket.resetAt <= now) {
        if (!bucket && store.size >= MAX_KEYS_PER_STORE) makeRoom(store, now)
        store.set(key, { count: 1, resetAt: now + windowMs })
        return { ok: true, retryAfterSeconds: 0 }
    }

    bucket.count++
    if (bucket.count > limit) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
    }
    return { ok: true, retryAfterSeconds: 0 }
}

// ─── Auth brute-force damping (in-process layer) ─────────────────────────────
// Only *failed* auth attempts count, so legitimate admin traffic is never
// throttled. Two layers, both per scope:
//  - per IP: 10 failures / 15 min
//  - global: 100 failures / 15 min across all IPs, so an attacker with many
//    addresses still gets a bounded number of guesses. Trade-off: during such
//    an attack, new sign-ins are refused until the window ends (existing admin
//    sessions are unaffected — see lib/admin-auth.ts).
// Routes don't call these directly: lib/auth-lockout.ts combines this layer
// with counters shared across serverless instances.

export const AUTH_FAIL_LIMIT = 10
export const AUTH_GLOBAL_FAIL_LIMIT = 100
export const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000
const GLOBAL_KEY = "all"

function isOverLimit(bucket: Bucket | undefined, limit: number): boolean {
    if (!bucket || bucket.resetAt <= Date.now()) return false
    return bucket.count >= limit
}

export function isAuthBlocked(route: string, ip: string): boolean {
    return (
        isOverLimit(getStore(`auth-global:${route}`).get(GLOBAL_KEY), AUTH_GLOBAL_FAIL_LIMIT) ||
        isOverLimit(getStore(`auth:${route}`).get(ipBucket(ip)), AUTH_FAIL_LIMIT)
    )
}

export function recordAuthFailure(route: string, ip: string): void {
    rateLimit(`auth:${route}`, ip, Number.MAX_SAFE_INTEGER, AUTH_FAIL_WINDOW_MS)
    rateLimit(`auth-global:${route}`, GLOBAL_KEY, Number.MAX_SAFE_INTEGER, AUTH_FAIL_WINDOW_MS)
}

/** Test helper — clears all limiter state. */
export function resetRateLimits(): void {
    stores.clear()
}
