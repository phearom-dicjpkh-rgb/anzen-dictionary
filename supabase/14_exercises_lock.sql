-- ============================================================================
--  Anzen Dictionary — admin lock for the exercises (លំហាត់)
--  Run this after 03. Safe to re-run.
--
--  One flag on the single app_settings row. When true, only an admin may open
--  the exercises; students, teachers and branches see them locked. The
--  exercise questions themselves are shipped in the app (RAW_QUIZ), not here.
-- ============================================================================
alter table public.app_settings
  add column if not exists exercises_locked boolean not null default false;
