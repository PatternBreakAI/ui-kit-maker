-- 0095 · The Unity test kit's shelf — a private one-object bucket.
--
-- Gate Round (owner mandate, 2026-08-17): generated exports are paid;
-- what a free account gets is ONE canned, admin-blessed stock Unity kit
-- zip — the same fixed artifact for everyone, never their own design —
-- to prove the import pipeline before paying. This bucket holds that
-- blessed zip at test-kit/unity-test-kit.zip.
--
-- NO POLICIES, ON PURPOSE. Nobody reads or writes this bucket directly:
-- · downloads go through /api/test-kit, which verifies the caller is a
--   signed-in user and mints a short-lived signed URL (the download is
--   the register incentive — guests get the sign-up pitch instead);
-- · the swap goes through /api/admin (testKitUpload), which re-verifies
--   is_admin from the database and mints a signed upload URL, so the
--   owner replaces the blessed zip from the #/admin desk with no code
--   change and no redeploy.
-- Both brokers hold the service role; a bucket with no policy has no
-- other door. The admin upload path also creates this bucket lazily if
-- this migration hasn't run yet — this file is the ledger's record and
-- the fresh-environment path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('test-kit', 'test-kit', false, 104857600,
          array['application/zip','application/x-zip-compressed','application/octet-stream'])
  on conflict (id) do update
    set file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
