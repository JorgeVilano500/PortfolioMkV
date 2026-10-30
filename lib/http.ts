import "server-only"

/**
 * Size-capped request body readers for route handlers.
 *
 * `req.json()` / `req.text()` buffer the whole body before any validation
 * runs, so a client could make a public endpoint parse megabytes of junk per
 * request. These readers reject early from Content-Length and enforce the cap
 * while streaming (Content-Length can be absent or lie), cancelling the
 * stream as soon as it's exceeded.
 */

/** Byte caps per endpoint class — sized to the largest legitimate payload. */
export const BODY_LIMITS = {
    /** /api/auth, /api/consent — a password or a consent receipt */
    tiny: 2 * 1024,
    /** /api/analytics/track — one page view */
    track: 8 * 1024,
    /** /api/blog/posts, /api/projects — post content ≤200k chars (≤4 bytes each in UTF-8) */
    admin: 1024 * 1024,
    /** /api/blog/upload, /api/docs/upload, /api/email-summary — ≤1M-char documents */
    upload: 4 * 1024 * 1024,
} as const

export class BodyTooLargeError extends Error {
    constructor() {
        super("Request body too large")
        this.name = "BodyTooLargeError"
    }
}

export async function readBodyText(req: Request, maxBytes: number): Promise<string> {
    const declared = Number(req.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError()
    if (!req.body) return ""

    const reader = req.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
            await reader.cancel().catch(() => {})
            throw new BodyTooLargeError()
        }
        chunks.push(value)
    }

    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }
    return new TextDecoder().decode(bytes)
}

export type JsonBodyResult =
    | { ok: true; body: unknown }
    | { ok: false; status: 400 | 413; error: string }

/** Read + parse JSON with a byte cap. Never throws. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<JsonBodyResult> {
    let text: string
    try {
        text = await readBodyText(req, maxBytes)
    } catch (err) {
        if (err instanceof BodyTooLargeError) return { ok: false, status: 413, error: "Request body too large" }
        return { ok: false, status: 400, error: "Could not read request body" }
    }
    try {
        return { ok: true, body: JSON.parse(text) }
    } catch {
        return { ok: false, status: 400, error: "Invalid JSON body" }
    }
}
