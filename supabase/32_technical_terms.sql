-- ============================================================================
--  Anzen Dictionary — technical-terms glossary (ពាក្យបច្ចេកទេស)
--  Maps a Khmer technical term (as it appears in translated exam text) back
--  to the real Japanese term it stands for, plus an optional picture — so
--  tapping the Khmer phrase during a test shows what it's actually called
--  in Japanese. Kept as its own table (not custom_words) because
--  custom_words.cat is constrained to vocab/grammar. Run after 13. Safe to
--  re-run.
-- ============================================================================

create table if not exists public.technical_terms (
  id          uuid primary key default gen_random_uuid(),
  km          text not null,       -- the Khmer phrase as it appears in translated text
  jp          text not null,       -- the real Japanese term
  img         text default '',     -- optional picture URL
  created_at  timestamptz not null default now()
);

alter table public.technical_terms enable row level security;

-- readable by any signed-in user (needed for the tap-to-reveal popup during a
-- test); only an admin may add/edit/remove entries
drop policy if exists technical_terms_select on public.technical_terms;
create policy technical_terms_select on public.technical_terms
  for select using ( auth.uid() is not null );
drop policy if exists technical_terms_write on public.technical_terms;
create policy technical_terms_write on public.technical_terms
  for all using ( public.is_admin() ) with check ( public.is_admin() );
