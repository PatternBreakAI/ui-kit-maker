/* SPLASH LETTERING ENGINE — OpenType substitution inventory.

   A font is source material: before the director modifies any glyph
   procedurally it must know what the type designer already drew.
   This module reads GSUB directly (opentype.js exposes the parsed
   table) and answers two questions:

     · which substitution features exist at all (the inventory), and
     · which ALTERNATE glyphs are reachable for a given glyph id via
       single-substitution (type 1) and alternate-set (type 3) lookups
       under the alternate-family tags.

   Ligatures (type 4) ride the shaper (`stringToGlyphs`) when it
   works; contextual lookups (5/6) are left to the shaper too. Fonts
   without GSUB simply report an empty inventory — every caller must
   treat "no alternates" as the normal case. */

import type { Font } from "opentype.js";

interface GsubFeature { tag: string; feature: { lookupListIndexes: number[] } }
interface GsubLookup { lookupType: number; subtables: Record<string, unknown>[] }
interface GsubTable { features?: GsubFeature[]; lookups?: GsubLookup[] }

export interface FeatureInventory {
  /** every GSUB feature tag present, with lookup types, e.g. "salt(1)" */
  tags: { tag: string; lookupTypes: number[] }[];
  /** glyph id → alternates reachable via the alternate-family tags */
  alternates: Map<number, number[]>;
  /** glyph id → final-form glyph (the `fina` feature: a DESIGNED
   *  terminal for word-final position, e.g. Pacifico's exit strokes) */
  finalForms: Map<number, number>;
}

/** tags whose substitutions are safe to apply per-glyph, out of shaper
 *  context: pure stylistic alternates plus swashes. `aalt` is
 *  deliberately EXCLUDED — it aggregates every alternate in the font,
 *  including superiors/ordinals, and blindly applying it turns an 'a'
 *  into an ordinal mark. */
const ALT_TAGS = /^(salt|ss(0[1-9]|1\d|20)|swsh|cswh)$/;

const coverageIds = (cov: unknown): number[] => {
  const c = cov as { format?: number; glyphs?: number[]; ranges?: { start: number; end: number; index: number }[] };
  if (c?.format === 1 && c.glyphs) return c.glyphs;
  if (c?.format === 2 && c.ranges) {
    const out: number[] = [];
    for (const r of c.ranges) for (let g = r.start; g <= r.end; g++) out.push(g);
    return out;
  }
  return [];
};

/** collect glyph→substitute pairs from one type-1 or type-3 subtable */
function collectSubs(lookupType: number, st: Record<string, unknown>, add: (from: number, to: number) => void): void {
  const ids = coverageIds(st.coverage);
  if (lookupType === 1) {
    if (st.substFormat === 1 && typeof st.deltaGlyphId === "number") {
      for (const g of ids) add(g, (g + (st.deltaGlyphId as number)) & 0xffff);
    } else if (Array.isArray(st.substitute)) {
      (st.substitute as number[]).forEach((to, i) => { if (ids[i] !== undefined) add(ids[i], to); });
    }
  } else if (lookupType === 3 && Array.isArray(st.alternateSets)) {
    (st.alternateSets as number[][]).forEach((set, i) => {
      if (ids[i] !== undefined) for (const to of set) add(ids[i], to);
    });
  }
}

export function inspectFeatures(font: Font): FeatureInventory {
  const gsub = (font.tables as Record<string, unknown>).gsub as GsubTable | undefined;
  const inv: FeatureInventory = { tags: [], alternates: new Map(), finalForms: new Map() };
  if (!gsub?.features?.length || !gsub.lookups) return inv;

  const byTag = new Map<string, Set<number>>();
  for (const f of gsub.features) {
    if (!byTag.has(f.tag)) byTag.set(f.tag, new Set());
    for (const li of f.feature.lookupListIndexes) byTag.get(f.tag)!.add(li);
  }
  for (const [tag, lis] of byTag) {
    const lookupTypes = [...new Set([...lis].map((li) => gsub.lookups![li]?.lookupType ?? 0))];
    inv.tags.push({ tag, lookupTypes });
    const isAlt = ALT_TAGS.test(tag);
    const isFina = tag === "fina";
    if (!isAlt && !isFina) continue;
    for (const li of lis) {
      const lk = gsub.lookups[li];
      if (!lk || (lk.lookupType !== 1 && lk.lookupType !== 3)) continue;
      for (const st of lk.subtables) {
        collectSubs(lk.lookupType, st, (from, to) => {
          if (to === from) return;
          if (isFina) { if (!inv.finalForms.has(from)) inv.finalForms.set(from, to); return; }
          const arr = inv.alternates.get(from) ?? [];
          if (!arr.includes(to)) arr.push(to);
          inv.alternates.set(from, arr);
        });
      }
    }
  }
  inv.tags.sort((a, b) => a.tag.localeCompare(b.tag));
  return inv;
}

/** one-line summary for reports: "salt ss01 ss02 fina liga …" */
export const featureSummary = (inv: FeatureInventory): string =>
  inv.tags.length ? inv.tags.map((t) => t.tag).join(" ") : "no GSUB";
