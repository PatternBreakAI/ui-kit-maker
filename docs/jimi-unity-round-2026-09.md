# Unity round for Jimi — September 2026 batch

Hey Jimi — your week-of-9/7 notes are in, every item read against the
build, and the answers are on the way to uikitmaker.com. This note
covers what changed, what was already fixed before you wrote, and the
two things that need a hand from you. Re-export from a zip downloaded
after this lands (the importer prints its build stamp in the Console).

## Already fixed when you wrote

**Hot Rod, no flame edge in the generator preview.** That was a lost
imported silhouette, not the exporter. The silhouette now travels with
the design, heals itself from a saved look, and survives account sync;
it went live 9/14. The two Primary buttons in that look wore a second
lost outline, and the app now shows a "Restore lost silhouette" row for
exactly that. Chevon is restoring it; your next Hot Rod export draws
the flames on every piece.

## What changed

**1. The Prefabs folder reads like the Playground.**
One folder per chapter — Buttons, Choice Controls, Sliders and Progress,
Navigation and Chrome, HUD and Data, Gauges, Game Systems, RPG and MMO,
Shooter and Action, Casual and Saga, Strategy and Social, Rewards — plus
Glyphs, Art and Labels. Every flavor sits beside its family under a
plain name: `GlyphButton_Coin`, `SlotButton_Gem`, `ButtonPrimary_BOOST`,
`DataRow_TiledFace`. No more dashes and spaces. Your existing project
converts on the next import: files are renamed and moved in place with
their GUIDs intact, so every scene reference follows. Move prefabs
wherever you like after that; the importer finds them by name and never
re-shelves what you moved.

**2. The Playground is the index.**
Every piece now carries a small caption with its folder and prefab name,
so "what is this called" is answered on the shelf. Pieces are placed by
their true visual footprint, which ends the fire button chambers over
the music row and the equip selector's name over its neighbors. Chapter
heads wear the kit's own face, and a scrollbar on the right says the
shelf scrolls. The music slider's readout follows the slider now.

**3. The catalog image is gone from the zip.**
You read it right: the Playground is the reference. The packed sheet
had also grown past what Unity will open (the "could not be read"
error). It stays as the sprite-sheet download on the kit page, in pages
Unity opens fine, with variants sitting beside their base.

**4. Card face: the component is on the prefab now.**
You were right that KitCardFace was nowhere. The runtime shipped, the
README promised it, and no prefab carried it. The Cardface prefab now
wears Kit Card Face with its parts bound (picture, corner plates, name,
corner numbers), so `SetCard(def)` works out of the box. To add it to a
card of your own: Add Component > UI Kit Maker > Kit Card Face (the
file is Runtime/PatternBreakCardFace.cs, which is why a search for
KitCardFace found nothing). The empty "Words / Row 1" you noticed is
swept; it was the shell left behind after the corner numbers moved onto
their badges.

**5. Settings row: the bare plate you asked for.**
The slider well is its own child now, behind the mercury, instead of
paint on the plate. Delete the Well child and you have the plain
background shape. Same rule as everything else in the kit: frames
separate from what they hold.

**6. Content SDF artefacts.**
The generated faces build with explicit sampling, padding and atlas
size, so Hot Rod-style outlines and shadows stop bleeding between
neighboring glyphs.

**7. The MoveCounter / Movecounter warning.**
Two builders wrote prefabs whose names differed only by case; Windows
treats them as one file. The redundant picture twin is retired, your
project drops it on import, and the universal Movecounter (live seats)
seeds in HUD and Data.

**8. The package audit warning, 29 times.**
It flagged a file the Package Manager itself rewrites in the package
cache. That file is ignored now, the audit warns once per package per
session, and the wording no longer claims certainty it doesn't have.

**9. Responsive Check scene.**
It sized itself to your first board, so a phone kit blew the two live
pieces up to giants and pushed the hint off the frame. The pieces scale
with the reference frame now and the hint reads on two lines.

**10. docs plus Documentation.**
One folder. The README figures moved into Documentation/.

**11. Hot Rod's "misbehaving ghosts".**
Not the silhouette. Hot Rod's layered type (outline, glow, shadow) put
the word in the manifest once per layer, so the label read "GHOST GHOST
GHOST GHOST" and stacked four high. Fixed at the source; any look with
layered type had it on the ghost, badge and level-node pieces.

**12. Oversized glyphs (and the giant check).**
Same cause for both: the stock glyph buttons that aren't customised
ship as thin variants of the slot button, and the plain white glyph was
sized to the seat measured from the kit's own rendered glyph, halo
included. Hot Rod's icon glow made that box far larger than the glyph.
The manifest now carries the glyph's ink box beside the reach box, and
the thin road sizes to the ink. The check tile was the `Check` glyph
button, not the checkbox.

**13. The download notice about Audiowide.**
Audiowide ships one weight, so "couldn't be downloaded just now, re-
export" was the wrong message. It now says the family has no Bold cut
and that nothing will change on re-export. Pick a family with a Bold cut
if the weight matters.

## Two things that need you

- **Re-import both kits** from fresh zips downloaded after this lands.
  The Console will report the renames and the shelving.
- **Selective export by genre** and **prefab browsing beyond the
  Playground index** are on Chevon's list as product decisions, not
  bugs. Keep pushing on them in your notes; the folder shape you saw in
  the store's top casual kit is what steered this round.

## What to hammer on

- The Playground: nothing overlapping, every caption naming a real file,
  the scrollbar, the music slider's number following the knob.
- Card face in a scene: `SetCard`, then a hit and a buff on the corner
  numbers.
- Settings row: delete the Well child and confirm a bare plate.
- Hot Rod: labels single, glyph buttons and the Check button at the
  right size, flames on every piece after Chevon's restore.
- Anything the rename moved that a scene lost track of. It shouldn't
  happen (same GUIDs), so if it does, that's a bug and I want it.
