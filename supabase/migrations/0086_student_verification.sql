-- Migration 0086 — student verification (v86)
-- Extracted verbatim from supabase/schema.sql (the assembled source of truth).
-- Idempotent: safe to re-run. APPEND-ONLY: never edit this file after it has
-- been applied anywhere — new work gets the next number.

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
