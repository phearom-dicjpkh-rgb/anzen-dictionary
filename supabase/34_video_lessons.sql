-- ============================================================================
--  Anzen Dictionary — វីដេអូមេរៀន (YouTube links) + per-student watch tracking
--  Run this after 33. Safe to re-run.
--
--  · video_lessons  — links an admin adds (YouTube id, title, group, order,
--                     active, mandatory, which branches may see it).
--  · video_progress — one row per student per video: the seconds actually
--                     watched (merged ranges), skipped gaps, last position,
--                     how many times it was started, completed or not.
-- ============================================================================

create table if not exists public.video_lessons (
  id          uuid primary key default gen_random_uuid(),
  yt_id       text not null,                       -- the 11-char YouTube video id
  title       text not null,
  grp         text not null default '',            -- free-text group / lesson label
  duration    int,                                 -- seconds, read from the player when added
  sort        int  not null default 0,
  active      boolean not null default true,
  mandatory   boolean not null default false,
  school_ids  jsonb not null default '[]'::jsonb,  -- [] = every branch, else the branch ids allowed
  created_at  timestamptz not null default now()
);

alter table public.video_lessons enable row level security;

-- readable by a signed-in user when active and open to their branch (admin: all)
drop policy if exists video_lessons_select on public.video_lessons;
create policy video_lessons_select on public.video_lessons
  for select using (
    public.is_admin()
    or (
      auth.uid() is not null and active
      and (
        jsonb_array_length(school_ids) = 0
        or school_ids ? coalesce(public.my_school_id(), auth.uid())::text
      )
    )
  );
drop policy if exists video_lessons_write on public.video_lessons;
create policy video_lessons_write on public.video_lessons
  for all using ( public.is_admin() ) with check ( public.is_admin() );


create table if not exists public.video_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  video_id      uuid not null references public.video_lessons(id) on delete cascade,
  ranges        jsonb not null default '[]'::jsonb,   -- [[from,to],…] seconds really watched
  skips         jsonb not null default '[]'::jsonb,   -- [[from,to],…] gaps jumped over, not watched
  last_pos      int  not null default 0,
  plays         int  not null default 0,              -- times the video was started
  watch_secs    int  not null default 0,              -- total time spent playing
  completed     boolean not null default false,
  completed_at  timestamptz,
  rate          numeric,                              -- last playback speed
  updated_at    timestamptz not null default now(),
  primary key (user_id, video_id)
);

alter table public.video_progress enable row level security;

-- a student reads/writes only their own row; staff read the students they follow
drop policy if exists video_progress_select on public.video_progress;
create policy video_progress_select on public.video_progress
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = video_progress.user_id
        and (
          p.school_id = auth.uid()
          or (public.is_teacher() and p.school_id is not null and p.school_id = public.my_school_id())
        )
    )
  );
drop policy if exists video_progress_insert on public.video_progress;
create policy video_progress_insert on public.video_progress
  for insert with check ( user_id = auth.uid() );
drop policy if exists video_progress_update on public.video_progress;
create policy video_progress_update on public.video_progress
  for update using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );
drop policy if exists video_progress_delete on public.video_progress;
create policy video_progress_delete on public.video_progress
  for delete using ( public.is_admin() );
