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

## 5. The over-deliver spec

**The series is KITMAKER** (owner, 2026-08-10). Every kit we ever list is a
member, so each listing sells the others — the model that made LAYERLAB's
"GUI PRO – …" own its category. Title shape:

> **KITMAKER: Emerald Tavern — Free Fantasy UI Kit** *(owner, 2026-08-10)*

Three jobs: **KITMAKER** is the family (and points at uikitmaker.com without
reading as an ad), **Emerald Tavern** is the look — the acid-green candy on
the tavern silhouette, named exactly right — and the trailing phrase is what
devs actually search. "Lizard, lizard" remains the internal working name for
the settings file; every outward surface says Emerald Tavern. (KITMAKER-
colon vs KITMAKER-dash is a listing-time nit; the words are settled.)

### The component set — the SCENES are the spec

Owner's rule (2026-08-10): *"let's make new assets if we need them for the
scenes, no problem, no square pegs in round holes."* So the list is derived
from what the six demo scenes genuinely need, not from a target count. That
lands at **32**, not the 20 first drafted — the Settings and HUD screens
alone eat a dozen before either looks real.

| Group | Pieces |
| --- | --- |
| Buttons (5) | Primary, Secondary, Small, Icon button, Chip |
| Selection (5) | Toggle, Checkbox, Radio, Slider, Dropdown |
| Text entry (2) | Input field, Search field |
| Navigation (2) | Segmented control *(doubles as the tab bar)*, Scrollbar |
| Containers (5) | Panel, Header banner, Settings row, Data row, Tooltip |
| Items (3) | Item slot, Inventory grid, Rarity frame |
| Bars (4) | Progress bar, Segmented bar, Loading bar, XP bar |
| HUD (4) | Health globe, Hotbar, Quest tracker, Mini-map |
| Dialogue (2) | Dialogue box, Dialogue choices |

**Advertise the numbers buyers compare, not the component count.** 32
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
  all. Titan One, OFL, listed in `Third-Party Notices.txt`.
- **Measured 9-slice everywhere** + the tiled-face option, which the Lizard
  style's waves pattern makes load-bearing rather than a footnote.
- **Six demo scenes** built by our importer — main menu, settings, HUD,
  inventory, dialog, loading.
- **The remix hook:** the kit's own settings JSON ships in the package +
  one README page: "this kit was generated — remix it at uikitmaker.com."
- **Marketing strip:** the same kit rendered in six styles ("one kit,
  infinite reskins") — honest, because the engine really does it, and it IS
  the funnel message.

Target size: 300+ sprites, 35+ prefabs, 6 scenes, fonts, docs — larger than
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
2. **The name — DECIDED 2026-08-10: the series is KITMAKER.** Title shape
   and reasoning in §5. The individual kit name (replacing the internal
   "Lizard, lizard") is still open.
3. **Publisher identity** (PatternBreak) — account setup is owner-side:
   publisher profile, support email, the site link. *Open.*
4. **Component list — DECIDED 2026-08-10:** scene-derived, 32 pieces, and
   new assets get built where the scenes need them ("no square pegs in
   round holes"). List in §5; add/cut still welcome.
5. **Plate A — DECIDED 2026-08-10: Candidate 2**, the torches-and-banner
   frame (`plate-a-menu-2.png`). Plate B is back with the edge artifact
   fixed but under-sized; see the backdrop spec field notes.

## 7. Phases after bless

P1 listing shell: publisher account, key images, description + notices.
P2 package build: curate the kit, run the engine exporter, hand-polish the
README deck, importer-built demo scenes, Unity test pass (Jimi-style: real
project, layout groups, toggles, scroll view).
P3 submit; expect a review cycle; iterate on feedback.
