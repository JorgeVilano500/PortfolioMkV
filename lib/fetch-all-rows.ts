/**
 * Read every row a Supabase query matches, not just the first page.
 *
 * Supabase's REST API returns at most `max-rows` rows per request (1,000 on a
 * default project), whatever `.limit()` asks for, so a single `.limit(50000)`
 * query silently stops at 1,000. That froze the Logistics totals and the
 * Studio view counts once page_views grew past 1,000 rows.
 *
 * This pages with `.range()`. The first page asks for the exact row count, so
 * paging stops at the real total even if the server's page cap is smaller
 * than PAGE_SIZE. Queries must have a deterministic order (end with a unique
 * column such as `id`), or offset pages can overlap.
 */

export const PAGE_SIZE = 1000

type PageError = { message: string; code?: string }
type Page<T> = { data: T[] | null; error: PageError | null; count?: number | null }

export type AllRows<T> = {
    rows:      T[]
    error:     PageError | null
    /** The total from the server's count (falls back to the rows read). */
    total:     number
    /** True when `maxRows` cut the read short. */
    truncated: boolean
}

export async function fetchAllRows<T>(
    fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
    maxRows: number,
): Promise<AllRows<T>> {
    const rows: T[] = []
    let total: number | null = null

    while (rows.length < maxRows && (total === null || rows.length < total)) {
        const from = rows.length
        const to   = Math.min(from + PAGE_SIZE, maxRows) - 1
        const { data, error, count } = await fetchPage(from, to)
        if (error) return { rows, error, total: total ?? rows.length, truncated: false }
        if (total === null && typeof count === "number") total = count

        const page = data ?? []
        if (page.length === 0) break
        rows.push(...page)
        // Without a count to go on, a short page is the last one.
        if (total === null && page.length < to - from + 1) break
    }

    const known = total ?? rows.length
    return { rows, error: null, total: known, truncated: known > rows.length }
}
