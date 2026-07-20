-- ============================================================================
--  Anzen Dictionary — daily usage, for the profile chart
--  Run this after 09/10. Safe to re-run.
--
--  One number per day per person: seconds spent in the app. Kept as JSON on
--  the profile ({"2026-07-19": 540, ...}) rather than a row per visit, since
--  the chart only ever reads the last fortnight and the profile is already
--  loaded at sign-in. Old days are trimmed by the app as it writes.
-- ============================================================================
alter table public.profiles
  add column if not exists usage jsonb not null default '{}'::jsonb;
