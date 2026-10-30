import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
    console.warn("Supabase env vars not set. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local")
}

// Public, read-only client (RLS limits it to published rows). The site never
// signs visitors in through Supabase, so all auth features are off: nothing is
// written to storage, and a crafted link carrying `#access_token=…` can't plant
// a session (detectSessionInUrl would otherwise accept it).
export const supabase = createClient(url ?? "", key ?? "", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
