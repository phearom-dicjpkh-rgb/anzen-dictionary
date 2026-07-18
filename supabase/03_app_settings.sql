-- ============================================================================
--  Anzen Dictionary — App settings (dictionary name + logo)
--  Run this in the Supabase SQL Editor (after 01/02). Safe to re-run.
--
--  The logo image itself lives in Supabase STORAGE (bucket "logos"); the
--  app_settings row only stores its short public URL, so reading the settings
--  stays tiny (no base64 blob in the database / egress).
-- ============================================================================

-- 1) One shared settings row -------------------------------------------------
create table if not exists public.app_settings (
  id         int primary key default 1,
  app_name   text not null default 'វចនានុក្រម',
  logo       text default '',            -- public URL of the logo in Storage
  updated_at timestamptz default now(),
  constraint app_settings_single_row check (id = 1)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_update on public.app_settings;

-- Anyone (even before login) may read the name/logo.
create policy app_settings_select on public.app_settings
for select using ( true );

-- Only an admin may change it.
create policy app_settings_update on public.app_settings
for update using ( public.is_admin() ) with check ( public.is_admin() );


-- 2) Storage bucket for the logo --------------------------------------------
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

drop policy if exists logos_read   on storage.objects;
drop policy if exists logos_insert on storage.objects;
drop policy if exists logos_update on storage.objects;
drop policy if exists logos_delete on storage.objects;

-- Everyone can read the logo (it is shown to all users, and before login).
create policy logos_read on storage.objects
for select using ( bucket_id = 'logos' );

-- Only an admin can upload / replace / remove it.
create policy logos_insert on storage.objects
for insert with check ( bucket_id = 'logos' and public.is_admin() );

create policy logos_update on storage.objects
for update using ( bucket_id = 'logos' and public.is_admin() )
        with check ( bucket_id = 'logos' and public.is_admin() );

create policy logos_delete on storage.objects
for delete using ( bucket_id = 'logos' and public.is_admin() );
