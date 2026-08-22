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
    || !/addPng\("emblembar\/socket\.png", shell\("emblembar", \{ overlay: "dock"/.test(src))
  errors.push("the vsbar/emblembar dressed part assets are missing from the export (round 21)");
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
if (!/class PBIconSeat \{ public float dx; public float dy; public float s; public string file; public string ink; \}/.test(cs)
    || !/public string labelText; public PBIconSeat icon;/.test(cs))
  errors.push("PBAsset must carry the icon seat (PBIconSeat) — JsonUtility drops it without the field (round 26)");
if (!/static void WireIconSeat\(GameObject go, string root, PBManifest m, string fam\)/.test(cs)
    || !/WireIconSeat\(go, root, m, baseAsset\.component\);/.test(cs))
  errors.push("FamilyPrefab must seat the kit icon through WireIconSeat (round 26)");
if (!/wantIconAdd/.test(cs) || !/WireIconSeat\(contents, root, m, famName\);/.test(cs))
  errors.push("the maintenance pass must converge older prefabs onto the icon seat (wantIconAdd) (round 26)");
if (!/if \(go\.transform\.Find\("Icon"\) != null\) return;/.test(cs))
  errors.push("WireIconSeat must step aside for an existing Icon child — ours or the dev's (round 26)");

if (errors.length) {
  console.error("unity-importer guard FAILED — the emitted C# would not compile in Unity:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(`unity-importer guard: OK (${lines.length} lines, ${normalizers} path normalizers, all literals terminate)`);
