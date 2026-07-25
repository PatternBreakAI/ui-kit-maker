-- Migration 0090 — admin audit (v90)
-- Extracted verbatim from supabase/schema.sql (the assembled source of truth).
-- Idempotent: safe to re-run. APPEND-ONLY: never edit this file after it has
-- been applied anywhere — new work gets the next number.

-- ── admin audit (v90) — the plan desk's paper trail ──────────────────
-- /api/admin (the in-app comp/manage desk) records every plan change
-- here: who did it, to whom, old→new. RLS is enabled with NO policies,
-- exactly like mailing_list — only the service role reads or writes.
-- The admin desk works without this table (Vercel function logs carry a
-- structured line either way); this is the queryable copy.
--
-- Admin itself is granted exactly once, by the owner, in the SQL editor
-- (there is deliberately no in-app way to grant it):
--   update public.profiles set is_admin = true where email = 'chevon@me.com';
create table if not exists public.admin_audit (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null,
  target_id  uuid not null,
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx
  on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;
