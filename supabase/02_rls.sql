-- ============================================================================
--  Anzen Dictionary — Row Level Security (RLS)
--  Run this SECOND (after 01_schema.sql).
--  Rule of thumb:
--    admin   → sees & edits everyone
--    teacher → sees own students (+ self); edits only own row
--    student → sees & edits only own row
-- ============================================================================

alter table public.profiles enable row level security;

-- Clean re-run
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
drop policy if exists profiles_insert on public.profiles;

-- SELECT: self, or admin (all), or teacher viewing their own students.
create policy profiles_select on public.profiles
for select using (
      id = auth.uid()
   or public.is_admin()
   or (teacher_id = auth.uid())
);

-- UPDATE: self (columns guarded by protect_profile_columns trigger) or admin.
create policy profiles_update on public.profiles
for update using ( id = auth.uid() or public.is_admin() )
with check      ( id = auth.uid() or public.is_admin() );

-- DELETE: admin only.
create policy profiles_delete on public.profiles
for delete using ( public.is_admin() );

-- INSERT: profiles are created by the signup trigger (SECURITY DEFINER) and by
-- the Edge Function (service_role). Allow admins to insert directly too.
create policy profiles_insert on public.profiles
for insert with check ( public.is_admin() or id = auth.uid() );
