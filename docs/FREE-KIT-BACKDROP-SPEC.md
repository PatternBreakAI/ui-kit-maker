# Free kit — scene backdrop spec

Companion to `FREE-KIT-BRIEF.md`. What art the demo scenes need from
outside the engine, exactly how it must be built, and what we do NOT need.

## The short answer

**Four images.** Three ship inside the package (demo scene backdrops), one
is for the store cover only. Every other surface in the kit is drawn by our
engine — components, icons, patterns, type — and needs no outside art.

## Scene → backdrop map — CASUAL (reset 2026-08-10)

**The owner is re-rendering all plates in the casual direction with a new
tool** (FLUX.1 Dev + a game-backgrounds LoRA); the fantasy-dusk Plate A/B
picks below survive as field notes only. Six casual demo scenes (see the
brief §5), still four generated plates:

| Scene | Backdrop | Where it comes from |
| --- | --- | --- |
| Main Menu | **Plate A** — sunny menu hero | generated |
| Level Select map | **Plate B** — world-map terrain (a winding-path landscape seen from above/at a tilt; the nodes composite ON the path) | generated |
| Gameplay HUD | **Plate C** — the play-space backdrop behind a board/level | generated |
| Level Complete / Shop / dialogs | Plate A or C, blurred + darkened | derived in-house |
| Settings + Loading | Plate A blurred (settings) / Plate C (loading, calm bottom) | derived / reused |
| *(store cover image — not in package)* | **Plate D** — abstract stage | generated |

Deriving the blurred/darkened variants in-house keeps the scenes visually
coherent (a popup sits over ITS game, behind frosted glass) and halves the
generation work. Plate B's job changed the most: a casual level-select map
IS its background — leave the path readable and the node line clear.

## The new tool (owner, 2026-08-10)

FLUX.1 Dev with the "Game Backgrounds" LoRA — the first courtyard test
render conforms to this spec's composition rules beautifully (calm center,
off-center interest, low-frequency detail). Two handling notes:

- **It renders 1344 × 768 — that's 7:4, NOT 16:9** (16:9 at that width is
  1344 × 756). If the tool takes explicit dimensions, ask for a 16:9 size;
  otherwise we crop 12 rows in-house (6 top / 6 bottom) to exact 16:9 and
  upscale to 1920 × 1080 (~1.43×). That's a bigger stretch than the 1.15×
  we proved on the ChatGPT plates — fine for soft low-frequency art, but
  verify each plate at 100% after the upscale before it enters the package.
- **Delivery still PNG** (chat pastes don't reach the build container —
  zips do).

## Universal specs — every plate

**Delivery**
- **2560 × 1440**, 16:9 exactly. PNG, no alpha.
- 2–3 candidates per plate is ideal; we pick together.
- Filenames: `plate-a-menu`, `plate-b-gameplay`, `plate-c-loading`,
  `plate-d-cover` (+ `-1`, `-2` for candidates).

**What we do with them**
- Downscale to 1920 × 1080 **PNG** for the package. (Corrected 2026-08-10:
  the verified submission guidelines require lossless formats for all
  in-package images outside Tools/Add-Ons/Audio — 2.4.3.a. The JPEG plan
  is dead; PNG runs a few MB per plate against a 6 GB cap, a non-issue.)
- Unity import: Max Size 2048, sRGB on, mipmaps off, Normal compression.
- The importer's Canvas is `ScaleWithScreenSize` at a **1920 × 1080
  reference resolution** — that's why 16:9 masters, and why edge content is
  unsafe (see below).

**Composition rules — these are what make UI readable on top**
1. **The middle 60% must be quiet.** Menus, panels and dialogs sit there.
   Push all visual interest into the outer thirds.
2. **Plate C extra:** keep the **bottom 25%** and **top 15%** especially
   calm — the goal bar, move counter and booster rail live in those
   strips (and the loading bar reuses the calm bottom).
3. **Plate B extra:** the winding path stays BARE and readable end to end
   — our level nodes composite onto it.
4. **Nothing important within 8% of any edge.** Unity crops these plates on
   ultrawide and 16:10 displays.
4b. **The brightest point of the whole frame sits OUTSIDE the middle 60%.**
   Stronger than "keep the centre quiet," and the rule the first Plate A
   candidate bent — its sun landed at 36%/48%, right beside the menu column.
5. **Value: casual-bright, sunny key** *(re-keyed 2026-08-10 for the casual
   pivot — the old "mid-to-dark dusk" rule is retired)*. Cheerful daylight
   is the category's language, BUT the UI zones stay protected: keep the
   middle 60% and the HUD strips a half-stop deeper and calmer than the
   frame, and never put pure-white sky directly behind a UI zone — the
   candy's own highlights must stay the brightest thing in their area.
6. **Soft focus.** Shallow depth of field, aerial haze — these read as
   out-of-focus backdrops, not hero illustrations.
7. **Low-frequency detail.** No fine speckle, no tiny repeating texture; it
   fights the 9-sliced panels and reads as noise at HUD scale.

**The negative list — paste into every prompt**

> No text, letters, numbers, logos, watermarks or signatures. No user
> interface, buttons, menus, HUD, health bars or icons of any kind. No
> centered focal subject. No faces or characters in the middle of frame. No
> borders, frames, vignette edges or letterbox bands — the image must run
> clean to all four edges. No high-contrast speckle or grain.

AI image tools reflexively paint fake UI and gibberish lettering into game
screenshots — this list is the single most important part of the prompt.

## What the first delivery taught us (Plate A, 2026-08-10)

Two candidates arrived correct on format, value, focus and palette — the
prompt works. Measured against the rules above:

| | Candidate 1 (valley) | Candidate 2 (torches) |
| --- | --- | --- |
| frame mean luminance | 0.227 | 0.215 |
| centre-60% mean | 0.269 | 0.259 |
| brightest point in centre | **0.613 at 36% / 48%** | 0.78 at 79% / 37% |

Both hold the dusk key. Candidate 1 put the sun beside the menu column
(hence rule 4b); Candidate 2's bright sky sits at the far edge of the zone,
clear of the UI.

**The one real defect, in both files:** a light grey band across the top
**five pixels**, fading out by row 8 — row 0 measured `rgb(163,166,170)`
against a real sky of `rgb(40,58,75)` six rows down. Not sky: a generator
edge artifact. Full-screen in Unity it is a bright hairline along the top of
the display, and it would appear in every store screenshot. Fixed in-house
by cropping 10px off the top and rescaling to 2560 × 1440; the negative list
above now forbids it at the source.

Verify every future plate the same way before it enters the package: sample
the outer rows and columns, and locate the frame's brightest point.

## What the second delivery taught us (Plate B, 2026-08-10)

**The edge band is gone.** Both candidates run clean to all four edges —
row 0 sits within a point or two of row 10 on every side. The negative-list
fix worked; keep that clause in every prompt from here.

**Both arrived at 1672 × 941, and the re-render (2026-08-10) came back at
exactly 1672 × 941 again — that is the tool's hard ceiling, confirmed.** So
the fallback is now the plan of record for every plate: generate at the
tool's maximum, upscale in-house to 1920 × 1080 (canvas, high-quality
smoothing) for the package JPEG. It works because the art is deliberately
soft and low-frequency — exactly the content that survives a 15% upscale.
Store screenshots composite the UI at native resolution OVER the upscaled
plate, so the crisp pixels are ours and the minimum-1200 rule is cleared
either way. Drop the "re-generate larger" ask; stop chasing 2560.

For a HUD plate the two strips matter far more than the centre, because the
HUD deliberately hugs the edges — measured against the real Lizard HUD,
nothing lands in the middle at all. Detail is neighbour-to-neighbour
contrast ×100; lower is calmer:

| | Candidate 1 | Candidate 2 |
| --- | --- | --- |
| frame mean | 0.140 | 0.148 |
| **top 15% detail** | 2.47 | **0.94** |
| bottom 25% mean / detail | 0.045 / 2.24 | 0.042 / 2.30 |
| centre 60% detail | 2.69 | 3.68 |
| brightest point | 0.921 at **13%**/48% | 0.898 at **27%**/36% |

Candidate 2's top strip is **2.6× calmer** — smooth sky where Candidate 1
has tree canopy, directly under the health globe, XP rails, quest tracker
and mini-map. Candidate 2 does put its brightest point inside the centre
60%, which rule 4b forbids on a menu plate — but on a gameplay plate the
centre carries the game, not the UI, so the rule is relaxed here and a hero
sunset there is an asset, not a defect.

Both bottoms are near-black (0.04) — the hotbar and ammo counter will pop.

**FINAL (2026-08-10): the re-rendered candidate 2** (batch `b2.zip`,
`…09_16_48 PM (2).png`) ships as Plate B. Its numbers: top-strip detail
1.06 (calm sky), bottom strip mean 0.049 with the calmest peak of any
candidate (0.254), edges clean at native resolution. Upscaled in-house to
1920 × 1080 JPEG q85 (~234 KB) and verified under the real Emerald Tavern
HUD — trackers on quiet sky, hotbar on near-black ground. Settled plates so
far: A = torches-and-banner, B = this. Still to generate: C (loading),
D (store cover stage).

## Palette — settled

The shipping style is **SALT PINK** (owner, 2026-08-10 — superseding
"Lizard, lizard"): hot pink over deep magenta, ice-mint glow, tavern
silhouette, Bruno Ace. The backdrop must be **complementary** so the UI
pops off it, so every plate goes the other way on the wheel — in the
casual-bright key:

> **Sky blues, soft teal, mint, sea green, warm sand.** Avoid pink,
> magenta and warm reds entirely — the UI owns pink (and its glow owns
> mint at HIGH saturation; pale desaturated mint in a backdrop is fine).
> Sunny, saturated, cheerful; deep dusk is retired with the fantasy
> direction.

## The prompts — casual key (rewritten 2026-08-10)

Fill `[PALETTE]` from the palette section above — sky blue / soft teal /
warm sand / lavender, never green.

**Plate A — Main Menu hero**

> A wide 16:9 background plate for a casual mobile game main menu screen.
> A cheerful stylized [SETTING] in bright sunny daylight, soft rounded
> forms, gentle rolling shapes. Atmospheric, long-lens: shallow depth of
> field, soft haze, the whole scene slightly out of focus like a backdrop
> behind a menu. The center 60% of the frame is visually quiet,
> uncluttered and a touch deeper in tone than the edges; all visual
> interest sits in the left and right outer thirds and the upper third,
> and the brightest light stays out of the center. [PALETTE] color scheme.
> Low-frequency detail, no fine speckle. Nothing important near the edges.
> [NEGATIVE LIST]

Suggested `[SETTING]`: a sunny hillside village with a winding road, a
seaside cove, a meadow with distant hills.

**Plate B — Level Select world map**

> A wide 16:9 background plate for a casual game level-select screen: a
> stylized [SETTING] landscape seen from high above at a gentle tilt, like
> a friendly board-game world map. A single soft winding dirt path curves
> from the bottom of the frame to the top — the path is plain, empty and
> clearly readable, with no markers or objects on it. Bright sunny
> daylight, soft rounded terrain, shallow depth of field toward the frame
> edges. The terrain beside the path stays calm and low-detail. [PALETTE]
> color scheme. Low-frequency detail, no fine speckle. [NEGATIVE LIST]
>
> *(the level nodes, stars and locks are OUR sprites, composited on the
> path — the plate must leave the path bare)*

**Plate C — Gameplay backdrop**

> A wide 16:9 background plate that sits behind a casual puzzle game's
> play area. A cheerful stylized [SETTING] in bright daylight, softly
> blurred as if behind glass. The center 60% is quiet, even and slightly
> deeper in tone — the game board sits there; the bottom 25% and top 15%
> are especially calm and simple — score bars and booster buttons will be
> composited there. [PALETTE] color scheme. Low-frequency detail, no fine
> speckle. [NEGATIVE LIST]

**Plate D — Store cover stage** *(not shipped in the package)*

> An abstract 16:9 graphic backdrop for a product cover image — not a
> landscape and not a scene. A smooth diagonal gradient in [PALETTE], with
> a few very large, soft geometric shapes and a gentle radial glow toward
> the upper left. Deep, rich, and clean, like a premium product photography
> backdrop. The middle 70% of the frame is completely empty and even —
> product art will be composited over it. No horizon, no objects, no
> environment. [NEGATIVE LIST]

## What we do NOT need

- **No component art, icons, patterns or type** — the engine draws every
  pixel of the UI.
- **No backdrops for the "six styles" marketing strip** — those frames show
  the kit on flat ground; the whole point is the components.
- **No portrait or square crops.** If we add a mobile-aspect screenshot
  later, it crops from these masters.
- **No separate pause/inventory art** — derived from A and B.

## One flag: the AI disclosure (rules now verified — see
`UNITY-SUBMISSION-GUIDELINES.md` 1.6)

The field is named the **"AI description"** field, and its rules are: plain
terms, no marketing language, name the SPECIFIC tools, describe the
value-adding modifications (1.6.a). Two more verified rules shape our copy:
marketing-only AI (the Plate D cover stage, which never enters the package)
needs **no** disclosure (1.6.b); and AI-assisted content may not be
described with words implying human effort — "drawn," "hand drawn,"
"painted" — anywhere in the submission (1.6.c), so the store copy for the
plates avoids the "painterly" family even though the private generation
prompts use it. The brief's compliance box planned to answer "none" — our
UI art is deterministic procedural engine output, which is a genuine
differentiator we intend to market ("procedurally generated," never
"AI").

Shipping AI-generated backdrops inside the package changes that answer to
**yes**, and the honest declaration becomes something like: *"Demo scene
backdrop images were generated with an AI image tool. All UI art —
components, icons, patterns, fonts — is deterministic procedural output of
the publisher's own engine."*

Three ways to play it:

1. **Ship them and declare precisely** *(recommended)*. Keep every AI image
   in one clearly-named folder (`Demo/Backdrops/`), declare it in that
   sentence, and the UI story stays clean and true. Plenty of listings
   carry this disclosure; the field is a checkbox, not a penalty box.
2. **Keep them out of the package**, use engine-drawn gradient backdrops in
   the demo scenes, and use the AI plates only in the store screenshots.
   Preserves the "none" answer for the package. Costs us the atmosphere a
   dev sees when they open the scenes — the weakest option for the
   "I can't believe this is free" moment.
3. **Commission or license non-AI backdrop art.** Cleanest positioning,
   real cost, and it delays the listing.

Worth a re-read of the image tool's terms at listing time: output ownership
is what makes redistribution in a commercial package viable, and it's the
kind of clause that moves.

## Store key-image sizes (for later, P1)

Not backdrops, but the same generation session may as well cover them.
Current published sizes:

- **Icon** 160 × 160
- **Card** 420 × 280
- **Cover** 1950 × 1300
- **Social** 1200 × 630
- **Screenshots** any size, minimum 1200px wide; 2400 × 1600 recommended
- 24-bit PNG, no alpha; no pricing text or third-party logos in any of them

Screenshots must show the actual package — so those come from the real demo
scenes once they're built, not from a prompt.

Sizes verified against Unity Support's marketing-image article and the
publishing guides in August 2026; confirm on the publisher portal at
listing time, since `assetstore.unity.com` is unreachable from our build
environment.
