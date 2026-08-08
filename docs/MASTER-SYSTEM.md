# The PatternBreak Stack — master system doc & working policy (DRAFT v1)

Owner-commissioned 2026-08-08 ("I want a Master system doc/policy that
allows me to spin up the basic functions we need for the vector stuff
we're doing without REDEVELOPING existing technology"). This document is
**binding on every Claude session working on any PatternBreak app**, in
every lane. Read it before building anything. It is a draft until the
owner blesses it; the rules in §3 restate agreements already in force.

## 1. What we are building

A suite of creative tools that are different doors into ONE deterministic
vector engine:

| App | Status | The slice it exposes |
| --- | --- | --- |
| **UI Kit Maker** (uikitmaker.com) | live | the whole kit: components, states, exports, Unity bridge |
| **Splash Text / Type Maker** | lab (`?lab=typemaker`, PR #236) | the type layer + 3D pose, Google fonts |
| candidates (owner picks) | idea | Stream Kit Maker (overlays/alerts/badges) · Emblem Maker (crests, logos, app icons) · Thumbnail Text (consumer wedge of Splash) · card-frame/token maker · sticker/emote packs |

Same engine, same accounts, one Pro subscription across the suite.

## 2. The stack — four layers

The framework already exists; it's the boundaries that are new. Every
piece of code belongs to exactly one layer. When you're unsure where
something goes, ask "who else will need this?" — if the answer is "any
app," it is not app code.

### L1 · The Engine (the crown jewels)
Deterministic core: recipe in → art out. No React, no accounts, no DOM
beyond canvas/SVG rasterization.
- Today: `src/generator/model.ts` (config + types), `bevel.ts`
  (renderer), `silhouettes.ts`, `exportUtils.ts`, `engineExport.ts`,
  pattern/type-effect machinery, `src/splash/outline.ts` + `look.ts`
  (post-#236).
- Rules: pure and deterministic (no `Date.now`/`Math.random` in render
  paths); new capability **defaults off** — absent config = byte-identical
  output for every existing document; new dependencies (e.g. opentype.js)
  are flagged in the PR body as an engine-dependency change.

### L2 · The Bench (the instruments)
The editing controls both apps already share: `Slider`, `Well` + the
palette pill, `FxToggle`, `FontPicker`, `AngleDial`, sections/folds,
panel search, first-visit hints.
- Today: `src/ui/controls.tsx` (extracted on the Splash branch — the
  Bench being born) + the shared patterns still living in `Panel.tsx`.

### L3 · The Desk (the business)
Accounts, Stripe/entitlements (`capsOf`, `guardedExport`), cloud
projects/presets, community/gallery, release desk, admin.
- One Desk for the whole suite. No app ever rebuilds a webhook, a quota,
  or a preset store.

### L4 · The Apps (thin shells)
Each app chooses what to expose and how it reads. App code is routing,
layout, copy, and which Engine/Bench/Desk pieces it mounts — nothing
more.

### L1½ · The Bridge (optional, per app)
The Unity export machinery — Smart Zip, importer C#, prefab wiring, the
README deck — is its own module riding beside the Engine, mounted ONLY
by apps that target engines (owner, 2026-08-08: "Splash Text doesn't
need any of the Unity export stuff"). Splash ships SVG/PNG only. When
the packages are carved (§6 Phase 2), the Bridge splits out first —
it's megabytes of embedded C# no other app should ever bundle.

## 3. Prime directives (all sessions, all apps)

1. **Search before you build.** Anything vector, type, export, control,
   or entitlement shaped: grep the Engine/Bench/Desk first. If it exists,
   extend it in place. If it half-exists, extend it in place. Forking a
   copy into your app is the one unforgivable move — it's how we got two
   shine engines in one week.
2. **Extend without breaking: default-off + byte-identical.** Existing
   documents must render pixel-identically after your change unless the
   change is the point and the owner asked for it.
3. **Ship dark, bless per app.** New shared capability lands behind flags
   or unused config. A change to a shared layer gets checked on the
   preview of EVERY app it can touch, and the owner blesses once per
   change, seeing all affected previews.
4. **Lanes + common ground.** Each app is a session lane. L1–L3 are
   common ground: touching them requires a PR-body callout naming the
   other apps affected, and cross-session questions go in `docs/` briefs
   (the INK-SHINE-BRIEF / SPLASH-UIKM-COORDINATION pattern — it works).
5. **Shared API registry (§4): shout before reshaping.** Renaming,
   re-signaturing, or moving anything in the registry requires a `docs/`
   note + PR callout BEFORE the change ships, so dependent apps rebase
   calmly instead of breaking loudly.
6. **Engine craft rules** (hard-won, don't relearn):
   - SVG filters: bounded `userSpaceOnUse` regions sized from the
     content — never unbounded (Safari).
   - Never dilate letterforms with `feMorphology` for a wrap/outline
     (box kernel squares corners); stroke the outline path with round
     joins. Morphology sweeps are fine for extrusion walls.
   - Post-#236: every text-layer emission in `bevel.ts` goes through the
     `fxText`/`TP2` branch, or path mode silently loses that layer.
   - No preset ever pairs star glints with ink shine (owner rule).
7. **Verify on the real thing.** Headless proofs run the actual app and
   the actual export, and read the actual bytes back. Claims without a
   probe are hopes.

## 4. Shared API registry — v1 (frozen 2026-08-08)

Consumed across app boundaries today. Treat as public API per §3.5:

- `@/generator/store`: `hydrate`, `fileToBgDataUrl`
- `@/generator/model`: `CANVAS_BGS`, `GAME_FONTS`, `registerCustomFont`
- `@/generator/exportUtils`: `inlineKitFace`, `downloadSvg`, `downloadPng`
- `src/ui/controls.tsx` (post-#236): `Slider`, `FontPicker` (+ whatever
  else it exports — the module is Bench, all of it is API)
- Desk surfaces: `capsOf(tier)`, `guardedExport`, the cloud preset
  API — stable; additions expected (see §5), reshapes need callouts.

Additions to this list: append here in the same PR that starts importing.

## 5. Cross-app plumbing decisions (direction, owner-blessable)

- **Export entitlements:** each app gets its own `ExportKind` (next:
  `splash`) rather than reusing `svg` — separate gate, quota bucket, and
  analytics lever per product. Lab surfaces may stay ungated; wiring
  `guardedExport` is a release gate, not a lab gate.
- **Cloud presets:** ONE preset system for the suite. Preset records gain
  a `kind` discriminator (`kit` = today's implicit default, `splash-*`
  next). The release desk filters by kind. No parallel preset stores,
  ever.
- **Golden renders (to build in Phase 2):** a fixed set of recipes
  rendered and pixel-hashed in CI. Engine PRs show a diff of exactly
  which goldens changed; "no goldens changed" is the proof an engine
  change is safe for every app at once. Determinism makes this cheap —
  use it.

## 6. Getting there — extraction phases (no release-train stop)

- **Phase 0 (now):** this doc + the API registry. Sessions comply
  immediately.
- **Phase 1:** land PR #236; Splash lives as an app surface in this repo
  (it already is — `?lab=typemaker`). Fold its `docs/` coordination
  answers into practice.
- **Phase 2:** carve **L1 Engine** into a package (`packages/engine`) —
  it is nearly pure already (every headless probe proves it). Build the
  golden-render harness as part of the move; the goldens ARE the proof
  the extraction changed nothing.
- **Phase 3:** carve **L2 Bench** (seed: `controls.tsx`).
- **Phase 4:** carve **L3 Desk**. Apps become `apps/uikitmaker`,
  `apps/splash`, each its own Vercel project + preview, one repo.
- Each phase is ordinary PR flow: previews for every app, owner bless,
  squash, reset.

## 7. Decision log

- 2026-08-08 · Shine merge order **resolved (option a, by events)**:
  `app-tweaks` shine merged to main in #237 (`f1674c2`, live). Splash
  rebases, keeps its superset engine block + main's panel wiring.
- 2026-08-08 · API registry v1 frozen (§4).
- 2026-08-08 · Direction set: per-app ExportKind; single preset system
  with `kind`. Preset PLUMBING is shared; preset STYLES never travel
  between apps (owner: each app keeps its own voice).
- 2026-08-08 · Unity Bridge declared an optional per-app module (L1½) —
  Splash never bundles it.
- 2026-08-08 · Owner note for the backlog: "randomize all produces
  really unpleasing results... maybe we can develop some aesthetic
  guardrails over time." Direction sketch lives in the task backlog —
  harmony-derived palettes, one-statement-per-roll co-constraints, and a
  legibility floor with internal re-rolls.

## 8. Open questions for the owner

1. Bless the four-layer monorepo direction (§2, §6)?
2. Does the suite/framework get a name? (It deserves one — a named thing
   is a thing sessions can point at: "does this belong in the Engine?")
3. Which candidate app (§1) is next, if any — that choice shapes what
   Phase 2 extracts first.
