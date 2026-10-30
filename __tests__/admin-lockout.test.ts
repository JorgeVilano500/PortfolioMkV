/**
 * Admin password lockout across routes.
 * Security: /api/auth, /api/blog/posts, /api/projects and
 * /api/analytics/stats all check LOGISTICS_PASSWORD, so they share one
 * counter — adding an endpoint must never hand an attacker more guesses.
 * Requests that carry no credential at all aren't guesses and don't count,
 * so a crawler or an expired dashboard tab can't lock the owner out.
 */
import { resetRateLimits } from "@/lib/rate-limit"
import { makeRequest, jsonRequest } from "./helpers/test-utils"

jest.mock("@/lib/supabase-admin", () => {
    const { createChain } = jest.requireActual("./helpers/test-utils")
    const state = { result: { data: [], error: null }, calls: [] }
    return { supabaseAdmin: createChain(state), __state: state }
})

import { POST as signIn } from "@/app/api/auth/route"
import { GET as listProjects } from "@/app/api/projects/route"
import { GET as listPosts } from "@/app/api/blog/posts/route"
import { GET as stats } from "@/app/api/analytics/stats/route"

const PASSWORD = "admin-password"
const IP = "7.7.7.7"

const login = (password: unknown, ip = IP) =>
    signIn(jsonRequest("http://localhost/api/auth", "POST", { password }, { "x-forwarded-for": ip }))

const withKey = (url: string, key: string | null, ip = IP) =>
    makeRequest(url, { headers: { "x-forwarded-for": ip, ...(key === null ? {} : { "x-logistics-key": key }) } })

beforeEach(() => {
    process.env.LOGISTICS_PASSWORD = PASSWORD
    process.env.SESSION_SECRET = "test-session-secret"
    resetRateLimits()
    jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("one counter for every admin-password route", () => {
    it("guesses spread across routes add up to one lockout", async () => {
        for (let i = 0; i < 4; i++) await listProjects(withKey("http://localhost/api/projects", "wrong"))
        for (let i = 0; i < 3; i++) await listPosts(withKey("http://localhost/api/blog/posts", "wrong"))
        for (let i = 0; i < 3; i++) await login("wrong")

        // 10 total → the right password is refused on every route.
        expect((await login(PASSWORD)).status).toBe(429)
        expect((await listProjects(withKey("http://localhost/api/projects", PASSWORD))).status).toBe(429)
        expect((await stats(withKey("http://localhost/api/analytics/stats", PASSWORD))).status).toBe(429)
    })

    it("a lockout earned on the sign-in form also guards the API", async () => {
        for (let i = 0; i < 10; i++) await login("wrong")
        expect((await listPosts(withKey("http://localhost/api/blog/posts", PASSWORD))).status).toBe(429)
    })

    it("other IPs are unaffected", async () => {
        for (let i = 0; i < 10; i++) await login("wrong")
        expect((await login(PASSWORD, "8.8.8.8")).status).toBe(200)
    })
})

describe("only real guesses count", () => {
    it("requests without a key never lock anyone out", async () => {
        for (let i = 0; i < 25; i++) {
            expect((await listProjects(withKey("http://localhost/api/projects", null))).status).toBe(401)
        }
        expect((await listProjects(withKey("http://localhost/api/projects", PASSWORD))).status).toBe(200)
    })

    it("an empty or non-string password isn't a guess", async () => {
        for (let i = 0; i < 25; i++) {
            await login("")
            await login(null)
        }
        expect((await login(PASSWORD)).status).toBe(200)
    })
})

describe("upload secrets are separate scopes", () => {
    it("failing the blog upload secret doesn't lock the admin password", async () => {
        process.env.BLOG_UPLOAD_SECRET = "upload-secret"
        const { POST: upload } = await import("@/app/api/blog/upload/route")
        for (let i = 0; i < 10; i++) {
            await upload(makeRequest("http://localhost/api/blog/upload", {
                method: "POST",
                headers: { "x-api-key": "wrong", "x-forwarded-for": IP },
                body: "---\ntitle: x\n---\nbody",
            }))
        }
        expect((await login(PASSWORD)).status).toBe(200)
    })
})
