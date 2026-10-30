/**
 * Request body caps on every route that reads a body.
 * Security: `req.json()` buffers the whole body before validation, so an
 * uncapped route lets anyone make the server read and parse megabytes per
 * request. Each route must refuse with 413 before touching the database,
 * the email provider, or the lockout counter.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { BODY_LIMITS } from "@/lib/http"
import { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } from "@/lib/consent"
import { makeRequest, type SupabaseMockState } from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: { id: "1" }, error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

jest.mock("resend", () => {
    const send = jest.fn()
    return {
        Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
        __mockSend: send,
    }
})

import { POST as signIn } from "@/app/api/auth/route"
import { POST as recordConsent } from "@/app/api/consent/route"
import { POST as track } from "@/app/api/analytics/track/route"
import { POST as createPost } from "@/app/api/blog/posts/route"
import { POST as createProject } from "@/app/api/projects/route"
import { POST as blogUpload } from "@/app/api/blog/upload/route"
import { POST as docsUpload } from "@/app/api/docs/upload/route"
import { POST as emailSummary } from "@/app/api/email-summary/route"

const mockDb = (jest.requireMock("@/lib/supabase-admin") as { __state: SupabaseMockState }).__state
const mockSend = (jest.requireMock("resend") as { __mockSend: jest.Mock }).__mockSend

const PASSWORD = "admin-password"
const IP = "1.2.3.4"
const OPT_IN = `${CONSENT_COOKIE}=${serializeConsent({
    version: CONSENT_VERSION, analytics: true, decidedAt: Date.now(), id: "7d3f4b2a-1c9e-4f60-8a1b-2c3d4e5f6a7b",
})}`

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
    makeRequest(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": IP, ...headers },
        body,
    })

const jsonOfSize = (bytes: number) => JSON.stringify({ pad: "x".repeat(bytes) })

beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = PASSWORD
    process.env.SESSION_SECRET = "test-session-secret"
    process.env.BLOG_UPLOAD_SECRET = "blog-secret"
    process.env.DOCS_UPLOAD_SECRET = "docs-secret"
    process.env.EMAIL_SUMMARY_SECRET = "email-secret"
    process.env.SUMMARY_RECIPIENT_EMAIL = "me@example.com"
    process.env.RESEND_API_KEY = "re_test_key"
    resetRateLimits()
    mockDb.calls = []
    mockSend.mockReset()
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

const cases = [
    ["/api/auth", signIn, BODY_LIMITS.tiny, {}],
    ["/api/consent", recordConsent, BODY_LIMITS.tiny, { "sec-fetch-site": "same-origin" }],
    ["/api/analytics/track", track, BODY_LIMITS.track, { cookie: OPT_IN }],
    ["/api/blog/posts", createPost, BODY_LIMITS.admin, { "x-logistics-key": PASSWORD }],
    ["/api/projects", createProject, BODY_LIMITS.admin, { "x-logistics-key": PASSWORD }],
    ["/api/blog/upload", blogUpload, BODY_LIMITS.upload, { "x-api-key": "blog-secret" }],
    ["/api/docs/upload", docsUpload, BODY_LIMITS.upload, { "x-api-key": "docs-secret" }],
    ["/api/email-summary", emailSummary, BODY_LIMITS.upload, { "x-api-key": "email-secret" }],
] as const

describe.each(cases)("%s", (path, handler, limit, headers) => {
    it(`refuses a body over ${limit} bytes with 413 and no side effects`, async () => {
        const res = await handler(post(path, jsonOfSize(limit + 1), headers))
        expect(res.status).toBe(413)
        expect(mockDb.calls).toHaveLength(0)
        expect(mockSend).not.toHaveBeenCalled()
    })

    it("refuses early when Content-Length already declares too much", async () => {
        const res = await handler(post(path, "{}", { ...headers, "content-length": String(limit + 1) }))
        expect(res.status).toBe(413)
    })
})

describe("oversized sign-in attempts", () => {
    it("aren't counted as password guesses", async () => {
        for (let i = 0; i < 20; i++) {
            await signIn(post("/api/auth", JSON.stringify({ password: "x".repeat(BODY_LIMITS.tiny) })))
        }
        const res = await signIn(post("/api/auth", JSON.stringify({ password: PASSWORD })))
        expect(res.status).toBe(200)
    })
})
