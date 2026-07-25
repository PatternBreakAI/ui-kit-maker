/* Kit paperwork — the README, the settings file and the font licence that
   travel inside every kit export.

   Two jobs. First, the RECIPE: a human-readable spec of every value that
   made this kit, so someone can rebuild it by hand in any tool without the
   app. That includes the numbers the editor deliberately hides once a look
   is dialled in (raw colour roles, gloss geometry, specular placement) —
   hidden is a UI decision, not a secrecy one, and a designer handed a kit
   deserves the whole formula.

   Second, FONTS. We link them rather than embedding them: the kit names
   every face it uses and points at the free download. Nothing is
   redistributed, so nothing has to carry a licence, and the export makes
   no network calls at all.

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

/* ── fonts ───────────────────────────────────────────────────────── */

/** The README's font section: what to install, where to get it, and one
    line on what it costs (nothing). We link rather than embed, so the
    faces stay with their publisher and the kit stays a kit. */
export function fontNotesMarkdown(families: string[]): string {
  const rows = families.map((f) => {
    const def = fontByName(f);
    const slug = f.replace(/ /g, "+");
    return def?.css
      ? `- **${f}** — install free: https://fonts.google.com/specimen/${slug}\n  Licence: https://fonts.google.com/specimen/${slug}/license`
      : `- **${f}** — a system face; nothing to install`;
  }).join("\n");

  return [
    "## Fonts",
    "",
    "This kit is set in the face(s) below. They aren't bundled here — install",
    "them once and every SVG in this pack renders exactly as designed. Until",
    "then your viewer will substitute a default face, which is the usual",
    "reason an imported kit looks subtly wrong.",
    "",
    rows,
    "",
    "Google Fonts are open source and free for commercial use — ship them in",
    "your product, on any number of projects, with no fee and no attribution",
    "required. Each family's exact terms are at the licence link beside it.",
    "",
  ].join("\n");
}
