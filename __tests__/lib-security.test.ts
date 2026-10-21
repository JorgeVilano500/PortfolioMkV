/**
 * lib/security — timing-safe comparison + client IP extraction.
 */
import { NextRequest } from "next/server"
import { safeEqual, getClientIp, isSameOriginRequest } from "@/lib/security"

describe("safeEqual", () => {
    it("returns true for identical strings", () => {
        expect(safeEqual("hunter2", "hunter2")).toBe(true)
    })

    it("returns false for different strings", () => {
        expect(safeEqual("hunter2", "hunter3")).toBe(false)
    })

    it("returns false for different lengths (no length leak crash)", () => {
        expect(safeEqual("short", "a-much-longer-secret-value")).toBe(false)
    })

    it("returns false when provided is null/undefined/empty", () => {
        expect(safeEqual(null, "secret")).toBe(false)
        expect(safeEqual(undefined, "secret")).toBe(false)
        expect(safeEqual("", "secret")).toBe(false)
    })

    it("returns false when expected is missing — never authenticates against an unset secret", () => {
        expect(safeEqual("anything", undefined)).toBe(false)
        expect(safeEqual("anything", "")).toBe(false)
        expect(safeEqual("", "")).toBe(false)
    })

    it("is case-sensitive", () => {
        expect(safeEqual("Secret", "secret")).toBe(false)
    })

    it("handles unicode", () => {
        expect(safeEqual("pässwörd🔑", "pässwörd🔑")).toBe(true)
        expect(safeEqual("pässwörd🔑", "password")).toBe(false)
    })
})

describe("getClientIp", () => {
    const make = (headers: Record<string, string>) =>
        new NextRequest("http://localhost/api/test", { headers })

    it("prefers Netlify's connection IP over a client-supplied x-forwarded-for", () => {
        // Production trusted a forged XFF on 2026-10-19 — rotating fake values
        // reset the per-IP lockout. The platform header must win.
        const req = make({ "x-nf-client-connection-ip": "203.0.113.9", "x-forwarded-for": "6.6.6.6" })
        expect(getClientIp(req)).toBe("203.0.113.9")
    })

    it("cannot be reset by rotating x-forwarded-for when the platform header is present", () => {
        const ips = ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((xff) =>
            getClientIp(make({ "x-nf-client-connection-ip": "203.0.113.9", "x-forwarded-for": xff })))
        expect(new Set(ips).size).toBe(1)
    })

    it("takes the first x-forwarded-for entry (off-Netlify fallback)", () => {
        expect(getClientIp(make({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4")
    })

    it("trims whitespace", () => {
        expect(getClientIp(make({ "x-forwarded-for": "  1.2.3.4  ,10.0.0.1" }))).toBe("1.2.3.4")
    })

    it("falls back to x-real-ip", () => {
        expect(getClientIp(make({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8")
    })

    it("returns 'unknown' with no headers", () => {
        expect(getClientIp(make({}))).toBe("unknown")
    })
})

describe("isSameOriginRequest", () => {
    const make = (headers: Record<string, string>) =>
        new NextRequest("http://localhost/api/test", { method: "POST", headers })

    it("trusts Sec-Fetch-Site when present", () => {
        expect(isSameOriginRequest(make({ "sec-fetch-site": "same-origin" }))).toBe(true)
        expect(isSameOriginRequest(make({ "sec-fetch-site": "cross-site" }))).toBe(false)
        // netlify.app is a public suffix, so a sibling subdomain is "same-site" but not ours
        expect(isSameOriginRequest(make({ "sec-fetch-site": "same-site" }))).toBe(false)
    })

    it("falls back to comparing Origin with Host", () => {
        expect(isSameOriginRequest(make({ origin: "https://javastudios.netlify.app", host: "javastudios.netlify.app" }))).toBe(true)
        expect(isSameOriginRequest(make({ origin: "https://evil.netlify.app", host: "javastudios.netlify.app" }))).toBe(false)
        expect(isSameOriginRequest(make({ origin: "null", host: "javastudios.netlify.app" }))).toBe(false)
    })

    it("allows non-browser clients that send neither header", () => {
        expect(isSameOriginRequest(make({}))).toBe(true)
    })
})
