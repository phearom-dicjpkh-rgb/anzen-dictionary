-- ============================================================================
--  Anzen Dictionary — starred (important) words
--  Run this after 04_word_overrides.sql. Safe to re-run.
--
--  An admin marks the words that matter with a red star, and the tests draw
--  from those. The flag rides along with the corrections table because it is
--  the same kind of thing: an admin decision about a word that has to outlive
--  the hourly rebuild from the Google Docs.
-- ============================================================================
alter table public.word_overrides
  add column if not exists starred boolean not null default false;

create index if not exists word_overrides_starred_idx
  on public.word_overrides(starred) where starred;
