/**
 * Classify Supabase/PostgREST errors caused by a database that is behind the
 * code — e.g. the app was deployed before supabase/consent-schema.sql ran.
 * Routes use these to degrade gracefully instead of breaking analytics.
 */

type DbError = { code?: string | null; message?: string | null } | null | undefined

/** Column doesn't exist (select: Postgres 42703; insert/update: PostgREST PGRST204). */
export function isMissingColumn(error: DbError): boolean {
    return error?.code === "42703" || error?.code === "PGRST204"
}

/** Table doesn't exist (Postgres 42P01; PostgREST schema cache PGRST205). */
export function isMissingTable(error: DbError): boolean {
    return error?.code === "42P01" || error?.code === "PGRST205"
}

const warned = new Set<string>()

/** Log a schema-drift warning once per process (avoids flooding logs on every request). */
export function warnSchemaOnce(context: string, hint: string): void {
    if (warned.has(context)) return
    warned.add(context)
    console.warn(`[${context}] database schema is behind the code — ${hint}`)
}
