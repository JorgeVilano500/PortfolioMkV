-- Security hardening for an EXISTING database. Safe to re-run (idempotent).
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- See SECURITY.md (S-1, S-13) for why each statement exists.
--
-- The app only ever touches these tables in two ways:
--   • the browser's anon key  → SELECT published rows of posts / projects
--   • API routes' service-role key (bypasses RLS and these grants entirely)
-- so everything below removes access nobody legitimately uses.

-- ─── S-1: page_views was readable/writable by anyone holding the public anon key
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.page_views FROM anon, authenticated;

-- ─── Defense in depth: anon/authenticated never write content tables.
-- RLS already blocks writes (there are no write policies); dropping the
-- grants means a future mistaken policy still can't open writes.
ALTER TABLE public.posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.posts    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.projects FROM anon, authenticated;

-- project_documents: service role only.
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_documents FROM anon, authenticated;

-- ─── Supabase security advisor "function_search_path_mutable": pin the
-- trigger function's search_path so it can't be hijacked by objects created
-- in another schema. now() lives in pg_catalog, which is always searched.
ALTER FUNCTION public.update_updated_at() SET search_path = '';

-- ─── Verify (expected results in comments) ───────────────────────────────────
-- RLS on every app table → all rows show rowsecurity = true
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('posts', 'projects', 'page_views', 'project_documents');

-- Remaining anon/authenticated privileges → only SELECT on posts and projects
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN ('posts', 'projects', 'page_views', 'project_documents')
ORDER BY table_name, grantee, privilege_type;

-- ─── Optional: analytics retention (SECURITY.md S-5) ─────────────────────────
-- Decide a window first (PRD open question #4), then uncomment. Requires the
-- pg_cron extension (Dashboard → Database → Extensions → pg_cron).
--
-- SELECT cron.schedule(
--   'prune-page-views',
--   '17 3 * * *',  -- daily at 03:17 UTC
--   $$DELETE FROM public.page_views WHERE created_at < now() - interval '365 days'$$
-- );
