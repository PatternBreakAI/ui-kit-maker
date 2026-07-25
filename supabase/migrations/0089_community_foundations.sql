-- Migration 0089 — community foundations (v89)
-- Extracted verbatim from supabase/schema.sql (the assembled source of truth).
-- Idempotent: safe to re-run. APPEND-ONLY: never edit this file after it has
-- been applied anywhere — new work gets the next number.

-- ── community foundations (v89) ──────────────────────────────────────
-- Owner decisions 2026-07-25: launch WITH community; only Pro keeps kits
-- private (students public); gallery is curated; likes, no comments.

-- profiles grow a public face. The billing columns move to the same
-- column-revoke armor is_admin uses, which also fixes a latent bug: the
-- old update policy pinned plan_id='free' in WITH CHECK, so PAID users
-- could not update their own profile row at all.
alter table public.profiles add column if not exists handle text unique
  check (handle is null or handle ~ '^[a-z0-9_]{3,20}$');
alter table public.profiles add column if not exists avatar_path text;
revoke update (plan_id, plan_status, stripe_customer_id, stripe_subscription_id, plan_renews_at, email, created_at)
  on public.profiles from anon, authenticated;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- the community's read window on profiles: ONLY the public face. A view
-- owned by postgres bypasses profiles' select-own RLS by design and
-- exposes exactly these columns, nothing else.
create or replace view public.public_profiles as
  select id, handle, display_name, avatar_path from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- projects: `listed` = curated onto the community page. is_public remains
-- "has a share link"; listed is the admin's front-page pick.
alter table public.projects add column if not exists listed boolean not null default false;

-- PUBLIC BY DEFAULT, ENFORCED: only Pro (or admin) may hold a PRIVATE
-- project. Everyone else's inserts and updates must carry is_public=true.
-- The consent moment lives in the save UI; this is the lock behind it.
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert with check (
    user_id = auth.uid()
    and (is_public or exists (select 1 from public.profiles p
          where p.id = auth.uid() and (p.plan_id = 'pro' or p.is_admin)))
  );
drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (is_public or exists (select 1 from public.profiles p
          where p.id = auth.uid() and (p.plan_id = 'pro' or p.is_admin)))
  );
-- owners must not curate themselves: `listed` flips only by admin
revoke update (listed) on public.projects from anon, authenticated;
drop policy if exists "projects_admin_curate" on public.projects;
create policy "projects_admin_curate" on public.projects
  for update using (exists (select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin));
grant update (listed) on public.projects to authenticated;  -- policy still gates WHO

-- likes: one per account per project, no comments by design.
create table if not exists public.likes (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.likes enable row level security;
drop policy if exists "likes_read_all" on public.likes;
create policy "likes_read_all" on public.likes for select using (true);
drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own" on public.likes
  for insert with check (user_id = auth.uid());
drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own" on public.likes
  for delete using (user_id = auth.uid());

-- avatars: a PUBLIC bucket (they render on community cards), owner-writable
-- in their own folder, size discipline enforced client-side.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
drop policy if exists "avatars_write_own" on storage.objects;
create policy "avatars_write_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
