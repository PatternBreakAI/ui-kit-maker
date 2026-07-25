# The migration ledger

Production schema drifted three versions behind once (v85–v87 sat
unapplied), and the old single `migrations-pending.sql` file silently
dropped v85 when it was rewritten. This directory exists so that class of
miss cannot happen again.

## The rules

1. **One file per schema version, numbered** (`0085_…` matches the `v85`
   blocks in `schema.sql`). Filename order IS application order.
2. **Append-only.** A file is NEVER edited after it has been applied
   anywhere. New work — even a one-line fix to an earlier migration —
   gets the next number.
3. **Idempotent.** Every file uses `if not exists` / `drop policy if
   exists`, so re-running one is safe and changes nothing the second
   time. When in doubt, run from the earliest file you're unsure about.
4. `supabase/schema.sql` stays the assembled source of truth for reading;
   this directory is the **application ledger** — the thing you actually
   paste into the Supabase SQL editor, one file per paste.

## Status (2026-07-25)

| File | What | Prod |
|---|---|---|
| 0085 billing + export grants | Stripe columns, export_events | applied (billing live) |
| 0086 student verification | table + private bucket | applied |
| 0087 scheduled pack release | presets.publish_at + policy | applied |
| 0088 mailing list mirror | service-role-only table | applied |
| 0089 community foundations | handles, likes, listed, avatars | **outstanding — run me** (the old pending file carried v89 only as a NOTE, so "ran the file" never ran v89; discovered 2026-07-25 when the community seed hit `column "listed" does not exist`) |
| 0090 admin audit | the plan desk's paper trail | applied 2026-07-25 |

After running a file, update its row here in the same commit that ships
the code depending on it. Anything earlier than v85 predates the ledger
and lives only in `schema.sql`; a fresh environment runs `schema.sql`
whole instead of replaying this directory.
