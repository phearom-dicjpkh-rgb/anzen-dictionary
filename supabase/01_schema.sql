-- ============================================================================
--  Anzen Dictionary — Database schema
--  Run this FIRST in the Supabase SQL Editor (New query → paste → Run).
-- ============================================================================

-- 1) profiles: one row per user (linked to Supabase Auth user).
--    Roles: 'admin' | 'teacher' | 'student'.
--    Student learning data is stored here as JSON so a teacher can read it.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text        not null default '',
  role        text        not null default 'student'
                          check (role in ('admin','teacher','student')),
  teacher_id  uuid        references public.profiles(id) on delete set null,
  viewed      jsonb       not null default '[]'::jsonb,   -- word ids the student has viewed
  favorites   jsonb       not null default '[]'::jsonb,   -- word ids favorited
  history     jsonb       not null default '[]'::jsonb,   -- test/quiz history
  settings    jsonb       not null default '{}'::jsonb,   -- fontScale, autoAudio…
  created_at  timestamptz not null default now()
);

create index if not exists profiles_teacher_id_idx on public.profiles(teacher_id);
create index if not exists profiles_role_idx       on public.profiles(role);

-- 2) Helper: is the current user an admin?  (SECURITY DEFINER = bypasses RLS,
--    so it can read the profiles table without recursion in RLS policies.)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 3) When a new auth user is created, create their profile row.
--    role / full_name / teacher_id come from the metadata the admin passes
--    (only the admin-gated Edge Function creates users, so this is trusted).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r  text;
  tid uuid;
begin
  r := coalesce(new.raw_user_meta_data->>'role', 'student');
  if r not in ('admin','teacher','student') then r := 'student'; end if;
  begin
    tid := nullif(new.raw_user_meta_data->>'teacher_id','')::uuid;
  exception when others then tid := null;
  end;

  insert into public.profiles (id, email, full_name, role, teacher_id)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          r, tid)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Guard: a non-admin may update ONLY their own learning data / settings.
--    They must NOT be able to change their own role, teacher_id, email or id.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- admins may change anything; auth.uid() IS NULL means a trusted server /
  -- SQL-editor / service_role context (RLS already blocks untrusted anon here).
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if new.role       is distinct from old.role
     or new.teacher_id is distinct from old.teacher_id
     or new.email      is distinct from old.email
     or new.id         is distinct from old.id then
    raise exception 'Not allowed to change role/teacher_id/email';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns_trg on public.profiles;
create trigger protect_profile_columns_trg
  before update on public.profiles
  for each row execute function public.protect_profile_columns();
