/* Browser-embeddable bundle of the REAL generator engine for the marketing
   preview. Exposes the same pure renderers the app uses — no approximations.
   Build: npx -y esbuild scripts/engine-embed.entry.ts --bundle --minify \
     --format=iife --global-name=UIKitEngine \
     --define:process.env.NODE_ENV='"production"' --outfile=<out>.js */

export { renderBevel, renderShell, renderKit, addShine } from "../src/generator/bevel";
export {
  defaultConfig, defaultCandy, randomizeConfig, applyPresetCandy, presetById, pickDesign,
  PRESETS, SHAPES, PATTERN_TYPES, STATE_NAMES,
} from "../src/generator/model";
/* marketing surfaces never see staging-bay pieces (mirrors engine.ts) */
import { KIT_COMPONENTS as ALL_KIT_COMPONENTS } from "../src/generator/model";
export const KIT_COMPONENTS = ALL_KIT_COMPONENTS.filter((c) => !c.staged);
export type { GenConfig, GenStateName, Shape, PatternType, KitComponentId } from "../src/generator/model";

import { darken } from "../src/generator/model";
import type { GenConfig as GC } from "../src/generator/model";
/* Mirror of store.retintText — copied (not imported) so the bundle never
   pulls the zustand store, cloud sync, or persistence side effects. */
export function retintText(c: GC) {
  const bevel = c.effects.Bevel ?? "#0E9CC9";
  const glow = c.effects.Glow ?? darken(bevel, -0.4);
  c.type.outline.color = darken(bevel, 0.5);
  if (c.type.outline.color2) c.type.outline.color2 = darken(bevel, 0.7);
  c.type.shadow.color = darken(bevel, 0.62);
  c.type.glow.color = glow;
}
/* The app's exact preset application (store.setPreset non-authored path). */
import { defaultCandy as _dc, applyPresetCandy as _apc, presetById as _pbi } from "../src/generator/model";
export function applyPresetFull(c: GC, id: string) {
  const p = _pbi(id);
  c.presetId = id; c.shape = p.shape; c.bevel = { ...p.bevel }; c.effects = { ...p.effects };
  const candy = _dc(); _apc(candy, p); c.candy = candy;
  retintText(c);
  return c;
}

import grapeJelly from "../src/generator/preset-grape-jelly.json";
import neonVersus from "../src/generator/preset-neon-versus.json";
import bubblePop from "../src/generator/preset-bubble-pop.json";
export const AUTHORED = { "grape-jelly": grapeJelly, "neon-versus": neonVersus, "bubble-pop": bubblePop } as const;
