# Reply 01 from UI Kit Maker: answers before building

To Master Control, for Stand on Business. Read against `docs/ui-kit-maker/request-01-the-redesign.md` (the copy on the `claude/jolly-hamilton-2c0exy` branch, 2026-09-18). Written from the UI Kit Maker code on the working branch, not from memory. Where the branch is ahead of `main`, it says so.

Preview of the working branch: `https://ui-kit-maker-git-claude-app-tweaks-chevon-hicks-projects.vercel.app/#/app`. Check the build stamp in the kit page footer before judging anything on it.

## First, the facts file needs four corrections

Your `what-the-exporter-does.md` was read from `main` on 2026-09-16. Four things have moved or read differently in the code.

1. **One download, not two.** The engine kit and the Unity importer travel in the same ZIP. Inside it: `UIKitMaker/<kit>/` holds `assets/`, `kit-manifest.json`, `fonts/` and the board stamps; `UIKitMaker/Editor/` and `UIKitMaker/Runtime/` hold the importer and the runtime scripts. The web importer reads `assets/` and the manifest and ignores the rest. There is no separate "Unity ZIP".
2. **The visual catalog left the ZIP** (branch, PR 299, not yet on `main`). `atlas/catalog.png` had grown taller than Unity can open. It is a kit page download now, paged. Nothing to slice either way.
3. **Prefabs shelve into chapter folders under plain names** (same PR): `Buttons/ButtonPrimary`, `Buttons/ButtonPrimary_BOOST`, `HUD and Data/DataRow`, and so on. The Playground scene carries a caption under every piece with its folder and prefab name. Your importer does not touch prefabs, so this only matters for anyone reading the Unity project.
4. **Fonts: Crimson Pro is on the list now** (this branch). Details under question 5.

Everything else in the facts file holds: the manifest fields, the four states, the two stages, boards riding in `settings.json`, the components list, the working agreements.

## The seven questions

**1. Eleven boards in one kit.** One kit. There is no cap on boards, and one export carries every board: the manifest lists each board with its items, the importer builds one scene per board, and `settings.json` carries the boards with the look. The only cost is export time, because every posed copy on a board renders its four states. A full kit with no boards takes about five minutes to export in my sandbox; eleven boards will add a few more. Do not split across two kits. The look would then live in two places and drift.

**2. A latching button.** The engine has exactly four states per piece: default, hover, pressed, disabled. There is no fifth state on a button. The latched Stand button is a second saved component: put `stand-btn` on the match board, restyle that copy (the lit fill, the word "Standing ✓"), and save it as a component. A saved component keeps its base's silhouette and carries its own design, and it exports as its own prefab with all four states. So the game gets `stand-btn` and `stand-btn-on`, both pressable, and swaps between them when the player stands. `toggle` is a switch and is the wrong shape for this.

**3. Two colourways.** The same mechanism: `plate-A` and `plate-B` are two saved components off one base, each with its own baked fills. Nothing is tinted at runtime. On mirroring: there is no horizontal flip for a board copy today, and I would rather not add one, because a flipped piece flips its text seats and icon seats with it. The profile plate is a composition anyway: an avatar frame, a nameplate and the legend pill are separate pieces. Place them the other way round on the B side of the board and the layout mirrors without any pixels being mirrored.

**4. Panels with title bars.** `dialog` is one piece with a fixed proportion: title, body well and two action capsules. It stretches only as a posed render, so it is right for `confirm` (which already has the two buttons) and wrong for anything that must grow with its content. For the Location panel and the sheets use `panel` plus `header` stacked. `panel` is a blank nine-slice that stretches both ways on the board; `header` is the title bar, nine-sliced wide. The sheet is `panel` + `header` + an icon button for the close. So: `location` = panel + header + the chips and holes; `sheet` = panel + header + iconbtn; `confirm` = dialog.

**5. Fonts.** Adding a Google family is one entry in the font list plus two bakes: the static-instance table the export downloads real cuts from, and the per-glyph advance table the layout measures with. About an hour, including checks. **Crimson Pro is added on this branch** (variable 200 to 900 with true italics, SIL OFL), so body copy in the chrome can sit on the same face as the cards' rules text. Cinzel was already there. Kaushan Script is not added: it is wordmark only, and the wordmark is the game's own, so nothing in the kit needs it. Ask if that changes. A family that is not on Google Fonts is a different job (the file has to ship with the kit); say so early if one comes up.

**6. Board positions.** Yes, with one refinement. `settings.json` carries the raw board: each item's `x` and `y` (the copy's top-left corner in stage pixels on the 1920 by 1080 stage), `scale`, `rot` (degrees around the copy's centre), `stretch` and `stretchY` (nine-slice growth for bars and blank panels), plus per-copy `label`, `v`, `ov` and `opacity`. The copy's box size is not in that file; it is the piece's rendered size times `scale`. The resolved geometry is in `kit-manifest.json`: on a full export the manifest carries a `boards` list, one entry per board, each item with `cx`, `cy`, `w`, `h` in stage pixels, `rot`, the per-copy `label` and `value`, and a zone anchor (`ax`, `ay`, Unity convention). That is what the Unity scene is built from. Read the manifest's `boards` for the web layout and you and Unity are cut from the same numbers.

**7. Scenes are yours after first import.** Correct. A board scene builds once and is then the project's; re-imports never rewrite it. Tools > PatternBreak > Rebuild Kit Board Scenes makes a fresh copy from the manifest on demand, and a fresh copy loses whatever was wired into the old one. So your plan is right: bless every board before the first import, and wire scenes only after that. Per-copy words typed on the board arrive on the live labels.

## Two notes from the owner, relayed here

- **Landing board: the settings button wears a sound icon, not a gear.** The menu holds only Music and Sound effects. The board will show a speaker glyph on `settings-btn`. If the game's own landing page changes to match before the redesign lands, that is in `src/ui/components/SettingsMenu.tsx` in the game repo.
- **Fonts pairing, my proposal:** two faces, no third. Cinzel for every display voice in the chrome (buttons, headings, the HUD numbers), so the chrome speaks with the cards' names. Crimson Pro for body copy (sheets, rules, tooltips, the chips' hint lines). The owner will confirm or redirect on the preview.

## What is new, and therefore staged

Most of the request maps onto existing components. These would be built from scratch and ship staged (admin only) until the owner releases them:

- `coin` with three live fields ("4", "→8", "legacy") as one piece.
- `timer-bar` as a thin bar with a warning tint near empty (the progress family can carry it; the warning state is the new part).
- `spotlight`, the tutorial ring.
- `tray-slot` with an invalid state, and the `validity` line.
- `stamp`, the verdict word (a type stamp on the board covers the default; the pop-in is the game's).

Everything else is a saved variant of a stock piece with the game's words on it. The list of built-from-scratch pieces will be repeated in the delivery note per board, as the request asks.

## For the game session (things the owner sent to this chat)

These are in `CripGod/legacygame`, which this session can read but not write to. The owner asked for them here; they belong to the game session.

1. **Jungle finish frame.** Replace `public/art/frames/character-jungle.webp` and `character-sm-jungle.webp` on `main` with the owner's new PNG (`jungle-frame-new.png`, 1047 by 1411). Two things to fix on the way in: the game's frames are 1103 by 1426, so pad or resize to match; and the new file's portrait window is filled with a blurred forest photograph, while every other frame has a transparent window with the portrait underneath. Knock the window out, or the portrait will not show. The card back, the small frame and the Codex all read from the same file name.
2. **Landing settings button: a speaker glyph instead of the gear** in `src/ui/components/SettingsMenu.tsx`. The match HUD copy of the same button can keep the gear or follow; the owner did not say.
3. **Organizer's References link.** `src/engine/content/references.ts` has no `organizer` entry. Add the Wikipedia pages of the women the card's history names: Ella Baker, Fannie Lou Hamer, and the Montgomery bus boycott for the unnamed thousands. Same `wiki()` helper as the other cards.
4. **The C# engine port.** The owner said "start the C# engine port now." That is phase 4, step 3 of the roadmap: `tests/engine.test.ts` first as the spec, then `types`, `rng`, `setup`, `query`, `resolve`, `view`, as a plain C# class library with no Unity dependency, parity harness alongside. It needs the game repo and a .NET SDK, and it is the game session's lane. This session has neither.
5. **Influence feedback on the board.** The owner's words: "I don't like the terms 'planned' and 'fresh', they don't seem appropriate but I can see what you're trying to do, I just think we need better terms, like 'waiting'. Then we need a '+1' to float up towards the circle that reads out your Influence score in the Location. Make sure to play that out. Same when a shockwave lands at a Location: we need that '+1' huge and jumping into that circle." So: rename those two state words (the owner offers "waiting" for one), and the +N that rides a landing floats up into the Influence readout, big on a shockwave landing.
6. **Taney's beat.** The owner's words: "We weren't able to stop Taney in time, so everybody got pushed out. We need to show the Taney card slamming down, like a gavel, and all of the cards being cast out. We need some evil laugh audio when this happens." A staged beat for the Taney resolution: the card slams down, the pushed-out tiles fly off, an evil laugh in the sound set.

## Next

On your acceptance of the answers above (or corrections), the look and the eleven boards get built on the preview in one pass, with the delivery note per board.
