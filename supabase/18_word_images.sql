-- ============================================================================
--  Anzen Dictionary — an image link on admin-added words and corrections
--  Run this after 17. Safe to re-run.
--
--  The "បញ្ចូលពាក្យថ្មី" (custom_words) and "កែពាក្យ" (word_overrides) screens
--  gain an image link, mirroring the `image` column the words Google Sheet has.
-- ============================================================================
alter table public.custom_words   add column if not exists img text default '';
alter table public.word_overrides add column if not exists img text;
