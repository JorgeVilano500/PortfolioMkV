/**
 * lib/analytics + lib/user-agent + lib/random-id — small helpers behind the
 * consent-gated analytics pipeline.
 */
import { isTrackablePath, normalizeLanguage, normalizeTimezone } from "@/lib/analytics"
import { summarizeUserAgent } from "@/lib/user-agent"
import { randomId } from "@/lib/random-id"
import { isUuid } from "@/lib/validation"

describe("isTrackablePath", () => {
    it("never tracks admin or API paths", () => {
        for (const p of ["/studio", "/logistics", "/api/auth", "/studio/x"]) expect(isTrackablePath(p)).toBe(false)
        for (const p of ["/", "/work", "/blog/my-post", "/privacy"]) expect(isTrackablePath(p)).toBe(true)
    })
})

describe("normalizeLanguage / normalizeTimezone", () => {
    it("accepts real browser values", () => {
        for (const v of ["en", "en-US", "zh-Hant-TW", "es-419"]) expect(normalizeLanguage(v)).toBe(v)
        for (const v of ["UTC", "America/Los_Angeles", "America/Argentina/Buenos_Aires", "Etc/GMT+8"]) expect(normalizeTimezone(v)).toBe(v)
    })

    it("drops anything else", () => {
        for (const v of ["", "<script>", "e", "en_US", 42, null, "x".repeat(40)]) expect(normalizeLanguage(v)).toBeNull()
        for (const v of ["", "../../etc/passwd", "Europe/<b>", 7, null, "a/b/c/d"]) expect(normalizeTimezone(v)).toBeNull()
    })
})

describe("summarizeUserAgent", () => {
    it.each([
        ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", "Chrome", "Windows"],
        ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0", "Edge", "Windows"],
        ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Safari", "macOS"],
        ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari", "iOS"],
        ["Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36", "Chrome", "Android"],
        ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox", "Linux"],
    ])("summarizes %s", (ua, browser, os) => {
        expect(summarizeUserAgent(ua)).toEqual({ browser, os })
    })

    it("labels bots and handles missing values", () => {
        expect(summarizeUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)").browser).toBe("Bot")
        expect(summarizeUserAgent("")).toEqual({ browser: "Unknown", os: "Unknown" })
        expect(summarizeUserAgent(null)).toEqual({ browser: "Unknown", os: "Unknown" })
    })
})

describe("randomId", () => {
    it("returns v4 uuids, even without crypto.randomUUID (plain-http origins)", () => {
        expect(isUuid(randomId())).toBe(true)
        const original = crypto.randomUUID
        Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true })
        try {
            const id = randomId()
            expect(isUuid(id)).toBe(true)
            expect(id[14]).toBe("4")
            expect("89ab").toContain(id[19])
        } finally {
            Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true })
        }
    })
})
