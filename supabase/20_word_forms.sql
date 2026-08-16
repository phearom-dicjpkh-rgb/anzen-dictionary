-- 20_word_forms.sql
-- Extra fields for the បញ្ចូលពាក្យថ្មី form:
--   • related — auto-generated conjugations attached to a vocab word
--               [{ "jp": "食べない", "km": "មិនញ៉ាំ" }, ...]
--   • level   — JLPT level for a grammar point (N1..N5)
--   • link    — a related grammar point or URL
-- Safe to run more than once (add column if not exists). Run it once in the
-- Supabase SQL editor; the app already falls back to saving the core word until
-- these columns exist.

alter table public.custom_words add column if not exists related jsonb not null default '[]'::jsonb;
alter table public.custom_words add column if not exists level   text  not null default '';
alter table public.custom_words add column if not exists link    text  not null default '';
