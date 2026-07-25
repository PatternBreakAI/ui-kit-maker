-- Migration 0088 — mailing list mirror (v88)
-- Extracted verbatim from supabase/schema.sql (the assembled source of truth).
-- Idempotent: safe to re-run. APPEND-ONLY: never edit this file after it has
-- been applied anywhere — new work gets the next number.

-- ── mailing list mirror (v88) ────────────────────────────────────────
-- /api/subscribe forwards sign-ups to Buttondown (the record of consent
-- and unsubscribes) and mirrors a copy here so we own our list. Written
-- only by the service role; RLS is enabled with NO policies, so the anon
-- and authenticated keys can neither read nor write a single row.
create table if not exists public.mailing_list (
  email      text primary key,
  source     text,
  locale     text,
  created_at timestamptz not null default now()
);
alter table public.mailing_list enable row level security;
