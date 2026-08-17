-- ============================================================================
--  Anzen Dictionary — avatar on the leaderboard
--  Run this after 21. Safe to re-run. Replaces the leaderboard() from 17.
--
--  Adds two columns so a student's own ranking screen can show the zodiac
--  avatar (and its colour) each learner picked in ប្រវត្តិរូប, instead of just
--  the name initial:
--    avatar        — the chosen animal emoji   (settings->>'avatarAnimal')
--    avatar_color  — its background colour hex  (settings->>'avatarColor')
--  Everything else (name, level, progress, is_me, school_name, stars) is
--  unchanged, so no other privacy surface widens.
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
      coalesce((select count(*) from jsonb_each(coalesce(p.settings -> 'lessons', '{}'::jsonb)) as kind(key, val),
                     jsonb_each_text(kind.val) as lesson(num, score)
                where lesson.score ~ '^[0-9.]+$' and lesson.score::numeric >= 90), 0)
      + coalesce((select count(*) from jsonb_each_text(coalesce(p.settings -> 'quizzes', '{}'::jsonb)) as q(k, v)
                  where v ~ '^[0-9.]+$' and v::numeric >= 90), 0) * 2
      + coalesce((select count(*) from jsonb_each_text(coalesce(p.settings -> 'imgQuizzes', '{}'::jsonb)) as i(k, v)
                  where v ~ '^[0-9.]+$' and v::numeric >= 90), 0)
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
