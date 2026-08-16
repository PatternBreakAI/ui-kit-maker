# Spotlight — promo areas, decisions + phase-2 bank (2026-08-16)

Owner mandate: "promo areas like adobe — promote a how-to, whenever I push a
new public kit or a new tool is introduced… make it pro and clean like adobe."
P1 shipped on `claude/app-tweaks` (survey wf 2-agent, spec followed).

## Shipped (P1) — where things live

- Data: ONE app_settings key `promos` — ordered array, order = priority
  (the landing_kit_order discipline), world-readable / admin-writable, zero
  migration. Card: { id (dismissal key), kind kit|tool|howto, kicker, title,
  body (one line), ctaRoute ("#/…" or "editor:<sectionId>"), ctaLabel, cfg
  (engine recipe → art), artRef (asset://), publishAt, newUntil, active }.
  Second key `promos_live` = the global gate the owner flips; Spotlight ships
  admin-only (standing staged rule). Reads carry the listComponentReleases
  null-vs-empty contract: a flaked read NEVER blanks live promos
  (cloud.ts listPromos/readPromosLive; store keeps prev on null).
- Surfaces: kit-page shelf under ChapterTabs (max 3 live cards, cg-card
  frame/fill r16/15, engine art ≥150px zone, expiring NEW badge, ONE quiet
  CTA, per-card dismissal → `ui-generator-promo-seen` rides workspace sync,
  seen = de-emphasized not gone); Looks rack NEW tile (first live kind:kit
  card, one presetcard seat, pinned, no dismissal — applies the matching
  shared preset through the rack's tier gate, else routes).
- Governance (Tutor house culture): every card has a real destination, no
  modals, nothing blocks input, nothing animates unbidden (SMIL parked via
  stillSmil + kit-shine CSS paused until card hover).
- Admin: Spotlight desk on #/admin — lineup previewed by the SAME
  PromoCardView the kit page renders, CRUD (id survives edits), arrow+drag
  reorder, optimistic whole-array writes with rollback, honest freshness
  copy (Supabase-direct, no CDN). Release Desk designate flow gained
  "Promote on Spotlight": public designations auto-mint from the
  PUBLIC-SAFE subset (presetName + snapshot cfg; deal notes/emails stay in
  admin-only kit_designations), fresh-read before write so a mint can't
  clobber a concurrent desk edit.
- Verification: probes in scratchpad/flame/ (probe-spotlight-shelf.mjs,
  probe-spotlight-tile.mjs, probe-spotlight-admin.mjs + mock-spotlight.mjs)
  against the built app on :5301 with stubbed Supabase reads; screenshots
  spotlight-*.png. All green at ship time.

## Phase 2 — banked, in rough priority order

- PUBLIC ART BUCKET for artRef: resolveBgAsset reads `<uid>/<hash>` from the
  private bg-assets bucket, so an asset:// promo art paints only for the
  admin who owns the bytes — every other visitor falls back to the kind
  plate (the desk says so in place). Needs a world-readable promo-art
  bucket or a signed public feed; until then recipe art (cfg) is the real
  path and works for everyone.
- Landing-page promo surface: the homepage is the Front Door lane and has
  no Supabase client — promos would have to travel like the hero lineup
  does (/api/hero-lineup pattern, ~5-min CDN). Cross-lane handoff required.
- cfg payload trim on mint: a kit whose type.customFonts embeds font data
  rides that data into world-readable `promos`. Same class as shared_presets
  today (precedent), but promos load for EVERY visitor — mint should strip
  or cap custom-font payloads and warn on oversized recipes.
- Dismissal management: a "restore dismissed" control (promoSeen is add-only
  today), pruning seen ids whose cards retired, and a note that the seen
  list rides whole-doc last-write-wins sync (two devices dismissing
  different cards in the same beat can drop one).
- Date semantics: publishAt/newUntil are stored as YYYY-MM-DD → UTC
  midnight. Fine for a one-admin shop; if scheduling gets serious, move to
  explicit instants and end-of-day newUntil in the owner's timezone.
- editor:<section>:<anchor> deep links (smartHelp's anchor mechanism) so a
  how-to card can land on a control block, not just a section head.
- Card analytics: impressions + CTA clicks (Vercel events), so "rotating
  the lineup" has numbers behind it. No fabricated anything, ever.
- Looks tile try-on: offer "apply this recipe once" straight from the
  promo cfg (today the tile applies the matching shared preset or routes).
- Auto-retire: cards older than N days park themselves inactive so the
  shelf never goes stale if the desk is unattended.
- Release-notes tie-in stays manual by mandate: notes update only on the
  owner's blessing, batch by batch — Spotlight never writes them.
