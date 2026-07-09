-- Project documents: project_documents table
-- Stores the latest markdown docs (e.g. PROJECT_OVERVIEW.md) per project,
-- pushed by automated tasks via /api/docs/upload. Latest-only: one row per
-- (project_slug, filename), upserted on every sync.
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS project_documents (
    id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    project_slug text        NOT NULL,              -- e.g. 'portfoliomkv'
    filename     text        NOT NULL,              -- e.g. 'PROJECT_OVERVIEW.md'
    title        text        NOT NULL DEFAULT '',   -- optional display title
    content      text        NOT NULL,              -- raw markdown
    content_hash text        NOT NULL DEFAULT '',   -- sha256 of content, for change detection
    source       text        NOT NULL DEFAULT '',   -- what pushed it, e.g. 'daily-status-task'
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_slug, filename)
);

CREATE INDEX IF NOT EXISTS idx_pd_project ON project_documents (project_slug);

-- This table is never read or written by the browser anon key.
-- All access goes through the service-role API route (/api/docs/upload).
-- Enable RLS with NO policies: the anon key gets zero access (RLS denies by
-- default), while the service-role key bypasses RLS entirely. When the future
-- aggregator project needs public/anon reads, add an explicit SELECT policy
-- then — don't disable RLS.
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
