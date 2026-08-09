import { GAME_FONTS, registerCuratedFont } from "@/generator/model";
import type { FontCaps } from "@/generator/model";

/* The Splash shelf — big, bold, FAT faces only (owner mandate), serif and
   sans both. Catalog faces ride their real GAME_FONTS caps; the rest are
   registered with correct css2 strings and true capabilities. Variable
   faces get a real weight slider — opentype.js applies the wght axis to
   the outlines, so the slider is the actual master, not an optical fake.
   `ttf` pins the exact google/fonts filename where guessing would miss
   (multi-axis variable names). */

export type SplashFontDef = {
  name: string;
  serif?: boolean;
  ttf?: string;                 // exact repo filename hint for the outliner
  css?: string;                 // css2 family string (non-catalog faces)
  caps?: FontCaps;              // true capabilities (non-catalog faces)
};

export const SPLASH_FONTS: SplashFontDef[] = [
  // sans / display
  { name: "Modak" },
  { name: "Lilita One" },
  { name: "Luckiest Guy" },
  { name: "Bangers" },
  { name: "Titan One" },
  { name: "Bungee" },
  { name: "Passion One" },                                            // 400 / 700 / 900 static cuts
  { name: "Baloo 2", ttf: "Baloo2[wght].ttf" },                       // variable 400..800
  { name: "Grandstander", ttf: "Grandstander[wght].ttf", css: "Grandstander:wght@100..900", caps: { wght: [100, 900, 800] } },
  { name: "Archivo Black", css: "Archivo+Black", caps: { weights: [400] } },
  // script — the sticker/street lettering direction
  { name: "Pacifico", css: "Pacifico", caps: { weights: [400] } },
  { name: "Lobster", css: "Lobster", caps: { weights: [400] } },
  // serif / slab
  { name: "Ultra", serif: true, css: "Ultra", caps: { weights: [400] } },
  { name: "Alfa Slab One", serif: true, css: "Alfa+Slab+One", caps: { weights: [400] } },
  { name: "Abril Fatface", serif: true, css: "Abril+Fatface", caps: { weights: [400] } },
  { name: "Shrikhand", serif: true },
  { name: "Chonburi", serif: true, css: "Chonburi", caps: { weights: [400] } },
  { name: "Fraunces", serif: true, ttf: "Fraunces[SOFT,WONK,opsz,wght].ttf", css: "Fraunces:opsz,wght@9..144,100..900", caps: { wght: [100, 900, 900] } },
];

export const SPLASH_FONT_NAMES = SPLASH_FONTS.map((f) => f.name);

export const splashFontDef = (name: string): SplashFontDef | undefined =>
  SPLASH_FONTS.find((f) => f.name === name);

/** Register the non-catalog shelf faces with their REAL capabilities —
 *  idempotent, call before first render. */
export function registerSplashFonts(): void {
  for (const f of SPLASH_FONTS) {
    if (GAME_FONTS.some((g) => g.name === f.name)) continue;
    registerCuratedFont(f.name, { css: f.css, caps: f.caps, factor: 0.6 });
  }
}
