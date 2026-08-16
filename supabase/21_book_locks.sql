-- ============================================================================
--  Anzen Dictionary — book reading for students + per-book lock (អានសៀវភៅ)
--  Run this after 20. Safe to re-run.
--
--  Two changes so the new "អានសៀវភៅ" panel works for everyone:
--    1. add books.locked — an admin toggle. A locked book still shows on the
--       shelf (with a 🔒 badge) but students can't open it.
--    2. widen the read policy: every signed-in user may now READ books
--       (Phase 1 in 19_books.sql allowed admins only — that is why students
--       saw an empty shelf). Writing/locking stays admin-only.
-- ============================================================================

-- 1) the lock flag (defaults to unlocked = readable)
alter table public.books add column if not exists locked boolean not null default false;

-- 2) read for everyone signed in; write/lock for admins only
--    Replace the single admin-only "for all" policy with a read policy + a
--    separate write policy, so a student's SELECT is allowed but INSERT/
--    UPDATE/DELETE (including flipping `locked`) remain admin-only.
drop policy if exists books_admin_all on public.books;

drop policy if exists books_read_all on public.books;
create policy books_read_all on public.books
  for select to authenticated
  using (true);

drop policy if exists books_admin_write on public.books;
create policy books_admin_write on public.books
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
