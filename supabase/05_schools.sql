-- ============================================================================
--  Anzen Dictionary — Schools / branches
--  Run this after 01–04. Safe to re-run.
--
--  Hierarchy:
--    admin    → creates schools; sees and edits everyone
--    school   → creates teachers and students of its own branch only
--    teacher  → sees own students
--    student  → sees only itself
--
--  A school is itself a row in profiles (role='school'); teachers and students
--  point at it through school_id, so "everyone in my branch" is one column.
-- ============================================================================

alter table public.profiles
  add column if not exists school_id uuid references public.profiles(id) on delete set null;

create index if not exists profiles_school_id_idx on public.profiles(school_id);

-- widen the allowed roles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','school','teacher','student'));

-- ---------------------------------------------------------------- helpers --
create or replace function public.is_school()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'school');
$$;

-- ---------------------------------------------------- signup trigger patch --
-- Carry school_id (and the wider role list) from the metadata the Edge
-- Function passes when it creates the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r    text;
  tid  uuid;
  sid  uuid;
begin
  r := coalesce(new.raw_user_meta_data->>'role', 'student');
  if r not in ('admin','school','teacher','student') then r := 'student'; end if;
  begin tid := nullif(new.raw_user_meta_data->>'teacher_id','')::uuid; exception when others then tid := null; end;
  begin sid := nullif(new.raw_user_meta_data->>'school_id','')::uuid;  exception when others then sid := null; end;

  insert into public.profiles (id, email, full_name, role, teacher_id, school_id)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          r, tid, sid)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------- column guard extension --
-- Non-admins still may not change their own role/teacher/school/email.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if new.role       is distinct from old.role
     or new.teacher_id is distinct from old.teacher_id
     or new.school_id  is distinct from old.school_id
     or new.email      is distinct from old.email
     or new.id         is distinct from old.id then
    raise exception 'Not allowed to change role/teacher_id/school_id/email';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------- RLS ---
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

-- self · admin sees all · teacher sees own students · school sees its branch
create policy profiles_select on public.profiles
for select using (
      id = auth.uid()
   or public.is_admin()
   or teacher_id = auth.uid()
   or school_id  = auth.uid()
);

create policy profiles_update on public.profiles
for update using ( id = auth.uid() or public.is_admin() or school_id = auth.uid() )
with check   ( id = auth.uid() or public.is_admin() or school_id = auth.uid() );

create policy profiles_delete on public.profiles
for delete using ( public.is_admin() or school_id = auth.uid() );
