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

if (errors.length) {
  console.error("unity-importer guard FAILED — the emitted C# would not compile in Unity:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(`unity-importer guard: OK (${lines.length} lines, ${normalizers} path normalizers, all literals terminate)`);
