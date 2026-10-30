-- READ-ONLY exposure audit for the whole Supabase project. Changes nothing.
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run, then
-- read each result tab. See SECURITY.md (S-23) for what to do with findings.
--
-- Why: the public anon key ships in every visitor's browser, and sign-ups are
-- open, so anyone can act as `anon` or `authenticated`. Anything those two
-- roles can read, write, or execute is effectively public. This project may
-- be shared with other apps, so review findings before changing anything.

-- ─── 1. Public tables without row level security ────────────────────────────
-- Expect: no rows. Any row here is readable/writable through the REST API by
-- whatever the anon/authenticated grants in section 3 allow.
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public' AND NOT rowsecurity
ORDER BY tablename;

-- ─── 2. Policies that let anon/authenticated in ─────────────────────────────
-- Expect for this site: "Public read published posts" and "Public read
-- published projects" (SELECT, published = true). Review anything that
-- writes, or reads without a filter (qual = 'true').
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- ─── 3. Table privileges held by anon/authenticated in public ───────────────
-- Expect: SELECT on posts and projects only. INSERT/UPDATE/DELETE here plus a
-- permissive policy (section 2) or no RLS (section 1) = public write access.
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- ─── 4. Functions anyone can call through /rest/v1/rpc ──────────────────────
-- Expect: no auth_failure_* rows. SECURITY DEFINER functions here run with
-- their owner's rights — review each one closely.
SELECT p.proname AS function,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'invoker' END AS runs_as,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
ORDER BY p.proname;

-- ─── 5. Views that bypass RLS ───────────────────────────────────────────────
-- Views run as their owner unless security_invoker is set, so a view over a
-- locked table can re-expose it. Expect: no rows (or only views you meant
-- to be public).
SELECT c.relname AS view
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(c.reloptions, '{}')) AS opt
      WHERE lower(opt) IN ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')
  )
  AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'))
ORDER BY c.relname;

-- ─── 6. Storage buckets ──────────────────────────────────────────────────────
-- public = true means anyone with a file's URL can download it. A NULL size
-- limit or MIME list means an uploader with write access (section 7) can
-- store anything of any size — free hosting for malware or phishing pages.
SELECT id, public, file_size_limit, allowed_mime_types, created_at
FROM storage.buckets
ORDER BY id;

-- ─── 7. Who can write to storage ─────────────────────────────────────────────
-- Expect: no INSERT/UPDATE/DELETE policies for anon. An INSERT policy for
-- `authenticated` lets ANY signed-up account upload (sign-ups are open).
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
ORDER BY policyname;

-- ─── 8. Accounts in Supabase Auth ────────────────────────────────────────────
-- This site never signs users in, so accounts here belong to another app or
-- to strangers using open sign-up. A recent burst of unknown sign-ups means
-- someone is using it — see SECURITY.md S-23.
SELECT coalesce(raw_app_meta_data ->> 'provider', 'unknown') AS provider,
       count(*)                                              AS accounts,
       count(*) FILTER (WHERE created_at > now() - interval '30 days') AS created_last_30_days,
       max(created_at)                                       AS newest
FROM auth.users
GROUP BY 1
ORDER BY accounts DESC;

-- ─── Fixes (commented out on purpose — review the results above first) ──────
-- Limit a bucket this site uses to images up to 5 MB:
--   UPDATE storage.buckets
--   SET file_size_limit = 5 * 1024 * 1024,
--       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
--   WHERE id = 'blog-assets';
--
-- Stop anon/authenticated calling a function:
--   REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM PUBLIC, anon, authenticated;
--
-- Make a view respect the caller's RLS:
--   ALTER VIEW public.<name> SET (security_invoker = true);
--
-- Open sign-ups are a dashboard setting, not SQL: Authentication → Sign In /
-- Providers → turn off "Allow new users to sign up" — only if no other app on
-- this project needs public sign-up.
