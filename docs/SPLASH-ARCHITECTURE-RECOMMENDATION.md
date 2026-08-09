# Splash Text — architectural recommendation

2026-08-09. Requested before further production code, with permission to
replace rather than accommodate. Written candidly: the codebase is
treated as a research prototype with reusable discoveries, not a legacy
product to protect. The quality bar assessed against: a user picks a
preset and immediately gets a professionally art-directed treatment
comparable to the reference board; fine controls then customize without
destroying it.

## The headline recommendation

**Partial replacement — a new, purpose-built Splash Lettering Engine
whose organs are the proven experimental modules, and the retirement of
Splash's dependency on the kit engine.** Not a refactor (the current
production path cannot express the target), and not a from-scratch
rewrite (roughly 70% of the code that actually matters for the target —
geometry, IR, compiler — already exists in the experimental modules the
research rounds produced). The research prototypes ARE the first modules
of the new engine.

## 1. What survives (keep / refactor)

| System | Verdict | Why |
|---|---|---|
| `outline.ts` — layout, per-glyph pipeline, envelope/poster-fit/groove, per-glyph+line identity, font loading with variable-weight axes | **KEEP** (refactor: line-first output as the native shape) | This is the typeset+deform core of any version of this product. Hardest-won code we have; every experiment built on it without strain. |
| `appearance.ts` — the Appearance Stack IR + pass-major compositor + scopes | **KEEP / GROW** | The validated render model (the POP test). Grows into the full IR: gradient/pattern paints, material ops, glyph scope. |
| `treatment.ts` — Treatment Compiler: semantic roles, width matching + constraints, authored rhythm, calm-down variants, ornament | **KEEP / GROW** | The validated product model (the three-treatment sheets). Becomes the real TreatmentRecipe schema. |
| `extrude.ts` — true vector walls, orientation tones | **KEEP** | One depth STYLE among several (strata are the default; walls serve styles that want physical coherence). Pure geometry, no entanglement. |
| `fonts.ts` curation, shelf, real caps | **KEEP** | Presets own their faces — already the model. |
| Page chrome — sash tray, canvas floater/zoom/stage, click-a-letter selection, undo | **KEEP** | Interaction shell is sound and owner-approved; only the control CONTENT changes. |
| Shared Desk/Bench — export utils, entitlements path, Slider/FxToggle/Well/AngleDial/FontPicker, pattern cell library (`textPatternCell`), color helpers | **KEEP** | This is the "same tools" mandate honored at the right level: fonts, geometry, export, UI primitives — not the button renderer. |
| Filter recipes proven in the kit engine — ink shine, chamfer bevel, rim/specular constructions | **KEEP as PORTED ops** | They are self-contained SVG filter strings. They move into the new engine as material ops; they do not keep living inside `build()`. |

## 2. What is obstructing the target (replace / remove — for Splash)

| System | Verdict | Why it obstructs |
|---|---|---|
| Splash rendering through the kit engine (`build()` / `renderTypeSpecimen` / `buildSplashCfg` / `GenConfig`) | **REMOVE from the Splash path** | Two translation layers (SplashLook → GenConfig → engine) eat every new concept; the type effects are filter blocks bolted mid-way into a 7,000-line button renderer's closure; global pass-major ordering and per-role construction are structurally inexpressible there. This is the root of "sophisticated features, wrong kind of image." The kit engine itself is untouched — it is UIKM's, it ships kit labels, and its shine/dim/contours remain for kits. |
| `SplashLook` — the flat bag of ~40 effect knobs | **REPLACE** | Controls-first, not workflow-first: it can only describe surface settings, never a construction grammar. It is the data-model mirror of the sterile output. |
| Styles as slider snapshots (localStorage bags) | **REPLACE** | A style must be a treatment (recipe + overrides + seed + compiled snapshot), or presets can never encode hierarchy, casing, roles, or scenes. Lab-only feature, days old — no migration debt. |
| Three overlapping depth mechanisms (morphology sweep, trueWall, strata) | **CONSOLIDATE** | Strata (default) + true walls (a style) survive as IR ops; the morphology sweep retires from Splash (it remains in the kit engine for kit labels). |
| The current control panel as the user model | **REPLACE** | The panel should be derived from the designer workflow (SHAPE / FACE / EDGES / DEPTH / PRINT / LIGHT + preset-first entry), compiling to recipe fields — not one toggle per engine feature. |

## 3. The ideal architecture (greenfield, references as target)

One new bounded module — the **Splash Lettering Engine** (`src/lettering/`),
pure functions, deterministic, no DOM, same code in-app/headless/export:

```
TEXT
 → INTERPRET   semantic roles (connective-language weighting, candidate
               scoring, manual override), responsive variants
 → TYPESET     per-role: font, case-as-transform, tracking, authored
               rhythm profiles (+ ≤15% seeded variance) → per-glyph geometry
 → COMPOSE     width matching + constraints, gap/tuck, optical centering
 → DEFORM      arch/bulge/shear/taper/flag — per role or whole, authored
 → CONSTRUCT   the IR: ordered ops in semantic passes, scoped
               composition|role|glyph —
               offset · strata(repeat) · trueWalls · fill(Gradient|Pattern)
               · inline · bevel · shine · specular · rim · contact · castShadow
 → MATERIALIZE MaterialRecipe × LightRig resolve op parameters
               (one light rig drives every directional op)
 → SCENE       far background · behind-lettering ornament · foreground
               accents, derived from composition bounds + palette tokens
 → EMIT        pass-major SVG; letteringOnly/fullTreatment; silhouette
               and grayscale modes; bounded filters (Safari discipline)
```

Product model: `TreatmentRecipe` (per the reviewer's schema — textPlan,
fontPlan, composition, rhythm, deformation, appearance, material, light,
scene, variants, constraints) compiled by one shared machine. Controls
are macros over recipe fields. Storage: `recipeId + recipeVersion +
compilerVersion + text + roles + overrides + seed + compiled snapshot`;
old saves never silently change.

## 4. Refactor, partial replacement, or clean rebuild?

**Partial replacement.** Verdict per layer: the *pipeline shape* is new
(clean build of `src/lettering/` around the stages above); the *organs*
are lifted proven code (outline/appearance/treatment/extrude, filter
recipes, pattern cells, Bench/Desk). A full rewrite would re-derive
months of hard-won geometry lessons for no gain; a refactor of the
current production path would keep pouring effort into the two
translation layers and the button-renderer host that caused the problem.
The honest cost: Splash's current production render path and state model
are discarded. The honest savings: nothing else is.

## 5. Smallest visual proof

**One preset, end-to-end through the new pipeline, three strings.**
Comic Pop compiled by `src/lettering/` — semantic hierarchy, pass-major
construction, one MaterialRecipe under one LightRig, one scene family
(burst + halftone rays) — rendered for `POW!`, `FUN SPONGE`, and
`THE UNSTOPPABLES`, next to (a) the reference tile and (b) today's
production Splash output, plus silhouette and grayscale strips. That
exercises every stage boundary once, without first building 8 materials
and 6 scene families. The four-sheet art-direction study then becomes
round two ON the validated foundation instead of a study bolted to the
old one.

## 6. Migration without backward-compatibility compromise

- **Parallel lab surface**: the new engine mounts at `?lab=splash2`.
  Current Splash keeps working untouched during the build — zero
  pressure to bridge schemas, no compat shims in the new code.
- **No schema bridges**: old slider-bag styles do not import. The
  current four starters are re-authored as treatments (~20 lines each;
  Good Day's sticker look becomes a treatment with a composition-scoped
  wrap — a better version of itself).
- **Kit engine untouched**: UIKM's shine/contours/dim stay theirs; a
  coordination note tells the app session Splash stops consuming the
  type path so future kit-engine changes need no TP2 discipline for our
  sake (their own outline mode remains their call).
- **Cut-over**: when the new surface covers the current starters and
  the owner blesses it side-by-side, `?lab=splash` points at the new
  engine and the old page + `SplashLook` are deleted — no long
  dual-maintenance period.
- **Master doc**: MASTER-SYSTEM gains a second L1 engine (lettering)
  beside the shell engine, both sharing Bench and Desk.

## Phased plan

- **Phase 1 — engine core + smallest proof**: `src/lettering/` pipeline
  shell; move/port the four experimental modules; one material, one
  light rig, one scene family; the Comic Pop proof sheet. (This is the
  next coding round.)
- **Phase 2 — the art-direction study on the new foundation**: Gradient
  IR, PatternSpec with light-driven masks, the 8 materials, remaining
  scene families, Creative Director scoring gate, the four sheets.
- **Phase 3 — product surface**: `?lab=splash2` UI — preset-first entry,
  workflow-derived sections (SHAPE/FACE/EDGES/DEPTH/PRINT/LIGHT),
  role-aware controls, treatment-based styles with snapshot storage.
- **Phase 4 — cut-over**: parity with current starters, owner blessing,
  old path removed, UIKM/master-doc coordination.

## Bottom line

The research already found the right machine — semantic hierarchy into
authored typography into graphic strata under one light. What obstructs
it is precisely the part of the system that was built for a different
product: the kit-engine detour and the knob-bag state model. Replace
those two things, keep every discovery, and the quality bar is
reachable by default rather than by heroics.
