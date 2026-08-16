# Unity round for Jimi — August 2026 batch

Hey Jimi — big export round just went live on uikitmaker.com. Everything
below is in any fresh engine export from today forward (the importer
announces its build stamp in the Console — make sure you're on a zip
downloaded after this note). Your field notes stayed on the desk the whole
time: the glow is still a runtime sibling that never touches layout, and
nothing replaceable got baked back into pixels.

## What changed

**1. Prefabs now look like the app. Full stop.**
Family sprites bake at the exact proportions the app draws, with the stock
words in place during the bake — so the geometry you get IS the geometry
the maker saw, not a stretched approximation. Drag a prefab in and it
should match the app render at natural size with no rejiggering.

**2. Labels land at the app's exact size and seat.**
The export now carries the app's true rendered font size and label position
per family (including shapes that deliberately cheat their type off-center
— the flame button's whole left side is fire, so its words sit right of
center on purpose). The old "type is a little off / a little small"
correction rounds are over. Labels are still live text — retype freely;
size and seat scale with the rect.

**3. Board copies of dramatic shapes ship posed.**
A copy whose proportions diverge from the family sprite ships as an engine
render at that exact pose: extrusion and flame tails uncropped, hover /
pressed / disabled baked as matching skins wired into the Button's Sprite
Swap, label re-seated per copy, press sink intact. The root keeps the
shell-sized rect for layout and raycasts; the art lives on a "Posed art"
child. Play mode no longer swallows these (the shine mask bug is dead),
and video backdrops arrive with a poster frame instead of a gray rect.

**4. Words typed on boards arrive in scenes.**
Per-copy labels (PLAY vs BOOST vs STORE on three copies of one button) are
exported per item and imposed over the prefab default. If you ever see a
scene word revert, that's a bug — flag it.

**5. Idle motion, opt-in.**
Kits can ship a wipe shine (face sweep) and an edge shine (spark running
the silhouette). Both arrive as removable components (WipeShine /
EdgeShine) only when the kit turned them on. Note one designed divergence:
nine-sliced families skip EdgeShine in Unity — a stretched nine-slice no
longer matches the authored outline — while the app still plays it there.

**6. Claims celebrate.**
ClaimBurst (the gift-box white-flash + themed particle throw) now attaches
to any prefab or scene copy whose visible words say CLAIM, with the
piece's own glow sprite as the spark. It's also in the Add Component menu
("UI Kit Maker/Claim Burst") if you want it on something else by hand.
Heads up: this trigger is moving to an explicit per-piece switch in the
app next round (word matching doesn't localize) — treat the word-based
wiring as interim.

## What to hammer on

- The flame-family kit: prefab vs scene vs app, at natural size AND
  stretched wide. Labels: size, seat, and the deliberate right-cheat.
- Posed copies: hover/press skins swap, click sinks, nothing vanishes in
  Play, specular doesn't double up.
- Per-copy words on a board with three differently-labeled copies of one
  family.
- Shines on and off, per piece — including a nine-sliced family (expect
  no EdgeShine there, by design).
- A CLAIM-labeled button: burst on click, inks look like the kit.
- Extremes as always: max extrusion, longest labels, widest fonts.

Anything that smells wrong, field-note it the usual way — the notes drive
the next round.

## As-built addendum — the season track goes live (2026-08-16)

The SeasonTrack prefab stopped being a picture. The old build was one
baked sheet with TMP overlays floating over it — empty wells, node
numbers that went stale when you edited them, a naked progress rect,
and a SendMessage warning from OnValidate.

Now the kit ships the track as PARTS (`assets/seasontrack/`): the bare
board (sliced), one reward-well tile per lane flavor (free, and the
gold-trimmed premium), spine nodes lit and unlit, and the rail. The
rebuilt `PatternBreakSeasonTrack` builds one live cell per tier from
them:

- **Inspector dials:** `tierCount` (1–50), `firstLevel`, `currentTier`
  (last tier reached, 1-based) + `tierProgress` (the run toward the
  next node), per-tier `rewardIconsFree/Premium` sprite mounts and
  `claimedFree/Premium` flags, lane words, colors, the TMP face.
- **From code:** `SetProgress(tier, toNext)`,
  `SetClaimed(tier, premium, claimed)`, `SetIcon(tier, premium, s)`.
- Locked tiers dim; claimed wells tint and wear the kit's check glyph;
  reached nodes swap to the lit sprite; progress is the kit's own
  progress-bar fill seated on the rail between node 1 and node N.
- Cell geometry comes from the app's own drawing — the manifest's
  `seasonTrack` block maps the drawn spine/lanes into the prefab, so
  cells land exactly on the art.
- Everything the rig creates lives under the `Track (auto)` child and
  prunes itself when the tier count shrinks — no more orphan numbers.
- The OnValidate warning is dead (rebuilds defer one editor tick).

Old projects: the maintenance pass re-rigs an existing SeasonTrack
prefab on the next import (bare board in, live cells on top) and the
Console says so. The flat `seasontrack-base.png` still ships for older
scenes. Boards→scenes are untouched — a posed track still bakes as
posed art, and a prefab-placed track strikes the board's progress.

Honest gaps: no scrolling — past ~10 tiers you want the board wider
(it's sliced; stretch it) or your own ScrollRect around the prefab;
there's no claimed-well ART variant (claimed = tint + check, the app
doesn't draw one either); reward icons are empty mounts until you drop
sprites in.
