/**
 * lib/auth-lockout — brute-force lockout shared across serverless instances.
 * Security: counters held in Postgres can't be reset by a cold start or
 * multiplied by spreading guesses across instances; a store failure degrades
 * to the in-memory layer instead of locking everyone out (or 500ing).
 */
import { resetRateLimits } from "@/lib/rate-limit"
import type { SupabaseMockState } from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: [], error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { ADMIN_PASSWORD_SCOPE, isAuthBlocked, recordAuthFailure } from "@/lib/auth-lockout"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state
const supabaseAdmin = (jest.requireMock("@/lib/supabase-admin") as { supabaseAdmin: { rpc: unknown } }).supabaseAdmin

const IP = "203.0.113.7"

const rpcCalls = () => mockDb.calls.filter((c) => c.method === "rpc")
const keysOf = (call: { args: unknown[] }) => (call.args[1] as { p_keys: string[] }).p_keys

beforeEach(() => {
    process.env.AUTH_LOCKOUT_STORE = "supabase"
    resetRateLimits()
    mockDb.result = { data: [], error: null }
    mockDb.queue = []
    mockDb.calls = []
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
    process.env.AUTH_LOCKOUT_STORE = "memory"
    jest.restoreAllMocks()
})

describe("shared store", () => {
    it("asks the store for the per-IP and global counters", async () => {
        expect(await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)).toBe(false)
        const [call] = rpcCalls()
        expect(call.args[0]).toBe("auth_failure_counts")
        const [ipKey, globalKey] = keysOf(call)
        expect(ipKey).toMatch(/^admin-password:ip:[A-Za-z0-9_-]{22}$/)
        expect(globalKey).toBe("admin-password:global")
    })

    it("never sends the raw IP to the database", async () => {
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)
        await recordAuthFailure(ADMIN_PASSWORD_SCOPE, IP)
        expect(JSON.stringify(mockDb.calls)).not.toContain(IP)
    })

    it("keys the IP hash with a server secret (not reversible by hashing every IPv4)", async () => {
        process.env.SESSION_SECRET = "secret-a"
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)
        process.env.SESSION_SECRET = "secret-b"
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)
        delete process.env.SESSION_SECRET
        const [a, b] = rpcCalls().map((c) => keysOf(c)[0])
        expect(a).not.toBe(b)

        const { createHash } = jest.requireActual("crypto") as typeof import("crypto")
        const unkeyed = createHash("sha256").update(`${ADMIN_PASSWORD_SCOPE}\0${IP}`).digest("base64url").slice(0, 22)
        expect(a).not.toContain(unkeyed)
    })

    it("gives different IPs and scopes different keys", async () => {
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, "198.51.100.1")
        await isAuthBlocked("blog/upload", IP)
        const ipKeys = rpcCalls().map((c) => keysOf(c)[0])
        expect(new Set(ipKeys).size).toBe(3)
    })

    it("blocks an IP another instance has already locked out", async () => {
        mockDb.result = { data: null, error: null }
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP) // learn the key
        const ipKey = keysOf(rpcCalls()[0])[0]

        mockDb.result = { data: [{ key: ipKey, count: 10 }], error: null }
        expect(await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)).toBe(true)
    })

    it("stays open just under the per-IP limit", async () => {
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)
        const ipKey = keysOf(rpcCalls()[0])[0]
        mockDb.result = { data: [{ key: ipKey, count: 9 }], error: null }
        expect(await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)).toBe(false)
    })

    it("blocks every IP once the global ceiling is reached", async () => {
        mockDb.result = { data: [{ key: "admin-password:global", count: 100 }], error: null }
        expect(await isAuthBlocked(ADMIN_PASSWORD_SCOPE, "198.51.100.99")).toBe(true)
    })

    it("records a failure in the store with a 15-minute window", async () => {
        await recordAuthFailure(ADMIN_PASSWORD_SCOPE, IP)
        const [call] = rpcCalls()
        expect(call.args[0]).toBe("auth_failure_hit")
        expect(call.args[1]).toMatchObject({ p_window_seconds: 900 })
        expect(keysOf(call)).toHaveLength(2)
    })

    it("short-circuits on the in-memory layer without a store round trip", async () => {
        for (let i = 0; i < 10; i++) await recordAuthFailure(ADMIN_PASSWORD_SCOPE, IP)
        mockDb.calls = []
        expect(await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)).toBe(true)
        expect(rpcCalls()).toHaveLength(0)
    })
})

describe("degrading safely", () => {
    it("falls back to memory and warns once when the SQL hasn't been run", async () => {
        mockDb.result = { data: null, error: { message: "Could not find the function", code: "PGRST202" } }
        expect(await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)).toBe(false)
        await recordAuthFailure(ADMIN_PASSWORD_SCOPE, IP)
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)

        const warn = console.warn as jest.Mock
        const lockoutWarnings = warn.mock.calls.filter((args) => String(args[0]).includes("auth-lockout-schema.sql"))
        expect(lockoutWarnings.length).toBeLessThanOrEqual(1)
    })

    it("keeps counting in memory while the store is down", async () => {
        mockDb.result = { data: null, error: { message: "connection refused" } }
        for (let i = 0; i < 10; i++) await recordAuthFailure(ADMIN_PASSWORD_SCOPE, IP)
        expect(await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)).toBe(true)
    })

    it("does not throw (or lock everyone out) when the client itself throws", async () => {
        const original = supabaseAdmin.rpc
        supabaseAdmin.rpc = () => { throw new Error("fetch failed") }
        try {
            await expect(isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)).resolves.toBe(false)
            await expect(recordAuthFailure(ADMIN_PASSWORD_SCOPE, IP)).resolves.toBeUndefined()
        } finally {
            supabaseAdmin.rpc = original
        }
    })

    it("never touches the store when AUTH_LOCKOUT_STORE=memory", async () => {
        process.env.AUTH_LOCKOUT_STORE = "memory"
        await recordAuthFailure(ADMIN_PASSWORD_SCOPE, IP)
        await isAuthBlocked(ADMIN_PASSWORD_SCOPE, IP)
        expect(rpcCalls()).toHaveLength(0)
    })
})
