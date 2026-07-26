-- ============================================================================
--  Anzen Dictionary — the student leaderboard
--  Run this after 06 and 11. Safe to re-run.
--
--  Students may see how they stand against their classmates, but not each
--  other's details. RLS (from 06) lets a student read only their own row, so a
--  plain SELECT can't build a ranking. This SECURITY DEFINER function does it
--  for them, returning ONLY a display name, a level, and a tiebreak number —
--  never an email, a word list, or usage. It is limited to students of the
--  caller's own branch.
--
--    level    = how many lessons the student has passed (best score >= 90),
--               counted across every ladder in settings->'lessons'
--    progress = how many words they have opened (viewed length), used only to
--               break ties; the app never shows it
-- ============================================================================
create or replace function public.leaderboard()
returns table (full_name text, level int, progress int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select school_id from public.profiles where id = auth.uid()
  )
  select
    p.full_name,
    coalesce((
      select count(*)::int
      from jsonb_each(coalesce(p.settings -> 'lessons', '{}'::jsonb)) as kind(key, val),
           jsonb_each_text(kind.val) as lesson(num, score)
      where lesson.score ~ '^[0-9.]+$'
        and lesson.score::numeric >= 90
    ), 0) as level,
    coalesce(jsonb_array_length(
      case when jsonb_typeof(p.viewed) = 'array' then p.viewed else '[]'::jsonb end
    ), 0) as progress,
    (p.id = auth.uid()) as is_me
  from public.profiles p, me
  where p.role = 'student'
    and p.school_id is not null
    and p.school_id = me.school_id;
$$;

revoke all on function public.leaderboard() from public;
grant execute on function public.leaderboard() to authenticated;
