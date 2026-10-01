# Unity round for Jimi: September 2026

Hey Jimi. Your notes from the week of 9/7 are all in. Here is what changed, what was already fixed before you wrote, what we chose not to do, and the two things we need from you.

Everything below lands with the next deploy to uikitmaker.com. Download fresh zips after that. The importer prints its build stamp in the Console, so you can tell a new zip from an old one.

## Already fixed when you wrote

**Hot Rod had no flame edge in the preview.** That was a lost imported silhouette, not the exporter. Silhouettes now travel with the design, heal themselves from a saved look, and survive account sync. That went live on 9/14. The two Primary buttons in that look wore a second lost outline, and the app now shows a "Restore lost silhouette" row for exactly that. Chevon restored it on 9/30. A Hot Rod zip downloaded after that draws the flames on every piece.

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

**15. The claim celebration is a one-time press now, and the words are the kit's own.**
Chevon's call (2026-09-19): a button that celebrates, the white-hot flash and the particle throw, goes dead afterwards, the way a claimed reward should. ClaimBurst has a `oneShot` flag, on by default. After the throw settles, a Button host turns non-interactable and wears its disabled skin; call `ClaimBurst.Rearm()` when the next claim is due. Pieces without a Button (the gift box, the combo) just celebrate as before. The words that celebrate now travel in the manifest (`celebrate`), set per kit in the app (Global, under Idle motion: Celebration). CLAIM stays the default, and a kit can add its own words for its own key button. Prefabs and board copies whose words match get the ClaimBurst exactly as CLAIM copies always have.

**16. The ribbon banner ships as a real piece.**
Until now the ribbon banner reached Unity only as a posed board skin with its word baked in. It is a prop family now: `ribbonbanner/ribbonbanner-base.png` (bare plate and tails, no word), a disabled grade, its own glow, and a live TMP word seated on the plate from the manifest (labelText, size, ink, offset), so the prefab reads VICTORY or LEVEL 3 or whatever you type. It shelves under Rewards. It has no nine-slice on purpose: the tails and folds are drawn geometry, so a long word shrinks to the plate and the piece scales as a whole. Like every staged piece it ships when the kit places it on a board, and for everyone once Chevon releases it.

**17. The turn tracker joins the Card Battler shelf.**
Chevon's turn readout for Stand on Business: "TURN 3 / 8" over a row of coins. It ships as `turntrack/base.png` (the plate alone, no word, no coins), the title as one live TMP seat (write "TURN 4 / 8" from your match state), and every coin as a live Image child (Turn 1 coin through Turn N coin) on one shared frame, with `turntrack/coin-lit.png` and `turntrack/coin-unlit.png` beside them. Swap a coin's sprite as turns pass; nothing needs the app. Chevon released it for every look on 2026-09-22, so it is in every kit's zip from now on; the title takes the kit's Highlight colour where that reads on the plate and the kit's text colour where it would not.

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
- Hot Rod: labels single, glyph buttons and the Check button at the right size, flames on every piece (Chevon restored the silhouette on 9/30).
- Hot Rod: live words (labels and seats) sitting inside their plates at the app's width, not spilling past the edges.
- Anything the rename moved that a scene lost track of. It should not happen, since the GUIDs do not change.

---

# Week of 9/21: Brightside

Hey Jimi. Your Brightside notes from 9/24 are in and all seven are handled below. Hot Rod follows in the next section.

## What changed

**1. The Playground opens at the top.**
You had it exactly: the scrollbar was born at value 0, and for a bottom-to-top bar that is the bottom, so on Play the shelf snapped to its last chapter. The generated scene now sets the bar to 1 and the scroll position to the top. This is a change to the scene builder, so a kept Playground does not rebuild itself; Tools, PatternBreak, Rebuild Kit Playground Scene gives you a fresh one, or set the bar's Value to 1 once, as you did.

**2. The clumping on the shelf.**
Two causes. The caption under each piece was one long line, wider than a small piece like the crosshair, so neighbours' captions ran into each other. Captions are two lines now, the folder on the first and the name on the second, and each cell is at least as wide as its caption. Second, a piece's footprint was measured from its rectangles only, so words that overflow their seat, the equip selector's name and the waypoint's distance, did not count. Rendered text now counts in the footprint. Same note as above: rebuild the Playground to see it.

**3. The line behind the tech card.**
It was the card's two connector stubs, the short bars that mark the tree path. They were drawn under the plate and out both sides, so the base sprite carried a faint bar across its middle. They are live children now, Tree stub (left) and Tree stub (right), each ending at the plate's edge, and the base ships clean. Delete or slide them per tree link.

**4. KitCardFace, for real this time.**
You could not add it and the prefab showed a missing script. Same cause as the board rigs earlier in the summer: Unity binds a saved component to its script file only when the file holds a single class, and PatternBreakCardFace.cs held four. The four now live one per file: `Runtime/PatternBreakCardFace.cs` (Kit Card Face), `Runtime/KitCardDef.cs`, `Runtime/KitCardFlip.cs`, `Runtime/KitCardTilt.cs`. Two other files had the same shape and are split the same way: the edge shine (`Runtime/EdgeShine.cs`) and the slider readout (`Runtime/KitSliderReadout.cs`). Add Component, UI Kit Maker, Kit Card Face will list it, and the Cardface prefab carries it wired. A check now refuses any future runtime file with more than one class.

**5. The Skybound Adventures art is out of the sample kit.**
That was a logo Chevon had uploaded onto the Brightside boards while testing, and a maker's own uploaded logo ships with a kit on purpose, so a board that uses one is complete in Unity. That rule stays. The logo is off the Brightside boards now, so the sample kit no longer carries it. Your existing project keeps its copy under Prefabs/Art until you delete it; a fresh import will not bring it back.

**6. The card name reads now, on every look.**
Two things were wrong. The dark band the app draws under the name sits in the base sprite, and in Unity the live picture child covers the base, so the band never showed under a real picture. The band is its own live child now, Name band, seated over the picture and under the name, so it shows in Unity exactly as the app draws it, and you can delete or restyle it like any other child. And the name took the kit's text colour no matter what, dark blue on Brightside over a dark band. The name now checks its own contrast against the band and switches to white where the kit's ink would not read; kits with a light ink keep theirs.

## What to hammer on

- Rebuild the Playground: it opens at the top, captions on two lines, nothing touching.
- Cardface prefab: a Name band child between the picture and the name, the name white on Brightside, and both still right after you drop your own sprite on the picture child.
- Cardface prefab: the corner numbers centred on their badges with their dark rim, the way the app draws them (Chevon's note from 9/29: they sat low and lost their stroke in Unity). A kept project re-seats and re-dresses them on the next import.
- Prefabs/Art: no Skybound Adventures on a fresh import.
- Cardface prefab: Kit Card Face present, `SetCard` works, and Add Component lists it.
- Tech card: a clean base, two stub children beside it.
- Idle shine and the music slider's readout still working after the file split. If either went quiet, that is a bug and I want the Console text.

---

# Week of 9/14: Hot Rod

Hey Jimi. Your Hot Rod notes from the 9/17 re-download are in. One fact explains most of them: the Console stamp in your own note says that zip was export build 8801726, made on 9/14. The Hot Rod answers from your week of 9/7 notes (single labels, glyph sizes, the catalog leaving the zip, the font notice) went live on 9/19, in build a7fffc6, two days after you downloaded. So you were testing the old exporter against the new answers. Everything below was checked today against a zip made from the current site, on a look with the same layered type as Hot Rod (outline, glow and shadow on, a one-weight font).

## What changed

**1. The ghost's stacked word, both halves.**
Two things were wrong in your picture, and the 9/19 build fixed only the first. The label read GHOST GHOST GHOST GHOST because the exporter wrote the word once per type layer; since 9/19 it is written once, and today's zip carries the ghost's label as GHOST, the badge's as 12, the level node's as 12, with the base sprites bare. The second half is the plain white GHOST you circled under Words, "the unformatted text". That was a different bug, and it is fixed now: the label's glints are cut with a text-shaped clip, and the exporter was reading that clip's text copy as a word seat, so every look with glints on shipped its label word a second time as an undressed Words child. The seat parser now ignores anything under defs, clips and masks. And for a project imported before this, the importer retires that child on the next refresh, with a Console receipt, as long as it still reads exactly what it was seeded with; a word you retyped stays yours. Expect to see "retired 1 orphan word" lines for the ghost and the level node.

**2. Glyphs still oversized.**
Same timing. The stock glyph buttons that are not customized ship as thin variants of the slot button, and the plain white glyph was sized to the box the kit's own glyph reaches with its glow; on Hot Rod that box is several times the glyph. Since 9/19 the manifest carries the glyph's ink box beside its reach box, and the importer sizes the thin variants' glyphs to the ink. On today's zip the icon button's glyph reaches 191 by 196 with an ink box of 51 by 65; the skill node's reaches 200 by 204 with 62 by 73 of ink. The fleet reads the same field.

**3. The catalog error on a fresh import.**
Your 9/14 build still packed atlas/catalog.png, and the error is Unity refusing to read that image, which had grown taller than Unity opens. The removal went live on 9/19 with the rest. Today's zip has no atlas folder at all, and nothing in the importer or the README asks for one. A project that still carries an old atlas folder can delete it; the importer never touches it.

**4. The Primary button's silhouette.**
Not the exporter, and not fixed by a download. The flame outline on Hot Rod's Primary is an imported silhouette the account lost, and the app now shows a "Restore lost silhouette" row in the silhouette rack for exactly that. Chevon picked the SVG on 9/30, so every piece wearing it is healed, in the app and in every export from then on. A Hot Rod zip downloaded before 9/30 still has the Primary without its flames; download a fresh one.

**The font notice you screenshotted** ("the real Bold cut of Audiowide couldn't be downloaded just now") is gone too. Today's export of a one-weight look says the family comes in Regular only, that Unity synthesizes the bold the same way the browser does, and that there is nothing to re-export.

## What to hammer on

- Download a fresh Hot Rod zip after this lands (the Console stamp will read a build newer than 4abe0e3) and import it into a fresh project: no catalog error.
- Ghost prefab: the label reads GHOST once, the base is bare, and there is no plain GHOST under Words. Badge and level node likewise.
- Your existing project, re-imported: a Console line retiring the orphan word on the ghost and the level node, and nothing else under Words touched.
- Glyph buttons (Gem, Sword, Key, Hammer, Gear, Check): the glyph fits its tile.
- Primary button: flames on every piece, from a zip downloaded after 9/30.
- Live words sitting inside their plates at the app's width.

**The Responsive Check scene is gone from every export** (Chevon's call, 9/29). The safe-area root it demonstrated lives in every board scene and is grafted into kept ones, so the scene had nothing left to show. A project that already holds Scenes/Responsive Check.unity keeps it until you delete it; nothing rebuilds it, and the Tools menu item for it is gone.

Your Brightside notes from the same week (the unzip replacing files, the friend row and list row shapes, the choice list's indent and gradient) are the next batch.

---

# 9/30: Chevon's Brightside Playground pass

Hey Jimi. Chevon went through the Brightside Playground on 9/30 with the Unity project open and sent four notes. All four are live, and three of them change what you see in a kept project, so this is worth a re-import before your next round.

## What changed

**1. The weapon wheel and the emote wheel answer the pointer in Play.**
They did not before: both rigs were pure dials, a value in and a pose out, and nothing on them read the mouse. In Play, click a chamber on the weapon wheel and the cylinder spins it round to the hammer the short way, with the app's own revolver feel (0.78 seconds, a heavy wind-up and a small clunk as it seats). Click a sector on the emote wheel and it is picked at once, the way emotes should be. Both work through the EventSystem only, so they behave in a build exactly as in the editor. `SetValue`, `ArmChamber` and `SetSector` still work as before, and there is a new `SpinTo` on the weapon wheel if you want the spin from code. Each rig has an off switch in the Inspector (Pointer Arms on the weapon wheel, Pointer Picks on the emote wheel) for a game that drives them itself. The runtime files are shared and replaced on every import, so your kept wheels get this on the next drop; a fresh import also makes the wheel's body a raycast target.

**2. The old cap on some bars in a kept project.**
Chevon saw the progress bar, the emblem bar and the plan timer in the Brightside Playground still drawing the old parked bead at the end of the mercury, while every other bar showed the rounded stadium. The fresh build has drawn bars the stadium way since round 58 (the mercury is one nine-sliced sprite whose own borders round the ends, and the rig drives the rect's width), and the manifest confirms every fill row ships its borders. What Chevon saw was the kept-project road: a bar prefab generated before round 58 kept its old cap rig for good, because the maintenance pass treated it as "already rigged" and nothing ever moved it. The importer now converges those on the next import, only when the rig is ours and the fill still wears our sprite, and prints the names it moved. The old Cap child is removed, a kept Slider is rewired the way a fresh one is built (the Slider drives the bar through its listener, not through Fill Rect), and your staged value survives. Placed copies, the Playground included, follow the prefab. A fill you re-sprited to your own art is left alone.

**3. The Regenerate Example Prefabs dialog reads plainly.**
It named files that no longer exist. It now says what it does: rebuilds the generated example prefabs from the current sprites and type, replaces each in place so placed copies restyle, and never touches a prefab you created, renamed or moved.

**4. Tools > PatternBreak holds only what a kit needs.**
Chevon's call for the Asset Store build: the menu keeps Kit Status, Reapply Kit Import Settings, Regenerate Example Prefabs and Rebuild Kit Playground Scene. Rebuild Kit Board Scenes appears only on a zip that carries boards, so your game exports keep it and a bare kit does not show it. Gone: Review Orphaned Kit Files (the import receipt still names every orphan; delete them from the Project window when nothing uses them), Sync Label Kerning (saving the font asset already records your kerning), Audit Immutable Packages (the audit still runs by itself after each import), and Route All Editor Input To Game View (if you want hover to work without clicking the Game view first, Unity's own setting does it: Edit > Project Settings > Input System Package > Editor Input Behavior In Play Mode, set to All Device Input Always Goes To Game View; the README says the same).

**5. The Asset Store build.**
Your "someone else's game" point landed. The kit page now has a second Unity download, admin-only for now: "Unity kit, Asset Store build (ZIP)". It is the full kit with no board scenes and none of the maker's uploaded pictures (a picture seat with nothing to show wears its icon instead), and its settings.json carries the look without the boards, the pictures or the stage backdrop. You can tell the two zips apart three ways: the file name ends in `-asset-store`, the README and QuickStart open with an Asset Store note, and Kit Status prints "Asset Store build" after the kit's name. The Brightside zip going to the store is that build. Your game exports are the other download, unchanged, boards and all.

**6. The read-only package line, calmed.**
Chevon saw a yellow line at the bottom of a fresh Unity 6 project: "UI Kit Maker: blocked a save into the immutable package asset 'Packages/com.unity.collab-proxy/…png'", blaming TextMeshPro, with a stack trace, and it came back on every save. The block itself is right: Unity keeps the packages it installs in a read-only cache and warns when anything there changes, so when something in the editor marks one of those files as changed and a save tries to write it, the kit keeps that one write out of the package. But the line was the wrong voice for a kit that ships to other people, and it named a cause it could not know. It is now a plain white Console line, once per file per session: "UI Kit Maker: skipped writing '…' because it sits inside a read-only Unity package. Something outside the kit had marked it as changed; the kit only writes under Assets/. Harmless, nothing to do." The import-time package audit that printed similar warnings (and once told a project to delete a folder under Library/PackageCache) is gone; the QuickStart explains the line in one paragraph.

## What to hammer on

- Drop a fresh zip over your Brightside project and read the Console: a line naming the bars it moved onto the width road.
- Save the project twice in a row: if the read-only package line appears at all, it is white, it appears once, and it does not come back on the second save.
- The Asset Store build, in a fresh project: no Scenes folder, no Prefabs/Art, four entries under Tools > PatternBreak, and Kit Status naming the build.
- Playground in Play: click the weapon wheel's chambers and the emote wheel's sectors. If a click does nothing, check the Game view has focus first (the editor gate), then send me the Console.
- ProgressBar, EmblemBar and Timerbar: a rounded end on the mercury and no Cap child under Fill Area. Drag Value on the Fill Area's KitBarFill and watch the end stay round down to the floor.
- Slider prefab, if yours was generated before round 58: the knob and the mercury's end on the same line at every value.
- Tools > PatternBreak: four entries on the Brightside zip, five on a zip with boards.

---

# 10/1: the seam on the progress bar, and the layers

Hey Jimi. Two changes from Chevon's 10/1 pass over the Brightside store build in Unity. The first is small and fixes the "endcap" he kept seeing. The second is a batch over thirteen pieces and changes what you see in the Hierarchy, so read it before your next re-import.

## What changed

**1. The ramp seam on the progress bar (the "still cappin" report).**
What Chevon saw on a fresh Brightside project was not the old cap rig; that one is gone. It was Unity tiling the fill's center: the mercury's ramp restarted near the value line, a pale block with a hard edge. The export decides per fill whether its center tiles (a pattern, like the XP bar's) or slices (a ramp), and the judge read Brightside's very shallow ramps as noise and shipped them tiled. The judge now also reads the trend, so progress, emblem bar and slider ship sliced. In a kept project the importer retunes the center mode on rigs already on the width road, only when the rig and the sprite are ours, and prints "retuned the mercury's center mode on 3 kept bar fill(s) (EmblemBar, ProgressBar, Slider)". Patterns stay tiled.

**2. The layers: wells, discs, stripes and glows ship as their own children.**
Chevon's screenshot batch named the problem in the file names: "in general do not burn the wells into the backgrounds but keep them as a separate layer." Thirteen pieces had something burned into the base sprite that a dev would want to move, recolor or delete. Each of those now ships as a live Image child on the prefab, at the bottom of the stack right over the plate, so fills, lit strips, portraits and words paint over it:

- Vital bar, respawn, pop meter, quest panel, XP bar, unit plate (the HP well), dialog (the body well): a **Well** child under the mercury.
- Unit plate: an **Avatar well** under the portrait and an **Avatar ring** over it.
- Tech card: the **Icon disc** under the glyph.
- Validity: the **Status stripe** down the left edge.
- Streak meter: the **Well** plus **Cell 1** to **Cell 5**, one child per segment. Add, remove or stretch cells and the lit strip still lights whole cells over them.
- Weapon wheel: **Disc**, **Hammer wedge** and **Hub plate**, beside the Cylinder, the chamber glyphs and the Name tag it already had. The rim stays in the base sprite: it is the outermost ink, the thing the sprite is cropped to, and the root needs it to keep its size.
- Rarity frame and reward card: the colored aura is a **Rarity glow** child that sits BEHIND the plate. To make room for it the plate moves into a Body child (the structure the glow families already have); the root keeps the raycast. The glow is a white cut tinted through its Image color, so changing the tier is one color edit. The rarity frame's five per-tier sprites are now identical bare plates (kept under their old names so your prefab keeps its sprite); the tier is the glow's color, and `kit-manifest.json > rarity` lists the ladder's colors. The mystery reward card keeps its own dashed white ring as a plain child.

Kept projects get these children seeded once on the next import, the same one-shot rule as every other live child: rename, retint, resize or delete one and it is yours; the kit never puts it back. Board scenes' posed copies keep their wells and discs in the posed pixels (a snapshot bakes its words and fills, and a live well over them would cover them); only the auras cut behind the posed art.

## What to hammer on

- ProgressBar, EmblemBar and Slider in the Playground: one smooth ramp from the left to the rounded end at every value. No pale block, no seam. The XP bar keeps its pattern at natural density.
- Streak meter: select Cell 3 in the Hierarchy and move it. Drag the rig's value: the lit strip lights whole cells and the moved cell shows its own gap.
- Rarity frame: pick the Rarity glow child and set its Image color to another tier's color from the manifest. The frame plate itself does not change.
- Weapon wheel in Play: click a chamber; the cylinder still spins and the Disc and Hub plate stay put.
- Unit plate: drop your own sprite on the Portrait child; the Avatar well sits under it and the Avatar ring over it.
- A kept prefab you had retinted or moved a well on: still yours after the import.

---

# 10/1, the second zip: eleven more prefabs

Hey Jimi. Chevon sent a second zip of Unity screenshots the same day, eleven prefabs, the problems again in the file names. Eight are the same kind of thing as the layers batch above (something burned in that should be a child), two are words baked into a plate, and three are look fixes he asked for by eye. Everything below ships in the same drop.

## What changed

- Energy meter: the container well and every unlit socket are live children (**Well**, **Cell 1** to **Cell 10**), the streak meter's road. The Lit strip ships plate-less and lights whole cells over them.
- Build queue: the glyph's dark square is an **Icon well** child and the bar's track a **Well** child, under the glyph and the fill.
- Friend row: the dark disc behind the portrait is an **Avatar well** child under the masked Portrait well.
- Compass: the white dashes are a **Ticks** child the size of the ribbon's window, under the N / NE / E words and the Heading caret. On the prefab, slide Ticks and the letters together to move the heading by hand. A rig that scrolls ticks and letters from one Heading value inside a masked window, the way the app does, is the next step, not this one; say if you want it. The ribbon's well stays in the base for now.
- Count badge: the red halo is a **Glow** child behind the plate (the plate moves into a Body child, the rarity frame's shape; the root keeps an invisible Image and the rect). It is the halo ring only, a white cut tinted through its Image color: recolor it, scale it to grow the glow, or delete it. The Count text is unchanged.
- Daily cell: today's gold ring and its glow are ONE **Today ring** child between the plate and the day word (no Body move: it has to paint over the plate's extruded wall, which its bottom edge crosses), a white cut tinted through its Image color. The Claimed and Locked variants never had the ring and ship without the child. The rig's Hide When Disabled list carries it, so a non-interactable Button drops the ring exactly as the app does (clear the list to keep it). The State FX glow sprite is now derived from the ringless plate, so the hover halo and its Glow Pad shrink to the plate.
- Claim button, the 2x variant: the **AD ×2** word is live text riding the "AD x2 ribbon" child, tilted with it (Rotation Z = -8). Retype it, re-angle it, or move the ribbon and the word follows. Rotated rider words are new: the seat carries the angle, and the importer tilts the word on its plate.
- Combo: the **COMBO!** word is live text riding the "Combo plaque" child, tilted with it. The ComboPop rig keeps dealing the ×N numeral exactly as before.
- Card face: the corner numbers pick their ink per badge. On a pale badge like Brightside's sand they are the kit's navy type ink with a cream rim; on a dark badge they stay white with the dark rim they had. The badges, the art and the name are unchanged. A kept card face no longer grows a second pair of digits on each refresh (that was a defect of every all-rider family; it is fixed for all of them).
- Fire button: the Weapon child now sits exactly where the app draws the glyph. The app's Icons nudge (Brightside nudges the sword up 8 px) never travelled to Unity, so the sword sat 10 px low there and nowhere else; the seat carries the nudge now and the app itself does not change. In an existing Unity project run Tools > PatternBreak > Regenerate Example Prefabs after the import; a plain re-import keeps the Weapon at its old seat.
- Coin: the big numeral clears the "→ 8" row below it on kits with large type (Brightside's "4" rises about 15 px); kits at the factory type size draw exactly as before. Board copies of the coin now carry their numeral seat too (they used to park it at the shell center).

Two importer rules ride along. A rider word the kit seeds on a kept prefab is ledgered in kit.lock.json (knownRiders), so a word you delete never comes back, whatever happens to its plate's sprite later. And every under child the batch above added keeps out of board scenes' posed copies on purpose: a posed copy is a snapshot with its words and fills baked in, and a live well over it would cover them.

## What to hammer on

- Energy meter: move Cell 3; drag the rig's Value. The Lit strip lights whole cells and the moved cell shows its own gap.
- Compass: select Ticks and drag it sideways. The dashes move; the plate, the well and the Heading caret stay put.
- Count badge and Daily cell: retint the Glow / Today ring child; delete it; the plate is clean underneath. Set the Daily cell's Button non-interactable: the ring hides.
- Claim button (2x) and Combo: retype the AD ×2 and COMBO! words in the Hierarchy; tilt the ribbon and the word follows.
- Card face: the corner digits read on Brightside's sand badge; a hit or buff flash still goes through the KitCardFace colors and back.
- Fire button after Regenerate Example Prefabs: the sword on the dome's center, and it still rides the dome on press.
- Coin: the 4 clears the → 8 row.
- A rider word you deleted on any kept prefab (a booster count, a badge count): still gone after the import.
