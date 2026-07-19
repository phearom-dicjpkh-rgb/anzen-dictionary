-- ============================================================================
--  Anzen Dictionary — let branches edit their own members
--  Run this after 05/06. Safe to re-run.
--
--  Editing a profile no longer goes through the Edge Function (only password
--  changes still do), so the column guard has to allow a branch to manage the
--  teachers and students it already owns — while still refusing to let anyone
--  promote themselves or move a member into another branch.
-- ============================================================================
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- admins, and trusted server / SQL-editor contexts
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  -- a branch may manage its own teachers and students, inside its own branch
  if public.is_school()
     and old.school_id = auth.uid()
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
