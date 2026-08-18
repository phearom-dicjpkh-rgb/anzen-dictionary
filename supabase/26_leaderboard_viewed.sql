-- ============================================================================
--  Anzen Dictionary — add "words viewed" to the level (កំរិត) formula
--  Run this after 25. Safe to re-run. Replaces the leaderboard() from 25.
--
--  Adds one more term to the computed level:
--    មើលពាក្យ  +1 every 200 distinct words viewed  (jsonb_array_length(viewed))
--  Every other term (exams, quizzes, image-exercises, word tests, hours) and
--  every other column is unchanged. Level stays computed, so all students are
--  re-graded automatically.
-- ============================================================================
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
