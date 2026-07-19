-- ============================================================================
--  Anzen Dictionary — students belong to a school, not to one teacher
--  Run this after 05_schools.sql. Safe to re-run.
--
--  A student is no longer tied to a single teacher: they are enrolled in a
--  branch, and every teacher of that branch can follow them. teacher_id stays
--  on the table for older rows but is no longer used.
-- ============================================================================

create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

-- the caller's own branch
create or replace function public.my_school_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid();
$$;

drop policy if exists profiles_select on public.profiles;

-- self
--   · admin      → everyone
--   · school     → its own branch
--   · teacher    → everyone in the same branch (all its students)
create policy profiles_select on public.profiles
for select using (
      id = auth.uid()
   or public.is_admin()
   or school_id = auth.uid()
   or (public.is_teacher() and school_id is not null and school_id = public.my_school_id())
);
