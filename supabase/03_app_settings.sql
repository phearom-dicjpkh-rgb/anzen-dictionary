-- ============================================================================
--  Anzen Dictionary — App settings (dictionary name + logo)
--  Run this in the Supabase SQL Editor (after 01/02). One shared row that the
--  Admin can edit; everyone can read (so the name/logo show for all users).
-- ============================================================================
create table if not exists public.app_settings (
  id         int primary key default 1,
  app_name   text not null default 'វចនានុក្រម',
  logo       text default '',            -- data URI (base64 image) or URL
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
