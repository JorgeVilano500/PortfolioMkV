-- Sponsorships on /laptop: the sticker bucket, the offers people send, and
-- what each of the six spots shows. Safe to re-run: it never overwrites
-- spots you've edited in Studio.
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Step-by-step guide: SPONSORSHIPS.md.
--
-- Everything here is private. Only the site's server routes touch it, with
-- the service-role key:
--   POST  /api/sponsorships          the public form: one sponsor_offers row + the file
--   *     /api/sponsorships(/spots)  Studio (admin sign-in)
--   GET   /laptop, /api/laptop/spots what visitors see (visible spots only)
-- The anon key and signed-up accounts can't read, list or write any of it.

-- ─── 1. Storage bucket for sticker images ───────────────────────────────────
-- Private. PNG and JPEG only, up to 4 MB (the form's own limit). Paths:
--   offers/<offer id>/sticker.<png|jpg>   what a sponsor uploaded
--   spots/<spot id>/<id>.<png|jpg>        the image a spot shows (a copy, so
--                                         deleting the offer doesn't break it)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sponsor-stickers', 'sponsor-stickers', false, 4194304, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
    public             = false,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2. Offers sent through "Sponsor a spot" ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsor_offers (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text        NOT NULL CHECK (char_length(email) <= 254),
    affiliation text        NOT NULL CHECK (char_length(affiliation) <= 120),
    offer_usd   numeric(10, 2) NOT NULL CHECK (offer_usd >= 1 AND offer_usd <= 1000000),
    spot        text        NOT NULL,              -- a spot id, or 'any'
    file_path   text,                              -- in the bucket; null if the upload failed
    file_type   text        CHECK (file_type IN ('image/png', 'image/jpeg')),
    file_bytes  integer,
    file_name   text        CHECK (char_length(file_name) <= 120),
    status      text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'declined')),
    notes       text        NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sponsor_offers_created_at ON public.sponsor_offers (created_at DESC);

-- ─── 3. What each spot on /laptop shows ─────────────────────────────────────
-- No sponsor_name = an open spot. visible = false keeps the sponsor here but
-- shows the spot as open on /laptop.
CREATE TABLE IF NOT EXISTS public.sponsor_spots (
    id           text        PRIMARY KEY CHECK (id IN ('slot-1', 'slot-2', 'slot-3', 'slot-4', 'palm-left', 'palm-right')),
    sponsor_name text        CHECK (char_length(sponsor_name) <= 60),
    mark         text        CHECK (char_length(mark) <= 6),
    tagline      text        CHECK (char_length(tagline) <= 80),
    description  text        CHECK (char_length(description) <= 400),
    theme        text        NOT NULL DEFAULT 'purple' CHECK (theme IN ('purple', 'green', 'pink')),
    image_path   text,
    visible      boolean     NOT NULL DEFAULT true,
    sample       boolean     NOT NULL DEFAULT false,  -- labelled "Sample sponsor" on /laptop
    offer_id     uuid        REFERENCES public.sponsor_offers (id) ON DELETE SET NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The sample sponsors /laptop has shown so far, so they appear in Studio
-- and can be hidden or replaced. DO NOTHING keeps any spot you've edited.
INSERT INTO public.sponsor_spots (id, sponsor_name, mark, tagline, description, theme, sample) VALUES
    ('slot-1', 'Acme Dev Tools', 'ACME', 'Tools for shipping on time',
     'A sample sponsor showing how a developer-tools brand would look on the lid. Stickers render from data, so swapping a sponsor is a one-line change.', 'purple', true),
    ('slot-2', 'Example Cloud', 'EX', 'Deploys that just work',
     'A sample hosting sponsor. Each spot can carry a name, a short tagline, and a few lines about the sponsor.', 'green', true),
    ('slot-3', 'Sample Studio', 'SS', 'Design systems, on tap',
     'A sample design-studio sponsor, using the site''s pink accent so you can compare the three sticker styles.', 'pink', true),
    ('slot-4', NULL, NULL, NULL, NULL, 'purple', false),
    ('palm-left', 'Demo Robotics', 'DR', 'Robots that read the manual',
     'A sample palm-rest sponsor. The spots beside the trackpad are smaller and landscape, like the badges that ship on new laptops, and they''re in view every time the laptop is open.', 'purple', true),
    ('palm-right', NULL, NULL, NULL, NULL, 'purple', false)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Lock both tables to the server ──────────────────────────────────────
-- RLS on with no policies, and no grants for the public roles: only the
-- service role (the site's API routes) can read or write.
ALTER TABLE public.sponsor_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_spots  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sponsor_offers FROM anon, authenticated;
REVOKE ALL ON public.sponsor_spots  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_offers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_spots  TO service_role;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect one row: public = false, file_size_limit = 4194304, {image/png,image/jpeg}.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'sponsor-stickers';

-- Expect rowsecurity = true for both tables.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('sponsor_offers', 'sponsor_spots');

-- Expect six rows (four sample sponsors, two open spots).
SELECT id, sponsor_name, visible, sample FROM public.sponsor_spots ORDER BY id;

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
