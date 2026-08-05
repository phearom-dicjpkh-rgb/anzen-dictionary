-- ============================================================================
--  Anzen Dictionary — authored books (បណ្ណាល័យសៀវភៅ, Admin)
--  Run this after 18. Safe to re-run.
--
--  Admins write rich-text books (text + image links) in the app; they are
--  stored here as HTML. Phase 1 is Admin-only: only an admin may read or write.
--  (A later phase can widen the read policy so students can open them.)
-- ============================================================================
create extension if not exists pgcrypto;

create table if not exists public.books (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  content    text not null default '',          -- sanitized HTML
  sort       int  not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_sort_idx on public.books (sort, updated_at desc);

alter table public.books enable row level security;

-- helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Phase 1: only admins may read or write books.
drop policy if exists books_admin_all on public.books;
create policy books_admin_all on public.books
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- stamp created_by / updated_at automatically
create or replace function public.books_touch()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT' and new.created_by is null) then new.created_by := auth.uid(); end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists books_touch_trg on public.books;
create trigger books_touch_trg before insert or update on public.books
  for each row execute function public.books_touch();
