-- Visitor consent + richer analytics (2026-10-20). Safe to re-run (idempotent).
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Run AFTER analytics-schema.sql (fresh installs) — on an existing database
-- just run this file (and security-hardening.sql, if you haven't).
--
-- The app keeps working if the code is deployed before this runs (new fields
-- are skipped and a warning is logged), but nothing new is stored until it does.

-- ─── page_views: extra fields, recorded ONLY for visitors who opted in ───────
-- (/api/analytics/track refuses to insert anything without an analytics
-- opt-in in the java_consent cookie.)
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS ip_address      inet;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS language        text;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS timezone        text;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS visitor_id      uuid;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS consent_version smallint;

CREATE INDEX IF NOT EXISTS idx_pv_visitor_id ON public.page_views (visitor_id);

-- ─── consent_events: one row per choice (proof of consent, GDPR Art. 7(1)) ───
-- Deliberately minimal: a random visitor id, the choice, the policy version.
-- No IP address, no user agent — this table must be safe to keep for audits.
CREATE TABLE IF NOT EXISTS public.consent_events (
    id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    visitor_id     uuid        NOT NULL,
    analytics      boolean     NOT NULL,
    policy_version smallint    NOT NULL,
    action         text        NOT NULL DEFAULT 'set' CHECK (action IN ('set', 'erase')),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ce_created_at ON public.consent_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ce_visitor_id ON public.consent_events (visitor_id);

-- Service role only (API routes). Anon/authenticated get nothing.
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consent_events FROM anon, authenticated;

-- Same lockdown for page_views (also in security-hardening.sql — repeated so
-- this file is safe on its own: these columns now hold IP addresses).
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.page_views FROM anon, authenticated;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect 5 rows (the new page_views columns)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'page_views'
  AND column_name IN ('ip_address', 'language', 'timezone', 'visitor_id', 'consent_version');

-- Expect rowsecurity = true for both
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('page_views', 'consent_events');
