import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
    console.warn(
        "supabase-admin: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. " +
        "Server-side writes will fail."
    )
}

// Service-role client — bypasses RLS. Never expose this to the browser.
export const supabaseAdmin = createClient(url ?? "", serviceKey ?? "", {
    auth: { persistSession: false },
})
