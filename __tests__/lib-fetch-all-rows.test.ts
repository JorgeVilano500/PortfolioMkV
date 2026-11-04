/**
 * lib/fetch-all-rows — paging past Supabase's per-request row cap. A single
 * `.limit(50000)` query returns at most `max-rows` (1,000 by default), which
 * froze the Logistics totals and Studio view counts at 1,000.
 */
import { PAGE_SIZE, fetchAllRows } from "@/lib/fetch-all-rows"

/** A fake table of `total` rows behind a server that returns at most `serverCap` per request. */
function table(total: number, { serverCap = 1000, withCount = true } = {}) {
    const calls: [number, number][] = []
    const fetchPage = async (from: number, to: number) => {
        calls.push([from, to])
        const end = Math.min(to + 1, total, from + serverCap)
        const data = Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ n: from + i }))
        return { data, error: null, count: withCount ? total : null }
    }
    return { fetchPage, calls }
}

describe("fetchAllRows", () => {
    it("reads past 1,000 rows, in pages, with the exact total", async () => {
        const { fetchPage, calls } = table(2500)
        const result = await fetchAllRows(fetchPage, 50_000)
        expect(result.rows).toHaveLength(2500)
        expect(result.rows.at(-1)).toEqual({ n: 2499 })
        expect(result.total).toBe(2500)
        expect(result.truncated).toBe(false)
        expect(calls).toEqual([[0, PAGE_SIZE - 1], [1000, 1999], [2000, 2999]])
    })

    it("still gets every row when the server's cap is smaller than a page", async () => {
        const { fetchPage } = table(1200, { serverCap: 500 })
        const result = await fetchAllRows(fetchPage, 50_000)
        expect(result.rows).toHaveLength(1200)
        expect(new Set(result.rows.map((r) => r.n)).size).toBe(1200) // no duplicates, no gaps
    })

    it("makes one request for a small table", async () => {
        const { fetchPage, calls } = table(42)
        expect((await fetchAllRows(fetchPage, 50_000)).rows).toHaveLength(42)
        expect(calls).toHaveLength(1)
    })

    it("stops at maxRows and says the result was cut short", async () => {
        const { fetchPage, calls } = table(5000)
        const result = await fetchAllRows(fetchPage, 1500)
        expect(result.rows).toHaveLength(1500)
        expect(result.total).toBe(5000)
        expect(result.truncated).toBe(true)
        expect(calls.at(-1)).toEqual([1000, 1499]) // never asks past the cap
    })

    it("without a count, treats a short page as the last one", async () => {
        const { fetchPage, calls } = table(1300, { withCount: false })
        const result = await fetchAllRows(fetchPage, 50_000)
        expect(result.rows).toHaveLength(1300)
        expect(result.total).toBe(1300)
        expect(calls).toHaveLength(2)
    })

    it("returns the error and the rows read so far", async () => {
        let call = 0
        const result = await fetchAllRows(async () => {
            call++
            return call === 1
                ? { data: Array.from({ length: 1000 }, (_, n) => ({ n })), error: null, count: 3000 }
                : { data: null, error: { message: "timeout" } }
        }, 50_000)
        expect(result.error?.message).toBe("timeout")
        expect(result.rows).toHaveLength(1000)
    })

    it("handles an empty table", async () => {
        const result = await fetchAllRows(table(0).fetchPage, 50_000)
        expect(result).toEqual({ rows: [], error: null, total: 0, truncated: false })
    })
})
