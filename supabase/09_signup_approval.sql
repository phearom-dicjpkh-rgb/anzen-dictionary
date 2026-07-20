-- ============================================================================
--  Anzen Dictionary — self sign-up with branch approval
--  Run this after 08_branch_edit.sql. Safe to re-run.
--
--  A branch shares an invite link carrying its own token. Whoever opens it
--  fills in their details and registers, which creates the account but leaves
--  it inert: nothing is visible and the app refuses to continue until the
--  branch presses Approve.
--
--  Public sign-up in Supabase Auth stays OFF: the Edge Function creates the
--  account with the service role, so the only way in is through a link that
--  carries a real branch token.
-- ============================================================================

-- approved: existing accounts keep working, only new self sign-ups start false
alter table public.profiles
  add column if not exists approved boolean not null default true;

-- the token that identifies a branch inside its invite link
alter table public.profiles
  add column if not exists signup_token text unique;

create index if not exists profiles_approved_idx on public.profiles(approved) where not approved;

-- ---------------------------------------------------------------- helpers --
-- An unapproved account must not see anything, so every role test requires it.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and approved);
$$;

create or replace function public.is_school()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'school' and approved);
$$;

create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'teacher' and approved);
$$;

-- ------------------------------------------------- carry approved on signup --
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r    text;
  tid  uuid;
  sid  uuid;
  ok   boolean;
begin
  r := coalesce(new.raw_user_meta_data->>'role', 'student');
  if r not in ('admin','school','teacher','student') then r := 'student'; end if;
  begin tid := nullif(new.raw_user_meta_data->>'teacher_id','')::uuid; exception when others then tid := null; end;
  begin sid := nullif(new.raw_user_meta_data->>'school_id','')::uuid;  exception when others then sid := null; end;
  ok := coalesce((new.raw_user_meta_data->>'approved')::boolean, true);

  insert into public.profiles (id, email, full_name, role, teacher_id, school_id, approved)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          r, tid, sid, ok)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------------- column protection --
-- Approving is a decision for an admin or the owning branch — never the
-- account itself, which could otherwise let itself in.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  may_approve boolean;
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  may_approve := public.is_school() and old.school_id = auth.uid();

  if new.approved is distinct from old.approved and not may_approve then
    raise exception 'Not allowed to change approved';
  end if;

  -- a branch may manage its own teachers and students, inside its own branch
  if may_approve
     and new.school_id = auth.uid()
     and old.role in ('teacher','student')
     and new.role in ('teacher','student')
     and new.email is not distinct from old.email
     and new.id    is not distinct from old.id then
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

-- --------------------------------------------------------------------- RLS --
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create policy profiles_select on public.profiles
for select using (
      id = auth.uid()
   or public.is_admin()
   or (public.is_school()  and school_id = auth.uid())
   or (public.is_teacher() and school_id is not null and school_id = public.my_school_id())
);

create policy profiles_update on public.profiles
for update using      ( id = auth.uid() or public.is_admin() or (public.is_school() and school_id = auth.uid()) )
        with check ( id = auth.uid() or public.is_admin() or (public.is_school() and school_id = auth.uid()) );

create policy profiles_delete on public.profiles
for delete using ( public.is_admin() or (public.is_school() and school_id = auth.uid()) );

-- Anyone opening an invite link must be able to resolve its token to a branch
-- before they have an account, so expose only that lookup.
create or replace function public.school_by_token(tok text)
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select id, full_name from public.profiles
  where role = 'school' and approved and signup_token = tok
  limit 1;
$$;

grant execute on function public.school_by_token(text) to anon, authenticated;
