-- ============================================================================
--  Anzen Dictionary — announcements: pin, image, scheduled send
--  Run this after 28. Safe to re-run.
--
--  Adds:
--    pinned      — keep an important message at the top
--    image       — a public Storage URL (bucket "logos") shown in the message
--    publish_at  — when it becomes visible; a future time = scheduled send
--  (Assignment-completion stats are computed from each student's saved scores,
--   so they need no schema change.)
-- ============================================================================
alter table public.announcements add column if not exists pinned     boolean not null default false;
alter table public.announcements add column if not exists image      text;
alter table public.announcements add column if not exists publish_at timestamptz not null default now();

create index if not exists announcements_pinned_idx on public.announcements(pinned, publish_at desc);

-- Recipients only see a message once its publish time has arrived (admin sees
-- everything, including scheduled ones, so they can review the queue).
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
for select using (
  public.is_admin()
  or (
    publish_at <= now()
    and (
          target_type = 'all'
       or (target_type = 'school'  and target_id = public.my_branch())
       or (target_type = 'student' and target_id = auth.uid())
    )
  )
);

-- Admin may edit an existing message (e.g. pin / unpin it).
drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements
for update using ( public.is_admin() ) with check ( public.is_admin() );
