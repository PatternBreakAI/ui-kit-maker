# Output claims — the source of truth for marketing copy

Living document. **Nothing about export capability goes on the front door,
the pricing page, an ad, or a store listing unless it appears here as
APPROVED.** If a claim isn't in this file, it hasn't been checked against
the code, and we don't make it.

Why this exists: the compatibility band ("Lands in the tools you already
use") drifted from what the exporters actually produce — it claimed
"layered PNGs", a thing the PNG format cannot do. Marketing copy has to be
downstream of the code, not parallel to it. The band is written in the
front-door workstream and the exporters live here, so this file is the
handshake between them: **the front door may say anything this file marks
APPROVED, and nothing it doesn't.**

Three statuses are used throughout:

| Status | Means |
|---|---|
| **APPROVED** | Verified against the exporter source. Safe to publish verbatim or paraphrased. |
| **NEEDS TEST** | Plausible, but depends on a third-party app's importer. Open the file in that app before publishing. |
| **NEVER** | Factually false. Do not say it, do not imply it. |

---

## 1. What we actually produce

Verified against `src/generator/exportUtils.ts`, `engineExport.ts` and
`bevel.ts` at v85.

### 1.1 Single component

| Artifact | Reality |
|---|---|
| **SVG** (`Export SVG`) | One `<svg>` per component/state. Real vector geometry, gradients and SVG filter effects. Layer groups carry both `id` (e.g. `abc_shell`) and `data-part` (`cast-shadow`, `contact-shadow`, `outer-glow`, `extrusion`, `shell`, `face`, `pattern`, `inner-glow`, `bloom`, `gloss`, `specular`, `texture`, `content`, `label`, `icon`). No `version` attribute is emitted — the syntax is SVG 1.1-compatible; `version` has been deprecated since SVG 2 and importers ignore it. |
| **PNG** (`Export PNG`) | Flat transparent raster, rendered through the browser's own SVG rasterizer. **1×** for guest and free, **up to 4×** for Pro. |
| **Copy SVG code** | The same SVG string to the clipboard. |
| **HTML** | **One self-contained `.html` file** — inline CSS, inline SVG, a Google Fonts `<link>`, and a live state-swapping demo button. There is no separate stylesheet. |
| **Settings JSON** | The full `GenConfig`, re-importable. |

### 1.2 Kit-wide (Pro)

| Artifact | Reality |
|---|---|
| **SVG pack** (ZIP) | One layered SVG per catalog entry — every component, variant and state, with content overrides baked in. Fonts are **linked, not embedded**: the README names every face with its free install link. Design tools substitute installed fonts regardless of embedding, so this costs nothing there and keeps the export free of network calls. |
| **Engine kit** (ZIP) | Atomic, **content-free**, transparent PNGs at **2×**, in `assets/`. Parts are separated for engine composition: `progress/track` + `fill`, `slider/track` + `fill` + `thumb`, `toggle/track` + `thumb`, `speedo/face` + `needle`, `speedo2/face` + `segment`, `checkbox/base`, `orb/lit` + `off`, icons as standalone tintable glyphs, `fx/drop-shadow` and `fx/glow` blobs, plus a `base-flat` variant per component with gloss/specular/pattern stripped for free tinting. Nine-slice assets are named `*.9.png`. `kit-manifest.json` carries per-asset `nativeW/nativeH`, `nineSlice` margins (in PNG pixels at 2×), `pivot`, `tintable`, `usage`, plus the palette, the typography face with its Google Fonts query, and the "nothing replaceable is baked" rules. Ships `unity/Editor/PatternBreakKitImporter.cs` (applies borders and pivots from the manifest), two example prefabs, and `unreal/README.md` with UMG recipes. |
| **Game kit** | Sprite sheet PNG at **2×**, states stacked vertically, plus `ui-<preset>-kit.json` with per-state rects, suggested nine-slice insets, and Unity/Unreal import notes. |
| **Sprite sheet** | One labelled catalog image. **A visual reference for humans, not a slicing source.** Guest gets a five-component starter sheet. |
| **LICENCE.txt** | In every Pro bundle. Names the account, issue time and reference. |
| **README.md** | In the SVG pack and engine kit: how the bundle is laid out, plus **the full recipe** — every colour role with its hex, silhouette and bevel, depth and light, gloss and specular geometry, pattern and texture, the complete typography block, and the per-state adjustments. Enough to rebuild the kit by hand in any tool. |
| **settings.json** | The complete `GenConfig` beside the README — drop it into Export › Import settings to restore the exact kit. |
| **Fonts section** (in the README) | Every face the kit uses, with its free install link and its licence link. We link rather than redistribute, so no licence file is required and none ships. Rasterized exports (sprite sheet, engine PNGs) still embed the face *during* rasterization — pixels ship, not the font, which needs no licence. |

### 1.3 Filter portability (fixed v85.1)

Every filter we emit is now **SVG 1.1**. This was a real bug, found by
opening an export in Illustrator: everything imported except the type,
which landed in the layer tree and painted nothing.

The cause was not fonts and not `paint-order`. `feDropShadow` is **not part
of SVG 1.1** — it arrived later, in the Filter Effects module — and SVG 1.1
says an element whose filter is in error is *not rendered*. Our shells
filter with `feGaussianBlur` / `feTurbulence` / `feColorMatrix` (all 1.1, so
they came through fine) while our **text** filtered with `feDropShadow`.
That is precisely the "everything but the type" signature.

All shadow and glow filters now build from a portable 1.1 chain
(`shadow11` / `shadowChain11` in `bevel.ts`): blur the alpha, offset, flood,
mask, merge. Verified pixel-equivalent in-browser — 97% of changed pixels
differ by 1/255, max delta 5, confined to the glyph edges.

**Text stays live and editable** — no outlining needed, which is the better
outcome: type you can restyle in Illustrator beats type flattened to paths.

Remaining known importer gaps, unaffected by this fix:
- `dominant-baseline="central"` is unsupported by Illustrator, which falls
  back to the alphabetic baseline — text may sit low. Worth an export-time
  `dy` pass if it proves annoying.
- `paint-order="stroke"` is unsupported there too, so a text outline paints
  over its own fill instead of behind it. Only affects pieces with the
  outline enabled.

### 1.3b Layer depth (observed, not yet addressed)

A full candy button exports as **18 groups, 17 paths, 1 text** — lean for
what it draws, but *deep*: roughly fifteen nested named groups, the
extrusion contributing six stacked wall slices, and the text last in paint
order. In a layers panel that reads as "the text is buried."

Nothing here is wrong, and the owner's judgement is that it doesn't need
fixing — a designer opening a kit asset is building a missing component,
not spelunking the tree. If it ever does matter, the cheapest improvement
is **plain layer names**: groups are currently `id="u17_shell"`, and the
uid prefix is what makes the panel ugly. The ids aren't referenced by
anything (only the defs are), so they could read `shell`, `face`, `gloss`
with no render change.

### 1.4 Motion

SMIL (`<animate>`) rides inside exported SVGs for the pieces that carry it
(spinner, globes, wheels, breathing rings). It animates in browsers. It is
**inert** in Figma, Illustrator, and every raster pipeline. See
`docs/animation-portability.md`.

---

## 2. The NEVER list

These are false today. Some were said out loud; all of them are easy to say
by accident.

| Never say | Why | Say instead |
|---|---|---|
| "Layered PNGs" | **PNG has no layer model.** It is a single raster with alpha. No tool exports a layered PNG. | "Separated, transparent PNGs meant to stack" (engine kit) or "layered SVG" (SVG pack). |
| "Layered PSD" / "Photoshop layers" | We write no PSD. | "Transparent PNGs at up to 4×, and SVG that opens as a resolution-independent Smart Object." |
| "kit.html + kit.css" | The HTML export is one self-contained file. | "A single self-contained HTML file — open it, inspect it, lift the CSS out of it." |
| "PNGs at 1× and 2×" | Single-component PNG is 1× (free) and up to 4× (Pro); kit PNGs are 2×. | "Transparent PNGs at 1×, up to 4× on Pro; engine atomics at 2×." |
| "Editable vectors in Photoshop" | Photoshop rasterizes SVG on import into a Smart Object; paths are not editable as paths. | "Opens as a resolution-independent Smart Object." |
| "Import our SVGs into After Effects" | AE has **no native SVG import**. | Point AE users at PNG sequences, or at Illustrator as the intermediate. |
| "Pixel-art ready" (Aseprite) | Our output is smooth vector-derived art, not pixel art. | "Opens as flat transparent PNGs for reference or overpainting." |
| "Your assets are protected / can't be copied" | The renderer runs in the browser; on-screen SVG is in the DOM. | "Every paid export is licensed to your account and traceable." |
| "One-click Unity setup" / "drag and drop and it just works" | The importer script is an untested bundled convenience, not the product. | "Set the manifest numbers in the Sprite Editor, or let the bundled importer script do the typing." |
| "Tested in Unity" / "tested in Unreal" | Nobody has run the kit through either engine end-to-end. | Name what ships: standard PNGs and manifest numbers that engines accept. |
| Announcing the deeper Unity export | It's roadmap, not product. | Nothing — do not announce it. |

**Newly APPROVED (v85.2):** "Every kit ships with its own recipe — every
colour, token and type setting written out, plus a settings file that loads
straight back into the app." True of the SVG pack and engine kit.

**Also APPROVED:** "Every face the kit uses is named, linked and free for
commercial use." True — the README's Fonts section. Do NOT say the fonts
are bundled; they are linked.

**Both APPROVED claims are now live on the front door** (2026-07-25): the
ownership section carries them as proof points, dict keys `ownR1` (recipe)
and `ownR2` (fonts), all seven locales.

---

## 3. Per-tool claims

The method the owner asked for: name the **parameter the app actually
accepts**, name the **pain point**, then state our answer in the product's
voice. Anything marked NEEDS TEST must be opened in that app before it goes
live — I can verify what we *write*, not what a third-party importer *does*
with it.

### Unity — APPROVED
- **Accepts:** PNG sprites; nine-slice via Sprite Editor's `Border` (L/R/T/B in pixels); pivots; `Image` component in `Sliced` mode. Editor scripts under any `Editor/` folder compile automatically.
- **Pain point:** hand-entering border values for dozens of sprites, then discovering the art baked in a label or a shadow you can't remove.
- **Our answer:** atomic content-free PNGs with the border values already in the manifest, and an importer script that applies them for you. Labels and numbers stay live engine text; shadows and glows ship as separate tintable blobs.
- **Copy (v85.3):** "Standard PNGs with every nine-slice border, pivot and size written out in a manifest — set them in Unity's Sprite Editor, or let the bundled importer script do the typing. Labels stay live engine text; nothing is baked in."
- The importer script is a **bundled convenience, untested by users** — the manifest numbers are the product. Copy must work even if the script is deleted from the ZIP.

### Unreal Engine — APPROVED
- **Accepts:** Texture2D; UMG Brush `Draw As: Box` with `Margin` as **0–1 normalized** values (not pixels).
- **Pain point:** margins are normalized, so every pixel border must be divided by the texture dimension by hand.
- **Our answer:** the manifest carries native dimensions beside the pixel margins, and `unreal/README.md` gives the conversion and the recipes.
- **Copy (v85.3):** "Box-draw margins worked out for you — native size, pixel insets and the 0–1 conversion all in the kit, with step-by-step UMG recipes."

### Godot — NEEDS TEST
- **Accepts:** PNG; `NinePatchRect` with `patch_margin_*`. Native SVG import exists and rasterizes at import scale.
- **Pain point:** SVG import scale is fixed at import time, so vector-crisp UI at multiple resolutions means re-importing.
- **Our answer:** 2× PNGs with margins that map directly onto `patch_margin_*`.
- **Test first:** confirm our `*.9.png` naming doesn't collide with Godot's own conventions.

### Figma — TESTED (owner, v85.1)
**Imports everything except font colours, patterns, and the gloss overlay.**
Geometry, gradients, layer names and live text all arrive.

Causes, in order of certainty:
- **Patterns** — we fill with an SVG `<pattern>` element. Figma has no
  `<pattern>` support at all. Not fixable without expanding the pattern to
  thousands of paths or flattening it to a raster; both are worse than the
  gap.
- **Font colours** — gradient text fills (`fill="url(#…)"` on `<text>`)
  aren't applied by Figma's importer, so type lands with a default fill.
  Cheaply fixable with a solid approximation *if it ever matters*.
- **Gloss** — undiagnosed. It's a plain path with a linear gradient in a
  clipped group, all of which Figma normally handles. Suspect the default
  "below the face" layering compositing differently.

**Deliberately not chasing this.** The Figma user isn't importing to redesign
the UI — they're there to build the one component the kit doesn't have, or
to augment one. Speed of production is the point. Missing stylistic
overlays cost them nothing; they have every piece they need to construct
what's missing. Claim structure and editability, not pixel parity.

### Illustrator — APPROVED ✅ VERIFIED (owner, after v85.1)
- **Accepts:** SVG natively; groups and `id`s become named layers.
- **Pain point:** downloaded kits open as one flattened path or a linked raster.
- **Owner's test, post-fix:** *"read everything perfectly well and was easiest
  to edit — cmd+Y, grabbed the text, all effects were read, perfect SVG
  translation and usability."* The `feDropShadow` fix (§1.3) resolved the
  invisible type completely.
- **Approved copy:** "Opens in Illustrator as a named layer tree — real
  paths, real gradients, live editable type, effects intact."
- This is our strongest design-tool claim. Lead with it.

### Photoshop — APPROVED (with the correction above)
- **Accepts:** PNG with alpha; SVG via Open/Place, rasterized into a Smart Object at a chosen size.
- **Pain point:** upscaling UI art from a screenshot-grade PNG.
- **Our answer:** true-alpha PNGs at up to 4×, and SVG that places as a Smart Object you can scale without resampling.
- **Copy:** "Transparent PNGs at up to 4×, or place the SVG as a Smart Object and scale it as far as you like."

### Penpot — APPROVED ✅ VERIFIED (owner)
*"Imports everything beautifully as SVGs."* Penpot is SVG-native and, unlike
Figma, keeps the filter effects. Approved copy: "Penpot is SVG-native — our
vectors don't get converted, they just become your file."

### Sketch · Affinity — NEEDS TEST
Same SVG story as Illustrator, which now passes cleanly, so both are likely
fine. Nobody has opened a file in either yet.

### After Effects — ⚠️ CURRENT CLAIM IS WRONG
The band lists AE against the SVG fragment. **After Effects has no native
SVG import.** Either drop AE from the SVG fragment and give it PNG only, or
route it through Illustrator explicitly. See `docs/animation-portability.md`
for the Lottie/Rive path, which is the real long-term answer for AE users.

### Krita · Blender · GameMaker · Construct 3 · Roblox · RPG Maker — APPROVED (PNG only)
Transparent PNGs and a predictable folder structure. Blender also imports
SVG as curves, if we ever want a stronger claim there.

### Aseprite — APPROVED (positioning caveat)
Factually fine — it opens PNGs. But our art is smooth, not pixel art, so
lead with "reference and overpainting," never "pixel-art ready."

### HTML / CSS — APPROVED (with the correction above)
- **Pain point:** you want the look in a real page without rebuilding it.
- **Our answer:** one self-contained HTML file with inline CSS and a live
  state-swapping demo — open it, inspect it, lift what you need.

---

## 4. Front-door audit — the compat spotlight

The band moved from five shared fragments to **per-platform commentary**
(`c_unity`, `c_unreal`, `c_godot`, `c_gm`, `c_c3`, `c_rblx`, `c_rpgm`,
`c_ase`, `c_figma`, `c_penpot`, `c_sketch`, `c_aff`, `c_ps`, `c_ai`,
`c_ae`, `c_blender`, `c_krita`, `c_web`) in
`src/marketing/landingInit.ts`, mapped one-to-one in `CTOOLS`. The
approach is right — each line names the spec the app accepts and the pain
it solves. This section keeps it honest.

### Corrected 2026-07-25 (all seven locales)

| Key | Was | Now | Why |
|---|---|---|---|
| `c_ps` | "layered, transparent PNGs at **1× and 2×**" | "Photoshop rasterizes SVG on import — place it as a Smart Object and scale it freely, or take the transparent PNGs at up to 4×…" | **Two errors.** PNG has no layer model, so "layered PNGs" cannot be true of any tool. And the scales were wrong. The Smart Object is Photoshop's real answer here. |
| `c_gm` | "clean **1× and 2×** PNGs" | "clean transparent PNGs up to 4×" | Single-component PNG is 1× free / up to 4× Pro; engine atomics are 2×. |
| `c_web` | "a live **kit.html and kit.css**" | "one self-contained HTML file with a live, clickable component… lift the CSS out of" | `downloadHtml` writes one document with inline CSS and inline SVG. There is no second file. |

### Verified good — no change needed

- **`c_godot`** — "Godot 4 imports SVG directly (static SVG 1.1, rendered by ThorVG)" is exactly the kind of specificity we want.
- **`c_ae`** — correctly avoids claiming native SVG import and routes through Illustrator. This fixed a real error in the old mapping.
- **`c_ase`** — "retouch pixel by pixel" sidesteps the pixel-art trap cleanly.
- **`c_unreal`** — Slate brush margins in JSON: true, and the manifest carries native size beside the pixel margins for the 0–1 conversion.

### Round 2 — rewritten 2026-07-25 (front door, all seven locales)

Every row of the "unverified" table below was resolved in the front-door
workstream after the owner's tests:

| Key | Now says | Basis |
|---|---|---|
| `c_ai` | "Verified in Illustrator — opens as a named layer tree: real paths, real gradients, live editable type, effects intact." | §3 approved copy, owner-verified. The two §1.3 caveats (`dominant-baseline`, `paint-order`) are real but didn't affect the test; not led with. |
| `c_figma` | "Imports as structure, not a screenshot — real paths, named layers, live text. Every piece you need to augment a component or build the one the kit doesn't have, fast." | Owner test: everything imports except font colours, patterns, gloss. Claims structure/editability, never pixel parity. "Fully editable vectors" dropped. |
| `c_penpot` | Kept, plus "…filter effects included." | Owner-verified; Penpot keeps the filters Figma drops. |
| `c_sketch` | "Sketch imports SVG 1.1, and that's exactly what we write — named groups, real paths, live gradients in every file." | Modest: claims our file format and Sketch's accepted spec, not an untested import outcome. |
| `c_aff` | Same shape as Sketch ("…and that's exactly what we write"). | Untested; modest until someone looks. |
| `c_unity` | "…atomic, content-free PNGs with the nine-slice borders already in the manifest, and our editor importer applies them for you. Nothing typed by hand, nothing baked in." | "Sprite atlas" and "UI Toolkit" removed; names the shipped importer per §3. |
| `c_rblx` | "…nine-slice margins in the manifest that convert straight to SliceCenter." | "Match" → "convert": L/R/T/B margins are convertible to a SliceCenter Rect, not identical. |
| `exn_svg` (export-menu note) | "Layered vectors — fonts named and linked, free to install. Verified in Illustrator; SVG-native in Penpot; opens straight in the browser." | Said "fonts embedded" (NEVER since v85.2) and "opens clean in Figma". |

### Round 3 — engine lines corrected 2026-07-25 (front door, all seven locales)

Round 2's `c_unity` leaned on the importer script, which no one has
tested. Both engine lines now claim the assets and the manifest numbers —
which stand on their own — with the importer demoted to a mentioned
convenience:

| Key | Now says | Basis |
|---|---|---|
| `c_unity` | "Standard PNGs with every nine-slice border, pivot and size written out in a manifest — set them in Unity's Sprite Editor, or let the bundled importer script do the typing. Labels stay live engine text; nothing is baked in." | §1.2 engine kit: PNGs + `kit-manifest.json` (`nineSlice`, `pivot`, `nativeW/H`). Manual path is primary; script is optional. |
| `c_unreal` | "Box-draw margins worked out for you — native size, pixel insets and the 0–1 conversion all in the kit, with step-by-step UMG recipes." | §1.2: manifest carries native dimensions beside pixel margins; `unreal/README.md` has the conversion and recipes. |

Chips unchanged: Unity's roadmap chip stays off (announcing the deeper
tested export is on the NEVER list), Unreal keeps its fairly-earned flag.

### ⚠️ Unverified — resolved by Rounds 2–3 above; kept for history

| Key | The claim | What to check |
|---|---|---|
| `c_figma` | "SVG pastes straight in as **fully editable vectors** — every piece, every layer" | Figma has no SVG filter-primitive support. Our shadows, glows and noise are `feGaussianBlur` / `feTurbulence` / `feColorMatrix`. Paste one real export into Figma and look. **This is the single highest-risk claim on the page.** |
| `c_penpot` | "Every path, gradient, and group stays **exactly** as exported" | Same filter question, stated even more absolutely. "Exactly" is a strong word. |
| `c_ai`, `c_sketch`, `c_aff` | "SVG 1.1 … fully editable" | Illustrator and Affinity generally handle SVG filters better than Figma, but nobody has opened a file yet. |
| `c_unity` | "PNG **sprite atlas**" and "straight into UGUI **or UI Toolkit**" | We ship *atomic files* plus a separate catalog sheet, not a packed atlas. And the importer targets sprites/UGUI; UI Toolkit is a different asset pipeline. Both are small overstatements worth tightening. |
| `c_rblx` | "9-slice insets that **match** SliceCenter" | Roblox's `SliceCenter` is a Rect of offsets; our manifest gives L/R/T/B margins. Convertible, but "match" implies drop-in. |

### Still open

~~Unity and Unreal carry the `NATIVE EXPORT ON THE ROADMAP` flag~~ —
resolved 2026-07-25: Unity's flag is **dropped** (the spotlight line now
names the shipped importer instead, which is the stronger and truer
statement). Unreal (README recipes only) and Godot keep the flag, fairly.

---

## 5. Should we build any of it? — cost vs. claim earned

Ranked by claim-per-hour. Nothing here may be advertised until it ships.

| Build | Cost | Claim it earns | Verdict |
|---|---|---|---|
| **Open one export in Figma + Illustrator** | ~30 min, no code | Unlocks or kills the `c_svg` "fully editable" claim, and settles Sketch/Affinity/Penpot with it | **Do this first.** It's the cheapest item on the list and it gates our strongest design-tool claim. Right now we're under-claiming because nobody has looked. |
| **Per-part PNG layers** (numbered folder, stacks back to the original) | ~2 h — the `data-part` stamps already exist, so it's render-with-parts-hidden + rasterize + zip | "Every layer as its own transparent PNG" — the honest answer to the "layered PNGs" question, and something no competitor bundles | **Worth it.** Genuinely low-hanging because Smart Help already did the hard part. |
| **OpenRaster `.ora`** | +30 min *if built on the item above* — it's a ZIP of those same PNGs plus a `stack.xml` | "Opens as a layered document in Krita, GIMP and Photopea" — and Krita is already on the compat band with only a PNG claim | **Worth it, bundled with the above.** Standalone it isn't; together they're one pipeline. |
| **PSD writer** | ~1–2 days of binary-format work | "Layered PSD" — the format people ask for by name | **Skip for now** (owner's call, and I agree). Revisit only if Photoshop users actually ask; `.ora` opens in Photopea, which absorbs some of the demand. |
| **Server-side rasterizer** | ~1 day + a real fidelity risk | Nothing customer-facing | **No.** Already assessed under billing: our filters degrade in every server rasterizer tested-for. |

The pattern worth noticing: the two cheap builds are cheap *because of work
already done for other reasons* — the `data-part` stamps came from Smart
Help, the ZIP writer from the SVG pack. That's where to keep looking for
low-hanging fruit.
