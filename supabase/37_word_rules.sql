-- 37_word_rules.sql
-- "ក្បួនផ្សំ" (combination rules) of a grammar point, kept on the custom word:
--   [{ "pre": "名詞", "post": "になります", "km": "ប្រែក្លាយទៅជានាម",
--      "ex": { "jp": "春になります。", "km": "ដល់រដូវផ្ការីក។" } }, ...]
-- Safe to run more than once. Run it once in the Supabase SQL editor; until then
-- the app saves the word without its rules (and tells you when editing them).

alter table public.custom_words add column if not exists rules jsonb not null default '[]'::jsonb;
