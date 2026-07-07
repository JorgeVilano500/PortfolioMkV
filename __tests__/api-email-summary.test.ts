/**
 * /api/email-summary — Resend delivery endpoint (x-api-key auth).
 * Security: auth, lockout, send-rate cap, fixed recipient (no open relay),
 * input validation.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { makeRequest, jsonRequest } from "./helpers/test-utils"

jest.mock("resend", () => {
    const send = jest.fn()
    return {
        Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
        __mockSend: send,
    }
})

import { POST } from "@/app/api/email-summary/route"

const mockSend = (jest.requireMock("resend") as { __mockSend: jest.Mock }).__mockSend

const URL = "http://localhost/api/email-summary"
const KEY = "test-email-secret"

function send(body: unknown, headers: Record<string, string> = {}) {
    return POST(jsonRequest(URL, "POST", body, {
        "x-api-key": KEY,
        "x-forwarded-for": "1.2.3.4",
        ...headers,
    }))
}

beforeEach(() => {
    process.env.EMAIL_SUMMARY_SECRET = KEY
    process.env.SUMMARY_RECIPIENT_EMAIL = "me@example.com"
    process.env.RESEND_FROM_EMAIL = "Site <noreply@example.com>"
    resetRateLimits()
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: "email-123" }, error: null })
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("auth", () => {
    it("rejects a missing key", async () => {
        const res = await POST(makeRequest(URL, { method: "POST", body: "{}" }))
        expect(res.status).toBe(401)
        expect(mockSend).not.toHaveBeenCalled()
    })

    it("rejects a wrong key", async () => {
        expect((await send({ text: "hi" }, { "x-api-key": "wrong" })).status).toBe(401)
        expect(mockSend).not.toHaveBeenCalled()
    })

    it("fails closed when the secret is unset", async () => {
        delete process.env.EMAIL_SUMMARY_SECRET
        expect((await send({ text: "hi" })).status).toBe(401)
    })

    it("locks out after repeated failures", async () => {
        for (let i = 0; i < 10; i++) await send({ text: "hi" }, { "x-api-key": "wrong" })
        expect((await send({ text: "hi" })).status).toBe(429)
    })
})

describe("sending", () => {
    it("sends a valid summary to the configured recipient only", async () => {
        const res = await send({ subject: "Daily", text: "All good" })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, id: "email-123" })

        const call = mockSend.mock.calls[0][0]
        expect(call.to).toBe("me@example.com") // fixed env recipient — never client-supplied
        expect(call.subject).toBe("Daily")
        expect(call.text).toBe("All good")
    })

    it("cannot be used as an open relay — a 'to' in the body is ignored", async () => {
        await send({ text: "spam", to: "victim@example.com" })
        const call = mockSend.mock.calls[0][0]
        expect(call.to).toBe("me@example.com")
    })

    it("falls back to a dated subject", async () => {
        await send({ text: "hi" })
        expect(mockSend.mock.calls[0][0].subject).toContain("Inbox summary")
    })

    it("returns 500 when the recipient env var is missing", async () => {
        delete process.env.SUMMARY_RECIPIENT_EMAIL
        expect((await send({ text: "hi" })).status).toBe(500)
        expect(mockSend).not.toHaveBeenCalled()
    })

    it("hides provider error details behind a 502", async () => {
        mockSend.mockResolvedValue({ data: null, error: { message: "api key resend_XYZ invalid" } })
        const res = await send({ text: "hi" })
        expect(res.status).toBe(502)
        expect(JSON.stringify(await res.json())).not.toContain("resend_XYZ")
    })
})

describe("validation", () => {
    it("rejects invalid JSON", async () => {
        const res = await POST(makeRequest(URL, {
            method: "POST",
            headers: { "x-api-key": KEY },
            body: "{nope",
        }))
        expect(res.status).toBe(400)
    })

    it("requires at least one of text/html", async () => {
        expect((await send({ subject: "empty" })).status).toBe(400)
    })

    it("rejects non-string fields", async () => {
        expect((await send({ text: { evil: true } })).status).toBe(400)
        expect((await send({ text: "ok", subject: 42 })).status).toBe(400)
        expect((await send({ html: ["a"] })).status).toBe(400)
    })

    it("rejects oversized bodies", async () => {
        expect((await send({ text: "a".repeat(500_001) })).status).toBe(400)
    })
})

describe("send-rate cap", () => {
    it("stops after 10 sends per hour even with a valid key", async () => {
        for (let i = 0; i < 10; i++) {
            expect((await send({ text: "hi" })).status).toBe(200)
        }
        const res = await send({ text: "hi" })
        expect(res.status).toBe(429)
        expect(mockSend).toHaveBeenCalledTimes(10)
    })
})
