-- ── v91 — Release desk: frozen kit snapshots + designations ──────────
-- The owner's pipeline for turning a user's kit into product: find it by
-- name on #/admin, preview it, and designate it hero / standard / upcoming.
--
-- THE SNAPSHOT IS THE POINT. A designation copies the kit's ENTIRE doc
-- (design, per-component work, labels, backdrop) into this table at
-- agreement time. The maker can change or delete their original later —
-- the frozen copy and the deal note survive, which is what makes a
-- profit-share handshake safe to honour months later.
--
-- PRIVACY. deal_note holds business terms and snapshot holds unreleased
-- work, so this table is readable by ADMINS ONLY — there is deliberately
-- no public/user policy. Writes come exclusively from api/admin.ts with
-- the service role (which bypasses RLS); no client write policy exists.
--
-- Shipping still happens through public.presets (created by the desk with
-- the same click): 'standard' inserts a live preset row, 'upcoming' one
-- with a future publish_at (invisible to non-admins until the date, per
-- the v-presets read policy). 'hero' stores intent + snapshot only — the
-- homepage lineup is wired separately.

create table if not exists public.kit_designations (
  id                uuid primary key default gen_random_uuid(),
  kit_name          text not null,
  preset_name       text not null,
  placement         text not null check (placement in ('hero', 'standard', 'upcoming')),
  preset_id         uuid references public.presets (id) on delete set null,
  source_project_id uuid,
  source_user_id    uuid references auth.users (id) on delete set null,
  source_email      text,          -- denormalised: the deal contact survives account deletion
  deal_note         text,
  snapshot          jsonb not null,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.kit_designations enable row level security;

drop policy if exists "designations_admin_read" on public.kit_designations;
create policy "designations_admin_read" on public.kit_designations for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- verify: expect this table listed with rowsecurity = true
select relname, relrowsecurity from pg_class
 where relname = 'kit_designations' and relnamespace = 'public'::regnamespace;
