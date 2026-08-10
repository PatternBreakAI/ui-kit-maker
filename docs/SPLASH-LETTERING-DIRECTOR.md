# Splash Text — the Lettering Director (sketch phase)

2026-08-09. Adopted from outside review, before any editor UI work.
Gate for the Splash 2 build: **the selected black silhouettes must read
as designed, not merely typeset and treated.**

## The principle

A font is source material, not immutable final geometry. Real lettering
artists sketch structure first — in black, with no material — and only
then ink and paint. The engine mirrors that:

```
text + treatment grammar + seed
→ LetteringDirector.generateBlueprints()      (8–12 candidates)
→ four art-direction lenses score + gate      (recorded scorecards)
→ selected LetteringBlueprint
→ ink topology (weld) → appearance → material → finish → scene
```

Candidates are cheap, geometry-only, **black silhouettes** — material
never participates in choosing structure. Everything is deterministic
from `(text, grammar, seed)`.

## LetteringBlueprint IR

A blueprint records intent, not just outlines: per-glyph plans
(source glyph, OpenType alternate, proportion, rotation, baseline
shift, spacing, overlap join), line relationships (interlock offsets,
column fit, warp), ornaments (swash tails, underline returns), a
silhouette intent, and the **op record** — every modification with its
measured parameters and rationale, which feeds the difference view.

## OpenType before procedure

Fonts are inspected for real designed substitutions before any
procedural modification (`otfeatures.ts`). Inventory of the study
faces (2026-08-09):

| face | usable substitutions |
| --- | --- |
| Pacifico | `aalt` `salt` `ss01` `ss02` **`fina` (final forms)** `liga` `dlig` `calt` — 1420 pairs |
| Baloo 2 | `salt` `ss01` `ss02` `liga` — 85 pairs |
| Bangers | `aalt` `case` only — procedural construction carries the grammar |
| Lilita One | no GSUB |

Priority: designed alternate first (`salt`/`ssXX`/`fina`/`swsh`), then
controlled procedural ops, always with fallback to the original glyph.

## Construction ops (`ops.ts`)

Every op is measured from actual outline geometry and falls back to
the untouched glyph when its gate fails:

- **Optical pair spacing** — per-pair gap profiles sampled across the
  shared vertical band; advances corrected toward the measured median.
- **Per-glyph proportion** — baseline-anchored scale with counter
  protection (no counter may fall under the minimum aperture).
- **Contextual overlap** — neighbor penetration measured on outlines,
  targeted as a fraction of measured stroke width, welded downstream.
- **Terminal actions** — swash tails / lead-ins / underline returns
  built as tapered bands from a detected terminal anchor; collision-
  gated, shortened before abandoned.
- **Zone warps** — arch / flag / bulge / stagger as glyph-rigid moves
  (rotate + translate + scale whole glyphs), so counters are never
  distorted.
- **Line interlock** — bottom/top ink profiles of adjacent lines
  sampled per column; the tuck is solved from the actual negative
  space, never a naive vertical squeeze.

## Four lenses (`lenses.ts`)

Deterministic scorers with **hard rejection gates**, weighted per
treatment grammar; every candidate keeps its scorecard:

- **Sign Painter** — confident silhouette, rhythm, swash payoff.
- **Type Designer** — spacing evenness, counter health, proportion.
- **Graffiti Writer** — interlock tightness, overlap nerve, coverage.
- **Poster Illustrator** — block mass, aspect, one-shape readability.

Gates (any failure rejects): closed counters, undeclared collisions,
excess distortion, and the self-critique gate — a candidate whose ops
amount to font/scale/tracking/tilt only is rejected as "typeset, not
designed".

## Canonical study

Grammars are reusable (`candyScript`, `candyChunky`, `candyPoster`);
no branch anywhere keys on a literal phrase. Canonical phrases:
SWEET DREAMS (script), BUBBLE (chunky), STAY WILD & FREE (poster);
generalization: NIGHT MARKET (script), GO (chunky), CHAMPIONSHIP
(poster). Deliverable per phrase: neutral typeset · twelve candidate
thumbnails · top three with scorecards · selected in black · plain
outlines · Candy appearance · difference view explaining every
modification.

The production editor stays parked until the study's silhouettes pass
the designed-not-typeset gate.

## Study outcome — round 1 (2026-08-10)

A live four-lens council + adversarial gatekeeper reviewed the actual
rendered sheets. Their findings forced six engine fixes, the largest
being **nonzero-winding weld fill** (Baloo-class fonts build letters
from overlapping pieces; even-odd parity punched white plugs through
every stem/bowl joint) and the **per-aperture weld gate** (each
original counter tracked through the pair-weld by centroid; newly
trapped negative space is a feature, crushed original apertures are
damage).

Final adversarial gate: **SWEET DREAMS passes** (nested lines, weight
rebuilt, underline swash grown from the final s terminal); NIGHT
MARKET passed two of three gate rounds; BUBBLE / STAY WILD & FREE /
GO / CHAMPIONSHIP fail with recorded reasons. The verdict trail says
the script grammar has crossed the designed-not-typeset line and the
chunky/poster grammars still express through arrangement. Round 2:
sculpted weld transitions (fillets), chunky bowl-rhythm construction,
tapered poster columns with per-letter width fitting, ampersand as
connector, and swash apparatus that carries the letters' own stroke
weight at every scale.
