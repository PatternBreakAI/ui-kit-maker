/* The real generator engine, surfaced for the front door. Direct imports —
   the landing renders with the same code the editor ships, so presets and
   engine changes flow to the homepage automatically. Mirrors the API of
   scripts/engine-embed.entry.ts (the design-preview bundle). */
import { renderBevel, renderShell, renderKit, addShine } from "@/generator/bevel";
import {
  defaultConfig, defaultCandy, randomizeConfig, applyPresetCandy, presetById,
  pickDesign, PRESETS, SHAPES, PATTERN_TYPES, KIT_COMPONENTS, STATE_NAMES, darken,
  type GenConfig,
} from "@/generator/model";
import grapeJelly from "@/generator/preset-grape-jelly.json";
import neonVersus from "@/generator/preset-neon-versus.json";
import bubblePop from "@/generator/preset-bubble-pop.json";
import citrusPop from "@/generator/preset-citrus-pop.json";

/* keep in step with store.PRESET_DEFAULTS — a preset missing here can't
   play its authored form on the homepage (auth:<id> reel entries) */
const AUTHORED = { "grape-jelly": grapeJelly, "neon-versus": neonVersus, "bubble-pop": bubblePop, "citrus-pop": citrusPop } as const;

/* Mirror of store.retintText — copied so the landing never imports the
   zustand store (persistence + cloud side effects stay out of this route). */
function retintText(c: GenConfig) {
  const bevel = c.effects.Bevel ?? "#0E9CC9";
  const glow = c.effects.Glow ?? darken(bevel, -0.4);
  c.type.outline.color = darken(bevel, 0.5);
  if (c.type.outline.color2) c.type.outline.color2 = darken(bevel, 0.7);
  c.type.shadow.color = darken(bevel, 0.62);
  c.type.glow.color = glow;
}

/* The app's exact preset application (store.setPreset non-authored path). */
function applyPresetFull(c: GenConfig, id: string): GenConfig {
  const p = presetById(id);
  c.presetId = id; c.shape = p.shape; c.bevel = { ...p.bevel }; c.effects = { ...p.effects };
  const candy = defaultCandy(); applyPresetCandy(candy, p); c.candy = candy;
  retintText(c);
  return c;
}

export const engineApi = {
  renderBevel, renderShell, renderKit, addShine,
  defaultConfig, defaultCandy, randomizeConfig, applyPresetCandy, presetById,
  pickDesign, PRESETS, SHAPES, PATTERN_TYPES, KIT_COMPONENTS, STATE_NAMES,
  AUTHORED, applyPresetFull, retintText,
};

/* Crop a render's viewBox to its shell (plus glow padding) so it displays
   large — same trick the landing funnel uses. */
export function tightenSvg(svg: string, pad = 26): string {
  const m = /data-shell="([-\d. ]+)"/.exec(svg);
  if (!m) return svg;
  const [sx, sy, sw, sh] = m[1].split(" ").map(Number);
  return svg
    .replace(/width="[^"]*"/, `width="${Math.round(sw + pad * 2)}"`)
    .replace(/height="[^"]*"/, `height="${Math.round(sh + pad * 2)}"`)
    .replace(/viewBox="[^"]*"/, `viewBox="${(sx - pad).toFixed(1)} ${(sy - pad).toFixed(1)} ${(sw + pad * 2).toFixed(1)} ${(sh + pad * 2).toFixed(1)}"`);
}
