-- ═══════════════════════════════════════════════════════════════════
-- UI Kit Maker — outstanding migrations, 2026-07-25
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Every statement is idempotent (if not exists / drop policy if exists),
-- so re-running it is safe and changes nothing the second time.
--
-- Extracted verbatim from supabase/schema.sql, which stays the source of
-- truth. Two things are in here:
--   1. student verification  — the table + private bucket the student
--                              rate depends on. Until this exists,
--                              api/checkout cannot find an approved row
--                              and every buyer silently gets the Pro
--                              price.
--   2. scheduled pack release — presets.publish_at + the narrowed read
--                              policy, so a dated pack stays hidden
--                              until its day.
-- ═══════════════════════════════════════════════════════════════════


-- ── student verification (v86) ───────────────────────────────────────
-- The student rate is granted by a HUMAN, not a regex. A domain check
-- would lock out most of the world (.ac.uk, .edu.au, and the many
-- universities on plain national domains) while still being trivial to
-- fake, so an owner files a request with an ID and a reviewer decides.
--
-- `status` is server-truth exactly like plan_id: an owner may insert a
-- PENDING row and read their own, and nothing more. Only the service role
-- (the reviewer) can approve, and only an approved row lets /api/checkout
-- reach for the student price — the browser never picks its own price.
--
-- PRIVACY: id_path points at a private bucket and the object is DELETED
-- when the decision is made. The row keeps the decision, the school
-- address and the dates. We do not keep the document.
create table if not exists public.student_verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  school_email text not null,
  id_path      text,                    -- nulled once the file is deleted
  status       text not null default 'pending',
  note         text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index if not exists student_verifications_user_idx
  on public.student_verifications (user_id, created_at desc);
alter table public.student_verifications enable row level security;

drop policy if exists "student_select_own" on public.student_verifications;
create policy "student_select_own" on public.student_verifications
  for select using (user_id = auth.uid());

-- an owner may file a request for THEMSELVES, and only as pending
drop policy if exists "student_insert_own" on public.student_verifications;
create policy "student_insert_own" on public.student_verifications
  for insert with check (user_id = auth.uid() and status = 'pending');
-- no update/delete policy: only the reviewer (service role) decides

-- Storage: run once in the dashboard, or here if the storage schema is
-- reachable. The bucket must be PRIVATE — these are identity documents.
insert into storage.buckets (id, name, public)
  values ('student-ids', 'student-ids', false)
  on conflict (id) do nothing;

-- owners may upload into their own folder; nobody may read but the
-- service role (the reviewer). Path convention: <uid>/id-<ts>.<ext>
drop policy if exists "student_ids_insert_own" on storage.objects;
create policy "student_ids_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-ids' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "student_ids_delete_own" on storage.objects;
create policy "student_ids_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-ids' and (storage.foldername(name))[1] = auth.uid()::text);


-- ── 2. scheduled pack release (v87) ──────────────────────────────────
-- Publishing used to be immediate, which meant loading a backlog SPENT
-- it. publish_at holds a pack until its day.
--   null   = live (everything published before this column existed)
--   past   = live
--   future = held, and invisible to everyone but an admin
alter table public.presets add column if not exists publish_at timestamptz;

-- THE FILTER LIVES HERE, NOT IN THE CLIENT. The anon key ships in the
-- browser, so a UI-only filter would leave the whole unreleased backlog
-- readable to any signed-in user querying the table directly.
drop policy if exists "presets_read_all" on public.presets;
drop policy if exists "presets_read_released" on public.presets;
create policy "presets_read_released" on public.presets for select
  using (
    publish_at is null
    or publish_at <= now()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );


-- ── 3. community foundations (v89) — run when ready to build community ─
-- Copy the "community foundations (v89)" section from schema.sql verbatim;
-- it is idempotent like everything else here. It adds handle/avatar to
-- profiles (and fixes the update policy that locked PAID users out of
-- editing their own profile row), the public_profiles view, projects.listed
-- + the public-by-default enforcement, the likes table, and the public
-- avatars bucket.

-- ── verify ───────────────────────────────────────────────────────────
-- Expect: publish_at present, and the two student objects listed.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'presets' and column_name = 'publish_at';

select table_name from information_schema.tables
 where table_schema = 'public' and table_name = 'student_verifications';

select id, public from storage.buckets where id = 'student-ids';
