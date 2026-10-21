-- Analytics: page_views table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS page_views (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    page        text        NOT NULL,
    referrer    text        NOT NULL DEFAULT '',
    user_agent  text        NOT NULL DEFAULT '',
    session_id  text        NOT NULL,
    is_new_visitor boolean  NOT NULL DEFAULT false,
    load_time   integer,           -- milliseconds, nullable (not available on client nav)
    screen_width integer,          -- px, for device categorisation
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the queries used by the dashboard
CREATE INDEX IF NOT EXISTS idx_pv_created_at  ON page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_session_id  ON page_views (session_id);
CREATE INDEX IF NOT EXISTS idx_pv_page        ON page_views (page);

-- This table is never read or written by the browser anon key.
-- All access goes through the service-role API routes (which bypass RLS).
-- RLS MUST stay enabled with no policies: Supabase grants the public anon key
-- access to tables in `public` by default, so with RLS disabled anyone could
-- read every row and insert/edit/delete analytics directly via the REST API
-- (confirmed against production on 2026-10-19 — see SECURITY.md S-1).
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON page_views FROM anon, authenticated;
