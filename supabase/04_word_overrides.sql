-- ============================================================================
--  Anzen Dictionary — Word corrections (admin "កែពាក្យ" screen)
--  Run this in the Supabase SQL Editor. Safe to re-run.
--
--  The dictionary itself is rebuilt from the Google Docs every hour, so a
--  correction cannot live in that data — the next sync would wipe it. Each
--  correction is stored here instead, keyed by the word id, and the app lays
--  these over the synced words when it loads. A correction therefore wins
--  over the doc until an admin removes it.
-- ============================================================================
create table if not exists public.word_overrides (
  word_id    text primary key,           -- RAW_WORDS id, e.g. "w8" / "p41_01"
  jp         text,
  kana       text,
  pos        text,
  km         text,
  examples   jsonb,                      -- [{ "jp": "...", "km": "..." }, ...]
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.word_overrides enable row level security;

drop policy if exists word_overrides_select on public.word_overrides;
drop policy if exists word_overrides_write  on public.word_overrides;
drop policy if exists word_overrides_update on public.word_overrides;
drop policy if exists word_overrides_delete on public.word_overrides;

-- Everyone reads them: a correction must show for students and teachers too.
create policy word_overrides_select on public.word_overrides
for select using ( true );

-- Only an admin may correct words.
create policy word_overrides_write on public.word_overrides
for insert with check ( public.is_admin() );

create policy word_overrides_update on public.word_overrides
for update using ( public.is_admin() ) with check ( public.is_admin() );

create policy word_overrides_delete on public.word_overrides
for delete using ( public.is_admin() );
