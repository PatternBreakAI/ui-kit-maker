/* Label widths from BAKED font metrics — the deterministic path.

   fontMetricsData.ts carries real per-glyph advances for every registry
   face, measured once from the font files themselves (scripts/
   measure-font-metrics.mjs). Summing those beats live measurement two ways:
   the numbers are identical in every browser (Safari laid labels out wider
   than its own boxes for years), and they exist before the face loads, so
   first paint already has the final geometry — no estimate window, no
   layout pop when fonts land.

   Sums ignore kerning, which only ever makes the reserved box a touch
   generous (kerning tightens; it never widens) — the safe direction for a
   renderer whose one unforgivable sin is cutting a glyph off. */

import { FONT_METRICS } from "./fontMetricsData";

/* base36, 3 chars per advance, milli-em — see the generator script */
const decoded = new Map<string, number[]>();
function advances(key: string, s: string): number[] {
  const hit = decoded.get(key);
  if (hit) return hit;
  const out = new Array<number>(s.length / 3);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 3, i * 3 + 3), 36);
  decoded.set(key, out);
  return out;
}

function sumAt(font: string, stopIdx: number, italic: boolean, label: string): number {
  const m = FONT_METRICS[font];
  // faces without true italic files fall back to upright advances — synthetic
  // oblique is a skew, it never changes advances (the lean past the last
  // glyph is the callers' italic head-room, not a width)
  const table = italic && m.ital ? m.ital : m.adv;
  const arr = advances(`${font}|${stopIdx}|${italic && m.ital ? "i" : "u"}`, table[stopIdx]);
  let sum = 0;
  for (const ch of label) {
    const code = ch.codePointAt(0) ?? 0;
    const i = code - 32;
    sum += i >= 0 && i < arr.length ? arr[i]
      // han/kana/hangul and emoji run full-width in any face they fall back to
      : code >= 0x1100 ? Math.max(m.def, 1000)
      : m.def;
  }
  return sum;
}

/** Label width in em from the baked table, or null when the face isn't a
 *  registry face (custom uploads keep live measurement). Weight interpolates
 *  between measured stops, clamped to the face's real range. */
export function tableLabelEm(label: string, font: string, weight: number, italic: boolean): number | null {
  const m = FONT_METRICS[font];
  if (!m || !label) return null;
  const stops = m.stops;
  const w = Math.max(stops[0], Math.min(stops[stops.length - 1], weight || 400));
  let hi = 0;
  while (hi < stops.length - 1 && stops[hi] < w) hi++;
  const lo = Math.max(0, hi - 1);
  const a = sumAt(font, lo, italic, label);
  const b = hi === lo ? a : sumAt(font, hi, italic, label);
  const t = hi === lo || stops[hi] === stops[lo] ? 0 : (w - stops[lo]) / (stops[hi] - stops[lo]);
  return (a + (b - a) * t) / 1000;
}
