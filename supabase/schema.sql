-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

create table if not exists posts (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  slug         text        not null unique,
  excerpt      text        not null default '',
  content      text        not null default '',
  tags         text[]      not null default '{}',
  cover_emoji  text        not null default '📝',
  theme        text        not null default 'purple' check (theme in ('purple', 'green', 'pink')),
  reading_time int         not null default 1,
  published    boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-update updated_at on row change
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger posts_updated_at
  before update on posts
  for each row execute procedure update_updated_at();

-- Row Level Security: anyone can read published posts
alter table posts enable row level security;

create policy "Public read published posts"
  on posts for select
  using (published = true);

-- Example insert — paste this to add your first post
/*
insert into posts (title, slug, excerpt, content, tags, cover_emoji, theme, reading_time, published)
values (
  'My First Post',
  'my-first-post',
  'A short preview shown on the card.',
  '# My First Post

Welcome to my blog! This is written in **Markdown**.

## What I cover here

- Web development
- Interesting projects
- Things I learn along the way

> "The best way to learn is to build."

```js
console.log("Hello, world!")
```
',
  ARRAY['Web Dev', 'Intro'],
  '🚀',
  'purple',
  2,
  true
);
*/
