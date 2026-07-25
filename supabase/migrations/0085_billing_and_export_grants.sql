-- Migration 0085 — billing + export grants (v85)
-- Extracted verbatim from supabase/schema.sql (the assembled source of truth).
-- Idempotent: safe to re-run. APPEND-ONLY: never edit this file after it has
-- been applied anywhere — new work gets the next number.

-- ── billing (v85) — Stripe entitlement columns ───────────────────────
-- plan_id stays server-truth: the RLS update policy above pins any client
-- write to 'free', and only the Stripe webhook (service-role key, RLS
-- bypassed) ever grants pro. These pointer columns let the webhook find
-- the right profile from a Stripe customer, and let the account page open
-- the billing portal without another Stripe lookup. Column-level revokes
-- make them unwritable by clients even inside their own row.
alter table public.profiles add column if not exists stripe_customer_id     text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists plan_status            text;
alter table public.profiles add column if not exists plan_renews_at         timestamptz;
revoke update (stripe_customer_id, stripe_subscription_id, plan_status, plan_renews_at)
  on public.profiles from anon, authenticated;
create unique index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- ── export grants (v85) — server-side entitlement for paid artifacts ──
-- Every Pro export is issued by /api/export after it reads plan_id from
-- THIS table's owner row (never from the client). Each issue is logged:
-- the log powers a quiet rate limit that makes scripted mass-harvesting
-- and wholesale account-sharing impractical, and gives each customer an
-- honest record of what their account produced. Rows are insertable only
-- by the service role (the function); owners may read their own.
create table if not exists public.export_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists export_events_user_time_idx
  on public.export_events (user_id, created_at desc);
alter table public.export_events enable row level security;

drop policy if exists "export_events_select_own" on public.export_events;
create policy "export_events_select_own" on public.export_events
  for select using (user_id = auth.uid());
-- no insert/update/delete policy: only the service-role function writes here
