-- Shared brute-force lockout counters (SECURITY.md S-4). Safe to re-run.
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- Why: each serverless instance used to keep its own in-memory failure
-- counters, so an attacker spread across instances got more guesses than the
-- limits allow. These counters live in Postgres instead, shared by every
-- instance. The app falls back to in-memory counting until this file runs.
--
-- Privacy: keys never contain raw IP addresses — the app stores a keyed hash
-- (HMAC with a server secret, e.g. 'admin-password:ip:<hmac prefix>') plus one
-- global key per scope. Keyed so the value can't be reversed by hashing every IPv4.

CREATE TABLE IF NOT EXISTS public.auth_failures (
    key        text        PRIMARY KEY,
    count      integer     NOT NULL DEFAULT 0,
    window_end timestamptz NOT NULL
);

-- Service role only. Anon/authenticated (anyone, since sign-ups are open) get nothing.
ALTER TABLE public.auth_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_failures FROM anon, authenticated;

-- Count one failure for each key, starting a fresh window when the old one ended.
CREATE OR REPLACE FUNCTION public.auth_failure_hit(p_keys text[], p_window_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.auth_failures AS f (key, count, window_end)
    SELECT DISTINCT k, 1, now() + make_interval(secs => p_window_seconds)
    FROM unnest(p_keys) AS k
    ON CONFLICT (key) DO UPDATE SET
        count      = CASE WHEN f.window_end <= now() THEN 1 ELSE f.count + 1 END,
        window_end = CASE WHEN f.window_end <= now()
                          THEN now() + make_interval(secs => p_window_seconds)
                          ELSE f.window_end END;

    -- Keep the table tiny: drop windows that ended over a day ago.
    DELETE FROM public.auth_failures WHERE window_end < now() - interval '1 day';
END;
$$;

-- Failure counts for keys whose window is still open.
CREATE OR REPLACE FUNCTION public.auth_failure_counts(p_keys text[])
RETURNS TABLE (key text, count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT f.key, f.count
    FROM public.auth_failures f
    WHERE f.key = ANY (p_keys) AND f.window_end > now();
$$;

-- Postgres lets PUBLIC execute new functions by default, which would expose
-- them through the REST API (/rest/v1/rpc/...) to anyone with the anon key.
REVOKE EXECUTE ON FUNCTION public.auth_failure_hit(text[], integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_failure_counts(text[])       FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_failure_hit(text[], integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.auth_failure_counts(text[])       TO service_role;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.auth_failures       TO service_role;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect: rowsecurity = true, and anon/authenticated absent from both lists.
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'auth_failures';

SELECT routine_name, grantee
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('auth_failure_hit', 'auth_failure_counts')
ORDER BY routine_name, grantee;
