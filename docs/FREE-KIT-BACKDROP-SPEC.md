# Free kit — scene backdrop spec

Companion to `FREE-KIT-BRIEF.md`. What art the demo scenes need from
outside the engine, exactly how it must be built, and what we do NOT need.

## The short answer

**Four images.** Three ship inside the package (demo scene backdrops), one
is for the store cover only. Every other surface in the kit is drawn by our
engine — components, icons, patterns, type — and needs no outside art.

## Scene → backdrop map

Six demo scenes, four of which share plates:

| Scene | Backdrop | Where it comes from |
| --- | --- | --- |
| Main Menu | **Plate A** — menu hero | generated |
| Settings / Pause | Plate A, blurred + darkened | derived in-house from A |
| HUD | **Plate B** — gameplay world | generated |
| Inventory (ScrollView) | Plate B, darkened | derived in-house from B |
| Dialog + Input | Plate B, as-is | reused |
| Loading | **Plate C** — loading key art | generated |
| *(store cover image — not in package)* | **Plate D** — abstract stage | generated |

Deriving the blurred/darkened variants in-house keeps the scenes visually
coherent (a pause screen IS the menu behind frosted glass) and halves the
generation work.

## Universal specs — every plate

**Delivery**
- **2560 × 1440**, 16:9 exactly. PNG, no alpha.
- 2–3 candidates per plate is ideal; we pick together.
- Filenames: `plate-a-menu`, `plate-b-gameplay`, `plate-c-loading`,
  `plate-d-cover` (+ `-1`, `-2` for candidates).

**What we do with them**
- Downscale to 1920 × 1080 and convert to JPEG q85 (~200 KB each) for the
  package — the same treatment as our site's existing backdrops
  (1920 × 1097, 140–196 KB).
- Unity import: Max Size 2048, sRGB on, mipmaps off, Normal compression.
- The importer's Canvas is `ScaleWithScreenSize` at a **1920 × 1080
  reference resolution** — that's why 16:9 masters, and why edge content is
  unsafe (see below).

**Composition rules — these are what make UI readable on top**
1. **The middle 60% must be quiet.** Menus, panels and dialogs sit there.
   Push all visual interest into the outer thirds.
2. **Plate B extra:** keep the **bottom 25%** and **top 15%** especially
   calm — HUD bars, resource counters and minimaps live in those strips.
3. **Plate C extra:** the **bottom 20%** stays simple — the loading bar
   sits there.
4. **Nothing important within 8% of any edge.** Unity crops these plates on
   ultrawide and 16:10 displays.
4b. **The brightest point of the whole frame sits OUTSIDE the middle 60%.**
   Stronger than "keep the centre quiet," and the rule the first Plate A
   candidate bent — its sun landed at 36%/48%, right beside the menu column.
5. **Value: mid-to-dark, dusk key.** Nothing brighter than mid-grey in the
   central region. Bright backdrops kill light UI.
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

## Palette — settled

The shipping style is **"Lizard, lizard"** (owner, 2026-08-10): acid lime
over deep green, tavern silhouette, Titan One. The backdrop must be
**complementary** so the UI pops off it, so every plate goes the other way
on the wheel:

> **Deep cool teal, indigo, wet slate, blue-grey stone.** Avoid green
> entirely — the UI owns green.

Both Plate A candidates already sit in this range, which is why they
composite cleanly.

## The prompts

Fill `[PALETTE]` from the palette section above — cool teal / indigo / slate.

**Plate A — Main Menu hero**

> A wide 16:9 background plate for a video game main menu screen.
> A stylized [SETTING] seen at dusk from a distance. Atmospheric and
> painterly, long-lens: shallow depth of field, aerial haze, the whole
> scene slightly out of focus like a blurred backdrop behind a menu.
> Overall value mid-to-dark — an overcast dusk key, nothing brighter than
> mid-grey in the central area. The center 60% of the frame is visually
> quiet and uncluttered; all visual interest sits in the left and right
> outer thirds and the upper third. [PALETTE] color scheme. Low-frequency
> painterly detail, no fine speckle. Nothing important near the edges.
> [NEGATIVE LIST]

Suggested `[SETTING]`: a fantasy valley with distant towers, or a stone hall
interior. Both delivered Plate A candidates took the valley and worked.

**Plate B — Gameplay / HUD**

> A wide 16:9 background plate representing a paused moment of third-person
> gameplay, camera looking out across a [SETTING]. Clear depth layering:
> soft silhouetted foreground shapes at the extreme left and right edges,
> a readable mid-ground, a hazy far background. Strong atmospheric
> perspective, shallow depth of field, mid-to-dark dusk values. The center
> 60% is quiet and uncluttered; the bottom 25% and top 15% of the frame are
> especially calm and simple — game HUD elements will be composited there.
> [PALETTE] color scheme. Low-frequency painterly detail, no fine speckle.
> [NEGATIVE LIST]

**Plate C — Loading screen key art**

> Full-bleed 16:9 key art for a video game loading screen. A dramatic
> [SETTING] with vertical interest in the upper-center of the frame.
> Slightly richer and more saturated than a background plate — this is the
> "wow" frame — but still mid-to-dark in value with soft, atmospheric
> rendering. The bottom 20% of the frame is simple and quiet, a plain
> gradient or haze, so a loading bar can sit over it. [PALETTE] color
> scheme. [NEGATIVE LIST]

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

## One flag: the AI disclosure

The store has a dedicated generative-AI disclosure field, and the brief's
compliance box (§2.4) planned to answer it **"none"** — our art is
deterministic procedural engine output, which is a genuine differentiator
we intend to market ("procedurally generated," never "AI").

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
