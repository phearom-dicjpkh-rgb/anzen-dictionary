-- ============================================================================
--  Anzen Dictionary — admin-added words, and per-book visibility
--  Run this after 12. Safe to re-run.
--
--  Two things live here:
--   1. custom_words — words and grammar an admin types into the new បញ្ចូលពាក្យ
--      screen. They are kept OUT of RAW_WORDS (which the Google-Docs sync
--      rewrites) so a sync can never wipe them.
--   2. book_settings — whether each book is locked (hidden from schools) or
--      shown, and to which branches. A book with no row is visible to all
--      (that is how the existing synced books behave).
-- ============================================================================

create table if not exists public.custom_words (
  id          uuid primary key default gen_random_uuid(),
  book        text not null,
  page        int,
  cat         text not null default 'vocab' check (cat in ('vocab','grammar')),
  jp          text not null,
  kana        text default '',
  pos         text default '',
  km          text default '',
  starred     boolean not null default false,
  examples    jsonb   not null default '[]'::jsonb,   -- [{jp,km}, ...]
  created_at  timestamptz not null default now()
);

create table if not exists public.book_settings (
  book         text primary key,
  locked       boolean not null default false,   -- hidden from every school
  all_schools  boolean not null default true,    -- when not locked: show to everyone
  schools      jsonb   not null default '[]'::jsonb   -- else only these branch ids (strings)
);

alter table public.custom_words  enable row level security;
alter table public.book_settings enable row level security;

-- Is a given book visible to the caller? Admin sees all; a branch/teacher/
-- student sees it unless it is locked or limited to other branches. No row
-- means "visible to everyone", matching the synced books.
create or replace function public.book_visible(bk text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    else coalesce((
      select (not bs.locked) and (
        bs.all_schools
        or bs.schools ? (
          select case when p.role = 'school' then p.id::text else p.school_id::text end
          from public.profiles p where p.id = auth.uid()
        )
      )
      from public.book_settings bs where bs.book = bk
    ), true)
  end;
$$;

-- custom_words: readable only when its book is visible to you; admin writes.
drop policy if exists custom_words_select on public.custom_words;
create policy custom_words_select on public.custom_words
  for select using ( public.book_visible(book) );
drop policy if exists custom_words_write on public.custom_words;
create policy custom_words_write on public.custom_words
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- book_settings: everyone signed in may read (the app needs it to hide books);
-- only an admin may change it.
drop policy if exists book_settings_select on public.book_settings;
create policy book_settings_select on public.book_settings
  for select using ( auth.uid() is not null );
drop policy if exists book_settings_write on public.book_settings;
create policy book_settings_write on public.book_settings
  for all using ( public.is_admin() ) with check ( public.is_admin() );
