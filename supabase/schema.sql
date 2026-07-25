-- UI Generator — cloud accounts & saved work (Phase 1 of the commercial
-- architecture; see docs/commercial-architecture.md).
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run: everything is IF NOT EXISTS / OR REPLACE.
--
-- Principles (business plan §10–11, Appendix A):
--   * The server is the authority: row-level security on every table.
--   * Collect the minimum: email + saved work + consent records. No card
--     data ever touches this database (Stripe stays system of record later).
--   * Private by default: projects only become public by explicit opt-in.
--   * Schema now, UI later: plans and organizations exist as boundaries so
--     entitlements and studio seats never force a rewrite.

create extension if not exists pgcrypto;

-- ── profiles ─────────────────────────────────────────────────────────
-- One row per auth user. plan_id is a *pointer*, not an entitlement check;
-- server-side entitlement resolution arrives with the Stripe phase.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  plan_id     text not null default 'free',
  created_at  timestamptz not null default now()
);

-- ── plans (capability catalog — data, not code) ──────────────────────
create table if not exists public.plans (
  id           text primary key,
  name         text not null,
  capabilities jsonb not null default '{}'::jsonb
);

insert into public.plans (id, name, capabilities) values
  ('free', 'Free Explorer', '{"editor.use": true, "cloud.save": true}'),
  ('founding-individual', 'Founding Individual', '{"editor.use": true, "cloud.save": true, "export.full": true}'),
  ('student', 'Student', '{"editor.use": true, "cloud.save": true, "export.full": true}')
on conflict (id) do nothing;

-- ── workspaces (the cloud save) ──────────────────────────────────────
-- One document per user: the app's entire ui-generator-* keyspace as JSON.
-- `previous` keeps one server-side revision as an undo safety net.
create table if not exists public.workspaces (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  doc        jsonb not null default '{}'::jsonb,
  previous   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.workspace_snapshot()
returns trigger language plpgsql as $$
begin
  if new.doc is distinct from old.doc then
    new.previous := old.doc;
    new.updated_at := now();
  else
    new.previous := old.previous;
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists workspaces_snapshot on public.workspaces;
create trigger workspaces_snapshot
  before update on public.workspaces
  for each row execute function public.workspace_snapshot();

-- ── projects (named saves; groundwork for the opt-in showcase) ───────
-- Private by default. A project only becomes visible to others when its
-- owner explicitly sets is_public — plan §9 phase 1.
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  doc        jsonb not null default '{}'::jsonb,
  is_public  boolean not null default false,
  share_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── terms_acceptances (legal consent records — plan §10/§11) ─────────
create table if not exists public.terms_acceptances (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  version     text not null,
  locale      text,
  age_13_plus boolean not null default true,
  accepted_at timestamptz not null default now()
);

-- ── organizations (reserved — plan §11 "schema now, UI later") ───────
-- No policies on purpose: deny-all until studio/classroom plans ship.
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create table if not exists public.organization_members (
  org_id  uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role    text not null default 'member',
  primary key (org_id, user_id)
);

-- ── auto-create a profile on signup ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── row-level security ───────────────────────────────────────────────
alter table public.profiles             enable row level security;
alter table public.plans                enable row level security;
alter table public.workspaces           enable row level security;
alter table public.projects             enable row level security;
alter table public.terms_acceptances    enable row level security;
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;

-- profiles: you can see and edit only yourself (plan_id changes are server
-- business — blocked by column check until the entitlement phase).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and plan_id = 'free');

-- plans: a public read-only catalog.
drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all" on public.plans
  for select using (true);

-- workspaces: strictly your own document.
drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own" on public.workspaces
  for select using (user_id = auth.uid());
drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own" on public.workspaces
  for insert with check (user_id = auth.uid());
drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own" on public.workspaces
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "workspaces_delete_own" on public.workspaces;
create policy "workspaces_delete_own" on public.workspaces
  for delete using (user_id = auth.uid());

-- projects: owners have full control; the world sees only what was
-- explicitly published.
drop policy if exists "projects_select_own_or_public" on public.projects;
create policy "projects_select_own_or_public" on public.projects
  for select using (user_id = auth.uid() or is_public);
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert with check (user_id = auth.uid());
drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete using (user_id = auth.uid());

-- terms_acceptances: append-only, yours.
drop policy if exists "terms_insert_own" on public.terms_acceptances;
create policy "terms_insert_own" on public.terms_acceptances
  for insert with check (user_id = auth.uid());
drop policy if exists "terms_select_own" on public.terms_acceptances;
create policy "terms_select_own" on public.terms_acceptances
  for select using (user_id = auth.uid());

-- organizations / organization_members: RLS enabled, zero policies —
-- intentionally inaccessible until the studio phase designs access.

-- ── admin flag + shared presets (admin-curated style library) ────────
-- is_admin gates who may publish shared presets. It is set OUT OF BAND
-- (SQL / dashboard) — a column-level revoke below makes it impossible for a
-- client to grant itself admin, even though it may edit its own profile row.
alter table public.profiles add column if not exists is_admin boolean not null default false;
revoke update (is_admin) on public.profiles from anon, authenticated;

-- Shared presets: everyone reads them (they appear in the Presets panel for
-- every user, signed in or not); only admins may write. The payload is a full
-- GenConfig (same shape a local user preset stores), plus a thumbnail.
create table if not exists public.presets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  cfg        jsonb not null,
  thumb      text,
  sort       int not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.presets enable row level security;

drop policy if exists "presets_read_all" on public.presets;
create policy "presets_read_all" on public.presets for select using (true);

-- writes require the caller's profile to be flagged admin
drop policy if exists "presets_admin_insert" on public.presets;
create policy "presets_admin_insert" on public.presets for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
drop policy if exists "presets_admin_update" on public.presets;
create policy "presets_admin_update" on public.presets for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
drop policy if exists "presets_admin_delete" on public.presets;
create policy "presets_admin_delete" on public.presets for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- App settings: world-readable, admin-writable key/value store for the few
-- pieces of app curation that must apply to every visitor — first use is
-- `hidden_starter_presets`, the list of starter-preset ids an admin retired.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

drop policy if exists "app_settings_read_all" on public.app_settings;
create policy "app_settings_read_all" on public.app_settings for select using (true);

drop policy if exists "app_settings_admin_insert" on public.app_settings;
create policy "app_settings_admin_insert" on public.app_settings for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
drop policy if exists "app_settings_admin_update" on public.app_settings;
create policy "app_settings_admin_update" on public.app_settings for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
drop policy if exists "app_settings_admin_delete" on public.app_settings;
create policy "app_settings_admin_delete" on public.app_settings for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Make yourself an admin (run once, AFTER that account has signed up so its
-- profile row exists):
--   update public.profiles set is_admin = true where email = 'chevon@me.com';

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
