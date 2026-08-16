-- 0094 · Durable backdrops — the bg-assets bucket + quota-gated uploads.
--
-- "when I or a user uploads an image we need to know it's gonna be there
-- when we return" (owner, 2026-08-16). Uploaded board backdrops used to
-- live only in the uploading browser's IndexedDB vault; this bucket is
-- their cloud home. Objects are content-addressed per user
-- (<uid>/<sha-256 prefix>), so re-importing the same file stores nothing
-- twice and the same key resolves on any browser the owner signs into.
--
-- WRITES GO THROUGH /api/assets ONLY. There is deliberately NO insert
-- policy for authenticated: a client with insert rights could mint its
-- own signed upload URLs and skip the tier quota (free 50 MB, paid
-- 1 GB), so the broker (service role) is the one door in. Reads and
-- deletes stay client-direct in the owner's folder, mirroring the
-- avatars / student-ids buckets. The bucket's own file_size_limit is
-- the backstop that keeps a lying `size` in the grant request from
-- mattering by more than one file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('bg-assets', 'bg-assets', false, 8388608,
          array['image/png','image/jpeg','image/webp','image/gif','image/avif'])
  on conflict (id) do update
    set file_size_limit   = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bg_assets_read_own" on storage.objects;
create policy "bg_assets_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'bg-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "bg_assets_delete_own" on storage.objects;
create policy "bg_assets_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bg-assets' and (storage.foldername(name))[1] = auth.uid()::text);
