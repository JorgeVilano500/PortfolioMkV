-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Self-contained — does not depend on schema.sql having been run first.

create table if not exists projects (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  description  text        not null default '',
  icon         text        not null default '🚀',
  category     text        not null default '',
  status       text        not null default 'planned' check (status in ('live', 'wip', 'planned')),
  theme        text        not null default 'purple' check (theme in ('purple', 'green', 'pink')),
  tags         text[]      not null default '{}',
  year         text        not null default '',
  link         text        not null default '',
  github       text        not null default '',
  featured     boolean     not null default false,
  published    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-update updated_at on row change. create or replace makes this safe to
-- run even if schema.sql already defined it for the posts table.
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter function update_updated_at() set search_path = '';

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at
  before update on projects
  for each row execute procedure update_updated_at();

-- Row Level Security: anyone can read published projects (mirrors posts).
-- Writes only ever go through the service-role key from /api/projects, which
-- bypasses RLS entirely, so this policy only governs public/anon reads.
alter table projects enable row level security;
revoke insert, update, delete, truncate, references, trigger on projects from anon, authenticated;

drop policy if exists "Public read published projects" on projects;
create policy "Public read published projects"
  on projects for select
  using (published = true);

-- Example insert — paste this to add your first project
/*
insert into projects (title, description, icon, category, status, theme, tags, year, link, github, featured, published)
values (
  'Interactive Dice Roller',
  '3D animated dice with customizable sides, roll history, and sound effects. Built with vanilla JS and CSS transforms.',
  '🎲',
  'Featured project',
  'live',
  'purple',
  ARRAY['JavaScript', 'CSS Animations', 'LocalStorage'],
  '2023',
  'https://dice-shaker.netlify.app/',
  '',
  true,
  true
);
*/
