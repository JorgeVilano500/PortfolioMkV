/**
 * lib/security — timing-safe comparison + client IP extraction.
 */
import { NextRequest } from "next/server"
import { safeEqual, getClientIp, ipBucket, isSameOriginRequest } from "@/lib/security"

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

    it.each([
        ["garbage", "not-an-ip"],
        ["markup", "<script>alert(1)</script>"],
        ["a hostname", "evil.example.com"],
        ["an IP with a port", "1.2.3.4:8080"],
        ["an over-long value", "1".repeat(100)],
        ["an out-of-range octet", "999.1.1.1"],
    ])("ignores %s in a forwarding header", (_label, forged) => {
        expect(getClientIp(make({ "x-forwarded-for": forged }))).toBe("unknown")
        expect(getClientIp(make({ "x-forwarded-for": forged, "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8")
    })

    it("skips a malformed platform header rather than trusting x-forwarded-for blindly", () => {
        expect(getClientIp(make({ "x-nf-client-connection-ip": "junk", "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4")
    })

    it("accepts IPv6", () => {
        expect(getClientIp(make({ "x-nf-client-connection-ip": "2001:db8::1" }))).toBe("2001:db8::1")
    })
})

describe("ipBucket", () => {
    it("leaves IPv4 and non-IP keys alone", () => {
        expect(ipBucket("203.0.113.9")).toBe("203.0.113.9")
        expect(ipBucket("unknown")).toBe("unknown")
        expect(ipBucket("global")).toBe("global")
    })

    it("counts a whole IPv6 /64 as one client", () => {
        const a = ipBucket("2001:db8:aaaa:bbbb:1:2:3:4")
        const b = ipBucket("2001:db8:aaaa:bbbb:ffff:ffff:ffff:ffff")
        expect(a).toBe(b)
        expect(a).toBe("2001:db8:aaaa:bbbb::/64")
    })

    it("keeps different /64s apart", () => {
        expect(ipBucket("2001:db8:aaaa:bbbb::1")).not.toBe(ipBucket("2001:db8:aaaa:bbbc::1"))
    })

    it("normalises every spelling of the same address", () => {
        const spellings = [
            "2001:db8:0:0:1::1",
            "2001:0db8:0000:0000:0001:0000:0000:0001",
            "2001:DB8::1:0:0:1",
            "2001:db8::1:0:0:1%eth0",
        ]
        expect(new Set(spellings.map(ipBucket))).toEqual(new Set(["2001:db8:0:0::/64"]))
    })

    it("collapses IPv4-mapped IPv6 to the IPv4 address", () => {
        expect(ipBucket("::ffff:203.0.113.9")).toBe("203.0.113.9")
        expect(ipBucket("::ffff:cb00:7109")).toBe("203.0.113.9")
    })

    it("handles the compressed edge cases", () => {
        expect(ipBucket("::1")).toBe("0:0:0:0::/64")
        expect(ipBucket("::")).toBe("0:0:0:0::/64")
        expect(ipBucket("fe80::")).toBe("fe80:0:0:0::/64")
        expect(ipBucket("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64")
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
