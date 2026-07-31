-- ============================================================================
--  Anzen Dictionary — weighted level + exam stars on the leaderboard
--  Run this after 16. Safe to re-run. Replaces the leaderboard() from 12.
--
--  Level now rewards harder work more (best score >= 90 counts as a pass):
--    word-test lesson (settings->'lessons')   × 1
--    exercise         (settings->'quizzes')    × 2
--    image-exercise   (settings->'imgQuizzes') × 1
--    exam block       (settings->'exams')      × 3
--  and a new `stars` = how many times the exam was passed (passing entries in
--  settings->'examLog'), shown after the student's name.
-- ============================================================================
drop function if exists public.leaderboard();
create or replace function public.leaderboard()
returns table (full_name text, level int, progress int, is_me boolean, school_name text, stars int)
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
      -- word-test lessons (nested: kind -> {num: score}) × 1
      coalesce((select count(*) from jsonb_each(coalesce(p.settings -> 'lessons', '{}'::jsonb)) as kind(key, val),
                     jsonb_each_text(kind.val) as lesson(num, score)
                where lesson.score ~ '^[0-9.]+$' and lesson.score::numeric >= 90), 0)
      -- exercises × 2
      + coalesce((select count(*) from jsonb_each_text(coalesce(p.settings -> 'quizzes', '{}'::jsonb)) as q(k, v)
                  where v ~ '^[0-9.]+$' and v::numeric >= 90), 0) * 2
      -- image-exercises × 1
      + coalesce((select count(*) from jsonb_each_text(coalesce(p.settings -> 'imgQuizzes', '{}'::jsonb)) as i(k, v)
                  where v ~ '^[0-9.]+$' and v::numeric >= 90), 0)
      -- exam blocks × 3
      + coalesce((select count(*) from jsonb_each_text(coalesce(p.settings -> 'exams', '{}'::jsonb)) as e(k, v)
                  where v ~ '^[0-9.]+$' and v::numeric >= 90), 0) * 3
    )::int as level,
    coalesce(jsonb_array_length(
      case when jsonb_typeof(p.viewed) = 'array' then p.viewed else '[]'::jsonb end
    ), 0) as progress,
    (p.id = auth.uid()) as is_me,
    me.school_name,
    coalesce((select count(*) from jsonb_array_elements(
        case when jsonb_typeof(p.settings -> 'examLog') = 'array' then p.settings -> 'examLog' else '[]'::jsonb end
      ) as a where (a ->> 'passed')::boolean is true), 0)::int as stars
  from public.profiles p, me
  where p.role = 'student'
    and p.school_id is not null
    and p.school_id = me.school_id;
$$;

revoke all on function public.leaderboard() from public;
grant execute on function public.leaderboard() to authenticated;
