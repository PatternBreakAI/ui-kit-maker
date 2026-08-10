# The Free Kit — Unity Asset Store funnel brief

Drafted 2026-08-09, for the owner's bless before any code. Sources: Unity's
submission guidelines (via secondary coverage — assetstore.unity.com is
blocked from this container; verify exact clause text once during listing
prep), the Asset Store content-transparency policy, category research, and
Jimi's field notes (our one real Unity-dev data point).

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

## 5. The over-deliver spec (draft for bless)

- **~20 curated components** (from our 115): primary/secondary/small/icon
  buttons, toggle+checkbox+radio (Unity Toggle-wired), slider, progress +
  segmented bar, panel, header, data row, item slot, dropdown, input,
  chip, **health orb**. Curated spread, not a dump.
- **All four states** per piece, union-cropped, Sprite-Swap prefabs wired
  for hover/press/disabled.
- **TMP font assets + live labels** — no free competitor ships fonts at
  all.
- **Measured 9-slice everywhere** + the tiled-face option for the patterned
  face (with the Sliced-vs-Tiled trade-off note).
- **Three demo scenes** built by our importer (main menu, settings, HUD) —
  the Playground machinery already constructs scenes on import.
- **The remix hook:** the kit's own settings JSON ships in the package +
  one README page: "this kit was generated — remix it at uikitmaker.com."
- **Marketing strip:** the same kit rendered in six styles ("one kit,
  infinite reskins") — honest, because the engine really does it, and it IS
  the funnel message.

Target size: 200+ sprites, 25+ prefabs, 3 scenes, fonts, docs — larger than
any free kit in the category, smaller and more curated than the $80 kings.

## 6. Owner decisions

1. **The style — DECIDED 2026-08-10: "Lizard, lizard."** Tavern silhouette,
   Titan One, acid lime over deep green with a waves face pattern. Judged
   against "Spin & Win" on real composited menu mockups: the green candy
   reads cleanly on a dusk backdrop at every level of the stack, where the
   gold kit's secondaries went pale. Two consequences worth carrying:
   - It shows off the **patterned face**, so the tiled-faces option and the
     Sliced-vs-Tiled note earn their place in the README.
   - **Titan One is a Google/OFL face** — it goes in `Third-Party Notices.txt`
     with the notice line in the store description, exactly as §2.3 planned.
   - Backdrop plates go **cool** (teal / indigo / slate, no green) per
     `FREE-KIT-BACKDROP-SPEC.md`. The Plate A candidates already do.
2. **The name.** Kit-branded ("Lizard, lizard UI Kit — Free") vs
   maker-branded ("UI Kit Maker: Starter Kit"). *Open.*
3. **Publisher identity** (PatternBreak) — account setup is owner-side:
   publisher profile, support email, the site link. *Open.*
4. Bless the component list in §5 (add/cut). *Open.*
5. Pick the Plate A candidate (both measure clean once the top-edge band is
   cropped; see the backdrop spec). *Open.*

## 7. Phases after bless

P1 listing shell: publisher account, key images, description + notices.
P2 package build: curate the kit, run the engine exporter, hand-polish the
README deck, importer-built demo scenes, Unity test pass (Jimi-style: real
project, layout groups, toggles, scroll view).
P3 submit; expect a review cycle; iterate on feedback.
