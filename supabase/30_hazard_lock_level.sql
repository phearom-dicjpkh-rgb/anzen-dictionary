-- ============================================================================
--  Anzen Dictionary — ព្យាករណ៍គ្រោះថ្នាក់ (危険予測) lock + level term
--  Run this after 29. Safe to re-run.
--
--  A new practice ladder that sits between លំហាត់រូបភាព and ប្រឡងសាកល្បង:
--    · same lock shape as the other sections (a "lock for everyone" flag plus a
--      per-branch list). The questions ship in the app (RAW_HAZARD), not here.
--    · +1 level for every 2 passed exercises. Level stays computed, so all
--      students are re-graded automatically once this runs.
-- ============================================================================
alter table public.app_settings
  add column if not exists hazard_locked boolean not null default false,
  add column if not exists hazard_locked_schools jsonb not null default '[]'::jsonb;

-- Replaces leaderboard() from 26 — identical, plus the hazard term.
drop function if exists public.leaderboard();
create or replace function public.leaderboard()
returns table (full_name text, level int, progress int, is_me boolean, school_name text, stars int, avatar text, avatar_color text)
language sql stable security definer set search_path = public as $$
  with me as (
    select pr.school_id, s.full_name as school_name
    from public.profiles pr
    left join public.profiles s on s.id = pr.school_id
    where pr.id = auth.uid()
  )
  select
    p.full_name,
    (
      -- ប្រឡងសាកល្បង — one level per passing attempt
      coalesce((select count(*) from jsonb_array_elements(
          case when jsonb_typeof(p.settings -> 'examLog') = 'array' then p.settings -> 'examLog' else '[]'::jsonb end
        ) as a where (a ->> 'passed')::boolean is true), 0)
      -- ជ្រើសរើសពាក្យ (word tests) — one level per 10 passed lessons
      + coalesce((select count(*) from jsonb_each(coalesce(p.settings -> 'lessons', '{}'::jsonb)) as kind(key, val),
                       jsonb_each_text(kind.val) as lesson(num, score)
                  where lesson.score ~ '^[0-9.]+$' and lesson.score::numeric >= 90), 0) / 10
      -- លំហាត់ — one level per 3 passed
      + coalesce((select count(*) from jsonb_each_text(coalesce(p.settings -> 'quizzes', '{}'::jsonb)) as q(k, v)
                  where v ~ '^[0-9.]+$' and v::numeric >= 90), 0) / 3
      -- លំហាត់រូបភាព — one level per 5 passed
      + coalesce((select count(*) from jsonb_each_text(coalesce(p.settings -> 'imgQuizzes', '{}'::jsonb)) as i(k, v)
                  where v ~ '^[0-9.]+$' and v::numeric >= 90), 0) / 5
      -- ព្យាករណ៍គ្រោះថ្នាក់ — one level per 2 passed
      + coalesce((select count(*) from jsonb_each_text(coalesce(p.settings -> 'hazardQuizzes', '{}'::jsonb)) as h(k, v)
                  where v ~ '^[0-9.]+$' and v::numeric >= 90), 0) / 2
      -- រៀន — one level per 10 hours (36000 seconds) of total app time
      + floor(coalesce((select sum(v::numeric) from jsonb_each_text(coalesce(p.usage, '{}'::jsonb)) as u(k, v)
                        where v ~ '^[0-9.]+$'), 0) / 36000)
      -- មើលពាក្យ — one level per 200 words viewed
      + coalesce(jsonb_array_length(
          case when jsonb_typeof(p.viewed) = 'array' then p.viewed else '[]'::jsonb end
        ), 0) / 200
    )::int as level,
    coalesce(jsonb_array_length(
      case when jsonb_typeof(p.viewed) = 'array' then p.viewed else '[]'::jsonb end
    ), 0) as progress,
    (p.id = auth.uid()) as is_me,
    me.school_name,
    coalesce((select count(*) from jsonb_array_elements(
        case when jsonb_typeof(p.settings -> 'examLog') = 'array' then p.settings -> 'examLog' else '[]'::jsonb end
      ) as a where (a ->> 'passed')::boolean is true), 0)::int as stars,
    coalesce(p.settings ->> 'avatarAnimal', '') as avatar,
    coalesce(p.settings ->> 'avatarColor', '') as avatar_color
  from public.profiles p, me
  where p.role = 'student'
    and p.school_id is not null
    and p.school_id = me.school_id;
$$;

revoke all on function public.leaderboard() from public;
grant execute on function public.leaderboard() to authenticated;
