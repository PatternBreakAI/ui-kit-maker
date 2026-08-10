# Splash Text — blueprint authoring guide (for the outside reviewer)

2026-08-10. How to write ADDITIONAL treatment grammars, composition
directions, and art-direction specs that the Lettering Director can
execute directly. Write against the schemas below and Claude will
implement verbatim; anything outside the executable vocabulary gets
negotiated, not silently approximated.

## The mental model

```
TREATMENT GRAMMAR  — a style's structural taste: weighted moves,
                     lens weights, casing, spacing posture
COMPOSITION        — a constrained lane inside a grammar
DIRECTION            (six ship today; you may propose more)
BLUEPRINT          — one realized structural sketch: per-glyph plans,
                     line relationships, op record. Generated, never
                     hand-written per phrase.
```

You author **grammars and directions** (reusable taste), plus
optional **per-piece overrides** (owner-style selections). You never
author per-phrase geometry — no branch may key on a literal string.

## Hard rules the engine enforces (spec inside these or it rejects)

1. **Art-direct the font; do not redraw it.** No new letterform
   contours, no bowl/stem/terminal reshaping, no synthetic bridges.
   Union real ink only.
2. **No generated ornament LINES** (owner rule): no underlines,
   swash tails, lead-ins in automatic results. Plaques/bursts/rays
   live in the Scene stack, not the lettering.
3. **Determinism.** Same (text, grammar, seed) → same result. No
   "randomly vary" language — say *seeded* variation with ranges.
4. **Gates that will kill a candidate** (write ranges inside them):
   per-glyph rotation ≤ 20°; scale X/Y within 0.62–1.7; warp
   strength |k| ≤ 0.34; interlock tuck ≤ 62% of line height; no
   original counter may close or fall under ~55% of its size; no
   undeclared collisions beyond the neutral typeset's own contact.
5. **Legibility beats novelty.** The judge is calibrated so that
   restrained, expert treatment outranks visible manipulation
   (CHAMPIONSHIP c2 is the canonical positive example).

## Executable move vocabulary (all of it, nothing else)

- line breaks: `few` / `many` / `one-word-per-line` (≤3 lines)
- casing: `title` / `upper` / `preserve`
- Force to Column (exact legacy rule) on/off
- warps (glyph-rigid, counters never bend):
  `arch(k)` · `flag(k)` · `bulge(k)` · `stagger(k)` — |k| ≤ 0.34
- rhythm: `bounce(amp em)` (needs ≥3 glyphs) · `tilt(amp °)` · none
- proportion: `condense(k)` · `initial(k)` · `final(k)` · none
- join: `overlap-chain` (measured penetration, fraction of stroke
  width ≤ 0.65, welded downstream) · none
- alternates: `sprinkle(p)` from salt/ssXX/swsh · `final-forms`
  (fina) · none — designed substitutions only, never invented
- optical spacing: always on (measured from outlines)
- interlock: on/off + tuck target (em) — solved from actual ink
  profiles, never a blind squeeze
- weld: grammar-level `weldInk` (script) or via overlap-chain

## TreatmentGrammar schema (write this)

```
id: kebab-case, e.g. "candy-marshmallow"
archetype: script | chunky | poster
fontFamily: a Google Fonts face (Claude verifies compatibility with
  the measured fontCompatibility score before adopting)
casePolicy: title | upper | preserve
tracking: em (0.0–0.05)      lineHeight: em (0.85–1.2)
weldInk: boolean             overlapDepth: 0.2–0.65 (of stroke width)
tuckTarget: em (0.03–0.08)
lensWeights: {signPainter, typeDesigner, graffitiWriter,
  posterIllustrator} summing to 1.0 — graffiti ≤ 0.05 unless the
  style is expressly street/graffiti/comic-impact
moves: for each axis above, 2–4 weighted options:
  { id, weight, one-line description, parameters }
```

Worked example — the shipped script grammar, abridged:

```
id: candy-script · archetype: script · font: Pacifico
casePolicy: title · tracking 0.004 · lineHeight 0.92 · weldInk true
overlapDepth 0.45 · tuckTarget 0.035
lensWeights: SP .4 / TD .3 / GW .05 / PI .25
moves:
  lines: stack(3) "one word per line" · few(1)
  warp: none(3) · arch 0.07 (1.5) "gentle crown" · flag −0.06 (1)
  rhythm: none(4) · tilt 2.2°(1) "hand sway"
  proportion: none(2.5) · initial ×1.22 (2) · final ×1.18 (1)
  alternates: final-forms(2.5) · sprinkle 0.5 (1.5) · none(1.5)
  interlock: on(3) · off(1)
```

## Composition directions (you may propose more lanes)

Shipping: clean-typographic · compact-lockup · rhythmic-display ·
column · overlap-interlock · marquee. A new direction = a name + one
sentence of intent + which axes it constrains and to what. It must be
expressible in the move vocabulary above.

## Appearance kit per grammar (safe to author freely)

Keyed by grammar id, never by phrase: palette roles, bevelWidth
(authored px, ~2–4.5) + profile rounded|hard, stacked fills (2–6
stops, linear/radial/banded, angle, hardness), pattern
(dots/halftone/stripes/checker/grain + mask light-side/shadow-side/
bevel), gloss layers (band/broken, position, width, hardness,
seeded fragments), sparkles, scene (none/stage/burst). SVG 1.1 only:
no blend modes, no filters beyond soft blur.

## Per-piece art-direction overrides (owner voice)

```
phrase: "…" → selected: <candidate id or direction>
rationale: one sentence
```
Stored as authoritative data on the piece; the council stays advisory.

## What to send back

1. Grammar spec(s) in the exact schema above, in a fenced block.
2. Optional new direction definitions.
3. Optional appearance kit per grammar.
4. Three test phrases per grammar (short / medium / long) — Claude
   runs the six-direction sheet and returns renders for your review.

What NOT to send: per-phrase geometry, glyph redraw requests,
ornament lines, blend-mode-dependent effects, non-deterministic
language ("randomly", "organic variation" without seed + range).
