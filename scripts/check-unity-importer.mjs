/* Build guard: the Unity importer ships as C# INSIDE a JS template literal
   (src/generator/engineExport.ts). Hand edits there need template-level
   escaping — one level short and the emitted C# carries an unterminated
   string, the whole editor assembly fails, and users see raw sprites with
   red errors (owner field repro: CS1010 "Newline in constant"). This guard
   evaluates the literal exactly as the bundle will and lexes every C#
   string/char literal for same-line termination. Runs in prebuild, next to
   the font guard. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/generator/engineExport.ts"), "utf8");

const open = src.indexOf("const UNITY_IMPORTER = `");
if (open < 0) { console.error("unity-importer guard: UNITY_IMPORTER not found"); process.exit(1); }
const start = open + "const UNITY_IMPORTER = `".length;
// the literal ends at the first UNESCAPED backtick
let end = -1;
for (let i = start; i < src.length; i++) {
  if (src[i] === "\\") { i++; continue; }
  if (src[i] === "`") { end = i; break; }
}
if (end < 0) { console.error("unity-importer guard: unterminated template literal"); process.exit(1); }
const raw = src.slice(start, end);

// no live interpolations allowed — the C# must be static
if (/(^|[^\\])\$\{/.test(raw)) {
  console.error("unity-importer guard: unescaped ${ in the C# template — the importer must be static text");
  process.exit(1);
}

// evaluate the literal exactly as JS will (escapes resolve here)
const cs = new Function("return `" + raw + "`;")();

// lex C# string/char literals: every one must close on its own line
const errors = [];
const lines = cs.split("\n");
let inBlock = false; // /* ... */ state carries across lines
for (let ln = 0; ln < lines.length; ln++) {
  const line = lines[ln];
  let i = 0;
  while (i < line.length) {
    if (inBlock) {
      const close = line.indexOf("*/", i);
      if (close < 0) { i = line.length; break; }
      inBlock = false; i = close + 2; continue;
    }
    const ch = line[i];
    if (ch === "/" && line[i + 1] === "/") break;           // line comment
    if (ch === "/" && line[i + 1] === "*") { inBlock = true; i += 2; continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1, closed = false;
      while (j < line.length) {
        if (line[j] === "\\") { j += 2; continue; }         // C#-level escape
        if (line[j] === quote) { closed = true; break; }
        j++;
      }
      if (!closed) { errors.push(`line ${ln + 1}, col ${i + 1}: unterminated ${quote === '"' ? "string" : "char"} literal (CS1010 in Unity): ${line.trim().slice(0, 90)}`); break; }
      i = j + 1;
      continue;
    }
    i++;
  }
}

// belt: the path-normalizer must appear in its C#-correct two-backslash form
const normalizers = (cs.match(/Replace\("\\\\", "\/"\)/g) ?? []).length;
if (normalizers < 4) errors.push(`expected >=4 Replace("\\\\", "/") path normalizers in the emitted C#, found ${normalizers} — an escaping level was probably lost`);

/* A stray backtick in a C# comment CLOSES the template early, and every
   check above then passes happily on the surviving fragment — the importer
   just arrives with half its methods missing. Caught in the act: a comment
   quoting `left` and `size` cut 2036 lines down to 1370 and still reported
   OK. A floor makes truncation loud. Raise it when the importer grows; it
   only ever needs to sit below the real length. */
const MIN_LINES = 1900;
if (lines.length < MIN_LINES)
  errors.push(`the emitted C# is only ${lines.length} lines (floor ${MIN_LINES}) — the template literal was almost certainly closed early by a stray backtick in a comment or string`);
// the last method in the template — proves we reached the end, not just a length
if (!/class KitTexturePostprocessor/.test(cs))
  errors.push("KitTexturePostprocessor is missing from the emitted C# — the template literal ends before the file does");

/* mini semantic pass: the guard lexes but doesn't COMPILE, and that gap
   shipped a CS1061 to the field ('PBStyle' has no 'spacingEmPct' — the
   usage landed without the field). The style local is conventionally `s`
   throughout the template, so every `s.<member>` access must name a
   declared PBStyle field. If a future unrelated `s` local trips this,
   rename that local — the convention is load-bearing. */
const styleDecl = cs.match(/class PBStyle \{([^}]*)\}/);
if (!styleDecl) errors.push("PBStyle class declaration not found");
else {
  const declared = new Set([...styleDecl[1].matchAll(/public \w+ (\w+);/g)].map((x) => x[1]));
  const uses = [...new Set([...cs.matchAll(/\bs\.(\w+)/g)].map((x) => x[1]))];
  for (const u of uses)
    if (!declared.has(u)) errors.push(`s.${u} is used in the C# but PBStyle declares no '${u}' field (CS1061 in Unity)`);
}

/* the PBStyle lesson, generalized: JsonUtility silently drops manifest JSON
   fields the C# class never declared, so a template access on an undeclared
   field is a CS1061 the TS side can't see ('PBPalette' had no 'well'/'shadow'
   — InputValueInk shipped broken to the field). One hop from the manifest is
   where every such access lives, so check them all: for each object-typed
   PBManifest field, any `.field.member` access must name a declared field of
   that class; array-typed fields allow only `.Length` bare and check
   `[i].member` against the element class. */
{
  const classFields = new Map(); // PBX -> Set(field names)
  const classFieldTypes = new Map(); // PBX -> Map(field -> type)
  for (const cm of cs.matchAll(/class (PB\w+)\s*\{([^}]*)\}/g)) {
    const fields = new Set(), types = new Map();
    for (const f of cm[2].matchAll(/public ([\w[\]]+) (\w+);/g)) { fields.add(f[2]); types.set(f[2], f[1]); }
    classFields.set(cm[1], fields); classFieldTypes.set(cm[1], types);
  }
  const OBJ_METHODS = new Set(["ToString", "Equals", "GetHashCode"]);
  const manifestTypes = classFieldTypes.get("PBManifest");
  if (!manifestTypes) errors.push("PBManifest class declaration not found for the member-access check");
  else for (const [field, type] of manifestTypes) {
    const isArr = type.endsWith("[]");
    const elem = isArr ? type.slice(0, -2) : type;
    if (!classFields.has(elem)) continue; // string/int/etc. — nothing to check
    if (isArr) {
      for (const u of new Set([...cs.matchAll(new RegExp(`\\.${field}\\.(\\w+)`, "g"))].map((x) => x[1])))
        if (u !== "Length") errors.push(`.${field}.${u} — ${field} is a plain ${type}; only .Length exists (CS1061 in Unity)`);
      for (const u of new Set([...cs.matchAll(new RegExp(`\\.${field}\\[[^\\]]*\\]\\.(\\w+)`, "g"))].map((x) => x[1])))
        if (!classFields.get(elem).has(u) && !OBJ_METHODS.has(u))
          errors.push(`.${field}[i].${u} is used in the C# but ${elem} declares no '${u}' field (CS1061 in Unity)`);
    } else {
      for (const u of new Set([...cs.matchAll(new RegExp(`\\.${field}\\.(\\w+)`, "g"))].map((x) => x[1])))
        if (!classFields.get(elem).has(u) && !OBJ_METHODS.has(u))
          errors.push(`.${field}.${u} is used in the C# but ${elem} declares no '${u}' field (CS1061 in Unity)`);
    }
  }
}

/* round-12 ordering invariants: pinned board words are placement-self-
   sufficient. The field lost its BOOST three times to import-order trust;
   these keep the contract honest at build time.
   (1) the variants session flag clears in exactly ONE place — inside
       ClearVariantsPending. A call-site clear turns the "prefabs first"
       early return into a silent never-again.
   (2) the scene builder resolves-or-MINTS each pinned word at placement.
   (3) a pinned word that can't be made real counts the scene incomplete
       (missing++) so the pbBoardPending marker self-heals it.
   (4) the per-board pinned-words receipt (the K=0 field check) exists. */
const pendingClears = (cs.match(/SetBool\("PBKitVariantsPending", false\)/g) ?? []).length;
if (pendingClears !== 1)
  errors.push(`PBKitVariantsPending must be cleared exactly once (inside ClearVariantsPending); found ${pendingClears} clear(s)`);
if (!/EnsureVariantPrefab\(root, pfName, it\.label/.test(cs))
  errors.push("BuildBoardScene must resolve-or-mint pinned words at placement (EnsureVariantPrefab call missing)");
if (!/pinnedFallbacks\.Add\([\s\S]{0,220}?missing\+\+;/.test(cs))
  errors.push("a pinned-word base fallback must count the scene incomplete (missing++) so it self-heals");
if (!/minted at placement/.test(cs))
  errors.push("the per-board pinned-words receipt (ordering self-test) is missing from the emitted C#");

/* round-13 invariants: the glow attaches by PARENTING. The mirrored
   sibling chased the host's frame and lost it (owner: "didn't move with
   the button"); the Body-child structure makes the halo a true first
   child. The halo lives in STATE_FX_RUNTIME — a separate template from
   the importer — so that literal is extracted the same way here. */
const fxOpen = src.indexOf("const STATE_FX_RUNTIME = `");
let fx = "";
if (fxOpen < 0) errors.push("STATE_FX_RUNTIME not found — the halo runtime template is missing");
else {
  const fxStart = fxOpen + "const STATE_FX_RUNTIME = `".length;
  let fxEnd = -1;
  for (let i = fxStart; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "`") { fxEnd = i; break; }
  }
  fx = fxEnd > 0 ? new Function("return `" + src.slice(fxStart, fxEnd) + "`;")() : "";
}
if (!/static Image BodyImage\(GameObject go\)/.test(cs))
  errors.push("the BodyImage seam accessor is missing — sprite reads/swaps must serve both prefab structures");
if (/SetSiblingIndex\(rt\.GetSiblingIndex\(\)\)/.test(fx))
  errors.push("the mirrored-sibling glow mode is back — the halo must attach as a child (round 13)");
if (!/glowRt\.SetAsFirstSibling\(\)/.test(fx))
  errors.push("the halo must insert as the FIRST child (behind the Body/posed art)");
if (!/predates the attached-glow structure/.test(fx))
  errors.push("BuildGlow's legacy-root skip (draw nothing wrong, hint the upgrade) is missing");
if (!/rebodied/.test(cs))
  errors.push("the Body migration (wantBody/rebodied) is missing from the maintenance pass");

/* round-14 invariants: truth from app to Unity on the readout dress, the
   board-scene bakes, the HUD arc's lit ring, and the mini-map's map.
   (1) a glints-OFF kit ships NO glints atlas — the fillOpacity=0 mask
       leaked the synthetic-weight stroke (a cream ring per glyph) and the
       GlintInk style-0 path drew it raw: the phantom halo. The skip lives
       app-side (TS), checked on the source text.
   (2) gauge readout stacks hand the Glints ink back (contentText voice),
       and the maintenance disarms stacks armed by earlier importers.
   (3) a pose bake proven blank never ships (the dead-file boardstamps),
       and the timer never poses at all (pure display type).
   (4) boardstamps files the current boards no longer reference join the
       orphan receipt (never deleted), and instance bakes import
       uncompressed (the NPOT compression warning).
   (5) the HUD arc builds live segments on the manifest's polar grid and
       GaugeDial lights them to Value — the app's own rule. */
if (!/if \(v\.key === "glints" && !base\.type\.glints\?\.on\) continue;/.test(src))
  errors.push("the glints-off atlas skip is missing (bakeAlphabetFace) — glints-off kits would ship a synthetic-stroke 'mask' and Unity would draw it raw (the phantom halo)");
if (!/hlG\.glintsInk = null;/.test(cs))
  errors.push("GaugeNumberStack must hand the Glints ink back — the app's gauge digits never wear glints");
if (!/hlNum\.glintsInk = null;/.test(cs))
  errors.push("WireGauge's in-place glints disarm (existing Number stacks) is missing");
if (!/const pureType = idBase === "timerdigits";/.test(src))
  errors.push("the timer's pure-type pose skip is missing — every timer copy would ship four blank boardstamps again");
if (!/blank pose — live placement carries the copy/.test(src))
  errors.push("the proven-blank pose guard is missing — ink-less pose bakes must not ship");
if (!/stampsInUse/.test(cs))
  errors.push("the boardstamps orphan sweep (I3b) is missing — stale instance bakes would stay invisible to the orphan report");
if (!/path\.Contains\("\/boardstamps\/"\)\) gti\.textureCompression = TextureImporterCompression\.Uncompressed/.test(cs))
  errors.push("boardstamps must import Uncompressed — block compression smears instance bakes and warns on NPOT sizes");
if (!/\(i \+ 0\.5f\) \/ n <= value/.test(src))
  errors.push("GaugeDial's segment lighting rule ((i+0.5)/n <= value — the app's own) is missing");
if (!/gd\.segments = segList\.ToArray\(\);/.test(cs))
  errors.push("WireGauge must adopt the built segment ring onto GaugeDial.segments");
if (!/data-gauge-seg/.test(src))
  errors.push("the segment polar-grid stamp (data-gauge-seg) is missing from the export side");
if (!/"Demo Map"/.test(cs))
  errors.push("the Minimap's 'Demo Map' layer is missing — the radar loses its map again");
if (!/it\.component == "timerdigits"/.test(cs) || !/m\.timer\.shellH > 4f \? it\.h \/ m\.timer\.shellH : 1f/.test(cs))
  errors.push("the live Timer's shell-true placement is missing — canvas-to-shell scaling shrinks the scene's word (round 14)");

/* round-15 invariants: halo GEOMETRY, not just structure. The child-mode
   halo once copied the HOST's anchors/anchoredPosition — parent-space
   values applied in child space — landing the aura displaced by the
   host's own slot offset (Playground: a separate blob past the end of
   the button row; scenes: "the glow does not move with the button"),
   and copying the host's localScale squared the scale on scaled copies.
   The live halo must STRETCH over its parent's rect plus the pad. */
if (!/glowRt\.anchorMax != Vector2\.one\) glowRt\.anchorMax = Vector2\.one/.test(fx)
    || !/glowRt\.anchoredPosition != slide\) glowRt\.anchoredPosition = slide/.test(fx)
    || !/glowRt\.localScale != Vector3\.one\) glowRt\.localScale = Vector3\.one/.test(fx))
  errors.push("the LIVE halo must stretch over the host rect (anchors 0-1, localScale one, anchoredPosition = the baked-sink slide) — rounds 15+17");
/* round-17 item A: the sink happens ONCE and the glow presses WITH the
   face (app truth measured: face, label and aura all travel together by
   the state lift). Swap builds bake the sink in the sprite — the root
   must hold still and the halo slides; tiled/rig builds keep root
   motion. */
if (!/bool BakedSink\(\)/.test(fx) || !/BakedSink\(\) \? new Vector2\(0f, liftNow\) : Vector2\.zero/.test(fx))
  errors.push("the halo's baked-sink slide (round 17) is missing — the glow parks while the art presses");
if (!/if \(!BakedSink\(\)\) \{\s*\n\s*rt\.anchoredPosition = new Vector2\(rt\.anchoredPosition\.x, baseY \+ liftNow\);/.test(fx))
  errors.push("Push must guard the root lift behind !BakedSink() — swap builds double the baked sink otherwise (round 17)");
if (/var tgt = artRt != null \? artRt : rt;/.test(fx))
  errors.push("the parent-space MirrorHost copy is back — host anchors/anchoredPosition must never be applied to a CHILD of the host (round 15)");

/* round-16 item A: zips self-identify (README title stamp; the Console
   line already carries generatorVersion), and mid-generation serialized
   aura pads converge with the current sprites. */
if (!/Export build \$\{stamp\}/.test(src))
  errors.push("the README title block must carry the export build stamp (round 16 — zip-vintage ambiguity)");
if (!/padTuned/.test(cs))
  errors.push("the aura-pad convergence (stale serialized glowPad vs current sprites) is missing (round 16)");
/* round-16 item D: the gauge stamp goes through the viewBox origin AND
   the crop box — the seats' discipline, now shared. Per-kit housed crops
   must never seat a readout off the dial. */
if (!/gz\.x - gvx - bx0/.test(src))
  errors.push("the gauge stamp must subtract the svg viewBox ORIGIN like the seats do (round 16, War Chuds seat drift hardening)");
/* round-16 item C: the panels' graphs are LIVE (KitTrace). */
const bevelSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/generator/bevel.ts"), "utf8");
if (!/data-chart=/.test(bevelSrc))
  errors.push("the panel chart-zone stamp (data-chart) is missing from bevel.ts (round 16)");
if (!/class KitTrace : MaskableGraphic/.test(src))
  errors.push("the KitTrace runtime (live panel line graphs) is missing (round 16)");
if (!/Runtime\/PatternBreakKitTrace\.cs/.test(src) || !/"Runtime\/PatternBreakKitTrace\.cs",/.test(src))
  errors.push("PatternBreakKitTrace.cs must ship AND ride the sharedScripts set — per-slug runtime copies kill the assembly (the IdleShine lesson)");
if (!/static void WireChartTraces\(/.test(cs))
  errors.push("the panel trace builder is missing from the importer (round 16)");
if (!/chartsSeeded/.test(cs) || !/rigGrafted/.test(cs))
  errors.push("the one-shot rig graft (chartsSeeded arrival marker) is missing — existing projects never gain the live graphs (round 16)");
/* round-16 item E: the loot tag's tier dress is live. */
if (!/data-loottag-geo=/.test(bevelSrc))
  errors.push("the loot-tag geometry stamp (data-loottag-geo) is missing from bevel.ts (round 16)");
if (!/static void WireLootDress\(/.test(cs))
  errors.push("the loot-dress builder (Stripe + Gem, tier-tinted) is missing from the importer (round 16)");

/* round-17 item B: the gauge READOUT seat + size converge with the
   CURRENT manifest (owner, real War Chuds: a SpeedoArc born under an
   older manifest kept its old anchors and fontSize — the number filled
   the dial while MPH sat tiny). The stale-dress probe must SEE stale
   readout geometry, and WireGauge must re-seat it. */
if (!/var cWantS = new Vector2\(g\.x \/ rwS, 1f - g\.y \/ rhS\);/.test(cs)
    || !/\(nrtS\.anchorMin - cWantS\)\.sqrMagnitude > 1e-5f/.test(cs))
  errors.push("GaugeDressStale must probe the readout's seat anchors against the manifest (round 17 — the oversize '108' rode a stale seat)");
if (!/hlS2\.fontSize - g\.fs \/ psS\) > 0\.5f/.test(cs))
  errors.push("GaugeDressStale must probe the readout's fontSize against the manifest (round 17)");
if (!/var cWantC = new Vector2\(g\.x \/ rwC, 1f - g\.y \/ rhC\);/.test(cs)
    || !/var szWantC = new Vector2\(rwC \/ pngScale \* 0\.7f, g\.fs \/ pngScale \* 1\.5f\);/.test(cs))
  errors.push("WireGauge's readout convergence (seat anchors + box from the current manifest) is missing (round 17)");
if (!/var uWantC = new Vector2\(g\.x \/ rwC, 1f - g\.unitY \/ rhC\);/.test(cs)
    || !/uTmpC\.fontSize - g\.unitFs \/ pngScale\) > 0\.5f/.test(cs))
  errors.push("WireGauge's UNIT convergence (MPH seat + size from the current manifest) is missing (round 17)");
if (!/EMPTY IS NORMAL when the readout rides the HeroLabel echo stack/.test(src))
  errors.push("GaugeDial.number's tooltip must explain the empty-by-design echo-stack wiring (round 17 — 'Needle=None, Number=None' owner confusion)");

/* round-22 item A: the fire pad is a HOUSING (owner field: "the ring
   around the button is moving up, but the only thing that needs to move
   is the white button with icon, down"). The press pose — state lift
   dial + pressed extrusion collapse — must never slide the pad/ring;
   the app pins the pad's pose to the resting state, so the baked swap
   sprites carry a still ring and the disc's designed sink alone, and
   FireGlyphTrip measures exactly that for the glyph. */
if (!/const cfgPad = /.test(bevelSrc) || !/lift: cfg\.states\.default\.lift/.test(bevelSrc)
    || !/const restDepth = designFor\(cfg, "default"\)\.candy\.extrusion\.depth;/.test(bevelSrc))
  errors.push("the fire pad's pose pin (housing contract) is missing from bevel.ts (round 22 — the ring rode the press pose into the baked swap)");
/* round-22 item B: the gauge seat ships the DRAWN point. contentText
   nudges every digit block by the Typography offset dials (type.ox/oy · k)
   and the italic optical centering (−0.07em); a stamp computed from dial
   geometry alone strands Unity's readout wherever the kit's nudges no
   longer draw (owner field: the real kit's "108" high-left of the dial —
   while the bench read zero drift, because every bench recipe keeps the
   dials at zero). All three gauges carry the nudges. */
if (!/const numXS = cx3 \+ typeOxK \* k \+ \(cfg\.type\.italic \? -numFsS \* 0\.07 : 0\);/.test(bevelSrc)
    || !/const numYS = cy3 \+ r0 \* 0\.5 \+ typeOyK \* k;/.test(bevelSrc))
  errors.push("the speedo's gauge stamp lost the drawn-point nudges (round 22)");
if (!/const numXS2 = cx3 \+ typeOxK \* k \+ \(cfg\.type\.italic \? -numFsS2 \* 0\.07 : 0\);/.test(bevelSrc)
    || !/const numYS2 = cy3 - 4 \* k \+ typeOyK \* k;/.test(bevelSrc))
  errors.push("the HUD arc's gauge stamp lost the drawn-point nudges (round 22 — the owner's high-left '108')");
if (!/const numXT = cxH \+ typeOxK \* k \+ \(cfg\.type\.italic \? -numFsT \* 0\.07 : 0\);/.test(bevelSrc)
    || !/const numYT = cyH \+ r0P \* 0\.5 \+ typeOyK \* k;/.test(bevelSrc))
  errors.push("the rev meter's gauge stamp lost the drawn-point nudges (round 22)");

/* round-21: board bars arrive KIT-DRESSED (owner mandate — truth from app
   to Unity). The progress assets must be the real component's part
   renders, the manifest must carry the well zone, and the ProgressBar
   prefab + placement + heal must ride the shared mercury-seat builder. */
if (!/addPng\("progress\/track\.9\.png", shell\("progress", \{ overlay: "track" \}/.test(src)
    || !/addPng\("progress\/fill\.9\.png", shell\("progress", \{ overlay: "fill" \}/.test(src))
  errors.push("the progress bar's assets must be the DRESSED part renders (overlay track/fill), not synthesized capsules (round 21)");
if (!/const tzm = \/data-track=/.test(src))
  errors.push("the raster pass must capture the bar renders' data-track zone into the manifest (round 21)");
if (!/class PBTrack \{ public float x; public float w; \}/.test(cs))
  errors.push("PBTrack (the manifest's well-zone row) is missing from the importer (round 21)");
if (!/static RectTransform BuildBarFill\(/.test(cs) || !/aT\.track != null && aT\.track\.w > 2f/.test(cs))
  errors.push("the shared mercury-seat builder (BuildBarFill, manifest-zone seated) is missing (round 21)");
if (!/BuildBarFill\(go, "Fill", fill, track, pngScale, m, "progress", 0\.62f, false\)/.test(cs))
  errors.push("ProgressPrefab must assemble the dressed rig through BuildBarFill (round 21)");
if (!/\(it\.component == "progress" \|\| it\.component == "emblembar"\) && it\.value > 0f/.test(cs))
  errors.push("board placement must drive the progress/emblem bars' fillAmount from the board's value (round 21)");
if (!/asset\.transform\.Find\("Fill Area"\) == null/.test(cs) || !/barRigged\+\+/.test(cs))
  errors.push("the old-structure ProgressBar heal (Fill Area retrofit, barRigged receipt) is missing (round 21)");
/* round-21 slice C: the VS bar + emblem bar leave the baked-stamp road,
   and the segment meter lights its cells. */
if (!/addPng\("vsbar\/track\.9\.png", shell\("vsbar", \{ overlay: "track" \}/.test(src)
    || !/addPng\("emblembar\/socket\.png", padSvg\(shell\("emblembar", \{ overlay: "dock"/.test(src))
  errors.push("the vsbar/emblembar dressed part assets are missing from the export (round 21; the socket rides padSvg since round 27)");
if (!/vsbar: "vsbar", emblembar: "emblembar"/.test(src))
  errors.push("vsbar/emblembar must ride PREFAB_FAMILY (live placement) — without it they fall back to dead baked stamps (round 21)");
if (!/static bool VsBarPrefab\(/.test(cs) || !/static bool EmblemBarPrefab\(/.test(cs) || !/static bool SegBarPrefab\(/.test(cs))
  errors.push("the VsBar/EmblemBar/SegmentMeter rig builders are missing from the importer (round 21)");
if (!/it\.component == "vsbar" && it\.value > 0f/.test(cs) || !/it\.component == "segbar" && it\.value > 0f/.test(cs))
  errors.push("board placement must drive the vsbar left fighter and the segbar lit cells from the board's value (round 21)");
if (!/static float SegbarScissor\(/.test(cs) || !/Mathf\.Round\(v01 \* 5f\)/.test(cs))
  errors.push("the segbar scissor must snap to whole cells on the manifest's well zone (round 21)");
if (!/spritePath\.EndsWith\("\/segbar-base\.png"\) && asset\.transform\.Find\("Lit"\) == null/.test(cs))
  errors.push("the SegmentMeter Lit graft (one arrival moment, the minimap's rule) is missing (round 21)");

/* round-18 PRIMARY: the baked press sink reaches the halo. The manifest's
   stateFx.lift carries only the LIFT DIAL delta — a pressed state that
   collapses the extrusion (owner's real War Chuds: depth 31 -> 14, all
   four lift dials equal) sinks the baked art ~17 UI px while lift reads 0,
   so the halo slid by nothing and held its hover seat (owner: "the glow
   doesn't follow the new button"). labelStates dy already ships that
   travel (the label rides it); the halo must ride it too, on swap builds
   only, and existing projects must converge. */
if (!/public float hoverSink, pressedSink;/.test(fx))
  errors.push("StateFx's baked-sink fields are missing (round 18 — the parked pressed halo)");
if (!/pressedLift \+ \(baked \? pressedSink : 0f\)/.test(fx) || !/hoverLift \+ \(baked \? hoverSink : 0f\)/.test(fx))
  errors.push("Target must add the baked sink to the travel channel on swap builds (round 18)");
if (!/fx\.pressedSink = -ExpectedShift\(m, family, "pressed"\);/.test(cs) || !/fx\.hoverSink = -ExpectedShift\(m, family, "hover"\);/.test(cs))
  errors.push("WireStateFx must arm the sink fields from labelStates dy — the app's own face travel (round 18)");
if (!/wantSinkFix/.test(cs) || !/fxSink\.pressedSink = pressedSinkWant/.test(cs))
  errors.push("the baked-sink convergence sweep is missing — prefabs armed before the sink fields existed keep a parked halo forever (round 18)");

/* round-18 (re-cut by round-19 P0): the editor's input-focus gate made
   loud. Hover rides the EventSystem alone (no polling) — in the editor
   the Input System only delivers pointer events while the Game view has
   focus, which reads as "the glow broke" (owner video). The WATCHER now
   lives EDITOR-SIDE (PatternBreakKitImporter): a package API referenced
   from the Runtime file broke a customer project's compile (CS0117).
   The runtime keeps one dumb #if UNITY_EDITOR flag. */
if (!/public static bool editorPointerSeen;/.test(fx))
  errors.push("StateFx's editorPointerSeen flag (the runtime's ONLY editor-side surface) is missing (rounds 18/19)");
if (/FocusHintTick|focusHintDone|UnityEditor\./.test(fx))
  errors.push("the focus watcher crept back into the RUNTIME file — it lives in the Editor assembly (round 19 P0: a runtime package reference killed a customer compile)");
if (!/static void FocusGateTick\(\)/.test(cs) || !/\[InitializeOnLoadMethod\]\s*\n\s*static void ArmFocusGateWatcher\(\)/.test(cs))
  errors.push("the editor-side focus-gate watcher is missing from the importer (rounds 18/19)");
if (!/Click the game once and sweep again/.test(cs))
  errors.push("the focus-gate hint's Console line is missing (round 18 — 'hover not moving' owner video)");
if (!/over = true; Retarget\(\); MarkPointer\(\);/.test(fx) || !/down = true; Retarget\(\); MarkPointer\(\);/.test(fx))
  errors.push("MarkPointer must ride OnPointerEnter and OnPointerDown — the hint disarms when events actually flow (round 18)");
if (!/InputSystemUIInputModule"\) return;/.test(cs))
  errors.push("the focus watcher must stay quiet under the legacy StandaloneInputModule — that module has no focus gate (round 18)");
if (!/references: \["Unity.TextMeshPro", "UnityEngine.UI"\]/.test(src))
  errors.push("the Runtime asmdef must reference ONLY the two UI staples — a package reference there is how round 19's compile break happened");
if (/UnityEngine\.Input\.|Input\.GetMouse|Input\.mousePosition|Mouse\.current|Pointer\.current/.test(fx))
  errors.push("StateFx must never poll input — hover/press ride the EventSystem alone (round-18 verified contract)");
/* round-18 menu action: removing the gate is an EXPLICIT choice, never an
   import side effect, and the hint's menu reference must name the real menu. */
if (!/const string RouteInputMenu = "Tools\/PatternBreak\/Route All Editor Input To Game View";/.test(cs)
    || !/STRICTLY an explicit menu action/.test(cs))
  errors.push("the Route All Editor Input To Game View menu action (explicit, never automatic) is missing (round 18)");
if (!/Type\.GetType\("UnityEngine\.InputSystem\.InputSystem, Unity\.InputSystem"\)/.test(cs)
    || !/GetProperty\("editorInputBehaviorInPlayMode"/.test(cs))
  errors.push("the route-input machinery must reach the Input System by REFLECTION only (round 19 P0 — direct references break compiles on other package versions)");
if (!/AssetDatabase\.CreateAsset\(asset, "Assets\/InputSystem\.inputsettings\.asset"\)/.test(cs))
  errors.push("the route-input menu must mint the settings asset when the project runs on in-memory defaults — the change would evaporate otherwise (round 18)");
if (cs.includes("Tools > PatternBreak > Route All Editor Input To Game View") !== true)
  errors.push("the focus hint must point at the real menu item by its exact name (round 18)");

/* ── round-19 P0 CLASS INVARIANT: version-fragile package APIs must never
   be referenced directly in ANY emitted C#. InputSettings.EditorInputBehavior
   compiled nowhere on the owner's Input System version — CS0117, every kit
   script dead, the scene white boxes. The whole source file is scanned
   (every template rides in it); reflection strings (quoted names) pass,
   naked member access fails. New package APIs join the allowlist only
   CONSCIOUSLY, with a version-stability argument in the commit. ── */
{
  const fragile = [
    [/InputSettings\.EditorInputBehavior/, "InputSettings.EditorInputBehavior"],
    [/(?<!")editorInputBehaviorInPlayMode(?!")/, "editorInputBehaviorInPlayMode as naked member access (reflection only)"],
    [/UnityEngine\.InputSystem\.InputSystem\.settings/, "InputSystem.settings as a direct reference (reflection only)"],
  ];
  for (const [re, what] of fragile)
    if (re.test(src))
      errors.push(`version-fragile package API referenced directly: ${what} — this exact class broke a customer's compile (round 19 CS0117)`);
  const inputAllow = ["UnityEngine.InputSystem.UI.InputSystemUIInputModule"]; // 1.0-era, define-guarded in the scene builders
  for (const mm of src.matchAll(/UnityEngine\.InputSystem\.[A-Za-z0-9_.]+/g)) {
    if (src[mm.index - 1] === '"' || src[mm.index - 1] === "'") continue; // quoted = reflection type-name string
    const ref = mm[0].replace(/\.$/, "");
    if (!inputAllow.some((a) => ref === a || ref.startsWith(a + ".")))
      errors.push(`unlisted direct UnityEngine.InputSystem reference in emitted source: ${ref} — use reflection, or extend the guard allowlist consciously (round 19)`);
  }
}
if (!/Testing hover & press in the editor/.test(src)
    || !/Route All Editor Input To Game View\*\*/.test(src))
  errors.push("the README's editor-testing box (the focus-gate story + the menu pointer) is missing (round 18)");

/* round-18: the ghost joystick is a PLACEABLE RIG (owner: "make sure to
   include Joystick-ghost in the prefabs") — ghost base + thumb sprites
   from the app's own overlay render, a TouchStick prefab, ghost-aware
   re-adoption, and the README bones line. */
if (!/aria-label="ghost joystick thumb"/.test(bevelSrc))
  errors.push("the ghost joystick's thumb part render is missing from bevel.ts (round 18)");
if (!/data-shell="\$\{\(cxg - R\)\.toFixed\(1\)\}/.test(bevelSrc))
  errors.push("the ghost base render must stamp its ring shell (data-shell) — the prefab seats the thumb from it (round 18)");
if (!/joystick\/ghost-base\.png/.test(src) || !/joystick\/ghost-thumb\.png/.test(src))
  errors.push("the ghost stick's base/thumb sprites are not exported (round 18)");
if (!/static bool JoystickGhostPrefab\(/.test(cs) || !/JoystickGhostPrefab\(dir, root, pngScale, m\)\) any = true;/.test(cs))
  errors.push("JoystickGhostPrefab is missing or never runs — the ghost ships no prefab (round 18)");
if (!/ghostRig \? "ghost-base" : "base"/.test(cs))
  errors.push("the joystick re-adoption sweep must be ghost-aware — a bare ghost rig would re-adopt the SOLID stick's art (round 18)");
if (!/Joystick \/ JoystickGhost\*\*/.test(src))
  errors.push("the README bones line for the sticks (Joystick / JoystickGhost) is missing (round 18)");

/* round-18: the fire button's press — the icon rides the disc's WHOLE
   baked trip (owner: "on press the center white disc and icon should
   move"). The dial-only formula left the icon floating ~15 UI px above
   the sunk disc on the owner's kit (press-pose extrusion collapse, lift
   dial 0). The trip now comes from the app's own dome shell stamps. */
if (!/static float FireGlyphTrip\(PBManifest m, float domeShellW\)/.test(cs))
  errors.push("FireGlyphTrip (the stamp-driven dome trip) is missing (round 18)");
if (!/-\(\(dP\.shell\.y - d0\.shell\.y\) \/ ps \+ domeShellW \* 0\.016f\)/.test(cs))
  errors.push("FireGlyphTrip must measure the baked face drop from the dome shell stamps, plus the dome's designed sink (round 18)");
if (!/fb\.pressedLift = FireGlyphTrip\(m, domeShellW\);/.test(cs))
  errors.push("FireButtonPrefab must arm the glyph with FireGlyphTrip (round 18)");
if (!/fbWant = FireGlyphTrip\(m, shellMin\);/.test(cs)
    || !/Mathf\.Approximately\(fbNow\.pressedLift, fbRow - shellMin \* 0\.016f\)/.test(cs))
  errors.push("the fire-glyph convergence must target FireGlyphTrip and recognize the old dial+sink default as stale (round 18)");

/* round-20 item 2: the stretched bar keeps its knob. Bar rigs never pose
   for a stretch (a bake buries the live control; a lost import race left
   the stand-in uniform-scaled — the ballooned knob); placement trusts the
   MANIFEST for sliced-ness, and a missing posed sprite falls through to
   live sizing AND arms the incomplete-scene rebuild. */
if (!/const BAR_RIGS = new Set\(\["slider", "progress", "segbar", "vsbar", "emblembar", "scrollbar"\]\);/.test(src)
    || !/&& !BAR_RIGS\.has\(idBase\)/.test(src))
  errors.push("the bar-rig posed exclusion is missing — a stretched slider would bake over its live rig again (round 20)");
if (!/baseA\.nineSlice\.left \+ baseA\.nineSlice\.right \+ baseA\.nineSlice\.top \+ baseA\.nineSlice\.bottom > 2/.test(cs))
  errors.push("slicedRoot must trust the manifest's nineSlice row — the sprite border can lose the first-drop race (round 20)");
if (!/the sliced prefab stands in at board size/.test(cs) || !/missing\+\+;\s*\n\s*\}\s*\n\s*if \(pspPose != null\)/.test(cs))
  errors.push("a missing posed sprite must count MISSING and fall through to live sizing (round 20 — the frozen natural-size stand-in)");

/* round-20 item 1: a GHOST board copy places JoystickGhost, and kept
   scenes wearing the solid stick on a ghost seat heal on re-import. */
if (!/pfName = it\.ov == "ghost" \? "JoystickGhost" : "Joystick";/.test(cs))
  errors.push("the scene builder's joystick mapping must be ghost-aware (round 20 — 'it's grabbing the old joystick')");
if (!/it2\.component == "joystick" && it2\.ov == "ghost"/.test(cs) || !/ghost stick\(s\) swapped in/.test(cs))
  errors.push("the kept-scene ghost-stick heal (position-matched swap) is missing (round 20)");

/* round-23: BIG GLYPHS cross the seam (owner mandate: "if used then they
   should export with boards as their own prefabs"). The app half emits
   manifest rows (component "bigglyph", big{id,name,sprite,fx}) plus
   bigglyphs/<id>.png (clean, shared) and bigglyphs/<id>-<sid>.png
   (per-copy fx bake, padded symmetrically — w/h describe the SHIPPED
   raster). The importer half must: parse the row, build one prefab per
   used asset at Prefabs/BigGlyphs/<Name>.prefab from the clean sprite,
   converge every instance on it, put an fx copy's bake on the INSTANCE
   (never the prefab), self-heal races, import the art losslessly, and
   sweep stale bakes into the orphan receipt without slandering the
   prefab's own clean file. */
if (!/class PBBig \{ public string id; public string name; public string sprite; public bool fx; \}/.test(cs))
  errors.push("PBBig (the manifest's big-glyph row) is missing from the importer (round 23)");
if (!/public float\[\] cells; public int cellSel = -1; public PBBig big; \}/.test(cs))
  errors.push("PBBoardItem must carry the big field — without it JsonUtility drops every big-glyph row (round 23)");
if (!/static string BigGlyphPrefabName\(PBBig bg\)/.test(cs))
  errors.push("BigGlyphPrefabName is missing — builder and placement must derive the prefab file name from ONE helper or they diverge (round 23)");
if (!/static bool BigGlyphPrefabs\(/.test(cs) || !/if \(BigGlyphPrefabs\(dir, root, m\)\) any = true;/.test(cs))
  errors.push("BigGlyphPrefabs is missing or never runs — used big glyphs would ship no prefab (round 23, the owner mandate)");
if (!/"\/Prefabs\/BigGlyphs\/" \+ BigGlyphPrefabName\(it\.big\) \+ "\.prefab"/.test(cs))
  errors.push("board placement must converge big-glyph instances on Prefabs/BigGlyphs/<Name>.prefab (round 23)");
if (!/if \(bigSp != null && bigImg != null\) bigImg\.sprite = bigSp;/.test(cs))
  errors.push("an fx copy's baked sprite must land on the INSTANCE Image (override), never the prefab (round 23)");
if (!/the clean art stands in and the scene rebuilds itself/.test(cs)
    || !/bigImg2\.sprite = bigSp; bigImg2\.raycastTarget = false; bigImg2\.preserveAspect = true;\s*\n\s*missing\+\+;/.test(cs))
  errors.push("big-glyph import races must count the scene incomplete (missing++) so pbBoardPending self-heals it (round 23)");
if (!/path\.Contains\("\/bigglyphs\/"\) \|\| path\.Contains\("\/boardstamps\/"\)\) gti\.textureCompression/.test(cs)
    || !/path\.Contains\("\/backgrounds\/"\) \|\| path\.Contains\("\/bigglyphs\/"\) \|\| path\.Contains\("\/boardstamps\/"\)/.test(cs))
  errors.push("bigglyphs/ must import as single sprites, Uncompressed — painted art at natural (non-multiple-of-4) sizes (round 23)");
if (!/stampsInUse\.Add\("bigglyphs\/" \+ itR\.big\.id \+ "\.png"\);/.test(cs)
    || !/new string\[\] \{ root \+ "\/boardstamps", root \+ "\/bigglyphs" \}/.test(cs))
  errors.push("the orphan sweep must cover bigglyphs/ AND keep a used asset's clean original in-use (the prefab wears it even when every copy is fx) (round 23)");
if (!/it2\.big != null && !string\.IsNullOrEmpty\(it2\.big\.id\)/.test(cs))
  errors.push("the kept-scene heal must re-point a big-glyph copy's clean/fx flip and shield big rows from the stamp branch's WipeShine (round 23)");
if (!/component: "bigglyph"/.test(src) || !/big: \{ id: gl\.id, name: gl\.name, sprite: file, fx: hasFx \}/.test(src))
  errors.push("the app-side big-glyph emission seam (component bigglyph + big{id,name,sprite,fx}) is missing (round 23)");
if (!/const padB = hasFx \? bigGlyphFilterPad\(b\.big\) : 0;/.test(src))
  errors.push("fx rows must ship the PADDED footprint (w/h of the shipped raster) — without it the importer squeezes the halo into the art rect (round 23)");
if (!/Prefabs\/BigGlyphs\/\*\*/.test(src))
  errors.push("the README's Prefabs/BigGlyphs pointer is missing (round 23)");

/* round-24: the CAST SHADOW crosses the seam (dev field notes #3: the
   mobile board's "Banner is also missing its shadow"). App half: live and
   posed board copies bake their grounded cast shadow alone — transparency
   zeros + DOM-hidden extrusion/outer-glow, extrusion DEPTH kept so the
   drop offset stays true — into boardstamps/<slug>-sh<sid>.png with
   shell-relative geometry. Importer half: PBBoardItem carries the shadow
   row, the scene grounds the piece with an art SIBLING placed right
   behind it (never a child — hover lifts move the piece, not its
   shadow), races arm the incomplete-scene rebuild, and the orphan sweep
   keeps in-use shadow bakes unslandered. */
if (!/public float posedLabelDx; public float posedLabelDy; public string shadow; public float shadowW; public float shadowH; public float shadowDx; public float shadowDy;/.test(cs))
  errors.push("PBBoardItem must carry the shadow row (shadow + shadowW/H/Dx/Dy) — JsonUtility drops the cast-shadow bake without it (round 24)");
if (!/itR\.posedDisabled, itR\.shadow \}/.test(cs))
  errors.push("the orphan sweep must keep in-use cast-shadow bakes (itR.shadow) unslandered (round 24)");
if (!/Shadow \(art\)", typeof\(RectTransform\), typeof\(CanvasRenderer\), typeof\(Image\)/.test(cs))
  errors.push("the scene builder's grounded shadow sibling ('<Name> Shadow (art)') is missing (round 24)");
if (!/shGo\.transform\.SetSiblingIndex\(inst\.transform\.GetSiblingIndex\(\)\);/.test(cs))
  errors.push("the shadow sibling must slot in right BEFORE the piece (SetSiblingIndex) so it draws behind it (round 24)");
if (!/the cast-shadow sprite for/.test(cs) || !/isn't imported yet; the piece places unshadowed and the scene rebuilds itself/.test(cs))
  errors.push("a missing shadow sprite must warn AND count the scene incomplete (missing++) so it self-heals (round 24)");
if (!/boardstamps\/\$\{slug\}-sh\$\{sidFor\(\)\}\.png/.test(src))
  errors.push("the app-side shadow bake emission (boardstamps/<slug>-sh<sid>.png) is missing (round 24)");
if (!/cSh\.transparency = \{ frame: 0, interior: 0, content: 0 \};/.test(src)
    || !/data-part="extrusion"\], \[data-part="outer-glow"\]/.test(src))
  errors.push("the shadow bake must hide shell/face/content via transparency AND DOM-hide extrusion/outer-glow — anything else leaks art into the shadow sprite (round 24)");
if (!/const sidFor = \(\) => \(bakeSid \?\?= sidOf\(b\)\);/.test(src) || !/const poseSid = sidFor\(\);/.test(src))
  errors.push("pose and shadow bakes must share ONE per-copy sid (stable bake names) — separate sidOf calls would rename files on every export (round 24)");

/* round-24: state bakes stay LABELESS through designed forks (dev field
   notes #3, the claim button: retyping the label updated rest but hover
   flashed the old baked word). A designed state is a pickDesign snapshot
   whose transparency copy outranks the master in designFor — the ghost
   must write content:0 into the master AND every fork, in the sliced
   family state bakes and in the posed pipeline's calms alike. */
if (!/const ghostStates = \(c: GenConfig\) => \{\s*\n\s*c\.transparency\.content = 0;\s*\n\s*for \(const fG of Object\.values\(c\.stateDesigns\)\) if \(fG\?\.transparency\) fG\.transparency = \{ \.\.\.fG\.transparency, content: 0 \};/.test(src))
  errors.push("ghostStates (master + fork content ghosting for sliced state bakes) is missing — a forked hover bakes the stock word again (round 24)");
if (!/stateShell\(n\.id, stName, wordOpts, undefined, true, word !== undefined \? ghostStates : undefined\)/.test(src))
  errors.push("the NINE state bakes must ghost through ghostStates, not a master-only content:0 (round 24)");
if (!/if \(f2\.shadow\) f2\.shadow = \{ \.\.\.f2\.shadow, opacity: 0 \};/.test(src)
    || !/if \(f2\.candy\?\.contact\) f2\.candy = \{ \.\.\.f2\.candy, contact: \{ \.\.\.f2\.candy\.contact, opacity: 0 \} \};/.test(src))
  errors.push("the posed pipeline's shellCfg must calm fork shadow/contact too — a designed state would bake its shadow into the posed skin (round 24)");

/* round-24: resize honesty — the state visuals derive from the CURRENT
   rect, not baked dimensions (dev field report: "reducing the primary
   button in size throws off the wipe and specular"). StateFx scales its
   aura pad, lifts and baked sinks by rect/authoredHeight; LabelStateInk
   scales the press travel the same way; both keep k=1 when
   authoredHeight is unset so re-imported old projects never move. The
   probe-detected lift channel expressions stay intact as substrings
   (parity-probe reads them from the shipped C#). */
{
  /* StateFx / LabelStateInk ship from their OWN runtime template
     literals, so these read the whole source (src), not the importer
     literal (cs). */
  const fxBlock = src.match(/public class StateFx[\s\S]*?LateUpdate/);
  const inkBlock = src.match(/public class LabelStateInk[\s\S]*?ApplyCurrent\(\) \{[\s\S]*?\n    \}/);
  if (!fxBlock || !/public float authoredHeight;/.test(fxBlock[0]) || !/float SizeK\(\)/.test(src))
    errors.push("StateFx must carry authoredHeight + SizeK — fixed-px pads/sinks read wrong on a resized rect (round 24)");
  if (!/var pad = glowPad \* SizeK\(\);/.test(src) || !/tgt\.sizeDelta \+ pad \* 2f/.test(src) || !/var pad2 = pad \* 2f;/.test(src))
    errors.push("the halo pad must scale by SizeK in BOTH MirrorHost branches (round 24)");
  if (!/\(pressedLift \+ \(baked \? pressedSink : 0f\)\) \* kSz/.test(src) || !/\(hoverLift \+ \(baked \? hoverSink : 0f\)\) \* kSz/.test(src))
    errors.push("the lift/sink channels must scale by SizeK while keeping the probe-detected inner expressions verbatim (round 24)");
  if (!inkBlock || !/public float authoredHeight;/.test(inkBlock[0]) || !/\* SizeK\(\);/.test(inkBlock[0]))
    errors.push("LabelStateInk must scale its press travel by rect/authoredHeight (round 24)");
  if (!/fx\.authoredHeight = fxRt\.sizeDelta\.y;/.test(cs) || !/ink\.authoredHeight = inkRt\.sizeDelta\.y;/.test(cs))
    errors.push("WireStateFx/WireLabelStates must arm authoredHeight from the finished prefab rect (round 24)");
}

/* round-24: layout groups never meet kit decor (dev field notes: glow +
   HORIZONTAL layout groups — the sibling-glow zips that produced the
   report are gone since round 13, and the halo's atomic LayoutElement
   already covers both axes; this pins that fix and extends the same
   atomic exemption to EVERY runtime-spawned decor child: the wipe
   stencil, the edge spark, the hero-label echoes and the claim burst.
   A group on the piece, above it, horizontal, vertical or grid must
   never measure decor as a cell — not even for the one queued rebuild
   between parenting and a late exemption. */
{
  const atomicSpawns = [
    ['name + " Glow", typeof(RectTransform), typeof(CanvasRenderer), typeof(LayoutElement), typeof(Image)', "the state halo"],
    ['name + " Wipe Mask", typeof(RectTransform), typeof(CanvasRenderer), typeof(LayoutElement), typeof(Image), typeof(Mask)', "the wipe stencil"],
    ['name + " Edge Spark", typeof(RectTransform), typeof(CanvasRenderer), typeof(LayoutElement), typeof(Image)', "the edge spark"],
    ['"Glint stars (echo)", typeof(RectTransform), typeof(CanvasRenderer), typeof(LayoutElement)', "the stars echo"],
    ['echoName, typeof(RectTransform), typeof(CanvasRenderer), typeof(LayoutElement)', "the label echoes"],
    ['"Claim flash", typeof(RectTransform), typeof(CanvasRenderer), typeof(LayoutElement), typeof(Image)', "the claim flash"],
    ['"Spark", typeof(RectTransform), typeof(CanvasRenderer), typeof(LayoutElement), typeof(Image)', "the claim sparks"],
  ];
  for (const [needle, what] of atomicSpawns)
    if (!src.includes(needle))
      errors.push(`${what} must create its LayoutElement ATOMICALLY in the GameObject constructor (round 24 — layout groups vs decor)`);
  const ignores = (src.match(/GetComponent<LayoutElement>\(\)\.ignoreLayout = true/g) ?? []).length
    + (src.match(/le[SE]\.ignoreLayout = true/g) ?? []).length;
  if (ignores < 7)
    errors.push(`expected >=7 ignoreLayout arms across the runtime decor spawns, found ${ignores} (round 24)`);
  if (!/using UnityEngine\.UI;\s*\n#if UNITY_2023_2_OR_NEWER\s*\nusing TMPro;/.test(src))
    errors.push("HERO_LABEL_RUNTIME must import UnityEngine.UI (LayoutElement would be CS0246 without it) (round 24)");
}

/* round-24: the GameObject right-click menu resolves EXACT prefab file
   names (the scene builder's own) and picks a kit when several are
   imported. The NiceName road shipped two dead entries — Toggle hunted
   Toggle.prefab (the rig is Switch.prefab), Progress Bar hunted
   Progress.prefab (ProgressBar.prefab). Every MenuItem handler must pass
   a name that some SaveAsPrefabAsset call actually writes. */
{
  if (!/static void PlaceFromRoot\(string root, string pfName, string altName, GameObject ctxGo\)/.test(cs))
    errors.push("PlaceFromRoot (exact-name, multi-kit-aware placement) is missing (round 24)");
  if (!/var pick = new GenericMenu\(\);/.test(cs) || !/pick\.ShowAsContext\(\);/.test(cs))
    errors.push("the multi-kit GenericMenu picker is missing — first-found would silently decide again (round 24)");
  if (/PlaceKitPrefab\("[a-z][a-z-]*",/.test(cs))
    errors.push("a MenuItem still passes a lowercase FAMILY name to PlaceKitPrefab — entries must name exact prefab files (round 24: Toggle/Progress Bar shipped dead)");
  const menuNames = [...cs.matchAll(/PlaceKitPrefab\("([A-Za-z]+)"(?:, "([A-Za-z]+)")?, c\)/g)].flatMap((x) => [x[1], x[2]]).filter(Boolean);
  const savedNames = new Set([
    ...[...cs.matchAll(/SaveAsPrefabAsset\((?:go|inst|contents\w*), dir \+ "\/([A-Za-z]+)\.prefab"\)/g)].map((x) => x[1]),
    // families saved via goName = NiceName(component) — the catalog sections list them
    ...[...cs.matchAll(/"(ButtonPrimary|ButtonSecondary|ButtonSmall|Endturn|Keycap|Pricebtn|Iconbtn|Chip|Tab|TabBack|Checkbox|Radio|CheckboxToggle|RadioToggle|Switch|Input|Joystick|JoystickGhost|ProgressBar|SegmentMeter|VsBar|EmblemBar|Slider|HealthGlobe|SeasonTrack|CountBadge|Badge|Panel|HeaderBanner|ListRow|ItemSlot|ScrollView|Dropdown|Timer|HeroLabel)"/g)].map((x) => x[1]),
  ]);
  for (const n of menuNames)
    if (!savedNames.has(n))
      errors.push(`menu entry names ${n}.prefab but no importer path is known to write it (round 24)`);
}

/* round-24: the README says which board pieces arrive LIVE vs BAKED
   (dev field notes #3: "Some way of communicating what elements will be
   fully functional prefabs vs what come as parts alone might be a good
   way to manage expectations") and the Hierarchy suffixes it cites must
   actually exist in the scene builder. */
if (!/### What arrives LIVE and what arrives as baked art/.test(src))
  errors.push("the README's live-vs-baked section is missing (round 24 — expectation management, tester ask)");
for (const [needle, what] of [
  ['NiceName(it.component) + " (baked)"', 'the "(baked)" suffix'],
  ['"Stamp (live) — "', 'the live-stamp name'],
  ['inst.name = bigNm + (it.big.fx ? " (fx)" : "");', 'the big-glyph "(fx)" suffix'],
  ['NiceName(it.component) + " Shadow (art)"', 'the shadow "(art)" suffix'],
])
  if (!cs.includes(needle))
    errors.push(`${what} the README documents is gone from the scene builder (round 24)`);

/* round-25: raycasts stop at the VISIBLE art on the baked road too (the
   in-engine twin of the app's pointer-blocking fix; field-confirmed:
   invisible oversized rects eat clicks — "middle card selected"). Live
   prefabs already inset via ShellRaycastPad (manifest shell rows; sliced
   pieces absolute px, simple pieces rect fractions) — those branches are
   pinned here so they can never quietly regress. NEW: fx bakes (type
   stamps, big-glyph shadow/glow copies) pad their raster symmetrically,
   so the item row now ships the ART BOX (artW/artH, pad per side =
   (w-artW)/2) and the importer writes the inset wherever those bakes
   place — dormant while raycastTarget is false, correct the moment a
   dev arms a click. */
if (!/static void ShellRaycastPad\(GameObject host, string fam, PBManifest m\)/.test(cs)
    || !/rootImg\.raycastPadding = new Vector4\(padL \/ ps, padB \/ ps, padR \/ ps, padT \/ ps\);/.test(cs)
    || !/padL \/ rw \* rt\.sizeDelta\.x, padB \/ rh \* rt\.sizeDelta\.y,/.test(cs))
  errors.push("ShellRaycastPad (live prefabs: sliced absolute px / simple rect-fraction insets) lost a branch (round 25 pins the acb0722 fix)");
if (!/public float artW; public float artH; public float rot;/.test(cs))
  errors.push("PBBoardItem must carry the art box (artW/artH) — JsonUtility drops the fx-pad geometry without it (round 25)");
if (!/artW: Math\.round\(\(\(rw \/ 2\) \* k\) \* 10\) \/ 10, artH: Math\.round\(\(\(rh \/ 2\) \* k\) \* 10\) \/ 10/.test(src))
  errors.push("type-stamp items must ship their pre-filter art box (artW/artH) — the raycast inset has no truth without it (round 25)");
if (!/artW: Math\.round\(gl\.w \* kB \* 10\) \/ 10, artH: Math\.round\(gl\.h \* kB \* 10\) \/ 10/.test(src))
  errors.push("big-glyph items must ship the glyph's own art box (artW/artH) — fx pads are (w-artW)/2 per side (round 25)");
if (!/static void ArtRaycastPad\(Image img, PBBoardItem it\)/.test(cs)
    || !/float padX = Mathf\.Max\(0f, \(it\.w - it\.artW\) \* 0\.5f\);/.test(cs))
  errors.push("ArtRaycastPad (the baked-art inset, symmetric from the manifest art box) is missing (round 25)");
if (!/ArtRaycastPad\(inst\.GetComponent<Image>\(\), it\);/.test(cs) || !/ArtRaycastPad\(simg, it\);/.test(cs))
  errors.push("scene placement must inset BOTH baked roads — big-glyph instances and type stamps (round 25)");
if (!/ArtRaycastPad\(bigImgH, it2\);/.test(cs) || !/ArtRaycastPad\(img2, it2\);/.test(cs))
  errors.push("the kept-scene heal must re-inset re-adopted bakes — a new export's pad can differ (round 25)");
if (!/bool fxSeed = false;/.test(cs) || !/if \(fxSeed && itW\.artW > 2f && itW\.artH > 2f && itW\.w > 2f && itW\.h > 2f\)/.test(cs))
  errors.push("an fx-only big-glyph prefab (padded seed) must carry its fractional art-box inset (round 25)");

/* round-25: the IDLE DIALS travel (app commits 4cb4f9f + 29e6ac8 — pass
   duration per option, wipe band width, the On-hover arm, decoupled
   tempo). Manifest: PBIdle grows wipeDur/edgeDur/wipeWidth/trigger,
   0/"" = untouched so old zips ship today's motion. Runtime: the pass
   keeps its OWN clock (period only sets the rest), width drives the
   band geometry, and the arm borrows State FX's hover flag — ONE
   pointer listener per piece, no input polling ever. Importer: every
   shine BIRTH tunes through TuneWipe/TuneEdge; existing components'
   dials are the maker's (the redress rule). */
const idleOpen = src.indexOf("const IDLE_SHINE_RUNTIME = `");
let idle = "";
if (idleOpen < 0) errors.push("IDLE_SHINE_RUNTIME not found — the shine runtime template is missing");
else {
  const idleStart = idleOpen + "const IDLE_SHINE_RUNTIME = `".length;
  let idleEnd = -1;
  for (let i = idleStart; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "`") { idleEnd = i; break; }
  }
  idle = idleEnd > 0 ? new Function("return `" + src.slice(idleStart, idleEnd) + "`;")() : "";
}
if (!/public int wipe; public int edge; public float freq; public string blend; public float wipeDur; public float edgeDur; public float wipeWidth; public string trigger; \}/.test(cs))
  errors.push("PBIdle must carry the pass dials (wipeDur/edgeDur/wipeWidth/trigger) — JsonUtility drops them without fields (round 25)");
if (!/wipeDur: st\.cfg\.idle\?\.wipeDur \?\? 0, edgeDur: st\.cfg\.idle\?\.edgeDur \?\? 0,/.test(src)
    || !/wipeWidth: st\.cfg\.idle\?\.wipeWidth \?\? 0, trigger: st\.cfg\.idle\?\.trigger \?\? ""/.test(src))
  errors.push("the manifest's idle block must emit the pass dials with 0/'' untouched-defaults (round 25)");
if (!/\[Range\(0\.1f, 0\.6f\)\] public float width = 0\.3f;/.test(idle))
  errors.push("WipeShine's width dial (default 0.3 — the classic band) is missing (round 25)");
if ((idle.match(/public bool hoverArmed;/g) ?? []).length !== 2)
  errors.push("both shine halves must carry the hover arm (public bool hoverArmed on WipeShine AND EdgeShine) (round 25)");
if ((idle.match(/armFx != null && armFx\.PointerOver/g) ?? []).length !== 2
    || (idle.match(/armFx = GetComponentInParent<StateFx>\(\);/g) ?? []).length !== 2)
  errors.push("the hover arm must borrow State FX's pointer flag via GetComponentInParent — one listener per piece (round 25)");
if (/UnityEngine\.Input\.|Input\.GetMouse|Input\.mousePosition|Mouse\.current|Pointer\.current/.test(idle))
  errors.push("the idle shines must never poll input — the arm rides State FX's EventSystem hover alone (round 25; the round-18 contract extended)");
if (!/public bool PointerOver \{ get \{ return over; \} \}/.test(fx))
  errors.push("StateFx.PointerOver (the read-only hover word the shines borrow) is missing (round 25)");
if (!/float sw = Mathf\.Max\(0\.05f, Mathf\.Min\(sweep, period \* 0\.9f\)\);/.test(idle)
    || !/float rn = Mathf\.Max\(0\.05f, Mathf\.Min\(run, period \* 0\.9f\)\);/.test(idle))
  errors.push("the pass must keep its OWN clock capped at 90% of the cycle (decoupled tempo, the app's clamp) (round 25)");
if (!/bandRt\.sizeDelta = new Vector2\(w \* bw, h \* 2\.4f\);/.test(idle) || !/float travel = w \* \(0\.6f \+ bw \* 0\.5f\);/.test(idle))
  errors.push("the wipe band must draw at the width dial with travel that clears both edges (0.3 -> the classic 0.75) (round 25)");
if (!/if \(hoverArmed && !armOver\) armParked = true;/.test(idle))
  errors.push("an armed pass must COMPLETE before parking (exit mid-pass never freezes a visible band) (round 25)");
if (!/static void TuneWipe\(WipeShine ws, PBManifest m\)/.test(cs) || !/static void TuneEdge\(EdgeShine es, PBManifest m\)/.test(cs))
  errors.push("TuneWipe/TuneEdge (one seam for the idle dials at every shine birth) are missing (round 25)");
if ((cs.match(/TuneWipe\(ws[A-Za-z0-9]*, m\);/g) ?? []).length < 4)
  errors.push("every WipeShine birth must tune through TuneWipe — prefab build, stamp placement, stamp heal, redress add (round 25)");
if ((cs.match(/TuneEdge\(es[A-Za-z0-9]*, m\);/g) ?? []).length < 2)
  errors.push("every EdgeShine birth must tune through TuneEdge — prefab build and redress add (round 25)");
if ((cs.match(/\.period = m\.idle\.freq;/g) ?? []).length !== 2)
  errors.push("period-from-freq must live ONLY inside TuneWipe/TuneEdge (exactly 2 sites) — an inline site drifts past the dials (round 25)");
if (!/if \(m\.idle\.wipeDur > 0\.05f\) ws\.sweep = m\.idle\.wipeDur;/.test(cs) || !/if \(m\.idle\.edgeDur > 0\.05f\) es\.run = m\.idle\.edgeDur;/.test(cs))
  errors.push("absent dials must leave the runtime defaults (the 0-gate) — old manifests ship today's motion (round 25)");
if (!/ws1\.width = ws0\.width; ws1\.hoverArmed = ws0\.hoverArmed;/.test(cs))
  errors.push("the posed-copy wipe transplant must carry the round-25 dials (width + arm) to the art child (round 25)");

/* round-26 P1: MenuItem VALIDATORS are side-effect free. The RouteInput
   validator called Menu.SetChecked — a validator runs while the editor
   is mid-menu-layout (an IMGUI pass), and poking the menu tree from
   inside it is the re-entrancy IMGUI forbids: the owner's Console
   filled with anonymous "EndLayoutGroup: BeginLayoutGroup must be
   called first" errors. The checkmark now writes in exactly ONE place
   (SyncRouteMenuCheck), stamped after domain reload and on toggle. */
{
  const setChecked = (cs.match(/Menu\.SetChecked\(/g) ?? []).length;
  if (setChecked !== 1 || !/static void SyncRouteMenuCheck\(\) \{[\s\S]{0,400}?Menu\.SetChecked\(/.test(cs))
    errors.push(`Menu.SetChecked must be written in exactly ONE place (SyncRouteMenuCheck), found ${setChecked} (round 26 — the EndLayoutGroup Console spam)`);
  const validator = cs.match(/\[MenuItem\(RouteInputMenu, true\)\]\s*\n\s*static bool RouteEditorInputCheck\(\) \{[\s\S]*?\n    \}/);
  if (!validator) errors.push("the RouteInput menu validator is missing (round 26)");
  else if (/SetChecked\(|DisplayDialog\(|CreateAsset\(|SaveAsset|SetDirty\(|Debug\.Log\(/.test(validator[0]))
    errors.push("the RouteInput menu validator must stay side-effect FREE — no SetChecked/dialogs/asset writes/logs inside it (round 26)");
  if (!/\[InitializeOnLoadMethod\]\s*\n\s*static void ArmRouteMenuCheck\(\) \{ EditorApplication\.delayCall \+= SyncRouteMenuCheck; \}/.test(cs))
    errors.push("the reload-time checkmark stamp (ArmRouteMenuCheck via delayCall) is missing (round 26)");
  if (!/SyncRouteMenuCheck\(\); \/\/ the checkmark follows the toggle/.test(cs))
    errors.push("the toggle handler must re-stamp the menu checkmark after flipping the setting (round 26)");
}

/* round-26 item 1: the double "0:56". The round-24 cast-shadow bake fired
   for the PURE-TYPE timer — the transparency dials govern shell pieces,
   so the "shadow" shipped as a complete second readout in system glyphs
   (probe-proven: bright saturated glyph ink, meanLum 172 / meanSat 124).
   App half: pure type never bakes a shadow (the round-14 pose-skip
   discipline extended). Importer half: kept scenes CULL a builder-named,
   boardstamps-sprited shadow sibling the current manifest disowns. */
if (!/if \(!pureType && \(cfgP\.shadow\?\.opacity \?\? 0\) > 0\.5 && shm2 && vbm2\) \{/.test(src))
  errors.push("the pure-type shadow-bake skip is missing — the timer ships a second full-ink readout as its 'shadow' again (round 26)");
if (!/var shadowsInUse = new HashSet<string>\(\);/.test(cs)
    || !/if \(ch\.name\.EndsWith\(" Shadow \(art\)"\)\)/.test(cs)
    || !/staleShadows\.Add\(ch\.gameObject\);/.test(cs))
  errors.push("the kept-scene stale-shadow cull (name + boardstamps path + manifest-disowned) is missing (round 26)");
if (!/stale shadow bake\(s\) removed/.test(cs))
  errors.push("the stale-shadow cull must speak in the heal receipt (round 26)");

/* round-26 item 2: the chip's star travels (owner: the app's "NEW ☆"
   arrived in Unity as bare NEW). App half: the chip bake carries the
   resolved icon NODE (ghosted, true geometry — the plate widens by
   star + gap), the seat parses off iconGroup's own transform against
   the shell0 center (the labelDx discipline), and the glyph ships white
   and tintable as chip/icon.png ("none" ships nothing). Importer half:
   WireIconSeat seats a swappable tinted Icon child on generation AND
   converges older prefabs in place; an existing Icon child is never
   touched. */
if (!/const iconOpt = n\.id === "chip" \? \{ icon: resolveKitIcon\(chipIconOv, undefined\) \} : \{\};/.test(src))
  errors.push("the chip bake must carry the resolved kit icon (every other family stays iconless/byte-stable) (round 26)");
if (!/chipIconOv === "none" \? null : \(chipIconOv \?\? STOCK_ICONS\.star\)/.test(src))
  errors.push("the chip's effective icon must honor 'none' and per-kit overrides with the stock star as default (round 26)");
if (!/addPng\("chip\/icon\.png"/.test(src) || !/file: "assets\/chip\/chip-icon\.png"/.test(src))
  errors.push("the chip's glyph must ship white+tintable (famPath: chip/chip-icon.png) with its seat on the base row (round 26)");
if (!/class PBIconSeat \{ public float dx; public float dy; public float s; public string file; public string ink; public string strokeFile; public string strokeInk; public float strokeS; \}/.test(cs)
    || !/public string labelText; public PBIconSeat icon;/.test(cs))
  errors.push("PBAsset must carry the icon seat (PBIconSeat, round-27 shape: + strokeFile/strokeInk/strokeS) — JsonUtility drops it without the field (round 26/27)");
if (!/static void WireIconSeat\(GameObject go, string root, PBManifest m, string fam\)/.test(cs)
    || !/WireIconSeat\(go, root, m, baseAsset\.component\);/.test(cs))
  errors.push("FamilyPrefab must seat the kit icon through WireIconSeat (round 26)");
if (!/wantIconAdd/.test(cs) || !/WireIconSeat\(contents, root, m, famName\);/.test(cs))
  errors.push("the maintenance pass must converge older prefabs onto the icon seat (wantIconAdd) (round 26)");
if (!/if \(go\.transform\.Find\("Icon"\) != null\) return;/.test(cs))
  errors.push("WireIconSeat must step aside for an existing Icon child — ours or the dev's (round 26)");

/* round-26 item 3: the emblem socket's halo completes (owner screenshot:
   the clock's glow cut square at a rect boundary). Chromium clips the
   intermediate of a MULTI-function CSS drop-shadow chain on SVG groups
   rasterized through an <img> — probe bisect: single filters clean, the
   chain squares, the chain SPLIT into nested singles (identical math)
   clean. Every bake road routes through splitFilterChains: the shell and
   state bakes and both posed-pipeline renders. */
if (!/const splitFilterChains = \(svg: string\): string => \{/.test(src))
  errors.push("splitFilterChains (the raster road's chain splitter) is missing (round 26 — the square halo)");
if ((src.match(/return splitFilterChains\(renderKit\(/g) ?? []).length !== 2)
  errors.push("shell() AND stateShell() must route their renders through splitFilterChains (round 26)");
if (!/ps2 = splitFilterChains\(ps2\);/.test(src) || !/ssv = splitFilterChains\(ssv\)/.test(src))
  errors.push("the posed pipeline (pose + state skins) must route through splitFilterChains (round 26)");
if (!/const pure = prims\.length >= 2 && prims\.join\(" "\)/.test(src))
  errors.push("splitFilterChains must split ONLY pure drop-shadow chains of 2+ — anything else passes through (round 26)");
if (!/let open = `<g style="filter:\$\{prims\[0\]\}"\$\{extras\}>`;/.test(src) || /\[\.\.\.prims\]\.reverse\(\)/.test(src))
  errors.push("split order is probe-convicted: f1 OUTERMOST, big blur innermost on raw content — reversing re-clips the square (round 26)");

/* round-26 item 4: the ScrollView reads deliberate. The bar hung off the
   panel's PADDED rect edge (halo air) at half its track's baked width —
   the reported sliver. It now seats inside the manifest-measured SHELL
   at the track sprite's own width; the viewport insets from the shell
   too; existing untouched prefabs re-seat in place (our constants,
   empty Content, said out loud). */
if (!/static bool ScrollViewPrefab\(string dir, string root, int pngScale, PBManifest m\)/.test(cs))
  errors.push("ScrollViewPrefab must take the manifest — the seat has no shell truth without it (round 26)");
if (!/float barW = Mathf\.Clamp\(track\.rect\.width \/ ps, 16f, 56f\);/.test(cs))
  errors.push("the scrollbar must wear the track sprite's own baked width — 22f was the sliver (round 26)");
if (!/vrt\.offsetMin = new Vector2\(padL \+ 18f, padB \+ 18f\);/.test(cs)
    || !/sbrt\.anchoredPosition = new Vector2\(-\(padR \+ 12f\), shellDy\);/.test(cs))
  errors.push("viewport and scrollbar must inset from the panel's SHELL box, not the padded rect (round 26)");
if (!/ShellRaycastPad\(go, "panel", m\);/.test(cs))
  errors.push("the ScrollView's clicks must stop at the drawn plate (ShellRaycastPad on the panel row) (round 26)");
if (!/static void HealScrollView\(string root, PBManifest m\)/.test(cs) || !/HealScrollView\(root, manifest\);/.test(cs))
  errors.push("the sliver-bar heal (our constants + empty Content only) is missing or never runs (round 26)");

/* round-27 item 1: the chip's star wears its FULL app dress (owner field
   test: "it is missing its styling (green stroke)"). App half: an
   inheriting icon is two iconGroup passes — outline pen under fill pen —
   and when the bake carries both (two color= attrs, stroke-mode def),
   the outline pass ships as its own white glyph on a PADDED canvas
   (half the pen hangs outside the path) plus its ink and box side on
   the icon seat. Importer half: the seat layers Stroke (echo) under
   Fill — the label's own echo naming — each tinted its own ink; rows
   without the stroke keep the single flat image bit-for-bit. */
if (!/chipIconDef\.mode === "stroke" && inks\.length >= 2/.test(src))
  errors.push("the stroke echo must gate on app truth — a stroke-mode def with BOTH passes in the bake (round 27)");
if (!/addPng\("chip\/icon-stroke\.png"/.test(src) || !/strokeFile: "assets\/chip\/chip-icon-stroke\.png"/.test(src))
  errors.push("the outline pass must ship as its own white glyph (famPath: chip/chip-icon-stroke.png) on the icon seat (round 27)");
if (!/const padIc = penIc \/ 2 \+ vbSideIc \/ 48;/.test(src))
  errors.push("the stroke glyph's canvas must pad by half the pen — an unpadded canvas clips the widened stroke (round 27)");
if (!/static void IconInkLayer\(Transform seat, string name, Sprite sp, string ink, float side\)/.test(cs))
  errors.push("IconInkLayer (one tinted ink layer of the icon seat) is missing (round 27)");
{
  const iSt = cs.indexOf('IconInkLayer(icGo.transform, "Stroke (echo)", strokeSp, rowIc.icon.strokeInk, rowIc.icon.strokeS);');
  const iFi = cs.indexOf('IconInkLayer(icGo.transform, "Fill", icSp, rowIc.icon.ink, rowIc.icon.s);');
  if (iSt < 0 || iFi < 0 || iFi < iSt)
    errors.push("WireIconSeat must layer Stroke (echo) UNDER Fill (sibling order is draw order) (round 27)");
}
if (!/rowIc\.icon\.strokeS > 2f && !string\.IsNullOrEmpty\(rowIc\.icon\.strokeFile\)/.test(cs))
  errors.push("the layered seat must gate on strokeS + strokeFile — older manifests keep the single flat image (round 27)");

/* round-27 item 2: the DOUBLED STAR (owner scene screenshot: "a
   misplaced star with stroke"). Only the label strips from a posed
   bake — the chip's styled star rides the posed pixels — so the
   prefab's live Icon child beside it was a second, mis-seated star.
   The build stands it down like Body/Specular; kept scenes heal the
   same way (ours by sprite, disabled not destroyed); and the pose
   divergence baseline wears the chip's star so stock-proportioned
   chips stop falsely posing at all. */
if (!/var icPos = inst\.transform\.Find\("Icon"\);\s*\n\s*if \(icPos != null\) icPos\.gameObject\.SetActive\(false\);/.test(cs))
  errors.push("posed placement must stand the live Icon child down — the posed pixels already carry the styled star (round 27)");
if (!/if \(icWantH != null && icHPath == icWantH\) \{ icHl\.gameObject\.SetActive\(false\); artFixed\+\+; \}/.test(cs))
  errors.push("the kept-scene doubled-star heal (ours by sprite, disable in place) is missing (round 27)");
if (!/icon: idBase === "chip" \? resolveKitIcon\(st\.kitIcons\?\.\[idBase\], undefined\) : null/.test(src))
  errors.push("the pose divergence baseline must wear the chip's own star — an iconless baseline falsely poses every stock chip copy (round 27)");

/* round-27 item 4: the socket's halo COMPLETES (owner, twice: "I'm
   still able to see the edges of the glow"). The emblem socket is the
   one family bake with a VISIBLE icon, and shell() zeroing the state
   glows gave its canvas a 0px pad (glowPadOf keys on state glow) — the
   icon-fx chain then rendered into the canvas edge. The bake now pads
   its canvas for the chain's full reach and hands the tight crop a
   wider margin so the falloff hits true zero inside the file. */
if (!/padSvg\(shell\("emblembar", \{ overlay: "dock", icon: undefined \}, slim\), 64\)/.test(src))
  errors.push("the emblem socket bake must pad its canvas (padSvg 64) — the icon-fx halo clips at glowPadOf's zeroed-state 0px pad (round 27)");
if (!/typeof q\.crop === "number" \? q\.crop : undefined/.test(src) || !/Drop your own art in its well\." \}, 24\);/.test(src))
  errors.push("the socket must ride the numeric-margin crop road (tight crop, margin 24) so the halo tail reaches alpha 0 (round 27)");

/* round-27 item 3: v1 fill-only Icons converge to the layered seat —
   ONLY when provably ours and untouched (childless, our sprite, our
   tint); anything the dev swapped, retinted or grew stays theirs. */
if (!/wantIconStroke/.test(cs)
    || !/AssetDatabase\.GetAssetPath\(icIm0\.sprite\)\.Replace\("\\\\", "\/"\) == root \+ "\/" \+ rowIc0\.icon\.file/.test(cs))
  errors.push("the stroke-upgrade convergence must prove the Icon is ours by sprite path before touching it (round 27)");
if (!/if \(icTU != null && icTU\.childCount == 0\) \{\s*\n\s*UnityEngine\.Object\.DestroyImmediate\(icTU\.gameObject, true\);\s*\n\s*WireIconSeat\(contents, root, m, famName\);/.test(cs))
  errors.push("the stroke upgrade must rebuild through WireIconSeat and only ever remove a childless Icon (round 27)");

/* round-28 slice A: the ScrollView is production-USABLE (external Unity
   tester + outside consultant: the top production-truth gap before the
   store run). Content is a ready list column — stacking group + height
   fitter, widths controlled to the column, heights the children's own —
   the wheel moves at desktop speed (Unity's scrollSensitivity 1 is one
   pixel per notch), and the handle keeps the kit's pixels in every
   state, Selected included, so a released handle never parks in
   rollover. Existing EMPTY, unrigged views graft the same wiring in
   place (a filled or dev-rigged Content is theirs), out loud. */
if (!/vlg\.childControlWidth = true; vlg\.childControlHeight = false;/.test(cs)
    || !/csf\.verticalFit = ContentSizeFitter\.FitMode\.PreferredSize;/.test(cs))
  errors.push("the ScrollView Content list rig (vertical group + height fitter) is missing or mis-dialed (round 28)");
if (!/sr\.scrollSensitivity = 35f;/.test(cs))
  errors.push("the ScrollView wheel step (scrollSensitivity 35 — Unity's 1 reads dead) is missing (round 28)");
if (!/hb\.selectedColor = Color\.white;/.test(cs) || !/hb\.pressedColor = new Color\(0\.86f, 0\.86f, 0\.86f, 1f\);/.test(cs))
  errors.push("the scrollbar handle's state manners (kit pixels every state; Selected = resting) are missing (round 28)");
if (!/contentT\.GetComponent<VerticalLayoutGroup>\(\) != null \|\| contentT\.GetComponent<ContentSizeFitter>\(\) != null\) return;/.test(cs)
    || !/if \(contentT\.childCount != 0\) return;/.test(cs))
  errors.push("HealScrollView's round-28 graft must step aside for a filled or already-rigged Content (the dev's) (round 28)");
if (!/barH\.colors\.Equals\(ColorBlock\.defaultColorBlock\)/.test(cs) || !/Mathf\.Approximately\(srH\.scrollSensitivity, 1f\)/.test(cs))
  errors.push("the graft's feel/handle writes must gate on still-at-Unity-default (the redress rule) (round 28)");
if (!/ScrollView\.prefab is now a working list/.test(cs))
  errors.push("the ScrollView graft must speak (the heal receipt line) (round 28)");
if (!/\*\*ScrollView\*\*: a WORKING list/.test(src))
  errors.push("the README's ScrollView bones entry (the working-list contract) is missing (round 28)");

/* round-28 slice B: the Input is a WORKING TMP_InputField (the gap's
   second half). The wiring: a RectMask2D Text Area strip seated on the
   manifest's placeholder line (the well's measured midline), the
   placeholder live in the kit face at AddPlaceholder's exact dress, the
   typed value on the ROBUST body voice — the kit's own face (plain
   material) only when its TTF proves printable ASCII at import, else
   TMP's LiberationSans, with the grotesk on the kit face's fallback
   table either way. Caret + selection wear the kit's Glow; the value
   ink answers the well's luma. Pre-TMP editors keep the bare surface +
   placeholder. Existing bare Input prefabs graft the field in place
   only when provably ours and unwired, keeping a retyped placeholder
   word, out loud. */
if (!/static void WireInputField\(GameObject go, string root, PBManifest m, Font kitFont\)/.test(cs))
  errors.push("WireInputField is missing (round 28)");
if (!/WireInputField\(go, root, m, kitFont\);/.test(cs) || !/AddPlaceholder\(go, root, m, kitFont\);/.test(cs))
  errors.push("FamilyPrefab must wire the input as a FIELD on TMP editors and keep the placeholder surface on pre-TMP editors (round 28)");
if (!/new GameObject\("Text Area", typeof\(RectTransform\), typeof\(RectMask2D\)\);/.test(cs))
  errors.push("the input's masked Text Area strip is missing — typed text would spill over the bevel (round 28)");
if (!/static bool FontCoversPrintableAscii\(Font f\)/.test(cs) || !/for \(int ch = 32; ch < 127; ch\+\+\)/.test(cs))
  errors.push("the body-voice coverage proof (printable ASCII over the shipped TTF) is missing (round 28)");
if (!/kitFace\.fallbackFontAssetTable\.Add\(grotesk\);/.test(cs))
  errors.push("LiberationSans must ride the kit face's fallback table — typed glyphs beyond the TTF box without it (round 28)");
if (!/0\.2126f \* well\.r \+ 0\.7152f \* well\.g \+ 0\.0722f \* well\.b/.test(cs))
  errors.push("the value ink must answer the WELL's luma (light well takes a dark ink) (round 28)");
if (!/input\.customCaretColor = true;/.test(cs) || !/selWash\.a = 0\.35f;/.test(cs))
  errors.push("caret/selection must wear the kit's Glow ink and its translucent wash (round 28)");
if (!/tx\.raycastTarget = false; \/\/ the field's root Image carries the click/.test(cs))
  errors.push("the value text must never be a raycast target — the shell-true root Image is the click carrier (round 28)");
if (!/NEVER input\.fontAsset \/ input\.pointSize here/.test(cs))
  errors.push("the global-setter hazard note must stand — input.fontAsset/pointSize restamp the placeholder's kit face (round 28)");
if (!/GetComponentInChildren<TMP_InputField>\(true\) == null/.test(cs) || !/GetComponentInChildren<Selectable>\(true\) == null/.test(cs)
    || !/asset\.transform\.Find\("Text Area"\) == null/.test(cs))
  errors.push("the input graft must prove the prefab ours and unwired (no field, no Selectable, no Text Area) before touching it (round 28)");
if (!/nT\.text = devWord; \/\/ a retyped word is the dev's/.test(cs))
  errors.push("the input graft must keep a retyped placeholder word (round 28)");
if (!/Input\.prefab is now a working TMP_InputField/.test(cs))
  errors.push("the input graft must speak (the heal receipt line) (round 28)");
if (!/\*\*Input\*\*: a WORKING TMP_InputField/.test(src))
  errors.push("the README's Input bones entry (the working-field contract) is missing (round 28)");

/* round-29 slice A: the RESPONSIVE CONTRACT — safe area + scaler policy
   (the Asset Store long pole). Every board scene puts a "Safe Area" root
   (full-stretch + the KitSafeArea runtime) between the Canvas and the
   content; Background/Overlay stay full-bleed on the Canvas. The scaler
   match policy lives in ONE seat (ScalerMatchFor: portrait matches
   width, landscape 0.5). Kept scenes adopt the root heal-out-loud; the
   word-heal walk follows the root; a Responsive Check scene ships the
   whole story visibly. The runtime is CORE-ONLY (Screen.safeArea) — the
   round-19 P0 rule extends to it verbatim. */
const safeOpen = src.indexOf("const SAFE_AREA_RUNTIME = `");
let safe = "";
if (safeOpen < 0) errors.push("SAFE_AREA_RUNTIME not found — the safe-area runtime template is missing (round 29)");
else {
  const safeStart = safeOpen + "const SAFE_AREA_RUNTIME = `".length;
  let safeEnd = -1;
  for (let i = safeStart; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "`") { safeEnd = i; break; }
  }
  safe = safeEnd > 0 ? new Function("return `" + src.slice(safeStart, safeEnd) + "`;")() : "";
}
if (!/public class KitSafeArea : MonoBehaviour/.test(safe) || !/Screen\.safeArea/.test(safe))
  errors.push("KitSafeArea (the Screen.safeArea anchor tracker) is missing from the runtime template (round 29)");
if (!/if \(w < 1f \|\| h < 1f\) return;/.test(safe))
  errors.push("KitSafeArea must refuse a zero-size screen frame — a headless/startup frame would write garbage anchors (round 29)");
if (!/if \(max\.x - min\.x < 0\.2f \|\| max\.y - min\.y < 0\.2f\) \{ min = Vector2\.zero; max = Vector2\.one; \}/.test(safe))
  errors.push("KitSafeArea's degenerate-report guard is missing — a bad safe rect must never collapse the UI (round 29)");
if (/UnityEditor|UnityEngine\.InputSystem|using TMPro/.test(safe) || (safe.match(/^using /gm) ?? []).length !== 1)
  errors.push("KitSafeArea must stay CORE-ONLY (one using: UnityEngine) — package references in Runtime files are the round-19 P0 class break");
if (!/path: "Runtime\/PatternBreakSafeArea\.cs", data: SAFE_AREA_RUNTIME/.test(src) || !/"Runtime\/PatternBreakSafeArea\.cs",/.test(src))
  errors.push("PatternBreakSafeArea.cs must ship AND ride the sharedScripts set — per-slug runtime copies kill the assembly (the IdleShine lesson)");
{
  const roots = (cs.match(/new GameObject\("Safe Area", typeof\(RectTransform\), typeof\(KitSafeArea\)\)/g) ?? []).length;
  if (roots < 3)
    errors.push(`the "Safe Area" root must be built in the board builder, the Responsive Check scene AND the kept-scene graft — found ${roots} of 3 (round 29)`);
  const reparents = (cs.match(/SetParent\(safeT, false\)/g) ?? []).length;
  if (reparents < 6)
    errors.push(`board content must parent under the Safe Area root (safeT) — found ${reparents} SetParent(safeT, false) sites, expected >=6 (round 29)`);
}
if (!/bgGo\.transform\.SetParent\(canvasGo\.transform, false\);/.test(cs))
  errors.push("the Background must stay on the CANVAS (full-bleed, outside the safe root) — backdrops fill the screen, UI respects cutouts (round 29)");
if (!/static float ScalerMatchFor\(float refW, float refH\)/.test(cs) || !/return refH > refW \? 0f : 0\.5f;/.test(cs))
  errors.push("ScalerMatchFor (the ONE-seat match policy: portrait width-match, landscape 0.5) is missing (round 29)");
if ((cs.match(/scaler\.matchWidthOrHeight = ScalerMatchFor\(/g) ?? []).length !== 2)
  errors.push("both responsive scene builders (board + check) must dial the scaler through ScalerMatchFor — an inline match value forks the policy (round 29)");
if (!/static void HealSafeAreaRoots\(string root, PBManifest m\)/.test(cs) || !/HealSafeAreaRoots\(root, manifest\);/.test(cs))
  errors.push("the kept-scene safe-area graft (HealSafeAreaRoots) is missing or never runs (round 29)");
if (!/canvasC\.transform\.Find\("Safe Area"\) != null\) continue;/.test(cs))
  errors.push("the graft must step aside for a scene that already carries the root (round 29)");
if (!/chS\.name == "Background" \|\| chS\.name == "Overlay"\) continue;/.test(cs))
  errors.push("the graft must leave Background/Overlay full-bleed on the Canvas (round 29)");
if (!/adopted the responsive Safe Area root/.test(cs))
  errors.push("the safe-area graft must speak (heal-out-loud receipt line) (round 29)");
if (!/var safeWalk = canvasC\.transform\.Find\("Safe Area"\);/.test(cs))
  errors.push("HealBoardWords' walk must follow the Safe Area root when present — the word heal would go blind on responsive scenes (round 29)");
if (!/static void BuildResponsiveCheck\(string root, PBManifest m\)/.test(cs) || !/BuildResponsiveCheck\(root, manifest\);/.test(cs))
  errors.push("the Responsive Check scene builder is missing or never runs (round 29)");
if (!/Responsive Check\.unity/.test(cs) || !/Rebuild Responsive Check Scene/.test(cs))
  errors.push("the Responsive Check scene path or its Rebuild menu is missing (round 29)");
if ((cs.match(/CheckEdge\(safeT, "Safe Edge /g) ?? []).length !== 4)
  errors.push("the Responsive Check must outline all four safe-area edges (round 29)");
if (!/### Safe areas & scaling/.test(src))
  errors.push("the README's safe-area & scaling section is missing (round 29)");

/* round-29 slice B: ANCHOR INFERENCE v1 — one conservative, manifest-
   decidable rule (18% edge band -> edge/corner; middle -> center; baked
   unrotated art spanning 80%+ of a dimension -> stretch, text and glyph
   art exempt, live prefabs never). The builder RE-ANCHORS after placement
   with the reference-res seat held exact; the shadow sibling rides the
   same anchor; the heals match BOTH builder vintages through one seat
   helper and write stretch-aware sizes. Predictability is the contract —
   these pins keep the rule from quietly getting clever. */
if (!/static void InferAnchor\(PBBoardItem it, PBBoard bd, out Vector2 aMin, out Vector2 aMax\)/.test(cs))
  errors.push("InferAnchor (the one-seat anchor rule) is missing (round 29B)");
if (!/float band = 0\.18f, span = 0\.80f;/.test(cs))
  errors.push("the rule's dials moved — 18% edge band / 80% span are the DOCUMENTED v1 numbers (round 29B)");
if (!/bool baked = !string\.IsNullOrEmpty\(it\.stamp\) && it\.component != "typestamp" && it\.component != "bigglyph";/.test(cs))
  errors.push("stretch must stay off text stamps, glyph art and every LIVE prefab — distorted letterforms / scale-broken anchors (round 29B)");
if (!/baked && Mathf\.Abs\(it\.rot\) <= 0\.01f/.test(cs))
  errors.push("a rotated copy must never stretch (stretch + rotation is shear) (round 29B)");
if (!/static int ApplyInferredAnchor\(RectTransform rt, PBBoardItem it, PBBoard bd\)/.test(cs)
    || !/rt\.anchoredPosition \+= new Vector2\(\(it\.ax - fAx\) \* bd\.w, \(it\.ay - fAy\) \* bd\.h\);/.test(cs))
  errors.push("the re-anchor must pay the anchor-reference shift back into anchoredPosition — the reference-res seat is held EXACT (round 29B)");
if (!/if \(aMax\.x - aMin\.x > 0\.5f\) \{ sd\.x -= bd\.w; stretched = true; \}/.test(cs))
  errors.push("a stretched axis must pay the parent span out of sizeDelta (margins, not absolute size) (round 29B)");
if (!/int anchorKind = ApplyInferredAnchor\(rt, it, bd\);/.test(cs)
    || !/if \(shadowRt != null\) ApplyInferredAnchor\(shadowRt, it, bd\);/.test(cs))
  errors.push("placement must re-anchor the piece AND its shadow sibling with the same rule — split anchors drift the pair apart (round 29B)");
if (!/static bool MatchesSeat\(RectTransform crt, PBBoardItem it, PBBoard bd\)/.test(cs)
    || !/if \(MatchesSeat\(crt, it, bd\)\) \{ it2 = it; break; \}/.test(cs))
  errors.push("the heals must match seats through MatchesSeat (both builder vintages) — an inline matcher goes blind on responsive scenes (round 29B)");
if ((cs.match(/SeatSizeDelta\(crt, it2, bd\);/g) ?? []).length !== 2)
  errors.push("both bake re-adoption sites must size through SeatSizeDelta — a raw (w, h) write balloons a stretch-anchored stamp (round 29B)");
if (!/responsive anchors — /.test(cs))
  errors.push("the per-scene responsive-anchor receipt line is missing (round 29B)");
if (!/outer 18%\*\* of the frame/.test(src) || !/80%\+ of a dimension\*\*/.test(src))
  errors.push("the README must document the v1 anchor rule with its real numbers (round 29B)");

/* ── P0 CLASS INVARIANT (verification sweep): the TMP GUARD DISCIPLINE.
   `using TMPro;` is compiled OUT below 2023.2, so an UNQUALIFIED TMP
   symbol outside a UNITY_2023_2_OR_NEWER block is CS0246 on every 2022.3
   editor — WITH or WITHOUT TMP installed — and the whole Editor assembly
   dies: nothing imports. 2022.3 LTS is the Asset Store minimum. The five
   TMP_FontAsset signatures that shipped this way also dragged guard-only
   helpers (ApplyStyleRecipe, LabelSize, ExpectedShift, FindOurLabelRoot,
   LabelText) and guard-only members (HeroLabel.SetText/authoredHeight,
   LabelStateInk's shifts) into pre-2023.2 code — a dozen CS0103/CS1061
   behind the CS0246s. THE STANDARD, pinned here over EVERY emitted
   template, preprocessed exactly as a pre-2023.2 editor sees it:
   (1) unqualified TMP symbols live ONLY inside UNITY_2023_2_OR_NEWER;
   (2) outside the guards the importer uses TMPro.-QUALIFIED references —
       legal because both asmdefs declare Unity.TextMeshPro and 2022.3
       ships TMP in every project template (a DELIBERATE hard dependency);
       runtime templates keep TMP fully guarded (no qualified refs either —
       the round-19 spirit: runtime files stay maximally version-proof);
   (3) an importer static method defined only under the guard is never
       called from pre-2023.2-visible code;
   (4) guard-only runtime members are guarded at every importer call site —
       checked through the load-bearing `hl*` local convention for
       HeroLabel (rename any unrelated hl* local) and the LabelStateInk
       shift names. ── */
{
  // preprocess a template as a pre-2023.2 editor sees it; strip strings +
  // comments per line so quoted/documented names never count
  const preView = (text) => {
    const outPre = [];
    const stack = [];
    let inBlockC = false;
    const rows = text.split("\n");
    for (let ln = 0; ln < rows.length; ln++) {
      const row = rows[ln];
      const t = row.trim();
      if (/^#if\b/.test(t)) { stack.push(/UNITY_2023_2_OR_NEWER/.test(t) ? "ex" : "o"); continue; }
      if (/^#else\b/.test(t)) { const f = stack[stack.length - 1]; if (f === "ex") stack[stack.length - 1] = "in"; else if (f === "in") stack[stack.length - 1] = "ex"; continue; }
      if (/^#elif\b/.test(t)) { if (stack[stack.length - 1] === "ex") stack[stack.length - 1] = "in"; continue; }
      if (/^#endif\b/.test(t)) { stack.pop(); continue; }
      let bare = "";
      let i = 0;
      while (i < row.length) {
        if (inBlockC) { const c = row.indexOf("*/", i); if (c < 0) { i = row.length; break; } inBlockC = false; i = c + 2; continue; }
        const ch = row[i];
        if (ch === "/" && row[i + 1] === "/") break;
        if (ch === "/" && row[i + 1] === "*") { inBlockC = true; i += 2; continue; }
        if (ch === '"' || ch === "'") {
          const q = ch; let j = i + 1;
          while (j < row.length) { if (row[j] === "\\") { j += 2; continue; } if (row[j] === q) break; j++; }
          i = j + 1; bare += " "; continue;
        }
        bare += ch; i++;
      }
      outPre.push({ ln: ln + 1, bare, excluded: stack.includes("ex") });
    }
    if (stack.length !== 0) errors.push("unbalanced #if/#endif in an emitted template — the whole file miscompiles on one editor stream");
    return outPre;
  };
  const TMP_SYMBOL = /\b(TMP_[A-Za-z_]+|TextMeshProUGUI|TextMeshPro(?!UGUI)|FontStyles|TextAlignmentOptions|TextOverflowModes|VertexGradient)\b/g;
  const tplRe = /const ([A-Z_]+) = `/g;
  let tpl;
  while ((tpl = tplRe.exec(src))) {
    const tplName = tpl[1];
    if (tplName === "GLINT_INK_SHADER") continue; // shader text, not C#
    const tStart = tpl.index + tpl[0].length;
    let tEnd = -1;
    for (let i = tStart; i < src.length; i++) { if (src[i] === "\\") { i++; continue; } if (src[i] === "`") { tEnd = i; break; } }
    if (tEnd < 0) continue;
    let tplCs;
    try { tplCs = new Function("return `" + src.slice(tStart, tEnd) + "`;")(); } catch { continue; }
    const view = preView(tplCs);
    // (1)+(2): TMP symbols visible pre-2023.2
    for (const L of view) {
      if (L.excluded) continue;
      let sm;
      TMP_SYMBOL.lastIndex = 0;
      while ((sm = TMP_SYMBOL.exec(L.bare))) {
        const qualified = /TMPro\s*\.\s*$/.test(L.bare.slice(0, sm.index));
        if (!qualified)
          errors.push(`${tplName} line ${L.ln}: UNQUALIFIED TMP symbol '${sm[0]}' outside the UNITY_2023_2_OR_NEWER guard — CS0246 on every 2022.3 editor, the whole assembly dies (qualify as TMPro.${sm[0]} or move it inside the guard)`);
        else if (tplName !== "UNITY_IMPORTER")
          errors.push(`${tplName} line ${L.ln}: TMPro.-qualified reference outside the guard in a RUNTIME template — runtime files keep TMP fully guarded (round-19 spirit); guard it`);
      }
    }
    if (tplName !== "UNITY_IMPORTER") continue;
    // (3): guard-only importer statics never called from pre-visible code
    const defRe = /^\s*(?:static|internal static|public static)\s+[\w<>,.[\] ]+?\b([A-Z]\w+)\s*\(/;
    const defsIn = new Set(), defsOut = new Set();
    for (const L of view) {
      const dm = L.bare.match(defRe);
      if (dm) (L.excluded ? defsIn : defsOut).add(dm[1]);
    }
    const guardOnly = [...defsIn].filter((n) => !defsOut.has(n));
    for (const L of view) {
      if (L.excluded) continue;
      for (const n of guardOnly)
        if (new RegExp(`\\b${n}\\s*\\(`).test(L.bare))
          errors.push(`UNITY_IMPORTER line ${L.ln}: pre-2023.2-visible code calls '${n}', which is defined only inside the UNITY_2023_2_OR_NEWER guard — CS0103 on 2022.3 (guard the call site or move the helper out)`);
    }
    // (4): guard-only runtime members through the hl*/shift conventions
    for (const L of view) {
      if (L.excluded) continue;
      if (/\bhl\w*\s*\.\s*(text|fontSize|SetText|authoredHeight|lineSpacing|spacing|wordSpacing|nudge|margins|shadowInk|strokeInk|glintsInk)\b/.test(L.bare))
        errors.push(`UNITY_IMPORTER line ${L.ln}: pre-2023.2-visible code touches a HeroLabel member (guard-only — the class is EMPTY below 2023.2): CS1061. Guard the call site; if this is not a HeroLabel local, rename it off the hl* convention`);
      if (/\.\s*(pressedShift|hoverShift)\b/.test(L.bare))
        errors.push(`UNITY_IMPORTER line ${L.ln}: pre-2023.2-visible code touches LabelStateInk's shift fields (guard-only): CS1061 — guard the call site`);
      if (/\.\s*SetText\s*\(/.test(L.bare))
        errors.push(`UNITY_IMPORTER line ${L.ln}: pre-2023.2-visible .SetText( — HeroLabel's SetText is guard-only, and pre-2023.2 TMP writes use .text = (the standard): guard or rewrite`);
    }
  }
  // (2)'s legal basis: BOTH asmdefs must keep declaring Unity.TextMeshPro
  if (!/references: \["PatternBreak.Runtime", "Unity.TextMeshPro", "UnityEngine.UI", "Unity.InputSystem"\]/.test(src))
    errors.push("the Editor asmdef must declare Unity.TextMeshPro (and its documented companions) — the TMPro.-qualified standard outside the guards rides on that declaration");
}

/* ── LEADING TRAVELS (the End Turn line-gap round): the app stacks the
   endturn's two lines at fs · 0.73em · leading/100 (bevel, fork-first
   per key — a fork snapshot without the key falls through to the dial),
   and the export must carry the resolved dial or Unity's LIVE label
   re-typesets at TMP's default line height forever (owner: "Leading did
   not work on the End Turn button"). The plumb: manifest rows (base +
   per-state, ≠100 only so factory kits stay byte-identical) →
   PBAsset.leading → ONE importer seam, LeadingLineSpacing =
   0.73 * (leading − 100) — TMP lineSpacing is em*100 of font size, so
   the app's delta-from-factory maps exactly and absent/100 (the old-zip
   0-gate) keeps today's look untouched. Convergence rides the redress
   with a still-at-0 gate, mirrored probe and dresser. ── */
if (!/const lead = fsW \* 0\.73 \* \(\(leadT\.leading \?\? cfg\.type\.leading \?\? 100\) \/ 100\);/.test(bevelSrc))
  errors.push("the app's endturn leading rule (fs * 0.73em * leading/100, fork-first per key) moved — the importer's 0.73 mapping is derived from it, re-derive BOTH together");
if (!/const STACKED_LABEL_PROPS = new Set<KitComponentId>\(\["endturn"\]\);/.test(src))
  errors.push("STACKED_LABEL_PROPS (the stacked multi-line label set the Leading emission rides) is missing — future stacked labels inherit the plumb through it");
if (!/\(stName \? c\.stateDesigns\?\.\[stName\]\?\.type\?\.leading : undefined\) \?\? c\.type\.leading \?\? 100/.test(src))
  errors.push("the export's leading resolution must mirror bevel's fork-first PER-KEY read — a wholesale fork read masks the dial at 100% the moment a state is designed (the app's own End Turn lesson)");
if (!/leadingOf\(id, stName\) !== 100 \? \{ leading: leadingOf\(id, stName\) \} : \{\}/.test(src))
  errors.push("the leading row must emit ONLY when non-factory (≠ 100) — factory kits stay byte-identical, and the importer's 0-gate is the old-zip contract");
if (!/public float labelFs; public string labelInk; public string labelInk2; public float leading; public string labelText;/.test(cs))
  errors.push("PBAsset must carry the leading field — JsonUtility silently drops the manifest row without it");
if (!/static float LeadingLineSpacing\(PBAsset row\)/.test(cs)
    || !/return row != null && row\.leading > 0f \? 0\.73f \* \(row\.leading - 100f\) : 0f;/.test(cs))
  errors.push("LeadingLineSpacing (the ONE seam: 0.73 * (leading − 100), 0-gated so absent/factory rows leave TMP's natural line height — today's look) is missing or its formula drifted");
if (!/hlLead\.lineSpacing = lsp; hlLead\.SetText\(text\);/.test(cs))
  errors.push("the hero-stack birth must apply the Leading (set, then re-Apply via SetText — BuildHeroStack's construction-order rule)");
if (!/if \(lsp != 0f\) t\.lineSpacing = lsp;/.test(cs))
  errors.push("the solo baked-label birth must apply the Leading (0-gated)");
if (!/if \(tLead != null && lspT != 0f\) tLead\.lineSpacing = lspT;/.test(cs))
  errors.push("the styled-SDF label rung must apply the Leading (one seam, one number)");
if (!/if \(lrowA != null && lrowA\.leading > 0f\) t\.lineSpacing = lrowA\.leading \/ 100f;/.test(cs))
  errors.push("the legacy Text rung must carry the dial as its line-height multiplier (0-gated; factory 100 ⇒ 1.0 = Unity's default)");
if (!/\(hlLd != null && hlLd\.lineSpacing == 0f\) \|\| \(tmLd != null && tmLd\.lineSpacing == 0f\)\) wantDress = true;/.test(cs))
  errors.push("the redress probe must converge a still-at-0 lineSpacing when the manifest resolves a Leading (and ONLY then — hand-tuned values are the maker's)");
if (!/newHl\.lineSpacing = keepLineSpacing != 0f \? keepLineSpacing : LeadingLineSpacing\(LabelRow\(m, famName\)\);/.test(cs))
  errors.push("the redress restore must mirror the probe's gate (hand-tuned survives verbatim; still-at-0 adopts the manifest) — probe and dresser disagreeing is an infinite re-dress");

/* ── round-31 (store packaging · slice 1): Third-Party Notices.txt.
   The Asset Store requires third-party components to carry notices. The
   engine zip's notices file consolidates: the shipped font licences (the
   SAME text that ships beside the font — never a second fetch that could
   disagree), the CC-BY semantic-glyph credits (glyphLibrary's
   glyphAttribution — ONE source of truth shared with the web kit's
   LICENCE.txt), the shipped icon-set provenance, and the honest
   LiberationSans pointer (the importer's fallback wiring REFERENCES the
   user's own TMP asset; nothing Liberation is redistributed). Emission
   sites report into collectors as they push — the file never lists on
   faith. */
const glyphLibSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/generator/glyphLibrary.ts"), "utf8");
if (!/export function glyphAttribution\(/.test(glyphLibSrc))
  errors.push("glyphLibrary.glyphAttribution is gone — the engine notices' CC-BY block and the web kit's LICENCE.txt both ride it (round 31)");
if (!/import \{ glyphAttribution \} from "\.\/glyphLibrary";/.test(src))
  errors.push("engineExport must take the CC-BY glyph credits from glyphLibrary.glyphAttribution — re-deriving them forks the source of truth (round 31)");
if (!/files\.push\(\{ path: "Third-Party Notices\.txt", data: tpn \}\);/.test(src))
  errors.push("the Third-Party Notices.txt emission is missing — store submission requires consolidated third-party notices (round 31)");
if ((src.match(/tpnFonts\.push\(/g) ?? []).length < 2)
  errors.push("both font roads (the kit faces loop AND the Inter instrument voice) must report into the notices collector — a shipped font without a notice is a store rejection (round 31)");
if (!/licenceText: got\.licenceText/.test(src) || !/licenceText: inst\.licenceText/.test(src))
  errors.push("the notices must carry the SAME licence text that ships beside the font (got/inst.licenceText) — a re-fetch could disagree with the bundled file (round 31)");
if (!/const oflLicenceBody = `/.test(src) || !/SIL OPEN FONT LICENSE Version 1\.1 - 26 February 2007/.test(src))
  errors.push("the embedded OFL 1.1 fallback body (canonical title line included) is missing — the pointer road must still carry the licence in full (round 31)");
if (!src.slice(src.indexOf("function thirdPartyNotices")).split("\n}")[0].includes("oflLicenceBody"))
  errors.push("thirdPartyNotices must use the embedded OFL body on the pointer road (font licence unfetchable) — a bare URL is not a notice (round 31)");
if (!/it\.component\.startsWith\("glyph"\)/.test(src) || !/shp\.startsWith\("glyph:"\)/.test(src) || !/st\.cfg\.shape\.startsWith\("glyph:"\)/.test(src))
  errors.push("all three CC-BY glyph roads must feed the notices: board-placed glyph pieces (boardstamps), kitShapes glyph dress, and the master glyph shape (round 31)");
if (!/tpnIcon\(chipIconDef\);/.test(src) || !/tpnIcon\(def\);/.test(src))
  errors.push("the baked-icon emission sites (chip glyph, STOCK_ICONS set) must report their provenance into the notices (round 31)");
if (!/LiberationSans \(TextMesh Pro Essential Resources\) — NOT distributed/.test(src))
  errors.push("the LiberationSans reference note is missing — the importer wires it as a fallback, so the notices must say it is referenced, not redistributed (round 31)");

/* ── round-31 (store packaging · slice 2): the Documentation front door.
   Store reviewers and buyers look for a Documentation folder by name;
   Documentation/QuickStart.md is the five-minute version of the deck
   (UNITY-README.md stays the long-form walkthrough and each references
   the other). Its five beats mirror what the importer actually does —
   the claims are pinned here so a doc edit can't drift from the truth. */
if (!/files\.push\(\{ path: "Documentation\/QuickStart\.md", data: quickStartDoc\(st\) \}\);/.test(src))
  errors.push("Documentation/QuickStart.md emission is missing — the store's Documentation front door (round 31)");
{
  const qsAt = src.indexOf("function quickStartDoc(");
  const qs = qsAt >= 0 ? src.slice(qsAt, src.indexOf("\n}\n", qsAt)) : "";
  if (!qs) errors.push("quickStartDoc is missing (round 31)");
  else {
    if (!/Drag the folder in/.test(qs) || !/Playground\.unity/.test(qs))
      errors.push("QuickStart lost beat 1/2 (drag the folder in; open the Playground and press Play) — round 31");
    if (!/GameObject > UI Kit Maker >/.test(qs))
      errors.push("QuickStart beat 3 must name the real menu path (GameObject > UI Kit Maker >) — round 31");
    if (!/Inspector/.test(qs) || !/live text/.test(qs))
      errors.push("QuickStart beat 4 (retype live-text labels; restyle via the components' Inspector notes) is missing — round 31");
    if (!/Responsive Check\.unity/.test(qs) || !/extract over the same spot/.test(qs))
      errors.push("QuickStart beat 5 must keep the Responsive Check scene and the re-export-heals-in-place promise — round 31");
    if (!/UNITY-README\.md/.test(qs))
      errors.push("QuickStart must cross-reference the deck (UNITY-README.md) — round 31");
  }
  if (!/Documentation\/QuickStart\.md\*\* is the five-minute version/.test(src))
    errors.push("the deck must cross-reference Documentation/QuickStart.md (round 31)");
}

/* ── round-31 (store packaging · slice 3): the remix seam. The deck and
   the QuickStart each carry exactly ONE clearly-labeled remix line with
   the campaign-attributed URL — plain markdown a human clicks. House
   rule, pinned mechanically: the campaign link must NEVER appear inside
   any emitted C#/shader template — no editor windows, no popups, no
   startup nags, nothing that reads as a marketing-only editor feature. */
{
  const remixHits = (src.match(/uikitmaker\.com\/\?src=unity-asset-store/g) ?? []).length;
  if (remixHits !== 2)
    errors.push(`the remix link must appear exactly twice (deck + QuickStart, one clearly-labeled line each); found ${remixHits} (round 31)`);
  if ((src.match(/\*\*Remix this kit:\*\*/g) ?? []).length !== 2)
    errors.push("the remix line must keep its clear label (**Remix this kit:**) in both docs (round 31)");
  const tplScanRe = /const ([A-Z_]+) = `/g;
  let tplScan;
  while ((tplScan = tplScanRe.exec(src))) {
    const tStart2 = tplScan.index + tplScan[0].length;
    let tEnd2 = -1;
    for (let i = tStart2; i < src.length; i++) { if (src[i] === "\\") { i++; continue; } if (src[i] === "`") { tEnd2 = i; break; } }
    if (tEnd2 < 0) continue;
    const body = src.slice(tStart2, tEnd2);
    if (/[?&]src=|[?&]utm_/.test(body))
      errors.push(`${tplScan[1]}: a campaign-attributed URL is inside an emitted C#/shader template — the remix link lives in the docs only, never in editor code (round 31)`);
  }
}

/* ── round-31 (store packaging · slice 4): the warning-free import sweep.
   The store requires packages to import without package-originated
   warnings. Every kit image must ride an explicitly configured road: the
   manifest road (assets/, always Uncompressed), the bake roads
   (boardstamps/bigglyphs/stamps, Uncompressed), the baked-face atlas, the
   round-31 human-facing road (docs/, atlas/, the face tile — lossless
   Default, NPOT-safe), and backgrounds, which keep block compression ONLY
   when both sides are multiples of 4 (otherwise Unity logs one Console
   warning per import) — checked via the editor's own source-size read,
   falling back to lossless if that read ever disappears. */
if (!/path\.Contains\("\/docs\/"\) \|\| path\.Contains\("\/atlas\/"\) \|\| path\.EndsWith\("\/fonts\/face-pattern\.png"\)/.test(cs))
  errors.push("the round-31 human-facing texture road (docs/, atlas/, face-pattern) is missing — those NPOT images would import as compressed sprites and warn on clean 2D projects");
if (!/dti\.npotScale = TextureImporterNPOTScale\.None;/.test(cs) || !/dti\.textureCompression = TextureImporterCompression\.Uncompressed;/.test(cs))
  errors.push("the human-facing road must import lossless Default with NPOT scaling off (round 31)");
if (!/if \(path\.EndsWith\("\/fonts\/face-pattern\.png"\)\) dti\.wrapMode = TextureWrapMode\.Repeat;/.test(cs))
  errors.push("the face tile must wrap Repeat — the Face Texture slot tiles it (round 31)");
if (!/GetSourceTextureWidthAndHeight/.test(cs) || !/bgw % 4 != 0 \|\| bgh % 4 != 0\) gti\.textureCompression = TextureImporterCompression\.Uncompressed;/.test(cs))
  errors.push("the backgrounds multiple-of-4 compression gate is missing — odd-sized backdrops log a Console warning on every clean import (round 31)");
if (!/catch \(Exception\) \{ gti\.textureCompression = TextureImporterCompression\.Uncompressed; \}/.test(cs))
  errors.push("the backgrounds gate must fall back to lossless when the reflection read fails — a throw here would surface as an import error (round 31)");

/* ── round-32: the LANDSCAPE-GAME-VIEW defense (owner field failure: the
   Brightside portrait demo scenes met Unity's default Full HD Game view
   and the width-match scaler blew the UI up ~4.9× — "everything messed
   up"; an Asset Store reviewer would see the same). Three shields, all
   pinned: (1) the KitPortraitStage runtime letterboxes portrait scenes
   in landscape viewports and restores the builder's EXACT identity
   values in portrait ones (the sacred fence — owner-approved portrait
   rendering untouched), never touching the CanvasScaler; (2) the
   importer registers a "UIKitMaker Phone (W×H)" Fixed Resolution
   Game-view size by REFLECTION ONLY, fully try/catch-wrapped and
   idempotent — a direct GameViewSizes reference is a compile break on
   some editor versions and must never ship; (3) one gentle Console line
   names the size to pick. Docs carry the same instruction. */
{
  // extract the portrait-stage runtime template
  const stgOpen = src.indexOf("const PORTRAIT_STAGE_RUNTIME = `");
  let stg = "";
  if (stgOpen < 0) errors.push("PORTRAIT_STAGE_RUNTIME not found — the portrait-stage runtime template is missing (round 32)");
  else {
    const stgStart = stgOpen + "const PORTRAIT_STAGE_RUNTIME = `".length;
    let stgEnd = -1;
    for (let i = stgStart; i < src.length; i++) {
      if (src[i] === "\\") { i++; continue; }
      if (src[i] === "`") { stgEnd = i; break; }
    }
    stg = stgEnd > 0 ? new Function("return `" + src.slice(stgStart, stgEnd) + "`;")() : "";
  }
  if (!/public class KitPortraitStage : MonoBehaviour/.test(stg))
    errors.push("KitPortraitStage (the portrait scene's letterbox stage) is missing from the runtime template (round 32)");
  if (!/\[ExecuteAlways\]/.test(stg))
    errors.push("KitPortraitStage must be ExecuteAlways — the blowup it prevents is visible in EDIT mode, before Play (round 32)");
  if (/UnityEditor|UnityEngine\.InputSystem|TMPro|UnityEngine\.UI/.test(stg) || (stg.match(/^using /gm) ?? []).length !== 1)
    errors.push("KitPortraitStage must stay CORE-ONLY (one using: UnityEngine; the matte is a GameObject, not an Image reference) — the round-19 P0 rule");
  if (!/if \(w < 1f \|\| h < 1f\) return;/.test(stg))
    errors.push("KitPortraitStage must refuse a zero-size frame — a startup/headless frame would write garbage (round 32)");
  if (!/bool letterbox = designH > designW && w > h;/.test(stg))
    errors.push("the letterbox gate (portrait design AND landscape viewport, nothing else) moved (round 32)");
  if (!/float k = h \/ designH;/.test(stg))
    errors.push("the letterbox compensation (k = stage rect height / designH — cancels ANY scaler factor exactly) moved (round 32)");
  if (!/the CanvasScaler is NEVER touched/.test(stg))
    errors.push("the scaler-restore invariant comment is gone — the design decision (localScale compensation, scaler untouched) must stay written down (round 32)");
  if (!/if \(frame\.anchorMin != Vector2\.zero\) frame\.anchorMin = Vector2\.zero;/.test(stg)
      || !/if \(frame\.anchorMax != Vector2\.one\) frame\.anchorMax = Vector2\.one;/.test(stg)
      || !/if \(frame\.sizeDelta != Vector2\.zero\) frame\.sizeDelta = Vector2\.zero;/.test(stg)
      || !/if \(frame\.localScale != Vector3\.one\) frame\.localScale = Vector3\.one;/.test(stg))
    errors.push("the portrait identity restore (full-stretch, zero offsets, scale one — byte-for-byte the builder's values) lost a write (round 32, the sacred fence)");
  if (/void Update\(\)/.test(stg))
    errors.push("KitPortraitStage must ride OnRectTransformDimensionsChange, not per-frame Update (round 32)");
  if (!/path: "Runtime\/PatternBreakPortraitStage\.cs", data: PORTRAIT_STAGE_RUNTIME/.test(src) || !/"Runtime\/PatternBreakPortraitStage\.cs",/.test(src))
    errors.push("PatternBreakPortraitStage.cs must ship AND ride the sharedScripts set — per-slug runtime copies kill the assembly (the IdleShine lesson)");
  // (1b) the scene builder wires the stage for PORTRAIT boards only
  if (!/if \(bd\.h > bd\.w\) \{\s*\n\s*var stageGo = new GameObject\("Phone Stage", typeof\(RectTransform\), typeof\(KitPortraitStage\)\)/.test(cs))
    errors.push("the Phone Stage must be built ONLY inside the portrait gate (bd.h > bd.w) — landscape/desktop boards keep their 0.5-match road stage-free (round 32)");
  if (!/Transform contentHost = canvasGo\.transform;/.test(cs) || !/safeGo\.transform\.SetParent\(contentHost, false\);/.test(cs))
    errors.push("the Safe Area root must parent through contentHost (Canvas on landscape boards, Phone Frame on portrait ones) — the stage sits OUTSIDE the safe-area root by design (round 32)");
  if (!/matteImg\.color = new Color\(0\.078f, 0\.086f, 0\.106f, 1f\);/.test(cs) || !/matteGo\.SetActive\(false\);/.test(cs))
    errors.push("the stage matte must be the flat #14161B device-preview surround, shipped disabled — no kit dress, no visible change at portrait sizes (round 32)");
  if ((cs.match(/Find\("Phone Stage\/Phone Frame\/Safe Area"\)/g) ?? []).length !== 2)
    errors.push("both kept-scene heals (HealSafeAreaRoots' already-responsive check and HealBoardWords' walk) must see the Safe Area behind the Phone Stage chain — a blind heal grafts a duplicate root (round 32)");
  // (2) the Game-view preset: reflection-only, try/catch-whole, idempotent
  if (!/static bool RegisterPhoneGameViewSize\(int w, int h, string label\) \{\s*\n\s*try \{/.test(cs))
    errors.push("RegisterPhoneGameViewSize is missing, or its body is not wrapped in try from the first statement — Unity's internals moving must never break an import (round 32)");
  if (!/RegisterPhoneGameViewSize\(int w, int h, string label\) \{[\s\S]*?\} catch \(Exception\) \{ return false; \}\s*\n\s*\}/.test(cs))
    errors.push("RegisterPhoneGameViewSize must swallow ALL exceptions (catch (Exception) { return false; }) — silent, then the Console line still names the size to add by hand (round 32)");
  if (!/Type\.GetType\("UnityEditor\.GameViewSizes,UnityEditor"\)/.test(cs)
      || !/Type\.GetType\("UnityEditor\.GameViewSizeType,UnityEditor"\)/.test(cs)
      || !/Type\.GetType\("UnityEditor\.GameViewSize,UnityEditor"\)/.test(cs))
    errors.push("the preset road must reach GameViewSizes/GameViewSizeType/GameViewSize through Type.GetType name strings only (round 32)");
  for (const name of ['"GetTotalCount"', '"GetBuiltinCount"', '"GetGameViewSize"', '"AddCustomSize"'])
    if (!cs.includes(name))
      errors.push(`the preset road lost its ${name} reflection lookup — idempotent enumeration before AddCustomSize is the contract (round 32)`);
  if (!/if \(txt != null && txt == label\) return true;/.test(cs))
    errors.push("the preset must return early on an existing custom size with this label — re-imports must never stack duplicates (round 32)");
  /* DIRECT-REFERENCE BAN: strip strings + comments from the importer C#
     and assert no GameViewSize token survives in bare code — internal
     editor types referenced directly are a compile break on some
     versions (the round-19 CS0117 class, pre-empted). */
  {
    let inB = false;
    for (const [ln, row] of cs.split("\n").entries()) {
      let bare = "", i = 0;
      while (i < row.length) {
        if (inB) { const c = row.indexOf("*/", i); if (c < 0) { i = row.length; break; } inB = false; i = c + 2; continue; }
        const ch = row[i];
        if (ch === "/" && row[i + 1] === "/") break;
        if (ch === "/" && row[i + 1] === "*") { inB = true; i += 2; continue; }
        if (ch === '"' || ch === "'") {
          const q = ch; let j = i + 1;
          while (j < row.length) { if (row[j] === "\\") { j += 2; continue; } if (row[j] === q) break; j++; }
          i = j + 1; bare += " "; continue;
        }
        bare += ch; i++;
      }
      if (/\bGameViewSize/.test(bare))
        errors.push(`emitted C# line ${ln + 1}: direct GameViewSize* reference in bare code — these are INTERNAL editor types; reflection strings only (round 32)`);
    }
  }
  // (3) the Console heads-up, portrait kits only, phrased true either way
  if (!/if \(bdPh == null \|\| bdPh\.w <= 0 \|\| bdPh\.h <= bdPh\.w\) continue;/.test(cs) || !/if \(phoneW > 0\) \{/.test(cs))
    errors.push("the phone heads-up must derive from PORTRAIT boards only and stay silent for kits without them (round 32)");
  if (!/demo scenes are portrait phone screens/.test(cs) || !/"UIKitMaker Phone \(" \+ phoneW \+ "×" \+ phoneH \+ "\)"/.test(cs))
    errors.push("the Console heads-up line (naming the UIKitMaker Phone size to pick) is missing (round 32)");
  if (!/centered phone preview instead/.test(cs))
    errors.push("the Console heads-up must mention the letterboxed phone preview — it is the scene's own defense while the dropdown stays unpicked (round 32)");
  // (4) the docs carry the instruction
  if (!src.includes("**The demo scenes are phone screens (${pw}"))
    errors.push("the QuickStart's portrait heads-up (pick/add the phone Game-view size; landscape shows a centered preview) is missing (round 32)");
  if (!/Portrait board scenes also carry a \*\*Phone Stage\*\*/.test(src) || !/\*\*UIKitMaker Phone\*\* Fixed/.test(src))
    errors.push("the README deck's scaler-policy slide must document the Phone Stage and the registered Game-view size (round 32)");
}

/* ── P0 round (2026-08-26): the SILENT-ZERO fence, both directions.
   JsonUtility drops any manifest key the C# spells differently and zeroes
   any C# field the TS never emits — with NO error on either side (the
   PBPalette CS1061 was the loud cousin; the quiet one ships wrong scenes).
   The emitted-key contracts are compile-enforced TS interfaces
   (ExportBoardItemData, AssetMeta) and a handful of inline literals; each
   is held against its C# class field-for-field. */
{
  const classFieldsOf = (name) => {
    const cm = cs.match(new RegExp(`class ${name}\\s*\\{([^}]*)\\}`));
    if (!cm) { errors.push(`${name} class declaration not found for the key-parity check`); return null; }
    return new Set([...cm[1].matchAll(/public [\w[\]]+ (\w+)(?: = [^;]+)?;/g)].map((x) => x[1]));
  };
  const interfaceKeysOf = (name) => {
    const im = src.match(new RegExp(`(?:export )?interface ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!im) { errors.push(`interface ${name} not found for the key-parity check`); return null; }
    // strip comments, then take TOP-LEVEL `key:` / `key?:` declarations —
    // a depth-aware walk, so nested object types don't leak their keys
    const body = im[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const keys = new Set();
    let depth = 0;
    for (const stmt of body.split(";")) {
      if (depth === 0) {
        const km = /^\s*(\w+)\??:/.exec(stmt);
        if (km) keys.add(km[1]);
      }
      for (const ch of stmt) { if (ch === "{" || ch === "(" || ch === "<") depth++; else if (ch === "}" || ch === ")" || ch === ">") depth--; }
    }
    return keys;
  };
  const parity = (tsKeys, csFields, tsName, csName, csOnlyOk = [], tsOnlyOk = []) => {
    if (!tsKeys || !csFields) return;
    /* a TS-only key is legal ONLY when it is documentation for humans —
       the C# cannot read an undeclared field without the CS1061 the
       member-access pass above catches, so nothing silent hides there */
    for (const k of tsKeys)
      if (!csFields.has(k) && !tsOnlyOk.includes(k)) errors.push(`${tsName} emits '${k}' but ${csName} declares no such field — JsonUtility drops it in SILENCE`);
    /* a C#-only field is the SILENT-ZERO trap itself: JsonUtility leaves
       it at default with no error, and placement math inherits the zero */
    for (const f of csFields)
      if (!tsKeys.has(f) && !csOnlyOk.includes(f)) errors.push(`${csName}.${f} is declared but ${tsName} never emits it — JsonUtility zeroes it in SILENCE (allowlist it here only for deliberate legacy fields)`);
  };
  parity(interfaceKeysOf("ExportBoardItemData"), classFieldsOf("PBBoardItem"), "ExportBoardItemData", "PBBoardItem");
  parity(interfaceKeysOf("AssetMeta"), classFieldsOf("PBAsset"), "AssetMeta", "PBAsset",
    // outline joins rows at push time (idleOutline spread), outside the interface
    ["outline"],
    // human-facing manifest documentation — the C# never reads these
    ["nativeW", "nativeH", "tintable", "usage"]);
  // inline literals: the expected key set is pinned HERE; the TS block must
  // emit each key and the C# class must declare each — both by exact name
  const literalParity = (blockRe, keys, csName, blockName) => {
    const bm = src.match(blockRe);
    if (!bm) { errors.push(`${blockName} emission block not found for the key-parity check`); return; }
    const csFields = classFieldsOf(csName);
    if (!csFields) return;
    for (const k of keys) {
      if (!new RegExp(`[{,(\\s]${k}\\s*:`).test(bm[0]) && !new RegExp(`[{,\\s]${k}\\s*[,}]`).test(bm[0]))
        errors.push(`${blockName} emission lost its '${k}' key — the importer reads it (${csName})`);
      if (!csFields.has(k)) errors.push(`${csName} declares no '${k}' — ${blockName} emits it into SILENCE`);
    }
  };
  literalParity(/labelSizes: \(\[\[[\s\S]{0,3000}?\n      \}\),/, ["family", "size", "scene"], "PBLabelSize", "labelSizes");
  literalParity(/stateFx: \(\[\[[\s\S]{0,3000}?\n      \}\),/, ["family", "state", "glow", "lift"], "PBStateFx", "stateFx");
  literalParity(/labelStates: \(\[\[[\s\S]{0,3000}?\n      \}\),/, ["family", "state", "fillMode", "fill", "fill2", "dy"], "PBLabelState", "labelStates");
  literalParity(/\n      palette: \{[\s\S]{0,1200}?\},\n/, ["bevel", "glow", "innerFill", "well", "highlight", "shadow", "markInk", "radioInk"], "PBPalette", "palette");
  literalParity(/timer: \(\(\) => \{[\s\S]{0,3000}?\}\)\(\),/, ["seconds", "word", "fs", "w", "h", "shellW", "shellH"], "PBTimerBlock", "timer");
  literalParity(/bakedFace = \{[\s\S]{0,1400}?\};/, ["file", "metrics", "pointSize", "layerFill", "layerStroke", "layerShadow", "layerGlints", "inkTintable"], "PBBakedRef", "bakedFace");
  literalParity(/const metrics = JSON\.stringify\(\{[\s\S]{0,900}?\}\);/,
    ["pointSize", "ascent", "descent", "lineHeight", "atlasW", "atlasH", "kerning", "glyphs", "layersAtlasW", "layersAtlasH", "layerGlyphs"],
    "PBBakedFace", "baked-face metrics");
}

/* ── P0 round (2026-08-26): the STAGE-ANCHOR invariant. The app's stage
   pins a board item's stored (x,y) at viewBox coordinate 0 when the canvas
   carries a glow pad (negative origin) — LiveArt's anchorContent margins,
   the PNG compositor's `b.x - pad * s`, one rule. The exporter treated
   (x,y) as the canvas corner unconditionally, and every glowy piece landed
   90·scale px right AND down in Unity (the field's half-off pause button).
   These pins keep all three emission roads on the stage's rule. */
{
  if (!/const padRk = vbm0 && \+vbm0\[1\] < 0 \? -\+vbm0\[1\] \* k : 0;/.test(src)
      || !/const c0 = spin\(b\.x - padRk \+ w \/ 2, b\.y - padRk \+ h \/ 2\);/.test(src))
    errors.push("the baked-road board-item center must reclaim the negative viewBox origin (b.x - padRk) — the stage's anchorContent rule");
  if (!/const rx0 = \+vbm2\[1\] < 0 \? 0 : \+vbm2\[1\];/.test(src)
      || !/const p0 = spin\(b\.x \+ \(\(bx3 - rx0\) \+ bw4 \/ 2\) \* k, b\.y \+ \(\(by3 - ry0\) \+ bh4 \/ 2\) \* k\);/.test(src))
    errors.push("the prefab-road shell center must NOT subtract a negative viewBox origin (the glow pad) — that re-adds the pad the stage reclaims");
  if (!/const padLk = vbmL && \+vbmL\[1\] < 0 \? -\+vbmL\[1\] \* kL : 0;/.test(src))
    errors.push("the saved-asset (libasset) road must reclaim the negative viewBox origin like the stage does");
  // rotation truth: a rotated copy's content center orbits the canvas-box
  // middle (the stage's transform-origin) — the spin must wrap BOTH roads
  if (!/const spin = \(px: number, py: number\)/.test(src))
    errors.push("the board-item spin (rotation about the canvas-box middle) is missing — rotated padded copies land off their seat without it");
}

/* ── P0 round (2026-08-26): the SOLO-LABEL invariant. A kit with no
   stroke/shadow layer faces ships bare-TMP labels (no HeroLabel), so no
   SizeK reads the board scale — the word must bake it into its own font
   size everywhere a board copy is sized, or family-size words overflow
   board-size shells (the Brightside ~2× Pause words). */
{
  if (!/static float SoloLabelK\(PBBoardItem it, PBManifest m, RectTransform rt\)/.test(cs))
    errors.push("SoloLabelK is missing — solo (bare-TMP) board labels have no other carrier of the board scale");
  if (!/tmp\.fontSize = trueSize \* SoloLabelK\(it, m, rt\)/.test(cs))
    errors.push("the board-scene label override must scale a solo label by SoloLabelK (a bare trueSize write is the family-size ~2× bug)");
  if (!/tmp3\.fontSize = trueSize2 \* SoloLabelK\(it2, m, crt\)/.test(cs))
    errors.push("the word heal must scale a solo label by SoloLabelK — a healed word must size like a built one");
  if (!/var lr9 = FindOurLabelRoot\(inst\);/.test(cs) || !/t9\.fontSize = ls9 \* \(it\.h \/ \(baseA3\.shell\.h \/ ps3\)\);/.test(cs))
    errors.push("SeatPosedLabel must handle the solo road (re-seat + board-scale the bare TMP), not return on hl2 == null");
}

/* ── P0 follow-up (2026-08-26): the SOLO-LABEL INK invariant. The app
   flips white type to the kit ink on pale shells and per-family forks pin
   their own color, while the baked atlas keeps the MASTER voice — a solo
   TMP left vertex-white shipped WHITE header words. The family's resolved
   ink travels as labelInk/labelInk2 on the labeled base rows, gated by
   the atlas tintability flag. */
{
  if (!/static void ApplyFamilyInk\(TextMeshProUGUI t, PBManifest m, string family, bool requireTintableAtlas\)/.test(cs))
    errors.push("ApplyFamilyInk is missing — solo labels have no other carrier of the family's resolved resting ink");
  if (!/ApplyFamilyInk\(t, m, family, true\);/.test(cs))
    errors.push("AddBakedLabel's solo fallback must tint by the family ink on a tintable atlas (the WHITE-header bug)");
  if (!/ApplyFamilyInk\(tLead, m, family, false\);/.test(cs))
    errors.push("the styled-SDF label rung must take the family's resolved ink (SDF glyphs are always tintable)");
  if (!/const labelInkOf = \(lg: string, svg2: string\)/.test(src))
    errors.push("labelInkOf (the resolved label-fill parse, gradient stops included) is missing from the TS emission side");
  if (!/\.\.\.\(labelInkOf\(lg, svg2\) \?\? \{\}\),/.test(src) || !/\.\.\.\(labelInkOf\(lg, fullSvg\) \?\? \{\}\),/.test(src))
    errors.push("both label-metric parse sites (labelSeatOf and the labeled-geometry bake) must emit labelInk from the rendered fill");
  if (!/inkTintable: \(\(\) => \{/.test(src))
    errors.push("the bakedFace inkTintable decision (near-white untreated atlas only) is missing — an unconditional tint would double-paint colored atlases");
}

/* ── P0 follow-up (2026-08-26): the WIPE-HALO invariant. The wipe's Mask
   clips to its stencil sprite's ALPHA — and a baked kit piece's bake
   carries its shadow/glow HALO, soft alpha the stencil holds from 0.4%
   up (the Victory star trio: the band swept the shadow between the
   points). The cure is the stamp road's own: a CORE-ALPHA companion —
   the same render, shadow voices calm, pixel-registered on the same
   canvas — shipped as the row's stampMask; the importer already pins it
   to WipeShine.maskSprite on the baked branch. */
{
  // TS: the baked road's companion — calm re-render, registration gate,
  // and the row spread
  if (!/const calmK = JSON\.parse\(JSON\.stringify\(cfgP\)\) as GenConfig;/.test(src)
      || !/calmK\.shadow\.opacity = 0;/.test(src) || !/calmK\.candy\.contact\.opacity = 0;/.test(src))
    errors.push("the baked-piece core-alpha companion (calm re-render) is missing from the baked road — the wipe band sweeps the baked shadow halo without it");
  if (!/if \(rwC === rwK && rhC === rhK\) \{/.test(src))
    errors.push("the baked companion must gate on EXACT raster registration (rwC/rhC vs rwK/rhK) — an off-canvas mask clips the band to the wrong pixels");
  if (!/\.\.\.\(maskFileK \? \{ stampMask: maskFileK \} : \{\}\),/.test(src))
    errors.push("the baked row must ship its companion as stampMask — the importer's existing WipeShine wiring reads exactly that key");
  // C#: the consumption stays wired, and the Mask construction stays honest
  // (WipeShine lives in its own runtime literal — extract like STATE_FX)
  if (!/if \(!string\.IsNullOrEmpty\(it\.stampMask\)\) wsSt\.maskSprite = S\(root \+ "\/" \+ it\.stampMask\);/.test(cs))
    errors.push("the baked-branch WipeShine must pin the row's stampMask as its core stencil");
  let shine = "";
  const shOpen = src.indexOf("const IDLE_SHINE_RUNTIME = `");
  if (shOpen < 0) errors.push("IDLE_SHINE_RUNTIME not found — the wipe/edge shine runtime template is missing");
  else {
    const shStart = shOpen + "const IDLE_SHINE_RUNTIME = `".length;
    let shEnd = -1;
    for (let i = shStart; i < src.length; i++) {
      if (src[i] === "\\") { i++; continue; }
      if (src[i] === "`") { shEnd = i; break; }
    }
    shine = shEnd > 0 ? new Function("return `" + src.slice(shStart, shEnd) + "`;")() : "";
  }
  if (!/mGo\.GetComponent<Mask>\(\)\.showMaskGraphic = false;/.test(shine) || !/maskImg\.raycastTarget = false;/.test(shine))
    errors.push("WipeShine's stencil twin must stay hidden (showMaskGraphic false — the alpha-clip condition) and raycast-silent (hit honesty)");
  if (!/if \(maskSprite != null\) \{/.test(shine))
    errors.push("WipeShine's core-stencil priority (maskSprite over the host sprite mirror) is missing");
}

/* ── Unity-fidelity round, slice 1 (2026-08-26): the WHITE-FRINGE cure has
   two halves and both must stay. App half: every zip-bound raster encodes
   through canvasToPngBytesDilated — straight-RGBA PNG whose fully-
   transparent pixels inherit their nearest inked pixel's RGB (toBlob's
   premultiplied backing writes black there, and any edge filtering blends
   it in). Only alpha-0 RGB may change — the fence line is load-bearing.
   Unity half: scene-scaled sprites (assets/, boardstamps/, bigglyphs/,
   backgrounds/, stamps/) import with mips + trilinear, or minification
   undersamples bright rims into the owner's "white specks"; the exact-rect
   baked-face atlas stays mip-less (glyph rects are sampled exactly). */
{
  const exSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/generator/exportUtils.ts"), "utf8");
  if (!/export function dilateTransparentRGB\(/.test(exSrc) || !/export async function encodePngStraight\(/.test(exSrc))
    errors.push("the transparent-RGB dilation + straight-alpha PNG encoder are missing from exportUtils (slice 1 — the white-fringe cure's app half)");
  if (!/if \(d\[i \* 4 \+ 3\] !== 0\) continue; \/\/ only FULLY transparent pixels may change/.test(exSrc))
    errors.push("dilateTransparentRGB must change ONLY fully-transparent pixels' RGB — the visually-identical byte fence (slice 1)");
  if (!/canvasToPngBytesDilated\(cv\)\s*\n\s*\.then\(\(bytes\) => resolve\(\{ bytes, w: cv\.width, h: cv\.height \}\)\)/.test(exSrc))
    errors.push("svgToPngBytes must encode through canvasToPngBytesDilated — every svg raster road inherits the dilation from here (slice 1)");
  const dilatedUses = (exSrc.match(/canvasToPngBytesDilated\(/g) ?? []).length;
  if (dilatedUses < 5)
    errors.push(`exportUtils rides canvasToPngBytesDilated only ${dilatedUses}x (need >=5: definition, svgToPngBytes, tight crop, union crop, glow/catalog) — a raster road fell back to premultiplied toBlob (slice 1)`);
  const dilatedUsesEE = (src.match(/canvasToPngBytesDilated\(/g) ?? []).length;
  if (dilatedUsesEE < 9)
    errors.push(`engineExport's direct canvas bakes ride canvasToPngBytesDilated only ${dilatedUsesEE}x (need >=9: backgrounds, stamp, stamp mask, bigglyph fx, logo, dialed-shadow bake, mask re-register, shadow sibling, baked-face atlas) — a bake road still ships premultiplied black fringe (slice 1)`);
  if (!/if \(!ti\.mipmapEnabled\) \{ ti\.mipmapEnabled = true; changed = true; \}/.test(cs)
      || !/if \(ti\.filterMode != FilterMode\.Trilinear\) \{ ti\.filterMode = FilterMode\.Trilinear; changed = true; \}/.test(cs))
    errors.push("Configure must import kit sprites with mips + trilinear — scaled board copies undersample into white specks without them (slice 1)");
  if (!/gti\.mipmapEnabled = true;/.test(cs) || !/gti\.filterMode = FilterMode\.Trilinear;/.test(cs))
    errors.push("boardstamps/bigglyphs/backgrounds must import with mips + trilinear — the owner's Shop-chip speckle road (slice 1)");
  if (!/sti\.mipmapEnabled = true;/.test(cs) || !/sti\.filterMode = FilterMode\.Trilinear;/.test(cs))
    errors.push("type stamps (4x art, always minified) must import with mips + trilinear (slice 1)");
  if (!/bti\.mipmapEnabled = false;/.test(cs))
    errors.push("the baked-face atlas must stay MIP-LESS — its glyph rects are sampled exactly, and mip bleed would corrupt the baked text (slice 1)");
}

/* ── Unity-fidelity round, slice 2 (2026-08-26): labels bound to their
   piece. The audit found every label already a CHILD of its piece root —
   the field failure ("text is not bound to the image face") was scene-view
   PICKING: a posed copy's face is an added "Posed art" child, directly
   pickable apart from its word. The cure is the KitPiece [SelectionBase]
   root: clicking any part of a piece selects the piece, so face and word
   travel as one. These pins keep (a) the label-parenting invariant, (b)
   the KitPiece runtime shipping shared, (c) every placed root armed, and
   (d) kept scenes + prefabs converging. */
{
  if (!/\[SelectionBase\]\s*\n\s*\[DisallowMultipleComponent\]\s*\n\s*public class KitPiece : MonoBehaviour \{\}/.test(src))
    errors.push("the KitPiece [SelectionBase] runtime is missing — clicking a posed face would again drag it out from under its word (slice 2)");
  if (!/files\.push\(\{ path: "Runtime\/PatternBreakKitPiece\.cs", data: KIT_PIECE_RUNTIME \}\);/.test(src)
      || (src.match(/"Runtime\/PatternBreakKitPiece\.cs"/g) ?? []).length < 2)
    errors.push("PatternBreakKitPiece.cs must ship AND ride the sharedScripts set — per-slug runtime copies kill the assembly (the IdleShine lesson) (slice 2)");
  if (!/if \(inst\.GetComponent<KitPiece>\(\) == null\) inst\.AddComponent<KitPiece>\(\);/.test(cs))
    errors.push("the scene builder must arm EVERY placed piece root with KitPiece — the one selection handle that binds face and word (slice 2)");
  if (!/if \(ch\.GetComponent<KitPiece>\(\) == null\) \{ ch\.gameObject\.AddComponent<KitPiece>\(\); boundRoots\+\+; \}/.test(cs))
    errors.push("HealBoardWords must converge kept scenes onto the KitPiece selection root (seat-matched pieces only) (slice 2)");
  if (!/wantSelectRoot && contents\.GetComponent<KitPiece>\(\) == null\) \{ contents\.AddComponent<KitPiece>\(\); pieceBound\+\+; changed = true; \}/.test(cs))
    errors.push("the prefab maintenance pass must converge family prefabs onto KitPiece (slice 2)");
  // the label-parenting invariant the audit verified: our label roots are
  // built as CHILDREN of the piece they dress, never canvas-level siblings
  if (!/var go = new GameObject\("Label", typeof\(RectTransform\)\);\s*\n\s*go\.transform\.SetParent\(parent\.transform, false\);/.test(cs))
    errors.push("AddBakedLabel must parent its label root under the piece it dresses (the label-parenting invariant) (slice 2)");
  if (!/SeatPosedLabel\(inst, it, m\);/.test(cs))
    errors.push("posed placement must seat the label through SeatPosedLabel (shared with the word healer) — the label stays inside the piece root (slice 2)");
}

/* ── Unity-fidelity round, slice 4 (2026-08-26): SpeedoArc truth + the
   picker's icons. (a) The gauge stamp spoke the case's LOCAL coordinates
   while the drawn dial sits inside build()'s translated content groups —
   on Brightside every live gauge child (segments, needle anchor, Number,
   MPH) anchored 61.7 design px above the painted dial. gaugeOf now sums
   the overlay's inherited translates and ships the DRAWN frame; kept rigs
   converge. (b) The lit ramp ships the PIECE's own Bevel→Glow (a
   gauge-scoped fork lit green on a cream kit), and the segment sprite
   bakes its white halo. (c) The picker's glyph (st.kitIcons) reaches the
   iconbtn/checkbox/radio family bakes — boards honored it, prefabs baked
   stock art (the PLAY-triangle Settings gear). */
{
  if (!/const overlayShiftOf = \(s: string\)/.test(src)
      || !/x: Math\.round\(\(v\[0\] \+ sh\.tx\) \* PNG_SCALE\), y: Math\.round\(\(v\[1\] \+ sh\.ty\) \* PNG_SCALE\)/.test(src)
      || !/dialX: Math\.round\(\(v\[5\] \+ sh\.tx\) \* PNG_SCALE\), dialY: Math\.round\(\(v\[6\] \+ sh\.ty\) \* PNG_SCALE\)/.test(src))
    errors.push("the gauge stamp must ship the DRAWN frame (overlayShiftOf's inherited-translate sum on x/y/unitY/dialX/dialY) — the live rig anchors above the painted dial without it (slice 4)");
  if (!/from: segBev, to: segGlow/.test(src))
    errors.push("the segment ramp must ship the piece's OWN resolved Bevel→Glow (gauge.seg.from/to) — a gauge-scoped fork lights the wrong palette otherwise (slice 4)");
  if (!/class PBGaugeSeg \{ public float rI; public float rO; public float w; public float n; public float a0; public float sweep; public string from; public string to; \}/.test(cs))
    errors.push("PBGaugeSeg must declare from/to — JsonUtility drops the shipped ramp colors without them (slice 4)");
  if (!/if \(gRow\.seg != null && !string\.IsNullOrEmpty\(gRow\.seg\.from\)\) ColorUtility\.TryParseHtmlString\(gRow\.seg\.from, out cFrom\);/.test(cs))
    errors.push("WireGauge must prefer the row's shipped ramp colors over the master palette (slice 4)");
  if (!/bool oursSeg = segT\.childCount > 0;/.test(cs) || !/if \(\(srtC\.anchorMin - cS2\)\.sqrMagnitude > 1e-5f\)/.test(cs))
    errors.push("kept segment rings must converge with the current dial center + ramp (ownership-gated on our shipped sprite) (slice 4)");
  if (!/const segW = 8 \* k, segL = 20 \* k, halo = 12 \* k, pad = 2 \+ halo;/.test(bevelSrc) || !/id="seghalo"/.test(bevelSrc))
    errors.push("the segment sprite must bake its white halo on a symmetrically padded canvas — the arc reads as dry dashes without it (slice 4)");
  const pickerRoads = (src.match(/resolveKitIcon\(st\.kitIcons\?\.iconbtn, undefined\)/g) ?? []).length;
  if (pickerRoads < 2 || !/resolveKitIcon\(st\.kitIcons\?\.checkbox, undefined\)/.test(src) || !/resolveKitIcon\(st\.kitIcons\?\.radio, undefined\)/.test(src))
    errors.push("the picker's glyph (st.kitIcons) must reach the iconbtn (base + states), checkbox and radio family bakes — boards honored it while prefabs baked stock art (slice 4)");
}

if (errors.length) {
  console.error("unity-importer guard FAILED — the emitted C# would not compile in Unity:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(`unity-importer guard: OK (${lines.length} lines, ${normalizers} path normalizers, all literals terminate)`);
