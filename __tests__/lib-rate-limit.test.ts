/**
 * lib/rate-limit — fixed-window limiter + auth brute-force damping.
 */
import {
    rateLimit,
    isAuthBlocked,
    recordAuthFailure,
    resetRateLimits,
} from "@/lib/rate-limit"

beforeEach(() => {
    resetRateLimits()
    jest.useRealTimers()
})

describe("rateLimit", () => {
    it("allows requests up to the limit", () => {
        for (let i = 0; i < 5; i++) {
            expect(rateLimit("t", "ip1", 5, 60_000).ok).toBe(true)
        }
    })

    it("blocks the request after the limit", () => {
        for (let i = 0; i < 5; i++) rateLimit("t", "ip1", 5, 60_000)
        const res = rateLimit("t", "ip1", 5, 60_000)
        expect(res.ok).toBe(false)
        expect(res.retryAfterSeconds).toBeGreaterThan(0)
    })

    it("tracks keys independently — one abuser can't exhaust another IP's budget", () => {
        for (let i = 0; i < 6; i++) rateLimit("t", "attacker", 5, 60_000)
        expect(rateLimit("t", "attacker", 5, 60_000).ok).toBe(false)
        expect(rateLimit("t", "innocent", 5, 60_000).ok).toBe(true)
    })

    it("tracks limiter names independently", () => {
        for (let i = 0; i < 6; i++) rateLimit("a", "ip1", 5, 60_000)
        expect(rateLimit("a", "ip1", 5, 60_000).ok).toBe(false)
        expect(rateLimit("b", "ip1", 5, 60_000).ok).toBe(true)
    })

    it("resets after the window expires", () => {
        jest.useFakeTimers()
        for (let i = 0; i < 6; i++) rateLimit("t", "ip1", 5, 60_000)
        expect(rateLimit("t", "ip1", 5, 60_000).ok).toBe(false)

        jest.advanceTimersByTime(61_000)
        expect(rateLimit("t", "ip1", 5, 60_000).ok).toBe(true)
    })
})

describe("IPv6 rotation", () => {
    it("rate-limits a whole /64 as one client (track-endpoint flood)", () => {
        for (let i = 0; i < 5; i++) rateLimit("t", `2001:db8:9:9::${i + 1}`, 5, 60_000)
        expect(rateLimit("t", "2001:db8:9:9:abcd::42", 5, 60_000).ok).toBe(false)
    })
})

describe("auth brute-force damping", () => {
    it("does not block before 10 failures", () => {
        for (let i = 0; i < 9; i++) recordAuthFailure("route", "1.2.3.4")
        expect(isAuthBlocked("route", "1.2.3.4")).toBe(false)
    })

    it("blocks after 10 failures", () => {
        for (let i = 0; i < 10; i++) recordAuthFailure("route", "1.2.3.4")
        expect(isAuthBlocked("route", "1.2.3.4")).toBe(true)
    })

    it("blocks per-IP, not globally", () => {
        for (let i = 0; i < 10; i++) recordAuthFailure("route", "1.2.3.4")
        expect(isAuthBlocked("route", "9.9.9.9")).toBe(false)
    })

    it("blocks per-route", () => {
        for (let i = 0; i < 10; i++) recordAuthFailure("route-a", "1.2.3.4")
        expect(isAuthBlocked("route-b", "1.2.3.4")).toBe(false)
    })

    it("can't be dodged by rotating addresses inside one IPv6 /64", () => {
        for (let i = 0; i < 10; i++) recordAuthFailure("route", `2001:db8:1:2::${(i + 1).toString(16)}`)
        expect(isAuthBlocked("route", "2001:db8:1:2:dead:beef:0:1")).toBe(true)
        expect(isAuthBlocked("route", "2001:db8:1:3::1")).toBe(false)
    })

    it("treats IPv4-mapped IPv6 as the same client as the IPv4 address", () => {
        for (let i = 0; i < 10; i++) recordAuthFailure("route", "::ffff:1.2.3.4")
        expect(isAuthBlocked("route", "1.2.3.4")).toBe(true)
    })

    it("unblocks after the 15-minute window", () => {
        jest.useFakeTimers()
        for (let i = 0; i < 10; i++) recordAuthFailure("route", "1.2.3.4")
        expect(isAuthBlocked("route", "1.2.3.4")).toBe(true)

        jest.advanceTimersByTime(15 * 60_000 + 1_000)
        expect(isAuthBlocked("route", "1.2.3.4")).toBe(false)
    })
})

describe("global auth ceiling (many IPs)", () => {
    it("blocks a route for everyone after 100 failures spread across IPs", () => {
        for (let i = 0; i < 100; i++) recordAuthFailure("route", `10.0.${Math.floor(i / 250)}.${i % 250}`)
        expect(isAuthBlocked("route", "203.0.113.50")).toBe(true)
        expect(isAuthBlocked("other-route", "203.0.113.50")).toBe(false)
    })

    it("does not trip below the ceiling", () => {
        for (let i = 0; i < 99; i++) recordAuthFailure("route", `10.1.0.${i}`)
        expect(isAuthBlocked("route", "203.0.113.50")).toBe(false)
    })
})

describe("memory bound", () => {
    it("caps a limiter at 10,000 keys even under a flood of distinct keys", () => {
        for (let i = 0; i < 12_000; i++) rateLimit("flood", `k${i}`, 5, 60_000)
        // The newest key is tracked (its second hit counts) …
        expect(rateLimit("flood", "k11999", 1, 60_000).ok).toBe(false)
        // … while the oldest was evicted, so it starts a fresh window.
        expect(rateLimit("flood", "k0", 1, 60_000).ok).toBe(true)
    })
})
