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
| **SVG pack** (ZIP) | One layered SVG per catalog entry — every component, variant and state, with content overrides baked in. Fonts embedded as data-URI `@font-face` (woff2) inside text-bearing files. README lists Google Fonts links for design tools. |
| **Engine kit** (ZIP) | Atomic, **content-free**, transparent PNGs at **2×**, in `assets/`. Parts are separated for engine composition: `progress/track` + `fill`, `slider/track` + `fill` + `thumb`, `toggle/track` + `thumb`, `speedo/face` + `needle`, `speedo2/face` + `segment`, `checkbox/base`, `orb/lit` + `off`, icons as standalone tintable glyphs, `fx/drop-shadow` and `fx/glow` blobs, plus a `base-flat` variant per component with gloss/specular/pattern stripped for free tinting. Nine-slice assets are named `*.9.png`. `kit-manifest.json` carries per-asset `nativeW/nativeH`, `nineSlice` margins (in PNG pixels at 2×), `pivot`, `tintable`, `usage`, plus the palette, the typography face with its Google Fonts query, and the "nothing replaceable is baked" rules. Ships `unity/Editor/PatternBreakKitImporter.cs` (applies borders and pivots from the manifest), two example prefabs, and `unreal/README.md` with UMG recipes. |
| **Game kit** | Sprite sheet PNG at **2×**, states stacked vertically, plus `ui-<preset>-kit.json` with per-state rects, suggested nine-slice insets, and Unity/Unreal import notes. |
| **Sprite sheet** | One labelled catalog image. **A visual reference for humans, not a slicing source.** Guest gets a five-component starter sheet. |
| **LICENCE.txt** | In every Pro bundle. Names the account, issue time and reference. |

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
- **Copy:** "Drops in with the nine-slice borders already set — our importer reads them straight from the manifest, so nothing is typed by hand and nothing is baked in."

### Unreal Engine — APPROVED
- **Accepts:** Texture2D; UMG Brush `Draw As: Box` with `Margin` as **0–1 normalized** values (not pixels).
- **Pain point:** margins are normalized, so every pixel border must be divided by the texture dimension by hand.
- **Our answer:** the manifest carries native dimensions beside the pixel margins, and `unreal/README.md` gives the conversion and the recipes.
- **Copy:** "Box-draw margins worked out for you — native size and insets both in the manifest, so the 0–1 conversion is done."

### Godot — NEEDS TEST
- **Accepts:** PNG; `NinePatchRect` with `patch_margin_*`. Native SVG import exists and rasterizes at import scale.
- **Pain point:** SVG import scale is fixed at import time, so vector-crisp UI at multiple resolutions means re-importing.
- **Our answer:** 2× PNGs with margins that map directly onto `patch_margin_*`.
- **Test first:** confirm our `*.9.png` naming doesn't collide with Godot's own conventions.

### Figma — NEEDS TEST ⚠️ highest-risk claim
- **Accepts:** SVG import; groups become frames/groups, `id` becomes the layer name.
- **Pain point:** kits arrive as flat images you can't restyle.
- **Our answer:** named groups per material layer — shell, face, gloss, specular, content — so the tree is readable and recolourable.
- **Test first:** **Figma has no SVG filter-primitive support.** Our shadows, glows and noise are `feGaussianBlur` / `feTurbulence` / `feColorMatrix`. They may drop or flatten on import. Open a real export in Figma and look before we promise "fully editable." This single question decides how strong the Figma claim can be.

### Illustrator — APPROVED (retest after v85.1)
- **Accepts:** SVG natively; groups and `id`s become named layers.
- **Pain point:** downloaded kits open as one flattened path or a linked raster.
- **Our answer:** the same named layer tree, plus real gradients and geometry.
- **Confirmed by the owner:** everything imports. Type was invisible until
  v85.1 — see §1.3; the cause was `feDropShadow` (not SVG 1.1), now fixed.
  Retest to confirm the type paints, then this becomes a strong claim:
  "opens as a named layer tree with live, editable type."
- **Still expect:** baseline shift (`dominant-baseline`) and outline-over-fill
  (`paint-order`) on pieces that use them.

### Photoshop — APPROVED (with the correction above)
- **Accepts:** PNG with alpha; SVG via Open/Place, rasterized into a Smart Object at a chosen size.
- **Pain point:** upscaling UI art from a screenshot-grade PNG.
- **Our answer:** true-alpha PNGs at up to 4×, and SVG that places as a Smart Object you can scale without resampling.
- **Copy:** "Transparent PNGs at up to 4×, or place the SVG as a Smart Object and scale it as far as you like."

### Sketch · Affinity · Penpot — NEEDS TEST
Same SVG story as Illustrator; same filter question. Don't publish a per-app claim until one file has been opened in each.

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

### ⚠️ Unverified — test before these stay up

| Key | The claim | What to check |
|---|---|---|
| `c_figma` | "SVG pastes straight in as **fully editable vectors** — every piece, every layer" | Figma has no SVG filter-primitive support. Our shadows, glows and noise are `feGaussianBlur` / `feTurbulence` / `feColorMatrix`. Paste one real export into Figma and look. **This is the single highest-risk claim on the page.** |
| `c_penpot` | "Every path, gradient, and group stays **exactly** as exported" | Same filter question, stated even more absolutely. "Exactly" is a strong word. |
| `c_ai`, `c_sketch`, `c_aff` | "SVG 1.1 … fully editable" | Illustrator and Affinity generally handle SVG filters better than Figma, but nobody has opened a file yet. |
| `c_unity` | "PNG **sprite atlas**" and "straight into UGUI **or UI Toolkit**" | We ship *atomic files* plus a separate catalog sheet, not a packed atlas. And the importer targets sprites/UGUI; UI Toolkit is a different asset pipeline. Both are small overstatements worth tightening. |
| `c_rblx` | "9-slice insets that **match** SliceCenter" | Roblox's `SliceCenter` is a Rect of offsets; our manifest gives L/R/T/B margins. Convertible, but "match" implies drop-in. |

### Still open

Unity and Unreal carry the `NATIVE EXPORT ON THE ROADMAP` flag, but we
already ship a working Unity editor importer and example prefabs. That
flag under-sells what's in the box. Unreal (README recipes only) and Godot
(no specific tooling) are fairly flagged.

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
