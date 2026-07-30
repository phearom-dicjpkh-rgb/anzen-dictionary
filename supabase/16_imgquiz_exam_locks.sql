-- ============================================================================
--  Anzen Dictionary — admin locks for the two new sections
--  (លំហាត់រូបភាព = image exercises, ប្រឡងសាកល្បង = mock exam)
--  Run this after 15. Safe to re-run.
--
--  Same shape as the exercises lock: a "lock for everyone" flag plus a list of
--  branch ids to lock for chosen branches only. The questions themselves ship
--  in the app (RAW_IMGQUIZ / RAW_EXAM), not here. Admin is never locked out.
-- ============================================================================
alter table public.app_settings
  add column if not exists img_exercises_locked boolean not null default false,
  add column if not exists img_exercises_locked_schools jsonb not null default '[]'::jsonb,
  add column if not exists exam_locked boolean not null default false,
  add column if not exists exam_locked_schools jsonb not null default '[]'::jsonb;
