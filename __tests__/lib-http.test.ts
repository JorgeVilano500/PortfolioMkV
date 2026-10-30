/**
 * lib/http — size-capped body readers.
 * Security: a client must not be able to make a route buffer or parse more
 * than its cap, whether Content-Length is honest, absent, or lying.
 */
import { BODY_LIMITS, BodyTooLargeError, readBodyText, readJsonBody } from "@/lib/http"

const URL = "http://localhost/api/x"

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
    return new Request(URL, { method: "POST", body, headers, duplex: "half" } as RequestInit)
}

/** A body stream that never declares its size; records how much was pulled. */
function streamOf(chunks: Uint8Array[]) {
    const stats = { pulled: 0, cancelled: false }
    let i = 0
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (i < chunks.length) {
                stats.pulled++
                controller.enqueue(chunks[i++])
            } else {
                controller.close()
            }
        },
        cancel() {
            stats.cancelled = true
        },
    })
    return { stream, stats }
}

describe("readBodyText", () => {
    it("returns the body when it is within the cap", async () => {
        expect(await readBodyText(post("hello"), 10)).toBe("hello")
    })

    it("returns an empty string for a request with no body", async () => {
        expect(await readBodyText(new Request(URL), 10)).toBe("")
    })

    it("accepts a body exactly at the cap", async () => {
        expect(await readBodyText(post("x".repeat(10)), 10)).toBe("x".repeat(10))
    })

    it("rejects from Content-Length before reading anything", async () => {
        const { stream } = streamOf([new Uint8Array(4)])
        const req = post(stream, { "content-length": "999999" })
        await expect(readBodyText(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError)
        expect(req.bodyUsed).toBe(false)
    })

    it("enforces the cap while streaming when no length is declared", async () => {
        const chunk = new Uint8Array(1024)
        const { stream, stats } = streamOf(Array.from({ length: 100 }, () => chunk))
        await expect(readBodyText(post(stream), 4096)).rejects.toBeInstanceOf(BodyTooLargeError)
        // Stopped as soon as the cap was crossed — never pulled the whole 100 KB.
        expect(stats.pulled).toBeLessThan(10)
        expect(stats.cancelled).toBe(true)
    })

    it("counts bytes, not characters (multi-byte UTF-8 can't slip past)", async () => {
        const emoji = "😀".repeat(5) // 5 chars of JS length 10, but 20 bytes
        await expect(readBodyText(post(emoji), 16)).rejects.toBeInstanceOf(BodyTooLargeError)
        expect(await readBodyText(post(emoji), 20)).toBe(emoji)
    })

    it("ignores a non-numeric Content-Length and still caps the stream", async () => {
        const req = post("x".repeat(50), { "content-length": "abc" })
        await expect(readBodyText(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError)
    })
})

describe("readJsonBody", () => {
    it("parses JSON within the cap", async () => {
        expect(await readJsonBody(post('{"a":1}'), 100)).toEqual({ ok: true, body: { a: 1 } })
    })

    it("reports invalid JSON as 400", async () => {
        const res = await readJsonBody(post("{nope"), 100)
        expect(res).toMatchObject({ ok: false, status: 400 })
    })

    it("reports an empty body as 400, not a crash", async () => {
        expect(await readJsonBody(post(""), 100)).toMatchObject({ ok: false, status: 400 })
    })

    it("reports an oversized body as 413 without parsing it", async () => {
        const parse = jest.spyOn(JSON, "parse")
        const res = await readJsonBody(post(JSON.stringify({ x: "y".repeat(500) })), 100)
        expect(res).toMatchObject({ ok: false, status: 413 })
        expect(parse).not.toHaveBeenCalled()
        parse.mockRestore()
    })

    it("never throws when the body can't be read", async () => {
        const broken = new ReadableStream({ pull(c) { c.error(new Error("socket reset")) } })
        expect(await readJsonBody(post(broken), 100)).toMatchObject({ ok: false, status: 400 })
    })
})

describe("BODY_LIMITS", () => {
    it("keeps public endpoints far smaller than admin and upload ones", () => {
        expect(BODY_LIMITS.tiny).toBeLessThan(BODY_LIMITS.track)
        expect(BODY_LIMITS.track).toBeLessThan(BODY_LIMITS.admin)
        expect(BODY_LIMITS.admin).toBeLessThan(BODY_LIMITS.upload)
    })
})
