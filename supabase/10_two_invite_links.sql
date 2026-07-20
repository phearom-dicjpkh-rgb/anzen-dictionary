-- ============================================================================
--  Anzen Dictionary — separate invite links for students and teachers
--  Run this after 09_signup_approval.sql. Safe to re-run.
--
--  A branch hands out two different links. Which link was opened decides the
--  role, so nobody can register as a teacher by editing the address — the
--  teacher link is the only way, and a branch can retire it on its own.
-- ============================================================================
alter table public.profiles
  add column if not exists token_student text unique,
  add column if not exists token_teacher text unique;

-- the single link created before this split becomes the student one
update public.profiles
   set token_student = signup_token
 where role = 'school' and signup_token is not null and token_student is null;

-- return type changes, so the old one has to go first
drop function if exists public.school_by_token(text);

create function public.school_by_token(tok text)
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select p.id,
         p.full_name,
         case when p.token_teacher = tok then 'teacher' else 'student' end
  from public.profiles p
  where p.role = 'school'
    and p.approved
    and (p.token_student = tok or p.token_teacher = tok)
  limit 1;
$$;

grant execute on function public.school_by_token(text) to anon, authenticated;
