-- ── v92 — Release desk refresh: remember the studio-preset source ────
-- The desk's Refresh action re-freezes a designation from the maker's
-- CURRENT version (owner-approved update: nothing reaches the homepage
-- or the Presets panel without the click). Kit-sourced designations
-- already carry source_project_id; studio-preset-sourced ones need the
-- preset's local id to find it again in the maker's synced studio.
alter table public.kit_designations add column if not exists source_up_id text;

-- verify: expect source_up_id listed
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'kit_designations'
 order by ordinal_position;
