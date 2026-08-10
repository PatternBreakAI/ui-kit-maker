# The Free Kit — Unity Asset Store funnel brief

Drafted 2026-08-09. Sources: Unity's submission guidelines — now VERIFIED
against the real page (owner capture, 2026-08-10; page dated 2026-05-20;
full normative text + delta log + P2 checklist in
`UNITY-SUBMISSION-GUIDELINES.md`) — the Asset Store content-transparency
policy, category research, and Jimi's field notes (our one real Unity-dev
data point). The old caveat about second-hand clause text is closed; every
compliance claim below held up, with the deltas noted in that doc (lossless
in-package images, the "AI description" field rules, the no-human-effort-
words rule for AI content).

## 1. The play

A genuinely excellent FREE game-UI kit on the Unity Asset Store. The kit is
the ad, but it must never feel like one: complete, polished, over-delivered
— the review we want is "I can't believe this is free." The conversion hook
is unique to us and no competitor can copy it: **this exact kit was
generated, and you can remix it** — same components, your colors, your
fonts, your shapes — at uikitmaker.com, in minutes, free to try.

## 2. The compliance box (what the store allows — design inside it)

1. **Fully functional, zero strings.** No artificial limits, no DRM, no
   registration or sign-up required to use anything in the package. The kit
   must be complete on its own; the site is an invitation, never a
   dependency.
2. **Links.** Linking our OWN site is allowed (publishers are required to
   have an actively maintained website). Linking other marketplaces is
   forbidden. The asset must not read as primarily an advertisement — the
   funnel lives in the README and description as "made with / remix at,"
   and the ART carries no watermarks or URLs.
3. **Fonts.** OFL faces are compatible. Ship `Third-Party Notices.txt`
   listing every face + its OFL text, and the store description must carry
   the notice line ("Asset uses <font> under SIL OFL; see Third-Party
   Notices.txt"). Nothing GPL/LGPL/attribution-required anywhere in the
   package. TMP font assets derive from OFL faces — name the source faces
   and carry their license texts.
4. **AI disclosure.** Generative-AI content must be declared in a dedicated
   field. Our renders are deterministic procedural engine output — not
   generative AI — so the honest declaration is "none." Be ready to explain
   the engine to a reviewer in one sentence; never blur the line in
   marketing ("procedurally generated," not "AI").
5. **Quality bar.** Clean folder structure, real documentation, demo
   scene(s), honest marketing images that show the actual package. Standard
   key-image sizes; no pricing text or third-party logos in images.
6. **Free→paid mechanics on-store** (lite/upgrade paths) exist but are NOT
   our play — our "paid" is the SaaS, off-store. That keeps us out of the
   upsell-rules entirely.

## 3. The field (what we must beat)

- **Category king (paid):** LAYERLAB's GUI PRO series (~$40+). The Casual
  kit ships 240+ prefabs, 52 demo scenes, icon sets — the polish bar.
  Weaknesses buyers actually cite: one baked art style ("too cartoony for
  PC/console"), PSDs no longer included, static art — a recolor is a
  Photoshop project. Restyling is our entire product.
- **Paid runner-up:** Modern UI Pack — minimal style + scripts/animations.
- **The free tier is sprite dumps.** Icons + button PNGs, few or no
  prefabs, no fonts, no states, no 9-slice discipline, no demo scenes. The
  best free kits top out around "50 icons, 5 button types, sample pages."
  Nothing free ships wired prefabs with four states, fonts, honest slices,
  and screens. That's the gap we drive through.

## 4. The DNA to keep (Jimi's list, verbatim source of truth)

Loved — these are the kit's signature moves:
- The self-customizing README ("amazing… very cool") — ship the
  presentation-deck README, tuned by hand for this kit.
- Drag-the-folder-in install. Re-export "worked great."
- The health orb ("I love the inclusion of the health orb!") — it goes in
  the free kit, with the honest fill contract he asked for.

Complained — every one is fixed and becomes the free kit's floor:
layout-safe glow (his #1), buttons that reset properly, measured 9-slice,
family-named files, Unity-native Toggle checkboxes with no baked check,
prefabs that ARE the thing their name says, working ScrollView, honest orb
fill. The listing copy can say, truthfully: built with a working game
developer's field notes.

## 5. The over-deliver spec

**The series is KITMAKER** (owner, 2026-08-10). Every kit we ever list is a
member, so each listing sells the others — the model that made LAYERLAB's
"GUI PRO – …" own its category. Title shape:

> **KITMAKER: 〈Name〉 — Free Casual Game UI Kit**

**CASUAL PIVOT (owner, 2026-08-10):** *"we should probably stick with the
casual games category and not try to be all things to all people."* The
free kit sells to ONE buyer — the casual/mobile dev (match-3, merge, idle,
puzzle) — and every word, scene and piece aims at them. This is also where
the field is weakest: the paid king's casual kit is the one buyers call
"too cartoony to restyle," and restyling is our product.

**LAUNCH STYLE — SALT PINK (owner, 2026-08-10: "more marketable").** The
live hero kit: hot-pink candy over deep magenta, ice-mint glow, Bruno Ace
italic 900, twill face pattern, tavern silhouette. Snapshot captured from
the hero lineup into `salt-pink.settings.json` (probes and shot scripts
run against it). This supersedes "Lizard, lizard" as the shipping style;
the lime kit stays a strong second listing later.

Three jobs: **KITMAKER** is the family (and points at uikitmaker.com
without reading as an ad), **〈Name〉** is the look, and the trailing phrase
is what casual devs actually search. **"Emerald Tavern" is RESCINDED**
(owner, 2026-08-10: conjures booze) — and with Salt Pink as the launch
style, the recommendation writes itself:

1. **Salt Pink** *(recommended — it's already the kit's name, candy voice,
   marketable on its face: "KITMAKER: Salt Pink — Free Casual Game UI Kit")*
2. Pink Salt (the seasoning read, if the inversion sits better)
3. Bubble Punch
4. Taffy Pop

### The six casual demo scenes — the SCENES are the spec

Owner (2026-08-10): *"let's get some casual game scenes outlined."* The
component list is derived from what these scenes genuinely need ("no square
pegs in round holes"):

1. **Main Menu** — logo frame, big PLAY, settings + no-ads icon buttons,
   daily-gift teaser with notify dot, currency row, player avatar.
2. **Level Select map** — level nodes on a winding path, path connectors,
   star ratings, locked nodes, hearts/lives with a refill timer, chapter
   header banner.
3. **Gameplay HUD** — goal/score top bar, move counter, progress toward
   goal, boosters rail with counts, combo pop, pause icon button.
4. **Level Complete** — the star moment: star rating burst, big score
   count-up, reward cards + quantity badges, CLAIM / NEXT / REPLAY.
5. **Shop & Daily Rewards** — price buttons with ribbon, daily-reward
   cell strip, chest + gift box opening, currency packs, segmented tabs.
6. **Settings + Loading** — toggles, sliders, segmented control on a
   window over a scrim; loading bar with a tip line.

### The component set — casual, scene-derived (~33)

| Group | Pieces |
| --- | --- |
| Buttons (5) | Primary, Secondary, Small, Icon button, Price button |
| Selection (4) | Toggle, Checkbox, Slider, Segmented control |
| Containers (5) | Panel, Header banner, Settings row, Dialog, Tooltip |
| Map & progression (6) | Level node, Path connector, Star rating, Progress bar, XP bar, Loading bar |
| Meters & counters (6) | Hearts meter, Energy meter, Move counter, Combo, Big number, HUD counter |
| Economy & rewards (5) | Daily cell, Chest, Gift box, Reward card, Claim button |
| Feedback + signature (2) | Toast, **Health orb** *(the Jimi piece — stays as the signature bonus)* |

Nearly all of this already lives in the catalog (the casual pack, the
rewards & chests pack) — the pivot costs scenes and words, not new engine
surface. The fantasy-flavored pieces (quest tracker, mini-map, dialogue
box, inventory grid, vital bar, equipment quadrant) stay in the PRODUCT,
just not in this kit's curated set.

**Advertise the numbers buyers compare, not the component count.** ~33
components across four states and three sizes is roughly **300 sprites and
~35 wired prefabs** — all true, all countable.

### New pieces — audited against the engine (2026-08-10)

Owner's bless: "let's make whatever we need." The audit halved the list —
two of the four flagged pieces already exist:

- ~~Vertical scrollbar~~ — **already exists**: the `scrollbar` component IS
  vertical (sunken track, candy thumb, stamped drag track).
- ~~ScrollView viewport~~ — **already ships**: the importer assembles a
  wired ScrollView prefab (frame + handle sprites, `ScrollViewPrefab`),
  built after Jimi's field report.
- **Window — BUILD.** `panel` is a bare container: no title bar, no close.
  Compose it in the IMPORTER (panel shell + header-banner title strip +
  icon-button close, saved as `Window.prefab`) rather than as a new engine
  component — same pattern as CheckboxToggle/ScrollView, no new app
  surface, no staging gate needed, and every Pro export gets it too.
- **Scrim — BUILD.** A small white 9-slice + a full-stretch tinted
  `Scrim.prefab` in the importer. Trivial; Settings and Dialog both use it.

Both new prefabs are P2 exporter work with the usual zip-content probe, and
land as their own PR before the package build.

### The rest of the package

- **All four states** per piece, union-cropped, Sprite-Swap prefabs wired
  for hover/press/disabled.
- **TMP font assets + live labels** — no free competitor ships fonts at
  all. Bruno Ace, OFL, listed in `Third-Party Notices.txt`.
- **Measured 9-slice everywhere** + the tiled-face option, which Salt
  Pink's twill pattern makes load-bearing rather than a footnote.
- **Six demo scenes** built by our importer — the casual six above: menu,
  level map, gameplay HUD, level complete, shop/daily, settings+loading.
- **The remix hook:** the kit's own settings JSON ships in the package +
  one README page: "this kit was generated — remix it at uikitmaker.com."
- **Marketing strip:** the same kit rendered in six styles ("one kit,
  infinite reskins") — honest, because the engine really does it, and it IS
  the funnel message.

Target size: 300+ sprites, 35+ prefabs, 6 scenes, fonts, docs — larger than
any free kit in the category, smaller and more curated than the $80 kings.

## 6. Owner decisions

1. **The style — SUPERSEDED 2026-08-10: launch is SALT PINK** (owner:
   "more marketable"). Hot pink over deep magenta, ice-mint glow, Bruno
   Ace italic 900, twill pattern, tavern silhouette — the live hero kit,
   snapshot in `salt-pink.settings.json`. "Lizard, lizard" stands down to
   second-listing material. Consequences that carry over:
   - The **patterned face** story survives (twill instead of waves) — the
     tiled-faces option and the Sliced-vs-Tiled note keep their README place.
   - **Bruno Ace is a Google/OFL face** — `Third-Party Notices.txt` and the
     store-description notice line name it now (not Titan One), exactly the
     §2.3 mechanism.
   - Backdrop plates avoid pink/magenta (the UI owns pink) per
     `FREE-KIT-BACKDROP-SPEC.md`, keyed casual-bright.
2. **The name — DECIDED 2026-08-10: "Salt Pink"** (owner, closing the same
   day it opened). Full title: **KITMAKER: Salt Pink — Free Casual Game
   UI Kit**. "Emerald Tavern" rescinded (conjured booze); the launch
   style's own name takes the marquee.
3. **Publisher identity** (PatternBreak) — account setup is owner-side:
   publisher profile, support email, the site link. *Open.*
4. **Component list — REWORKED 2026-08-10 for the casual pivot:**
   scene-derived from the six casual scenes, ~33 pieces, and new assets get
   built where the scenes need them ("no square pegs in round holes").
   List in §5; add/cut still welcome.
5. **Plates — SUPERSEDED BY BOARDS-TO-SCENES (owner, 2026-08-10):** *"if
   we complete Boards to Scenes we won't need this."* The demo scenes are
   composed as BOARDS in the app — the owner uploads whatever background
   art each scene wants (their FLUX tool or anything else), and the
   Boards→Scenes exporter carries the full-res original into the Unity
   package. No spec'd plate deliverable, no plate zip. The backdrop
   spec's palette + composition rules survive as GUIDANCE for that board
   art (avoid pink, calm center, casual-bright); the delivery pipeline
   section is retired. Store marketing images become screenshots of the
   same boards.
6. **Staged pieces — RELEASED 2026-08-10 (owner-side):** the owner flipped
   everything they want live from the staging bay on preview; the rest
   stays gated "for now." The package build reads `componentReleases` at
   export time, so the shipped set self-resolves to released pieces only —
   if a piece in the §5 table is still gated at package time, it either
   gets released then or drops from the free kit.

## 7. Phases after bless — P2 plan of record (2026-08-10)

P1 listing shell: publisher account (owner-side, in progress), key images
(screenshots of the demo boards), description + notices (Bruno Ace line).

P2 package build — **Boards→Scenes is the critical path** (owner: the
demo scenes come from boards, retiring the plate pipeline; "make sure the
boards hand off is as seamless as possible"):

1. **Big-image backgrounds** — upload the full-res original once; the
   Board shows a ~1280px browser proxy (drag stays silky); the ORIGINAL
   bytes persist and ship in the export. Prerequisite for scenes.
2. **Boards→Scenes exporter** — the board doc (positions, scales,
   rotations, per-copy words, per-copy values, background) rides the
   Smart Zip; the importer builds a ready Canvas scene per board:
   open, press Play, buttons live with their own words on real TMP
   labels (never baked), anchored by zone (corner/edge/center) so
   layouts survive resolution changes. Window + Scrim prefabs and the
   ScrollView check ride this milestone (§5).
3. **Owner composes the six casual demo boards** in Salt Pink — their
   backgrounds, their copy. This IS the creative deliverable that used
   to be the plates.
4. **Package build**: released pieces only, engine exporter, hand-
   polished README deck, Third-Party Notices (Bruno Ace/OFL), console-
   clean Unity test pass (Jimi-style: real project, layout groups,
   toggles, scroll view, Fast Enter Playmode).

P3 submit via 2022.3; expect a review cycle; iterate on feedback.
