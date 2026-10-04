# Working with Claude on UI Kit Maker: a handbook for the creative director's assistant

Written 2026-10-04 by Claude (the Claude Code session that builds UI Kit Maker and its kits), for ChatGPT, who will
creative-direct that work alongside the owner and write briefs for Claude to ingest. Everything in here is how things
actually work today. Where a limit is real, it is stated plainly so briefs can be written around it.

The owner is Chevon (PatternBreak). Chevon is the creative director and the final reviewer, does not read code, writes
in plain language, and blesses changes one at a time. Nothing reaches the live product without Chevon's go-ahead on
that specific change.

---

## 1. The cast

| Who | Role |
|---|---|
| Chevon | Owner, creative director, final say. Blesses each change ("ship it"). Reviews on preview links and screenshots. |
| ChatGPT (you) | Creative-direction assistant. Turns Chevon's intent into precise briefs (MD files). Reviews Claude's results against the brief. |
| Claude (me) | The builder. Reads briefs, changes the product and the kits, verifies in a real browser, opens pull requests, reports back with screenshots and an MD when asked. |

Chevon's word outranks any brief. A brief can decide anything that does not need a blessing (layout numbers, copy,
which glyph, which silhouette). A blessing is needed to merge, to release a staged asset, and to update release notes.

---

## 2. What the product is

**UI Kit Maker** (uikitmaker.com, the repo `PatternBreakAI/ui-kit-maker`) is a web app that generates complete game
UI kits from one material recipe. You dial a look once (colours, bevel, candy, type, icons) and the same recipe renders
142 components: buttons, panels, bars, meters, cards, nameplates, HUD pieces, dialogs, navigation, wheels, grids. Every
piece is live SVG drawn by one renderer, never a mockup.

The app has these surfaces:

- **The editor** (`#/app`): the dials on the left, the kit page in the middle (every component rendered in the current
  look, chaptered), the Inspector on the right. Per-piece designs ("forks") let one piece differ from the kit. Pieces
  can be **cloned** (a copy with its own design, label, shape and icon).
- **The Board**: artboards ("boards") where pieces, type stamps and pictures are arranged into screens. Each board sits
  on a **stage** (a device size). Boards export as PNG and, with the kit, into the Unity package.
- **Named kits** (`#/kit/<slug>`): shipped kits with a showcase page of live screens. Today: **Brightside** (the Unity
  Asset Store kit, mobile portrait 390 × 844), **Stand on Business** (the game's web kit, 16:9), **Nightfall** (the
  game's phone kit, staged, iPhone 18 Pro landscape).
- **The Unity export**: a package of sprites (nine-sliced where they stretch), prefabs, a manifest, rigs and an
  importer. Words ride as live TextMeshPro text, glyphs and wells as live Image children (see the law in section 4).
- **The Looks rack, share links, the admin desk, release notes** (`#/releases`), pricing, support, FAQ.

The game is **Stand on Business** (repo `CripGod/legacygame`): a Black-history card battler. Characters (Harriet
Tubman, Frederick Douglass, Mansa Musa, the orisha Oshun, Shango, Ogun), Locations (Harpers Ferry, Greenwood,
Montgomery, Juneteenth), Influence and Force, Lock In, Stand on Business, Legacy. Its art lives under `public/art/`
in that repo (characters, locations, frames, landing, video). I have read and push access to both repos.

---

## 3. How I work (the ship flow)

1. **Read the brief**, look at the target images, and read the relevant code and art before changing anything.
2. **Work on a branch** (never on `main`). Engine and app changes and kit changes may be separate branches so they
   can be blessed separately. Each branch gets its own Vercel preview deployment automatically.
3. **Verify in a real browser** before pushing: I drive the actual app headlessly (Chromium through Playwright), load
   the kit the way a shipped kit loads, and screenshot the board or the kit page. I test visual changes at their
   extremes (longest labels, max depth), not just defaults.
4. **Run the checks**: TypeScript type check and the repo's four guards (shipped shapes, component surfaces, live
   dials, Unity importer). Builds use `npm run build` only.
5. **Push and open a pull request** with a plain-language body: what changed, what to check, the preview link, the
   lane, which guards passed. Chevon reviews on the preview.
6. **Merge only after Chevon's "ship it"**, as a squash merge, then reset the working branch onto the new `main`.
   "Ship it" is per change, never standing. If a brief says "and ship it", I still wait for Chevon unless Chevon said it.
7. **Confirm the deploy**: uikitmaker.com prints "build <sha> · <date>" in the footer and in the app's rail; I check
   the live bundle carries the merge's sha before saying anything is live.
8. **Report back** with screenshots, the PR link and a recap in plain language. On request I also write an MD report
   for you to ingest (section 9).

A round (brief to PR with screenshots) usually takes between twenty minutes and a few hours of my time, depending on
how much is engine work. A single board screenshot takes about a minute. There is no human wait on my side except
blessings.

---

## 4. Standing rules I am bound by

These come from the repo's working agreements and from Chevon's mandates. A brief cannot override them.

- **Maximum-editability law.** Exported kits must be fully workable without the app. No icon, image or word is ever
  burned into a component's art. Every swappable thing ships as a live, Inspector-editable child: icons as swappable
  sprites, words as text, wells and glows as their own layers, frames separate from the pictures they hold. The same
  bar applies inside the app: on a board, words are type stamps, pictures are art items, never baked composites of UI.
  (Pictures of content, like a finished card from the game's own art, are fine as pictures.)
- **New assets ship staged.** New components, silhouettes and named kits are admin-only until Chevon releases them.
- **Secrets** live only in Vercel environment settings. Never in chat, the repo or PR bodies.
- **Never the four-point "AI star"** (Sparkles) icon anywhere. Five-point stars are fine.
- **No fabricated social proof**, ever.
- **Release notes** change only on Chevon's blessing, batch by batch; they never mention legal documents, personal
  information or account internals; staged assets stay out until released.
- **No em dashes** in anything a visitor reads. Chevon prefers them absent from my prose too.
- **Lanes.** Engine and app (`src/generator/*`, `src/ui/*`, `src/styles/gen.css`, `pricing.css`) are my lane. The
  homepage (`src/ui/Landing.tsx`, `src/marketing/*`, `landing.css`, `frontdoor.css`) is another session's lane; I
  read across lanes freely but call out any cross-lane edit in the PR.
- **Commits and PRs** carry fixed attribution trailers and never name an AI model.
- **Nothing destructive without asking**: no force-pushes over someone else's work, no deleting PRs or branches
  that are not mine, no merging anything Chevon has not blessed.

---

## 5. My environment and limits (the parameters)

- I run in a cloud sandbox with a fresh clone of both repos, Node, Python with Pillow, and Chromium with Playwright.
  No ffmpeg (I pull video stills with Chromium instead). No Unity: I cannot open a Unity project. Unity-side truth
  comes from headless exports I can inspect (manifest rows, sprite files, seats) and from Chevon's Unity screenshots.
- I cannot reach the Vercel preview pages from the sandbox and I cannot sign in to them. Previews are for Chevon and
  you. I can reach uikitmaker.com to read the build stamp and fetch assets.
- Preview addresses follow `https://ui-kit-maker-git-<branch-with-dashes>-chevon-hicks-projects.vercel.app`. A
  staged kit shows there only after signing in as admin on that address (a different origin from uikitmaker.com, so
  the session does not carry over). If Vercel shows its own sign-in page first, that is preview protection.
- My memory is this session's conversation, which gets summarised when it grows long. Briefs must be self-contained:
  restate the target, the numbers and the rules each time rather than pointing at "what we said before". Files in the
  repo are my durable memory; put anything that must persist in a file.
- I cannot see Chevon's screen or phone. Describe what is seen, attach screenshots or images, or point at a file.
- Web search works for facts (device sizes were verified that way). I do not browse the previews.
- Fonts in the sandbox: Google Fonts are blocked, so my screenshots serve local cuts of Literata, Cinzel and Crimson
  Pro. Other faces fall back in my screenshots but render correctly on the live site.

---

## 6. The kit model: what can be dialed

A kit is one JSON document. These are its parts, in the words the app uses. A brief can name any of them.

**The look (`cfg`), shared by every piece**
- `shape`: the silhouette. The list: round, pill, sharp (chamfered corners), hex (pointed ends), trapezoid, notch,
  chunky, cutline, polybar, explorer, mazepill, fighthud, crest, blade, tavern, handdrawn, banner (swallowtail),
  shield, pixelstep, kenneyRect, kenneyTag, kenneyTagRev, doboBracket, speech. Any shape can be flipped (`~flip`).
- `effects`: the five colours. **Bevel** (the wall and hairline), **Glow**, **Highlight**, **Shadow**, **Inner Fill**
  (the face). Secondary and ghost buttons derive their face from Bevel.
- `bevel`: width and softness of the wall.
- `candy`: the finish. extrusion (depth, darkness, glow), gloss (height, curve, opacity, softness, tint), specular
  (a light line or spot: mode, size, stretch, intensity, angle), innerEdge, innerGlow (opacity, size, colour), rim
  (width, brightness), bloom, aura, texture (grain amount and scale), pattern (type such as diamonds, scale, opacity).
- `transparency`: frame, interior, content, each 0 to 100. Interior under 100 makes a see-through face (the Nightfall
  glass is 86 on panels, 68 to 80 on rows and bars).
- `lighting` (angle, highlight, lowlight), `shadow` (distance, blur, opacity), `canvas` (the page colour behind pieces).
- `type`: font, size, weight, spacing, case, fill and a second fill, shadow, emboss, glow; `listFont` for reading text;
  `listInk`, `infoInk`.
- `icon`: colour, stroke width, size, placement.
- `states`: default, hover, pressed, disabled, each with brightness, glow, lift, opacity, saturation.

Fonts available: the maker's list (Inter, Cinzel, Crimson Pro, Literata, and the rest of the game-font rack).
Adding a face is an engine change (list entry, static cuts for Unity, measured metrics).

**Per piece**
- `kitDesigns[piece]`: a fork of any of the above for one piece (for example, a gold face for Play, slate glass for
  quiet buttons).
- `kitShapes[piece]`: a silhouette for one piece.
- `kitIcons[piece]`: the glyph a piece wears (stock glyphs: star, check, chevron, dot, play, pause, close, back,
  forward, lock, unlock, bag, volume, info, warning, refresh, home, search, user, gear, trophy, cart, gem, clock,
  heart, sword, shield, helmet, shirt, hand, boots, zap, leaf, flask, scroll, key, crosshair, skull, gift, map,
  hammer, magnet, rocket; or any Lucide path pasted in).
- `kitLabels[piece]`, `kitSubs[piece]`, `kitNoText[piece]` (a piece with no word at all), `kitSizes[piece]` (s, m, l),
  `kitVals[piece]` (a meter's fill, a counter's value), `kitSlotVals`, `kitTextOy/Ox` (nudges).
- **Clones**: `kitClones["copy-XXXX-<base>"]`, a copy of a base piece with its own design, label, shape, icon. The id
  shape is fixed: `copy-`, four characters, `-`, the base id.

**Pictures and words**
- `userAssets`: the kit's own pictures (`/kit-art/<slug>/<file>.webp` with their pixel size). They appear on boards as
  art items and in picture wells.
- Type stamps: free words on a board in the kit's lettering. `size` is a percentage of the kit's type size (floor 15%),
  `plain.color` paints them a flat colour, `voice: "list"` uses the reading face.

**Boards**
- A board: id, name, `aspect` (the stage id), background (a picture, a video or none), items.
- An item is one of: a kit piece (`kitId`, with `scale`, optional `stretch` and `stretchY` for bars, panels and
  strips, `rot`, `label`, `v`, `ov` such as `"strip"` or `"icon:gear"`), a stamp, or a picture (`logo: { aid }`, with
  optional glow and shadow). Position is the item's top-left in stage units; items draw in array order.
- Stages (the device pulldown): Wide 16:9 (1920 × 1080); iPhone 18 Pro 402 × 874 and 874 × 402; 18 Pro Max 440 × 956;
  Air 420 × 912; iPhone 16 393 × 852; Mobile (16e) 390 × 844; iPad Pro 13″ 1032 × 1376; Pro 11″ 834 × 1210; iPad
  820 × 1180; mini 744 × 1133; Android phone 412 × 915; compact 360 × 780; tablet 800 × 1280; each portrait and
  landscape. Units are the device's points. Safe-area guides draw each device's insets.
- Floors: a piece on a board cannot be scaled below the point where its art hits 34 px on the 16:9 stage, scaled down
  with the stage (about 13 px on a phone stage, never under 12). Stamps floor at 15% of the type size.

**Named kits**
- Registered in `src/generator/namedKits.ts`: slug, name, lede, platform line, screens (board name, title, caption),
  `staged: true` while admin-only.

---

## 7. The pieces, by family

142 components. The families, with the ids you will meet most:

- **Buttons**: primary, secondary, small, ghost, iconbtn, pricebtn, claimbtn, keyprompt, padbtn, firebtn.
- **Containers**: panel, dialog, header, nameplate, tooltip, toast, questpanel, dialoguebox, placeholder (a dashed
  window for art), cardface, techcard, rewardcard, rarityframe, dailycell.
- **Bars and meters**: progress, xpbar, loadbar, slider, segbar, segment meter, stepper, energy meter, streak meter,
  vitalbar, popmeter, emblembar, vsbar, movecounter, timer pieces.
- **Chips and tags**: chip, badge, coin, currency (the wallet chip: coin or a swapped glyph, plus the amount),
  countbadge, loottag.
- **Navigation**: tab, tabback, segment (segmented control; captions split on ` | `), bottomnav, hotbar, pagedots.
- **Social and HUD**: avatarframe (portrait ring; a count chip unless the label is empty), friendrow, partyframe,
  unitplate, buffframe, compass, killfeed rows, respawn, achievetoast.
- **Inventory and grids**: inventory grid, reward tray, build queue, weapon wheel, skill nodes.
- **Form**: input, dropdown, toggle, setrow, datarow, listmenu.
- **Glyph pieces** (`glyph*`): semantic glyph outlines dressed in the kit's material; staged.

Every piece has a size (s, m, l) and renders at any scale on a board. A **strip** is a panel in its strip pose
(`ov: "strip"`): a wide low plate used for rows, ledges and the Play standard; its width is at most three times its
natural width at that height.

---

## 8. How to brief me well

Write briefs as MD files. One brief per change or per screen. The shape that works:

1. **Title and intent** in one line. What screen or piece, and what it should feel like.
2. **Target images**, named, with what to copy from each and what to ignore (a concept image often carries placeholder
   numbers; say whether the game's real data wins).
3. **Stage**: which device stage (for Stand on Business on the phone: iPhone 18 Pro landscape, 874 × 402 points).
4. **Regions and numbers**: a region list with positions and sizes in points, or proportions, and the order of
   importance. I compose by numbers; a few good numbers beat a paragraph of adjectives. Minimums I hold on phones:
   words 11 pt or more, taps 34 pt or more, content inside the device's safe area unless the brief says otherwise.
5. **Copy**: the exact words, with their case and punctuation. Words are live text, so every word in the screen
   should be in the brief. No em dashes.
6. **Material notes**: what to dial, in the kit's own terms where possible (face transparency, hairline colour,
   silhouette per piece, glow strength, type weight). Say what must not change.
7. **Art**: which game art to use (paths in `legacygame/public/art/` if you know them), what crops or composites are
   wanted, and whether a picture is content (fine as a picture) or UI (must be live pieces).
8. **Acceptance checks**: three to eight things a reviewer looks at on the preview. These become the PR's "what to
   check" list.
9. **Scope fence**: what is explicitly out of this round.
10. **Decisions you have already made** versus **questions for Chevon**. I will not stop for things you have decided.

Things that help:
- Name pieces by their id (`copy-play-panel`, `currency`, `avatarframe`) or by the word on them in the kit page.
- Say "engine change" when a brief needs something the kit cannot dial today (a new piece, a new behaviour, a new
  font). Engine changes are their own branch and PR, and they ship before the kit that uses them.
- Prefer one target image per screen, at the screen's own aspect. Landscape phone concepts at 16:9 lose 18% of their
  height on a real 874 × 402 stage; say what gives.
- If a brief changes an existing blessed screen, say so; I will show before and after.

Things I will push back on, in a sentence, then still do what the brief says unless it breaks a standing rule:
- Burning words or glyphs into art.
- Fabricated numbers or quotes presented as real.
- Anything that needs a secret in the repo.

---

## 9. What I hand back, and the MD loop between us

Each round ends with:
- The PR link, its base branch, and the preview address with the sign-in note.
- Screenshots of the real app (boards clipped to their stage; the kit page where a material changed).
- A plain-language recap: what changed, what was verified, what was left out and why, open questions.

On request, I also write a **round report** as an MD under `scratchpad/briefs/` (or a path you name in the brief)
with: the brief's id, what I did against each numbered item, measured facts (sizes, counts, file paths), deviations,
and the next brief I would expect. Name the files with a date and a number so we can refer to them:
`2026-10-04-03-start-screen.md` for a brief, `2026-10-04-03-start-screen-report.md` for its report.

If you want a brief to persist in the repo, say "commit this brief under `docs/briefs/`"; it then rides the PR.

When you review a result, write the next brief against the screenshot, numbered item by item: "row 3 word collides
with the count; move the count 6 pt right" is immediately actionable. "Make it pop" is not.

---

## 10. Where things are (today)

- `src/generator/bevel.ts`: the renderer (every piece). `model.ts`: the kit model, shapes, stock glyphs, fonts.
  `store.ts`: the app state, boards, floors. `stages.ts`: the device stages. `namedKits.ts`: shipped kits.
  `engineExport.ts`: the Unity export and importer. `src/ui/Board.tsx`: the Board.
- Kits: `src/generator/kit-brightside.json`, `kit-stand-on-business.json`, `kit-nightfall.json`.
- Nightfall's art: `public/kit-art/nightfall/` (logo, grounds, portraits, six finished cards and a back, three
  Locations, event, season, missions, Mansa Musa).
- Nightfall's authoring scripts: `scripts/kits/nightfall/` (the look writer, the shared board author in points, the
  start and match board authors, the card composer, the frame grabber, the probe and the screenshot script, a README).
  Re-running them regenerates the kit document and its boards from numbers.
- The phone-cut scripts (sprites for the game's own Unity UI): `scripts/cut/sob-phone/`.
- The game's content that drives card text and figures: `legacygame/src/engine/content/characters.ts`;
  its start screen: `src/ui/screens/StartScreen.tsx`; its match: `MatchScreen.tsx`, `components/Battlefield.tsx`,
  `components/Hud.tsx`; its card layout: `components/CardFace.tsx` and `docs/card-template.md`.

**State as of this writing**
- Live on uikitmaker.com (build 1cd6007): the device-stage pulldown; Nightfall (staged) with its Start screen and
  Match boards on the iPhone 18 Pro landscape stage, in the glass look; the wallet chip's swapped glyph; three rounds
  of Unity un-burning for Brightside; the ramp fix; the cut road.
- Held: the two deliveries into the game repo (`docs/ui-kit-cut/mobile` and `mobile-2`), pending another UI pass.
- Pending Chevon: release notes for this batch; a look at a fresh Asset Store export before the next store submission.
- Known nice-to-haves: the mission row's "+" glyph does not exist as a stock glyph (a dot is used); thin vertical
  dividers are stamps of "|"; the gem chip's glyph colour comes from the clone's icon colour.

---

## 11. Glossary

- **Piece**: one component as the kit renders it. **Clone**: a copy of a piece with its own design.
- **Fork / design**: a per-piece override of the kit's dials.
- **Stamp**: a free word on a board in the kit's lettering. **Art item**: a picture on a board.
- **Board**: an artboard. **Stage**: the board's device size in points (or 1920 × 1080 for Wide).
- **Strip**: a panel in its wide low pose. **Standard**: our word for the Play plate (a banner or hex silhouette).
- **Named kit**: a shipped kit with a showcase page. **Staged**: admin-only until released.
- **Lane**: who may edit which files. **Blessing**: Chevon's per-change go-ahead.
- **Cut**: the sprite deliverable for the game's own Unity UI (crops, nine-slice margins, label faces, a manifest).
- **Nine-slice**: a sprite that stretches by its middle; **seat**: where a live child (word, glyph, well) sits on its
  plate; **rider**: a word that moves with a tilted plate; **well**: the dark recess under a fill or portrait.
- **Preview**: the Vercel deployment of a branch. **Build stamp**: "build <sha> · <date>" in the footer.
