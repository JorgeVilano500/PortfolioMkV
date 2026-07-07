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

    it("unblocks after the 15-minute window", () => {
        jest.useFakeTimers()
        for (let i = 0; i < 10; i++) recordAuthFailure("route", "1.2.3.4")
        expect(isAuthBlocked("route", "1.2.3.4")).toBe(true)

        jest.advanceTimersByTime(15 * 60_000 + 1_000)
        expect(isAuthBlocked("route", "1.2.3.4")).toBe(false)
    })
})
