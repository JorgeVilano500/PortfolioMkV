-- Private storage for "Sponsor a spot" offers on /laptop. Safe to re-run.
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- Each offer stores two objects under a random id:
--   <id>/sticker.<png|jpg|webp|pdf>   the sticker file to print
--   <id>/inquiry.json                 email, affiliation, offer, spot, file info, time
-- Only POST /api/sponsorships writes here, with the service-role key. The
-- bucket is PRIVATE and gets no storage policies, so the public anon key and
-- signed-up accounts can neither list, read, nor write it. Download files
-- from the dashboard (Storage → sponsor-stickers), or from the copy attached
-- to the notification email.
--
-- The app works before this runs: the notification email carries the file,
-- and the server logs a one-time "run supabase/sponsor-stickers-schema.sql" warning.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'sponsor-stickers',
    'sponsor-stickers',
    false,                                   -- never public
    4194304,                                 -- 4 MB, same cap as the form
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
    public             = false,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect one row: public = false, file_size_limit = 4194304.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'sponsor-stickers';

-- Expect NO rows. A storage.objects policy that doesn't name a bucket applies
-- to every bucket — this one included — so anything listed here could expose
-- sponsors' files to anon or signed-up users. Scope such policies with
-- `bucket_id = '<their bucket>'` before relying on this bucket being private.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND coalesce(qual, '') NOT LIKE '%bucket_id%'
  AND coalesce(with_check, '') NOT LIKE '%bucket_id%';
