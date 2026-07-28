-- ============================================================================
--  Anzen Dictionary — per-branch lock for the exercises (លំហាត់)
--  Run this after 14. Safe to re-run.
--
--  Beside the "lock for everyone" flag, an admin can lock the exercises for
--  chosen branches only. This holds their ids; a branch/teacher/student whose
--  branch is listed cannot open the exercises.
-- ============================================================================
alter table public.app_settings
  add column if not exists exercises_locked_schools jsonb not null default '[]'::jsonb;
