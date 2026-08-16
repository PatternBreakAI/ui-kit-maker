# Durable assets — phase-2 scope (banked 2026-08-16)

Phase 1 shipped (v94): uploads content-hashed to `asset://<sha-256:40>`,
mirrored to the private `bg-assets` bucket via /api/assets (quota: free
50 MB, paid 1 GB), the IndexedDB vault demoted to a cache, refs in cloud
project docs when verified up, pixels embedded everywhere else. Verified
against a stubbed Supabase (`scratchpad/serve-dist.mjs` + probe 23/23);
real-project behavior gated on migration 0094.

What phase 1 deliberately did NOT do — each is real scope, none blocks
the owner mandate:

- **Cloud GC / manage storage.** Nothing ever deletes a bucket object:
  a saved project doc may still name a hash the workspace dropped, so
  deletion needs a sweep that reads every doc owned by the account (ws
  boards + all project docs) and removes only unreferenced hashes. Until
  then quota only grows — 50 MB ≈ 25–50 backdrops, so pressure arrives
  late, but a "Storage" card on the Account page (list, preview, delete
  with a references check) is the honest next step. The delete RLS
  policy already exists client-side.
- **Backfill on sign-in.** Legacy vault entries (`bg…` ids) and guest
  imports never upload retroactively; only imports made while signed in
  do. A one-time "protect the backdrops already on this browser" pass —
  rehash local originals, re-key boards to refs, grant+upload each —
  turns every existing board durable. Needs the GC story first or it
  fills quotas with orphans.
- **Project versions.** The workspaces table keeps exactly one
  `previous` snapshot; projects keep none. With backdrops out of the doc
  (refs), project docs are kilobytes again — cheap to version. A
  `project_revisions` table (project_id, doc, created_at, keep last N)
  + a "Restore version…" row in ProjectsPanel is now affordable
  precisely because of phase 1; content-addressed assets mean old
  revisions resolve their backdrops for free.
- **Known accepted races** (documented in api/assets.ts): two parallel
  grants can both pass, and a client can lie about `size` — both bounded
  to one file by the bucket's 8 MB `file_size_limit`; the next grant
  re-sums truth. Tighten only if abuse appears (a `storage_usage`
  counter table with an atomic RPC would close it).
- **Videos.** Only the captured poster is durable; the mp4 itself stays
  session-only (a blob: upload dies with the tab, as before). If video
  durability is ever wanted, the same hash+grant path works but the
  quota math changes shape (tens of MB per file).
