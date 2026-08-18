-- ============================================================================
--  Anzen Dictionary — richer announcements (ប្រកាស)
--  Run this after 27. Safe to re-run.
--
--  Adds category, audience targeting, an optional attached exercise, and a
--  deadline. Read receipts stay per-user in profiles.settings.annRead (an
--  array of announcement ids), so the admin reads "who has seen it" straight
--  from the student list — no extra table.
-- ============================================================================
alter table public.announcements add column if not exists category   text not null default 'info';   -- info | assignment | warning | celebrate
alter table public.announcements add column if not exists target_type text not null default 'all';    -- all | school | student
alter table public.announcements add column if not exists target_id   uuid;                            -- school id or student id
alter table public.announcements add column if not exists assign_kind text;                            -- null | word | quiz | img | exam
alter table public.announcements add column if not exists assign_lesson int;                           -- lesson number (word/quiz/img)
alter table public.announcements add column if not exists due_at      timestamptz;                     -- deadline, null = none

-- The viewer's branch: their own id if they ARE a school, else their school_id.
create or replace function public.my_branch()
returns uuid language sql stable security definer set search_path = public as $$
  select case when role = 'school' then id else school_id end
  from public.profiles where id = auth.uid();
$$;
revoke all on function public.my_branch() from public;
grant execute on function public.my_branch() to authenticated;

-- Only the intended audience may read a targeted announcement (admin sees all).
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
for select using (
      public.is_admin()
   or target_type = 'all'
   or (target_type = 'school'  and target_id = public.my_branch())
   or (target_type = 'student' and target_id = auth.uid())
);
