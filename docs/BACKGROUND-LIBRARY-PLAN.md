# Background Library — hosting + picker plan

*Plan of record for the 82-image "Game Background Library" drop
(bg-drop-1, 2026-08-11). Owner asked: "just plan it."*

## What we have

82 PNGs — 64 landscape at exactly 1920×1080 (the Board's native 16:9
stage), 18 portrait at 1080×1920 — organized across 8 genre folders,
with a rich catalog (title, category, game types, environment, mood,
style, dominant color + hex, palette) in CSV/JSON **and** embedded in
every PNG. QC sheet: 82/82 clean, 19 UI-cleaned. Total ~165MB — too
heavy to bundle in the deploy, exactly right for object storage.

## Recommendation: Supabase Storage (not Vercel Blob)

One console instead of two. The site already runs Supabase (auth, kits,
admin desk); a public storage bucket is drag-and-drop in the same
dashboard the owner already uses for SQL, serves through Supabase's CDN
with stable URLs (`…/storage/v1/object/public/backgrounds/<file>`),
sends permissive CORS (canvas exports keep working), and the free tier
(1GB storage / ~2GB egress·mo) holds the whole library several times
over — especially after the WebP pass below. Vercel Blob would work,
but adds a second storage product, token plumbing, and nothing the
bucket doesn't already give us.

*Note: this dev sandbox can't reach `*.supabase.co` (network policy),
so final verification happens on the preview URL in a real browser —
same as the SQL rounds.*

## Architecture: thumbs local, pixels remote, metadata in the engine

1. **Thumbnails ship with the app.** I generate 320px WebP thumbs
   (~20KB each, ~2MB for all 82) into `public/bg-thumbs/`. Browsing the
   library costs nothing and works instantly — no bucket round-trips
   while you shop.
2. **Full-res lives in the bucket.** Recommend a one-time re-encode to
   WebP q90 (visually lossless for painted backdrops): ~400KB each,
   ~35MB total, 5-6× faster applies and 5-6× less egress than raw PNG.
   (Keeping the original PNGs as-is also works — 165MB, still fine.)
   I prepare the exact upload folder; the owner drags it into the
   bucket in the dashboard.
3. **The catalog becomes engine data.** Their JSON, trimmed to what the
   picker needs (title, file, category, tags from game-types +
   environment + mood + style, palette, orientation), generates
   `src/generator/backdropLibrary.ts`. The full original catalog is
   archived under `docs/` for provenance.
4. **Boards store a URL, never pixels.** Applying a library backdrop
   sets `bgImage` to the bucket URL — a short string, so the document
   stays skinny (no vault entry needed; the vault remains for user
   uploads). Undo, cloud sync and history stay feather-weight.

## The picker: search-first, like the asset drawer

Extends the Board's Background panel (bundled scenes + video loops stay):

- **Search field** over the catalog haystack — "cozy kitchen", "snowy",
  "battle", "neon" — same synonym-forward philosophy as asset search.
- **Filter chips**: category (8 genres), orientation auto-biased to the
  active board's aspect (16:9 boards lead with landscape, mobile boards
  with portrait), plus dominant-color dots.
- **Thumb grid** of the local WebPs with the title on hover; click
  applies the bucket URL. 82 tiles needs no virtualization.
- The darkroom (hue/sat/bright/contrast/noise) and overlays work on
  library backdrops exactly as they do on uploads.

## Exports

- **Board PNG export**: draws the full-res from the bucket with
  anonymous CORS (Supabase public objects allow it) — already how
  bundled backdrops composite.
- **Boards→Scenes (Unity)**: `collectExportBoards` gains an `https://`
  fetch branch beside the existing bundled-path branch, so library
  backdrops bake into scenes with the darkroom applied, same as vault
  originals. Ships on the existing Pro gate.

## Gating & provenance

Per the standing rule, the library lands **admin-only** first (a flag
in the picker), released to everyone when the owner says so. The
catalog + QC sheet are archived in `docs/background-library/` as the
provenance record; no third-party license strings appear in the
metadata (owner-supplied art).

## Split

**Owner (5 minutes, dashboard only):**
1. Supabase dashboard → Storage → New bucket → name `backgrounds`,
   check **Public** → create.
2. Drag the prepared upload folder in (I'll hand it over the same
   GitHub-release route, going the other direction).
3. Paste the bucket's public URL base into chat (it's public by
   design — not a secret).

**Me (buildable now, before the bucket exists):**
1. Generate thumbs + the WebP upload folder + `backdropLibrary.ts`
   from the catalog.
2. Build the search picker behind the admin flag, wired to a base-URL
   constant.
3. Extend the Unity exporter's fetch branch.
4. Flip the constant when the URL arrives; verify on preview at
   extremes (heaviest image, mobile boards, darkroom baked exports).

## Numbers

| Piece | Where | Size |
|---|---|---|
| 82 thumbs (320px WebP) | repo / deploy | ~2MB |
| Catalog module | repo | ~60KB |
| Full-res WebP q90 | Supabase bucket | ~35MB |
| (alt: original PNGs) | Supabase bucket | ~165MB |
| Supabase free tier | — | 1GB storage / ~2GB egress·mo |
