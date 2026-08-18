-- ============================================================================
--  Anzen Dictionary — admin announcements (ប្រកាស)
--  Run this after 26. Safe to re-run.
--
--  The admin posts short broadcast messages; every signed-in user reads them
--  through the bell in the header. "Read" state is per-user and lives in each
--  profile's settings.annSeen (an ISO timestamp), so no extra table is needed.
-- ============================================================================
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists announcements_created_idx on public.announcements(created_at desc);

alter table public.announcements enable row level security;

drop policy if exists announcements_select on public.announcements;
drop policy if exists announcements_insert on public.announcements;
drop policy if exists announcements_delete on public.announcements;

-- Anyone signed in may read the announcements.
create policy announcements_select on public.announcements
for select using ( true );

-- Only an admin may post or remove them.
create policy announcements_insert on public.announcements
for insert with check ( public.is_admin() );

create policy announcements_delete on public.announcements
for delete using ( public.is_admin() );
