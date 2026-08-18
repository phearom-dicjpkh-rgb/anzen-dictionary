-- ============================================================================
--  Anzen Dictionary — read a branch's public branding (name + logo + colour)
--  Run this after 23. Safe to re-run.
--
--  A teacher may see their students but NOT the school's own profile row
--  (RLS: self / admin / own-students only), so a teacher could not read the
--  branch name + logo to brand a downloaded results PDF. This SECURITY DEFINER
--  function exposes ONLY the non-sensitive branding (the same name shown on
--  every leaderboard, and a logo that already lives in the public "logos"
--  bucket) for one school id — nothing else about the row is returned.
-- ============================================================================
create or replace function public.school_brand(sid uuid)
returns table (full_name text, logo text, color text)
language sql stable security definer set search_path = public as $$
  select p.full_name,
         coalesce(p.settings ->> 'logo', ''),
         coalesce(p.settings ->> 'color', p.settings ->> 'avatarColor', '')
  from public.profiles p
  where p.id = sid and p.role = 'school';
$$;

revoke all on function public.school_brand(uuid) from public;
grant execute on function public.school_brand(uuid) to authenticated;
