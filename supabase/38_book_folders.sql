-- ============================================================================
--  Anzen Dictionary — folders for the book library (បណ្ណាល័យសៀវភៅ ជាថតឯកសារ)
--  Run this after 37. Safe to re-run.
--
--  The library now looks like a file explorer:
--    • books.folder     — the folder a book sits in, as a path "N4/文法" ('' = the top)
--    • books.starred    — shown under ★ ចំណូលចិត្ត
--    • books.trashed_at — deleted books go to the ធុងសំរាម first (restore / delete forever)
--    • book_folders     — folders that exist even while empty
--  Moving, starring or trashing a book no longer changes its "last edited" time:
--  updated_at only moves when the title or the text changes.
-- ============================================================================

alter table public.books add column if not exists folder     text        not null default '';
alter table public.books add column if not exists starred    boolean     not null default false;
alter table public.books add column if not exists trashed_at timestamptz;
create index if not exists books_folder_idx on public.books (folder);

create table if not exists public.book_folders (
  path       text primary key,
  created_at timestamptz not null default now()
);
alter table public.book_folders enable row level security;

-- read for everyone signed in (same as books); create / rename / delete for admins only
drop policy if exists book_folders_read on public.book_folders;
create policy book_folders_read on public.book_folders
  for select to authenticated using (true);

drop policy if exists book_folders_admin_write on public.book_folders;
create policy book_folders_admin_write on public.book_folders
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- keep updated_at for real edits only (title / text), not for moves, stars or the trash
create or replace function public.books_touch()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_at := now();
  elsif (new.title is distinct from old.title or new.content is distinct from old.content) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
