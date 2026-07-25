-- Migration 0087 — scheduled pack release (v87)
-- Extracted verbatim from supabase/schema.sql (the assembled source of truth).
-- Idempotent: safe to re-run. APPEND-ONLY: never edit this file after it has
-- been applied anywhere — new work gets the next number.

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
