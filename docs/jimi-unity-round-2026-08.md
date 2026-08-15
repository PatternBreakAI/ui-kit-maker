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
