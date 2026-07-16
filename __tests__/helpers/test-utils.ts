import { NextRequest } from "next/server"

/** Build a NextRequest (adds the duplex flag Node's fetch needs for bodies). */
export function makeRequest(
    url: string,
    init: {
        method?: string
        headers?: Record<string, string>
        body?: string
    } = {}
): NextRequest {
    const requestInit = {
        method: init.method ?? "GET",
        headers: init.headers,
        body: init.body,
        // Required by undici when a body is present
        duplex: "half",
    }
    return new NextRequest(url, requestInit as ConstructorParameters<typeof NextRequest>[1])
}

export function jsonRequest(
    url: string,
    method: string,
    body: unknown,
    headers: Record<string, string> = {}
): NextRequest {
    return makeRequest(url, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    })
}

/**
 * Chainable thenable that mimics the supabase-js query builder.
 * Every method returns the chain; awaiting it resolves to `state.result`.
 * All calls are recorded in `state.calls` for assertions.
 */
export type SupabaseMockState = {
    result: { data: unknown; error: { message: string } | null }
    /** Optional per-query results — consumed in order before falling back to `result`. */
    queue?: { data: unknown; error: { message: string } | null }[]
    calls: { method: string; args: unknown[] }[]
}

export function createChain(state: SupabaseMockState) {
    const chain: Record<string, unknown> = {}
    const methods = [
        "from", "select", "order", "limit", "insert",
        "update", "upsert", "delete", "eq", "in", "like", "single",
    ]
    for (const m of methods) {
        chain[m] = (...args: unknown[]) => {
            state.calls.push({ method: m, args })
            return chain
        }
    }
    chain.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown
    ) => {
        const result = state.queue?.length ? state.queue.shift()! : state.result
        return Promise.resolve(result).then(resolve, reject)
    }
    return chain
}

/** Find the first recorded call for a method (e.g. the row passed to insert). */
export function firstCallArg(state: SupabaseMockState, method: string): unknown {
    return state.calls.find((c) => c.method === method)?.args[0]
}
