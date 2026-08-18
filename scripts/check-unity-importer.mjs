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

/* round-18: the editor's input-focus gate made loud. Hover rides the
   EventSystem alone (no polling) — in the editor the Input System only
   delivers pointer events while the Game view has focus, which reads as
   "the glow broke" (owner video). The kit prints ONE editor-only Console
   hint when the gate actually bites, and it must compile out of builds. */
if (!/void FocusHintTick\(\)/.test(fx) || !/static bool focusHintDone, focusPointerSeen;/.test(fx))
  errors.push("the editor focus-gate hint watcher is missing from StateFx (round 18)");
if (!/Click the game once and sweep again/.test(fx))
  errors.push("the focus-gate hint's Console line is missing (round 18 — 'hover not moving' owner video)");
if (!/#if UNITY_EDITOR\s*\n\s*if \(!focusHintDone\) FocusHintTick\(\);\s*\n#endif/.test(fx))
  errors.push("the focus-hint Update hook must be #if UNITY_EDITOR — the watcher may not exist in builds (round 18)");
if (!/over = true; Retarget\(\); MarkPointer\(\);/.test(fx) || !/down = true; Retarget\(\); MarkPointer\(\);/.test(fx))
  errors.push("MarkPointer must ride OnPointerEnter and OnPointerDown — the hint disarms when events actually flow (round 18)");
if (!/InputSystemUIInputModule"\) return;/.test(fx))
  errors.push("the focus hint must stay quiet under the legacy StandaloneInputModule — that module has no focus gate (round 18)");
if (!/references: \["Unity.TextMeshPro", "UnityEngine.UI", "Unity.InputSystem"\]/.test(src))
  errors.push("the Runtime asmdef must reference Unity.InputSystem — the focus hint reads editorInputBehaviorInPlayMode under ENABLE_INPUT_SYSTEM (round 18)");
if (/UnityEngine\.Input\.|Input\.GetMouse|Input\.mousePosition|Mouse\.current|Pointer\.current/.test(fx))
  errors.push("StateFx must never poll input — hover/press ride the EventSystem alone (round-18 verified contract)");
/* round-18 menu action: removing the gate is an EXPLICIT choice, never an
   import side effect, and the hint's menu reference must name the real menu. */
if (!/const string RouteInputMenu = "Tools\/PatternBreak\/Route All Editor Input To Game View";/.test(cs)
    || !/STRICTLY an explicit menu action/.test(cs))
  errors.push("the Route All Editor Input To Game View menu action (explicit, never automatic) is missing (round 18)");
if (!/#if ENABLE_INPUT_SYSTEM[^\0]{0,2000}const string RouteInputMenu/.test(cs))
  errors.push("the route-input menu must sit inside #if ENABLE_INPUT_SYSTEM — legacy-input projects have no such setting (round 18)");
if (!/AssetDatabase\.CreateAsset\(asset, "Assets\/InputSystem\.inputsettings\.asset"\)/.test(cs))
  errors.push("the route-input menu must mint the settings asset when the project runs on in-memory defaults — the change would evaporate otherwise (round 18)");
if (fx.includes("Tools > PatternBreak > Route All Editor Input To Game View") !== true)
  errors.push("the focus hint must point at the real menu item by its exact name (round 18)");
if (!/Testing hover & press in the editor/.test(src)
    || !/Route All Editor Input To Game View\*\*/.test(src))
  errors.push("the README's editor-testing box (the focus-gate story + the menu pointer) is missing (round 18)");

if (errors.length) {
  console.error("unity-importer guard FAILED — the emitted C# would not compile in Unity:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(`unity-importer guard: OK (${lines.length} lines, ${normalizers} path normalizers, all literals terminate)`);
