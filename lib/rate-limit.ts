/**
 * In-memory fixed-window rate limiter.
 *
 * NOTE: state lives in the process. On serverless (Netlify functions) each
 * warm instance has its own counters, so this is best-effort abuse damping,
 * not a hard guarantee. For a hard guarantee use a shared store
 * (e.g. Upstash Redis) — see SECURITY.md.
 */

type Bucket = { count: number; resetAt: number }

const stores = new Map<string, Map<string, Bucket>>()

function getStore(name: string): Map<string, Bucket> {
    let store = stores.get(name)
    if (!store) {
        store = new Map()
        stores.set(name, store)
    }
    return store
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

    // Opportunistic cleanup so the map can't grow unbounded
    if (store.size > 10_000) {
        for (const [k, b] of store) {
            if (b.resetAt <= now) store.delete(k)
        }
    }

    const bucket = store.get(key)
    if (!bucket || bucket.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + windowMs })
        return { ok: true, retryAfterSeconds: 0 }
    }

    bucket.count++
    if (bucket.count > limit) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
    }
    return { ok: true, retryAfterSeconds: 0 }
}

// ─── Auth brute-force damping ────────────────────────────────────────────────
// Only *failed* auth attempts count, so legitimate admin traffic is never
// throttled. 10 failures per 15 minutes per IP per route.

const AUTH_FAIL_LIMIT = 10
const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000

export function isAuthBlocked(route: string, ip: string): boolean {
    const bucket = getStore(`auth:${route}`).get(ip)
    if (!bucket) return false
    if (bucket.resetAt <= Date.now()) return false
    return bucket.count >= AUTH_FAIL_LIMIT
}

export function recordAuthFailure(route: string, ip: string): void {
    rateLimit(`auth:${route}`, ip, Number.MAX_SAFE_INTEGER, AUTH_FAIL_WINDOW_MS)
}

/** Test helper — clears all limiter state. */
export function resetRateLimits(): void {
    stores.clear()
}
