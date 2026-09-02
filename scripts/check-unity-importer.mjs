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

/* Unity 6000.5 turned two long-stable Object APIs obsolete — GetInstanceID
   as ERROR (CS0619 → the whole importer dies; the replacement GetEntityId
   does not exist on older rungs) and FindFirstObjectByType as warning.
   The field found both the hard way. Ban them in the emitted C# outright:
   dedup by reference identity, find with FindAnyObjectByType (2022.3+). */
{
  const banned = [
    [/\bGetInstanceID\s*\(/, "GetInstanceID() — CS0619 ERROR on Unity 6000.5+ and GetEntityId is missing below it; dedup/track by object reference instead"],
    [/\bFindFirstObjectByType\b/, "FindFirstObjectByType — deprecated (CS0618) on Unity 6000.5+; use FindAnyObjectByType (available on every shipped rung)"],
  ];
  for (const [re, msg] of banned)
    if (re.test(cs)) errors.push(`emitted C# uses ${msg}`);
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
// round 44 extends the zone with the optional vertical band (y/h, zero-gated)
if (!/class PBTrack \{ public float x; public float w; public float y; public float h; \}/.test(cs))
  errors.push("PBTrack (the manifest's well-zone row, x/w + the round-44 y/h band) is missing from the importer (round 21/44)");
if (!/static RectTransform BuildBarFill\(/.test(cs) || !/aT\.track != null && aT\.track\.w > 2f/.test(cs))
  errors.push("the shared mercury-seat builder (BuildBarFill, manifest-zone seated) is missing (round 21)");
if (!/BuildBarFill\(go, "Fill", fill, track, pngScale, m, root, "progress", 0\.62f, false\)/.test(cs))
  errors.push("ProgressPrefab must assemble the dressed rig through BuildBarFill (round 21)");
if (!/\(it\.component == "progress" \|\| it\.component == "emblembar"\) && it\.value > 0f/.test(cs))
  errors.push("board placement must drive the progress/emblem bars' fillAmount from the board's value (round 21)");
if (!/asset\.transform\.Find\("Fill Area"\) == null/.test(cs) || !/barRigged\+\+/.test(cs))
  errors.push("the old-structure ProgressBar heal (Fill Area retrofit, barRigged receipt) is missing (round 21)");
/* round-21 slice C: the VS bar + emblem bar leave the baked-stamp road,
   and the segment meter lights its cells. */
if (!/addPng\("vsbar\/track\.9\.png", shell\("vsbar", \{ overlay: "track" \}/.test(src)
    || !/addPng\("emblembar\/socket\.png", sockSeats \? stripIconInk\(sockFull\)\.svg : sockFull/.test(src))
  errors.push("the vsbar/emblembar dressed part assets are missing from the export (round 21; the socket bakes BARE + live emblem child since the un-burn round)");
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
if (!/public float\[\] cells; public int cellSel = -1; public PBBig big; public PBIconChild\[\] posedIcons; \}/.test(cs))
  errors.push("PBBoardItem must carry the big field and the un-burn's posedIcons — without them JsonUtility drops those rows (rounds 23 + un-burn)");
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
/* round 44 REVERSES the round-23 emission pins: the Uploads/Art drawer
   (big-glyph drop + account logo uploads) never ships in the Unity
   download (owner mandate — AI-generated art stays out of the product's
   engine export). The IMPORTER machinery above stays for old zips; the
   EMISSION road must stay closed. */
if (/component: "bigglyph"/.test(src) || /stampFiles\.push\(\{ file: `bigglyphs\//.test(src))
  errors.push("the big-glyph/upload emission road reopened — Uploads/Art must never ship in the Unity download (owner mandate, round 44)");
if (!/const items = bd\.items\.filter\(\(b\) => b\.kitId \|\| b\.stamp \|\| b\.libId\);/.test(src)
    || !/Uploads\/Art never ships in the Unity download \(owner mandate\)/.test(src))
  errors.push("the Uploads/Art export exclusion (item filter + the loud skip warn) is gone from collectExportBoards (round 44)");
if (!/Prefabs\/Art\/\*\*/.test(src))
  errors.push("the README's Prefabs/Art pointer is missing (round 23; the shelf renamed to Art on the owner's decision)");

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
    ...[...cs.matchAll(/"(ButtonPrimary|ButtonSecondary|ButtonSmall|Endturn|Keycap|Pricebtn|Iconbtn|Chip|Tab|TabBack|Checkbox|Radio|CheckboxToggle|RadioToggle|Switch|Input|Joystick|JoystickGhost|ProgressBar|SegmentMeter|VsBar|EmblemBar|Slider|HealthGlobe|SeasonTrack|CountBadge|Badge|Panel|HeaderBanner|DataRow|ItemSlot|ScrollView|Dropdown|Timer|HeroLabel)"/g)].map((x) => x[1]),
    // the pre-rename address still answers as a PlaceKitPrefab altName
    // (kept projects mid-heal) — the rename valet moves it on import
    "ListRow",
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
/* the round-25 big-glyph artW emission pin retired with the road: the
   Uploads/Art drawer never ships in the Unity download (round 44); the
   PBBoardItem artW/artH C# pin above stays for old-zip compat */
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
if (!/padSvg\(shell\("emblembar", \{ overlay: "dock", icon: resolveKitIcon\(st\.kitIcons\?\.emblembar, undefined\) \}, slim\), 64\)/.test(src))
  errors.push("the emblem socket bake must pad its canvas (padSvg 64) with the maker's own emblem pick aboard — the icon-fx halo clips at glowPadOf's zeroed-state 0px pad (round 27; pick honored since the un-burn round)");
if (!/typeof q\.crop === "number" \? q\.crop : undefined/.test(src) || !/\.\.\.\(sockSeats \? \{ iconSeats: sockSeats \} : \{\}\) \}, 24\);/.test(src))
  errors.push("the socket must ride the numeric-margin crop road (tight crop, margin 24) so the halo tail reaches alpha 0 (round 27), carrying its un-burn iconSeats");

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

/* ── LEADING TRAVELS (the End Turn line-gap round; ABSOLUTE since round
   44): the app stacks the endturn's two lines at fs · 0.73em ·
   leading/100 CENTER TO CENTER (bevel, fork-first per key — a fork
   snapshot without the key falls through to the dial), and the export
   must carry the resolved dial or Unity's LIVE label re-typesets at
   TMP's default line height forever (owner: "Leading did not work on
   the End Turn button"; round 44 field: "leading between lines is off
   in Unity; correct in the app" — the old DELTA mapping rode on the
   face's natural line height, which is NOT the app's stack). The plumb:
   manifest rows (base + per-state, ALWAYS on stacked props — the
   absolute rebase needs factory 100 too) → PBAsset.leading → ONE
   importer seam, LeadingLineSpacing(row, face) =
   (0.73 · leading/100 − lineHeight/pointSize) · 100 — TMP's line
   advance is natural + lineSpacing/100 em, so the app's gap lands
   exactly on any face; absent rows (old zips, JsonUtility 0) map to 0
   and a faceless call keeps the old delta. Convergence rides the
   redress with a still-at-0 gate, mirrored probe and dresser, the want
   read off the label's own live face. ── */
if (!/const lead = fsW \* 0\.73 \* \(\(leadT\.leading \?\? cfg\.type\.leading \?\? 100\) \/ 100\);/.test(bevelSrc))
  errors.push("the app's endturn leading rule (fs * 0.73em * leading/100, fork-first per key) moved — the importer's 0.73 mapping is derived from it, re-derive BOTH together");
if (!/const STACKED_LABEL_PROPS = new Set<KitComponentId>\(\["endturn"\]\);/.test(src))
  errors.push("STACKED_LABEL_PROPS (the stacked multi-line label set the Leading emission rides) is missing — future stacked labels inherit the plumb through it");
if (!/\(stName \? c\.stateDesigns\?\.\[stName\]\?\.type\?\.leading : undefined\) \?\? c\.type\.leading \?\? 100/.test(src))
  errors.push("the export's leading resolution must mirror bevel's fork-first PER-KEY read — a wholesale fork read masks the dial at 100% the moment a state is designed (the app's own End Turn lesson)");
if (!/STACKED_LABEL_PROPS\.has\(id\) \? \{ leading: leadingOf\(id, stName\) \} : \{\}/.test(src))
  errors.push("the leading row must emit on EVERY stacked-prop row, factory 100 included (round 44) — the importer's absolute rebase needs the factory value, and a ≠100 gate re-parks factory stacks at TMP's natural height");
if (!/public float labelFs; public string labelInk; public string labelInk2; public float leading; public string labelText;/.test(cs))
  errors.push("PBAsset must carry the leading field — JsonUtility silently drops the manifest row without it");
if (!/static float LeadingLineSpacing\(PBAsset row, TMPro\.TMP_FontAsset face\)/.test(cs)
    || !/float natural = face != null && face\.faceInfo\.pointSize > 0f \? face\.faceInfo\.lineHeight \/ face\.faceInfo\.pointSize : 0f;/.test(cs)
    || !/if \(natural <= 0f\) return 0\.73f \* \(row\.leading - 100f\);/.test(cs)
    || !/return \(0\.73f \* row\.leading \/ 100f - natural\) \* 100f;/.test(cs))
  errors.push("LeadingLineSpacing (the ONE seam, ABSOLUTE since round 44: (0.73·leading/100 − face natural)·100, 0-gated for absent rows, delta fallback for faceless calls) is missing or its formula drifted");
if (!/float lsp = LeadingLineSpacing\(lrow, layersFa\);/.test(cs) || !/hlLead\.lineSpacing = lsp; hlLead\.SetText\(text\);/.test(cs))
  errors.push("the hero-stack birth must apply the Leading rebased on ITS face (layersFa; set, then re-Apply via SetText — BuildHeroStack's construction-order rule)");
if (!/float lspSolo = LeadingLineSpacing\(lrow, solo\);/.test(cs) || !/if \(lspSolo != 0f\) t\.lineSpacing = lspSolo;/.test(cs))
  errors.push("the solo baked-label birth must apply the Leading rebased on the solo face (0-gated)");
if (!/float lspT = LeadingLineSpacing\(lrowA, face\);/.test(cs) || !/if \(tLead != null && lspT != 0f\) tLead\.lineSpacing = lspT;/.test(cs))
  errors.push("the styled-SDF label rung must apply the Leading (one seam, one number, its own face)");
if (!/if \(lrowA != null && lrowA\.leading > 0f\) t\.lineSpacing = lrowA\.leading \/ 100f;/.test(cs))
  errors.push("the legacy Text rung must carry the dial as its line-height multiplier (0-gated; factory 100 ⇒ 1.0 = Unity's default)");
if (!/float wantLsp = LeadingLineSpacing\(probeRow, faceLd != null \? faceLd\.font : null\);/.test(cs)
    || !/\(hlLd != null && hlLd\.lineSpacing == 0f\) \|\| \(tmLd != null && tmLd\.lineSpacing == 0f\)\) wantDress = true;/.test(cs))
  errors.push("the redress probe must converge a still-at-0 lineSpacing when the manifest resolves a Leading — the absolute want read off the label's own live face (and ONLY still-at-0 — hand-tuned values are the maker's)");
if (!/newHl\.lineSpacing = keepLineSpacing != 0f \? keepLineSpacing : LeadingLineSpacing\(LabelRow\(m, famName\), tmNw != null \? tmNw\.font : null\);/.test(cs))
  errors.push("the redress restore must mirror the probe's gate (hand-tuned survives verbatim; still-at-0 adopts the manifest, face-rebased) — probe and dresser disagreeing is an infinite re-dress");

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
  // round 52: the block head grew a spread — the literal pairs plus the
  // FULL-road glyph buttons' own dial rows ride one array
  literalParity(/stateFx: \[\.\.\.\(\[\[[\s\S]{0,4500}?\n      \}\),/, ["family", "state", "glow", "lift"], "PBStateFx", "stateFx");
  // two passes since the bespoke-pose round: labeled ink+dy rows, then
  // measured dy-only rows for the other stateFx families
  literalParity(/labelStates: \[\n[\s\S]{0,8000}?\n      \],/, ["family", "state", "fillMode", "fill", "fill2", "dy"], "PBLabelState", "labelStates");
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
  /* round 44: the bigglyph-fx and logo bake roads left with the Uploads/Art
     export exclusion — the floor drops from 9 to 7 */
  const dilatedUsesEE = (src.match(/canvasToPngBytesDilated\(/g) ?? []).length;
  if (dilatedUsesEE < 7)
    errors.push(`engineExport's direct canvas bakes ride canvasToPngBytesDilated only ${dilatedUsesEE}x (need >=7: backgrounds, stamp, stamp mask, dialed-shadow bake, mask re-register, shadow sibling, baked-face atlas) — a bake road still ships premultiplied black fringe (slice 1)`);
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

/* ── Unity-exporter round, slice 1 (2026-08-27): press travel — the
   children ride the state. App truth: shell, label and icon travel as ONE
   group per state (measured: Brightside pressed +3 down / hover 2 up, the
   lift dials); swap sprites bake that travel while the root holds still
   (BakedSink), so the label/icon/words/specular/arc children we place
   must slide by the same lift+sink the halo rides — one writer, exact
   restore. Scale chain: on the posed road the root wears the SHELL box,
   so StateFx's size key is re-framed through SoloLabelK (offsets are
   design px; convert exactly as label seating does). labelStates dy is
   MEASURED from the state renders (K-true), lift-dial share subtracted. */
{
  if (!/RectTransform\[\] riders; Vector2\[\] riderBase; float\[\] riderWrote;/.test(fx)
      || !/void EnsureRiders\(\)/.test(fx) || !/void PushRiders\(\)/.test(fx))
    errors.push("StateFx's content ride (riders/EnsureRiders/PushRiders) is missing — labels and icons park while the face presses (slice 1, press travel)");
  /* follow-up field round: a name ALLOWLIST parked every other icon child
     (a dev-dropped icons/* glyph, a Glyph prefab inside an Iconbtn or
     ItemSlot — the kit's own "drop any icons/* on top" advice) while the
     face sank. Discovery is ALL content children minus the structural
     set: Body / Posed art travel IN the swapped pixels (riding doubles),
     Template is TMP_Dropdown's, Weapon is the FireButton rig's, and
     hideFlags-marked runtime decor repositions itself. */
  if (!/if \(n == "Body" \|\| n == "Posed art" \|\| n == "Template" \|\| n == "Weapon"\) continue;/.test(fx))
    errors.push("StateFx's rider discovery must ride ALL content children minus the structural set (Body/Posed art/Template/Weapon) — a name allowlist parks dev-dropped icons (slice 1, follow-up)");
  if (!/if \(ch\.gameObject\.hideFlags != HideFlags\.None\) continue; \/\/ runtime decor moves itself/.test(fx))
    errors.push("StateFx's rider discovery must skip hideFlags-marked runtime decor (halo, wipe band+mask, edge spark, claim flash) — two writers on one transform is the drift (slice 1, follow-up)");
  if (!/if \(contentStays \|\| !BakedSink\(\)\) return; \/\/ root motion carries them on tiled\/rig builds/.test(fx))
    errors.push("PushRiders must ride ONLY baked-sink (sprite-swap) builds — root motion already carries children elsewhere, and doubling is the drift (slice 1)");
  if (!/PushRiders\(\);\s*\n\s*\/\/ the halo follows in MirrorHost/.test(fx))
    errors.push("Push must move the riders with every lift write (PushRiders before MirrorHost) (slice 1)");
  if (!/if \(riders\[i\] != null && !float\.IsNaN\(riderWrote\[i\]\)\) riders\[i\]\.anchoredPosition = riderBase\[i\];/.test(fx))
    errors.push("OnDisable must restore every rider to its exact resting seat — write-once identity (slice 1)");
  if (!/public bool CarriesContent\(RectTransform r\)/.test(fx))
    errors.push("StateFx.CarriesContent is missing — LabelStateInk cannot know who owns the label's travel (slice 1)");
  if (!/lift = \(disabledLift \+ \(baked \? disabledSink : 0f\)\) \* kSz; return disabledGlow;/.test(fx))
    errors.push("the disabled state must ride ITS pose (disabledLift/disabledSink) — every state the app moves, Unity moves (slice 1)");
  // LabelStateInk defers the label's travel to the content ride — two
  // writers on one transform is how labels drift
  const inkOpen = src.indexOf("const LABEL_STATE_INK_RUNTIME = `");
  let inkCs = "";
  if (inkOpen < 0) errors.push("LABEL_STATE_INK_RUNTIME not found");
  else {
    const inkStart = inkOpen + "const LABEL_STATE_INK_RUNTIME = `".length;
    let inkEnd = -1;
    for (let i = inkStart; i < src.length; i++) {
      if (src[i] === "\\") { i++; continue; }
      if (src[i] === "`") { inkEnd = i; break; }
    }
    inkCs = inkEnd > 0 ? new Function("return `" + src.slice(inkStart, inkEnd) + "`;")() : "";
  }
  if (!/if \(fx != null && fx\.CarriesContent\(mover\)\) basePosSet = false;/.test(inkCs))
    errors.push("LabelStateInk must defer the label's travel to StateFx.CarriesContent on swap builds (slice 1)");
  // the importer wires the disabled channel and re-frames the posed road's
  // travel key to the shell box (the SoloLabelK lesson, StateFx side)
  if (!/fx\.disabledSink = -ExpectedShift\(m, family, "disabled"\);/.test(cs) || !/fx\.disabledLift = disL;/.test(cs))
    errors.push("WireStateFx must arm the disabled channel (disabledLift from stateFx rows, disabledSink from ExpectedShift) (slice 1)");
  if (!/var fxPose = inst\.GetComponent<StateFx>\(\);\s*\n\s*if \(fxPose != null && it\.h > 1f\) \{\s*\n\s*float kPose = SoloLabelK\(it, m, rt\);\s*\n\s*if \(kPose > 0\.001f\) fxPose\.authoredHeight = it\.h \/ kPose;/.test(cs))
    errors.push("the posed road must re-frame StateFx.authoredHeight through SoloLabelK — the root wears the SHELL box there, and travel scales by the sprite-air ratio otherwise (slice 1)");
  // emission: labelStates dy is measured from the very renders the swap
  // sprites bake (K-true), the lift dial's share subtracted
  if (!/const stateCollapseDy = \(pid: KitComponentId, sn: "hover" \| "pressed" \| "disabled", dialDy: number\): number =>/.test(src)
      || !/stateCollapseDy\(pid, sn, Math\.round\(\(pc\.candy\.extrusion\.depth - f\.candy\.extrusion\.depth\) \* 10\) \/ 10\)/.test(src))
    errors.push("labelStates dy must ship the MEASURED baked-face collapse (stateCollapseDy) — the raw dial delta speaks unscaled design px (slice 1)");
}

/* ── Unity-exporter round, slice 2 (2026-08-27): NOTHING BAKES — the
   universal live-prefab road. Every census family places live under its
   own component name; family bakes render WITH content and then exactly
   the word ink leaves the pixels (label groups + seat-eligible texts, the
   seat parser's own acceptance rule); per-copy content rides the posed
   skin road (content trigger); the bake gate is an explicit allowlist
   that BRANDS any silent bake; the glyph rack ships as art prefabs. */
{
  if (!/qtybadge: "qtybadge", levelnode: "levelnode", dailycell: "dailycell",/.test(src)
      || !/ring: "ring", avatarframe: "avatarframe", claimbtn: "claimbtn", bottomnav: "bottomnav",/.test(src))
    errors.push("PREFAB_FAMILY lost the universal-road families — their board copies would silently fall back to baked stamps (slice 2)");
  if (!/for \(const cGl of KIT_COMPONENTS\) if \(isGlyphPiece\(cGl\.id\)\) PREFAB_FAMILY\[cGl\.id\] = cGl\.id;/.test(src))
    errors.push("the glyph rack's PREFAB_FAMILY registration is missing — glyph pieces would bake again (slice 2)");
  if (!/const BAKE_OK = new Set<KitComponentId>\(\["invgrid"\]\);/.test(src))
    errors.push("the stamp road's explicit allowlist (BAKE_OK) is missing (slice 2)");
  if (!/\.\.\.\(BAKE_OK\.has\(idBase\) \? \{\} : \{ bakedFallback: true \}\),/.test(src))
    errors.push("the stamp road must BRAND non-allowlisted component bakes (bakedFallback) — the fence's zero-silent-bakes assertion reads it (slice 2)");
  if (!/const universalPose = UNIVERSAL_ROAD\.has\(idBase\) && \(b\.label != null \|\| b\.v != null \|\| b\.ov != null\);/.test(src))
    errors.push("the universal content pose trigger is missing — same-box content divergence (Day 4's today art, a level node's stars) would ride the wrong family bake (slice 2)");
  if (!/const stripWordInk = \(svgIn: string\)/.test(src) || !/if \(warped \|\| ghosted\) continue;/.test(src))
    errors.push("the family-bake word strip (stripWordInk, parseTextSeats' acceptance rule) is missing — words would bake into the universal families (slice 2)");
  if (!/if \(cropBox && !UNIVERSAL_DISPLAY\.has\(idBase\) && \(!isGlyphPiece\(idBase\) \|\| GLYPH_BUTTONS\.has\(idBase\)\)\) \{/.test(src))
    errors.push("posed state skins must skip DISPLAY families and the glyph rack (ACTION glyphs excepted, round 40) — button-less prefabs would ship dead state files (slice 2)");
  if (!/const GLYPH_BUTTONS = new Set<KitComponentId>\(\["glyphpause", "glyphplay", "glyphreplay", "glyphhome"\]\);/.test(src)
      || !/const interactive = UNIVERSAL_INTERACTIVE\.has\(uid\) \|\| GLYPH_BUTTONS\.has\(uid\);/.test(src))
    errors.push("the ACTION glyphs (pause/play/replay/home) no longer ship state skins — the Gameplay pause button goes dead in Play again (round 40)");
  if (!/a family that ships state skins IS a control/.test(cs) || !/img\.raycastTarget = true;/.test(cs))
    errors.push("the ACTION-glyph Button wiring no longer re-enables the raycast — the art-mandate default leaves the pause button deaf (round 40)");
  // C#: manifest-declared labeled families, art-honest glyphs, posed Words stand-down
  if (!/if \(label == null && a\.labelText != null && a\.labelText\.Length > 0\) label = a\.labelText;/.test(cs))
    errors.push("RunPrefabBuilders must admit manifest-declared labeled families (labelText) — ghost/qtybadge/levelnode prefabs lose their live words (slice 2)");
  if (!/if \(baseAsset\.component != null && \(baseAsset\.component\.StartsWith\("glyph"\) \|\| PoseVariantName\(baseAsset\.component\)\)\) img\.raycastTarget = false;/.test(cs))
    errors.push("glyph prefabs must not catch raycasts — art, never fake buttons (slice 2)");
  if (!/var wdPos = inst\.transform\.Find\("Words"\);\s*\n\s*if \(wdPos != null\) wdPos\.gameObject\.SetActive\(false\);/.test(cs))
    errors.push("the posed road must stand the Words group down — family-level seats would double over the copy's own posed words (slice 2)");
  // the bespoke-pose travel pass (rewardcard: decor scales while shell,
  // words and glow sink by the dial) — measured dy rows for stateFx
  // families; clean translates measure 0 and stay byte-stable
  if (!/const measuredStateDy = \(pid: KitComponentId, sn: "hover" \| "pressed" \| "disabled"\): number \| null =>/.test(src)
      || !/\["skillnode", "skillnode"\], \["booster", "booster"\], \["claimbtn", "claimbtn-double"\],/.test(src))
    errors.push("the bespoke-pose measured-dy pass is missing from labelStates — riders would take the raw lift dial on squash-pose kits (slice 2)");
  // the × glyph rides the baked atlas — qtybadge's live words are ×-counts
  if (!/'&\(\)×";/.test(src.replace(/\\/g, "")) && !/&\(\)×/.test(src))
    errors.push("BAKE_GLYPHS lost the × glyph — every live qtybadge word tofus where the app draws the multiply sign (slice 2)");
  /* ── follow-up field round (the wordless prefabs): SeatRowOf must read
     the BODY seam — RebodyIfGlow nulls the root image on every stateFx
     family, and the root-Image read made claimbtn/boostercard/dailycell/
     rewardcard/list-row prefabs ship shell + icon with NO words. */
  {
    const seatFnAt = cs.indexOf("static PBAsset SeatRowOf(");
    const seatFn = seatFnAt >= 0 ? cs.slice(seatFnAt, seatFnAt + 1800) : "";
    if (!seatFn.includes("var img = BodyImage(host);") || seatFn.includes("host.GetComponent<Image>()"))
      errors.push("SeatRowOf must read BodyImage(host) — the root Image is sprite-less on rebodied (stateFx) families and their Words never wire (slice 2, follow-up)");
  }
  /* incomplete scenes persist in kit.lock.json — SessionState dies with
     the editor and the first-drop race then froze wordless stand-ins.
     Reviewer round (2026-08-27): the marker is un-armable-forever by
     construction now — missing counts ride beside the scenes (the
     loop-breaker's memory), the scene-file sha ledger gates the
     automatic delete, and the receipt carries all of it. */
  if (!/public string\[\] pendingScenes; public int\[\] pendingMissing; public PBSceneShaEntry\[\] sceneShas;/.test(cs)
      || !/prevPend = ScenePendingCountInLock\(root, scenePath\);/.test(cs)
      || !/MarkScenePendingInLock\(root, scenePath, stalled \? 0 : missing\);/.test(cs)
      || !/receipt\.pendingScenes = prev != null \? prev\.pendingScenes : null;/.test(cs)
      || !/receipt\.pendingMissing = prev != null \? prev\.pendingMissing : null;/.test(cs)
      || !/receipt\.sceneShas = prev != null \? prev\.sceneShas : null;/.test(cs)
      || !/lv\.pendingScenes != null && lv\.pendingScenes\.Length > 0/.test(cs))
    errors.push("the incomplete-scene marker must persist in kit.lock.json (pendingScenes + pendingMissing + sceneShas: lock fields, count read in BuildBoardScene, write on save, receipt carry-over, sweep rebuild) — an editor restart otherwise freezes a raced scene on its stand-in forever (slice 2, follow-up; hardened in the reviewer round)");
}

/* ── Unity-exporter round, slice 3 (2026-08-27): the dropdown DROPS DOWN.
   A real selection control on the kit's art — TMP_Dropdown on TMP
   editors, the stock uGUI Dropdown on the pre-2023.2 rung — with the
   kit's menu plate, hover bar and selected check; sample language
   options whose glyphs are pinned into the baked atlas (no tofu). */
{
  if (!/static readonly string\[\] DropdownSampleOptions = new string\[\] \{ "English", "Español", "Français", "Deutsch", "Português", "Italiano" \};/.test(cs))
    errors.push("the dropdown's sample language options are missing or changed — the fence's glyph-coverage proof pins these exact strings (slice 3)");
  if (!/static void BuildDropdownRig\(GameObject go, string root, int pngScale, PBManifest m, Font kitFont\)/.test(cs))
    errors.push("BuildDropdownRig is missing — the dropdown stays a picture (slice 3)");
  if (!/ddC = go\.AddComponent<TMP_Dropdown>\(\);/.test(cs) || !/ddC = go\.AddComponent<Dropdown>\(\);/.test(cs))
    errors.push("the dropdown must wire BOTH rungs — TMP_Dropdown (2023.2+/Unity 6) and legacy Dropdown (2022.3) (slice 3)");
  if (!/srDD\.content = ctRt;\s*\n\s*srDD\.viewport = vpRt;/.test(cs))
    errors.push("the template's ScrollRect must be wired (content + viewport) — Unity never auto-wires it and long lists become unreachable (slice 3)");
  if (!/tgDD\.transition = Selectable\.Transition\.ColorTint;/.test(cs) || !/cbDD\.normalColor = new Color\(1f, 1f, 1f, 0f\);/.test(cs))
    errors.push("the row-highlight bar must ride the item Toggle's tint alpha (rest 0, hover/press/focus 1) — the kit's own emphasis rule (slice 3)");
  if (!/if \(it\.component == "dropdown" && !string\.IsNullOrEmpty\(it\.label\)\)/.test(cs)
      || !/ddScn\.options\.Insert\(0, new TMP_Dropdown\.OptionData\(it\.label\)\); diScn = 0;/.test(cs))
    errors.push("the scene must match the per-copy word into the options (insert-at-top fallback) — Play's RefreshShownValue re-shows the board's word (slice 3)");
  if (!/tplRt9\.localScale = new Vector3\(kTpl, kTpl, 1f\);/.test(cs))
    errors.push("the posed road must scale the open-list template through SoloLabelK — prefab-frame rows would dwarf a board-scaled piece (slice 3)");
  if (!/spritePath\.EndsWith\("\/dropdown-base\.9\.png"\)\s*\n\s*&& asset\.GetComponentInChildren<Selectable>\(true\) == null\s*\n\s*&& asset\.transform\.Find\("Template"\) == null/.test(cs))
    errors.push("the maintenance graft (picture-era Dropdown → working control, ownership-gated) is missing — existing projects never gain the drop-down (slice 3)");
  // glyph coverage at the source: the language names' accents ride BAKE_GLYPHS
  const bg = src.match(/const BAKE_GLYPHS = "([^"]+)";/);
  if (!bg) errors.push("BAKE_GLYPHS not found");
  else for (const opt of ["English", "Español", "Français", "Deutsch", "Português", "Italiano"])
    for (const ch of opt.replace(/ /g, ""))
      if (!bg[1].includes(ch)) errors.push(`BAKE_GLYPHS lacks '${ch}' (needed by dropdown option "${opt}") — tofu in the baked faces (slice 3)`);
}

/* ── Unity-exporter follow-up round (2026-08-27): the COMPLETE PLAYGROUND.
   Owner: "there should be more items from the kit included… to make it
   feel complete". Every released family shelves once, in the kit page's
   chapter order, on a TALL SCROLLING canvas; staged families that leaked
   into the zip stay off the shelf (manifest.stagedFamilies — emitted
   TS-side as staged AND not board-blessed). */
{
  if (!/\("CHOICE CONTROLS & FIELDS", new\[\]/.test(cs) || !/\("GAME SYSTEMS", new\[\]/.test(cs)
      || !/allSecs\.Add\(\("GLYPHS \(Prefabs\/Glyphs\)", glyphNames\.ToArray\(\)\)\);/.test(cs))
    errors.push("the Playground's chapter sections (kit-page order + the Glyphs shelf) are missing (slice 5)");
  if (!/new GameObject\("Catalog Scroll", typeof\(RectTransform\), typeof\(ScrollRect\)\);/.test(cs)
      || !/float fit = Mathf\.Min\(1f, 1920f \/ boardW\);/.test(cs)
      || /Mathf\.Min\(1920f \/ boardW, 1080f \/ boardH\)/.test(cs))
    errors.push("the Playground must be the tall scrolling catalog (ScrollRect; width fits, height scrolls — never the whole-shelf shrink) (slice 5)");
  if (!/if \(stagedNames\.Contains\(n\)\) continue;/.test(cs) || !/if \(!placedNames\.Add\(n\)\) continue;/.test(cs))
    errors.push("the Playground must gate staged families and shelve one of each (slice 5)");
  if (!/stagedFamilies: \[\.\.\.new Set\(/.test(src) || !/&& !usedOnBoards0\.has\(PREFAB_FAMILY\[c\.id\] \?\? c\.id\)\)/.test(src)
      || !/public string\[\] stagedFamilies;/.test(cs))
    errors.push("manifest.stagedFamilies must ship (staged AND not board-blessed) with its PBManifest field — the shelf's kitVisible gate reads it (slice 5)");
}

/* ── Unity-exporter follow-up round (2026-08-27): the GLYPH SHELF.
   Owner call, verbatim honored: glyphs STAY prefabs but live in
   Prefabs/Glyphs (the BigGlyphs pattern); existing projects' root-level
   glyph prefabs MOVE there (GUID-preserving MoveAsset — references
   follow), ownership-gated; scenes answer both addresses; button-embedded
   icons remain children, never separate prefabs. */
{
  if (!/if \(a\.component\.StartsWith\("glyph"\)\) \{\s*\n\s*if \(!AssetDatabase\.IsValidFolder\(glyphDir\)\) AssetDatabase\.CreateFolder\(dir, "Glyphs"\);\s*\n\s*famDir2 = glyphDir;/.test(cs))
    errors.push("glyph family prefabs must build into Prefabs/Glyphs (the BigGlyphs pattern) — the folder call (slice 4)");
  if (!/if \(!anyGlyph && !hadGlyphDir && AssetDatabase\.IsValidFolder\(glyphDir\)\) AssetDatabase\.DeleteAsset\(glyphDir\);/.test(cs))
    errors.push("a glyph-less kit must leave no empty Glyphs folder (slice 4)");
  if (!/pf = AssetDatabase\.LoadAssetAtPath<GameObject>\(root \+ "\/Prefabs\/Glyphs\/" \+ pfName \+ "\.prefab"\);/.test(cs)
      || !/if \(pf == null\) pf = AssetDatabase\.LoadAssetAtPath<GameObject>\(root \+ "\/Prefabs\/" \+ pfName \+ "\.prefab"\);/.test(cs))
    errors.push("board scenes must answer BOTH glyph addresses (Prefabs/Glyphs first, the root for kept projects) (slice 4)");
  if (!/static void ShelveGlyphPrefabs\(string root\)/.test(cs)
      || !/spPathG\.StartsWith\(root \+ "\/assets\/glyph"\)/.test(cs)
      || !/AssetDatabase\.MoveAsset\(pG, targetG\)/.test(cs))
    errors.push("the glyph shelving pass (ownership-gated GUID-preserving move into Prefabs/Glyphs) is missing (slice 4)");
  if (!/ShelveGlyphPrefabs\(root\); \/\/ the owner's folder call, healed on every import/.test(cs)
      || !/ShelveGlyphPrefabs\(root\); \/\/ root-level glyphs move BEFORE the rebuild/.test(cs))
    errors.push("glyph shelving must run on every import AND before a manual Regenerate — a rebuild would otherwise mint Glyphs/ twins beside root originals (slice 4)");
  // button-embedded icons stay CHILDREN — no builder may mint an icon prefab
  for (const m2 of cs.matchAll(/SaveAsPrefabAsset\(go, ([^)]+)\)/g))
    if (/"Icon/.test(m2[1])) errors.push(`a builder saves an icon prefab (${m2[1].slice(0, 60)}) — button-embedded icons remain children, never separate prefabs (slice 4)`);
}

/* ── Unity-exporter follow-up round (2026-08-27): the IMMUTABLE-PACKAGE
   POLICY, scanned. Owner field (Shop status bar): "assets located in
   immutable packages were unexpectedly altered". Two write roads could
   put ink inside Packages/: a blanket AssetDatabase.SaveAssets() flushes
   EVERY dirty asset — package assets Unity itself dirtied included, and
   the warning lands on the flusher — and the Input System settings write
   ran on whatever asset InputSystem.settings resolved to. Policy: the
   importer writes ONLY under Assets/, saves ONLY its own assets, and the
   sole permitted "Packages/" literals are the TMP-essentials READ paths
   (ImportPackage unpacks INTO Assets, touching nothing in the package). */
{
  if (/AssetDatabase\.SaveAssets\(\)/.test(cs))
    errors.push("blanket AssetDatabase.SaveAssets() found — it flushes package assets others dirtied (the owner's 'immutable packages… altered' status bar); save the specific asset via SaveAssetIfDirty instead (immutable-package policy)");
  const ALLOWED_PKG_LITERALS = new Set([
    // READ roads: the TMP Essential Resources .unitypackage locations —
    // ImportPackage unpacks them into Assets/, the package is untouched
    "Packages/com.unity.ugui/Package Resources/TMP Essential Resources.unitypackage",
    "Packages/com.unity.textmeshpro/Package Resources/TMP Essential Resources.unitypackage",
    // the tripwire's own path CLASSIFIER (round 33) — it reads save paths
    // to BLOCK package writes; the literal addresses nothing
    "Packages/",
  ]);
  {
    // real STRING literals only — the same comment-aware walk as the lexer
    // above (a naive regex once matched from code into a comment's prose)
    let inBlk = false;
    for (const line of lines) {
      let i = 0;
      while (i < line.length) {
        if (inBlk) {
          const close = line.indexOf("*/", i);
          if (close < 0) { i = line.length; break; }
          inBlk = false; i = close + 2; continue;
        }
        const ch = line[i];
        if (ch === "/" && line[i + 1] === "/") break;
        if (ch === "/" && line[i + 1] === "*") { inBlk = true; i += 2; continue; }
        if (ch === '"') {
          let j = i + 1, lit = "";
          while (j < line.length) {
            if (line[j] === "\\") { lit += line[j] + (line[j + 1] ?? ""); j += 2; continue; }
            if (line[j] === '"') break;
            lit += line[j]; j++;
          }
          if (lit.includes("Packages/") && !lit.includes("immutable packages") && !ALLOWED_PKG_LITERALS.has(lit))
            errors.push(`unallowlisted "Packages/" literal in the emitted C#: "${lit.slice(0, 90)}" — the importer must never address package paths outside the documented TMP-essentials READ roads (immutable-package policy)`);
          i = j + 1;
          continue;
        }
        i++;
      }
    }
  }
  if (!/var isetPath = uobj != null \? AssetDatabase\.GetAssetPath\(uobj\)\.Replace\("\\\\", "\/"\) : "";/.test(cs)
      || !/!isetPath\.StartsWith\("Assets\/"\)/.test(cs))
    errors.push("the Input System settings write must mint an Assets/ copy whenever the live settings asset is NOT under Assets/ (package-resident settings would be altered in place) (immutable-package policy)");
  if (/if \(!routed && uobj != null && !isetPath\.StartsWith\("Assets\/"\)\)/.test(cs))
    errors.push("the Input System settings mint is direction-scoped again (!routed) — the un-route toggle would write a package-resident settings asset in place; mint on ANY non-Assets path (immutable-package policy, round 33)");
  if (!/settingsPath\.Replace\("\\\\", "\/"\)\.StartsWith\("Assets\/"\)/.test(cs))
    errors.push("the TMP settings write must stay Assets/-gated (the round-10 immutable-package guard) (immutable-package policy)");
  /* round 33 — the TRIPWIRE: whatever still dirties a package asset (TMP's
     font-asset version upgrade is the known third-party dirtier), the
     alteration only lands at flush time. The processor must exist, gate on
     IMMUTABLE sources only (embedded/local = the dev's own, untouchable by
     us in the other direction), drop the path from the save list, and name
     the asset out loud — the field's next Console says which asset and who
     flushed. */
  if (!/class KitImmutablePackageTripwire : UnityEditor\.AssetModificationProcessor/.test(cs))
    errors.push("the immutable-package tripwire (KitImmutablePackageTripwire) is missing — package-asset flushes go unblocked and unnamed (immutable-package policy, round 33)");
  if (!/pkg\.source != UnityEditor\.PackageManager\.PackageSource\.Embedded/.test(cs)
      || !/pkg\.source != UnityEditor\.PackageManager\.PackageSource\.Local/.test(cs))
    errors.push("the tripwire must exempt Embedded and Local packages — those are the developer's own, writable by design (immutable-package policy, round 33)");
  if (!/blocked a save into the immutable package asset/.test(cs))
    errors.push("the tripwire must NAME the blocked asset in the Console (the diagnostic half of the round-33 mandate)");
  if (!/return keep != null \? keep\.ToArray\(\) : paths;/.test(cs))
    errors.push("the tripwire must actually DROP blocked paths from the save list (returning the filtered array is the kill)");
  /* every object-addressed save stays on a known-ours target — a new
     SaveAssetIfDirty on an unvetted object is how a package asset gets
     flushed by us */
  {
    const SAVE_OK = new Set(["dirty", "fa", "face", "TMP_Settings.instance", "existing"]);
    for (const mt of cs.matchAll(/AssetDatabase\.SaveAssetIfDirty\(([^)]*)\)/g))
      if (!SAVE_OK.has(mt[1].trim()))
        errors.push(`SaveAssetIfDirty on unvetted target "${mt[1].trim()}" — add it to the guard's allowlist only after proving it is an Assets-resident kit asset (immutable-package policy)`);
  }
  /* round 33 — the "kinda" font: dynamic faces must PERSIST their source
     (the GUID stamp), and the dropdown's option rows must bind the kit
     face at build AND heal a fallback-bound Item Label on re-import. */
  if (!/static void StampDynamicSource\(TMP_FontAsset fa, Font ttf\)/.test(cs)
      || !/m_SourceFontFileGUID/.test(cs) || !/m_SourceFontFile_EditorRef/.test(cs))
    errors.push("StampDynamicSource is missing (or lost its serialized-property stamps) — dynamic faces forget their source font across reloads and text drops to the LiberationSans fallback (the owner's 'kinda' font)");
  if (!/if \(existing != null\) \{ StampDynamicSource\(existing, ttf\); return existing; \}/.test(cs))
    errors.push("EnsureTmpFace must stamp EXISTING faces too — projects minted before the fix must heal on re-import (the 'kinda' font)");
  if (!/var itFace = EnsureTmpFace\(root, m, kitFont\);\s*\n\s*if \(itFace != null\) itLb\.font = itFace;/.test(cs))
    errors.push("the dropdown's Item Label must bind the kit face at rig build (itLb.font = itFace) — rows otherwise ride TMP's fallback face");
  if (!/itLbF\.font == null \|\| itLbF\.font\.name\.StartsWith\("LiberationSans"\)/.test(cs))
    errors.push("the dropdown maintenance heal is missing — an already-rigged Dropdown whose rows ride the LiberationSans fallback must re-bind to the kit face on import (the 'kinda' font)");
}

/* ── LIVE TYPE STAMPS (owner mandate, 2026-08-27: typed words are
   components, not pixels). The allowlist: WARPED stamps (stamp.warp
   active) are the one stamp raster allowed to stay art — the bend is
   pixel math by contract. Everything else must travel live: the app side
   gates stampLive on the warp check, the C# side builds editable text
   through ONE shared builder (scene pass + kept-scene heal), seated on
   the measured ink box, with the baked sprite as the documented fallback
   rung only. */
{
  if (!/static GameObject BuildLiveStamp\(string root, PBManifest m, PBBoardItem it, UnityEngine\.SceneManagement\.Scene scene\)/.test(cs))
    errors.push("BuildLiveStamp is missing — unwarped type stamps must place as editable text (owner mandate: never baked)");
  if (!/it\.stampLive == 1 && it\.stampFs > 1f/.test(cs))
    errors.push("the scene pass no longer routes stampLive rows through the live-stamp builder");
  if (!/it2\.stampLive == 1 && it2\.stampFs > 1f/.test(cs))
    errors.push("the kept-scene heal no longer converts baked stamp pictures to live text (project-27-class projects would stay pictures forever)");
  if (!/rt\.anchoredPosition \+= new Vector2\(it\.stampDx, -it\.stampDy\);/.test(cs))
    errors.push("the live stamp no longer seats on its measured ink box (stampDx/Dy) — placement drifts off the app render");
  // the app-side warp gate: stampLive must never ride a warped stamp
  if (!/inkBox && !\(b\.stamp\.warp && b\.stamp\.warp\.style !== "none" && b\.stamp\.warp\.amount\)/.test(src))
    errors.push("the app-side warp gate is gone — warped stamps are the ONLY stamps allowed to stay art (guard allowlist), and stampLive must never ride one");
  // the fallback rung stays documented and armed: no HeroLabel/face yet → baked + missing++ (self-rebuild)
  if (!/stays a baked image this pass/.test(cs))
    errors.push("the live-stamp race fallback (baked stand-in + missing++ self-rebuild) is missing");
}

/* ── DROPDOWN OPEN-MENU PARITY (round 33, coordinator handoff): the rig
   consumes kit-manifest.json > menu — the app's resolved voice + parsed
   metrics — on BOTH rungs, so owner menu-dial edits flow to Unity with no
   importer change; the caret's protective right border survives the
   measured-slice pass (sliceMin floor, app side). */
{
  if (!/\[Serializable\] class PBMenu \{ public string\[\] items;/.test(cs) || !/public PBMenu menu;/.test(cs))
    errors.push("PBMenu is missing from the manifest classes — the menu block would be dropped in silence");
  if (!/var mnu = m != null \? m\.menu : null;/.test(cs) || !/float rowH = mnuOk \? mnu\.rowH :/.test(cs))
    errors.push("BuildDropdownRig no longer consumes the manifest menu block (rowH/pad/gap)");
  if ((cs.match(/itLb\.color = mnuInk;/g) ?? []).length !== 2)
    errors.push("the menu row ink must flow to BOTH rungs' Item Label (TMP and legacy Text)");
  if (!/itCkRt\.anchoredPosition = new Vector2\(-mnu\.checkInsetR, 0f\);/.test(cs))
    errors.push("the selected-check no longer seats at the app's measured right inset");
  if (!/sliceMin: \{ right: Math\.round\(80 \* PNG_SCALE\) \}/.test(src))
    errors.push("the dropdown caret's protective border floor (sliceMin) is gone — the measured-slice pass will shear the chevron on stretched copies again");
}

/* ── UNITY DEV REVIEWER ROUND (2026-08-27) — the blockers' pins.
   B1: a LAYERLESS kit's splash stamps take the styled-SDF road (the
   HeroLabel prefab can never exist there — a permanent fact must finish
   the build, never arm it), and the incomplete-scene rebuild is
   un-armable-forever: the scene-file sha ledger gates every automatic
   delete, and two builds ending on the same missing count stop the loop
   with one honest line. B2: the 2022.3 label rung wears the family's
   resolved ink (the hardcoded white was invisible on dark-ink kits). */
{
  if (!/bool layeredKit = m != null && m\.typography != null && m\.typography\.bakedFace != null/.test(cs)
      || !/if \(plainTier \|\| !layeredKit\) \{/.test(cs))
    errors.push("BuildLiveStamp lost the layered-face gate — splash stamps on layerless kits would arm the eternal scene rebuild again (reviewer B1a)");
  if (!/var flatInk = plainTier \? it\.stampInk : it\.stampSplashInk;/.test(cs)
      || !/public string stampSplashInk;/.test(cs)
      || !/stampSplashInk: b\.stamp\.plain/.test(src))
    errors.push("the splash tier's resolved flat ink (stampSplashInk) no longer travels app → manifest → SDF fallback — layerless splash stamps would guess the button voice (reviewer B1a)");
  if (!/var oursSha = SceneShaInLock\(root, scenePath\);/.test(cs)
      || !/if \(oursSha == null \|\| nowSha == null \|\| oursSha != nowSha\) \{/.test(cs))
    errors.push("the scene-file authorship gate is gone — the pending rebuild would delete dev-edited scenes again (reviewer B1b)");
  if (!/bool stalled = missing > 0 && prevPend > 0 && missing == prevPend;/.test(cs)
      || !/RecordSceneShaInLock\(root, scenePath\);/.test(cs))
    errors.push("the pending loop-breaker (same missing count twice in a row → stop and say so) is gone (reviewer B1b)");
  if (!/t\.color = LegacyFlatInk\(m, family\);/.test(cs)
      || !/static Color LegacyFlatInk\(PBManifest m, string family\)/.test(cs))
    errors.push("the 2022.3 label rung lost the family ink ladder — dark-ink kits go white-on-cream again (reviewer B2)");
  // the docs' 2022.3 notes are load-bearing honesty, not prose polish
  if (!/On Unity 2022\.3:\*\* every word is still live, editable text/.test(src)
      || !/The full 2022\.3 picture, feature by feature/.test(src))
    errors.push("the QuickStart/README 2022.3 qualifications are gone — the docs overpromise the legacy rung again (reviewer B2)");
}

/* ── UNITY DEV REVIEWER ROUND (2026-08-27) — the paper cuts' pins.
   P3: the designed weight ships as a REAL cut and synthetic bold keys
   on the gap to the cut actually aboard. P4: nothing promises a
   HeroLabel a layerless kit can never have. P5: the resize pass
   converges only rects the importer itself last authored. P6: the
   update dialog says LOST. P7: the recipe README's fonts paragraph
   speaks the Unity zip's truth (fonts bundled, no SVGs). */
{
  if (!/public int shippedWeight;/.test(cs)
      || !/s\.weight - \(s\.shippedWeight > 0 \? s\.shippedWeight : 400\) >= 150/.test(cs)
      || !/shippedWeight = got\.realWeight \?\? \(gotDesigned \? designedW : 400\);/.test(src)
      || !/shippedWeight,\s*\n/.test(src))
    errors.push("the designed-weight cut no longer travels (axis fetch → manifest shippedWeight → gap-keyed synthetic bold) — dynamic SDF text renders thinner than the baked art again (reviewer P3)");
  /* strike three on font weights (2026-08-27): every road's bytes are
     PROBED (fvar / OS/2), the browser-impossible UA-override road no
     longer decides alone (baked gstatic static-instance table), and the
     importer re-detects the aboard weight from the file itself so a
     wrong manifest claim can never silently under-bold again. */
  if (!/const gotDesigned = !!got && !got\.variable && got\.realWeight === designedW;/.test(src)
      || !/FONT_STATIC_TTF\[family\]\?\.\[wantedW\]/.test(src)
      || !/probeSfntWeight\(bytes\)/.test(src))
    errors.push("the export stopped probing font bytes / lost the baked static-instance table — variable fallbacks can ship as the designed weight again (strike three)");
  if (!/static int SfntDefaultWeight\(byte\[\] b, out bool variable\)/.test(cs)
      || !/static void HonestizeTypeWeights\(string root, PBManifest m\)/.test(cs)
      || !/HonestizeTypeWeights\(root, m\);/.test(cs))
    errors.push("the importer no longer detects the shipped font's REAL weight from its bytes — a lying manifest silently under-bolds again (strike three)");
  if (!/static bool KitBakesLayers\(string root\)/.test(cs)
      || !/This kit has no layered Hero Label — by design/.test(cs)
      || !/No layer face: this kit's type recipe bakes no stroke\/shadow layers/.test(cs))
    errors.push("the HeroLabel dead-end honesty (menu dialog + neutral Kit Status line) is gone (reviewer P4)");
  if (!/const heroAsset = layersShipped \? "KitFace Baked Layers" : "KitFace Baked";/.test(src)
      || !/No HeroLabel prefab here — and that's the design/.test(src))
    errors.push("the README no longer forks on layer presence — layered-hero promises with nothing behind them again (reviewer P4)");
  if (!/rectLedger\.TryGetValue\(rectKey, out oursSz\)/.test(cs)
      || !/public PBRectEntry\[\] authoredRects;/.test(cs)
      || !/kept your size on/.test(cs)
      || !/they were ours to update\. A rect you resized is never touched\./.test(cs))
    errors.push("the resize pass lost its ours-vs-theirs ledger — a dev-resized prefab snaps back on every import again (reviewer P5)");
  if (!/will be LOST — the scenes are rebuilt from the kit's layout/.test(cs))
    errors.push("the update dialog stopped saying hand edits are LOST — 'redone' reads as re-applied (reviewer P6)");
  if (!/fontNotesMarkdown\(kitFontFamilies\(st\.cfg\), primaryFontFile \? "bundled" : "linked"\)/.test(src))
    errors.push("the Unity zip's recipe README lost its bundled-fonts paragraph — the SVG pack's install text is another format's story (reviewer P7)");
}

/* THE UN-BURN (maximum-editability law, 2026-08-28): no icon, image, or
   word burned into component art — every swappable thing a live
   Inspector-editable child. These pins keep the whole chain standing:
   the marked-group extraction, the stripped bakes (base AND state
   skins), the manifest seats, the importer's live children (family
   prefabs, the emblem socket, POSED board copies), and the kept-project
   convergence with its receipt. */
{
  if (!/function markedIconOnlySvgs\(svgIn: string\)/.test(src)
      || !/function stripMarkedIcons\(svgIn: string\)/.test(src))
    errors.push("the un-burn's marked-group hands (markedIconOnlySvgs / stripMarkedIcons) are missing from the export");
  if (!/const iconSeatsU = isArt \? null : await iconSeatsOf\(uid, fullU\);/.test(src)
      || !/stripIconInk\(stripWordInk\(sSvg\)\.svg\)\.svg/.test(src))
    errors.push("the universal road stopped stripping marked icon ink (base and/or state skins) — burned swappables are back");
  if (!/const ibSeats = await iconSeatsOf\("iconbtn", ibFull\);/.test(src)
      || !/stripIconInk\(stateShell\(s\.id, stName, s\.opts, s\.value\)\)\.svg/.test(src))
    errors.push("the icon button's glyph is baked again (base or state skins) — the law reversed the universal round's call on purpose");
  if (!/const iconSeatsP = unburnP \? await iconSeatsOf\(p\.id, baseFullP\) : null;/.test(src))
    errors.push("the price button's un-burn (coin + ribbon plate live, ribbon word a seat) is missing from the PROPS road");
  if (!/if \(posedCuts\.length\) ps2 = stripMarkedIcons\(ps2\)\.svg;/.test(src)
      || !/posedIcons: posedIconsPx/.test(src))
    errors.push("the POSED road stopped stripping marked icons / shipping posedIcons — board copies burn their swappables again");
  if (!/\[Serializable\] class PBIconChild \{ public string name; public string file; public float dx; public float dy; public float w; public float h; public bool btn; public float wellR; public bool pinRight; public float rightGap; public string nick;/.test(cs)
      || !/public string word; public float wordFs; public float wordDx; public float wordDy; public string wordInk; public int wordW; \}/.test(cs))
    errors.push("PBIconChild is missing from the importer (or lost its rider-word fields, round 40) — JsonUtility drops every un-burn seat row");
  if (!/if \(!string\.IsNullOrEmpty\(pIc\.word\) && pIc\.wordFs > 1f\) \{/.test(cs)
      || !/pwRt\.anchoredPosition = new Vector2\(pIc\.wordDx, -pIc\.wordDy\); \/\/ board y runs down/.test(cs))
    errors.push("the posed road no longer rebuilds rider words on live plates — the Booster Select counts hide under their pills again (round 40)");
  if (!/var famRowSD = LabelRow\(m, it\.component\);/.test(cs)
      || !/var tSD = inst\.transform\.Find\(IconChildName\(icSD\)\);/.test(cs))
    errors.push("posed copies no longer stand down nick-named family children by the manifest — the Shop bottomnav's Selected ring blobs over MAP again (round 40)");
  if (!/public PBStyle seatInk; public float ringV; public PBIconChild\[\] iconSeats;/.test(cs))
    errors.push("PBAsset must carry iconSeats — without it JsonUtility drops the un-burn seats");
  if (!/static List<string> WireIconChildren\(GameObject go, string root, PBManifest m, string fam\)/.test(cs)
      || !/static List<string> WireIconChildrenRow\(GameObject go, string root, PBManifest m, PBAsset row\)/.test(cs)
      || !/WireIconChildren\(go, root, m, baseAsset\.component\);/.test(cs))
    errors.push("the importer no longer rebuilds live icon children on family prefabs (WireIconChildren)");
  if (!/WireIconChildrenRow\(sgo, root, m, sockRow\);/.test(cs))
    errors.push("the emblem socket lost its live emblem child (WireIconChildrenRow on the socket row)");
  if (!/if \(it\.posedIcons != null\) foreach \(var pIc in it\.posedIcons\)/.test(cs))
    errors.push("posed board copies no longer rebuild their live icon children from posedIcons");
  if (!/typeof\(Image\), typeof\(Mask\)\)/.test(cs) || !/showMaskGraphic = false;/.test(cs))
    errors.push("the avatar's circle-masked Portrait well structure is missing (Mask + hidden mask graphic)");
  if (!/if \(wantUnburn\) \{/.test(cs) || !/un-burned/.test(cs))
    errors.push("the kept-project un-burn convergence (wantUnburn + its Console receipt) is missing from the maintenance pass");
  if (!/&& !wantUnburn && !wantIconRetire && !wantSelectRoot\) continue;/.test(cs))
    errors.push("the maintenance skip-gate no longer counts wantUnburn/wantIconRetire — a kept project whose only need is un-burning (or a re-cut seat retire, round 40) would be skipped");
  if (!/bool wantIconRetire = false;/.test(cs) || !/stepped down \(disabled, not deleted\): this update re-cut that seat into new live children/.test(cs))
    errors.push("the re-cut seat retire is gone — a split seat (the resource medallion → plate + glyph, round 40) leaves the untouched original drawing doubled over the new pair");
  /* round 41 review, paper cut 3: the retire proves what it claims — a
     retint/rescale/rotation is the dev's, and the step-down DISABLES
     (SetActive(false)), never DestroyImmediates */
  {
    const guardCond = /imRC2?\.color != Color\.white \|\| chRC2?\.localScale != Vector3\.one \|\| chRC2?\.localRotation != Quaternion\.identity/g;
    if ((cs.match(guardCond) ?? []).length < 2)
      errors.push("the retire road lost its provable-untouched checks (tint/scale/rotation) on probe or apply — a moved-but-not-renamed legacy seat gets stepped down under a false claim again");
    if (!/gRC\.SetActive\(false\);/.test(cs) || /UnityEngine\.Object\.DestroyImmediate\(gRC, true\);/.test(cs))
      errors.push("the retire step-down destroys again instead of disabling — an unprovable move would be unrecoverable outside version control");
    if ((cs.match(/if \(!chRC2?\.gameObject\.activeSelf\) continue;/g) ?? []).length < 2)
      errors.push("the retire road no longer skips already-disabled children — every import would re-log the same step-down");
  }
  /* round 41 review, blocker 1: rider-aware seat accounting — the drift
     gate pairs Words texts with NON-rider seats and finds adopted rider
     words under their plates; adopted riders re-dress but never re-rect */
  if (!/if \(texts\.Length == nonRider\) \{/.test(cs.replace(/\} else if \(texts\.Length == nonRider\) \{/, "if (texts.Length == nonRider) {"))
      || !/if \(texts\.Length == row\.textSeats\.Length && !adoptedTree\) \{/.test(cs)
      || !/static TMPro\.TMP_Text AdoptedRiderText\(GameObject host, PBAsset row, PBSeat seat\)/.test(cs)
      || !/rider words live under their plates/.test(cs)
      || !/if \(!adopted && srt != null && !SeatRect\(/.test(cs)
      /* re-verdict close: the non-rider pairing proves itself by seed name
         — a kept pre-adoption tree with one word deleted must never
         index-mispair and rewrite survivors */
      || !/if \(PlainWord\(texts\[wi\]\.gameObject\.name\) != PlainWord\(s9\.text\)\) \{/.test(cs))
    errors.push("the rider-aware seat accounting is gone — a fresh import's own adoption trips the dev-restructured gate again (boostercard 2v3, avatarframe 0v1) and every later heal silently skips");
  /* round 41 review, blocker 2: posed rider counts rebuild on BOTH rungs —
     fully-qualified TMP outside the styled-rung guard + the LTS face mint */
  if (!/typeof\(TMPro\.TextMeshProUGUI\)/.test(cs)
      || !/static TMPro\.TMP_FontAsset RiderFace\(string root, PBManifest m\)/.test(cs)
      || !/static void SeatHarden\(TMPro\.TMP_Text t\)/.test(cs))
    errors.push("the posed rider words hid behind the styled-rung guard again — 2022.3 ships empty qty pills and badge plates");
  {
    // the docs tell the LTS truth: the rider exception is stated in BOTH docs
    if (!/which rebuild as editable TMP on\s*\n?> BOTH rungs/.test(src) || !/which arrive as editable TMP text on both\s*\n?> rungs/.test(src))
      errors.push("the 2022.3 rung contract in README/QuickStart no longer states the rider-count exception — the shipped docs would lie again");
    if (!/### What arrives LIVE — the swap-the-sprite contract/.test(src))
      errors.push("the README's live-children paragraph (swap-the-sprite contract) is gone — the flagship editability is undocumented again");
  }
  /* the un-burn's ONE-SHOT law (editability blocker): a seat seeds once,
     is recorded in kit.lock.json > seededChildren, and is never re-added
     — a deleted child stays deleted, a renamed child never grows a
     canonical twin, and unburned++ only counts real adds. */
  if (!/public PBRectEntry\[\] authoredRects; public string\[\] seededChildren; public string\[\] seededPrefabs; \}/.test(cs))
    errors.push("PBLock lost the seededChildren ledger — the un-burn resurrects deleted children and twins renamed ones again");
  if (!/receipt\.seededChildren = passSeededChildren != null \? passSeededChildren : \(prev != null \? prev\.seededChildren : null\);/.test(cs))
    errors.push("the receipt no longer carries the seeded-children ledger forward — one import without maintenance would amnesia every seeded seat");
  if (!/if \(asset\.transform\.Find\(cnU0\) != null\) \{ unburnLedger\.Add\(keyU0 \+ cnU0\); continue; \}/.test(cs)
      || !/if \(unburnLedger\.Contains\(keyU0 \+ cnU0\)\) continue;/.test(cs)
      || !/if \(prevFilesU != null && prevFilesU\.Contains\(icU0\.file\)\) \{ unburnLedger\.Add\(keyU0 \+ cnU0\); continue; \}/.test(cs))
    errors.push("the un-burn trigger lost its one-shot ledger walk (adopt-present / skip-ledgered / migrate-shipped) — deletes resurrect and renames twin again");
  if (!/if \(theirs != null && theirs\.Contains\(cn\)\) continue;/.test(cs)
      || !/var addedUA = WireIconChildrenRow\(contents, root, m, rowUA, theirsUA\);/.test(cs)
      || !/if \(addedUA\.Count > 0\) \{/.test(cs))
    errors.push("the un-burn apply road no longer honors the ledger (theirs skip / honest unburned count on real adds only)");
  if (!/Each seat seeds exactly once \(kit\.lock\.json > seededChildren\)/.test(cs))
    errors.push("the un-burn Console receipt no longer tells the one-shot truth");
  /* the BOTTOMNAV's baked state indicators go live (editability paper cut
     2): the selected ring and the notification plate are marked groups —
     stripped from the bake, shipped as "Selected ring" / "Badge plate"
     children — and the badge's live count RIDES its plate as one group. */
  if (!/data-part="icon" data-icon="ring" data-icon-nick="Selected ring"/.test(bevelSrc)
      || !/opacity="0\.9091"/.test(bevelSrc))
    errors.push("the bottomnav selected ring is baked again (or lost its exact 0.78→0.98 bridge overlay) — a dev can never select another tab");
  if (!/data-icon-nick="\$\{bNick\}"/.test(bevelSrc) || !/data-seat-rider="\$\{bName\}"/.test(bevelSrc))
    errors.push("the bottomnav notification plate is baked again (or its count no longer rides the plate) — the fake badge can never be removed");
  if (!/nick: gs0\[gi\]\.getAttribute\("data-icon-nick"\) \|\| null,/.test(src)
      || !/\.\.\.\(mk\.nick \? \{ nick: mk\.nick \} : \{\}\),/.test(src)
      || !/\.\.\.\(t\.getAttribute\("data-seat-rider"\) \? \{ rider: t\.getAttribute\("data-seat-rider"\)! \} : \{\}\),/.test(src))
    errors.push("the export no longer carries the friendly child names (nick) or the badge count's rider through to the manifest");
  if (!/public float strokeEmPct; public string rider; public bool unkern; \}/.test(cs) // round 48 appended the smashed-pair flag
      || !/static void AdoptSeatRiders\(GameObject host, PBAsset row\)/.test(cs)
      || !/AdoptSeatRiders\(host, row\);/.test(cs)
      || !/AdoptSeatRiders\(contents, rowUA\);/.test(cs))
    errors.push("the importer no longer parents a rider word under its live plate (AdoptSeatRiders on fresh builds AND the kept-project un-burn)");
  if (!/static string IconChildName\(PBIconChild ic\) \{ return !string\.IsNullOrEmpty\(ic\.nick\) \? ic\.nick : /.test(cs))
    errors.push("the friendly child name (nick) no longer wins in IconChildName — Selected ring / Badge plate lose their names");
}

/* SLICE-2 pins (the position & styling punch list): the maker's Nudge
   dials travel into every export render, the labeled props ship real
   label metrics, the chart zone speaks the DRAWN frame, the toggle
   marks anchor on the face, and the globe liquid is a pre-clipped disc. */
{
  if (!/const nudgeOf = \(id: KitComponentId\)/.test(src)
      || !/\{ label: "", icon: null, \.\.\.nudgeOf\(id\), \.\.\.opts \}/.test(src)
      || !/\.\.\.nudgeOf\(id\), \/\/ the seat render nudges like the app's own/.test(src)
      || !/icon: null, label: word, \.\.\.nudgeOf\(id\), \.\.\.extra \}/.test(src))
    errors.push("the text-nudge dials (kitTextOy/Ox) no longer ride the export renders — nudged labels bake un-nudged again (the badge-sits-low field)");
  if (!/textOy: st\.kitTextOy\?\.\[`\$\{id\}:\$\{st\.kitSizes\[id\] \?\? "l"\}`\]/.test(src))
    errors.push("the POSED road stopped nudging its renders — board copies of nudged families bake un-nudged");
  if (!/const propLabelSeat = \(id: KitComponentId, word: string \| undefined\)/.test(src)
      || !/\.\.\.propLabelSeat\(p\.id, propWord\)/.test(src))
    errors.push("the labeled props (keycap/endturn/pricebtn) ship no label metrics again — Unity guesses size, ink and seat (the keycap field)");
  if (!/const riseC = shDc && sh0c && shDc\.length === 4 && sh0c\.length === 4 \? shDc\[1\] - sh0c\[1\] : 0;/.test(src)
      || !/y0: Math\.round\(\(zy0 \+ riseC\) \* PNG_SCALE\)/.test(src))
    errors.push("the chart zone lost its rise correction — telemetry/laptimes traces float the headroom above the baked grid again (the ~100px field)");
  if (!/mAnchor = new Vector2\(\(aT\.shell\.x \+ aT\.shell\.w \/ 2f\) \/ bg\.rect\.width, 1f - \(aT\.shell\.y \+ aT\.shell\.h \/ 2f\) \/ bg\.rect\.height\);/.test(cs))
    errors.push("the toggle mark anchors on the sprite rect again — checkbox/radio marks sit low (the extrusion pulls the rect center off the face)");
  if (!/<clipPath id="\$\{gid9\}c"><circle cx="128" cy="128" r="128"\/><\/clipPath>/.test(bevelSrc))
    errors.push("the globe liquid lost its pre-clip — the stencil Mask draws the circular edge again (aliased bottom)");
}

/* SLICE-3 pins: the dropdown's caret rides LIVE (cut from the app's own
   labeled render, right-edge pinned at the measured gap), and the demo
   scenes' dropdowns seed honest domain options (Graphics · High) with
   the maker's typed menu items always overriding. */
{
  if (!/const ddLabeled = shell\("dropdown", \{ icon: undefined, label: st\.kitLabels\?\.dropdown \?\? "SELECT OPTION" \}, slim\);/.test(src)
      || !/const ddCaret0 = await iconSeatsOf\("dropdown", ddLabeled, "dropdown", "caret"\);/.test(src)
      || !/pinRight: true, rightGap: Math\.round\(\(shL\[2\] \/ 2 - \(c0\.dx \+ c0\.w \/ 2\)\) \* 10\) \/ 10/.test(src))
    errors.push("the dropdown caret is baked again (or lost its measured right-edge gap) — parity with the app's labeled render is gone");
  if (!/public bool pinRight; public float rightGap; public string nick;/.test(cs)
      || !/crt\.anchoredPosition = new Vector2\(-\(airR \+ ic\.rightGap \+ ic\.w \/ 2f\), 0f\);/.test(cs)
      || !/WireIconChildren\(go, root, m, "dropdown"\);/.test(cs))
    errors.push("the importer no longer pins the live caret to the right edge (PBIconChild.pinRight / DropdownPrefab wiring)");
  if (!/static void SeedDropdownDomain\(GameObject inst, string caption, PBManifest m\)/.test(cs)
      || !/if \(it\.component == "dropdown"\) SeedDropdownDomain\(inst, it\.label, m\);/.test(cs)
      || !/if \(m != null && m\.menu != null && m\.menu\.items != null && m\.menu\.items\.Length > 0\) return; \/\/ the maker's own menu wins/.test(cs)
      || !/"Low", "Medium", "High", "Ultra"/.test(cs))
    errors.push("the demo dropdowns' honest domain options are gone (SeedDropdownDomain / the Graphics table / the maker-override gate)");
}

/* SLICE-4 pins: the data row speaks the app's name and carries the app's
   anatomy; the Playground shelf is complete with zero overlaps. */
{
  if (!/static string PrefabNameOf\(string family\) \{ return family == "list-row" \? "DataRow" : NiceName\(family\); \}/.test(cs)
      || !/FamilyPrefab\(famDir2, root, a, PrefabNameOf\(a\.component\), label, pngScale, kitFont, m\)/.test(cs)
      || !/var pfName = PrefabNameOf\(it\.component\);/.test(cs))
    errors.push("the data row prefab no longer speaks the app's name (PrefabNameOf list-row → DataRow) — the owner's one-language mandate");
  if (!/static void RenameDataRowPrefab\(string root\)/.test(cs)
      || !/RenameDataRowPrefab\(root\); \/\/ the owner's language, healed on every import/.test(cs)
      || !/RenameDataRowPrefab\(root\); \/\/ and the rename valet, so a rebuild can't mint ListRow beside DataRow/.test(cs)
      || !/if \(pf == null && it\.component == "list-row"\) pf = AssetDatabase\.LoadAssetAtPath<GameObject>\(root \+ "\/Prefabs\/ListRow\.prefab"\);/.test(cs))
    errors.push("the ListRow→DataRow rename valet (GUID-keeping MoveAsset + old-address fallback) is missing");
  if (!/\? \{ row: \{ title: "", sub: "" \} as never, icon: resolveKitIcon\(st\.kitIcons\?\.datarow, undefined\) \}/.test(src)
      || !/const nineIconSeats = n\.id === "datarow" \? await iconSeatsOf\(n\.id, fullSvg, n\.family\) : null;/.test(src))
    errors.push("the data row bakes bare again (row parts off / no un-burn seats) — 'it's missing some stuff' returns");
  if (!/data-icon="portrait"/.test(bevelSrc) || !/data-icon="action"/.test(bevelSrc) || !/data-icon="barfill"/.test(bevelSrc))
    errors.push("the data row's swappable parts (portrait/action/mercury) lost their icon markers in bevel");
  if (!/PicturePrefab\(dir, root, pngScale, m, "orb\/orb-lit\.png", "Orb", false\)/.test(cs)
      || !/"Qtybadge", "Orb", "Achievement"/.test(cs))
    errors.push("the glow orb fell off the Playground shelf (no prefab or no HUD & DATA spot)");
  if (!/claimed\.Add\("MoveCounter"\);/.test(cs))
    errors.push("the MoveCounter twin is back on the shelf — the universal Movecounter must be the family's one spot (zero overlaps)");
  /* the TILED TWIN (editability paper cut 4): the stretch-safe builder
     names through the same PrefabNameOf seam the scene road resolves
     with, and the kept-project valet renames the old twin GUID-keeping —
     BEFORE the staged rebuild, so no DataRow-named twin can mint. */
  if (!/var goName = PrefabNameOf\(fam\) \+ " \(tiled face\)";/.test(cs))
    errors.push("the tiled-face builder no longer names through PrefabNameOf — patterned kits' stretched data-row copies silently fall back to the base face again");
  if (!/static void RenameDataRowTiledFace\(string root\)/.test(cs)
      || !/RenameDataRowTiledFace\(root\); \/\/ and its stretch-safe twin — the scene road's one name/.test(cs)
      || !/RenameDataRowTiledFace\(root\); \/\/ the tiled twin's valet rides along, same reason/.test(cs))
    errors.push("the tiled twin's rename valet is missing (or no longer runs before the staged rebuild on both roads)");
}

/* SLICE-5 pins (owner decision): the big-glyph class is "Art" on every
   surface a person meets — the Prefabs shelf, the Playground chapter,
   docs and receipts — with a GUID-keeping folder valet for kept
   projects. The on-disk sprite folder stays bigglyphs/ by deliberate
   choice (load-bearing across manifest rows, the orphan sweep, kept
   sprite GUIDs and the texture postprocessor). */
{
  if (!/static void RenameArtShelf\(string root\)/.test(cs)
      || !/AssetDatabase\.MoveAsset\(dirA \+ "\/BigGlyphs", dirA \+ "\/Art"\)/.test(cs)
      || !/RenameArtShelf\(root\); \/\/ self-heals at the point of need — no ordering race/.test(cs)
      || !/RenameArtShelf\(root\); \/\/ BigGlyphs → Art, the class's name everywhere/.test(cs)
      || !/RenameArtShelf\(root\); \/\/ BigGlyphs → Art before a rebuild can mint twins/.test(cs))
    errors.push("the Art-shelf rename valet (GUID-keeping folder MoveAsset + its three call sites) is missing");
  if (!/var sub = dir \+ "\/Art";/.test(cs) || !/AssetDatabase\.CreateFolder\(dir, "Art"\);/.test(cs))
    errors.push("board-art prefabs no longer build into Prefabs/Art");
  if (!/root \+ "\/Prefabs\/Art\/" \+ BigGlyphPrefabName\(it\.big\) \+ "\.prefab"/.test(cs))
    errors.push("scene placement no longer looks at Prefabs/Art first (the BigGlyphs load must be the FALLBACK only)");
  if (!/pp\.Contains\("\/Prefabs\/Art\/"\) \|\| pp\.Contains\("\/Prefabs\/BigGlyphs\/"\)/.test(cs)
      || !/allSecs\.Add\(\("ART", bigNames\.ToArray\(\)\)\);/.test(cs))
    errors.push("the Playground's ART chapter is gone (gather or label) — the owner's rename");
  if (/BOARD ART \(Prefabs\/BigGlyphs\)/.test(cs))
    errors.push("the old 'BOARD ART (Prefabs/BigGlyphs)' chapter label is back");
}

/* FULL-CATALOG round, slice 1 pins: chrome & foundations join the universal
   road and shelve in their own chapters (owner roster, 2026-08-28). */
{
  const S1 = ["nameplate", "stepper", "notifydot", "loadbar", "setrow", "listmenu", "scrollbar", "steps", "pagedots"];
  // every S1 family is on the display road AND placeable from boards
  const dispM = /const UNIVERSAL_DISPLAY = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  for (const id of S1) {
    if (!dispM || !new RegExp(`"${id}"`).test(dispM[1]))
      errors.push(`${id} left the universal display road — the owner's roster item stops exporting live`);
    if (!new RegExp(`${id}: "${id}"`).test(src))
      errors.push(`${id} lost its PREFAB_FAMILY entry — board copies of it bake dead again`);
  }
  // shelf claims, each in its blessed chapter (zero-overlap discipline:
  // a claimed name shelves once, and never falls to MORE)
  if (!/"Switch", "Stepper", "Input", "Dropdown", "Setrow", "Listmenu", "Joystick"/.test(cs))
    errors.push("the Playground's CHOICE CONTROLS & FIELDS chapter lost Stepper/Setrow/Listmenu");
  if (!/"EmblemBar", "Loadbar", "HealthGlobe"/.test(cs))
    errors.push("the Playground's SLIDERS & PROGRESS chapter lost Loadbar");
  if (!/"ScrollView", "Scrollbar", "Badge", "CountBadge", "Notifydot", "Avatarframe", "Pagedots", "Steps"/.test(cs))
    errors.push("the Playground's NAVIGATION & CHROME chapter lost Scrollbar/Notifydot/Pagedots/Steps");
  if (!/"Currency", "Nameplate", "Movecounter"/.test(cs))
    errors.push("the Playground's HUD & DATA chapter lost Nameplate");
  // the un-burn marks: swappable picture ink stays marked in bevel
  if (!/data-icon="row\$\{i \+ 1\}"/.test(bevelSrc))
    errors.push("the list menu's row glyphs lost their icon markers — burned into the art again");
  if (!/data-icon="badge" data-icon-nick="Badge plate"/.test(bevelSrc) || !/data-seat-rider="badge"/.test(bevelSrc))
    errors.push("the notification badge's plate/rider grammar is gone — plate baked or count orphaned");
  if (!/data-icon="ribbon" data-icon-nick="Title ribbon"/.test(bevelSrc) || !/data-seat-rider="ribbon"/.test(bevelSrc))
    errors.push("the nameplate's title ribbon lost its live plate + riding word");
}

/* FULL-CATALOG round, slice 2 pins: the RPG & MMO chapter. */
{
  const S2D = ["questpanel", "dialoguebox", "choicelist", "manarails", "xpbar", "invgrid", "partyframe", "compass", "dmgnumber", "equipslot"];
  const dispM = /const UNIVERSAL_DISPLAY = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  const interM = /const UNIVERSAL_INTERACTIVE = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  for (const id of S2D)
    if (!dispM || !new RegExp(`"${id}"`).test(dispM[1]))
      errors.push(`${id} left the universal display road — the owner's RPG roster item stops exporting live`);
  if (!interM || !/"skillnode"/.test(interM[1]))
    errors.push("skillnode left the interactive road — the skill node stops pressing in Unity");
  for (const id of [...S2D, "skillnode"])
    if (!new RegExp(`${id}: "${id}"`).test(src))
      errors.push(`${id} lost its PREFAB_FAMILY entry — board copies of it bake dead again`);
  if (!/\("RPG & MMO", new\[\] \{ "Questpanel", "Dialoguebox", "Choicelist", "Manarails", "Xpbar", "Invgrid", "Partyframe", "Skillnode", "Dmgnumber", "Equipslot" \}\)/.test(cs))
    errors.push("the Playground's RPG & MMO chapter is gone or reshuffled");
  if (!/"Minimap", "Compass"/.test(cs))
    errors.push("the compass fell off the HUD & DATA shelf");
  // the un-burn marks
  if (!/STOCK_ICONS\.flask, "mana"/.test(bevelSrc) || !/STOCK_ICONS\.zap, "stamina"/.test(bevelSrc) || !/data-icon="\$\{icName \?\? "glyph"\}"/.test(bevelSrc))
    errors.push("the mana/stamina rail glyphs lost their icon markers");
  if (!/data-icon="speaker" data-icon-nick="Speaker plate"/.test(bevelSrc) || !/rider: "speaker"/.test(bevelSrc))
    errors.push("the dialogue box's speaker plate/rider grammar is gone");
  if (!/data-icon="cell\$\{i \+ 1\}"/.test(bevelSrc) || !/data-seat-rider="count\$\{i \+ 1\}"/.test(bevelSrc))
    errors.push("the inventory grid's cell glyphs or count riders lost their markers");
  if (!/data-icon-well="\$\{pcx\.toFixed\(1\)\} \$\{cy\.toFixed\(1\)\} \$\{pr\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the party frame's portrait well marker is gone — the portrait bakes burned again");
  // the family invgrid ships ringless + the ring layer always ships full
  if (!/if \(uid === "invgrid"\) baseSvgU = baseSvgU\.replace\(\/<rect data-invring="1"\[\^>\]\*\\\/\?>\/g, ""\);/.test(src))
    errors.push("the invgrid family base bakes its selection ring again — the selection must be the live cell-ring layer");
  // SMIL discipline on the universal road (the empty-damage-number bake)
  if (!/const stripLoopsU = \(sv: string\) => sv/.test(src))
    errors.push("the universal road stopped stripping SMIL loops — spawn-fade pieces (damage number) bake EMPTY at t=0");
}

/* FULL-CATALOG round, slice 3 pins: Shooter & Action, complete. */
{
  const S3 = ["ammo", "killfeed", "magazine", "equipselector", "streakmeter", "waypoint", "capturemeter", "respawn", "weaponwheel", "crosshair", "hitmarker", "dmgarc", "buffframe", "hotbar", "lives"];
  const dispM = /const UNIVERSAL_DISPLAY = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  for (const id of S3) {
    if (!dispM || !new RegExp(`"${id}"`).test(dispM[1]))
      errors.push(`${id} left the universal display road — the shooter section stops being complete`);
    if (!new RegExp(`${id}: "${id}"`).test(src))
      errors.push(`${id} lost its PREFAB_FAMILY entry`);
  }
  if (!/\("SHOOTER & ACTION", new\[\] \{ "Crosshair", "Hitmarker", "Dmgarc", "Weaponwheel", "Equipselector", "Magazine", "Ammo", "Streakmeter", "Killfeed", "Waypoint", "Capturemeter", "Respawn", "Buffframe", "Hotbar", "Lives" \}\)/.test(cs))
    errors.push("the Playground's SHOOTER & ACTION chapter is gone or reshuffled");
  // the un-burn marks
  if (!/data-icon="weapon"/.test(bevelSrc)) errors.push("the kill feed's weapon glyph lost its marker");
  if (!/data-icon="item\$\{items\.indexOf\(it\) \+ 1\}"/.test(bevelSrc)) errors.push("the equipment selector's item glyphs lost their markers");
  if (!/data-icon="endicon" data-icon-nick="Ignition glyph"/.test(bevelSrc)) errors.push("the streak meter's ignition glyph lost its marker");
  if (!/data-icon="w\$\{i \+ 1\}"/.test(bevelSrc)) errors.push("the weapon wheel's chamber glyphs lost their markers");
  if (!/data-icon="slot\$\{i \+ 1\}"/.test(bevelSrc)) errors.push("the hotbar's slot glyphs lost their markers");
  // (lives' hearts are VALUE PIPS — deliberately unmarked, the magazine/steps stance: an all-children piece ships an empty base)
  // the IGNITE road: lit-pose emission + runtime + shared registration + wire
  if (!/iconSeatsOf\(uid, litSvg, undefined, "endicon-lit"\)/.test(src))
    errors.push("the streak meter's lit ignition pose no longer ships — ignite has nothing to swap in");
  if (!/public class StreakIgnite : MonoBehaviour/.test(src))
    errors.push("the StreakIgnite runtime is gone — the streak meter can't ignite in Unity");
  if (!/"Runtime\/PatternBreakStreakIgnite\.cs",/.test(src))
    errors.push("PatternBreakStreakIgnite.cs left the sharedScripts set — it would land per-slug OUTSIDE the runtime assembly (the IdleShine CS0246 lesson)");
  if (!/static bool StreakIgniteWire\(string dir, string root, bool quiet\)/.test(cs) || !/if \(StreakIgniteWire\(dir, root, staging\)\) any = true;/.test(cs))
    errors.push("the importer no longer wires StreakIgnite onto the Streakmeter prefab");
}

/* FULL-CATALOG round, slice 4 pins: Casual & saga + the combo's celebration. */
{
  const S4D = ["heartmeter", "energymeter", "starrating", "pathconnector", "combo", "flipclock", "stopwatch"];
  const dispM = /const UNIVERSAL_DISPLAY = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  const interM = /const UNIVERSAL_INTERACTIVE = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  for (const id of S4D)
    if (!dispM || !new RegExp(`"${id}"`).test(dispM[1]))
      errors.push(`${id} left the universal display road`);
  if (!interM || !/"booster"/.test(interM[1]))
    errors.push("booster left the interactive road — the booster button stops pressing in Unity");
  for (const id of [...S4D, "booster"])
    if (!new RegExp(`${id}: "${id}"`).test(src))
      errors.push(`${id} lost its PREFAB_FAMILY entry`);
  if (!/\("CASUAL & SAGA", new\[\] \{ "Heartmeter", "Energymeter", "Starrating", "Pathconnector", "Combo", "Booster", "Flipclock", "Stopwatch" \}\)/.test(cs))
    errors.push("the Playground's CASUAL & SAGA chapter is gone or reshuffled");
  // the meters' live icon slots (the c98eade Unity half)
  if (!/data-icon="pip\$\{i \+ 1\}"/.test(bevelSrc))
    errors.push("the heart meter's pips lost their per-pip markers — the icon slot stops reaching Unity");
  if (!/data-icon="badge" data-icon-nick="Energy badge"/.test(bevelSrc))
    errors.push("the energy meter's badge lost its marker");
  if (!/data-icon-nick="Badge plate" data-badge="1"/.test(bevelSrc) || !/data-icon-nick="Free ribbon" data-badge="1"/.test(bevelSrc))
    errors.push("the booster's badge plate/rider grammar is gone");
  // the combo's celebration: runtime + shared registration + wire
  if (!/public class ComboPop : MonoBehaviour, IPointerClickHandler/.test(src))
    errors.push("the ComboPop runtime is gone — the combo stops celebrating in Unity");
  if (!/"Runtime\/PatternBreakComboPop\.cs",/.test(src))
    errors.push("PatternBreakComboPop.cs left the sharedScripts set (the IdleShine CS0246 lesson)");
  if (!/static bool ComboPopWire\(string dir, string root, PBManifest m, bool quiet\)/.test(cs) || !/if \(ComboPopWire\(dir, root, m, staging\)\) any = true;/.test(cs))
    errors.push("the importer no longer wires ComboPop + ClaimBurst onto the Combo prefab");
  if (!/Mathf\.Lerp\(0\.82f, 1\.32f, u\)/.test(src))
    errors.push("ComboPop lost the app's own keyframes (0.82 squash → 1.32 overshoot)");
}

/* FULL-CATALOG round, slice 5 pins: Strategy & social + the Match Score. */
{
  const S5 = ["scorebug", "friendrow", "clancrest", "chatbubble", "emotewheel", "buildqueue", "unitplate", "techcard", "popmeter"];
  const dispM = /const UNIVERSAL_DISPLAY = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  for (const id of S5) {
    if (!dispM || !new RegExp(`"${id}"`).test(dispM[1]))
      errors.push(`${id} left the universal display road`);
    if (!new RegExp(`${id}: "${id}"`).test(src))
      errors.push(`${id} lost its PREFAB_FAMILY entry`);
  }
  if (!/\("STRATEGY & SOCIAL", new\[\] \{ "Scorebug", "Friendrow", "Chatbubble", "Emotewheel", "Clancrest", "Unitplate", "Buildqueue", "Techcard", "Popmeter" \}\)/.test(cs))
    errors.push("the Playground's STRATEGY & SOCIAL chapter is gone or reshuffled");
  // the Match Score's Unity half (ba34520): tintable team bars, live names
  if (!/data-icon="homebar" data-icon-nick="Home color bar" data-icon-tint="\$\{TA\}"/.test(bevelSrc)
      || !/data-icon="awaybar" data-icon-nick="Away color bar" data-icon-tint="\$\{TB\}"/.test(bevelSrc))
    errors.push("the score bug's team color bars lost their tintable markers — the ba34520 color slots stop reaching Unity");
  if (!/const tint = gs0\[gi\]\.getAttribute\("data-icon-tint"\) \|\| null;/.test(src)
      || !/if \(norm\(el\.getAttribute\("fill"\)\) === norm\(tint\)\) el\.setAttribute\("fill", "#FFFFFF"\);/.test(src))
    errors.push("the tint grammar's white cut is gone — team bars would ship colored and Unity tints would multiply muddy");
  if (!/public string tint;/.test(cs) || !/ColorUtility\.TryParseHtmlString\(ic\.tint, out tintC\)\) ii\.color = tintC;/.test(cs))
    errors.push("the importer no longer applies iconSeat tints (PBIconChild.tint / Image.color)");
  // the social marks
  if (!/data-icon="joinbtn" data-icon-btn="1"/.test(bevelSrc) || !/rider: "joinbtn"/.test(bevelSrc))
    errors.push("the friend row's JOIN capsule lost its button-plate/rider grammar");
  if (!/data-icon="emote\$\{i \+ 1\}"/.test(bevelSrc) || !/data-icon="hub" data-icon-nick="Selected emote"/.test(bevelSrc))
    errors.push("the emote wheel's sector/hub emotes lost their markers");
  if (!/data-icon="emblem" data-icon-nick="Crest emblem"/.test(bevelSrc) || !/data-icon="ribbon" data-icon-nick="Tag ribbon"/.test(bevelSrc))
    errors.push("the clan crest's emblem/ribbon grammar is gone");
  if (!/data-icon="atk" data-icon-nick="Attack glyph"/.test(bevelSrc) || !/data-icon="def" data-icon-nick="Defense glyph"/.test(bevelSrc))
    errors.push("the unit plate's stat glyphs lost their markers");
}

/* FULL-CATALOG round, slice 6 pins: the rewards completion. */
{
  const dispM = /const UNIVERSAL_DISPLAY = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  const interM = /const UNIVERSAL_INTERACTIVE = new Set<KitComponentId>\(\[([\s\S]*?)\]\);/.exec(src);
  for (const id of ["pack", "cardback", "rewardtray", "chestpanel"])
    if (!dispM || !new RegExp(`"${id}"`).test(dispM[1]))
      errors.push(`${id} left the universal display road`);
  for (const id of ["orderticket", "chest", "giftbox"])
    if (!interM || !new RegExp(`"${id}"`).test(interM[1]))
      errors.push(`${id} left the interactive road — the staged reward stops being press-ready for its release day`);
  // the 2x reward button's own-child ribbon (owner verbatim)
  if (!/data-icon="adribbon" data-icon-nick="AD x2 ribbon"/.test(bevelSrc))
    errors.push("the AD x2 angled ribbon lost its own-child marker — burned into the orange background again");
  // the variants machinery + the REWARDS chapter
  if (!/const VARIANTS: \{ uid: KitComponentId; suffix: string;/.test(src) || !/suffix: "double"/.test(src)
      || !/suffix: "legendary"/.test(src) || !/suffix: "mystery"/.test(src)
      || !/suffix: "claimed"/.test(src) || !/suffix: "locked"/.test(src))
    errors.push("the rewards state-variant emission is gone — ALL rewards states stop shelving");
  if (!/\("REWARDS", new\[\] \{ "Pack", "Cardback", "ClaimbtnDouble", "RewardcardLegendary", "RewardcardMystery", "DailycellClaimed", "DailycellLocked", "Chest", "Giftbox", "Rewardtray", "Chestpanel", "Orderticket" \}\)/.test(cs))
    errors.push("the Playground's REWARDS chapter is gone or reshuffled");
}

/* ROUND 43 pins — the r42 reviewer gate's blocker + paper cuts. */
{
  // BLOCKER: the 2x reward button is a REAL button — variant state skins,
  // dials under its family name, its own aura
  if (!/interactive: true, opts: \{ slots: \{ \.\.\.\(st\.kitSlotVals\?\.claimbtn \?\? \{\}\), mode: "2x by ad" \} \}/.test(src))
    errors.push("the 2x reward button lost its interactive variant flag — it ships as a dead click-eater again");
  if (!/\["claimbtn", "claimbtn-double"\]/.test(src))
    errors.push("claimbtn-double lost its stateFx/labelStates dials — no glow, no lift, no Button");
  if (!/"claimbtn-double",/.test(src) || !/"keycap-space", "padbtn", "padbtn-b", "padbtn-x", "padbtn-y"\]\);/.test(src))
    errors.push("claimbtn-double (or the round-44 input-prompt variants) left GLOW_FAMS — hover auras fall to the generic blob");
  // pose variants never eat clicks
  if (!/static bool PoseVariantName\(string c\) \{ return c == "rewardcard-legendary" \|\| c == "rewardcard-mystery" \|\| c == "dailycell-claimed" \|\| c == "dailycell-locked"; \}/.test(cs))
    errors.push("PoseVariantName is gone — display pose variants eat clicks their live base siblings would answer");
  // PAPER CUT 2: tint crosses the posed road
  if (!/ColorUtility\.TryParseHtmlString\(pIc\.tint, out pTintC\)\) pIi\.color = pTintC;/.test(cs))
    errors.push("the posed road no longer applies pIc.tint — the first board scorebug ships WHITE team bars");
  if (!/\.\.\.\(cut\.tint \? \{ tint: cut\.tint \} : \{\}\),/.test(src))
    errors.push("posed icon cuts no longer carry their tint into posedIcons");
  // PAPER CUT 3: the prefab-seeding ledger + quiet staging
  if (!/public string\[\] seededPrefabs; \}/.test(cs))
    errors.push("PBLock lost the seededPrefabs ledger — deleted prefabs resurrect on every import again");
  if (!/if \(ledgerP\.Contains\(name\)\) \{ skippedDeleted\+\+; continue; \}/.test(cs)
      || !/foreach \(var nmL in have\) ledgerP\.Add\(nmL\); \/\/ adopt-present/.test(cs)
      || !/static void GenerateMissingPrefabs\(string root, PBManifest m, PBLock prevLk\)/.test(cs))
    errors.push("GenerateMissingPrefabs lost the one-shot prefab ledger (skip-deleted / adopt-present / prev lock)");
  if (!/receipt\.seededPrefabs = passSeededPrefabs != null \? passSeededPrefabs : \(prev != null \? prev\.seededPrefabs : null\);/.test(cs))
    errors.push("the receipt no longer carries the prefab-seeding ledger forward");
  if (!/RunPrefabBuilders\(stage, root, m, true\);/.test(cs) || !/RunPrefabBuilders\(dir, root, m, false\);/.test(cs)
      || !/if \(!quiet\) Debug\.Log\("UI Kit Maker: the Streakmeter prefab can IGNITE/.test(cs)
      || !/if \(!quiet\) Debug\.Log\("UI Kit Maker: the Combo prefab celebrates/.test(cs))
    errors.push("the staging pass is loud again — the Combo/Streakmeter wire receipts print on every no-op import");
  // PAPER CUT 4: staged families ship no dials
  if (!/\.filter\(\(\[pid\]\) => stagedShips\(pid\)\)/.test(src))
    errors.push("the stateFx/labelStates staged filter is gone — dark families leak dials against the ships-nothing receipt");
  // PAPER CUT 5: the LTS seat road
  if (!/static void LtsWireTextSeats\(GameObject host, PBAsset row, string root, PBManifest m, float rootH\)/.test(cs)
      || !/LtsWireTextSeats\(host, row, root, m, rootH\);/.test(cs)
      || !/static TMPro\.TMP_FontAsset LtsKitFace\(string root, PBManifest m\)/.test(cs))
    errors.push("the LTS seat road is gone — the seat-worded catalog ships word-BARE on 2022.3 against the docs");
  if (!/static bool SeatRect\(RectTransform rt, PBSeat seat, TMPro\.TMP_FontAsset face, float rootH, bool inRow, float rowFy, bool apply\)/.test(cs))
    errors.push("SeatRect fell back inside the styled guard (or lost its qualified signature) — the LTS seat road can't place words");
}

/* ── ROUND 44 · S1 (parity seats — owner field round): the dialoguebox
   speaker rides the app's exact fy (the edge clamp is for FREE seats;
   a rider's plate is its own inside-the-art guarantee), kept kits heal
   the clamp-parked rider provably-ours, and the fire button's armed
   glyph sits on the app's own emitted seat instead of a hand estimate. */
{
  // 1) SeatRect: rider seats are EXEMPT from the top/bottom edge clamp
  if (!/float fyC = string\.IsNullOrEmpty\(seat\.rider\) && rootH > fs \* 1\.3f \? Mathf\.Clamp\(seat\.fy, \(fs \* 0\.62f\) \/ rootH, 1f - \(fs \* 0\.62f\) \/ rootH\) : seat\.fy;/.test(cs))
    errors.push("SeatRect's rider clamp exemption is gone — the dialoguebox speaker (and every edge-plate rider) parks ~12px off the app's seat again (round 44, item 8)");
  // 2) the adopted-rider rect heal: ONLY a word still at the old clamped
  //    spot moves (provably ours); the maker's travel stays theirs
  if (!/float fyOld9 = rootH > fsR9 \* 1\.3f \? Mathf\.Clamp\(seat\.fy, edge9, 1f - edge9\) : seat\.fy;/.test(cs)
      || !/if \(\(cur9 - oldP9\)\.sqrMagnitude < 0\.5f\) \{/.test(cs)
      || !/if \(apply\) srt\.position = hostRt9\.TransformPoint\(new Vector3\(oldP9\.x, r9\.yMin \+ \(1f - seat\.fy\) \* r9\.height \+ lift9, oldP9\.z\)\);/.test(cs))
    errors.push("the adopted-rider clamp heal is gone (or lost its provably-ours gate) — kept kits keep the speaker parked low forever, or a dev-moved rider gets re-seated (round 44, item 8)");
  // 3) the fire seat plumb: bevel stamp → manifest row → prefab + converge
  if (!/data-fireseat="\$\{cx9\.toFixed\(1\)\} \$\{\(cy9 \+ sink \+ krF \* 0\.14\)\.toFixed\(1\)\} \$\{\(icF \* \(gsA9 \+ 2 \* gpadA9\) \/ gsA9\)\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the bare dome render no longer stamps data-fireseat (center + padded glyph-sprite box) — the exact armed seat can't reach the manifest (round 44, item 15)");
  if (!/fireDx: r1\(fsM\[0\] - \(shM\[0\] \+ shM\[2\] \/ 2\)\), fireDy: r1\(fsM\[1\] - \(shM\[1\] \+ shM\[3\] \/ 2\)\), fireW: r1\(fsM\[2\]\)/.test(src))
    errors.push("the emission no longer re-speaks data-fireseat shell-center relative onto the dome row (fireDx/fireDy/fireW)");
  if (!/public PBIconChild\[\] iconSeats; public float fireDx; public float fireDy; public float fireW; public float railDx; public float railDy; public float railW; public float railH; public string labelAnchor; public string barMode; \}/.test(cs)) // round 58: barMode rides the same row
    errors.push("PBAsset lost the fireDx/fireDy/fireW (or S15 rail / S17 labelAnchor / S48 barMode) fields — JsonUtility drops them silently");
  if (!/if \(themed && rowFS != null && rowFS\.fireW > 1f\) \{/.test(cs)
      || !/wRt\.sizeDelta = new Vector2\(rowFS\.fireW, rowFS\.fireW\);/.test(cs)
      || !/wRt\.anchoredPosition \+= new Vector2\(rowFS\.fireDx, -rowFS\.fireDy\);/.test(cs))
    errors.push("FireButtonPrefab no longer seats the armed glyph on the app's emitted seat (themed + fireW-gated, heuristic fallback for old zips) — the main icon sits low again (round 44, item 15)");
  if (!/if \(oursBox && oursNudge/.test(cs) || !/wFixRt\.anchoredPosition = new Vector2\(fbSeatDx, -fbSeatDy\);/.test(cs))
    errors.push("the kept-project Weapon seat convergence is gone (or lost its ours-only gate) — field kits never pick up the exact armed seat, or a dev-moved Weapon gets clobbered");
  // S2 — Data Row arrow REMOVAL (owner decision, item 7): the trailing
  // action renders ONLY as per-copy poses; the default forward arrow is
  // gone for good (its color was uncontrollable from the app)
  if (/iconGroup\(STOCK_ICONS\.forward, 39 \+ w - 48 \* k/.test(bevelSrc))
    errors.push("the data row's default forward arrow came back — the owner removed it (round 44, item 7: color uncontrollable through the app)");
  if (!/: ov === "locked"\n\s*\? `<g data-part="icon" data-icon="action">/.test(bevelSrc))
    errors.push("the data row's posed action badges (locked/check/alert) lost their marked-group grammar — posed board copies would bake or vanish");
  if (!/No trailing arrow ships \(owner ruling\)/.test(src))
    errors.push("the data row's usage no longer states the arrow ruling — the manifest would promise a live action child that never ships");
  // S3 — the daily cell's pose badges are live children (item 6: "separate
  // the checkmark from the background"; the lock rides the same sweep)
  if (!/data-icon="claimbadge" data-icon-nick="Claimed badge"/.test(bevelSrc)
      || !/data-icon="lockbadge" data-icon-nick="Lock badge"/.test(bevelSrc))
    errors.push("the daily cell's claimed/lock badges lost their marked-ink grammar — the checkmark burns back into the background (round 44, item 6)");
  // S4 — the capture meter joins the ring rig (item 4: "mercury bleed at
  // the edge — same class as the earlier circular progress fix")
  if (!/const ringRig = uid === "ring" \|\| uid === "capturemeter";/.test(src))
    errors.push("the capture meter left the ring-rig emission — its arc bakes static (glow bleed and all) again (round 44, item 4)");
  if (!/if \(baseAsset\.component == "ring" \|\| baseAsset\.component == "capturemeter"\) \{/.test(cs)
      || !/var ringTrackSp = S\(root \+ "\/assets\/" \+ famRg \+ "\/" \+ famRg \+ "-track\.png"\);/.test(cs))
    errors.push("FamilyPrefab's ring rig no longer serves the capture meter — its prefab ships a dead bake again (round 44, item 4)");
  // the capture atoms carry NO baked glow — the bleed the owner flagged
  if (!/opts\.part === "track" \|\| opts\.part === "fill" \|\| opts\.part === "cap"/.test(bevelSrc.slice(bevelSrc.indexOf('case "capturemeter"'), bevelSrc.indexOf('case "respawn"'))))
    errors.push("the capture meter's part renders (track/fill/cap) are gone from bevel — the ring-rig emission would ship the full bake as every atom");
  // S4 — the buff frame's countdown FUNCTIONS (item 2)
  if (!/<g data-buffsweep="1"><g clip-path="url\(#\$\{fcRef\}\)">/.test(bevelSrc))
    errors.push("the buff frame's sweep lost its data-buffsweep marker — the plate can't strip it and the live rig double-draws (round 44, item 2)");
  if (!/opts\.part === "sweep" \|\| opts\.part === "sweephand" \|\| opts\.part === "sweepmask"/.test(bevelSrc))
    errors.push("the buff frame's sweep atoms (sweep/sweephand/sweepmask) are gone from bevel (round 44, item 2)");
  if (!/const buffRig = uid === "buffframe";/.test(src) || !/await addPng\(`\$\{uid\}\/plate\.png`, stripBuffSweep\(baseSvgU\), \{/.test(src))
    errors.push("the buff frame's plate/atom emission is gone — base.png must stay the byte-identical baked pose while the rig wears the sweep-less plate (round 44, item 2)");
  if (!/var bfPlate = S\(root \+ "\/assets\/buffframe\/buffframe-plate\.png"\);/.test(cs)
      || !/var bsw = go\.AddComponent<KitBuffSweep>\(\);/.test(cs)
      || !/winMask\.showMaskGraphic = false;/.test(cs))
    errors.push("FamilyPrefab's buff-sweep rig is gone (plate swap + masked window + KitBuffSweep) — the countdown burns back into the face (round 44, item 2)");
  if (!/public class KitBuffSweep : MonoBehaviour \{/.test(cs.includes("KitBuffSweep") ? cs : "") && !/const BUFF_SWEEP_RUNTIME = `using UnityEngine;/.test(src))
    errors.push("the KitBuffSweep runtime is missing");
  // the IdleShine lesson: every runtime ships SHARED or the editor
  // assembly can't resolve it (CS0246) — both registrations, always
  if (!/files\.push\(\{ path: "Runtime\/PatternBreakBuffSweep\.cs", data: BUFF_SWEEP_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakBuffSweep\.cs",/.test(src))
    errors.push("PatternBreakBuffSweep.cs must ride BOTH files.push and sharedScripts (the IdleShine CS0246 lesson)");
  if (!/var bswS = inst\.GetComponent<KitBuffSweep>\(\);/.test(cs))
    errors.push("board copies no longer strike the buff frame's staged pose (KitBuffSweep board line)");
  // S5 — the season track's RUN atom + kept-rig convergence (item 14).
  // The reproduction proved the geometry EXACT at generation (marker
  // seats to 0.2px); the real drops were the crushed mercury stand-in
  // and kept prefabs frozen at their first import.
  if (!/data-seasontrack-part="run"/.test(bevelSrc))
    errors.push("the season track's run atom left bevel — the rig squashes the 44px-bordered mercury into the rail again (round 44, item 14)");
  if (!/await addPng\("seasontrack\/run\.9\.png", shell\("seasontrack", \{ part: "run" \}\)/.test(src))
    errors.push("the run atom stopped shipping (seasontrack/run.9.png)");
  // the SeasonTrack runtime lives in its own shared file (SEASON_TRACK_
  // RUNTIME), so its pins read the TS source, not the importer template
  if (!/public Sprite runSprite;/.test(src) || !/var runSp = runSprite != null \? runSprite : fillSprite;/.test(src)
      || !/float fillH = runSprite != null \? runSprite\.rect\.size\.y \* spriteScale : spineH \* 0\.62f;/.test(src))
    errors.push("SeasonTrack no longer prefers the run atom (fillSprite crush returns) — round 44, item 14");
  if (!/c\.runSprite = S\(pre \+ "run\.9\.png"\);/.test(cs))
    errors.push("WireSeasonTrack no longer wires the run atom");
  if (!/spritePath\.EndsWith\("\/seasontrack-board\.9\.png"\)/.test(cs)
      || !/bool wantStRun = stK0\.runSprite == null && runSpK != null;/.test(cs)
      || !/bool stDefaults = Mathf\.Approximately\(stK0\.trackX0, 0\.22f\)/.test(cs))
    errors.push("the kept-rig SeasonTrack convergence is gone (run wire + defaults-only geometry) — field kits freeze at their first import forever (round 44, item 14)");
  // RIG-1 — the LINEAR CAP RIG (owner kit-wide mercury ruling; settles
  // part-1 item 10 + part-2 items 28/43): the app's bead parks on the
  // value line while the Filled crop hides beneath it
  if (!/if \(opts\.overlay === "cap"\) \{\n        const vCap = 0\.8;/.test(bevelSrc))
    errors.push("the progress/emblembar cap atom (windowed bead) left bevel — the mercury goes flat at the growing end again (round 44, item 10)");
  if (!/const wx0s = fx1s - bh - 8, wwCs = Math\.ceil\(bh \+ 16\);/.test(bevelSrc))
    errors.push("the slider cap atom left bevel");
  if (!/opts\.overlay === "fill-right" \|\| opts\.overlay === "cap-r"/.test(bevelSrc)
      || !/const capF = opts\.overlay === "cap-l" \|\| opts\.overlay === "cap-r";/.test(bevelSrc))
    errors.push("the vsbar drain beads (rounded atoms + cap windows) left bevel (round 44, item 43)");
  for (const capRow of ['"progress\\/cap.png"', '"emblembar\\/cap.png"', '"slider\\/cap.png"', '"vsbar\\/cap-l.png"', '"vsbar\\/cap-r.png"'])
    if (!new RegExp("await addPng\\(" + capRow).test(src))
      errors.push(`the ${capRow} cap atom stopped shipping`);
  if (!/public class KitBarFill : MonoBehaviour \{/.test(src)
      || !/float capW = areaH \* \(capImg\.sprite\.rect\.width \/ Mathf\.Max\(1f, capImg\.sprite\.rect\.height\)\);/.test(src)
      || !/fill\.fillAmount = Mathf\.Max\(0f, v - capFrac \* 0\.5f\);/.test(src)
      // round 58: the follow also records the width road's staged pose
      || !/if \(!Mathf\.Approximately\(fill\.fillAmount, wroteFill\)\) \{ value = Snap\(fill\.fillAmount\); Apply\(\); \}/.test(src))
    errors.push("KitBarFill lost its rig semantics (height-ratio cap, crop retreat under the bead, change-guarded fillAmount follow — the SHIPPED dev contract)");
  if (!/files\.push\(\{ path: "Runtime\/PatternBreakKitBarFill\.cs", data: KIT_BAR_FILL_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakKitBarFill\.cs",/.test(src))
    errors.push("PatternBreakKitBarFill.cs must ride BOTH files.push and sharedScripts (the IdleShine CS0246 lesson)");
  if (!/static void WireBarCap\(GameObject area, Image fImg, string root, string fam, bool fromRight, float staged\)/.test(cs)
      || !/WireBarCap\(area, fImg, root, fam, fromRight, staged\);/.test(cs)
      || !/WireBarCap\(area, fImg, root, "slider", false, 0\.62f\);/.test(cs)
      || !/WireBarCap\(area, fi, root, "vsbar", false, 0\.72f\);/.test(cs)
      || !/WireBarCap\(area, fi, root, "vsbar", true, 0\.58f\);/.test(cs))
    errors.push("the cap wiring left a bar prefab road (BuildBarFill/Slider/VsBar) — that family's mercury goes flat again");
  if (!/var kbP = pfT\.GetComponentInParent<KitBarFill>\(\);/.test(cs) || !/var kbV = vlT\.GetComponentInParent<KitBarFill>\(\);/.test(cs))
    errors.push("board copies no longer re-park the bead on their posed value (KitBarFill board lines)");
  if (!/string famBarK = spritePath\.EndsWith\("\/progress-track\.9\.png"\) \? "progress"/.test(cs)
      || !/capRigged\+\+;/.test(cs))
    errors.push("the kept-project rounded-head retrofit is gone — field bars keep the flat crop forever (round 44)");
  // RIG-2 — the CELL-METER road (items 1, 13, 33 under the mercury ruling)
  if (!/rx="\$\{Math\.min\(cellW \/ 2, bh \/ 2\)\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the segbar cells lost the mercury rounding (round 44, item 33)");
  if (!/rx="\$\{Math\.min\(cellW9 \/ 2, 11\.5 \* k\)\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the energymeter cells lost the mercury rounding (round 44)");
  if (!/const litA5 = Math\.round\(vA5 \* 3\);/.test(bevelSrc) || !/const on = i >= 3 - litA5;/.test(bevelSrc))
    errors.push("the ammo thirds meter left bevel — bars must go dark LEFT→RIGHT as ammo depletes (round 44, item 1)");
  if (!/return stampTrack\(inject\(track, bullets \+ txt\), 39 \+ 16 \* k, 23 \* k\);/.test(bevelSrc)
      || !/return stampTrack\(inject\(shell\.replace\("<svg ", '<svg data-energymeter="1" '\), inner\), cellsX, cellsW\);/.test(bevelSrc))
    errors.push("the cell meters' zone stamps left bevel — the engine scissor cannot land in the gaps");
  if (!/const cellRig = uid === "energymeter" \|\| uid === "ammo" \|\| uid === "magazine" \|\| uid === "streakmeter";/.test(src)
      || !/await addPng\(`\$\{uid\}\/lit\.png`, litSvgU, \{/.test(src))
    errors.push("the cell-rig emission (empty base + full lit, one crop group) is gone");
  if (!/public class KitCellMeter : MonoBehaviour \{/.test(src)
      || !/else if \(!fromRight\) f = Mathf\.Clamp01\(zone0 \+ \(zone1 - zone0\) \* \(L \/ \(float\)n\)\);/.test(src)
      || !/else f = Mathf\.Clamp01\(1f - \(zone0 \+ \(zone1 - zone0\) \* \(\(n - L\) \/ \(float\)n\)\)\);/.test(src))
    errors.push("KitCellMeter lost its snap semantics (gap-landing cut, mirrored for ammo)");
  if (!/files\.push\(\{ path: "Runtime\/PatternBreakCellMeter\.cs", data: CELL_METER_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakCellMeter\.cs",/.test(src))
    errors.push("PatternBreakCellMeter.cs must ride BOTH files.push and sharedScripts (the IdleShine CS0246 lesson)");
  if (!/if \(baseAsset\.component == "energymeter" \|\| baseAsset\.component == "ammo" \|\| baseAsset\.component == "lives" \|\| baseAsset\.component == "magazine" \|\| baseAsset\.component == "streakmeter"\) \{/.test(cs)
      || !/var kcmSeg = go\.AddComponent<KitCellMeter>\(\);/.test(cs)
      || !/var kcmS = inst\.GetComponent<KitCellMeter>\(\);/.test(cs)
      || !/var kcmSg = inst\.GetComponent<KitCellMeter>\(\);/.test(cs))
    errors.push("the cell-meter wiring left the importer (FamilyPrefab block / segbar snapper / board strikes)");
  if (!/cell meters stamp their zone on base\/lit rows \(no track part/.test(cs))
    errors.push("BarZone lost its base-row zone fallback — cell zones never reach the runtime");
  if (!/string famCMk = spritePath\.EndsWith\("\/segbar-base\.png"\) \? "segbar"/.test(cs))
    errors.push("the kept-project cell-meter convergence is gone — field meters keep raw cuts (or empty bases) forever");
}

/* ── ROUND 44 · S8 (the RIG-4 marked-ink wrap sweep — items 16/17/41,
   the owner's caret ruling, and the R1/R9/R11 sweep riders): every wrap
   is app-side grammar in bevel.ts; the exporter's existing hands
   (markedIconOnlySvgs / stripMarkedIcons / iconSeatsOf / rider adoption)
   do the rest. Plus the medal's live word and the paint-order insert. ── */
{
  if (!/data-icon="presence" data-icon-nick="Presence dot"/.test(bevelSrc))
    errors.push("the friendrow presence dot lost its marked wrap — the row's only green ink burns into the base again (round 44, item 16; deliberately UN-tinted: mixed ink, see the bevel comment)");
  if (!/data-icon="addcap" data-icon-btn="1"/.test(bevelSrc) || !/data-seat-rider="addcap"/.test(bevelSrc))
    errors.push("the heartmeter add cap lost its marked BUTTON wrap or its + rider — the candy knob burns into the base again (round 44, item 17 — the HEARTMETER half of the 16/17 pair)");
  if (!/data-icon="cost" data-icon-nick="Cost gem"/.test(bevelSrc))
    errors.push("the techcard cost gem lost its marked wrap (round 44, item 41 — owner: the yellow dot beside 120 un-burns)");
  if ((bevelSrc.match(/data-icon="caret" data-icon-nick="Continue caret"/g) ?? []).length < 2)
    errors.push("the dialoguebox continue caret must be marked in BOTH state branches (owner ruling, round 44: the caret IS ITS OWN LAYER)");
  if (!/data-icon="qtychip" data-icon-nick="Qty chip"/.test(bevelSrc) || !/data-seat-rider="qtychip"/.test(bevelSrc))
    errors.push("the rewardcard qty chip lost its marked plate wrap or its count rider (round 44, dossier R9 — covers the legendary variant too)");
  if (!/data-icon="medallion" data-icon-nick="Gold medallion"/.test(bevelSrc))
    errors.push("the achievetoast gold medallion lost its marked wrap — the orb burns while its glyph ships live (round 44, dossier R11)");
  if (!/const vsMedalSeats = parseTextSeats\(vsMedalFull, pieceCfg\("vsbar"\)\.type\.font\);/.test(src)
      || !/stripWordInk\(vsMedalFull\)\.svg/.test(src))
    errors.push("the vsbar medal's word must parse as a text seat and strip from the sprite — the VS burns into the medallion again (round 44, dossier R1)");
  if (!/WireTextSeats\(mgo, root, m, pngScale\);/.test(cs))
    errors.push("VsBarPrefab no longer seats the medal's VS live (WireTextSeats on the Medal child)");
  if (!/\|Medal Words/.test(cs) || !/medalWorded\+\+;/.test(cs))
    errors.push("the kept-project medal-word graft is gone (or lost its seeded-children ledger key) — field VsBars go wordless when the wordless medal sprite retextures in");
  if (!/for \(int nxI = icI \+ 1; nxI < row\.iconSeats\.Length && beforeIC == null; nxI\+\+\)/.test(cs)
      || !/if \(beforeIC == null\) beforeIC = go\.transform\.Find\("Words"\);/.test(cs))
    errors.push("WireIconChildrenRow lost the order-aware insert — a converged medallion lands OVER its glyph on kept prefabs (seat order is paint order, round 44)");
  if (/The continue arrow is anatomy/.test(src))
    errors.push("the dialoguebox usage still claims the continue arrow is anatomy — the owner overturned that (round 44 ruling)");
}

/* ── ROUND 44 · S10 (RIG-6 pilot — item 18, the hotbar's Selected ring):
   every cell rests uniform (0.85 + keyline) and the WHOLE active dress
   rides the marked ring group; the 0.8667 bridge is load-bearing —
   1−(1−0.85)(1−0.8667)=0.98, so recomposition is exact. ── */
{
  if (!/opacity="0\.85" stroke="\$\{hexRgba\(darken\(bevel, 0\.4\), 0\.6\)\}" stroke-width="1\.2" data-cell="\$\{i\}"\/>`;\s*\n\s*if \(on\) cells \+= `<g data-part="icon" data-icon="ring" data-icon-nick="Selected ring"><path d="\$\{roundRect\(cx0, yh, cell, cell, cellR\)\}" fill="\$\{wellFill\}" opacity="0\.8667"/.test(bevelSrc))
    errors.push("the hotbar's Selected-ring group (uniform 0.85 wells + the EXACT 0.8667 bridge) left bevel — the selection burns into the strip again, or the bridge drifts and recomposition breaks (round 44, item 18)");
  if ((src.match(/The Selected ring child IS the selection/g) ?? []).length < 2)
    errors.push("the hotbar usage lost the bottomnav Selected-ring wording (round 44, item 18 — the dossier's usage-rewrite gate)");
  if (!/the \*\*Hotbar\*\* carries the same \*\*Selected ring\*\*/.test(src))
    errors.push("the QuickStart ring paragraph no longer names the Hotbar (round 44, item 18)");
}

/* ── ROUND 44 · S11 (RIG-5 chassis + pagedots 24 / startlights 36):
   discrete counts become DIALS — part atoms + geometry blocks + two
   [ExecuteAlways] runtimes; both bases stay byte-identical (the
   geometry rides attributes, which never rasterize). ── */
{
  if (!/data-pagedots="\$\{\(pad0 \+ dR \* 2\)\.toFixed\(1\)\} \$\{\(H0 \/ 2\)\.toFixed\(1\)\} \$\{gap0\.toFixed\(1\)\} \$\{dR\.toFixed\(1\)\} \$\{n0\} \$\{selD\}"/.test(bevelSrc))
    errors.push("the pagedots geometry stamp (x0 cy pitch r n staged) left bevel — the rig loses its layout truth (round 44, item 24)");
  if (!/opts\.part === "dot"/.test(bevelSrc) || !/opts\.part === "knob"/.test(bevelSrc))
    errors.push("the pagedots atoms (dot/knob part branches) left bevel");
  if (!/data-pods="\$\{\(hx \+ gapP \+ podR\)\.toFixed\(1\)\} \$\{\(hy \+ housH \/ 2\)\.toFixed\(1\)\} \$\{\(podR \* 2 \+ gapP\)\.toFixed\(1\)\} \$\{podR\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the startlights pod stamp (data-pods) left bevel (round 44, item 36 — the base must stay byte-identical, so the geometry MUST ride an attribute)");
  if (!/opts\.part === "lamp"/.test(bevelSrc))
    errors.push("the startlights lamp atom branch left bevel");
  if (!/pageDots: pageDotsGeo,\s*\n\s*startLights: startLightsGeo,/.test(src))
    errors.push("the RIG-5 geometry blocks left the manifest emission");
  if (!/\[Serializable\] class PBDotsGeo \{ public float x0; public float cy; public float pitch; public float r; public int n; public int staged; public float w; public float h; \}/.test(cs)
      || !/public PBDotsGeo pageDots; public PBDotsGeo startLights;/.test(cs))
    errors.push("PBDotsGeo (or its two manifest fields) left the importer — the rigs go blind (round 44)");
  if (!/static bool PageDotsPrefab\(string dir, string root, int pngScale, PBManifest m\)/.test(cs)
      || !/static bool StartLightsPrefab\(string dir, string root, int pngScale, PBManifest m\)/.test(cs)
      || !/return PicturePrefab\(dir, root, pngScale, m, "pagedots\/pagedots-base\.png", "Pagedots", false\);/.test(cs)
      || !/return PicturePrefab\(dir, root, pngScale, m, "startlights\/startlights-base\.png", "Startlights", false\);/.test(cs))
    errors.push("a RIG-5 prefab road (or its old-zip picture fallback) left the importer (round 44)");
  if (!/"firebutton", "pagedots", "dialog", "scrollbar", "pathconnector" \}/.test(cs))
    errors.push("pagedots/dialog/pathconnector left the family-road skip set — FamilyPrefab would double-own their prefabs (round 44)");
  if (!/var pdS = inst\.GetComponent<PatternBreakPageDots>\(\);/.test(cs) || !/var slgS = inst\.GetComponent<PatternBreakStartLights>\(\);/.test(cs))
    errors.push("the RIG-5 board-pose strikes left the importer (round 44)");
  if (!/rig\.litCount = 0;/.test(cs))
    errors.push("the StartLights prefab no longer rests at LIGHTS OUT — the dossier forbids defaulting the demo 3 (round 44, item 36)");
  if (!/caption\.text == readyWord \|\| caption\.text == goWord/.test(src))
    errors.push("the StartLights caption rewrite lost its ours-only gate — a retyped caption would be clobbered (round 44)");
  if (!/files\.push\(\{ path: "Runtime\/PatternBreakPageDots\.cs", data: PAGE_DOTS_RUNTIME \}\);/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakStartLights\.cs", data: START_LIGHTS_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakPageDots\.cs", "Runtime\/PatternBreakStartLights\.cs",/.test(src))
    errors.push("PatternBreakPageDots/StartLights must ride BOTH files.push AND sharedScripts (the IdleShine CS0246 lesson)");
}

/* ── ROUND 44 · S12 (RIG-1 riders batch 1 — loadbar 19 / popmeter 27 /
   respawn 30 / buildqueue): the mercury is MARKED ink (data-barfill),
   the base bakes trackified, and fill/cap atoms ride KitBarFill on the
   base row's extended data-track band. ── */
{
  if (!/function stampTrack\(svg: string, x: number, w: number, y\?: number, h\?: number\): string/.test(bevelSrc))
    errors.push("stampTrack lost the optional vertical band (round 44 — bars off the shell centerline need y/h)");
  if ((bevelSrc.match(/data-barfill="/g) ?? []).length < 4)
    errors.push("the four display bars' mercury marks (data-barfill) left bevel — the un-burn loses its ink map (round 44, items 19/27/30 + buildqueue)");
  if (!/const nearCap = opts\.part === "fill" \? false : vP0 > 0\.9;/.test(bevelSrc))
    errors.push("popmeter's fill atom lost its CALM gate — a red-baked run would alarm at every value (round 44, item 27)");
  if (!/return barH9 > 0\.5 \? stampTrack\(outR9, barX9 \+ gR9, barW9 - gR9 \* 2, barY9 \+ gR9, mHR9\) : outR9;/.test(bevelSrc))
    errors.push("respawn's conditional zone stamp left bevel — Barheight Hidden must ship no zone (round 44, item 30)");
  if (!/function barFillOnlySvg\(/.test(src) || !/function stripBarFill\(/.test(src))
    errors.push("the RIG-1 bar un-burn hands (barFillOnlySvg/stripBarFill) left the exporter");
  if (!/const barRigU = uid === "loadbar" \|\| uid === "popmeter" \|\| uid === "respawn" \|\| uid === "buildqueue" \|\| uid === "xpbar" \|\| uid === "unitplate" \|\| uid === "questpanel" \|\| uid === "setrow" \|\| uid === "orderticket" \|\| uid === "vitalbar";/.test(src))
    errors.push("the display-bar rig gate left the universal loop (eight families incl. xpbar/unitplate/questpanel/setrow)");
  if (!/tzy \+ riseDyT/.test(src))
    errors.push("the track band lost its riseDy correction — the zone would seat a full extrusion headroom too high (round 44 field lesson)");
  if (!/track\?: \{ x: number; w: number; y\?: number; h\?: number \} \| null;/.test(src))
    errors.push("AssetMeta.track lost the optional vertical band");
  if (!/float bandCy = -1f;/.test(cs) || !/float topGap = bandCy - fillH \* 0\.5f, botGap = trackH - bandCy - fillH \* 0\.5f;/.test(cs))
    errors.push("BuildBarFill lost the vertical-band seat (round 44) — off-centerline bars would center mid-shell");
  if (!/if \(baseAsset\.component == "loadbar" \|\| baseAsset\.component == "popmeter" \|\| baseAsset\.component == "respawn" \|\| baseAsset\.component == "buildqueue" \|\| baseAsset\.component == "xpbar" \|\| baseAsset\.component == "unitplate" \|\| baseAsset\.component == "questpanel" \|\| baseAsset\.component == "setrow" \|\| baseAsset\.component == "orderticket" \|\| baseAsset\.component == "vitalbar"\)/.test(cs)
      || !/string famDB = spritePath\.EndsWith\("\/loadbar-base\.png"\) \? "loadbar"/.test(cs))
    errors.push("the display bars' FamilyPrefab wiring or kept-project Fill graft left the importer (round 44)");
  const liveArtSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/ui/LiveArt.tsx"), "utf8");
  if (!/track\.length < 2 \|\| !track\[1\]/.test(liveArtSrc))
    errors.push("LiveArt's track scrub must tolerate 4-number stamps (round 44) — a strict length===2 check kills pointer scrubbing on banded bars");
}

/* ── ROUND 44 · S13 (owner: "make sure key space is in the unity output
   as well as Pad A, Pad B, etc"): the input-prompt variants — SPACE bar
   + gamepad A/B/X/Y as pressing labeled families; the pad ring is live
   tintable ink, never fixed trade-dress art. ── */
{
  if (!/data-icon="ring" data-icon-tint="\$\{ringC8\}" data-icon-nick="Prompt ring"/.test(bevelSrc))
    errors.push("the padbtn prompt ring lost its tintable mark — the ring burns back into the cap (round 44)");
  if (!/\{ fam: "keycap-space", baseId: "keycap", word: "SPACE",/.test(src)
      || !/\{ fam: "padbtn", baseId: "padbtn", word: "A",/.test(src)
      || !/\{ fam: "padbtn-y", baseId: "padbtn", word: "Y",/.test(src))
    errors.push("the PROMPTS variant emission (keycap-space + the four pads) left the exporter (round 44, owner ask)");
  if (!/const ghostPV = \(c: GenConfig\) => \{ c\.transparency\.content = 0; \};/.test(src))
    errors.push("the prompt bakes lost the ghosted-geometry render — the letters would burn into the caps (round 44)");
  if (!/if \(id === "keycap" \|\| id === "padbtn"\) \{/.test(src))
    errors.push("padbtn left the labelSeatOf road — its letter would seat by guesswork (round 44)");
  if (!/"Keycap", "KeycapSpace", "Padbtn", "PadbtnB", "PadbtnX", "PadbtnY", "Pricebtn"/.test(cs))
    errors.push("the Playground BUTTONS chapter no longer shelves the input prompts (round 44, owner ask)");
  if (!/"dropdown", "keycap-space", "padbtn", "padbtn-b", "padbtn-x", "padbtn-y" \};/.test(cs))
    errors.push("SeededFamilies lost the prompt variants — retyped letters would be clobbered by the word seed (round 44)");
  if (!/\["keycap", "keycap-space"\], \["padbtn", "padbtn"\],/.test(src))
    errors.push("the prompt variants lost their stateFx dial rows — no glow, no lift, no Button (round 44)");
}

/* ── ROUND 44 · S14 (owner verbatim: "also quest complete fully wired"):
   the DIALOG ships as a real usable modal — live title, deletable body
   placeholder, and BOTH CTAs as genuine pressing Buttons on fixed-canvas
   Sprite Swap skins with their words riding them. ── */
{
  if (!/data-dialogcta="\$\{primaryB \? 1 : 2\}"/.test(bevelSrc) || !/data-seat-rider="\$\{primaryB \? "cta1" : "cta2"\}"/.test(bevelSrc))
    errors.push("the dialog CTAs lost their strip mark or rider words — the capsules burn back into the frame (round 44, owner ask)");
  if (!/data-icon="placeholder" data-icon-nick="Body placeholder"/.test(bevelSrc))
    errors.push("the dialog's body placeholder lost its marked wrap — devs can't clear the well in one stroke (round 44)");
  if (!/opts\.overlay === "cta1" \|\| opts\.overlay === "cta2"/.test(bevelSrc) || !/data-dialogctas="\$\{bx0\.toFixed\(1\)\} \$\{btnY\.toFixed\(1\)\} \$\{btnW\.toFixed\(1\)\} \$\{btnH\.toFixed\(1\)\} \$\{btnGap\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the dialog CTA atoms (fixed-canvas overlays + the seat stamp) left bevel (round 44)");
  if (!/if \(shipProp\("dialog"\)\) \{/.test(src) || !/await addPng\("dialog\/base\.png", baseD, \{/.test(src))
    errors.push("the dialog emission left the exporter — the #1 modal ships nothing again (round 44, owner ask)");
  if (!/static bool DialogPrefab\(string dir, string root, int pngScale, PBManifest m\)/.test(cs)
      || !/btD\.transition = Selectable\.Transition\.SpriteSwap;/.test(cs)
      || !/if \(DialogPrefab\(dir, root, pngScale, m\)\) any = true;/.test(cs))
    errors.push("DialogPrefab (or its Sprite Swap upgrade / build call) left the importer (round 44)");
  if (!/"Panel", "Dialog", "DataRow"/.test(cs))
    errors.push("the Dialog left the Playground NAVIGATION & CHROME chapter (round 44)");
}

/* ── ROUND 44 · S15 (RIG-1 riders batch 2 — xpbar 45 / manarails 21):
   xpbar joins the five-family universal bar rig (notch-aware mercury +
   Level-knob child with its rider number); manarails rides as TWIN
   coupled KitBarFills seated by railDx geometry, stamina counter-moving
   mana by the app's own law. ── */
{
  if (!/data-icon="knob" data-icon-nick="Level knob"/.test(bevelSrc) || !/data-seat-rider="knob"/.test(bevelSrc))
    errors.push("xpbar's Level knob lost its marked wrap or rider number — the level burns back into the bar (round 44, item 45)");
  if (!/const atomsMR = opts\.part === "fill";/.test(bevelSrc) || !/data-barfill-name="\$\{icName \?\? "rail"\}"/.test(bevelSrc))
    errors.push("manarails lost its atom force-full gate or named mercury marks — the twin rails can't be cut (round 44, item 21)");
  if (!/let railsOut:/.test(src) || !/function barFillGroups\(/.test(src))
    errors.push("the named-rail compute road (barFillGroups/railsOut) left the exporter (round 44, item 21)");
  if (!/ringV: rl\.staged, railDx: rl\.dx, railDy: rl\.dy, railW: rl\.w9, railH: rl\.h9,/.test(src))
    errors.push("the per-rail fill rows lost their staged value or shell-center rail geometry (round 44, item 21)");
  if (!/static void WireManaRails\(GameObject go, Sprite baseSp, PBAsset baseRow, string root, int pngScale, PBManifest m\)/.test(cs)
      || !/if \(baseAsset\.component == "manarails"\) WireManaRails\(go, baseSp, baseAsset, root, pngScale, m\);/.test(cs))
    errors.push("WireManaRails (or its FamilyPrefab call) left the importer — the twin rails ship baked (round 44, item 21)");
  if (!/stK9\.SetValue\(Mathf\.Clamp01\(0\.15f \+ \(1f - vMn9\) \* 0\.7f\)\);/.test(cs))
    errors.push("the manarails board strike lost the stamina coupling — boards would pose only one rail (round 44, item 21)");
  if (!/spritePath\.EndsWith\("\/xpbar-base\.png"\) \? "xpbar"/.test(cs)
      || !/fPrev\.file == "assets\/manarails\/manarails-fill-mana\.png"/.test(cs))
    errors.push("the kept-project grafts (xpbar Fill / manarails twin-rail era gate) left the importer (round 44)");
}

/* ── ROUND 44 · S16 (RIG-1 riders batch 3 — unitplate 42 / partyframe 25):
   the unit plate's HP mercury joins the six-family universal rig (with
   the board value strike the dossier flagged — plates on posed boards
   must land on their value, never render empty); the party frame's twin
   HP/MP rails ride the generalized named-rail road with the level knob
   un-burned and its "12" riding live. ── */
{
  if (!/const atomsUP = opts\.part === "fill";/.test(bevelSrc) || !/stampTrack\(inject\(shell\.replace\("<svg ", '<svg data-unitplate="1" '\), parts\), tx0 \+ gU, txw - gU \* 2, railY \+ gU, mHU\)/.test(bevelSrc))
    errors.push("unitplate lost its atom force-full gate or banded track stamp — the plate's HP can't rig (round 44, item 42)");
  if (!/const atomsPF = opts\.part === "fill";/.test(bevelSrc) || !/data-barfill-name="\$\{nm9\}"/.test(bevelSrc))
    errors.push("partyframe lost its atom force-full gate or named HP/MP mercury marks (round 44, item 25)");
  if (!/data-seat-rider="knob">12<\/text>/.test(bevelSrc))
    errors.push("partyframe's level number no longer rides the knob — the 12 burns back beside a live bubble (round 44, item 25)");
  if (!/partyframe: \{ primary: "hp", rest: 0\.78, couple: \(v\) => 0\.25 \+ \(1 - v\) \* 0\.5 \},/.test(src))
    errors.push("the named-rail family table lost partyframe (or its coupling law) — the twin rails can't stage the app's pose (round 44, item 25)");
  if (!/static void WireNamedRails\(GameObject go, Sprite baseSp, PBAsset baseRow, string root, int pngScale, PBManifest m, string fam, string\[\] rails, string\[\] nices\)/.test(cs)
      || !/WireNamedRails\(go, baseSp, baseAsset, root, pngScale, m, "partyframe", new string\[\] \{ "hp", "mp" \}, new string\[\] \{ "HP", "MP" \}\);/.test(cs))
    errors.push("WireNamedRails (or partyframe's FamilyPrefab call) left the importer — the HP/MP rails ship baked (round 44, item 25)");
  if (!/it\.component == "unitplate" \|\| /.test(cs))
    errors.push("unitplate left the board value strike — posed plates would render an EMPTY rail (round 44, item 42, the dossier's silent regression)");
  if (!/mpK9\.SetValue\(Mathf\.Clamp01\(0\.25f \+ \(1f - vHp9\) \* 0\.5f\)\);/.test(cs))
    errors.push("the partyframe board strike lost the MP coupling — boards would pose only one rail (round 44, item 25)");
  if (!/spritePath\.EndsWith\("\/unitplate-base\.png"\) \? "unitplate"/.test(cs)
      || !/fPrev\.file == "assets\/partyframe\/partyframe-fill-hp\.png"/.test(cs))
    errors.push("the kept-project grafts (unitplate Fill / partyframe twin-rail era gate) left the importer (round 44)");
}

/* ── ROUND 44 · S17 (questpanel, item 29's three fixes): the title's
   START-anchored seat ships honestly (labelAnchor road — every other
   labeled family stays middle, byte-still); each objective pip un-burns
   as a live child with three shipped looks; the footer mercury joins
   the universal rig and the ONE rig learns the family's whole-objectives
   law (snapSteps, zero-gated). ── */
{
  if (!/data-icon="pip\$\{i \+ 1\}" \$\{pipBox\} data-icon-nick="Objective \$\{i \+ 1\} pip"/.test(bevelSrc)
      || !/data-icon-box="\$\{\(x0 \+ pipR - pipBoxH\)\.toFixed\(1\)\}/.test(bevelSrc))
    errors.push("the quest tracker's pips lost their marked wraps or shared crop frame — rows can't toggle cleanly in the Inspector (round 44, item 29b)");
  if (!/data-icon-box"\)\?\.split\(" "\)\.map\(Number\) \?\? null,/.test(src) || !/bx = mk\.box\[0\]; by = mk\.box\[1\] \+ riseDy; bw9 = mk\.box\[2\]; bh9 = mk\.box\[3\];/.test(src))
    errors.push("the fixed-frame icon crop (data-icon-box) left the cut road — look swaps would distort (round 44, item 29b)");
  if (!/stampTrack\(inject\(shell\.replace\("<svg ", '<svg data-questpanel="1" '\), inner\), x0 \+ gQ, fw - gQ \* 2, fy \+ gQ, mHQ\)/.test(bevelSrc))
    errors.push("questpanel's banded track stamp left bevel — the footer rig can't seat (round 44, item 29c)");
  if (!/taU === "start" \? \{ labelAnchor: "start" \}/.test(src))
    errors.push("the label-anchor parse left the universal loop — the quest title's LEFT EDGE ships as its center again (round 44, item 29a)");
  if (!/\["pip-done", "pip1", 1,/.test(src) || !/\["pip-empty", "pip2", 0,/.test(src))
    errors.push("the pip LOOK atoms left the exporter — devs can seat pips but not toggle their state (round 44, item 29b)");
  if (!/public int snapSteps = 0;/.test(src) || !/float Snap\(float v\) \{ v = Mathf\.Clamp01\(v\); return snapSteps > 0 \? Mathf\.Round\(v \* snapSteps\) \/ snapSteps : v; \}/.test(src))
    errors.push("KitBarFill lost the zero-gated snapSteps law — the quest footer would fill mid-objective (round 44, item 29c)");
  if (!/kbQ3\.snapSteps = 3; kbQ3\.SetValue\(stagedB4\);/.test(cs) || !/kbQG\.snapSteps = 3; kbQG\.SetValue\(stagedDB\);/.test(cs))
    errors.push("questpanel's snap wiring (fresh build or kept graft) left the importer (round 44, item 29c)");
  if (!/if \(row\.labelAnchor == "start" && row\.shell != null && row\.shell\.w > 2f\) v\.x \+= row\.shell\.w \* 0\.5f \/ sp\.rect\.width;/.test(cs))
    errors.push("LabelSeatShift lost the start-anchor slide — the labelAnchor field ships but seats nothing (round 44, item 29a)");
  if (!/static void AlignLabelStart\(GameObject labelRoot, PBAsset row\)/.test(cs)
      || !/lrowA != null && lrowA\.labelAnchor == "start" \? TextAnchor\.MiddleLeft : TextAnchor\.MiddleCenter;/.test(cs))
    errors.push("the start-anchored word's left pin left a label rung (TMP, baked, or legacy) — the seat slides but the word still centers (round 44, item 29a)");
}

/* ── ROUND 44 · S18 (setrow, item 34 — RIG-1 mini rig + RIG-7 wired
   control): the settings row's mercury joins the universal rig (eighth
   family), the candy knob un-burns on a strip-only mark as the mini
   Slider's HANDLE, and the row ships as a REAL Unity Slider. ── */
{
  if (!/const atomsSR = opts\.part === "fill";/.test(bevelSrc) || !/<g data-setrow-knob="\$\{\(trX \+ trW \* vS0\)\.toFixed\(1\)\} \$\{cy\.toFixed\(1\)\} \$\{\(20 \* k\)\.toFixed\(1\)\}">/.test(bevelSrc))
    errors.push("setrow lost its atom force-full gate or center-stamped knob mark — the mini slider can't un-burn true (round 44, item 34)");
  if (!/stampTrack\(inject\(shell\.replace\("<svg ", '<svg data-setrow="1" '\), parts\), trX, trW, cy - mHR \/ 2, mHR\)/.test(bevelSrc))
    errors.push("setrow's banded track stamp left bevel — the rig can't seat (and the app's well-frame scrub must keep x/w) (round 44, item 34)");
  if (!/let knobSvgSR: string \| null = null;/.test(src) || !/querySelectorAll\("\[data-setrow-knob\]"\)/.test(src))
    errors.push("the setrow knob cut/strip left the exporter — the handle sprite can't ship (round 44, item 34)");
  if (!/static void WireSetrowSlider\(GameObject go, string root, PBManifest m, int pngScale\)/.test(cs)
      || !/if \(famB4 == "setrow"\) WireSetrowSlider\(go, root, m, pngScale\);/.test(cs))
    errors.push("WireSetrowSlider (or its FamilyPrefab call) left the importer — the row ships display-only again (round 44, item 34)");
  if (!/slSR\.fillRect = fillSR as RectTransform;/.test(cs) || !/hiSR\.preserveAspect = true;/.test(cs))
    errors.push("the setrow Slider lost its fill wiring or the round-handle guard (round 44, item 34)");
  if (!/it\.component == "setrow"\) && it\.value > 0f/.test(cs) === false && !/if \(it\.component == "setrow" && it\.value > 0f\)/.test(cs))
    errors.push("setrow left the board value strike — posed rows would ignore their board value (round 44, item 34)");
  if (!/spritePath\.EndsWith\("\/setrow-base\.png"\) \? "setrow" : null;/.test(cs)
      || !/if \(famDB == "setrow"\) WireSetrowSlider\(contentsDB, root, m, m != null && m\.pngScale > 0 \? m\.pngScale : 2\);/.test(cs))
    errors.push("the kept-project setrow graft (fill rig + Slider) left the importer (round 44, item 34)");
}

/* ── ROUND 44 · S19 (scrollbar, item 32 — RIG-7): the display strip
   becomes a real UnityEngine.UI.Scrollbar — thumb-suppressed track.9
   (arrows in the caps) + thumb.9, Sliding Area from the crop-normalized
   lane, BottomToTop with the app's rest mirrored. The base row keeps
   shipping byte-identical as the kept-projects' legacy sheet. ── */
{
  if (!/<g data-sbthumb="\$\{\(tx0 - trackW \/ 2 \+ 1\.5\)\.toFixed\(1\)\} \$\{thumbY\.toFixed\(1\)\}/.test(bevelSrc)
      || !/data-sbgeo="\$\{\(tx0 - trackW \/ 2\)\.toFixed\(1\)\} \$\{ty0\.toFixed\(1\)\} \$\{trackW\.toFixed\(1\)\} \$\{th0\.toFixed\(1\)\} \$\{thumbH\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the scrollbar's thumb mark or geometry stamp left bevel — the wired road can't cut (round 44, item 32)");
  if (!/querySelectorAll\("\[data-sbthumb\]"\)/.test(src) || !/await addPng\(`\$\{uid\}\/track\.9\.png`, trackSvgB, \{/.test(src) || !/await addPng\(`\$\{uid\}\/thumb\.9\.png`, thumbSvgB, \{/.test(src))
    errors.push("the scrollbar track/thumb emission left the exporter (round 44, item 32)");
  if (!/static bool ScrollbarPrefab\(string dir, string root, int pngScale, PBManifest m\)/.test(cs)
      || !/if \(ScrollbarPrefab\(dir, root, pngScale, m\)\) any = true;/.test(cs))
    errors.push("ScrollbarPrefab (or its build call) left the importer — the strip ships display-only again (round 44, item 32)");
  if (!/bar\.direction = Scrollbar\.Direction\.BottomToTop;/.test(cs) || !/bar\.value = 1f - restSB;/.test(cs))
    errors.push("the Scrollbar lost its direction or the top-measured rest mirror (round 44, item 32)");
  if (!/static void HealScrollbar\(string root, PBManifest m\)/.test(cs) || !/HealScrollbar\(root, manifest\);/.test(cs))
    errors.push("the kept-project Scrollbar heal left the importer — display-era prefabs would never upgrade (round 44, item 32)");
  if (!/if \(it\.component == "scrollbar" && it\.value > 0f\)/.test(cs) || !/sbB9\.value = 1f - Mathf\.Clamp01\(it\.value\);/.test(cs))
    errors.push("scrollbar left the board value strike (round 44, item 32)");
}

/* ── ROUND 44 · S20 (stepper, item 37 — RIG-2 + RIG-4 + RIG-7): base
   re-bakes with empty cells, the lit strip + snapper go live, both caps
   become REAL Buttons on stamped fixed frames with their +/− glyphs
   riding as words, and KitStepper steps the meter from their clicks. ── */
{
  if (!/data-stepcap="minus \$\{minusX\.toFixed\(1\)\}/.test(bevelSrc) || !/data-stepcap="plus \$\{plusX\.toFixed\(1\)\}/.test(bevelSrc))
    errors.push("the stepper caps lost their stamped marks — the Buttons can't cut (round 44, item 37)");
  if (!/data-seat-rider="minus">−<\/text>/.test(bevelSrc) || !/data-seat-rider="plus">\+<\/text>/.test(bevelSrc))
    errors.push("the stepper's +/− glyphs no longer ride their caps as live words (round 44, item 37)");
  if (!/stampTrack\(inject\(shell\.replace\("<svg ", '<svg data-stepper="1" '\), inner\), cellsX, cellsW, cy - 13 \* k, 26 \* k\)/.test(bevelSrc))
    errors.push("the stepper's cell-run stamp left bevel — the snapper can't seat (round 44, item 37)");
  if (!/let stepperOut:/.test(src) || !/querySelectorAll\("\[data-stepcap\]"\)/.test(src))
    errors.push("the stepper cut/strip road left the exporter (round 44, item 37)");
  if (!/const KIT_STEPPER_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakKitStepper\.cs", data: KIT_STEPPER_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakKitStepper\.cs",/.test(src))
    errors.push("KitStepper's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 44, item 37)");
  if (!/static void WireStepper\(GameObject go, Sprite baseSp, PBAsset baseRow, string root, int pngScale, PBManifest m\)/.test(cs)
      || !/if \(baseAsset\.component == "stepper"\) WireStepper\(go, baseSp, baseAsset, root, pngScale, m\);/.test(cs))
    errors.push("WireStepper (or its FamilyPrefab call) left the importer — the stepper ships display-only again (round 44, item 37)");
  if (!/UnityEditor\.Events\.UnityEventTools\.AddPersistentListener\(btnP\.onClick, ksST\.StepUp\);/.test(cs)
      || !/UnityEditor\.Events\.UnityEventTools\.AddPersistentListener\(btnM\.onClick, ksST\.StepDown\);/.test(cs))
    errors.push("the cap Buttons lost their click wiring — pressing would do nothing (round 44, item 37)");
  if (!/if \(it\.component == "stepper" && it\.value > 0f\)/.test(cs))
    errors.push("stepper left the board value strike (round 44, item 37)");
  if (!/fPrev\.file == "assets\/stepper\/stepper-lit\.png"/.test(cs))
    errors.push("the kept-project stepper graft era gate left the importer (round 44, item 37)");
}

/* ── ROUND 44 · S21 (the RIG-6 selection sweep — R2 listmenu, R3
   choicelist, R4 leaderboard, R5 equipselector): every baked selection
   dress becomes a live child; the choicelist's active capsule rides an
   EXACT color-solved bridge; the leaderboard's gold band leaves the
   nine-slice stretch region; the equipselector's chevrons become real
   Buttons. ── */
{
  if (!/data-icon-nick="Row highlight"/.test(bevelSrc))
    errors.push("the list menu's active-row bar lost its mark (round 44, R2)");
  if (!/const bridge9 = \(a0: number, a1: number, w0: number\) => \{/.test(bevelSrc) || !/data-icon-nick="Choice highlight"/.test(bevelSrc))
    errors.push("the choicelist's exact bridge overlay left bevel — the active capsule burns back (round 44, R3)");
  if (!/data-icon-nick="Your-row highlight"/.test(bevelSrc) || !/data-icon-nick="Legend dashes"/.test(bevelSrc))
    errors.push("the leaderboard's gold band or legend pills lost their marks (round 44, R4)");
  if (!/data-icon="prev" data-icon-btn="1" data-icon-nick="Previous button"/.test(bevelSrc) || !/data-icon="next" data-icon-btn="1" data-icon-nick="Next button"/.test(bevelSrc) || !/data-icon-nick="Armed ring"/.test(bevelSrc))
    errors.push("the equipselector's chevron Buttons or armed ring lost their marks (round 44, R5)");
  if (!/const lbSeats = await iconSeatsOf\("leaderboard", lbSvg\);/.test(src) || !/const lbOut = lbSeats \? stripMarkedIcons\(lbSvg\)\.svg : lbSvg;/.test(src))
    errors.push("the leaderboard emission no longer strips its marked children — the band stays inside the stretch zone (round 44, R4)");
}

/* ── ROUND 44 · S22 (R6 lives + R7 compass): the hearts become a
   drivable cell meter on the lit-overlay road (count from the row's own
   railW), and the compass heading caret un-burns to a live child. ── */
{
  if (!/data-icon="caret" data-icon-nick="Heading caret"/.test(bevelSrc))
    errors.push("the compass caret lost its mark (round 44, R7)");
  if (!/let livesOut: \{ lit: string; staged: number; n: number \} \| null = null;/.test(src) || !/aria-label="lives: \(\\d\+\) of \(\\d\+\)"/.test(src))
    errors.push("the lives lit-overlay road left the exporter (round 44, R6)");
  if (!/baseAsset\.component == "energymeter" \|\| baseAsset\.component == "ammo" \|\| baseAsset\.component == "lives" \|\| baseAsset\.component == "magazine" \|\| baseAsset\.component == "streakmeter"/.test(cs)
      || !/if \(famCM == "lives" && litRowCM != null && litRowCM\.railW > 0\.5f\) kcm\.cells = Mathf\.RoundToInt\(litRowCM\.railW\);/.test(cs))
    errors.push("lives left the cell-meter wiring (or its railW heart count) (round 44, R6)");
  if (!/spritePath\.EndsWith\("\/lives-base\.png"\) \? "lives" : null;/.test(cs))
    errors.push("lives left the kept-project cell graft chain (round 44, R6)");
}

/* ── ROUND 44 · S23 (item 35 — starrating): the three stars, the
   celebration flare and the Replay button are LIVE children on ONE
   shared frame; the two star LOOKS ship as atoms; PatternBreakStarRating
   makes the score a dial (celebration + replay only at full marks). ── */
{
  if (!/data-icon="star\$\{i \+ 1\}" \$\{sBox\} data-icon-nick="Star \$\{i \+ 1\}"/.test(bevelSrc)
      || !/data-icon="flare" data-icon-nick="Celebration flare"/.test(bevelSrc)
      || !/data-icon="replay" data-icon-btn="1" data-icon-nick="Replay button"/.test(bevelSrc))
    errors.push("the starrating marks left bevel — stars/flare/replay burn back (round 44, item 35)");
  if (!/\["star-earned", 1, /.test(src) || !/\["star-unearned", 0, /.test(src))
    errors.push("the star LOOK atoms left the exporter (round 44, item 35)");
  if (!/const STAR_RATING_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakStarRating\.cs", data: STAR_RATING_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakStarRating\.cs",/.test(src))
    errors.push("StarRating's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 44, item 35)");
  if (!/if \(baseAsset\.component == "starrating"\) \{/.test(cs)
      || !/rigSR\.stars = unRowSR != null && unRowSR\.ringV > 0f \? Mathf\.RoundToInt\(Mathf\.Clamp01\(unRowSR\.ringV\) \* 3f\) : 3;/.test(cs))
    errors.push("the StarRating prefab wiring (or its staged-score rest) left the importer (round 44, item 35)");
  if (!/inst\.GetComponent<PatternBreakStarRating>\(\);/.test(cs))
    errors.push("starrating left the board value strike (round 44, item 35)");
}

/* ── ROUND 44 · S24 (items 20 + 40 — magazine + streakmeter cells join
   the cell-meter road): base rests all-dark, the Lit strip lights whole
   cells by the zone stamp; the streak's ONE dial (StreakIgnite) drives
   cells + ignition together. ── */
{
  if (!/data-magazine="1" role="img" aria-label="magazine \$\{Math\.round\(vM9 \* cap\)\} of \$\{cap\}"><g opacity="\$\{state === "disabled" \? 0\.4 : 1\}">\$\{pips\}<\/g><\/svg>`, padM, nM \* pipW \+ \(nM - 1\) \* gapM2\)/.test(bevelSrc))
    errors.push("the magazine's pip-run stamp left bevel — the snapper can't seat (round 44, item 20)");
  if (!/inject\(shell\.replace\("<svg ", '<svg data-streakmeter="1" '\), inner\), cellsX, cellsW\)/.test(bevelSrc))
    errors.push("the streakmeter's cell-run stamp left bevel (round 44, item 40)");
  if (!/rx="\$\{Math\.min\(cellW9 \/ 2, 12 \* k\)\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the streakmeter cells lost the mercury rounding (round 44, item 40)");
  if (!/uid === "energymeter" \|\| uid === "ammo" \|\| uid === "magazine" \|\| uid === "streakmeter"/.test(src))
    errors.push("magazine/streakmeter left the cell-rig emission (round 44, items 20 + 40)");
  if (!/public KitCellMeter cells;/.test(src) || !/if \(cells != null && \(force \|\| !Mathf\.Approximately\(fwd, value\)\)\) \{ fwd = value; cells\.SetValue\(value\); \}/.test(src))
    errors.push("StreakIgnite lost its one-dial cell forward (round 44, item 40)");
  if (!/if \(kcmSI != null\) \{ rig\.cells = kcmSI; rig\.value = kcmSI\.value; \}/.test(cs))
    errors.push("StreakIgniteWire no longer links the cell meter (round 44, item 40)");
  if (!/var sigS = inst\.GetComponent<StreakIgnite>\(\);/.test(cs))
    errors.push("the streak meter left the board value strike (round 44, item 40)");
}

/* ── ROUND 44 · S25 (item 11 — emotewheel): the wheel rests UNIFORM, the
   armed dress is a MARKED full-disc wedge (parked by rotation), every
   emote ships ghost+lit looks on one fixed frame, and the pick is a dial
   (PatternBreakEmoteWheel). ── */
{
  if (!/data-icon="armed" data-icon-box="\$\{\(cE - rE\)\.toFixed\(1\)\}/.test(bevelSrc)
      || !/data-icon="emote\$\{i \+ 1\}" data-icon-box=/.test(bevelSrc)
      || !/data-wheelstage="\$\{nE9\} \$\{selE9\}"/.test(bevelSrc))
    errors.push("the emotewheel marks (armed dress / fixed emote frames / stage stamp) left bevel (round 44, item 11)");
  if (!/`\$\{uid\}\/emote\$\{i \+ 1\}-lit\.png`/.test(src) || !/`\$\{uid\}\/emote\$\{i \+ 1\}-ghost\.png`/.test(src))
    errors.push("the emote look atoms left the exporter (round 44, item 11)");
  if (!/const EMOTE_WHEEL_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakEmoteWheel\.cs", data: EMOTE_WHEEL_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakEmoteWheel\.cs",/.test(src))
    errors.push("EmoteWheel's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 44, item 11)");
  if (!/if \(baseAsset\.component == "emotewheel"\) \{/.test(cs)
      || !/rigEW\.baseSector = baseSecEW;/.test(cs)
      || !/if \(rigEW\.hub != null\) rigEW\.hubRest = rigEW\.hub\.sprite;/.test(cs))
    errors.push("the EmoteWheel prefab wiring (or its rest-parity hub/baseSector) left the importer (round 44, item 11)");
  if (!/var ewS = inst\.GetComponent<PatternBreakEmoteWheel>\(\);/.test(cs))
    errors.push("emotewheel left the board value strike (round 44, item 11)");
}

/* ── ROUND 44 · S26 (item 39 — stopwatch): the arc, hand and hub leave
   the face as rotation-true atoms (dial-centered square canvases, half-
   disc caps so the translucent arc never doubles), and
   PatternBreakStopwatch drives arc + hand + alarm mood + readout from
   ONE value. base.png stays byte-identical (the ring's compatibility
   rule). ── */
{
  if (!/opts\.part === "arc" \|\| opts\.part === "cap-start" \|\| opts\.part === "cap-head" \|\| opts\.part === "hand" \|\| opts\.part === "hub" \|\| opts\.part === "hub-alarm"/.test(bevelSrc)
      || !/const faceOnly = opts\.part === "face";/.test(bevelSrc))
    errors.push("the stopwatch part renders left bevel (round 44, item 39)");
  if (!/`\$\{uid\}\/face\.png`/.test(src) || !/`\$\{uid\}\/cap-head\.png`/.test(src) || !/`\$\{uid\}\/hub-alarm\.png`/.test(src)
      || !/gauge: \{ x: 0, y: 0, fs: 0, unitY: 0, unitFs: 0, dialX: dcx \* PNG_SCALE, dialY: dcy \* PNG_SCALE \}/.test(src))
    errors.push("the stopwatch atoms (or the face row's dial-center stamp) left the exporter (round 44, item 39)");
  if (!/const STOPWATCH_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakStopwatch\.cs", data: STOPWATCH_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakStopwatch\.cs",/.test(src))
    errors.push("Stopwatch's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 44, item 39)");
  if (!/if \(baseAsset\.component == "stopwatch"\) \{/.test(cs)
      || !/rigSW\.hubAlarm = hubAlarmSW;/.test(cs)
      || !/rigSW2\.readout = tSW; break;/.test(cs))
    errors.push("the Stopwatch prefab wiring (or its readout join) left the importer (round 44, item 39)");
  if (!/var pswS = inst\.GetComponent<PatternBreakStopwatch>\(\);/.test(cs))
    errors.push("stopwatch left the board value strike (round 44, item 39)");
}

/* ── ROUND 44 · S27 (items 38 + 26 — steps + pathconnector, RIG-5): the
   step lane wears a still plate (every digit a live seat, the '1'
   included) with KitSteps swapping pip looks and lighting rails; the
   saga trail deals nine live beads at the stamped bezier centers. Both
   base sheets stay byte-identical. ── */
{
  if (!/data-steppips="\$\{\(padS \+ sR\)\.toFixed\(1\)\}/.test(bevelSrc)
      || !/opts\.part === "pip-done" \|\| opts\.part === "pip-current" \|\| opts\.part === "pip-upcoming"/.test(bevelSrc)
      || !/const plateS9 = opts\.part === "plate";/.test(bevelSrc))
    errors.push("the step-lane stamp or part renders left bevel (round 44, item 38)");
  if (!/data-pathgeo="\$\{ptsP9\.join\(" "\)\}"/.test(bevelSrc)
      || !/opts\.part === "bead" \|\| opts\.part === "bead-lit"/.test(bevelSrc))
    errors.push("the saga-trail stamp or bead renders left bevel (round 44, item 26)");
  if (!/steps: stepsGeo,/.test(src) || !/pathConnector: pathGeo,/.test(src))
    errors.push("the RIG-5 geo blocks left the manifest emission (round 44, items 38 + 26)");
  if (!/const KIT_STEPS_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakKitSteps\.cs", data: KIT_STEPS_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakKitSteps\.cs",/.test(src))
    errors.push("KitSteps' runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 44, item 38)");
  if (!/const PATH_CONNECTOR_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakPathConnector\.cs", data: PATH_CONNECTOR_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakPathConnector\.cs",/.test(src))
    errors.push("PathConnector's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 44, item 26)");
  if (!/public PBDotsGeo steps; public PBPathGeo pathConnector;/.test(cs)
      || !/class PBPathGeo \{ public float w; public float h; public int n; public float staged; public float\[\] pts; \}/.test(cs))
    errors.push("the RIG-5 geo classes left the importer's manifest schema (round 44, items 38 + 26)");
  if (!/if \(baseAsset\.component == "steps"\) \{/.test(cs) || !/rigST\.step = Mathf\.Clamp\(geoST\.staged \+ 1, 1, geoST\.n\);/.test(cs)
      || !/rigST2\.digits = digST;/.test(cs))
    errors.push("the KitSteps prefab wiring (or its digit join) left the importer (round 44, item 38)");
  if (!/static bool PathConnectorPrefab\(string dir, string root, int pngScale, PBManifest m\) \{/.test(cs)
      || !/if \(PathConnectorPrefab\(dir, root, pngScale, m\)\) any = true;/.test(cs)
      || !/"pathconnector" \}/.test(cs))
    errors.push("PathConnectorPrefab (its call, or its generic-road skip) left the importer (round 44, item 26)");
  if (!/var kstS = inst\.GetComponent<KitSteps>\(\);/.test(cs) || !/var pcS = inst\.GetComponent<PatternBreakPathConnector>\(\);/.test(cs))
    errors.push("steps/pathconnector left the board value strike (round 44, items 38 + 26)");
}

/* ── ROUND 44 · S28 (item 44 — weaponwheel, RIG-7): the Cylinder is a
   marked rotatable layer, glyphs orbit upright on fixed frames with
   armed/quiet looks, the armed ring and name tag are nick'd children
   (the tag word rides its plate), and PatternBreakWeaponWheel makes the
   rotation a dial. ── */
{
  if (!/data-icon="cylinder" data-icon-box="\$\{\(cW - innerR\)\.toFixed\(1\)\}/.test(bevelSrc)
      || !/data-icon="armed" data-icon-nick="Armed chamber ring"/.test(bevelSrc)
      || !/data-icon="tag" data-icon-nick="Name tag"/.test(bevelSrc)
      || !/data-seat-rider="tag"/.test(bevelSrc)
      || !/data-wheelgeo="\$\{orbitR\.toFixed\(1\)\} \$\{nW\} \$\{vW\.toFixed\(4\)\}"/.test(bevelSrc))
    errors.push("the weaponwheel marks (cylinder / armed ring / riding tag / orbit stamp) left bevel (round 44, item 44)");
  if (!/`\$\{uid\}\/w\$\{c9i \+ 1\}-lit\.png`/.test(src) || !/`\$\{uid\}\/w\$\{c9i \+ 1\}-ghost\.png`/.test(src))
    errors.push("the chamber look atoms left the exporter (round 44, item 44)");
  if (!/const WEAPON_WHEEL_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakWeaponWheel\.cs", data: WEAPON_WHEEL_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakWeaponWheel\.cs",/.test(src))
    errors.push("WeaponWheel's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 44, item 44)");
  if (!/if \(baseAsset\.component == "weaponwheel"\) \{/.test(cs)
      || !/rigWW\.centerAnchor = \(\(RectTransform\)cylWW\)\.anchorMin;/.test(cs))
    errors.push("the WeaponWheel prefab wiring left the importer (round 44, item 44)");
  if (!/var wwS = inst\.GetComponent<PatternBreakWeaponWheel>\(\);/.test(cs))
    errors.push("weaponwheel left the board value strike (round 44, item 44)");
}

/* ── ROUND 44 · S29 (staged roads — items 23 + 31 + vitalbar): the gated
   families' roads stand READY (marked mercury + zone stamps, marked slot
   glyphs, the bar-rig rosters) while stagedShips keeps every byte out of
   the zip until the owner releases them. ── */
{
  if (!/data-barfill="\$\{\(bx \+ 2\.5 \* k\)\.toFixed\(1\)\}/.test(bevelSrc))
    errors.push("the orderticket mercury lost its mark (round 44, item 23 — gated road)");
  if (!/data-icon="slot\$\{i \+ 1\}" data-icon-nick="Reward \$\{i \+ 1\}"/.test(bevelSrc))
    errors.push("the rewardtray slot glyphs lost their marks (round 44, item 31 — gated road)");
  if (!/data-barfill="\$\{\(barX \+ gV\)\.toFixed\(1\)\}/.test(bevelSrc))
    errors.push("the vitalbar mercury lost its mark (round 44 — gated road)");
  if (!/uid === "orderticket" \|\| uid === "vitalbar";/.test(src)
      || !/orderticket: 0\.62, vitalbar: 0\.72/.test(src))
    errors.push("the staged families left the bar-rig emission roster (round 44, items 23 + vitalbar)");
  if (!/barRigU \? stripBarFill\(sOut\)\.svg : sOut/.test(src))
    errors.push("bar-rig state skins keep a baked mercury twin — hover would double-draw the bar (round 44, item 23)");
  if (!/baseAsset\.component == "orderticket" \|\| baseAsset\.component == "vitalbar"/.test(cs)
      || !/it\.component == "orderticket" \|\| it\.component == "vitalbar"/.test(cs))
    errors.push("the staged families left the importer's bar wiring or board strike (round 44, items 23 + vitalbar)");
}

/* ── ROUND 46 · R1 (the radial mandate): spinner + cooldown ship as
   WORKING rigs beside the capture ring — track/comet, face/sector/
   ticks-lit/hand/sheen, PatternBreakSpinner + PatternBreakCooldown. ── */
{
  if (!/opts\.part === "track" \|\| opts\.part === "comet"/.test(bevelSrc))
    errors.push("the spinner part renders left bevel (round 46, R1)");
  if (!/opts\.part === "face" \|\| opts\.part === "sector" \|\| opts\.part === "ticks-lit" \|\| opts\.part === "hand"/.test(bevelSrc)
      || !/const faceOnly9 = opts\.part === "face";/.test(bevelSrc))
    errors.push("the cooldown part renders left bevel (round 46, R1)");
  if (!/await addPng\("spinner\/comet\.png"/.test(src) || !/await addPng\("cooldown\/sector\.png"/.test(src) || !/await addPng\("cooldown\/ticks-lit\.png"/.test(src))
    errors.push("the radial atoms left the exporter (round 46, R1)");
  if (!/const SPINNER_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakSpinner\.cs", data: SPINNER_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakSpinner\.cs",/.test(src))
    errors.push("Spinner's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 46, R1)");
  if (!/const COOLDOWN_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakCooldown\.cs", data: COOLDOWN_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakCooldown\.cs",/.test(src))
    errors.push("Cooldown's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 46, R1)");
  if (!/static bool SpinnerPrefab\(string dir, string root, int pngScale, PBManifest m\) \{/.test(cs)
      || !/static bool CooldownPrefab\(string dir, string root, int pngScale, PBManifest m, Font kitFont\) \{/.test(cs)
      || !/if \(SpinnerPrefab\(dir, root, pngScale, m\)\) any = true;/.test(cs)
      || !/if \(CooldownPrefab\(dir, root, pngScale, m, kitFont\)\) any = true;/.test(cs))
    errors.push("the radial prefab builders (or their calls) left the importer (round 46, R1)");
  if (!/tickImg\.fillClockwise = false;/.test(cs) || !/secImg\.fillClockwise = true;/.test(cs))
    errors.push("the cooldown's two radial cuts lost their directions — the crown/sector semantics break (round 46, R1)");
  if (!/var cdS = inst\.GetComponent<PatternBreakCooldown>\(\);/.test(cs))
    errors.push("cooldown left the board value strike (round 46, R1)");
}

/* ── ROUND 46 · R2 (the definitive animation answer): attention pulse +
   glow cycle ship as working behaviors (the app's own contract — 5%·mag
   @1.26s; 2→14px / 25→85% @1.98s in the kit's Glow), and the QuickStart
   carries the canonical "Driving the animations" section. ── */
{
  if (!/const ATTENTION_PULSE_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakAttentionPulse\.cs", data: ATTENTION_PULSE_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakAttentionPulse\.cs",/.test(src))
    errors.push("AttentionPulse's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 46, R2)");
  if (!/const GLOW_CYCLE_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakGlowCycle\.cs", data: GLOW_CYCLE_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakGlowCycle\.cs",/.test(src))
    errors.push("GlowCycle's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 46, R2)");
  if (!/public float period = 1\.26f;/.test(src) || !/1f \+ 0\.05f \* magnitude \* u;/.test(src))
    errors.push("the attention pulse lost the app's contract (5%·magnitude, 1.26s) (round 46, R2)");
  if (!/public float period = 1\.98f;/.test(src) || !/public float padMin = 2f;/.test(src) || !/public float padMax = 14f;/.test(src))
    errors.push("the glow cycle lost the app's contract (2→14px, 1.98s) (round 46, R2)");
  if (!/## Driving the animations/.test(src)
      || !/PatternBreakAttentionPulse\*\* — the app's "attention pulse" Motion/.test(src))
    errors.push("the QuickStart's 'Driving the animations' section is gone — the definitive answer stops shipping (round 46, R2)");
}

/* ── ROUND 47 · S32 (owner field: composite mercuries seated beside
   their TITLES): the zone is only truth on base/track/lit rows, and the
   importer's zone fallbacks prefer the BASE row over whichever row
   comes first. ── */
{
  if (!/const zoneRowOk = q\.meta\.part === "base" \|\| q\.meta\.part === "track" \|\| q\.meta\.part === "lit";/.test(src))
    errors.push("the zone-row gate left the exporter — icon/fill/cap rows would ship crop-shifted zone garbage again (round 47, item 1)");
  if (!/if \(rowT == null\) foreach \(var aT in m\.assets\) if \(aT != null && aT\.component == fam && aT\.part == "base" && aT\.track != null && aT\.track\.w > 2f\) \{ rowT = aT; break; \}/.test(cs))
    errors.push("BuildBarFill lost the base-row-first zone pick — composite bars seat off icon rows again (round 47, item 1)");
  if (!/aT\.component == fam && aT\.part == "base" && aT\.track != null && aT\.track\.w > 2f\) return aT\.track;/.test(cs)
      || !/aT\.component == fam && aT\.part == "lit" && aT\.track != null && aT\.track\.w > 2f\) return aT\.track;/.test(cs))
    errors.push("BarZone lost its base-then-lit ladder — kept-project cell grafts zone off icon rows again (round 47, item 1)");
  if (!/const gMargin = Math\.max\(4, \.\.\.idxs\.map\(\(i\) => typeof pngQueue\[i\]\.crop === "number" \? pngQueue\[i\]\.crop as number : 4\)\);/.test(src)
      || !/\}, livesOut \? 40 : true, interactive \|\| buffRig \|\| cellRig \|\| stepperOut \|\| livesOut/.test(src))
    errors.push("the lives glow-pad crop margin left the exporter — the lit hearts clip to a hard rectangle again (round 47, item 2)");
}

/* ── ROUND 47 · S34 (item 3 — the combo digit road): the numeral and
   plaque un-burn to live children, the celebration digit set (0-9 + ×)
   ships with advances, and ComboPop.SetCount composes ×N at the
   authored seat while Pop() stays untouched. ── */
{
  if (!/data-icon="numeral" data-icon-nick="Multiplier"/.test(bevelSrc)
      || !/data-icon="plaque" data-icon-nick="Combo plaque"/.test(bevelSrc)
      || !/data-comboseat="\$\{cxC0\.toFixed\(1\)\} \$\{cyC0\.toFixed\(1\)\}"/.test(bevelSrc)
      || !/if \(opts\.part === "digit"\) \{/.test(bevelSrc)
      || !/data-adv="\$\{advG\.toFixed\(1\)\}"/.test(bevelSrc))
    errors.push("the combo marks / seat stamp / digit part render left bevel (round 47, item 3)");
  if (!/const mG = measureLive\(g9, cfg\.type\.font, TWc, itG\) \?\? measureLabel\(g9, cfg\.type\.font, TWc, itG\);/.test(bevelSrc))
    errors.push("the digit advance stopped being measured LIVE at the rendered weight/italic — the baked table's ×-ceiling (0.661em vs Fredoka's real 0.474em) would drift every composed digit by half the miss again (round 47, item 3)");
  if (!/`\$\{uid\}\/digit-\$\{dName\}\.png`/.test(src) || !/comboSeatG = \{ gauge: \{ x: 0, y: 0, fs: 0, unitY: 0, unitFs: 0, dialX: scx9 \* PNG_SCALE, dialY: scy9 \* PNG_SCALE \} \};/.test(src))
    errors.push("the combo digit atoms or the seat gauge left the exporter (round 47, item 3)");
  if (!/public void SetCount\(int n\) \{ count = Mathf\.Max\(0, n\); Apply\(\); \}/.test(src)
      || !/deal\(timesSprite, timesAdvance\);/.test(src)
      || !/public void Pop\(\) \{ if \(rt == null\) rt = \(RectTransform\)transform; t = 0f; \}/.test(src))
    errors.push("ComboPop lost SetCount, the compose, or Pop's untouched body (round 47, item 3)");
  if (!/popC\.seatOffset = new Vector2\(\(axF - fxSeat\) \* rootRtC\.sizeDelta\.x, \(ayF - fySeat\) \* rootRtC\.sizeDelta\.y\);/.test(cs)
      || !/popC\.count = 0; \/\/ rest = the authored numeral, byte-for-byte/.test(cs))
    errors.push("ComboPopWire lost the digit wiring or its rest-parity count (round 47, item 3)");
}

/* ── ROUND 47 · S35 (reviewer blocker — Glow Cycle wired the seat
   SHADOW): GlowCycle's Reset scans the raw manifest text for its ink,
   and the file's FIRST "glow" is a seat ink's "glow": null whose next
   # is the seat shadow hex — the halo swelled shadow-brown instead of
   the kit's Glow. The scan must anchor inside the "palette" object and
   stay bounded by its braces; a whole-file first-"glow" scan can never
   come back. Rider: the QuickStart's animation chapter carries the
   2022.3 readout caveat. ── */
{
  if (!/var pIdx = ta\.text\.IndexOf\("\\\\"palette\\\\""\);/.test(src)
      || !/var mIdx = ta\.text\.IndexOf\("\\\\"glow\\\\"", open9\);/.test(src)
      || !/if \(mIdx < 0 \|\| mIdx > close9\) continue;/.test(src)
      || !/if \(hIdx > 0 && hIdx < close9 && hIdx \+ 7 <= ta\.text\.Length\)/.test(src))
    errors.push("GlowCycle's Reset lost the palette-anchored ink scan — the halo seeds the seat-shadow hex again (round 47, S35)");
  if (/ta\.text\.IndexOf\("\\\\"glow\\\\""\);/.test(src))
    errors.push('a whole-file first-"glow" manifest scan is back in the emitted C# — it lands on a seat ink\'s null glow and seeds the seat shadow (round 47, S35)');
  if (!/the same rung rule as the step-4 word note\./.test(src))
    errors.push("the QuickStart's animation chapter lost the 2022.3 readout caveat (round 47, S35)");
}

/* ── ROUND 47 · S36 (owner field screenshot — the VS bar's caps): the
   app compresses its whole gradient into the live mercury, so a windowed
   crop wears the wrong ink at every value but full, and the mirrored
   (right) cap's extra x-flip threw the pre-mirrored atom onto naked
   track left of the value line. The rig now STRETCHES ramped fills into
   the run (nub pill owning the short tail, faded-lead caps blending into
   the ramp), and a mirrored cap seats pivot-first with NO flip. ── */
{
  if (!/float shrink = stretchRun \? Mathf\.Clamp01\(runW \/ Mathf\.Max\(1f, capBodyW\)\) : Mathf\.Clamp01\(runW \/ Mathf\.Max\(1f, 2f \* r\)\);/.test(src)
      || !/void ApplyStretched\(float v, float runW, float areaW, float areaH, float capBodyW, bool showFill, bool showCap\) \{/.test(src)
      || !/public bool stretchRun;/.test(src)
      || !/public RectTransform nub;/.test(src))
    errors.push("KitBarFill lost the stretch-run road — ramped mercuries (the VS bar) window the wrong ink again (round 47, S36; round 48 renamed the head span to its BODY)");
  if (!/var sc = capHead\.localScale; sc\.x = Mathf\.Max\(0\.01f, shrink\); sc\.y = Mathf\.Max\(0\.01f, shrink\); capHead\.localScale = sc;/.test(src)
      || /\(fromRight \? -1f : 1f\) \* Mathf\.Max\(0\.01f, shrink\)/.test(src))
    errors.push("the mirrored cap's x-flip is back — the pre-mirrored right bead lands on naked track again (round 47, S36)");
  if (!/var nubSp = S\(root \+ "\/assets\/" \+ fam \+ "\/" \+ fam \+ "-nub-" \+ \(fromRight \? "r" : "l"\) \+ "\.png"\);/.test(cs)
      || !/kbf\.stretchRun = true;/.test(cs)
      || !/fPrevN\.file == "assets\/vsbar\/vsbar-nub-l\.png"/.test(cs))
    errors.push("the nub wiring or its kept-project era rule left the importer (round 47, S36)");
  if (!/opts\.overlay === "nub-l" \|\| opts\.overlay === "nub-r"/.test(bevelSrc)
      || !/mask="url\(#\$\{gid\}fade\)"/.test(bevelSrc))
    errors.push("the vsbar nub overlays or the cap lead-in fade left the app's drawing (round 47, S36)");
  for (const nubRow of ['"vsbar\\/nub-l.png"', '"vsbar\\/nub-r.png"'])
    if (!new RegExp("await addPng\\(" + nubRow).test(src))
      errors.push(`the ${nubRow} nub atom stopped shipping (round 47, S36)`);
}

/* ── ROUND 47 · S37 (owner: the damage number must be a dev instrument,
   not a picture): the combo digit road applied to dmgnumber — the
   number un-burns to a live child, the damage digit set (0-9 + comma)
   ships with advances, and PatternBreakDmgNumber.Show(n) composes the
   amount at the authored seat and plays the app's SMIL flight with the
   SAME keyframes the app animates. ── */
{
  if (!/data-part="icon" data-icon="number" data-icon-nick="Damage number"/.test(bevelSrc)
      || !/data-dmgseat="\$\{cxD\.toFixed\(1\)\} \$\{cyD\.toFixed\(1\)\}"/.test(bevelSrc)
      || !/aria-label="damage digit \$\{g9\}"/.test(bevelSrc))
    errors.push("the damage number's un-burn marks / seat stamp / digit atom render left bevel (round 47, S37)");
  if (!/const DMG_NUMBER_RUNTIME = `using UnityEngine;/.test(src)
      || !/files\.push\(\{ path: "Runtime\/PatternBreakDmgNumber\.cs", data: DMG_NUMBER_RUNTIME \}\);/.test(src)
      || !/"Runtime\/PatternBreakDmgNumber\.cs",/.test(src))
    errors.push("DmgNumber's runtime or its registration (files + sharedScripts BOTH — the law) left the exporter (round 47, S37)");
  if (!/public void Show\(int n\) \{ SetValue\(n\); Play\(\); \}/.test(src)
      || !/dmgC\.value = 0; \/\/ rest = the authored number, byte-for-byte/.test(cs))
    errors.push("DmgNumber lost Show or its rest-parity wiring (round 47, S37)");
  /* the SMIL ↔ C# cross-pin: the app's keyframes and the runtime's must
     name the SAME numbers — retune one and this fails until the other
     follows */
  const smilD = /values="\$\{crit \? "0\.55;1\.16;0\.97;1;1" : "0\.7;1\.09;0\.98;1;1"\}" keyTimes="0;0\.06;0\.1;0\.14;1"/.test(bevelSrc)
    && /values="0;1;1;0" keyTimes="0;0\.05;0\.72;1"/.test(bevelSrc)
    && /keyTimes="0;0\.4;1"/.test(bevelSrc)
    && /crit \? "3s" : "2\.6s"/.test(bevelSrc);
  const flightD = /Seg\(f, 0f, 0\.06f, 0\.55f, 1\.16f\)/.test(src) && /Seg\(f, 0f, 0\.06f, 0\.7f, 1\.09f\)/.test(src)
    && /Seg\(f, 0\.06f, 0\.1f, 1\.09f, 0\.98f\)/.test(src) && /Seg\(f, 0\.1f, 0\.14f, 0\.98f, 1f\)/.test(src)
    && /Seg\(f, 0f, 0\.4f, 8f, -6f\)/.test(src) && /Seg\(f, 0\.4f, 1f, -6f, -26f\)/.test(src)
    && /Seg\(f, 0f, 0\.05f, 0f, 1f\)/.test(src) && /Seg\(f, 0\.72f, 1f, 1f, 0f\)/.test(src)
    && /public float seconds = 2\.6f;/.test(src) && /seconds \* \(3f \/ 2\.6f\)/.test(src)
    && /-dySvg \/ 210f \* rt\.rect\.height/.test(src);
  if (!smilD || !flightD)
    errors.push("the damage number's SMIL and the shipped C# flight no longer name the same keyframes — retune both together (round 47, S37)");
  if (!/DmgNumberWire\(dir, root, m, staging\)/.test(cs) || !/var seatTD = contents\.transform\.Find\("Damage number"\);/.test(cs))
    errors.push("DmgNumberWire (or its call) left the importer (round 47, S37)");
  if (!/PatternBreakDmgNumber\*\* — the damage number as a dev instrument:/.test(src))
    errors.push("the QuickStart's one-call lane lost the DmgNumber entry (round 47, S37)");
}

/* ── ROUND 48 · S38 (owner Unity notes on the bar rig): (1) SEATS — the
   fill/cap atoms crop to their GLOW BLEED, and mapping the whole sprite
   onto the zone seated the ink 10-24px right of the well ("the fill
   needs to line up with the start of the well"). The atoms now stamp
   their BODY boxes (data-fillbody), the manifest carries them, and
   KitBarFill maps its whole value space through the body fractions —
   0/1 defaults keep old zips byte-identical. (2) SEGBAR — the per-cell
   gloss clips to the cell's own pill body (the progress/slider
   containment mandate: gloss ∩ fill ∩ silhouette). ── */
{
  if (!/data-fillbody="\$\{/.test(bevelSrc) || (bevelSrc.match(/data-fillbody="\$\{/g) ?? []).length < 5
      || (src.match(/data-fillbody="\$\{/g) ?? []).length < 4)
    errors.push("the fill/cap atoms lost their data-fillbody stamps (round 48, S38: progress+cap, slider+cap, vsbar overlays in bevel; display bars + rails in the exporter)");
  if (!/const fbm = \/data-fillbody="\(\[-\\d\. \]\+\)"\/\.exec\(q\.svg\);/.test(src)
      || !/body\?: \{ x: number; w: number; y\?: number; h\?: number \} \| null;/.test(src) // round 57: the band's y/h ride the same row
      || !/\.\.\.\(fillBody \? \{ body: fillBody \} : \{\}\)/.test(src))
    errors.push("addPng lost the body-box parse or its manifest emission (round 48, S38; round 57 widened the row with the band's y/h)");
  if (!/public PBTrack body;/.test(src))
    errors.push("PBAsset lost the body field — the importer can no longer read the true ink spans (round 48, S38)");
  if (!/public float bodyU0 = 0f;/.test(src) || !/public float capU0 = 0f;/.test(src)
      || !/float capBodyW = capW \* capSpan;/.test(src)
      || !/fill\.fillAmount = \(fromRight \? 1f - bodyU1 : bodyU0\) \+ fill\.fillAmount \* span;/.test(src)
      || !/capHead\.anchoredPosition = new Vector2\(fromRight \? -capU0 \* capW \* shrink : \(1f - capU1\) \* capW \* shrink, 0f\);/.test(src))
    errors.push("KitBarFill lost the body-space value map — fills seat right of the well again (round 48, S38)");
  if (!/static void WireBarBodies\(GameObject area, PBManifest m\) \{/.test(cs)
      || !/static PBAsset RowOfSprite\(PBManifest m, Sprite sp\) \{/.test(cs)
      || (cs.match(/WireBarBodies\(/g) ?? []).length < 7)
    errors.push("WireBarBodies (or enough of its call sites — BuildBarFill, Slider, VsBar x2, rails, graft) left the importer (round 48, S38)");
  if (!/<clipPath id="\$\{gid\}g\$\{i\}">/.test(bevelSrc))
    errors.push("the segbar per-cell gloss clip is gone — highlights overrun the pills again (round 48, S38)");
}

/* ── ROUND 48 · S39 (cross-lane, the smashed-pair guard reaches the
   export): (a) the baked face's kerning table drops any pair whose own
   kern fuses the strokes — the app's kernCollides is the one arbiter;
   (b) a kern-guarded seat word ships unkern:true and the live TMP seat
   renders with kerning off, per label, on both rungs. ── */
{
  if (!/, kernCollides \} from "\.\/bevel";/.test(src)
      || !/if \(kp < 0 && kernCollides\(a \+ b, family, weight, !!base\.type\.italic, \(base\.type\.spacing \?\? 0\) \/ 100\)\) continue;/.test(src))
    errors.push("the baked kerning table lost the smashed-pair guard — TMP fuses I into V again on hero labels (round 48, S39)");
  if (!/if \(\/font-kerning:\\s\*none\/\.test\(p\.getAttribute\("style"\) \?\? ""\) \|\| p\.getAttribute\("font-kerning"\) === "none"\) unkern = true;/.test(src)
      || !/\.\.\.\(unkern \? \{ unkern: true \} : \{\}\),/.test(src)
      || !/unkern\?: boolean;/.test(src))
    errors.push("the seat parse lost the unkern flag — guarded words kern again in Unity (round 48, S39)");
  if (!/public bool unkern; \}/.test(src)
      || !/static bool SeatKernIsOff\(TMPro\.TMP_Text t\) \{/.test(cs)
      || !/static void SeatKernOff\(TMPro\.TMP_Text t\) \{/.test(cs)
      || !/if \(seat\.unkern\) SeatKernOff\(t\); \/\/ the smashed-pair guard, this label only/.test(cs)
      || !/&& \(!seat\.unkern \|\| SeatKernIsOff\(t\)\)/.test(cs)
      || !/if \(seat\.unkern\) SeatKernOff\(tL\); \/\/ the smashed-pair guard rides the LTS rung too/.test(src))
    errors.push("the TMP seat kern-off consumption left the importer (round 48, S39 — DressSeatText probe+apply and the LTS road)");
}

/* ── ROUND 49 · S40 (the slot button fleet, exporter half of d7c83a2):
   slotbtn rides the universal interactive road (skins + Button + live
   glyph + chip), staged-gated like the family; the manifest ships the
   curated fleet list ONLY when released; and the importer builds one
   thin Prefab Variant per entry — manifest-driven so wave 2 (the glyph
   rack) is additive with zero importer change. ── */
{
  if (!/"orderticket", "chest", "giftbox",[\s\S]{0,500}"slotbtn"\]\);/.test(src))
    errors.push("slotbtn left the UNIVERSAL_INTERACTIVE road — no skins, no Button, no fleet (round 49, S40)");
  if (!/\["slotbtn", "slotbtn"\],/.test(src))
    errors.push("slotbtn lost its stateFx dials row — the prefab presses without the kit's glow/lift (round 49, S40)");
  if (!/\.\.\.\(stagedShips\("slotbtn"\) \? \{\s*slotFleet:/.test(src)
      || !/\.map\(\(g\) => \(\{ name: g\.charAt\(0\)\.toUpperCase\(\) \+ g\.slice\(1\), file: `assets\/icons\/\$\{g\}\.png` \}\)\),/.test(src))
    errors.push("the slot fleet list lost its staged gate or its shipped-sprite shape (round 49, S40)");
  if (!/public PBFleetEntry\[\] slotFleet;/.test(src) || !/class PBFleetEntry \{ public string name; public string file; \}/.test(src))
    errors.push("PBManifest lost the fleet entries (round 49, S40)");
  if (!/static bool SlotFleetPrefabs\(string dir, string root, PBManifest m, bool quiet\) \{/.test(cs)
      || !/SlotFleetPrefabs\(dir, root, m, staging\)/.test(cs)
      || !/var gT = inst\.transform\.Find\("Icon glyph"\);/.test(cs)
      || !/"\/Slot Button – " \+ FileSafeWord\(fe\.name\) \+ "\.prefab"/.test(cs)
      || !/PrefabUtility\.GetPrefabAssetType\(saved\) == PrefabAssetType\.Variant\s*&& \(GameObject\)PrefabUtility\.GetCorrespondingObjectFromSource\(saved\) == basePf;[\s\S]{0,900}Slot Button fleet/.test(cs))
    errors.push("the slot fleet builder (thin Prefab Variants off the live glyph child) left the importer (round 49, S40)");
  if (!/"Slotbtn", "Slot Button – Gem", "Slot Button – Sword", "Slot Button – Key", "Slot Button – Hammer", "Slot Button – Gear", "Slot Button – Check"/.test(cs)
      || !/else if \(sf == "slotbtn"\) foreach \(var fv in new\[\] \{ "Slot Button – Gem"/.test(cs))
    errors.push("the Playground lost the slot button's representative row or its staged hiding (round 49, S40)");
}

/* ── ROUND 50 · S41 (the owner's glow class rule: "increase the space
   around the asset so that the glow eventually falls off naturally...
   without increasing the hit area"): (a) tight crops measure the glow's
   REACH (alpha ≤1 at the shipped edge — dual-box scan + the widened
   raster canvas, all-or-none per union group); (b) uncropped layered
   rigs take the measured border probe; (c) icon-seat atoms measure
   their tails on a widened window so the seat box grows 1:1 with the
   sprite; (d) hit areas pin to the DRAWN piece — data-shell where
   authored, the measured ink row where not, consumed by the importer's
   InkBoxOf road. ── */
{
  const exSrc41 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/generator/exportUtils.ts"), "utf8");
  if (!/x0 = Math\.max\(0, Math\.min\(x0 - margin, rx0 - 2\)\); y0 = Math\.max\(0, Math\.min\(y0 - margin, ry0 - 2\)\);/.test(exSrc41)
      || !/x1 = Math\.min\(cv\.width - 1, Math\.max\(x1 \+ margin, rx1 \+ 2\)\); y1 = Math\.min\(cv\.height - 1, Math\.max\(y1 \+ margin, ry1 \+ 2\)\);/.test(exSrc41)
      || !/const X1 = Math\.min\(cv\.width - 1, Math\.max\(x1 \+ margin, rx1 \+ 2\)\), Y1 = Math\.min\(cv\.height - 1, Math\.max\(y1 \+ margin, ry1 \+ 2\)\);/.test(exSrc41))
    errors.push("the measured-reach (dual-box) crop left the tight rasters — glow tails cut at the ink margin again (round 50, S41)");
  if (!/export function padGlowCanvas\(svg: string, pad = 72\): string \{/.test(exSrc41)
      || !/export async function svgEdgeAlphaMax\(svg: string, scale = 2\): Promise<number> \{/.test(exSrc41))
    errors.push("padGlowCanvas / svgEdgeAlphaMax left exportUtils — overrunning auras can't be widened or probed (round 50, S41)");
  if (!/ink: \{ x0: inkBox\.x0 - x0, y0: inkBox\.y0 - y0, x1: inkBox\.x1 - x0, y1: inkBox\.y1 - y0 \} \};/.test(exSrc41))
    errors.push("svgToPngBytesTight stopped returning the measured ink box — shell-less rows lose their raycast pin (round 50, S41)");
  if (!/const wants = q\.group \? !groupSliced\.get\(q\.group\) : \(!!q\.crop && !q\.meta\.nineSlice\);/.test(src)
      || !/if \(wants\) q\.svg = padGlowCanvas\(q\.svg, 72\);/.test(src))
    errors.push("the widened-canvas pre-pass lost its all-or-none group rule — union members tear their shared frame (round 50, S41)");
  if (!/const loose = pngQueue\.filter\(\(q\) => !q\.crop && !q\.group && !q\.meta\.nineSlice && !q\.meta\.part\.startsWith\("icon-"\)\);/.test(src)
      || !/if \(worst <= 1 \|\| worst >= 64\) continue;/.test(src))
    errors.push("the uncropped-rig border probe lost its scope rails (icon seats / drawn-window exclusion) — cooldown truncates or windows widen (round 50, S41)");
  if (!/const rb = await svgAlphaBox\(wide, PNG_SCALE, 1\)\.catch\(\(\) => null\);/.test(src)
      || !/bw9 = \(Math\.max\(abW\.x1, rb\.x1\) - Math\.min\(abW\.x0, rb\.x0\) \+ 1\) \/ \(PNG_SCALE \* dscX\) \+ pad \* 2;/.test(src))
    errors.push("iconSeatsOf lost the widened-window reach measurement — ringed marks cut their halos at ink+2 again (round 50, S41)");
  if (!/if \(e9 < bestE\) \{ spr = cand; bestE = e9; bx = cx9; by = cy9; bw9 = cw9; bh9 = ch9; \}/.test(src)
      || !/let bestE = await svgEdgeAlphaMax\(spr, PNG_SCALE\)\.catch\(\(\) => 0\);/.test(src))
    errors.push("the measured seat box no longer verifies its own shipped-size raster (bounded verify-and-widen) — sub-2% tail noise ships unchecked (round 50 follow-up, S41)");
  if (!/ink\?: \{ x: number; y: number; w: number; h: number \} \| null;/.test(src)
      || !/\.\.\.\(inkBox \? \{ ink: inkBox \} : \{\}\),/.test(src)
      || !/if \(slack >= 6\)/.test(src))
    errors.push("the manifest lost the measured ink row (shell-less glow-slack sprites) — hit areas span the glow again (round 50, S41)");
  if (!/public PBShellBox ink;/.test(cs)
      || !/static PBShellBox InkBoxOf\(Sprite sp, string fam, PBManifest m\) \{/.test(cs)
      || !/var box = row != null \? row\.shell : InkBoxOf\(img\.sprite, fam, m\);/.test(cs)
      || !/\|\| InkBoxOf\(rootImg\.sprite, famName, m\) != null\);/.test(cs)
      || !/ShellRaycastPad\(go, "cooldown", m\);/.test(cs)
      || !/ShellRaycastPad\(go, famP, m\);/.test(cs))
    errors.push("the importer's ink-box raycast road left — clicks land on glow padding again (round 50, S41)");
}

/* ── ROUND 51 · S42 (the semantic glyph fleet — the owner: "we need a
   NEW CLASS of button that is the SEMANTIC GLYPHS + FRAME"): the slot
   button's second ready-to-wear class. The exporter renders each
   CURATED rack glyph (SEAT_GLYPHS) through the app's own seat road and
   ships the cut + its measured seat as a glyphFleet entry — under the
   SAME stagedShips("slotbtn") gate as the stock class, never a new
   family; the CC-BY silhouettes credit themselves in the notices. The
   importer builds one "Glyph Button – <Name>" thin Prefab Variant per
   entry off Slotbtn.prefab, reseats the live glyph child to the entry's
   app-measured box, waits quietly on missing sprites, and keeps a
   prefab the dev already holds. ── */
{
  if (!/for \(const bGF of GLYPH_BUTTON_FLEET\) \{\s*\n\s*if \(!stagedShips\(bGF\.id\)\) continue;/.test(src)
      || !/const seatsG = await iconSeatsOf\("slotbtn", fullG, undefined, `glyph-\$\{gid\}`\);/.test(src)
      || !/if \(\(fullG\.match\(\/data-part="icon"\/g\) \?\? \[\]\)\.length !== 1\) continue;/.test(src))
    errors.push("the glyph-button roster emission left the exporter (per-component gate / per-glyph seat cut / one-mark collision guard) — the class ships nothing, or a staged button leaks (round 51+52, S42)");
  if (!/\.\.\.\(glyphFleetOut\.length \? \{ glyphFleet: glyphFleetOut \} : \{\}\),/.test(src))
    errors.push("the manifest lost the glyphFleet roster — entries and sprites can disagree (round 51, S42)");
  if (!/for \(const gidF of glyphFleetIds\) tpnGlyphIds\.add\(`glyph\$\{gidF\}`\);/.test(src))
    errors.push("the shipped semantic cuts lost their CC-BY credit road (glyphAttribution via tpnGlyphIds) — game-icons art would ship uncredited (round 51, S42)");
  if (!/class PBGlyphFleetEntry \{ public string name; public string file; public float dx; public float dy; public float w; public float h; public string fam; \}/.test(cs)
      || !/public PBGlyphFleetEntry\[\] glyphFleet;/.test(cs))
    errors.push("PBManifest lost the glyph-fleet entries (name + file + measured seat + fam) (round 51+52, S42)");
  if (!/static bool GlyphFleetPrefabs\(string dir, string root, PBManifest m, bool quiet, int pngScale, Font kitFont\) \{/.test(cs)
      || !/GlyphFleetPrefabs\(dir, root, m, staging, pngScale, kitFont\)/.test(cs)
      || !/"\/Glyph Button – " \+ FileSafeWord\(fe\.name\) \+ "\.prefab"/.test(cs))
    errors.push("the glyph fleet builder (one 'Glyph Button – <Name>' prefab per entry) left the importer (round 51+52, S42)");
  const gfp42 = /static bool GlyphFleetPrefabs\(string dir, string root, PBManifest m, bool quiet, int pngScale, Font kitFont\) \{[\s\S]*?\n    \}/.exec(cs)?.[0] ?? "";
  if (!/if \(glyphSp == null\) \{ missing\+\+; continue; \}/.test(gfp42)
      || !/\{ kept\+\+; continue; \}/.test(gfp42))
    errors.push("the glyph fleet lost its missing-sprite tolerance or its keep-theirs-after-creation rule (round 51, S42)");
  if (!/grt\.sizeDelta = new Vector2\(fe\.w, fe\.h\);/.test(gfp42)
      || !/float fxGB = \(rowGB\.shell\.x \+ rowGB\.shell\.w \/ 2f \+ fe\.dx \* psGB\) \/ bsGB\.rect\.width;/.test(gfp42)
      || !/var gT = inst\.transform\.Find\("Icon glyph"\);/.test(gfp42))
    errors.push("the glyph fleet variant no longer reseats the LIVE glyph child to the entry's app-measured box (round 51, S42)");
  if (!/PrefabUtility\.GetPrefabAssetType\(saved\) == PrefabAssetType\.Variant/.test(gfp42))
    errors.push("the glyph fleet lost the variant-link assert — a disconnected save would freeze silently (round 51, S42)");
}

/* ── ROUND 52 · S43 (the glyph buttons become REAL kit components — the
   owner: "stock the kit with the entire semantic glyph set as buttons…
   then in the editor I want all of the controls… I don't want to have
   to have one master then go round about to save one"): each gbtn is
   its own component whose edits must reach its prefab. The exporter
   splits the road per button — THIN (still the shared slotbtn frame
   wearing its glyph) vs FULL (designDiff fork / per-piece dials / board
   placement / an uninheritable slotbtn frame → its OWN family rows,
   skins and stateFx dials) — and the importer builds BOTH under the one
   class name "Glyph Button – <Name>" in Variants, so exactly one prefab
   per glyph exists in any pose. ── */
{
  if (!/for \(const bGF of GLYPH_BUTTON_FLEET\) PREFAB_FAMILY\[bGF\.id\] = bGF\.id;/.test(src))
    errors.push("the glyph buttons lost their PREFAB_FAMILY rows — boards can't record them and staging can't declare them (round 52, S43)");
  if (!/for \(const bGF of GLYPH_BUTTON_FLEET\) UNIVERSAL_INTERACTIVE\.add\(bGF\.id\);/.test(src))
    errors.push("the glyph buttons left the universal pressable road — no full-road skins, auras or posed board copies (round 52, S43)");
  if (!/const gbtnFull = new Set<KitComponentId>\(GLYPH_BUTTON_FLEET\s*\n\s*\.filter\(\(b9\) => stagedShips\(b9\.id\) && \(pieceDialed\(b9\.id\) \|\| st\.kitIcons\?\.\[b9\.id\] !== undefined\s*\n\s*\|\| usedOnBoards0\.has\(b9\.id\) \|\| !stagedShips\("slotbtn"\) \|\| pieceDialed\("slotbtn"\)\)\)/.test(src))
    errors.push("the fleet's road split (fork/dial/placement/uninheritable-frame => FULL) left the exporter — a forked button would ship the shared frame wearing the wrong dress (round 52, S43)");
  if (!/if \(isGlyphButton\(uid\) && !gbtnFull\.has\(uid\)\) continue;/.test(src))
    errors.push("the universal loop lost the thin-road skip — every released glyph button would ship 47 full family bakes (round 52, S43)");
  if (!/if \(gbtnFull\.has\(bGF\.id\)\) \{/.test(src)
      || !/glyphFleetOut\.push\(\{ name: bGF\.glyphName, fam: bGF\.id, file: `assets\/\$\{bGF\.id\}\/\$\{bGF\.id\}-base\.png`, dx: 0, dy: 0, w: 0, h: 0 \}\);/.test(src))
    errors.push("the roster no longer names FULL-road buttons (fam + their own base file) — the importer can't build their true prefabs (round 52, S43)");
  if (!/\.\.\.\[\.\.\.gbtnFull\]\.flatMap\(\(gid9\) => \{/.test(src))
    errors.push("FULL-road glyph buttons lost their own stateFx dial rows — a forked button would press without its glow/lift (round 52, S43)");
  if (!/if \(a\.component\.StartsWith\("gbtn"\)\) continue;/.test(cs))
    errors.push("the generic family loop no longer skips gbtn — a second 'Gbtncoin' copy would split the class (round 52, S43)");
  const gfp43 = /static bool GlyphFleetPrefabs\(string dir, string root, PBManifest m, bool quiet, int pngScale, Font kitFont\) \{[\s\S]*?\n    \}/.exec(cs)?.[0] ?? "";
  if (!/if \(famRowGF != null\) \{/.test(gfp43)
      || !/if \(FamilyPrefab\(vdir, root, famRowGF, "Glyph Button – " \+ FileSafeWord\(fe\.name\), null, pngScale, kitFont, m\)\) made\+\+;/.test(gfp43))
    errors.push("the importer's FULL road (family rows -> class-named prefab in Variants) left GlyphFleetPrefabs (round 52, S43)");
  if (!/if \(basePf == null\) \{ missing\+\+; continue; \}/.test(gfp43))
    errors.push("the thin road no longer waits on the slotbtn frame — a set released without slotbtn would throw instead of shipping full (round 52, S43)");
  if (!/foreach \(var feSc in m\.glyphFleet\) if \(feSc != null && feSc\.fam == it\.component && !string\.IsNullOrEmpty\(feSc\.name\)\) \{ pfName = "Glyph Button – " \+ FileSafeWord\(feSc\.name\); break; \}/.test(cs)
      || !/if \(pf == null && it\.component != null && it\.component\.StartsWith\("gbtn"\)\)\s*\n\s*pf = AssetDatabase\.LoadAssetAtPath<GameObject>\(root \+ "\/Prefabs\/Variants\/" \+ pfName \+ "\.prefab"\);/.test(cs))
    errors.push("the scene road can no longer place a glyph button (class-name resolve via the roster + the Variants address) (round 52, S43)");
}

/* ── ROUND 53 · S44 (the per-state glyph dress — reviewer blocker: a
   Pressed icon-color pin rendered green in the editor and navy in Unity;
   the glyph is marked ink, stripped from every skin, and the single live
   cut ships the resting pose). The exporter emits a DIVERGED state's
   glyph cut on the resting cut's exact window (the raster is the judge —
   no divergence, no file, defaults byte-identical), wires the seat row
   (<state>File), and the StateFx rig swaps the live child in lockstep
   with the frame skins — never baked (maximum-editability law). Thin
   fleet variants retarget any inherited swap to their own glyph. ── */
{
  if (!/const inkForks9 = !!sdG9 && \(!!sdG9\.icon/.test(src) || !/if \(iconSeatsU && inkForks9\) \{/.test(src))
    errors.push("the per-state glyph cut lost its ICR-ladder gate (stateDesigns[state].icon arm) — forks ship nothing, or every state rasters needlessly (round 53, S44)");
  if (!/const SEAT_CUTS = new WeakMap<object, \{ spr: string; box: \[number, number, number, number\] \}>\(\);/.test(src)
      || !/SEAT_CUTS\.set\(seatRow, \{ spr, box: \[bx, by, bw9, bh9\] \}\);/.test(src))
    errors.push("iconSeatsOf no longer records the resting cut's exact window — state cuts can't share its canvas and the swap tears (round 53, S44)");
  if (!/if \(aR9\.length === bR9\.length && aR9\.every\(\(v9, i9\) => v9 === bR9\[i9\]\)\) continue; \/\/ no divergence — no file/.test(src))
    errors.push("the raster judge left the state-cut road — undiverged forks would ship files and defaults drift (round 53, S44)");
  if (!/if \(\(await svgEdgeAlphaMax\(stSpr9, PNG_SCALE\)\.catch\(\(\) => 255\)\) > 1\) continue;/.test(src))
    errors.push("the outgrown-window sit-out left the state-cut road — a size/rotation fork would ship clipped art (round 53, S44)");
  if (!/seat9\[`\$\{stName\}File`\] = `assets\/\$\{famPath\(`\$\{uid\}\/\$\{partS9\}\.png`\)\}`;/.test(src))
    errors.push("the seat row no longer wires the state file — the importer can't arm the swap (round 53, S44)");
  if (!/public string hoverFile; public string pressedFile; public string disabledFile;/.test(cs))
    errors.push("PBIconChild lost the per-state file fields — JsonUtility drops the swap wiring in SILENCE (round 53, S44)");
  if (!/public class GlyphSwap \{\s*\n\s*public Image target;\s*\n\s*public Sprite rest, hover, pressed, disabled;/.test(fx)
      || !/public GlyphSwap\[\] glyphSwaps;/.test(fx))
    errors.push("StateFx lost the GlyphSwap rig fields — the per-state dress has nowhere to live (round 53, S44)");
  if (!/void PushGlyphSwaps\(\) \{/.test(fx)
      || !/PushGlyphSwaps\(\);\s*\n\s*\/\/ the live children ride/.test(fx)
      || !/if \(cur != null && cur != gsWrote\[i\] && cur != g\.rest && cur != g\.hover && cur != g\.pressed && cur != g\.disabled\) g\.rest = cur;/.test(fx))
    errors.push("the runtime swap (Push-driven, with the dev-re-sprite adoption rule) left StateFx — the shipped state dress never appears, or a dev's re-sprite fights the rig (round 53, S44)");
  if (!/\(g\.target\.sprite == g\.hover \|\| g\.target\.sprite == g\.pressed \|\| g\.target\.sprite == g\.disabled\)\) g\.target\.sprite = g\.rest;/.test(fx))
    errors.push("OnDisable no longer restores the resting dress — a disabled piece freezes a state sprite onto the child (round 53, S44)");
  if (!/static void WireGlyphStateSwaps\(GameObject go, string root, PBManifest m, string family\) \{/.test(cs)
      || !/WireGlyphStateSwaps\(go, root, m, baseAsset\.component\);/.test(cs)
      || !/if \(fx\.glyphSwaps != null && fx\.glyphSwaps\.Length > 0\) return; \/\/ armed — and thereafter yours/.test(cs))
    errors.push("the importer no longer arms the glyph swap after WireIconChildren (or lost the armed-once keep-theirs) (round 53, S44)");
  if (!/static void RetargetGlyphSwaps\(GameObject inst, Image gImg, Sprite glyphSp\) \{/.test(cs)
      || (cs.match(/RetargetGlyphSwaps\(inst, gImg, glyphSp\);/g) ?? []).length < 2)
    errors.push("the fleet variants no longer neutralize an inherited swap — hover would paint the BASE's glyph over a variant's own (round 53, S44)");
}

/* ── ROUND 53 follow-on · S45 (the same landmine one ring out): an
   INHERIT-mode glyph whose ink changes through a state's TYPE fork (no
   icon fork stored) must qualify for a state cut too — the typeKT road
   afb0457 wired app-side. A pinned icon color blocks the type's reach
   (the app's own resolution), and the renderer's universal disabled-gray
   repaint is deliberately NOT a gate (the disabled contract, not a
   maker-pinned divergence — gating on it would grow every kit carrying
   any disabled fork). The raster judge stays the final arbiter, which is
   what keeps every default byte-identical. ── */
{
  if (!/\|\| \(!!sdG9\.type && !\(sdG9\.icon \?\? cfgG9\.icon\)\?\.color/.test(src))
    errors.push("the inherit-ink arm lost its custom-color block — a pinned icon color would falsely qualify type forks (round 53 follow-on, S45)");
  if (!/sdG9\.type\.fillMode !== cfgG9\.type\.fillMode/.test(src)
      || !/sdG9\.type\.fill !== cfgG9\.type\.fill/.test(src)
      || !/\(sdG9\.type\.fillMode === "gradient" && sdG9\.type\.fill2 !== cfgG9\.type\.fill2\)/.test(src)
      || !/JSON\.stringify\(sdG9\.type\.outline\) !== JSON\.stringify\(cfgG9\.type\.outline\)/.test(src))
    errors.push("the inherit-ink arm no longer compares the voiced ink (fillMode/fill/gradient fill2/outline) — a state's type recolor on an inheriting glyph ships no cut again (round 53 follow-on, S45)");
  if (!/NOT a gate: the renderer's universal\s*\n\s*disabled-gray repaint/.test(src))
    errors.push("the universal-disabled-gray exclusion lost its contract note — the next hand may gate on it and grow every kit with a disabled fork (round 53 follow-on, S45)");
}

/* ── ROUND 54 · S46 (the owner: "definitely want Unity to gray the glyph
   on disabled buttons"): the app's universal disabled contract — a SOLID
   #A7AAB4 silhouette on every family's glyph — travels as ONE class-wide
   runtime mechanism: the shipped UIKitMaker/DisabledInk shader (solid
   ink, sprite coverage), one material minted per kit at import, worn by
   every glyph swap target on disable and removed EXACTLY on enable.
   Never per-glyph baked grays — the S45 note now points here. ── */
{
  if (!/const DISABLED_INK_SHADER = `Shader "UIKitMaker\/DisabledInk" \{/.test(src)
      || !/return fixed4\(_Color\.rgb, a \* _Color\.a\);/.test(src))
    errors.push("the DisabledInk shader left the exporter (or lost its solid-silhouette contract: rgb = ink, alpha = coverage) (round 54, S46)");
  if (!/files\.push\(\{ path: "Runtime\/UIKitDisabledInk\.shader", data: DISABLED_INK_SHADER \}\);/.test(src)
      || !/"Runtime\/UIKitGlintInk\.shader", "Runtime\/UIKitDisabledInk\.shader",/.test(src))
    errors.push("Runtime/UIKitDisabledInk.shader no longer ships (or left the shared-scripts set — per-slug copies would collide) (round 54, S46)");
  if (!/travels CLASS-WIDE at runtime/.test(src))
    errors.push("the S45 contract note no longer points at the runtime mechanism — the next hand may re-bake per-glyph grays (round 54, S46)");
  if (!/console\.warn\(`engine export: \$\{uid\}'s \$\{stName\} state failed to render/.test(src)
      || !/console\.warn\(`engine export: \$\{famV\}'s \$\{stName\} state failed to render/.test(src))
    errors.push("the stateShell catches went quiet again — silent skin-dropping deserves an alarm (r53 reviewer rider) (round 54, S46)");
  if (!/public Material disabledInkMaterial;/.test(fx))
    errors.push("StateFx lost the disabled-ink material field — no gray on disable (round 54, S46)");
  if (!/gsPrevMat\[i\] = m0 == g\.target\.defaultMaterial \? null : m0;/.test(fx)
      || !/g\.target\.material = disabledInkMaterial;/.test(fx)
      || !/if \(g\.target\.material == disabledInkMaterial\) g\.target\.material = gsPrevMat\[i\];/.test(fx))
    errors.push("the ink apply/exact-restore left StateFx — a dev's own material would be lost, or the gray never lands (round 54, S46)");
  if (!/void OnCanvasGroupChanged\(\) \{ if \(rt == null\) return; Retarget\(\); Push\(false\); \}/.test(fx))
    errors.push("the CanvasGroup-disable hook left StateFx — a group-disabled button keeps its resting colors (round 54, S46)");
  if (!/glyphSwaps\[i\]\.target\.material == disabledInkMaterial\)\s*\n\s*glyphSwaps\[i\]\.target\.material = gsPrevMat\[i\];/.test(fx))
    errors.push("OnDisable no longer takes the ink off — a pooled piece would wake gray (round 54, S46)");
  if (!/static Material EnsureDisabledInkMaterial\(string root\) \{/.test(cs)
      || !/var path = root \+ "\/fonts\/Disabled Ink\.mat";/.test(cs)
      || !/if \(want != null && mat\.shader != want\) \{ mat\.shader = want; EditorUtility\.SetDirty\(mat\); \}/.test(cs)
      || !/if \(fx\.disabledInkMaterial == null\) fx\.disabledInkMaterial = EnsureDisabledInkMaterial\(root\);/.test(cs))
    errors.push("the one-material-per-kit Ensure road (mint, upgrade-in-place, arm) left the importer (round 54, S46)");
  if (!/if \(icGS\.btn \|\| icGS\.wellR > 0\.5f \|\| !string\.IsNullOrEmpty\(icGS\.tint\)\) continue;/.test(cs))
    errors.push("the plain-seat filter left WireGlyphStateSwaps — buttons, wells or tinted marks would gray against the app (round 54, S46)");
  if (!/a rest-only entry rides too now/.test(cs) || /if \(g\.hover != null \|\| g\.pressed != null \|\| g\.disabled != null\) swaps\.Add\(g\);/.test(cs))
    errors.push("rest-only glyph seats left the swap roster — the disabled ink reaches only forked buttons (round 54, S46)");
}

/* ── ROUND 55 · S47 (the Crown Coin joins the rack and the fleet — the
   owner's bay bless: "coin looks amazing, I approved it in staging"):
   crowncoin leaves SEAT_SIT_OUT, so the shared list gives it the
   icon:glyph seat AND generates gbtncrowncoin (auto-staged — its own bay
   act before anything ships). Its flat d is deliberately a plain disc,
   so the seat is the COUNTER-RELIEF cut: glyphSeatIcon knocks the
   registry's relief face mask out of the silhouette (evenodd) — one
   ink, readable at every seat size; glyphs without a relief seat byte-
   identically as before. Fleet counts are registry-derived everywhere —
   no pin here or in the fences may hard-code the roster size. ── */
{
  const mdSrc47 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/generator/model.ts"), "utf8");
  if (!/export const SEAT_SIT_OUT = \["coinsingle", "coinpile", "starformation"\];/.test(mdSrc47))
    errors.push("SEAT_SIT_OUT no longer matches the owner's ledger — crowncoin was blessed OUT of it (or a new sit-out landed unpinned) (round 55, S47)");
  if (!/const dSeat = g\.relief\?\.face \? `\$\{g\.d\} \$\{g\.relief\.face\}` : g\.d;/.test(mdSrc47)
      || !/fill-rule="evenodd"/.test(mdSrc47))
    errors.push("glyphSeatIcon lost the counter-relief seat (relief face knocked out of the flat disc, evenodd) — the Crown Coin's seat reads as a featureless circle again (round 55, S47)");
  if (!/\{ id: "crowncoin", name: "Crown Coin"/.test(glyphLibSrc)
      || !/relief: \{/.test(glyphLibSrc))
    errors.push("the Crown Coin's registry entry (or its relief masks) left glyphLibrary — the released glyph loses its art (round 55, S47)");
}

/* ── ROUND 57-58 · S48 (the bar seam saga, ended by the owner's pivot):
   round 57's cap-composite seam ("we have to drop the 'add a cap'
   approach and maybe consider masking or mathing") begat a shader
   capsule — which REAL Unity then rendered as a FLAT SQUARED cut with a
   stationary mask (UGUI's canvas batcher rebases v.vertex into CANVAS
   space, so rect-local window params resolve at the canvas origin; the
   r58 GPU harness reproduced every field artifact). The owner ended the
   class: "with 9 slice we won't need the mask." ROUND 58, the WIDTH
   ROAD: the windowed mercury ships as a BORDERED STADIUM — band-true
   9-slice caps cut from the body/band stamps, a MEASURED center mode
   (sliced where the center is flat/gradient art, tiled to WHOLE
   measured pattern periods where it patterns) — and KitBarFill drives
   the fill RECT'S WIDTH with the bead-safe floor clamp; the vsbar ramp
   keeps the proven r47 stretch road (cap bead + nub pill, un-gated
   again), and older zips keep their shipped roads byte for byte. The
   shader apparatus must STAY dead. ── */
{
  { /* the dead road stays dead — "BarClip" may appear ONLY inside the
       relic HEAL that buries it (reviewer F1: an r57-imported project
       re-imported under r58 kept the stray shader + the minted material
       with its razor default window, and every linear bar vanished) */
    const scrub = (t) => {
      const a = t.indexOf("ROUND 58 relic heal");
      const b = t.indexOf("static Material EnsureDisabledInkMaterial", a);
      const out = a >= 0 && b > a ? t.slice(0, a) + t.slice(b) : t;
      return out.split("HealBarClipRelics(root);").join(""); // the one sanctioned call site
    };
    if (/BarClip|BAR_CLIP|clipMaterial|bandV0|ApplyClip\(/.test(scrub(src)) || /BarClip|clipMaterial/.test(scrub(cs)))
      errors.push("the dead shader road came back — outside the relic heal, BarClip/clipMaterial must not exist anywhere (round 58, S48: real Unity drew it as a flat squared cut; the canvas batcher owns v.vertex)");
    if (!/static void HealBarClipRelics\(string root\) \{/.test(cs)
        || !/HealBarClipRelics\(root\);/.test(cs)
        || !/AssetDatabase\.DeleteAsset\(root \+ "\/fonts\/Bar Clip\.mat"\);/.test(cs)
        || !/AssetDatabase\.DeleteAsset\(root \+ "\/Runtime\/UIKitBarClip\.shader"\);/.test(cs))
      errors.push("the r57 relic heal (or its stray deletions) left the importer — a re-import over an r57 project keeps invisible razor bars (reviewer F1; round 58, S48)");
    const clearAt = cs.indexOf("imBC.material = null;");
    const gateAt = clearAt > 0 ? cs.lastIndexOf('m9BC.shader.name == "UIKitMaker/BarClip"', clearAt) : -1;
    if (!(clearAt > 0 && gateAt > 0 && clearAt - gateAt < 240) || (cs.match(/imBC\.material = null;/g) ?? []).length !== 1)
      errors.push("the heal's material-clear escaped its ours-only gate — a dev's own fill material could be wiped (round 58, S48 scope discipline)");
    const delMatAt = cs.indexOf('AssetDatabase.DeleteAsset(root + "/fonts/Bar Clip.mat");');
    if (!(delMatAt > clearAt))
      errors.push("the heal deletes the stray material BEFORE the shader-name test — relics stop being provably ours (round 58, S48 ordering)");
  }
  if (!/barMode\?: "tiled" \| "sliced";/.test(src)
      || !/const analyzeBarCenter = async \(/.test(src)
      || !/q\.meta\.nineSlice = bar58\.nineSlice;/.test(src)
      || !/q\.meta\.barMode = q\.meta\.component === "vsbar" \? "sliced" : bar58\.mode;/.test(src))
    errors.push("the width road's border cutter left the exporter — fills stop shipping band-true 9-slice caps and a measured center mode, or the vsbar RAMP lost its by-design Sliced squeeze (round 58+60, S48)");
  if (!/const left = Math\.round\(body\.x \+ r\);/.test(src)
      || !/const right = Math\.round\(\(w - body\.x - body\.w\) \+ r\);/.test(src))
    errors.push("the borders drifted off bleed + r EXACTLY — the owner's zero point stops being a perfect circle (pads and snaps may never widen a cap border) (round 58, S48)");
  if (/q\.meta\.component !== "vsbar"/.test(src))
    errors.push("the vsbar exclusion came back — the ramp rides the width road now: Sliced center compression IS the app's squeeze, and the detached drain bead was the owner's round-60 field conviction (round 60, S48)");
  if (!/public int barMode = 0;/.test(src) || !/\[Range\(0f, 1f\)\]\n\s*\[Tooltip[^\n]*\n\s*public float value = -1f;/.test(src)
      || !/void ApplyWidth\(float v\) \{/.test(src)
      || !/var wantType = barMode == 2 && v \* areaW > minInk \+ 1f \? Image\.Type\.Tiled : Image\.Type\.Sliced;/.test(src))
    errors.push("KitBarFill lost the width road — barMode / the [Range] value slider / ApplyWidth / the measured center type with its degenerate-floor Sliced rung (the owner's perfect circle) (round 58, S48)");
  if (!/float minInk = Mathf\.Max\(2f, \(bd\.x \+ bd\.z\) \* sScale - mL - mR\);/.test(src)
      || !/float w = Mathf\.Max\(v \* areaW, minInk\) \+ mL \+ mR;/.test(src))
    errors.push("the width road lost its FLOOR — below one cap-diameter of run a bordered sprite squashes its bead (the owner's field screenshots: fat stadium ends) (round 58, S48)");
  if (!/if \(barMode != 0 && !stretchRun && fill\.sprite != null\) \{/.test(src)
      || !/public void SetValue\(float v\) \{ value = Snap\(v\); Apply\(\); \}/.test(src)
      || !/void OnValidate\(\) \{/.test(src)
      || !/UnityEditor\.EditorApplication\.delayCall \+= \(\) => \{ if \(this != null && isActiveAndEnabled\) Apply\(\); \};/.test(src)
      || !/if \(!Mathf\.Approximately\(fill\.fillAmount, wroteFill\)\) \{ value = Snap\(fill\.fillAmount\); Apply\(\); \}/.test(src))
    errors.push("Apply/SetValue/LateUpdate no longer route the width road (or lost its staged pose / the fillAmount adoption contract) (round 58, S48)");
  if (!/data-fillbody="\$\{fo\.box\[0\]\.toFixed\(1\)\} \$\{fo\.box\[2\]\.toFixed\(1\)\} \$\{\(fo\.box\[1\] \+ riseU\)\.toFixed\(1\)\} \$\{fo\.box\[3\]\.toFixed\(1\)\}"/.test(src)
      || !/data-fillbody="\$\{gx\.toFixed\(1\)\} \$\{gw\.toFixed\(1\)\} \$\{\(gy \+ riseMR\)\.toFixed\(1\)\} \$\{gh\.toFixed\(1\)\}"/.test(src)
      || !/Number\.isFinite\(fby\) && Number\.isFinite\(fbh\) && fbh > 1/.test(src))
    errors.push("the four-number data-fillbody stamp (universal riseU / rails riseMR — the stamps speak the PRE-SHIFT frame) or its y/h parse left the exporter — the band truth feeding the border cutter dies (round 57-58, S48)");
  if (!/bool widthRoad = fImg\.sprite != null && \(fImg\.sprite\.border\.x \+ fImg\.sprite\.border\.z\) > 1f;/.test(cs)
      || !/if \(!widthRoad && capSp != null\) \{/.test(cs)
      || !/if \(!widthRoad && nubSp != null && capSp != null\) \{/.test(cs))
    errors.push("WireBarCap lost the width-road fork — bordered stadiums (the ramped vsbar included, round 60) would mount cap/nub children again, or border-less legacy zips would lose theirs (round 58+60, S48)");
  if (!/kbf\.barMode = rowF\.barMode == "tiled" \? 2 : \(rowF\.barMode == "sliced" \? 1 : 0\);/.test(cs))
    errors.push("WireBarBodies no longer arms the measured center mode from the manifest (round 58, S48)");
  if (!/public string barMode; \}/.test(cs))
    errors.push("PBAsset lost the barMode field — JsonUtility drops the mode and every bar falls back sliced (round 58, S48)");
  if (!/UnityEditor\.Events\.UnityEventTools\.AddPersistentListener\(slSR\.onValueChanged, kbSR\.SetValue\);/.test(cs))
    errors.push("the setrow Slider lost its onValueChanged → SetValue wire — a non-Filled fillRect drives ANCHORS and fights the width road (round 58, S48)");
  if (!/var nubGo = new GameObject\("Nub"/.test(cs) || !/kbf\.stretchRun = true;/.test(cs))
    errors.push("the vsbar ramp lost its r47 rungs — the cap bead + nub pill are LIVE again on the ramped class (round 58, S48)");
  /* the DEV CONTRACT (the owner: bars "wired in a way that a dev
     expects"): the slider previews in edit mode, the Slider control
     drives the rig visibly, the API surface holds across import eras,
     and no shipped sentence describes the dead Filled-scissor road. */
  if (!/SetPersistentListenerState\(slSR\.onValueChanged\.GetPersistentEventCount\(\) - 1, UnityEngine\.Events\.UnityEventCallState\.EditorAndRuntime\);/.test(cs))
    errors.push("the setrow Slider's listener fell back to RuntimeOnly — a dev dragging it in EDIT mode sees a dead mercury (round 58, S48)");
  for (const api of ["public Image fill;", "public bool fromRight;", "public int snapSteps = 0;", "public bool stretchRun;", "public float bodyU0 = 0f;", "public float capU0 = 0f;", "public void SetValue(float v)", "public void Apply()"])
    if (!src.includes(api))
      errors.push(`KitBarFill's public API lost "${api}" — a dev's script written against an older import must run unchanged (round 58, S48)`);
  if (/drive fillAmount or KitBarFill\.SetValue|drive Fill's fillAmount|Filled fill with the rounded head/.test(src))
    errors.push("a shipped sentence still teaches the dead Filled-scissor road — the doc sweep regressed (round 58, S48)");
  if (!/Every KitBarFill carries a Value slider in the Inspector/.test(src)
      || !/a bar parked\nunder a LayoutGroup re-runs that group's layout on every change/.test(src))
    errors.push("the QuickStart lost the slider-first contract or the honest LayoutGroup cost note (round 58, S48)");
}

/* ── ROUND 59 · S49 (the GlintInk wrong-frame audit — the BarClip
   post-mortem's queued follow-up): the canvas batcher rebases v.vertex
   into CANVAS space, so GlintInk's `o.lpos` is label space only for a
   label parked on the canvas origin — off it, the wipe-shine VANISHED,
   crawled against movement near the origin, and mis-sized under scale
   (the r59 GPU harness, five exhibits). The contract now: the frag
   consumes lpos ONLY through the _C2L canvas→label affine that
   HeroLabel's DressLive refreshes every frame (identity defaults keep
   the shader safe standalone); no shipped shader may consume a
   positional varying raw ever again — GlintInk carries the fleet's ONE
   lpos, reconstructed, and DisabledInk stays position-free. ── */
{
  if (!/_C2L0 \("Canvas to label, row 0 \(HeroLabel\)", Vector\) = \(1,0,0,0\)/.test(src)
      || !/float4 _C2L0, _C2L1;/.test(src)
      || !/float2 lp = float2\(dot\(_C2L0\.xy, i\.lpos\) \+ _C2L0\.z, dot\(_C2L1\.xy, i\.lpos\) \+ _C2L1\.z\);/.test(src)
      || !/float2 p = float2\(lp\.x - _Cx, -\(lp\.y - _Cy\)\);/.test(src))
    errors.push("GlintInk lost the canvas→label reconstruction — off-origin labels lose their wipe-shine again (round 59, S49)");
  if (/i\.lpos\.x - _Cx/.test(src))
    errors.push("GlintInk consumes lpos RAW again — the batcher owns v.vertex; label space must come back through _C2L (round 59, S49)");
  if (!/var miG = \(cvG\.transform\.worldToLocalMatrix \* t\.rectTransform\.localToWorldMatrix\)\.inverse;/.test(src)
      || !/m\.SetVector\("_C2L0", new Vector4\(miG\.m00, miG\.m01, miG\.m03, 0f\)\);/.test(src)
      || !/m\.SetVector\("_C2L1", new Vector4\(miG\.m10, miG\.m11, miG\.m13, 0f\)\);/.test(src))
    errors.push("DressLive no longer hands the shader the per-frame canvas→label affine — scrolls and board poses would shear the shine (round 59, S49)");
  const lposAssigns = (src.match(/o\.lpos = v\.vertex/g) ?? []).length;
  if (lposAssigns !== 1)
    errors.push(`the fleet's positional-varying census moved (${lposAssigns} lpos assignments; the contract is exactly 1, GlintInk's, reconstructed) — a new shader is assuming the frame the batcher destroys (round 59, S49)`);
  if (!/o\.vertex = UnityObjectToClipPos\(v\.vertex\); o\.texcoord = v\.texcoord; o\.color = v\.color; return o;/.test(src))
    errors.push("DisabledInk grew beyond its position-free vert — re-audit it against the batcher frame (round 59, S49)");
}

/* ── ROUND 60 · S50 (the owner's second field round: "There are still
   yet problems with the loading bars… maybe the change hasn't
   proliferated" — their zooms convicted the VS bar's DETACHED drain
   bead, the last cap-composite family on a fresh export): the vsbar
   rides the width road (Sliced ramp squeeze, per-side floor circle,
   no Cap/Nub children on fresh builds), cap-composite anatomy is
   ABSENT EVERYWHERE by census — standalone bars and every embedded
   sub-rig route through the ONE legacy-gated mount — and there is NO
   self-heal for existing projects (the owner's explicit cut: fresh
   exports clean is the whole bar; kept prefabs are the dev's). ── */
{
  /* the census: exactly ONE "Cap" mount (WireBarCap's !widthRoad legacy
     rung) and exactly TWO "Nub" mounts (that rung + the r47 kept-prefab
     arrival graft). Every fill emission — BuildBarFill, WireNamedRails,
     VsBarPrefab, the slider, every graft — routes through WireBarCap,
     so a new cap-composite mount ANYWHERE moves these counts. */
  const capMounts = (cs.match(/new GameObject\("Cap",/g) ?? []).length;
  const nubMounts = (cs.match(/new GameObject\("Nub",/g) ?? []).length;
  if (capMounts !== 1)
    errors.push(`the cap-composite census moved (${capMounts} Cap mounts; the contract is exactly 1, WireBarCap's legacy-gated rung) — some rig is mounting a detached drain bead again (round 60, S50)`);
  if (nubMounts !== 2)
    errors.push(`the nub census moved (${nubMounts} Nub mounts; the contract is exactly 2 — WireBarCap's legacy rung + the r47 kept-prefab graft) — some rig is mounting a squash pill again (round 60, S50)`);
  if (/HealCapCompositeRelics/.test(cs))
    errors.push("a cap-composite self-heal appeared in the importer — the owner CUT self-heal for existing projects (fresh exports clean is the whole bar; kept prefabs belong to the dev) (round 60, S50)");
  if (!/if \(kbT\.floorSprite != null \|\| \(fiI\.sprite\.border\.x \+ fiI\.sprite\.border\.z\) > 1f\) continue;/.test(cs))
    errors.push("the r47 ramp graft lost its width-road exclusion — a first import would read the fresh Sliced VsBar as a round-44 rig awaiting its nub and re-save it with a false log (round 60, S50)");
  /* the RAMP'S FLOOR SWAP: below one cap-diameter the ONE mercury Image
     wears the authored one-head stadium (the r47 nub atom) instead of
     seaming the gradient's two end-borders together; geometry always
     measures off the bordered mercury, and flat families never arm it. */
  if (!/public Sprite floorSprite;/.test(src) || !/public Sprite mercurySprite;/.test(src))
    errors.push("KitBarFill lost the ramp's floor-swap fields — the vsbar floor seams the gradient's two ends together again (round 60, S50)");
  if (!/var geoSp = mercurySprite != null \? mercurySprite : fill\.sprite;/.test(src)
      || !/float texW = Mathf\.Max\(1f, geoSp\.rect\.width\), texH = Mathf\.Max\(1f, geoSp\.rect\.height\);/.test(src)
      || !/var bd = geoSp\.border;/.test(src))
    errors.push("ApplyWidth measures off the WORN sprite — at the floor the borderless atom would re-derive a different floor and flip-flop (round 60, S50)");
  if (!/bool atFloor = floorSprite != null && mercurySprite != null && v \* areaW < minInk - 0\.5f;/.test(src)
      || !/if \(atFloor\) wantType = Image\.Type\.Simple;/.test(src)
      || !/var wear = atFloor \? floorSprite : mercurySprite;\s*\n\s*if \(fill\.sprite != wear\) fill\.sprite = wear;/.test(src))
    errors.push("the floor swap left ApplyWidth — the ramp's sub-floor range shows the hard mid-seam the round-60 receipts named (round 60, S50)");
  if (!/if \(widthRoad && nubSp != null\) \{\s*\n\s*kbf\.floorSprite = nubSp;\s*\n\s*kbf\.mercurySprite = fImg\.sprite;/.test(cs))
    errors.push("WireBarCap no longer arms the ramp's floor swap — fresh vsbars lose their authored floor ink (round 60, S50)");
  /* the vsbar's two-sided width road: each fighter one bordered stadium
     growing from its own end toward center, each side its own KitBarFill
     (Value slider / SetValue — WireBarCap + WireBarBodies per lane),
     the Medal/Words center rig untouched. */
  if (!/WireBarCap\(area, fi, root, "vsbar", false, 0\.72f\);/.test(cs)
      || !/WireBarCap\(area, fi, root, "vsbar", true, 0\.58f\);/.test(cs))
    errors.push("the VsBar lanes left WireBarCap — a side would hand-roll its mercury outside the width-road fork (round 60, S50)");
  if (!/fi\.fillOrigin = \(int\)Image\.OriginHorizontal\.Right;/.test(cs))
    errors.push("the right fighter lost its from-the-right growth — both mercuries would grow from the left and the drain edges swap ends (round 60, S50)");
  if (!/var mgo = ImageObject\("Medal", medal, pngScale\);/.test(cs) || !/WireTextSeats\(mgo, root, m, pngScale\);/.test(cs))
    errors.push("the VsBar's Medal/Words center rig moved — round 60 converts the mercuries only (round 60, S50)");
  if (!/if \(kbV != null\) kbV\.SetValue\(Mathf\.Clamp01\(it\.value\)\);\s*\n\s*else if \(vlI\.type == Image\.Type\.Filled\) vlI\.fillAmount = Mathf\.Clamp01\(it\.value\);/.test(cs))
    errors.push("the board's vsbar pose lost its rig-first write — a Filled-only gate silently drops poses on the Sliced width road (round 60, S50)");
  /* the shipped words keep the road honest: the fill atoms teach the
     Value slider, the cap atoms say LEGACY out loud, and the nub rows
     teach their new job — the floor ink. */
  if (!/Left fighter's mercury — a bordered stadium driven by WIDTH/.test(src)
      || !/LEGACY drain bead/.test(src) || !/The FLOOR ink — the live draw at run = one bar height/.test(src))
    errors.push("the vsbar atoms' usage rows stopped teaching the width road (the caps' LEGACY marking or the nubs' floor-ink job) (round 60, S50)");
}

if (errors.length) {
  console.error("unity-importer guard FAILED — the emitted C# would not compile in Unity:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(`unity-importer guard: OK (${lines.length} lines, ${normalizers} path normalizers, all literals terminate)`);
