/* Kit paperwork — the README, the settings file and the font licence that
   travel inside every kit export.

   Two jobs. First, the RECIPE: a human-readable spec of every value that
   made this kit, so someone can rebuild it by hand in any tool without the
   app. That includes the numbers the editor deliberately hides once a look
   is dialled in (raw colour roles, gloss geometry, specular placement) —
   hidden is a UI decision, not a secrecy one, and a designer handed a kit
   deserves the whole formula.

   Second, COMPLIANCE. The SVG pack embeds the type face so text renders
   out of the box, and embedding is redistribution: the SIL Open Font
   License requires its terms to travel with the font. They now do.

   All of this is plain string work in the browser — no server, no cost. */

import type { GenConfig, GenStateName } from "./model";
import { STATE_NAMES, fontByName } from "./model";

const pct = (n: number | undefined) => (n === undefined ? "—" : `${Math.round(n)}%`);
const px = (n: number | undefined) => (n === undefined ? "—" : `${Math.round(n * 10) / 10}px`);
const onOff = (b: boolean | undefined) => (b ? "on" : "off");

/** Every family this kit actually uses — master face plus any per-component
    type forks the user set. */
export function kitFontFamilies(cfg: GenConfig, extra: string[] = []): string[] {
  return [...new Set([cfg.type.font, ...extra].filter(Boolean))];
}

/* ── the recipe ──────────────────────────────────────────────────── */

export function kitSpecMarkdown(cfg: GenConfig, kitName: string): string {
  const C = cfg.candy;
  const T = cfg.type;
  const roles = Object.entries(cfg.effects).filter(([, v]) => !!v);
  const liveStates = STATE_NAMES.filter(
    (s) => s === "default" || cfg.visible[s as Exclude<GenStateName, "default">],
  );

  const L: string[] = [];
  L.push(`# ${kitName} — the full recipe`, "");
  L.push(
    "Every value that made this kit. Rebuild it by hand in any tool, hand it",
    "to a teammate, or drop `settings.json` back into UI Kit Maker to pick up",
    "exactly where this left off.",
    "",
    "---",
    "",
  );

  L.push("## Colour roles", "");
  L.push("The five wells everything else derives from. Change a role and every", "layer that borrows it follows.", "");
  L.push("| Role | Hex | Used by |", "|---|---|---|");
  const roleUse: Record<string, string> = {
    "Bevel": "shell walls, extrusion body, knobs",
    "Glow": "auras, inner glow, lit fills",
    "Inner Fill": "the candy face, wells",
    "Highlight": "gloss, specular, rim light",
    "Shadow": "grounding, cast shadow, dark ink",
  };
  roles.forEach(([k, v]) => L.push(`| ${k} | \`${v}\` | ${roleUse[k] ?? "—"} |`));
  L.push("", `Canvas / stage: \`${cfg.canvas}\``, "");

  L.push("## Silhouette & shell", "");
  L.push("| Setting | Value |", "|---|---|");
  L.push(`| Shape | ${cfg.shape} |`);
  L.push(`| Bevel width | ${cfg.bevel.off ? "off" : px(cfg.bevel.width)} |`);
  L.push(`| Bevel softness | ${cfg.bevel.softness} |`);
  L.push(`| Face mode | ${cfg.face.mode} |`);
  L.push(`| Face contrast | ${pct(cfg.face.contrast)} |`);
  L.push(`| Face midpoint | ${pct(cfg.face.midpoint)} |`);
  L.push(`| Rim width / brightness | ${px(C.rim.width)} · ${pct(C.rim.brightness)} |`);
  L.push(`| Inner edge strength / width | ${pct(C.innerEdge.strength)} · ${px(C.innerEdge.width)} |`);
  L.push("");

  L.push("## Depth & light", "");
  L.push("| Setting | Value |", "|---|---|");
  L.push(`| Light angle | ${cfg.lighting.angle}° |`);
  L.push(`| Highlight / lowlight | ${cfg.lighting.highlight} · ${cfg.lighting.lowlight} |`);
  if (cfg.lighting.tint) L.push(`| Light tint | \`${cfg.lighting.tint}\` |`);
  L.push(`| Extrusion depth | ${px(C.extrusion.depth)} |`);
  L.push(`| Extrusion darkness | ${pct(C.extrusion.darkness)} |`);
  L.push(`| Extrusion base glow | ${pct(C.extrusion.glow)} |`);
  L.push(`| Bloom opacity / size | ${pct(C.bloom.opacity)} · ${pct(C.bloom.size)} |`);
  L.push(`| Contact shadow | ${pct(C.contact.opacity)} |`);
  L.push(`| Cast shadow | distance ${px(cfg.shadow.distance)} · blur ${cfg.shadow.blur} · ${pct(cfg.shadow.opacity)} |`);
  L.push(`| Inner glow | ${pct(C.innerGlow.opacity)} at size ${pct(C.innerGlow.size)}${C.innerGlow.color ? ` · \`${C.innerGlow.color}\`` : " · follows Glow"} |`);
  L.push("");

  L.push("## Surface", "");
  L.push("| Setting | Value |", "|---|---|");
  L.push(`| Gloss | ${onOff(C.gloss.on)} · height ${pct(C.gloss.height)} · curve ${C.gloss.curve} · opacity ${pct(C.gloss.opacity)} · softness ${pct(C.gloss.softness)} · ${C.gloss.layer} the face |`);
  L.push(`| Gloss fill | ${C.gloss.fill}${C.gloss.fill === "gradient" ? ` (\`${C.gloss.tint}\` → \`${C.gloss.tint2}\`)` : C.gloss.fill === "custom" ? ` (\`${C.gloss.tint}\`)` : " (follows Highlight)"} |`);
  L.push(`| Specular | ${onOff(C.specular.on)} · ${C.specular.mode} · size ${px(C.specular.size)} · stretch ${pct(C.specular.stretch)} · intensity ${pct(C.specular.intensity)} · softness ${pct(C.specular.softness)} |`);
  L.push(`| Specular placement | angle ${C.specular.angle}° · gap ${C.specular.gap} · nudge ${C.specular.ox} / ${C.specular.oy} |`);
  L.push(`| Pattern | ${C.pattern.type}${C.pattern.type === "none" ? "" : ` · scale ${pct(C.pattern.scale)} · angle ${C.pattern.angle}° · opacity ${pct(C.pattern.opacity)}${C.pattern.color ? ` · \`${C.pattern.color}\`` : " · tone-on-tone"}`} |`);
  L.push(`| Texture (micro grain) | amount ${pct(C.texture.amount)} · scale ${pct(C.texture.scale)} |`);
  L.push(`| Transparency | frame ${pct(cfg.transparency.frame)} · interior ${pct(cfg.transparency.interior)} · content ${pct(cfg.transparency.content)} |`);
  L.push("");

  L.push("## Typography", "");
  const fdef = fontByName(T.font);
  L.push("| Setting | Value |", "|---|---|");
  L.push(`| Face | ${T.font}${fdef?.css ? ` — https://fonts.google.com/specimen/${T.font.replace(/ /g, "+")}` : " (system)"} |`);
  L.push(`| Size / weight | ${px(T.size)} · ${T.weight} |`);
  L.push(`| Italic / case / tracking | ${onOff(T.italic)} · ${T.case} · ${T.spacing / 100}em |`);
  L.push(`| Fill | ${T.fillMode}${T.fillMode === "gradient" ? ` (\`${T.fill}\` → \`${T.fill2}\`)` : T.fillMode === "solid" ? ` (\`${T.fill}\`)` : ""} · opacity ${pct(T.fillOpacity)} |`);
  L.push(`| Outline | ${onOff(T.outline.on)}${T.outline.on ? ` · \`${T.outline.color}\`${T.outline.color2 ? ` → \`${T.outline.color2}\`` : ""} · ${px(T.outline.width)}` : ""} |`);
  L.push(`| Text shadow | ${onOff(T.shadow.on)}${T.shadow.on ? ` · \`${T.shadow.color}\` · ${T.shadow.x}/${T.shadow.y} · blur ${T.shadow.blur} · ${pct(T.shadow.opacity)}` : ""} |`);
  L.push(`| Emboss | ${onOff(T.emboss.on)}${T.emboss.on ? ` · strength ${T.emboss.strength} · distance ${px(T.emboss.distance)} · softness ${T.emboss.softness}` : ""} |`);
  L.push(`| Text glow | ${onOff(T.glow.on)}${T.glow.on ? ` · \`${T.glow.color}\` · size ${T.glow.size} · ${pct(T.glow.opacity)}` : ""} |`);
  if (T.highlight) L.push(`| Highlight phrase | "${T.highlight}" at ${pct(T.highlightBoost ?? 70)} |`);
  L.push("");

  L.push("## States", "");
  L.push("Each state is the default design plus these adjustments.", "");
  L.push("| State | Brightness | Saturation | Glow | Lift | Opacity |", "|---|---|---|---|---|---|");
  liveStates.forEach((s) => {
    const a = cfg.states[s];
    if (!a) return;
    L.push(`| ${s} | ${a.brightness > 0 ? "+" : ""}${a.brightness} | ${a.saturation > 0 ? "+" : ""}${a.saturation} | ${pct(a.glow)} | ${a.lift}px | ${pct(a.opacity)} |`);
  });
  const forks = Object.keys(cfg.stateDesigns ?? {});
  L.push("", forks.length
    ? `States with their own forked design (not just adjustments): ${forks.join(", ")}.`
    : "No state carries a forked design — every state mirrors the default.");
  L.push("");

  L.push("## settings.json", "");
  L.push(
    "The complete machine-readable config sits beside this file. Open UI Kit",
    "Maker, choose **Export › Import settings**, and pick it up to restore",
    "this exact kit — every role, token and per-component override.",
    "",
  );
  return L.join("\n");
}

/* ── font licence ────────────────────────────────────────────────── */

/** SIL Open Font License 1.1 — the licence nearly every Google Font ships
    under, and the one whose terms require it to travel with an embedded
    face. Reproduced verbatim. */
const OFL_1_1 = `-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.`;

/** The licence file that ships wherever we embed or bundle a face. */
export function fontLicenceText(families: string[]): string {
  const listed = families.map((f) => {
    const def = fontByName(f);
    const slug = f.replace(/ /g, "+");
    return def?.css
      ? `- **${f}** — https://fonts.google.com/specimen/${slug}\n  License: https://fonts.google.com/specimen/${slug}/license`
      : `- **${f}** — system face, not redistributed with this kit`;
  }).join("\n");

  return `# Fonts in this kit

This kit embeds the type face(s) below so your files render with real type
straight away, with nothing to install first.

${listed}

## You're clear to ship these

Google Fonts are open source. Nearly all — including the faces above unless
their page says otherwise — are released under the **SIL Open Font License
1.1**, reproduced in full below. A small number of older families use the
**Apache License 2.0** instead. The page linked beside each family is the
authoritative word on which applies.

Under either licence you may:

- use and embed the face in your product, commercial included,
- redistribute it inside your own builds, on any number of projects,
- do so without paying anyone or crediting anyone in your interface.

The conditions are narrow:

- don't sell the font files **on their own** (bundled inside your product
  is expressly fine),
- keep this licence with the font when you pass it along,
- if you modify a face, don't keep its Reserved Font Name.

Nothing here restricts the artwork you made in UI Kit Maker. Your kit's
licence is a separate file.

${OFL_1_1}
`;
}
