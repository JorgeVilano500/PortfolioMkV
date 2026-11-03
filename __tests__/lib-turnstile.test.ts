/**
 * lib/turnstile — the server half of the sponsorship form's spam check
 * (SECURITY.md S-40). Off until TURNSTILE_SECRET_KEY is set; then it fails
 * closed: no valid token, no email.
 */
import { resetTurnstileWarning, verifyTurnstile } from "@/lib/turnstile"

const fetchMock = jest.fn()
const reply = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body })
const sentForm = () => new URLSearchParams(String((fetchMock.mock.calls[0][1] as { body: URLSearchParams }).body))

beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA" // Cloudflare's always-pass test secret
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
    resetTurnstileWarning()
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    jest.restoreAllMocks()
})

it("is off (and calls nobody) without a secret", async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    expect(await verifyTurnstile(undefined, "203.0.113.7")).toBe("ok")
    expect(fetchMock).not.toHaveBeenCalled()
})

it("refuses a missing, empty or oversized token without calling Cloudflare", async () => {
    for (const token of [undefined, null, "", 42, "x".repeat(2049)]) {
        expect(await verifyTurnstile(token, "203.0.113.7")).toBe("missing")
    }
    expect(fetchMock).not.toHaveBeenCalled()
})

it("accepts a token Cloudflare confirms, sending the secret, token and client IP", async () => {
    reply(200, { success: true, "error-codes": [] })
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", "203.0.113.7")).toBe("ok")
    expect(fetchMock.mock.calls[0][0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify")
    const form = sentForm()
    expect(form.get("secret")).toBe("1x0000000000000000000000000000000AA")
    expect(form.get("response")).toBe("XXXX.DUMMY.TOKEN.XXXX")
    expect(form.get("remoteip")).toBe("203.0.113.7")
})

it("doesn't send an IP that isn't one", async () => {
    reply(200, { success: true })
    await verifyTurnstile("token", "unknown")
    expect(sentForm().has("remoteip")).toBe(false)
})

it("refuses a token Cloudflare rejects (forged, expired, or already used)", async () => {
    reply(200, { success: false, "error-codes": ["timeout-or-duplicate"] })
    expect(await verifyTurnstile("token", "203.0.113.7")).toBe("invalid")
})

it("fails closed when Cloudflare is down or unreachable", async () => {
    reply(500, {})
    expect(await verifyTurnstile("token", "203.0.113.7")).toBe("unavailable")
    fetchMock.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"))
    expect(await verifyTurnstile("token", "203.0.113.7")).toBe("unavailable")
})

it("warns once when the secret is set but the site key isn't (nobody could pass)", async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    await verifyTurnstile(undefined, "203.0.113.7")
    await verifyTurnstile(undefined, "203.0.113.7")
    const warnings = (console.error as jest.Mock).mock.calls.filter(([m]) => String(m).includes("NEXT_PUBLIC_TURNSTILE_SITE_KEY"))
    expect(warnings).toHaveLength(1)
})
