import "server-only"
import { createHmac } from "crypto"
import {
    AUTH_FAIL_LIMIT,
    AUTH_GLOBAL_FAIL_LIMIT,
    AUTH_FAIL_WINDOW_MS,
    isAuthBlocked as isBlockedInMemory,
    recordAuthFailure as recordInMemory,
} from "./rate-limit"
import { ipBucket } from "./security"
import { isMissingFunction, warnSchemaOnce } from "./supabase-errors"

/**
 * Brute-force lockout shared by every serverless instance.
 *
 * Layer 1 is the in-process limiter (instant, per instance). Layer 2 is a
 * pair of Postgres functions (supabase/auth-lockout-schema.sql) so counters
 * survive cold starts and can't be multiplied by spreading requests across
 * instances. If the functions aren't installed or the database errors, the
 * check falls back to layer 1 rather than locking everyone out.
 *
 * Set AUTH_LOCKOUT_STORE=memory to disable layer 2 (tests do this).
 */

/** Every route that checks LOGISTICS_PASSWORD shares one counter, so adding
 * endpoints never multiplies an attacker's guesses. */
export const ADMIN_PASSWORD_SCOPE = "admin-password"

function storeEnabled(): boolean {
    return process.env.AUTH_LOCKOUT_STORE !== "memory"
}

/**
 * Keys hold a keyed hash, never the raw IP (IPv6 counted per /64). Keyed with
 * a server secret because a plain hash of an IPv4 address can be reversed by
 * hashing all 2^32 of them. Rotating that secret just restarts the counters.
 */
function keysFor(scope: string, ip: string): { ipKey: string; globalKey: string } {
    const pepper = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    const hashed = createHmac("sha256", pepper).update(`${scope}\0${ipBucket(ip)}`).digest("base64url").slice(0, 22)
    return { ipKey: `${scope}:ip:${hashed}`, globalKey: `${scope}:global` }
}

type StoreError = { code?: string; message?: string }

/**
 * supabase-js reports most failures as `error`, but a thrown fetch — or a
 * client that can't even be built because env vars are missing — must not
 * turn every sign-in into a 500. Loaded lazily for the same reason: the
 * auth routes keep working on the in-memory layer without Supabase.
 */
async function callStore(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: StoreError | null }> {
    try {
        const { supabaseAdmin } = await import("./supabase-admin")
        return await supabaseAdmin.rpc(fn, args)
    } catch (err) {
        return { data: null, error: { message: err instanceof Error ? err.message : String(err) } }
    }
}

function reportStoreError(error: StoreError): void {
    if (isMissingFunction(error)) {
        warnSchemaOnce("auth-lockout", "run supabase/auth-lockout-schema.sql to share lockouts across instances")
    } else {
        console.error("[auth-lockout] store error:", error.message)
    }
}

export async function isAuthBlocked(scope: string, ip: string): Promise<boolean> {
    if (isBlockedInMemory(scope, ip)) return true
    if (!storeEnabled()) return false

    const { ipKey, globalKey } = keysFor(scope, ip)
    const { data, error } = await callStore("auth_failure_counts", { p_keys: [ipKey, globalKey] })
    if (error) {
        reportStoreError(error)
        return false // layer 1 already said no; don't lock everyone out on a DB hiccup
    }
    const counts = new Map(
        ((data ?? []) as { key: string; count: number }[]).map((row) => [row.key, row.count])
    )
    return (counts.get(ipKey) ?? 0) >= AUTH_FAIL_LIMIT || (counts.get(globalKey) ?? 0) >= AUTH_GLOBAL_FAIL_LIMIT
}

export async function recordAuthFailure(scope: string, ip: string): Promise<void> {
    recordInMemory(scope, ip)
    if (!storeEnabled()) return

    const { ipKey, globalKey } = keysFor(scope, ip)
    const { error } = await callStore("auth_failure_hit", {
        p_keys: [ipKey, globalKey],
        p_window_seconds: AUTH_FAIL_WINDOW_MS / 1000,
    })
    if (error) reportStoreError(error)
}
