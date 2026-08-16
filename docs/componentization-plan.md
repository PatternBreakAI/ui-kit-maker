# Componentization — design + build plan (2026-08-15)

Owner mandate, priority raised: duplicate a component inside the kit ("edit
the main button and ONLY the main button"), later "Make component" from
boards saving into the actual kit, forced name + classification at creation.
Root pain: the flame button's one-off needs restyled the whole kit by hand;
the back-button debacle.

## Model (decided, survey-verified 3-agent sweep wf_eab1954f-972)

- `kitClones: Record<ClonePieceId, { base, name, kind, createdAt }>` in the
  store. Clone ids: `copy-<mint4>-<base>` — colon-free (the `${id}:${size}`
  nudge keys parse with split(":")), tilde-free (Board variant suffix),
  zip/CSS-safe. Mint is fixed-width so `baseOf()` slices, no registry needed.
- Clone ids stay OUT of the KitComponentId union: renderKit/LiveArt refuse
  them at compile time, forcing hosts through `baseOf()` (model.ts).
- Every per-piece map gains clone-keyed entries (all accept unknown string
  keys at runtime — survey confirmed). Duplicate seeds by deep-copying the
  source's entries (fork stays master-relative — migrateKitDesigns contract).
- `CLONE_INELIGIBLE`: datarow + panel (content lives in kitRow/kitKind
  singletons, would be shared). groupOf(clone)=null and PARENT_ELIGIBLE
  exclusion are deliberate: clones are never swept by family/group edits.
- Classification list `CLONE_KINDS`: Action / Navigation / HUD / Reward /
  Decor / Other — files the kit-page chapter, later names Unity folders.

## Persistence — every explicit list needs kitClones (survey)

DONE in slice 1a: KIT_STORE_KEY (`ui-generator-kitclones` → cloud WS sync is
automatic, prefix-keyed), WS_MAPS (registry + entries atomic through looks/
starters/presets), HIST_KEYS + HistSnap (undo), boot loadJson, kitPayload,
loadKitPayload (read list AND !viewer saveJson block), setKitSizeAll
(iterates KIT_COMPONENTS only — must add clone ids).
STILL TODO: TopBar settings export list (~TopBar.tsx:254), api/admin.ts
KIT_LAYER (~:523, Release Desk designate). Known pre-existing hole to NOT
copy: kitSlices is missing from kitPayload/loadKitPayload/TopBar/KIT_LAYER.

## UI sweep (slice 1b) — two classes of call site

DATA reads (13 per-piece maps): stay clone-keyed, work untouched.
IDENTITY reads: resolve via `baseOf(focus)` — KIT_SLOTS (Panel:1653+),
KIT_LESSONS (486/1653), KIT_LABEL_EDITABLE + labelMaxOf (910/1743/2248),
KIT_SLICEABLE gates (1044/1653/1688 + SliceStage/sliceProbe),
EDGE_SHINE_DEAF (1256), iconSwappable/iconTogglable arrays (904-909),
VALUE_DRIVEN (1676), subEditable (912), KIT_SHAPE fallback (1479+ nine
sites), bar dock gate (1825), datarow/endturn compares (2208/2340),
staged/GUEST gates (KitPage useStagedHidden 530, Board rail kitVisible 679).
Name display: clone's own name (KIT_COMPONENTS.find misses → shows raw id
today at ~13 Panel sites; bare `?.name` renders "undefined" at
Panel 1758/1819/2251/2262/2350/2611, CanvasView 214/223).
CanvasView hero: renderKit(baseOf(focus), …) + LiveArt kit.id = base
(LiveArt id drives ALL interactivity — confirmed 148/171-195/205).
addToLibrary from a focused clone must bake base id + clone name (2766,
LibKit.id typed KitComponentId, libThumb + Board 710/925 render by it).

Duplicate UX: scope-bar verb row (Panel:1140-1175) + NameAction pattern
(Panel:499-550, `withDate` variant = precedent for a second mandatory
field → classification select; commit disabled until both filled).

## KitPage (slice 1c)

Catalog is hardcoded JSX. v1: ONE dynamic chapter "Your components" —
mirror the staging-bay Sec (n="00", 2190-2251, renders a dynamic id list
through Piece). Group by kind. CHAPTERS tab appears only when clones
exist. usePiece: kit.id = base for LiveArt, name from registry, all map
reads clone-keyed. Search index + per-piece export buttons follow.

## Board (slice 1c)

Rail: dynamic "Your components" group mirroring the Saved-components block
(Board.tsx:920-937); thumb = renderKit(base, clone context); hay = name +
kind + base terms. BoardItem.kitId widened to KitPieceId (store.ts:590),
svgOf (696-711) resolves via base. "Make component" (slice 3) = sibling of
saveBoardItemAsAsset (1393), re-pointing the board item at the new clone.

## Unity export (slice 1d then phase 2 — survey: exporter agent)

v1 board-scenes-only, ZERO C# changes: in collectExportBoards resolve
clone→base at the top of the item loop (:432-441, 546, 551, 628, 692),
emit component = PREFAB_FAMILY[base], and FORCE the posed bake for clone
items (bypass the 8% divergence gate at :550) so the clone's own design,
state skins and label seat always travel as posed pixels. Honest limits:
live-label size / state ink / StateFx / aura read the BASE family rows.
Phase 2 (real clone families, NINE bases only): generalize NINE loop +
per-family manifest rows (stateFx/labelSizes/labelStates/idleForks/
GLOW_FAMS/userSliceByFam) + importer DefaultLabel/labeled-set → manifest
fields. Exclude composed rigs/props/tiled faces until asked.
Also noted pre-existing: kitTextOy/Ox never reach engineExport at all.

## Slices

1a store foundation (this commit) → 1b Panel/CanvasView sweep + Duplicate
verb → 1c KitPage chapter + Board rail → 1d export resolution → preview to
owner → slice 2 clone families → slice 3 Make-component from boards.
