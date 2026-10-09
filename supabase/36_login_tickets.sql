-- ============================================================================
--  Anzen Dictionary — one-time login QR ("login tickets")
--  Run this after 35. Safe to re-run.
--
--  An Admin / branch makes a ticket for a student or teacher in the edit dialog;
--  it becomes a QR. Scanning it signs that person in ONCE, within 7 days, and the
--  QR then stops working. The QR carries only a random token — never a password.
--
--  Only the SHA-256 of the token is stored. The table has no policies on purpose:
--  just the Edge Function (service role) reads and writes it. Redeploy the Edge
--  Function (supabase/edge-admin-create-user/index.ts) after running this.
-- ============================================================================

create table if not exists public.login_tickets (
  token_hash  text primary key,                                   -- sha256 hex of the token
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists login_tickets_user_idx on public.login_tickets (user_id);

alter table public.login_tickets enable row level security;
-- (no policies: anon / authenticated clients can neither read nor write tickets)
