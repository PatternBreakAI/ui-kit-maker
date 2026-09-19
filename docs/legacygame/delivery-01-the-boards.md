# Delivery 01 from UI Kit Maker: the Stand on Business look and its eleven boards

To Master Control, on acceptance 01. Everything below is live on `main` (merge `a7fffc6`, 2026-09-19) and so on uikitmaker.com once the deploy lands; check the kit page footer stamp before judging. The kit is a shipped, staged look named **Stand on Business**: it opens at `#/kit/stand-on-business` for the owner (admin) and sits on the owner's Looks rack; nobody else sees it until the owner releases it.

## The look

Gilded navy: a gold frame (Bevel #E49C0C, rim #FCCC3C) around a navy face (#12305A) on the navy stage (#0C1C36), parchment Cinzel type (#F6E4CC) with a navy shadow and a light engraved emboss, cut corners like the card frames, gloss off, idle motion off. Cinzel is every display voice; Crimson Pro is the reading voice (toasts, menus, the dialogue plate, the coin's unit word). Three candidate looks were rendered beside the Shango card and judged on anchor, legibility and craft; this one won and was refined on the judges' notes. Red is the danger colour (Sit Down, the rarity-red badge, warn chips), green the good colour (good chips), blue the player B colourway.

## Saved variants (kit clones) the game asked for

`stand-btn-on` (the latched Stand button, lit, label "Standing ✓"), `plate-A` (gold, "You") and `plate-B` (blue, "Harborlight"), `avatar-A` and `avatar-B` (the matching rings), `location-hidden` (the face-down title bar; the hidden Location is that bar over a panel at 70 percent with a card back centred, since a bare panel cannot be cloned), `chip-warn`, `chip-good`, `sit-down`, `legend-spread` (the lit legend pill), `lock-locked` (the Locked pose), `confirm-buy` (the dialog with Buy and Cancel). Every variant carries all four states.

## Built from scratch, shipped staged

Seven new components, admin only until the owner releases them, and exported whenever a board places them: `placeholder` (the named transparent windows: card-hole, portrait-window, banner-window, tile-hole, hand-hole, wordmark-slot, teaser-hole, picture-window; in the app it shows a dashed guide and its name, in the export it is a fully transparent sprite and the board row carries the name), `coin` (the Legacy readout with three live fields and a raised pose), `timerbar` (the thin plan timer with a warning pose), `spotlight` (the tutorial ring with a pulse pose), `trayslot` (the numbered deck-builder slot, empty, filled and invalid) with `validity` (the status line, ok and error), and `verdict` (the stamped word, red, and gold for WON). The request's `stamp` is the `verdict` component; its pop-in is the game's.

## Limits to know about, and what changed since the boards were first built

- Type stamps (free text on a board) can now speak the reading voice: Crimson Pro, sentence case, no display treatment (a "Reading voice" toggle beside Plain in the Board inspector). Every body-copy line on the boards uses it: the rules plates, the Location rule lines, the coach, the hints, the cost lines, the captions. Control words and headings stay in the display face. In Unity a reading-voice stamp seats on a new KitVoice face built from the shipped Crimson Pro file; the manifest names that file as `typography.listFile`, and every reading-voice seat and stamp carries `voice: "list"`.
- A segmented control can now take its option words from a board copy: a label of the form `Small | Normal | Large` (two to five options), the lit one picked by the copy's value. The deck picker, the eras and archetypes filters and the day and night control are real segments now. The compendium's five-way filter and the two settings rows stay as tabs and radio groups, since the segment's fixed proportion would leave under 100 px per option in the room those rows have; the owner can swap them on the stage.
- A primary button ignores a per-copy icon, so a CTA with an icon slot is a button plus an icon button beside it.
- Per-copy slot words do not exist; where a piece needed different slot words on one board it got a clone (the Buy dialog).
- The engine zip's `settings.json` is now the whole kit document (look, saved variants, boards), so it restores the kit in the app exactly. The first draft export carried the bare master config; the relay copy of the match draft was corrected by hand.
- The tray slot's corner numeral is a third larger so it reads at 24 across.
- The plan timer, the coin's fields, the tray slots' numerals, the validity line, the verdict word and every label are live text or exposed fills, never baked.

## The boards

### `landing`

Pieces used: `currency`, `ghost`, `iconbtn`, `panel`, `placeholder`, `primary`, `segment`, `toggle`.

Built-from-scratch pieces on this board: `placeholder`.


Board: `SCRATCH/r80/boards/landing.json` (`id: sob-landing`, `name: landing`, `aspect: 169`, 35 items, ids prefixed `landing-`).
Render: `SCRATCH/r80/out/landing/landing.png` (+ `landing.json` boxes). Five render rounds (one calibration, four of the board).

#### Mapping decisions

| Request piece | On the board | Why |
|---|---|---|
| `cta` x4 | `primary` (words) with an `iconbtn` at its left as the icon slot, 12 px apart, same height (plate scale 0.58, tile scale 0.626) | Built-in button icons are parked engine-wide: `ICONS_ENABLED = false` (src/generator/model.ts line 148), and the `primary` case in bevel.ts reads no overlay, so `ov: "icon:..."` on a primary does nothing (verified in the calibration render). The `iconbtn` well does honour a per-copy `ov`, so each CTA's icon rides as its own live piece: `landing-cta-<name>-icon`. |
| `deck-picker` (segmented) | three `tab` copies in a strip: "Railroad" (selected, full opacity), "Black Star" and "Pantheon" (opacity 60) | `segment` has no words road on a board: the renderer takes its captions only from `opts.segments` (bevel.ts line 5553) and the board render path never passes them (Board.tsx line 3860), so a board segment always reads ONE / TWO / THREE, and its 0..1 value reaches only the first or middle cell. Tabs carry per-copy words (`KIT_LABEL_EDITABLE`). "Not selected" is shown by opacity 60; the tab has no selected pose of its own. |
| `wallet` | `currency`, kit label "12 Legacy" (reads 12 LEGACY, kit case upper) | as suggested |
| `settings-btn` | `iconbtn` with `ov: "icon:volume"` (the speaker, per Master Control) | as suggested |
| `settings-menu` | opaque `panel` + two rows of type stamps (word at size 44, hint at size 28) + a `toggle` each (Music on, Sound effects off) | per the request for this board; `setrow` not used |
| `link` | `ghost`, kit label "Developer tools" | as suggested |

#### What I invented or chose

- Icons (STOCK_ICONS ids unless noted): Play = `play`; Learn to play = `map` (a guided path; `info` would be the other honest pick, there is no book in STOCK_ICONS); Cards = `glyph:shuffle` (the semantic rack's shuffle silhouette, crossed arrows, the nearest thing to "cards" in the kit; it is a filled glyph next to three stroke icons and reads fine at this size); Rules = `scroll`.
- Deck names: three real presets from `/home/user/cripgod/legacygame/src/engine/content/index.ts` (`PRESET_DECKS`): "Railroad", "Black Star", "Pantheon". Not used: "Bois Caiman" (diaeresis) and "Mirror" (the test deck).
- Hints: both are the game's own. Music hint = "Echoes of the Past" (`MUSIC_TRACK.title` in `src/ui/audio/music.ts`; `SettingsMenu.tsx` shows the track title as the Music row's hint). Sound effects hint = "Cards, clashes, the crowd" (`SettingsMenu.tsx`). "The march" was not used because the real title was found.
- Switch poses: Music on, Sound effects off, so the owner sees both states of the switch.
- Hint stamps are in the kit's second parchment (#E8CFA8) so they read a step quieter than the row words.

#### Holes placed (all `panel` stand-ins at opacity 25, each with a plain parchment stamp at size 30 centred on it)

| Item id | Name | Art box on stage (x, y, w, h) | Notes |
|---|---|---|---|
| `landing-hole-wordmark-slot-1` | wordmark-slot | 562, 43, 800, 165 | top centre; label `landing-holelabel-1` |
| `landing-hole-card-hole-1..5` | card-hole | 524/708/892/1076/1260, 616, 136, 176 | 1103:1426 proportion (136 by 176), 48 px gaps, centred; labels `landing-holelabel-2..6` |
| `landing-hole-teaser-hole-1` | teaser-hole | 40, 818, 1520, 232 | across the lower third, ends 30 px above the stage bottom; label `landing-holelabel-7` |

Stand-in recipe for a card hole: panel scale 0.2491, stretch 0.7, stretchY 1.503. Teaser: scale 0.65, stretch 3, stretchY 0.7595. Wordmark: scale 0.5, stretch 2.05, stretchY 0.7. (A panel's art sits 42 x scale in from the box's left and 66 x scale down from its top.)

#### Things to know when reading the harness log

- OFF-STAGE flags on the teaser panel and the ghost link, and the long OVERLAPS list, are box-only. The harness box includes each piece's transparent room below the art (hover lift, press travel, cast shadow: about 224 units under a panel's art at scale 1, about 270 under a primary's). Every item's art is inside the stage (teaser bottom y 1050, link bottom y 1048) and no art overlaps except by design: stamps on their holes, rows on the menu panel.
- Type stamps report their box at item.x + 90, item.y + 90 (the stamp element carries the desk's 90-unit pad); the stamps were positioned from the measured boxes.
- Kit case is upper, so the stamps read MUSIC, SOUND EFFECTS, ECHOES OF THE PAST, CARDS, CLASHES, THE CROWD. A stamp has no case field; title case would need `kitDesigns[id].type.case = "none"` on the look.
- Fonts: the shared harness `r80-render.mjs` screenshots before Cinzel arrives when the proxy drops the gstatic fetch (a sans fallback in two of my five runs, with "NetworkError" page errors). I rendered with a copy, `SCRATCH/r80-render-fontwait.mjs`, that removes the app's Google links for Cinzel and Crimson Pro, injects both faces from `SCRATCH/r80/fonts/*.woff2` (downloaded once through the proxy) and waits for them; it is otherwise identical. Worth applying to the shared harness for every board.

#### Unsure

- Whether the owner wants the tab silhouette (a pointed right end, the kit's tab shape) for the deck picker; `kitShapes.tab = "sharp"` on the look would square the strip to match the chamfered family. Not changed here (look is the look session's).
- The menu is shown open hanging below the speaker at the right edge, since the space to the speaker's left is the wordmark's.
- Hover, pressed, disabled and the wallet's pulse are kit state dials, not saved variants, so they are not placed beside the defaults.

#### Sizes check

Hit areas: icon tiles 95 px, CTA plates 97 px tall, tabs 70 px, toggles 60 px, speaker 96 px, wallet 71 px, link 58 px. Smallest words: hole labels and hints at about 18 to 19 px caps in Cinzel, legible at 100 percent.

### `match`

Pieces used: `badge`, `cardback`, `chatbubble`, `chip`, `coin`, `copy-avta-avatarframe`, `copy-avtb-avatarframe`, `copy-chgd-chip`, `copy-chwn-chip`, `copy-lchd-header`, `copy-lgsp-badge`, `copy-lkon-secondary`, `copy-plta-nameplate`, `copy-pltb-nameplate`, `copy-sbon-primary`, `copy-sitd-small`, `countbadge`, `ghost`, `header`, `iconbtn`, `panel`, `placeholder`, `primary`, `resource`, `secondary`, `timerbar`, `toast`, `verdict`.

Built-from-scratch pieces on this board: `coin`, `placeholder`, `timerbar`, `verdict`.


BoardDef: `r80/boards/match.json` (`id: sob-match`, `name: match`, `aspect: 169`, `bgShow: false`, 61 items, ids prefixed `match-`).
Render: `r80/out/match/match.png` with every item's boxes in `r80/out/match/match.json`. Generator: `r80/boards/_match-gen.mjs` (positions are computed from measured shell offsets; the measured-width tables sit at its top). Five renders: one calibration sheet of every piece at known scales (`r80/out/match-cal/`), then four rounds of the board.

#### Layout (1920 by 1080, shell boxes)

- HUD, y 18 to 240. Left: `copy-avta-avatarframe` ring 118 px at (40, 20) with a `portrait-window` placeholder 88 square centred in its face; `copy-plta-nameplate` "You" 342 by 61 at (166, 28); `badge` "★ 2" beside the plate; `iconbtn` chat button 64 by 64 beside that; the type stamp "5/7 in hand · 12 in deck" under the plate; the `chatbubble` "I have people in Detroit" hanging under the plate at (330, 128). Centre: `primary` "Stand on Business" 475 by 90 centred on x 960 at y 18 (the biggest button on the board); `coin` "4" 128 px right under it; `resource` "Turn 3 / 8" at the coin's left; the state samples at its right (see below). Right: the same parts the other way round, `copy-lgsp-badge` then `copy-pltb-nameplate` "Harborlight" then `copy-avtb-avatarframe` at the edge, the count stamp right-aligned under the plate.
- `timerbar` 1840 by 22 at y 246, value 0.62, under the whole HUD.
- Three Location columns 580 wide at x 40, 670, 1300: `header` shells 64 tall at y 276 over `panel` shells 580 by 450 at y 308 (panel scale 0.6, stretch 1.2393, stretchY 1.5957). Inside each live Location: the Influence stamp at y 346, the `banner-window` 510 by 170 (3:1) at y 388, the Gates row of three `tile-hole` 110 by 66 (5:3) at y 566, the Inside row at y 640, the Threat `tile-hole` at the right side centred between the rows, the rule line stamp at y 713. Chip row at y 766 under the panel.
- Bottom band, y 826 to 1064: the `hand-hole` 1840 by 238 (22 percent of the height) across the full width; over its left part the `toast` (y 828) and the replay banner (y 895 to 1007), `copy-sitd-small` "Sit Down" at the bottom-left corner under them (y 1013); `secondary` "Lock In" 222 by 83 at the bottom-right corner with `copy-lkon-secondary` "Locked" beside it.

#### Mapping decisions

- Profile plate = `copy-avta-avatarframe` + `copy-plta-nameplate` + a type stamp + `badge` + `iconbtn`. The legend pill sits beside the plate, not inside it: the nameplate is one piece and its right end already carries the "Conductor" title ribbon slot.
- The avatar ring's level numeral is labelled "A" and "B" (the counter family's typed-label road) so the rings tie the plates to the Influence line "A 5 · B 3". Untouched, the value road prints an invented level number.
- The `first` mark is a `countbadge` labelled "1st" (max 4 chars) pinned to plate-B's ring, top-right: Harborlight resolves first this turn, so plate-A stays the default and plate-B carries the state. `notifydot` is an icon button wearing a counter, too big for a mark.
- Chat button: `iconbtn` with `ov: "icon:glyph:mail"`. STOCK_ICONS has no chat or message icon; the glyph rack's `mail` envelope is the nearest message glyph. The kit-wide default is the speaker, which would read as the settings button. Swap the seat when a speech-bubble glyph lands.
- `bubble` = `chatbubble`. Its sender line "NOVA_KNIGHT" and time "14:02" are kit slots (`kitSlotVals.chatbubble`), not settable per copy, so they are invented copy on the board: please set `kitSlotVals.chatbubble = { sender: "You", time: "" }` in the look. The tail side is the speech silhouette; a right-tailed bubble would be `kitShapes` "speech~flip" or a clone, and the brief bans mirroring, so only the left bubble is placed.
- `stand-btn` = `primary`; `coin` = `coin` (staged) with its default slots "→8" and "legacy"; `turn-panel` = `resource` "Turn 3 / 8" (movecounter ignores labels); `timer-bar` = `timerbar` (staged).
- `location` = `panel` + `header` + type stamps + `placeholder` holes + chips. The header carries name and era in one label: "Greenwood District · Tulsa, 1921" is exactly 32 characters and `labelMaxOf("header")` is 32, so it fits, and the render shows it whole at scale 0.33 (29 px caps). The third Location's era is the game's own, "Atlantic, 1919" (`locations.ts`), not "Harlem, 1919" as the guidance had it. Rule lines are the first sentence of each real rule from `locations.ts`: "Established Characters here gain +1 Influence." and "Characters you relocate out of here arrive Ready.", in plain parchment at size 25. Type stamps use the display face, so these read in Cinzel capitals.
- The Threat hole is a fourth `tile-hole` at the right of the two rows, centred between them, so the row of three plus the Threat reads as "the Gates, the Inside, the Threat at the side". It is named `tile-hole` like the others (the required-name list); a distinct name such as `threat-hole` would tell the game which is which without relying on position.
- Location B is the hidden one per the registry recipe: `panel` at opacity 70, `copy-lchd-header` "Hidden" at the live header's scale, `cardback` at 40 percent of the panel height (128 by 180) centred in the panel body. The recipe says "where the banner window sits"; with nothing else in the panel the body centre reads better, so the card back sits 55 px lower than the banner zone's centre.
- Location C is won by A: `verdict` "WON" with `ov: "won"` (gold) over the lower half of the banner window, kept off the hole's guide name, plus the base `chip` "Won by A". Its Influence reads "A 7 · B 2" so the numbers agree with the win; the request's example "A 5 · B 3" is on Location A. Won by B is not on the board: the verdict's won overlay is gold only, and a B colourway would need a clone.
- Chip row: `copy-chwn-chip` "Curfew at night" and `copy-chgd-chip` "Threats never appear here" under Location A at scale 0.38, together 578 px, the column's whole width. A third chip does not fit the column, so the base chip design appears under Location C as "Won by A". The star seat after every chip word is the chip's kit-wide icon.
- `lock-btn` = `secondary` "Lock In"; `sit-down` = `copy-sitd-small`.
- `toast` = `toast` at 0.55 (Crimson Pro line, 19 px). This engine's toast has no error overlay: the error pose needs a clone (a red stripe) and the check glyph is kit wide (`kitIcons.toast`); a warning glyph would suit the error line.
- `replay-banner` is NOT an `achievetoast`. The calibration showed why: the achievetoast plate is a fixed 684 shell px, the 57-character sentence renders 1488 px wide at scale 1 (it ran two to one past the plate), and its kicker is a kit slot (`eyebrow` in `kitSlotVals.achievetoast`) that a board copy cannot set. The banner is built instead from a `panel` plate (scale 0.34, stretch 3, stretchY 0.7: 796 by 112), a `copy-chwn-chip` "CLASH" as the kicker (red is the clash colour), the sentence "Harriet Tubman banishes the Paddy Roller to Harpers Ferry" as a plain parchment stamp at size 26 (22 px caps), and the end-of-replay pair on its second row: `secondary` "See the result" then `ghost` "Stay on the board" in the request's order. `small` was not used for "See the result" because every `small` is the red danger button in this look. One colour per kind: the kicker chip's colourway is the kind; clash = chip-warn, arrival would be chip-good, and showdown, stand and reckoning need chip clones that the registry does not carry yet.
- `stamp` = `verdict` "BANISHED" at 0.3 popped on Location A's first Gate tile. It is bigger than a tile, so it overhangs and touches the second tile by 11 px: intended.

#### Intentional overlaps

- The toast and the replay banner float over the hand hole's left part (y 828 to 1007), the way the game layers its transient overlays over the board. They cover no word: the hand hole's guide name sits at the stage centre. Sit Down sits under them in the corner. The reason is arithmetic: 1080 px cannot hold the HUD with the coin under the Stand button, three 450-tall Locations with chip rows, a lane for the stack and a fifth-height hand band, unless the coin shrinks below legibility.
- Header shells overhang their panel's top edge, stamps and holes sit inside their panels, portrait windows inside the rings, the WON stamp over its banner window. Everything else is clear at the shell level (checked from the render JSON's `shell` and `glyph` boxes: one overlap reported, the BANISHED stamp on gate tile 2; nothing off stage).

#### State samples and where they sit

- `stand-btn-on`: `copy-sbon-primary` "Standing ✓" at 0.34, HUD centre right (x 1158 to 1365, y 148 to 204).
- `coin` raised: second coin with `ov: "raised"` at 0.34, right of the main coin (x 1038 to 1147).
- `legend-pill` spread: `copy-lgsp-badge` on plate-B (x 1337 to 1402).
- `plate` first: the "1st" countbadge on plate-B's ring, top-right.
- `location` hidden: column 2. Won by A: column 3 (WON stamp and "Won by A" chip).
- `chip` warn and good: under Location A. Base chip: under Location C.
- `lock-btn` locked: `copy-lkon-secondary` "Locked" at 0.44 left of Lock In (x 1440 to 1634).
- `stamp`: BANISHED on Location A's first Gate tile; WON over Location C.
- `replay-banner` end pose: the two buttons on the banner's second row.
- Hover, pressed and disabled ride the kit's state dials and are not placed. Timer warn (`ov: "warn"`), the turn panel's last-turn pose and the toast's error pose are not placed (see above).

#### What was unsure

- The hand band is 238 px, 22 percent of the height, a shade over "a fifth", to hold the stack above Sit Down.
- The coin at 0.4: its unit word "legacy" is about 13 px, the smallest request word on the board; the raised sample's is smaller still, as a sample.
- The header at 0.33 gives 29 px caps. The alternative, a bigger name with the era as a stamp under it, is a one-line change in the generator if the owner finds the title small.
- The kit's type case is upper, so "You" renders YOU, "Harborlight" HARBORLIGHT and the rule lines in capitals; `kitDesigns[id].type.case = "none"` on a piece restores title case there.
- Hit areas: chat 64, Stand 475 by 90, Standing 207 by 56, See the result 201 by 46, Stay on the board 245 by 46, Sit Down 160 by 51, Lock In 222 by 83, Locked 194 by 73. All at least 44 px.

#### Staged pieces used

`placeholder` (portrait-window twice, banner-window twice, tile-hole fourteen times, hand-hole once), `coin` (twice, one raised), `timerbar` (once), `verdict` (twice: BANISHED and WON). Released pieces and clones: `primary`, `secondary`, `ghost`, `iconbtn`, `badge`, `chip`, `header`, `panel`, `toast`, `resource`, `countbadge`, `chatbubble`, `cardback`, and the clones `copy-avta-avatarframe`, `copy-avtb-avatarframe`, `copy-plta-nameplate`, `copy-pltb-nameplate`, `copy-lgsp-badge`, `copy-sbon-primary`, `copy-lchd-header`, `copy-chwn-chip` (twice), `copy-chgd-chip`, `copy-sitd-small`, `copy-lkon-secondary`.

#### Look-level follow-ups (not doable from a BoardDef)

- `kitSlotVals.chatbubble = { sender: "You", time: "" }` to clear the bubble's invented sender and time.
- A `toast-error` clone (red stripe) and a warning glyph in `kitIcons.toast` for the error line.
- Chip clones for the replay kinds arrival, showdown, stand, reckoning (one colour per kind).
- A B-colour verdict (or a "Won by B" chip is enough) for Locations won by B.

### `sheets`

Pieces used: `chatbubble`, `copy-avtb-avatarframe`, `copy-cbuy-dialog`, `copy-chgd-chip`, `copy-chwn-chip`, `datarow`, `dialog`, `header`, `iconbtn`, `panel`, `placeholder`, `scrollbar`, `secondary`.

Built-from-scratch pieces on this board: `placeholder`.


BoardDef: `r80/boards/sheets.json` (`id: sob-sheets`, `name: sheets`, `aspect: 169`, `bgShow: false`, 65 items, ids prefixed `sheets-`).
Generator: `r80/boards/sheets.gen.mjs` (positions computed from measured shell boxes; edit and rerun to move things).
Render: `r80/out/sheets/sheets.png`, item boxes in `r80/out/sheets/sheets.json`, shell-level check in `r80/out/sheets/check.txt` (`r80/boards/_sheets-check.mjs`).
Rounds: one calibration render (`r80/out/sheets-cal`, one of each piece at candidate scales, to read real shell boxes) and five board renders.

#### Layout (1920 by 1080)

A gallery of the seven sheets, each once, in two rows, top aligned. The request lists seven pieces (the base `sheet` plus six named sheets), so the rows are three above and four below, not three and three.

- Row 1 (panel shells top at y 64): `sheet` (bare, over a scrim hole), `confirm` (the dialog and its cost-line variant side by side, centred on the row), `threat-sheet`.
- Row 2 (panel shells top at y 520): `location-sheet`, `profile-sheet`, `log-sheet`, `chat-sheet`. Bottoms differ by content (1020, 930, 1042, 950); the headers line up.
- Every sheet is the sheet grammar: `panel` (scale 0.5, stretched to the sheet's size) + `header` (scale 0.32, shell overhanging the panel's top edge by 18 px, title as the per-copy label) + `iconbtn` close (scale 0.3, `ov: "icon:close"`, 48 px shell) at the top right, centred on the header.
- Words ride as per-copy labels or plain parchment type stamps (`#F6E4CC`). Type stamps use the kit's display face, so every body line reads in Cinzel capitals (the reading-voice stamp is a follow-up). Stamp sizes: rule and body lines 30 to 32 (about 13 px caps), era and cost lines 34 to 36, "Force 3" and "Summon" 40 to 50.

#### Sheet by sheet

- `sheet`: `placeholder` "scrim" (305 by 432, the translucent overlay the game draws behind a sheet) under a `panel` 273 by 352, `header` "Sheet", close. 273 is the blank panel's minimum width (its `stretch` clamps at 0.7); a narrower base sheet is not possible.
- `confirm`: `dialog` with label "Sit Down?" (capsules "Sit Down" / "Cancel" from the look's `kitSlotVals.dialog`), body as two plain stamps in the well under the well's placeholder rows: "You give up the match, now." and "Harborlight takes 12 Legacy." Beside it `copy-cbuy-dialog` (name confirm-buy, capsules "Buy" / "Cancel", the look's label "Buy Tiger's Eye?") with the stamp "Costs 12 Legacy". Both at scale 0.65 so the action capsules (56 units tall) land at 44 px on the stage; at 0.55 they were 37 px.
- `threat-sheet`: header "Segregationist Patrol", `placeholder` "picture-window" 240 by 160, stamp "Force 3", the Threat's rule as four plain stamps (exact text, split at clause breaks): "One per player. While your Patrol" / "is active, your Gate Characters" / "here cannot enter. Neutralize" / "with 3 Force in one turn."
- `location-sheet`: header "Greenwood District", stamp "Tulsa, 1921", `placeholder` "banner-window" 404 by 135 (3:1), the rule as three plain stamps "Established Characters here" / "gain +1 Influence." / "On Turn 4 a Mob arrives.", chips `copy-chwn-chip` "Curfew at night" and `copy-chgd-chip` "Threats never appear here" stacked (side by side they need 685 px).
- `profile-sheet`: header "Harborlight", `copy-avtb-avatarframe` (avatar-B, blue ring, scale 0.7, `v: 0.02` so the level badge reads 2) with a `placeholder` "portrait-window" 96 by 96 in its well, stamps "Legend 2" and "12 in deck" in one row under the badge, a strip of five `placeholder` "card-hole" 56 by 72 (1103:1426).
- `log-sheet`: header "Turn 3", five `datarow` copies (scale 0.53, `v: 1` so the mini bar reads as a full gold rule), one line each, and a `scrollbar` (scale 0.53, `stretchY` to the rows' span, `v: 0.1`).
- `chat-sheet`: header "Chat", six `iconbtn` emote buttons in a 3 by 2 grid (`ov` icons heart, hand, zap, skull, star, trophy: all STOCK_ICONS ids, no sparkle), a "Summon" stamp with three `secondary` buttons "Greenwood District" / "Harpers Ferry" / "The Black Star" (scale 0.27, 45 px tall), and three `chatbubble` copies "I have people in Detroit", "Well played", "Good game".

#### Sourced from the game's files

- Confirm body: `src/ui/screens/MatchScreen.tsx` (the stepOff ConfirmSheet): title "Sit Down?", body `You give up the match, now. ${handle} takes ${stepOffCost} Legacy.`, confirmLabel "Sit Down", `danger`. Rendered with the handle Harborlight and the request's 12.
- Threat: `src/engine/content/threats.ts`. Segregationist Patrol: force 3, text "One per player. While your Patrol is active, your Gate Characters here cannot enter. Neutralize with 3 Force in one turn." The rule stamps quote it whole.
- Location: `src/engine/content/locations.ts`. Greenwood District: era "Tulsa, 1921", rule "Established Characters here gain +1 Influence. On Turn 4 a Mob arrives." Quoted whole. The Summon buttons' other two names, Harpers Ferry and The Black Star, are from the same file.
- People and Threats in the log: `src/engine/content/characters.ts` (Harriet Tubman, Anansi), `threats.ts` (Paddy Roller), `locations.ts` (Harpers Ferry); Harborlight is the opponent's handle throughout the UI.
- Log voice: `src/engine/resolve.ts` event templates. The five lines are those templates shortened to fit a `datarow`: "Location N is revealed: X." became "Harpers Ferry is revealed"; "${handle} plays ${card} at ${loc}." became "Harborlight plays Anansi"; "${name} is Ready (...)" became "Harriet Tubman is Ready"; "${threat} at ${loc} is neutralized." became "Paddy Roller is neutralized"; "Setback for ${handle}: ${reason}." became "Setback for Harborlight".
- Emote lines: `src/ui/useMatch.ts`, `EMOTES = ['Well played', 'Ouch', "Nah, I'm busy.", 'Good game']` and the reply list ('Respect.', "Let's go."). The bubbles carry the given "I have people in Detroit" plus "Well played" and "Good game".
- Sheet structure: `src/ui/components/Sheets.tsx` (`Sheet`: title h3 + close ✕ over a `.scrim`; `ChatSheet` title "Quick chat", a "Summon?" block, the emote buttons, the chat log; `LogSheet` title "Turn N, step by step"; `ProfileSheet` stats table with "Cards in deck"; `ThreatSheet` art, family line, rule text, "Needs: N Force in one turn").

#### Mapping decisions and what was unsure

- **Threat name.** The request's stamp is "Force 3"; Paddy Roller (the suggested name) is Force 2 in `threats.ts`, so its own rule text would contradict the stamp on the same sheet. The sheet shows Segregationist Patrol, the game's Force 3 Threat, with its real rule. To use Paddy Roller instead, change the header and make the rule stamps "A Paddy Roller is in the area. While active, Gate Characters here contribute no Influence for either player. Neutralize with 2 Force in one turn (either player, or both together)." and the stamp "Force 2".
- **The danger state of confirm.** The dialog's confirm capsule is the kit's gold primary capsule; a red one needs a `dialog` clone with a red Bevel, which would also redden the frame. Not built; default pose only. The cost variant keeps its own kit label "Buy Tiger's Eye?" (it is the store's confirm-buy clone); giving it "Sit Down?" would contradict its "Buy" capsule.
- **Log lines in a datarow.** `datarow` caps its label at 32 characters in the Inspector and shrinks the title to fit its lane past about 25 characters at this scale, so the request's example "Harriet Tubman banishes the Paddy Roller to Harpers Ferry" (57 characters) cannot ride a row legibly. The five lines are 23 to 27 characters in the engine's voice. A reading-voice stamp per line would carry the full sentences; follow-up.
- **Summon "row".** Three Location names at a 44 px button height need 770 px across; they are stacked as a column beside the emote grid.
- **Chips on Greenwood.** The two chip words are the kit's chip variants (warn, good); in the game neither applies to Greenwood District (Sundown Town has the curfew, Oak Bluffs has "Threats never appear here"). They are on the sheet as the request's chip pieces.
- **Headings.** "Turn 3" and "Chat" are the request's words; the web game says "Turn 3, step by step" and "Quick chat".
- **Scrim.** Shown as a `placeholder` named "scrim" behind the base sheet (the game draws the overlay); the hole's name sits under the panel.
- **Placeholder names at small sizes.** The five card-hole names (56 px wide) and the portrait-window name (96 px) render at about 5 to 7 px: they are the guide's own caption, stripped on export, not board copy. Every other word is legible at 100 percent.
- The harness's OVERLAPS and OFF-STAGE lines fire on padded art boxes; the shell-level check (`_sheets-check.mjs`) reports nothing off stage and only the intended nesting (stamps inside the dialog wells, the portrait window inside the avatar ring).

#### Look-level items (not doable from a BoardDef)

- `chatbubble` prints its slot defaults "NOVA_KNIGHT" and "14:02" in every bubble (per-copy slots do not exist). Setting `kitSlotVals.chatbubble = { sender: "Harborlight", time: "" }` fixes it cleanly: verified with a derived payload (only that key changed) at `r80/out/sheets-slotfix/sheets.png` and `r80/out/sheets-slotfix/look-slotfix.json`. The deliverable PNG is rendered against the untouched `look.json`, so it still shows the defaults. Please add that key to the look.
- The `datarow` portrait well shows the kit's default user glyph in every log row (kit wide, `kitIcons.datarow`); a scroll or star glyph would suit a log better.
- The avatar frame's own portrait seat (the default user glyph) shows through the portrait-window hole; the seat is swappable kit wide (`kitIcons` on the clone).

#### Staged pieces used

`placeholder` only: "scrim", "picture-window", "banner-window", "portrait-window", five "card-hole". Everything else is released: `panel`, `header`, `iconbtn`, `dialog`, `datarow`, `scrollbar`, `secondary`, `chatbubble`, plus the look's clones `copy-cbuy-dialog`, `copy-chwn-chip`, `copy-chgd-chip`, `copy-avtb-avatarframe`. No new clones added.

### `result`

Pieces used: `chip`, `datarow`, `ghost`, `header`, `panel`, `primary`, `ribbonbanner`, `secondary`.


BoardDef: `r80/boards/result.json` (`id: sob-result`, `name: result`, `aspect: 169`, `bgShow: false`, 22 items, ids prefixed `result-`).
Render: `r80/out/result/result.png` with the item boxes in `r80/out/result/result.json`. Four render rounds.

#### Layout (1920 by 1080)

- Verdict band, top centre: `ribbonbanner` "You won" at scale 1.0 (art 800 by 233, centre panel 584 by 150), and under it, centred between the tails, a type stamp "Legacy 8" in the display treatment at size 100 (about 48 px caps).
- The other two verdict words as ribbon copies, smaller (scale 0.6) and stacked at the right: "Harborlight won" and "A draw". All three verdict words are on the board; win is the default pose.
- Three Location results side by side (art columns 410 wide at x 60, 515, 970; header 455 to 533, panel 495 to 795): each a `panel` (stretchY 1.29, opacity 100) with a `header` over its top edge carrying the Location name, a plain parchment stamp "A 5 · B 3" at size 100, and the winner mark as a `chip` under the score. Names: "Greenwood District" from the request, "Harpers Ferry" and "The Black Star" from the game's Locations list (`src/engine/content/locations.ts`). Scores on the second and third columns are "A 2 · B 6" and "A 4 · B 4" so the three states read from the numbers too.
- The ledger as a fourth column at the right (x 1420 to 1877), three `datarow` copies stacked (scale 0.6, art 457 by 107, pitch 117), aligned top and bottom with the Location columns.
- Three buttons in a row at the bottom, centred, vertical centres aligned at y 905: `primary` "Play again" (scale 0.55, hero), `secondary` "Rematch" (0.5), `ghost` "Menu" (0.55). Hit areas 98, 81 and 72 px tall.

#### Mapping decisions

- Verdict plate = `ribbonbanner`. The header was the alternative; the ribbon reads more like a ceremony and its centre panel holds the word.
- Winner mark = a `chip` under each column with the state as words: "Won by A", "Won by B", "Tied". A badge in two colourways would have needed a clone per side and the registry has none for B; the chip is honest and Inspector editable. The chip carries the kit's star glyph seat after the label (kit wide, swappable). The words "Won by A" etc. are the request's state names written out, not copy the request lists in its Words column; flagging that.
- Ledger rows = `datarow`, one per line, words as the per copy label: "+8 Legacy · match won", "+1 · Threat cleared", "Balance 20". labelMaxOf(datarow) is 32; the longest line is 21 characters, nothing is cut, no separator was shortened. The two earned lines carry the row's `check` action pose (`ov: "check"`); "Balance 20" carries none. The mini progress bar is set full (`v: 1`) on all three so it reads as a gold rule under each line rather than a half filled meter.

#### What needs a look-level change (not doable from a BoardDef)

- The datarow's sub line is kit wide (`kitSubs.datarow`), unset in `look.json`, so the renderer prints its own placeholder "Level 12 · Warrior" under every ledger line. That is invented copy on the board. Setting `kitSubs.datarow` to an empty string clears it cleanly; verified with a derived payload (only that key changed) at `r80/out/result-subfix/result.png` and `r80/out/result/look-subfix.json`. The deliverable PNG is rendered against the untouched `look.json` as instructed, so it still shows the placeholder line. Please add `"datarow": ""` to `kitSubs` in the look.
- The datarow's portrait well shows the kit's default user glyph. It is a live icon seat (kit wide, `kitIcons.datarow`); a coin or star glyph there would suit a ledger better. The board cannot set it per copy (the datarow's `ov` values are the action poses only).

#### What was unsure

- The harness's overlap and off-stage flags fire on the padded boxes (glow and shadow room), not on the art; every flagged pair on this board is pad. An art-level check (`r80/out/result-check.mjs`, art rects from measured unit offsets) reports nothing off stage and no overlaps beyond the intended ones (header over panel edge, stamp and chip inside their panel).
- The board's four columns leave the three Location results centred at x 720 while the verdict ribbon is centred on the stage; the top band and the middle band are each balanced on their own and it reads fine, but the owner may want the ribbon nudged left over the Locations.
- `sizes.json` widths for label-sized pieces (buttons, header, chip) are the widths under the kit's own label; on a board they follow the copy's label, so the buttons here are narrower than the table says. Positions were taken from rendered boxes, not the table.

#### Harness

- The shared `r80-render.mjs` waits a fixed 1400 ms for the stage; with 22 pieces the concurrent React root had not committed by then and the harness threw on a null `.bd-stage`. I rendered with a private copy, `SCRATCH/r80-render-result.mjs`, that polls for the stage and its pieces, and checks that the Cinzel 700 and Crimson Pro faces are loaded before screenshotting (re-adding the Google Fonts stylesheet when a fetch through the proxy fails; the bisect run showed a sans fallback once). The shared harness is untouched; both fixes are worth folding in.

#### Staged pieces used

None. Every piece on this board is a released component: `ribbonbanner`, `header`, `panel`, `chip`, `datarow`, `primary`, `secondary`, `ghost`, plus type stamps. No clones needed, none added.

### `compendium`

Pieces used: `chip`, `copy-lgsp-badge`, `datarow`, `ghost`, `header`, `iconbtn`, `panel`, `placeholder`, `secondary`, `segment`, `tab`.

Built-from-scratch pieces on this board: `placeholder`.


Board file: `r80/boards/compendium.json` (id `sob-compendium`, 46 items, ids prefixed `compendium-`).
Generator: `r80/boards/compendium.gen.mjs` (positions by shell box; rerun it to regenerate the JSON).
Render: `r80/out/compendium/compendium.png` and `.json` (three rounds on the board proper after one calibration sheet at `r80/out/compendium-cal/`).

#### What is on it, and how each request row was mapped

| Request piece | Words | Built as | Where |
|---|---|---|---|
| `chapter-head` with a kicker | "Plate III", "Locations" | a plain parchment type stamp (size 28) above a `header` at scale 0.48, the kicker's left edge on the header's text start | left column, y 266 to 391 |
| `filter` (segmented) | "All", "Historical", "Mythic", "Artists", "Events" | five `tab` copies at scale 0.52; "All" at full opacity (selected), the other four at opacity 60 | top left, y 16 to 76 |
| card grid | eight "card-hole" | eight `placeholder` copies, 116 by 150 (1103:1426), scale 1, stretch 0.29, stretchY 0.375 | y 96 to 246 |
| Location plates | "Greenwood District" with "Tulsa, 1921"; "Harpers Ferry" with "Virginia, 1859" | each a `panel` (560 by 280) with a `header` (scale 0.36) straddling its top edge, a "banner-window" `placeholder` 480 by 160 (3:1) and a plain stamp for the era | y 416 to 730 |
| `daynight` (two-way) | "Day", "Night" | two `tab` copies, "Day" selected at full opacity, "Night" at opacity 60; right aligned on the chapter head row | y 314 to 374 |
| `plate` (content plate) | "Legacy" + the request's section 3 sentence | a full width `panel` (1170 by 165) with a display stamp "Legacy" (size 44) and two plain lines at size 30 | y 785 to 950 |
| `link` | "References" | `ghost` at scale 0.5 in the content plate's right end | y 834 to 901 |
| `refs-modal` | "References", a list of sources, × | a sheet: `panel` (660 by 412) + `header` "References" over its top edge + `iconbtn` with `ov: "icon:close"` at the top right + three `datarow` copies with `v: 1` | right column, y 16 to 462 |
| `rank-ladder` | "Wood", "Bronze 3", "Silver 8", "Emerald 14", "Ruby 20", "Diamond 30" | a `panel` (660 by 370) with six `chip` copies stacked at scale 0.48, Diamond at the top and Wood at the bottom (a ladder climbs); the current rung "Bronze 3" at full opacity, the rest at opacity 60, and a blank `copy-lgsp-badge` (the lit legend pill) as a gold pip at its left | right column, y 500 to 870 |
| `promote-btn` | "Promote to Silver · 8 Legacy", disabled reason "You have 3" | `secondary` at scale 0.44 with a `chip` "You have 3" beside it | y 886 to 959 |

#### Mapping decisions and why

- **Filter as tabs, not `segment`.** The Addendum's rule: `segment` always reads ONE TWO THREE on a board. Five tab copies carry the words; "not selected" is opacity 60, the tab has no selected pose of its own. The same for Day / Night. The tab silhouette's pointed right end is the kit's tab shape, as on the landing board's deck picker.
- **Rank ladder as chips, not `steps` and not `badge`.** `case "steps"` in bevel.ts draws a fixed four pips (`const nS = 4`; the value only picks which pip is current; there is no slot or label for the count or the words), so it cannot show six named steps. The `badge` fallback was tested on the calibration sheet: the badge's frame is fixed at 118k wide and its numeral road does not fit the text down, so "Emerald 14" measured a 128 px glyph against an 86 px shell at scale 0.6 (the words spill past the shield on both sides). `chip` auto-sizes to its label and stays legible (27 px caps at scale 0.48), so the six rungs are chips. The chip's star glyph after each word is the kit wide chip icon (`STOCK_ICONS.star`, the five point lucide Star, not the sparkle); it reads as a rank star here.
- **Current step lit.** A chip has no lit pose per copy and the lit `copy-lgsp-badge` cannot hold the rank words (see above), so the current rung is shown two ways at once: full opacity against the others at 60, and the lit legend pill placed as a blank gold pip at the rung's left (label "" so no word is invented; the board passes `b.label ?? kitLabels[id]`, and an empty string stays empty). I tried turning the pip so its point faced the rung (`rot: -90`): the stage rotates about the padded box, so the piece swung 140 px away, and the Inspector's rotation dial stops at 45 degrees anyway; dropped. A better answer is a `chip-lit` clone in the look (gold face like `legend-spread`, navy type); the board could then point the current rung at it and lose the pip.
- **Ladder orientation.** The first pass laid the six rungs in a row along the bottom left (it read well) but the content plate then had no room for its sentence on two lines in the right column, so the two swapped: the ladder is a vertical stack in the right column (a ladder reads fine that way), the content plate takes the full bottom width. If the owner prefers the row, `compendium.gen.mjs` from round 1 had it: chips at scale 0.44 across a 1170 wide panel.
- **Promote as `secondary`, not `pricebtn`.** The store builder found `pricebtn` always draws a "BEST VALUE" ribbon from a kit wide slot. `secondary` carries the words at 26 px caps. Hover, pressed and disabled are the kit's state dials (four states per piece), not per copy poses on a board; the disabled reason "You have 3" rides a plain `chip` beside the button, as the parent suggested.
- **References modal as datarows, not `listmenu`.** `case "listmenu"` reads its four rows from kit wide slots `row1` to `row4` with the defaults Equip, Inspect, Reinforce, Drop, plus shortcut hints and a separator; there is no per copy road, and the look sets no slots, so a listmenu on this board would print the kit's inventory words (confirmed on the calibration sheet). Three `datarow` copies carry real titles instead. Each row has `v: 1` so the mini bar reads as a full gold rule under the title rather than a half filled meter (the result board's choice). The portrait well shows the kit's user glyph (a kit wide icon seat, `kitIcons.datarow`); a book or scroll glyph would suit sources better, not settable per copy. `kitSubs.datarow` is blank in the look, so no placeholder sub line appears.
- **Content plate's "title rule".** No kit piece draws a bare rule, so the plate has the title in the display treatment over the two plain lines and no drawn rule. Body copy renders in Cinzel capitals (type stamps always take the display face, per the Addendum); the game's TextMeshPro body should be Crimson Pro in sentence case with the same words.
- **The modal is parked, not overlaid.** In the game the sheet opens over the catalogue with a scrim the game draws. On the board it sits in the right column so nothing overlaps and the owner can see the whole catalogue and the open sheet at once.

#### Words: sourced, none invented

- "Plate III", "Locations", the five filter words, "Day", "Night", "References", "Promote to Silver · 8 Legacy", "You have 3", the six rank words: the request's table, verbatim.
- The content plate: title "Legacy" (the request's word) and the request's section 3 sentence, split as "Legacy is the stake, and the Stand on Business button" / "multiplies it (an early Stand pays and costs more)."
- Location names and eras from `/home/user/cripgod/legacygame/src/engine/content/locations.ts`: "Greenwood District" ("Tulsa, 1921") and "Harpers Ferry" ("Virginia, 1859"); both have banner art in `public/art/locations/`. Eras chosen with no dash characters.
- The reference rows are one Location's real list from `references.ts`, `jim_crow` (a Location, "The South"), in the "Title, Publisher" form the parent gave: "Jim Crow laws, Wikipedia", "Plessy v. Ferguson, Wikipedia", "Voting Rights Act of 1965, Wikipedia". It is the only Location or card in the file with three sources, which is why the modal shows Jim Crow's list rather than Greenwood's (two sources).
- The game's own tooltip for the promote action (CodexSheet.tsx) reads "Promote <card> to <rank> for <price> Legacy. You have <balance>.", which confirms the request's two strings are the game's voice.
- Day / Night in the game is the curfew Location art toggle (Battlefield.tsx and Sheets.tsx swap `<id>_night` banners), which is why the control sits on the Locations chapter row.

#### Unsure, and things the owner should know

- The third reference title is 36 characters; the datarow fits a long title into its lane, so it renders at 19 px caps (the other two at 25 and 29). Legible at 100 percent but the smallest type on the board. A wider row scale would need the modal taller than the right column allows beside the ladder.
- The kicker is a plain parchment stamp at 24 px caps; small by design (a kicker), but say if it should be the display treatment instead.
- The blank gold pip is a stand in for "lit"; see the `chip-lit` suggestion above.
- The chip's star follows "You have 3" too (kit wide icon). If it bothers, `kitIcons.chip` can be cleared in the look, which also clears the ladder's stars.
- The harness's OVERLAPS lines fire on the padded art boxes (every neighbour on a dense board); the honest checks on shell and glyph boxes report no overlaps, no hit area under 44 px, and no art box off the stage. Type stamps sit 81 px right and (125 minus half the size) px below their item x/y on this build; the generator places them by that measured offset.
- Nothing off the stage: the lowest art box (the promote button's reserve) ends at 1065.

#### Staged pieces used

`placeholder` only: eight "card-hole" copies and two "banner-window" copies. No coin, timerbar, spotlight, trayslot, validity or verdict on this board. Clones used: `copy-lgsp-badge` (legend-spread) once.

### `rules`

Pieces used: `header`, `panel`, `scrollbar`, `tabback`.


Board file: `SCRATCH/r80/boards/rules.json` (`id: sob-rules`, `name: rules`, 1920 by 1080, 16 items, ids prefixed `rules-`).
Render: `SCRATCH/r80/out/rules/rules.png` (+ `rules.json` boxes). Regenerate the board with
`node r80/boards/_rules.gen.mjs` (the layout maths lives there); `_scan.py` is the pixel-scan helper used to verify edges.

#### What is on the board

| piece | kit id | words | how it is placed |
|---|---|---|---|
| title | type stamp, display treatment, size 150 | "Rules" | centred on the reading column, glyphs 800..1122 by 92..161 |
| back button | `tabback`, scale 0.7 | "Back" | top left, frame 229..399 by 87..166 (hit area 170 by 79), on the title's centre line |
| section heads x3 | `header`, scale 0.48 | "Locations", "How a turn works", "Stand on Business" | inside each plate's top-left corner, rim 14 px under the plate rim |
| text plates x3 | `panel`, scale 0.656, stretch 2.85, stretchY 0.733 (two lines) / 0.882 (three lines) | none | reading column 232..1689 wide; plates at 205..437, 462..740, 765..997 |
| body copy, 7 lines | type stamps, `plain` parchment #F6E4CC, size 42 | the request's section 3 sentences, see below | left edge 319, aligned with the header text; pitch 46; caps about 22 px |
| scrollbar | `scrollbar`, scale 0.65, stretchY 2.639, v 0.03 | none | right edge of the column, strip 1710..1761 by 204..998, spanning the three plates |

Draw order per section: plate, head, lines.

#### Words: what is the request's and what is mine

- The request's table for this board has no words at all ("a title, section heads, text plates, a back button"). So:
- "Rules" is the request's own word (the landing screen's `cta` "Rules" opens this screen).
- "Back" is invented: the request gives no word for the back button. Swap it if the owner has one.
- The three section heads are invented plain rule names, as the brief allowed: "Locations", "How a turn works", "Stand on Business".
- Body copy is the request's section 3 paragraph, sentence by sentence, verbatim (punctuation and parentheses kept), only wrapped at word boundaries into short lines. Nothing was reworded and no rule was invented.
  - Locations: "Two players, three Locations across the middle of the board, eight turns." and "Influence per Location decides who wins it."
  - How a turn works: "Each turn both players plan in secret (cards from the hand go to a Location's Gates, Characters at the Gates walk Inside, some confront Threats), then both Lock In and the turn plays out as a replay." (three lines)
  - Stand on Business: "Legacy is the stake, and the Stand on Business button multiplies it (an early Stand pays and costs more). Sit Down retreats." (two lines)
  - Left out (omitted, not rewritten): "The human is player A (gold), the AI, Harborlight, is player B (blue)." and "Legacy won buys card ranks and, later, finishes." Two or three plates set the pattern; these two sentences would have pushed the column off the stage.
- Type case is upper kit-wide, so every word renders in caps ("HOW A TURN WORKS", "BACK").

#### Mapping decisions

- Title = type stamp (full lettering treatment), not a `header`: a header is a section head here; the page title should read as type, not chrome.
- Back = `tabback` with the label "Back". Its silhouette already points left, so no arrow glyph is needed; `small` is the kit's red danger button and `secondary` is the parchment Lock In look, so neither suited a quiet nav button.
- Section head = `header` copies; text plate = `panel` stretched to the column; body = plain stamps; scrollbar = `scrollbar`, exactly as the brief's suggested mapping ("content plate = panel + type stamps").
- Heads sit INSIDE the plate's top-left corner (a title ribbon on the plate) rather than straddling the plate's top edge. Reason: the panel's 9-slice stretch caps at 3x, so a 1457 px wide plate can never be shorter than about 225 px, and a straddling head costs another 83 px per section; three straddling sections overflowed the stage (round one ended at y 1091). Inside, three plates fit with air (bottom margin 83 px). If the owner prefers straddling heads, two plates fit and three do not at this column width.
- Body size 42 (about 27 px type, 22 px caps) at pitch 46: the longest line (73 characters) measures 1272 px and ends at 1591, 98 px inside the plate's right rim; the left margin from the rim is 87 px. Size 44 would push that line to the rim.

#### What was unsure

1. Crimson Pro on the body copy is not reachable from a type stamp. `stampSvg` renders through `renderTypeSpecimen` with the kit's display face and case, and the stamp has no font dial; the list font (`cfg.type.listFont = "Crimson Pro"`) is read only by list-style label roads on shelled pieces (toast, listmenu, datarow, and per-component `type.font` designs such as the kit's `toast`). So the body copy on this board renders in Cinzel caps. For the game the body TextMeshPro should use Crimson Pro in sentence case, as the brief's font rule says; the words are the same. Flag for the owner: if a Crimson Pro body must show on the board itself, it needs either a stamp font dial in the app or a shelled body piece, both outside this board's remit.
2. The harness stage paints the desk's near-black, not the kit canvas #0C1C36, behind the pieces. The gold-and-navy look rides on the pieces themselves; the exported scene sets its own background.
3. The harness's OFF-STAGE flags on the panels and the scrollbar are false alarms: its boxes include the shadow and extrusion pads (panel box bottom 1136, scrollbar 1127) while the visible art ends at 997 and 998. Its OVERLAPS are the intended stacking (head and lines on the plate); nothing else touches.
4. Fonts flake in the harness: two renders came back in the sans fallback because the Google Fonts fetch failed through the relay ("NetworkError"), which changes every measurement (the title measures 310 px in the fallback, 322 px in Cinzel). The final PNG was re-rendered until the title measured its Cinzel width. Anyone re-rendering should check for the serif.

#### Verification (final render)

- Legible at 100 percent: every word, 22 px caps on navy. Nothing clipped: the longest line ends at 1591 in a plate whose rim is at 1689.
- Nothing off the stage: no pixels left of x 225, right of x 1765, above y 85, or below y 1004.
- Hit areas: Back 170 by 79; scrollbar strip 51 by 794.
- Rhythm: title 92..161; plates 205..437, 462..740, 765..997 with about 30 px between them; heads 14 px under each plate rim; first body line 22 px under the head's extrusion.
- Three rounds rendered (four counting the font retry), each read at 100 percent and pixel-scanned.

#### Pieces used

`tabback`, `header` x3, `panel` x3, `scrollbar`, 8 type stamps. No staged pieces, no kit clones, no new per-component designs, no `placeholder` (this screen draws nothing of its own). The repo was not touched.

### `settings`

Pieces used: `header`, `iconbtn`, `panel`, `primary`, `radio`, `setrow`, `toggle`.


Board file: `r80/boards/settings.json` (28 items, every id prefixed `settings-`). Render: `r80/out/settings/settings.png`
with the item boxes in `r80/out/settings/settings.json`. The layout is generated by `r80/boards/_settings-gen.mjs`
(edit the constants there and re-run it to move rows; it rewrites settings.json).

#### What is on the board

One tall centred sheet on the 1920 by 1080 stage: a `panel` (scale 0.7, stretch 1.648, stretchY 2.985, so the drawn
shell is 900 by 982 px at x 510, y 48), a `header` title banner "Settings" hung on its top frame, an `iconbtn` close at
the top right wearing the kit's X glyph, seven settings rows, and a `primary` "Done" at the foot.

| Row | Built as | Pose |
|---|---|---|
| Music | type stamp + `toggle` | on (v 1) |
| Sound effects | type stamp + `toggle` | on (v 1) |
| Reduce motion | type stamp + `toggle` | off (v 0) |
| Music volume | `setrow` (label, well, readout) | v 0.7, readout 70 |
| Effects volume | `setrow` | v 0.85, readout 85 |
| Text size | type stamp, then a `radio` group: Small, Normal, Large | Normal lit |
| Colour-blind tints | type stamp, then a `radio` group: Off, Deutan, Protan, Tritan | Off lit |
| Done | `primary` | default |

Words are the request's words exactly; the kit's type case is upper, so they render as MUSIC, SOUND EFFECTS and so on.
Every word rides as a label or a plain type stamp, nothing is burned into art. No staged pieces, no clones: the board
uses panel, header, iconbtn, toggle, setrow, radio, primary and type stamps only.

#### Mapping decisions

1. Sheet grammar: `panel` + `header` + `iconbtn` close, as the brief's sheet recipe. STOCK_ICONS has no `x` id; the X
   glyph is the id `close` (lucide X), so the close carries `ov: "icon:close"`.
2. Switch rows are NOT `setrow`. The setrow renderer always draws its slider well, knob and readout (bevel.ts,
   `case "setrow"`), so a switch row cannot be a setrow. Each switch row is the word as a plain parchment stamp
   (#F6E4CC, size 50 = 32 px Cinzel caps) on the left and a `toggle` on the right, on one centre line. No hint lines:
   the request gives none for this board.
3. Volume rows are `setrow` with labels "Music volume" and "Effects volume". Its width is fixed by the renderer
   (640k units, no stretch), so at scale 0.95 the plate is 742 px wide and is centred in the sheet; the sheet's 900 px
   width was chosen around it. The setrow's own label lands at x 629, so every row word starts at x 629, and the
   toggles' right edge sits on the readout's right edge (x 1292), which gives the sheet one left column and one right
   rag. The setrow label (34 px) and the stamp words (32 px) read as one voice.
4. Segmented rows are radio groups, not `segment`. The segment renderer takes its three captions only from
   `opts.segments` (bevel.ts `case "segment"`: `opts.segments && opts.segments.length === 3 ? opts.segments :
   ["ONE", "TWO", "THREE"]`). That field is filled only by the Kit page's own piece definition; a board copy hands the
   renderer label, v, ov, stretch, sub and slots (Board.tsx around line 3860) and never segments, and the segment ignores
   its label. So on a board a segment always says ONE TWO THREE, and no label separator or slot changes that; four
   captions are impossible on it even in principle (exactly three or the default). The words rule wins over the piece
   name: each segmented row is the word as a stamp with one `radio` per option beneath it (v 1 on the selected option:
   Normal, Off) and each option word as a plain stamp at size 38 (24 px caps). Four options fit this way.
   Why not option plates: every labelled plate in this look (ghost, secondary, tab, small) carries roughly 240 to 280
   units of horizontal padding from the sharp silhouette's caps, so four plates would run past 1000 px; and `tab` is
   a pointed tag silhouette here. Why the options sit beneath the word: "Colour-blind tints" plus four options is about
   1150 px on one line, wider than any sensible sheet column, and the two groups wrap the same way for consistency.
5. `cta` "Done" = `primary` at scale 0.55 (194 by 91 px), centred at the foot of the sheet.

#### What was unsure

- The request calls the control "segmented". A radio group is the honest pick-one on this engine without an app
  change. If the owner wants the pill look, the fix is an app-lane change (a board-level `segments` field on
  BoardItem that the Board hands to the renderer, plus a three-caption limit lifted to four); not done here, no repo
  edits were allowed.
- The setrow's knob is about 35 px in diameter at scale 0.95 (15k units). The row's slider band is the drag target in
  the app; if the game needs a 44 px thumb the row has to go to scale 1.2, which makes the plate 937 px wide and 146 px
  tall and the sheet wider. Every other hit area clears 44 px: toggle 85 by 58, radio 53 by 53, close 72 by 72,
  Done 194 by 91.
- "Selected" is shown as the lit radio pip. The request lists "selected" as the state; there is no per-option
  hover or pressed pose on the board (default state, as every board).

#### Harness notes

- The harness flags `panel` and `primary(Done)` as off-stage and lists dozens of overlaps. Both come from the art boxes:
  every piece's box carries about 200 units of shadow room beneath its shell (the panel's box runs to y 1202, the Done
  button's to 1118), so vertically adjacent rows always "overlap" and the two tallest boxes cross the stage bottom.
  The drawn art is inside the stage (sheet bottom frame at y 1030, Done from 904 to 995) and nothing visible overlaps;
  checked on the PNG and by ink measurement.
- Fonts: the shared harness's font wait accepts faces in the "unloaded" state, and the app preloads 18 Google Font
  stylesheets through the proxy, so two of my renders came out in a sans fallback. The final render used a private
  copy, `SCRATCH/r80-render-cinzel.mjs`: the same harness with a wait for Cinzel and Crimson Pro to report "loaded",
  the sixteen other font stylesheets aborted at the route so the proxy only carries the kit's two faces, and a retry of
  the Cinzel link if its stylesheet request dies. The shared `r80-render.mjs` was not modified. The `.json` boxes are
  the same either way.
- Geometry for whoever moves things: the drawn shell sits lower than the resting box by the look's lift, so a piece's
  shell top is the item y plus (toggle 58.1, setrow 54.9, radio 59.6, iconbtn 63.4, header 77.6, primary 67.5, panel
  66.9) units times its scale; a plain stamp's cap centre is 122.5 px below its item y and its ink starts 81 px right of
  its item x at kit type size 64. Measured under look.json, size L.

### `tutorial`

Pieces used: `dialoguebox`, `header`, `panel`, `placeholder`, `primary`, `secondary`, `spotlight`.

Built-from-scratch pieces on this board: `placeholder`, `spotlight`.


Board file: `SCRATCH/r80/boards/tutorial.json` (`id: sob-tutorial`, `name: tutorial`, 1920 by 1080, 13 items, ids prefixed `tutorial-`).
Render with the finished look: `SCRATCH/r80/out/tutorial/tutorial.png` (+ `tutorial.json` boxes).
Render with the look patch below applied: `SCRATCH/r80/out/tutorial-patched/tutorial.png` (payload `look-patched.json` beside it).
Four rounds rendered and read at 100 percent, with 2x crops of the two rings, the coach's tail, the right edge and the caption block.

#### One look change this board needs (not made in look.json)

The coach is the `dialoguebox`. Its first line is the piece's label, so it rides the board copy. Its SECOND line and its SPEAKER NAME are read only from
`kitSlotVals.dialoguebox` (`line2`, `speaker`), and per-copy slots do not exist. `look.json` carries no `kitSlotVals.dialoguebox`, so under the finished look
the coach reads the engine's defaults: speaker "ELDER ROWAN" and line 2 "Take the ember pass at first light." Those are not the game's words.

The fix is three values on the look, written to `SCRATCH/r80/boards/tutorial.look-patch.json` (apply with the harness's `look` mode over `look.json`):

```
kitSlotVals.dialoguebox = { speaker: "Coach", line2: "The clock is stopped in here, so take your time." }
kitShapes.dialoguebox   = "speech"
```

- `speaker: "Coach"` is the game's own word for this bubble (tutorial.ts line 29 "the regular coach takes over", line 244 "The coach bubble will still point at things worth knowing"). The plate takes up to 24 characters.
- `line2` is a real Welcome-lesson sentence (line 117). The slot is cut at 60 characters, so the longer sentence went on line 1 (the label, which is fit-shrunk instead of cut).
- `kitShapes.dialoguebox = "speech"` gives the plate the request's tail ("a speech plate with a tail"). The kit silhouette is `sharp`, so without this the coach is a cut-corner plate with no tail. The speech tail is down-left and lives inside the plate's footprint (bottom band, about 23 px at this scale), so no box changes.

The board JSON is the same for both renders; only the look differs. The patched render is the one to judge the coach by. I did not edit `look.json` itself because it is the shared finished look; the owner of the look should merge the patch.

#### What is on the board

| piece | kit id | words | placement (shell boxes, stage px) |
|---|---|---|---|
| board sketch: Stand button | `primary`, scale 0.42, `opacity: 55` | "Stand on Business" | top centre, 773..1143 by 40..110 (centre x 958) |
| board sketch: Location column | `panel`, scale 0.62, stretch 0.951, stretchY 1.35, `opacity: 55` | none | lower right, 1010..1470 by 551..944 |
| board sketch: Location title bar | `header`, scale 0.34, `opacity: 55` | "Greenwood District" | straddling the column's top edge, 1048..1438 by 518..584 |
| spotlight, default | `spotlight`, scale 1, stretch 0.995, stretchY 0.454 | none | rings the Stand button: 749..1167 by 16..134 |
| spotlight, pulse | `spotlight`, scale 1, stretch 1.043, stretchY 0.438, `ov: "pulse"` | none | rings the Location title bar: 1024..1462 by 494..608 |
| lesson plate | `panel`, scale 0.62, stretch 1.737, stretchY 2.1 | none | left, 90..930 by 240..852 |
| lesson title | `header`, scale 0.36 | "Welcome" | straddling the plate's top-left, 120..355 by 205..274 |
| picture window | `placeholder`, scale 1, stretch 1.5, stretchY 1 | label "picture-window" | 600 by 400 (3:2), 210..810 by 290..690, centred in the plate |
| caption, 3 lines | type stamps, `plain` parchment #F6E4CC, size 34 | the Welcome lesson's first sentence, wrapped | left edge on the window's edge (glyph x 210), tops 720 / 754 / 788, last line ends at 893 |
| coach | `dialoguebox`, scale 0.78 | line 1 "Whoever leads Influence at two of them when Turn 8 ends wins." (label); line 2 and speaker from the look patch | right, 1150..1873 by 175..394; the speaker plate rides the top edge |
| Next | `secondary`, scale 0.4 | "Next" | under the coach's right end, 1740..1873 by 408..474 (hit area 133 by 66) |

Draw order: sketch (button, column, title bar), the two rings, the lesson plate group, the coach, Next. Later items draw on top, so the rings sit over the sketch and under nothing.

#### Words: what was sourced from tutorial.ts

All copy on the board is from `/home/user/cripgod/legacygame/src/ui/tutorial.ts`, the first lesson of turn 1 (the `read('Welcome', ...)` at line 117):

> `read('Welcome', 'You and your opponent (Harborlight) are vying for control of three Locations: the three panels across the middle of the board. Whoever leads Influence at two of them when Turn 8 ends wins. The clock is stopped in here, so take your time.')`

- Lesson title: "Welcome" (the lesson's `title`).
- Caption: sentence 1, verbatim, wrapped at word boundaries into three lines: "You and your opponent (Harborlight)" / "are vying for control of three Locations:" / "the three panels across the middle of the board." It is the sentence that describes what a picture of the board would show (the three panels), so it is the right caption for the picture window.
- Coach line 1: sentence 2, "Whoever leads Influence at two of them when Turn 8 ends wins." (61 characters; the label is fit-shrunk a little, from about 25 px to about 23 px Crimson Pro, not cut).
- Coach line 2 (look patch): sentence 3, "The clock is stopped in here, so take your time." (48 characters, inside the slot's 60-character cut).
- "Next" is the request's word. "Stand on Business" and "Greenwood District" are the kit labels of `primary` and `header`.

Not used, for the record: the first `do` lesson's guidance at line 71 ("Drag one of the lit cards onto a Location, or tap the card and then tap the Location. ... Any Location will do.") is 85 characters before the first full stop and would shrink the coach's type below 20 px; the Welcome sentences fit at full size. Nothing was reworded.

#### Mapping decisions

- `coach` = `dialoguebox` + `secondary` "Next", as the request and the brief's mapping say (the brief suggested `small` for Next, but every `small` in this look is the red danger button, so the parchment `secondary` is the right button for a calm "Next"; it also matches the Lock In button the guide points at).
- `spotlight` = the staged `spotlight`, ring boxes 24 px outside the piece's shell on every side; the ring's stroke is about 8 px, so the clear air between the piece's rim and the ring's inner edge is about 16 px (the request's 16 px margin, measured to the ring's ink). The ring is the kit's `round` silhouette in the Glow role (#FCB424) with a halo; the `pulse` copy draws a thicker stroke and a wider, brighter halo. The pulse ring rings the title bar, and since the title bar straddles the column, the ring's lower band crosses the column's top rim; that is what ringing a straddling title bar looks like, not an accident.
- `lesson-plate` = `panel` + `header` straddling its top-left + `placeholder` "picture-window" + three plain caption stamps, per the brief. The window is 3:2 (600 by 400).
- The underlying board sketch is two pieces at `opacity: 55` (the Stand button and one Location column with its title bar), enough for the rings to have something to ring and for the chrome to read as laid over the match board; the rest of the match board is the match board's business.
- Layout: the Stand button at the top centre (as on the match board); the coach at the upper right with its (patched) tail pointing down-left at the ringed title bar; the Location column under the coach; the lesson plate on the left as the modal card. Right column rhythm: ring 16..134, coach 175..394, Next 408..474, title-bar ring 494..608, column to 944.

#### What was unsure

1. The coach's second line and speaker name cannot be set per copy (see the look change above). The canonical render therefore shows "ELDER ROWAN" and "Take the ember pass at first light."; the patched render shows "COACH" and the real sentence. If the look owner would rather not add kit-wide slot values, the alternative is a `dialoguebox` clone (a clone carries its own slots), which would also need to be added to the look.
2. The coach's tail depends on `kitShapes.dialoguebox = "speech"` (in the same patch). Without it the coach is a plain plate. With it the tail is down-left and part of the silhouette, so it carries the frame and the shadow.
3. Type stamps always render in the kit's display face and case, so the caption reads in Cinzel capitals (about 22 px type, 17 px caps). The game's TextMeshPro caption should be Crimson Pro in sentence case; the words are the same. The coach's two lines do read in Crimson Pro because the dialoguebox body speaks the list face.
4. The speaker plate's name reads in Cinzel capitals ("COACH"), like every label in this look.
5. The harness stage paints the desk's near-black behind the pieces, not the kit canvas #0C1C36; the navy is on the pieces themselves.
6. The harness's OVERLAPS lines are the intended stacks (ring over button and title bar, title bars over their panels, window and captions on the plate, Next inside the coach's shadow pad). Its OFF-STAGE flags (the Location column, the coach) are pads only: the painted extent is x 89..1873 and y 6..971, so nothing painted leaves the stage.

#### Verification (round 4, both renders)

- Every requested word is on the board: two lines of guidance (line 2 via the patch), "Next", the title "Welcome", the picture window, a caption.
- Both rings visibly ring their pieces with about 16 px of clear air; the pulse ring is visibly stronger than the default ring.
- Legible at 100 percent: coach lines about 23 to 25 px Crimson Pro; "Next" 34 px glyph box; "Welcome" 32 px glyph box; captions 22 px Cinzel caps.
- Nothing clips: the longest caption ends at 893 in a plate whose rim is at 930 (round 3 had it touching the rim at 863 of 870, fixed by widening the plate to 840); the coach's right edge is 47 px inside the stage; the Stand ring's halo fades out by y 6.
- Hit areas: Next 133 by 66; the ringed Stand button 370 by 70.
- Row centres: the Stand ring and button are centred at x 958 (the stage centre is 960); the title bar ring is centred on the column at x 1243 (column centre 1240).

#### Pieces used

`primary`, `panel` x2, `header` x2, `secondary`, `dialoguebox`, 3 type stamps, and two staged pieces: `spotlight` x2 (default and `pulse`) and `placeholder` x1 ("picture-window"). Staged pieces are admin-only until released and still export when a board places them. No kit clones, no new per-component designs. The repo was not touched; `look.json` was not touched (the patch is a separate file).

### `deck-builder`

Pieces used: `placeholder`, `primary`, `secondary`, `segment`, `stepper`, `trayslot`, `validity`.

Built-from-scratch pieces on this board: `placeholder`, `trayslot`, `validity`.


Board file: `r80/boards/deck-builder.json` (51 items, every id prefixed `deck-`). Render: `r80/out/deck-builder/deck-builder.png`
with the item boxes in `r80/out/deck-builder/deck-builder.json`. The layout is generated by `r80/boards/_deck-gen.mjs`
(edit the constants at the top and re-run it; it rewrites deck-builder.json). `r80/boards/_deck-check.py` prints the shell
boxes and checks shell overlaps, off-stage and 44 px hit areas. `r80/boards/_deck-cal.json` is the calibration board that
measured the shells. Three rounds after calibration; the third is the one on disk.

#### What is on the board

A 1920 by 1080 stage in the look's navy. Left column: two filter rows, then the card grid beneath them sharing their left
edge (x 320). Right column: the two CTAs at the top, the stepper trio beneath. Bottom band, full width: the validity
line with its error sample beside it, then the 24-slot tray along the bottom edge.

| Request piece | Built as | Words | Pose on the board |
|---|---|---|---|
| `filter` (eras) | caption stamp "Eras" + 4 `tab` copies | 1700s, 1800s, 1900s, Timeless | 1800s selected (opacity 100), the rest at opacity 60 |
| `filter` (archetypes) | caption stamp "Archetypes" + 4 `tab` copies | Faith, Abolition, Rebellion, Military | Faith selected, the rest at opacity 60 |
| card grid | 10 `placeholder` copies, label "card-hole" | (hole) | two rows of five, 155 by 200 px (1103:1426) |
| `tray-slot` x24 | 24 `trayslot` copies | "1" to "24" | slots 1 to 6 `ov: "filled"`, 7 to 23 empty, 24 `ov: "invalid"` |
| `validity` | `validity` | "24 of 24 · at most two Events · ready" | ok (default) |
| `validity` error | second `validity` copy, `ov: "error"` | "Too many Events" | error: red rim, red ink, close glyph in the seat |
| `cta` "Save deck" | `primary` | Save deck | default |
| `cta` "Reset" | `secondary` | Reset | default |
| `stepper` x3 | `stepper` at v 0.5, 0, 1 | (no words) | default (4 of 8 cells), at min (0 cells), at max (8 cells) |

Every word rides as a live label or a plain type stamp; nothing is burned into art. Kit type case is upper, so the tabs
read 1700S, TIMELESS, FAITH and so on, and the captions read ERAS and ARCHETYPES. The validity line speaks the reading
voice (Crimson Pro, keep-case), so its sentence keeps its own case.

#### Staged pieces used

`trayslot` (24 copies, overlays `filled` and `invalid`), `validity` (2 copies, overlay `error`), `placeholder` (10
copies, name `card-hole`). All three ship staged (admin only until released) and still export because the board places
them. No clones on this board.

#### What was sourced, and from where

Both filter vocabularies come from `/home/user/cripgod/legacygame/src/engine/content/characters.ts`.

- Eras. The `era` field is free text: year ranges such as 1822 to 1913 or c. 1280 to 1337 (the file writes them with a
  dash), and a few place-and-year or culture strings (`'Richmond, 1800'`, `'Yoruba, Oyo'`, `'Timeless'`). The three most common literal values are a
  three-way tie at two cards each (`Timeless`, `Richmond, 1800`, `Charleston, 1822`), which is no filter, so the tabs are
  the era field bucketed by its first year: 1800s (47 cards), 1700s (14), 1900s (5), and "Timeless" for the mythic and
  every-era cards, which is the literal value two cards carry (the 1600s, 1500s, 1200s and 2000s cards are one or two
  each and would each be a near-empty tab). The tab order is chronological, not by count.
- Archetypes. Two candidates in the file: the `category` field (`historical`, `archetype`, `mythic`, `gathering`,
  `artist`, from `src/engine/types.ts`), and the `tags` array. `category` was rejected because a filter "by archetype"
  whose options include the word "Archetype" reads as nonsense, and `gathering` cards never enter a deck. The tabs are
  the four most common tags outside the game's own kind set (`KIND_TAGS` in `src/ui/components/CardFace.tsx`: Black,
  Ally, Mythic, Gathering, Archetype, Artist): Faith (17 cards), Abolition (13), Rebellion (10), Military (5). Order by
  count. Swapping any tab's word is one label edit.

#### Mapping decisions

1. Filters are `tab` groups, not `segment`, per the Addendum: the segment renderer only takes captions from the Kit
   page's own piece definition and always reads ONE TWO THREE on a board. Four `tab` copies per row, selected at full
   opacity, the others at `opacity: 60`. The look's `tab` is a chevron tag (pointed right end), so a row reads as a run of
   filter tags; the gaps are 16 px. Tabs at scale 0.55: shell 63 px tall, caps about 20 px (33 px glyph box).
2. Row captions "Eras" and "Archetypes" are plain parchment stamps (size 44, about 28 px caps), right-aligned at x 296 in
   front of each row. They are the request's own words from the Words column ("eras; archetypes"), not new copy; without
   them the two rows are indistinguishable. Remove the two stamp items if the owner wants the rows bare.
3. Card holes are the `placeholder` at scale 0.5 with `stretch: 0.7735` (1103 over 1426), 155 by 200 px, 28 px gaps.
   The parent brief said about 150 px tall; at 150 the grid left a 160 px void above the validity line, so the holes
   run 200 px and the grid fills the band between the filters (ends y 248) and the validity line (starts y 850). Change
   `HOLE_S` in the generator to go back down; the grid stays left-aligned with the tabs.
4. The stepper's count is value-driven: the renderer (`case "stepper"` in `src/generator/bevel.ts`) draws eight snapped
   cells and fills `round(v * 8)` of them; there is no numeral and the label is ignored. So "at min" is v 0 and "at max"
   is v 1, and the game drives the count by writing the value. Three copies in a column at the right, scale 0.76 so the
   minus and plus caps are 44.5 px across (the hit areas); the pressed state fills one more cell by the renderer's own
   contract.
5. `cta` = `primary` "Save deck" and `secondary` "Reset", top right, right edge on x 1844 (the tray's right edge),
   centred vertically on the two filter rows. Scale 0.6: 322 by 100 and 215 by 100. Top right rather than beside the
   validity line because two validity plates at a legible scale plus two buttons do not fit one row without shrinking
   the validity line below 21 px type; the note below says how to move them if the owner prefers them by the line.
6. The validity line is at scale 1 (760 by 84, 25 px reading voice) so the whole sentence reads at 100 percent, left
   edge on the tray's (x 76). The error sample is a second copy beside it with a 24 px gap, same scale, `ov: "error"`.
7. Tray: 24 `trayslot` at scale 0.3667 (66 px square), x = 76 + 74 per slot, so 24 by 66 plus 23 gaps of 8 = 1768 px,
   margins 76 on both sides, one row. Slots 1 to 6 filled, 24 invalid, per the brief.

#### What was unsure

- The tray numerals are small. The trayslot's corner tag is a fixed 24k by 38k tag with a 15k numeral, so at 66 px the
  tag is 17 by 11 px and the numeral about 8 px Cinzel. At 100 percent the figures read (checked at 2x and 4x crops:
  every one of 1 to 24 is distinct, the red 24 too) but they are at the floor of legibility. Nothing on the board can
  change this: the slot size is pinned by the one-row tray, and the numeral scales with the slot. A per-component type
  size on the look (`kitDesigns.trayslot.type.size`) was tried on a scratch copy of the look (`r80/out/deck-numtest/`):
  at size 104 the numeral grows to about 13 px but spills above and left of its 11 px tag, because the tag height does
  not follow the type size. The clean fix is an engine tweak in `case "trayslot"` (tag height and width following the
  numeral's size, or a larger tag below some scale); not done here, no repo edits.
- Era buckets are a derived vocabulary, explained above. If the owner wants literal values, the three most common are
  the tie listed above and any of them is one label edit.
- "Selected" on a tab is shown by opacity only (the Addendum's recipe). There is no per-tab hover or pressed pose on
  the board; every interactive piece is in its default state, as on every board.
- Save/Reset placement. To put them beside the validity line instead: validity at scale 0.85 (646 wide, 21 px type) at
  x 76 and 746, CTAs at scale 0.44 (236 and 158 wide, 73 tall) from x 1424, which just fits 1844. The board keeps the
  larger, more legible arrangement.
- Body copy on this board is only the validity sentence, which the piece already speaks in the reading voice, so the
  Addendum's Cinzel-capitals caveat for stamps does not bite here; the two captions are display words anyway.

#### Harness notes

- The harness's OVERLAPS and OFF-STAGE lines fire on the padded art boxes (the validity boxes run 344 px tall and
  cross the tray and the stage bottom; the tabs' boxes cross each other). The shell boxes show no overlap, nothing off
  stage, and no interactive shell under 44 px (`_deck-check.py`; for stamps it uses the glyph box, since a stamp's
  element box is padding).
- Shell offsets used by the generator, measured under look.json at size L: padded pieces (tab, primary, secondary,
  stepper, validity) sit at item x plus 39 times scale and item y plus 30 times scale; trayslot and placeholder have no
  padding (shell = box); a size-44 plain stamp's ink starts 80 px right of item x and its cap centre is 123 px below
  item y. Measured shell widths at scale 0.55 for the tab words: 1700s 133, 1800s 134, 1900s 135, Timeless 191, Faith
  143, Abolition 218, Rebellion 218, Military 195.

### `store`

Pieces used: `chip`, `copy-cbuy-dialog`, `copy-chgd-chip`, `copy-chwn-chip`, `currency`, `header`, `panel`, `placeholder`, `secondary`, `toggle`.

Built-from-scratch pieces on this board: `placeholder`.


Board: `r80/boards/store.json` (id `sob-store`, name `store`, 1920 by 1080, 38 items, ids prefixed `store-`).
Render: `r80/out/store/store.png` and `store.json`. Generator (the source of every coordinate): `r80/boards/store.gen.mjs`.

#### What is on the board

- `header` "Store" top left (scale 0.6), `currency` "20 Legacy" top right (scale 0.8), centres aligned.
- A 2 by 2 grid of catalogue tiles (each a `panel` at scale 0.55, stretched to 440 by 330). Each tile holds: a card-hole stand-in, the finish name as a display type stamp (size 40), a price button reading "12 Legacy", a `toggle` with a plain "Equip" stamp beside it, and a state chip along the tile's bottom.
- The four tile states, one per tile, in reading order: Tiger's Eye = default (no chip, toggle off); Turquoise = owned (`chip` "Owned"); Amethyst = equipped (toggle on, `copy-chgd-chip` "Equipped"); Onyx = cannot afford (`copy-chwn-chip` "Not enough Legacy").
- Empty state: a `panel` (832 by 200) top right with two stamps, "Nothing here yet." (display, size 44) and "Win a match to earn Legacy." (plain parchment, size 34). The request's sentence is split at its full stop; nothing added.
- Confirm with cost: a `dialog` copy (scale 0.72) labelled "Buy Tiger's Eye?", with "Costs 12 Legacy. You have 20." as a plain parchment stamp (size 34) inside the body well, below the dialog's own placeholder rows. Its bottom edge aligns with the grid's bottom edge.

#### Holes placed (stand-ins, the `placeholder` piece was not ready)

Four `card-hole` stand-ins, one per tile: `store-hole-card-hole-1` to `-4`, each a `panel` at `opacity: 25`, scale 0.293, `stretch: 0.7`, `stretchY: 1.503`, which measures 160 by 207 on the stage (1103:1426). Each carries a plain parchment stamp "card-hole" (size 30) centred on it: `store-holelabel-1` to `-4`. When `placeholder` lands, swap each stand-in for `{ kitId: "placeholder", label: "card-hole" }` at the same visual box and drop the label stamps (the placeholder names itself).

#### Mapping decisions

- **Price button is `secondary`, not `pricebtn`.** `pricebtn` reads its label as the price verbatim (no forced currency symbol, checked in `bevel.ts` case "pricebtn"), but it always draws a yellow ribbon over its top edge whose word comes from the kit-wide slot `ribbon` (default "BEST VALUE"); a board copy cannot set slots (Board.tsx passes `kitSlotVals[b.kitId]` only) and blanking the slot kit-wide would leave an empty yellow pill. That word is not in the request, so the price rides on `secondary` with label "12 Legacy" (the parchment button, navy Cinzel). It renders "12 LEGACY" because the kit's type case is upper. A calibration render with the real `pricebtn` is in `r80/out/store-cal/store-cal.png` if the owner wants to see it.
- **Cannot-afford tile.** The board has no per-copy state (no `state` field on BoardItem; play mode drives hover and pressed from the pointer), so the price button cannot sit in its disabled pose on one tile. Per the brief's fallback the tile wears `copy-chwn-chip` "Not enough Legacy" instead, and its toggle is off. The chip's words are the fallback wording named in the task, not a line from the request's table.
- **Dialog capsule words.** The dialog's capsules come from the kit-wide slots `cta1` / `cta2` ("Sit Down" / "Cancel" in the look). Board copies cannot override slots, so this confirm shows "Sit Down" / "Cancel" where the request wants "Buy" / "Cancel". Fixing it needs either a per-copy slot field on BoardItem or a `dialog` clone with its own `kitSlotVals` (`cta1: "Buy"`), and dialog clones are allowed (only `panel` and `datarow` cannot be cloned). I did not add a clone because the look is frozen; the look owner can add `copy-buyd-dialog` with `cta1: "Buy"` and this board can point `store-confirm` at it.
- The dialog's three grey placeholder rows are its "Body placeholder" child (one live child the developer deletes on export); they stay visible above the cost line on the board.
- Every tile shows the price button, including the owned and equipped tiles, so the four tiles share one anatomy; the game hides the price where it does not apply.
- Equip control = `toggle` + a plain stamp "Equip"; the toggle's `v` is 0 (off) or 1 (on). The toggle defaults to ON when `v` is absent, so every off toggle carries an explicit `v: 0`.
- Chips keep the kit's star glyph (the chip's default icon seat); the icon is swappable per the editability law.

#### What was unsure

- The default tile has an empty band under its hole because the default state carries no chip; the band is the chip's seat. It reads as intended but a little bare next to its neighbours.
- Text case: the kit is upper case kit-wide, so "Tiger's Eye" renders "TIGER'S EYE", "Equip" renders "EQUIP", and the empty state and cost line are upper too. The words in the JSON are the request's words in their original case.
- Stamp sizes: names 40, "Equip" 34, hole label 30, empty state 44 and 34, cost line 34 (cap heights about 21, 18, 16, 23, 18 px on the 1920 stage). Chips at scale 0.52 have about 15 px caps, the smallest type on the board.

#### Harness notes for other builders

- The harness box in `<outdir>/<board>.json` is not the art edge: it includes the renderer's internal offsets and shadow room (panel art starts about 42 by 66 units inside its box at scale 1; a type stamp's text starts at x + 80 with its vertical centre at y + 123). `store.gen.mjs` carries the measured offsets and places by visual edge. The OVERLAPS the harness prints for this board are those padded boxes touching (contents inside their tile), not art overlapping art.
- Google Fonts through the proxy sometimes arrives after the harness's font wait, and the render then falls back to a sans face (three of my six official runs; the delivered PNG came from the private copy below, same renderer). Look for the Cinzel serifs in the PNG and rerun if you see a sans. `r80-render-store.mjs` is a private copy of the harness that waits for the kit face to be registered and pass `fonts.check` before rendering; it is otherwise identical.

### `history`

Pieces used: `chip`, `copy-avta-avatarframe`, `copy-chgd-chip`, `copy-chwn-chip`, `copy-plta-nameplate`, `datarow`, `header`, `panel`, `placeholder`, `tabback`.

Built-from-scratch pieces on this board: `placeholder`.


Board file: `SCRATCH/r80/boards/history.json` (`id` sob-history, `name` history, 1920 by 1080, `bgShow` false, 20 items, every id prefixed `history-`).
Render: `SCRATCH/r80/out/history/history.png` with the box table in `history.json` beside it. Three full rounds (v1 layout, v2 centring and stage bounds, v3 spacing and the empty-state band).

#### Mapping decisions

| Request piece | On the board | Words |
|---|---|---|
| screen title | `header` at scale 0.56, top left beside Back | "History" |
| back | `tabback` at scale 0.5, top left corner | "Back" (the request gives no word; invented, flag it) |
| `profile-plate` | `copy-avta-avatarframe` (plate-A gold ring, scale 1.3) + `copy-plta-nameplate` (scale 0.7) + two type stamps | nameplate "You", its ribbon slot reads "Conductor" (kit-wide on plate-A already); stamp "Legacy 140" (display treatment, size 60); stamp "12 wins · 5 losses" (plain parchment, size 44) |
| avatar window | one hole stand-in inside the ring's well (see Holes) | label "portrait-window" |
| `history-row` x5 | `datarow` at scale 0.82, one column on the right, 154 px pitch | "vs Harborlight · Won · +8 · 14 Sep", "vs Harborlight · Lost · +1 · 13 Sep", "vs Harborlight · Draw · +2 · 12 Sep", "vs Harborlight · Won · +8 · 11 Sep", "vs Harborlight · Won · +8 · 10 Sep" |
| won / lost / draw states | a chip beside each row, vertically centred on the row: `copy-chgd-chip` (green) for won, `copy-chwn-chip` (red) for lost, base `chip` (navy) for draw, all at scale 0.58 | "Won", "Lost", "Draw" |
| `empty-state` | blank `panel` (scale 0.5, stretch 2.03, stretchY 1.17, a 792 by 275 plate under the profile) + a display stamp centred in it (size 56) | "No matches yet." |

The rows sit in their own column so the long title keeps a readable size (about 19 px caps); five rows under the profile plate would have forced the title down to 11 px caps.

#### Holes placed

One hole, `history-hole-portrait-window-1`: a `panel` copy at `opacity` 25, `stretch` 0.7, `stretchY` 1.1617, `scale` 0.315, which renders a 172 px square centred on the ring's well at stage (216, 335). The panel's stretch floor is 0.7, so the square is cut by pulling the height up to match rather than the width down. Its stamp `history-holelabel-1` ("portrait-window", plain parchment, size 30) is centred on it. The label is 212 px wide against a 172 px square, so it runs 20 px past the square on each side; it stays inside the ring's dark well and never touches the gold band. The square is the inscribed square of the well (a bigger square would poke its corners over the ring). When the real `placeholder` lands, swap `kitId` to `placeholder`, label `portrait-window`, and keep the centre.

#### What was unsure, what was invented

- "Back" is not in the request's table for this board. Used the word on a `tabback`; the owner can rename it in the drawer.
- Dates on the two extra won rows (11 Sep, 10 Sep) follow the parent's instruction to vary only the date. The Lost row's "+1" and the Draw row's "+2" are the parent's words too, not the request's (the request gives one example row).
- The avatar ring's level numeral shows "12": that is the component's value default (0.12), the request gives no level. Set `v` or a 1 to 3 character label on `history-avatar` if the owner wants another number, or the game hides the count ring child.
- Type case is upper kit-wide (Cinzel), so "Legacy 140" renders "LEGACY 140", "12 wins · 5 losses" renders "12 WINS · 5 LOSSES", "No matches yet." renders "NO MATCHES YET." and the row titles render in caps. The words in the JSON are the request's words as written.
- The chip carries the kit's trailing star glyph (a five point outline star, the chip's stock icon, not the banned four point sparkle). "WON ☆" reads fine as a result tag; a `kitIcons.chip = "none"` in the look would drop it on every chip.

#### The datarow's cap and its second line

- `labelMaxOf("datarow")` is the default 32. The five titles are 34 to 35 characters. The renderer does not cut them: it measures the title and shrinks it to fit the lane between the portrait well and the action lane (bevel.ts, the datarow case), and the render shows every title whole. The only place the cap bites is the Boards drawer text field (`maxLength` 32), so retyping a title inside the app stops at 32; the JSON carries the full words. Kept the words.
- `datarow` is not in `KIT_LABEL_EDITABLE`, but the stage passes `b.label ?? kitLabels[id]` to the renderer for every kit piece, so the per-copy labels render as expected. The drawer just will not show a text field for them.
- Every row shows a second line "Level 12 · Warrior" and a 40 percent bar. Those come from the store's `kitRow` singleton (row title, sub, bar, action), which `loadKitPayload` does NOT restore from a payload (store.ts 3073 onward reads kitSubs, kitLabels, kitVals and the rest, never kitRow), so it stays at the app default. The words are wrong for a match history and a board file cannot change them. What works from the look: `kitSubs.datarow = ""` blanks the line (verified: `SCRATCH/r80/out/history/subfix/history.png`, rendered from `subfix/look-subfix.json`, which is look.json plus that one key; row heights do not change). Recommend the look owner add it. The bar is `kitRow.progress` and cannot be switched off from the payload either; it exports as a swappable mercury child, so the game can hide or repurpose it. Also worth knowing: the datarow's sub line is drawn in Inter by the renderer, not in Crimson Pro.

#### Harness notes (no repo change)

- The dev server on 5199 was up throughout. The shared harness rendered every board in the fallback sans because the sandbox proxy was tunnelling Google Fonts to Chromium at 20 to 40 seconds per file (curl through the same proxy takes 2 seconds), so the app's font loads rejected with NetworkError. I did not edit `r80-render.mjs`. I made a copy, `SCRATCH/r80-render-fc.mjs`, that serves `fonts.googleapis.com` and `fonts.gstatic.com` from a curl-fed cache in `SCRATCH/r80/fontcache/` (keyed by URL, fetched with Chromium's own user agent so Google returns the same woff2 css). Its JSON also reports, per item, `shell` (the silhouette from `data-shell0`, stage px) and `glyph` (the union of the svg text cells, stage px), which is how the centring above was computed. Same command line as the original.
- `SCRATCH/r80/out/history/measure.mjs` gives pixel-true bounding boxes from a PNG (pngjs) for spot checks. `calib/` holds the calibration board that measured every piece's real offsets at scale 0.5.

#### Checks

- Zero art boxes off the stage (the last row's box ends at 1077, the empty panel's at 1076). This is what fixes the row scale at 0.82 and the list's bottom at 881: the datarow's art box carries about 240 px of transparent slack below its silhouette at this scale, so the shells cannot go lower without the harness flagging them. The bottom 130 px of the stage stay empty for that reason.
- The harness's overlap list is long, but every flagged pair is transparent slack meeting transparent slack. A silhouette versus silhouette check on the final JSON finds only the intended stacks: ring over hole over label, and panel under its stamp (the two profile stamps' line boxes touch by one pixel; their caps are 20 px apart).
- Hit areas: Back 123 by 57, chips 161 to 176 by 61, rows 620 by 128, nameplate 478 by 85. All above 44 px.
- Smallest words: the hole label at about 17 px caps and the row titles at about 19 px caps, both legible at 100 percent. Rows align on one left edge (980) with a 26 px gap; chips align on 1641 and sit on each row's centre line within a pixel.
- Colour family: gold frames, navy faces, parchment type; the only other hues are the registry's green good chip and red warn chip.

## What we need from you

- Master Control: check every board against the request's tables (piece present, word exact, hook live) and list differences in one note.
- The owner: tweak on the preview, then bless board by board. Nothing goes to Unity before every board is blessed.
- The match board's draft export travels with this note for the importer work; nothing from it is wired anywhere.
