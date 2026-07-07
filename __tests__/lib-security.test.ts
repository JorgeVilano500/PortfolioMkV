/**
 * lib/security — timing-safe comparison + client IP extraction.
 */
import { NextRequest } from "next/server"
import { safeEqual, getClientIp } from "@/lib/security"

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

    it("takes the first x-forwarded-for entry", () => {
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
