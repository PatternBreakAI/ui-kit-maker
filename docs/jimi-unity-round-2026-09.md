# Unity round for Jimi: September 2026

Hey Jimi. Your notes from the week of 9/7 are all in. Here is what changed, what was already fixed before you wrote, what we chose not to do, and the two things we need from you.

Everything below lands with the next deploy to uikitmaker.com. Download fresh zips after that. The importer prints its build stamp in the Console, so you can tell a new zip from an old one.

## Already fixed when you wrote

**Hot Rod had no flame edge in the preview.** That was a lost imported silhouette, not the exporter. Silhouettes now travel with the design, heal themselves from a saved look, and survive account sync. That went live on 9/14. The two Primary buttons in that look wore a second lost outline, and the app now shows a "Restore lost silhouette" row for exactly that. Chevon is restoring it. Your next Hot Rod export will draw the flames on every piece.

## What changed

**1. The Prefabs folder is organized like the Playground.**
There is one folder per chapter: Buttons, Choice Controls, Sliders and Progress, Navigation and Chrome, HUD and Data, Gauges, Game Systems, RPG and MMO, Shooter and Action, Casual and Saga, Strategy and Social, Rewards. Plus Glyphs, Art and Labels. Every variation sits next to its family with a plain name: `GlyphButton_Coin`, `SlotButton_Gem`, `ButtonPrimary_BOOST`, `DataRow_TiledFace`. No more dashes and spaces in file names.

Your existing project converts itself on the next import. Files are renamed and moved in place, and they keep their GUIDs, so every scene reference follows along. After that, move prefabs wherever you like. The importer finds them by name and never moves back anything you moved.

**2. The Playground is now the index.**
Every piece has a small caption under it with its folder and prefab name. So "what is this called" is answered right on the shelf. Pieces are laid out by their real visual size now, which fixes the fire button chambers sitting over the music row and the equip selector name sitting over its neighbors. The chapter headings use the kit's own font, and there is a scrollbar on the right so it is obvious the shelf scrolls. The music slider's number follows the knob now.

**3. The catalog image is gone from the zip.**
You read it right: the Playground is the reference. The packed image had also grown taller than Unity can open, which was the "could not be read" error. It still exists as a download on the kit page, split into pages Unity opens fine, with each family's variations grouped together.

**4. The card face has its component now.**
You were right that KitCardFace was nowhere. The script shipped, the README promised it, and no prefab actually had it. The Cardface prefab now carries Kit Card Face with its parts hooked up: the picture, the two corner plates, the name, and the two corner numbers. `SetCard(def)` works out of the box. To add it to a card of your own: Add Component, then UI Kit Maker, then Kit Card Face. The file is Runtime/PatternBreakCardFace.cs, which is why a search for KitCardFace found nothing. The empty "Words / Row 1" you saw is cleaned up. It was the leftover container after the corner numbers moved onto their badges.

**5. Settings row: the bare plate you asked for.**
The slider track is its own child now, sitting behind the fill, instead of being painted onto the plate. Delete the Well child and you have the plain background shape. This is the same rule as everything else in the kit: frames stay separate from what they hold.

**6. Content SDF artefacts.**
The generated fonts now build with explicit sampling, padding and atlas size. Outlines and shadows like Hot Rod's stop bleeding between neighboring letters.

**7. The MoveCounter / Movecounter warning.**
Two builders wrote prefabs whose names differed only by capitalization. Windows treats those as one file. The extra picture prefab is retired, your project drops it on import, and the real Movecounter (with live text) is created in HUD and Data.

**8. The package audit warning, 29 times.**
It was flagging a file that Unity's own Package Manager rewrites in the package cache. That file is ignored now. The audit also warns once per package per session, and the message no longer claims to know more than it does.

**9. Responsive Check scene.**
It sized itself to your first board. With a phone-sized board that made the two live pieces huge and pushed the hint text off the screen. The pieces scale with the reference frame now and the hint is on two lines.

**10. docs plus Documentation.**
One folder now. The README figures moved into Documentation.

**11. Hot Rod's "misbehaving ghosts".**
Not the silhouette. Hot Rod's type has an outline, a glow and a shadow, and the exporter was writing the word once per layer. So the label came out as "GHOST GHOST GHOST GHOST" and stacked four high. Fixed at the source. Any look with layered type had this on the ghost, badge and level node pieces.

**12. Oversized glyphs, and the giant check.**
Same cause for both. The stock glyph buttons that are not customized ship as thin variants of the slot button. The plain white glyph was sized to a box measured from the kit's own glyph, glow included. Hot Rod's glow made that box much bigger than the glyph itself. The manifest now carries the glyph's real ink size, and the thin variants use that. The check tile was the `Check` glyph button, not the checkbox.

**13. The download notice about Audiowide.**
Audiowide only comes in one weight, so "couldn't be downloaded just now, re-export" was the wrong message. There were two copies of it, one for the label face and one for body text, and Chevon hit the second one a few times. Both now say the family has no Bold cut and that re-exporting will not change that. Pick a family with a Bold cut if the weight matters.

**14. Bold text on a one-weight kit keeps the app's width.**
Hot Rod designs its type heavier than Audiowide can supply, so every label and seat in Unity wears TextMeshPro's synthetic bold. TextMeshPro adds 7 percent of the font size to every letter when it fakes bold. The browser fakes bold without touching letter spacing, and that is what the app draws. So live words in Unity ran about a tenth wider than in the app and walked out of their plates. The importer now zeroes that extra spacing on every font asset it makes or loads, so the stroke is the only difference left. Existing projects fix themselves on the next import, no rebuild needed.

## What we chose not to do

- **Selective export by genre.** Chevon has this on the list as a product decision for the app, not a bug. Nothing built for it yet.
- **Other row-shaped prefabs with controls baked in.** You named the settings row, and that is the one that changed. I did not go through the other row pieces. If you hit another one, name it in your next notes and it gets the same treatment.
- **Pictures in the Prefabs folder.** Unity draws its own blue cube icons for prefabs, the same as in every other kit on the store. The captions on the Playground are the index instead.

## Two things we need from you

- **Re-import both kits** from fresh zips downloaded after this lands. The Console will list what got renamed and moved.
- **The importer changes were written without a Unity editor at hand.** They pass our checks and follow the same patterns as the rest of the importer, but your re-import is the real test. If anything fails to compile or a scene loses track of a prefab, send the Console text. That is a bug and I want it.

## What to hammer on

- Playground: nothing overlapping, every caption naming a real file, the scrollbar, the music slider's number following the knob.
- Card face in a scene: call `SetCard`, then hit and buff the corner numbers.
- Settings row: delete the Well child and confirm a bare plate.
- Hot Rod: labels single, glyph buttons and the Check button at the right size, flames on every piece after Chevon's restore.
- Hot Rod: live words (labels and seats) sitting inside their plates at the app's width, not spilling past the edges.
- Anything the rename moved that a scene lost track of. It should not happen, since the GUIDs do not change.
