/* ── Big glyphs — the owner's board-art drop ─────────────────────────────
   71 high-res painted glyphs, delivered by the owner (glyph-drop-1) as
   FINISHED raster art. Owner mandate, verbatim: "These should NOT appear
   in the kit, only Boards options... if used then they should export with
   boards as their own prefabs, off the bat I will want to add drop
   shadows and glows to these." So:
   · they are BOARD ASSETS, never kit components — no roster entry, no kit
     page card, no shape map; the Boards tray is their only door
   · staged behind ONE ledger key (BIG_GLYPH_GATE) — admin-only until the
     owner releases the set; the batch precedent, not 71 approvals
   · day-one instance dials: Drop shadow + Glow (kit-following glow ink),
     the type stamp's dial grain exactly — one filter string shared by the
     stage, the board PNG compositor and the Unity scene bake
   · owner-owned art: no third-party attribution travels with these
     (unlike the game-icons glyph pieces)

   The art lives OFF the JS bundle in three tiers: full PNGs in
   public/bigglyphs (Vercel CDN, fetched ONLY by the bakes — board PNG
   compositor, Unity export), 512px mid webps in public/bigglyph-mid (what
   the stage displays), and 128px thumbs in public/bigglyph-thumbs (the
   tray's rail, lazy; also the stage's instant first paint). Seven files
   first arrived OPAQUE (baked flat white backgrounds) and sat parked
   behind the `opaque` flag; the owner re-exported all seven with real
   cutout alpha (2026-08-20) and the parked set is now EMPTY — the flag
   machinery stays for future drops that land flat. */

import type { GenConfig } from "./model";

/** The whole set gates on this one componentReleases ledger key —
 *  board-asset class, so it deliberately is NOT a KitComponentId. */
export const BIG_GLYPH_GATE = "bigglyphset";

export interface BigGlyphDef {
  id: string; name: string;
  /** natural raster px — the placement footprint derives from these */
  w: number; h: number;
  /** extra search hay beyond name + id */
  search?: string;
  /** delivered with a baked flat background — parked out of the tray
   *  until the owner re-exports with alpha or blesses the look */
  opaque?: boolean;
}

export const BIG_GLYPHS: BigGlyphDef[] = [
  { id: "acorn", name: "Acorn", w: 708, h: 811, search: "nut autumn forest squirrel" },
  { id: "apple", name: "Apple", w: 830, h: 843, search: "fruit red food teacher" },
  { id: "bananas", name: "Bananas", w: 963, h: 843, search: "fruit yellow bunch" },
  { id: "banner", name: "Banner", w: 685, h: 892, search: "flag ribbon pennant medieval" },
  { id: "bear", name: "Bear", w: 866, h: 803, search: "animal teddy forest brown" },
  { id: "blueberry", name: "Blueberry", w: 866, h: 843, search: "fruit berry blue" },
  { id: "bomb", name: "Bomb", w: 914, h: 851, search: "explosive fuse black powerup" },
  { id: "candy", name: "Candy", w: 1048, h: 851, search: "sweet wrapper treat" },
  { id: "cannon", name: "Cannon", w: 878, h: 892, search: "weapon pirate artillery" },
  { id: "castle", name: "Castle", w: 985, h: 1008, search: "fortress medieval keep kingdom" },
  { id: "catapult", name: "Catapult", w: 1070, h: 1008, search: "siege medieval weapon launcher" },
  { id: "cherry_blossom", name: "Cherry Blossom", w: 805, h: 811, search: "sakura flower pink petal spring" },
  { id: "chick", name: "Chick", w: 805, h: 803, search: "bird baby chicken easter yellow" },
  { id: "clover", name: "Clover", w: 866, h: 851, search: "luck irish shamrock green" },
  { id: "clover_leaf", name: "Clover Leaf", w: 781, h: 811, search: "luck irish shamrock four leaf" },
  { id: "compass", name: "Compass", w: 793, h: 835, search: "navigate map direction explorer" },
  { id: "cookie", name: "Cookie", w: 902, h: 843, search: "biscuit chocolate chip treat" },
  { id: "crown", name: "Crown", w: 829, h: 835, search: "king queen royal gold" },
  { id: "cupcake", name: "Cupcake", w: 986, h: 963, search: "muffin frosting cherry dessert sweet" },
  { id: "diamond", name: "Diamond", w: 866, h: 851, search: "gem jewel blue crystal" },
  { id: "die", name: "Die", w: 937, h: 1076, search: "dice random roll board game" },
  { id: "dolphin", name: "Dolphin", w: 865, h: 803, search: "sea ocean animal marine" },
  { id: "donut", name: "Donut", w: 890, h: 843, search: "doughnut sprinkles sweet" },
  { id: "fish", name: "Fish", w: 829, h: 803, search: "sea ocean animal orange" },
  { id: "fountain", name: "Fountain", w: 830, h: 892, search: "water plaza park stone" },
  { id: "frog", name: "Frog", w: 805, h: 803, search: "animal pond green toad" },
  { id: "grapes", name: "Grapes", w: 805, h: 843, search: "fruit purple vine" },
  { id: "hammer", name: "Hammer", w: 890, h: 956, search: "tool build smash workshop" },
  { id: "honey", name: "Honey", w: 830, h: 843, search: "pot jar bee sweet" },
  { id: "honeycomb", name: "Honeycomb", w: 890, h: 907, search: "bee hex hive amber" },
  { id: "hourglass", name: "Hourglass", w: 660, h: 956, search: "time timer sand clock" },
  { id: "house", name: "House", w: 902, h: 892, search: "home cottage building" },
  { id: "ice_block", name: "Ice Block", w: 878, h: 907, search: "frozen cube crystal cold" },
  { id: "key", name: "Key", w: 757, h: 835, search: "unlock door gold" },
  { id: "ladybug", name: "Ladybug", w: 769, h: 803, search: "bug beetle insect red" },
  { id: "leaf_brown", name: "Brown Leaf", w: 781, h: 811, search: "autumn fall foliage" },
  { id: "leaf_green", name: "Green Leaf", w: 757, h: 811, search: "spring nature foliage" },
  { id: "lightning", name: "Lightning", w: 684, h: 956, search: "bolt zap energy storm" },
  { id: "lime", name: "Lime", w: 829, h: 843, search: "fruit citrus green slice" },
  { id: "lock", name: "Lock", w: 1168, h: 907, search: "padlock secure gate" },
  { id: "map", name: "Map", w: 805, h: 835, search: "treasure parchment quest explore" },
  { id: "minecart", name: "Minecart", w: 890, h: 892, search: "mine cart rail ore wagon" },
  { id: "money_bag", name: "Money Bag", w: 745, h: 835, search: "gold coins loot sack cash" },
  { id: "mushroom", name: "Mushroom", w: 829, h: 811, search: "toadstool fungus red forest" },
  { id: "obsidian", name: "Obsidian", w: 902, h: 907, search: "rock stone volcanic black purple" },
  { id: "orange", name: "Orange", w: 866, h: 843, search: "fruit citrus slice" },
  { id: "orange_gem", name: "Orange Gem", w: 865, h: 851, search: "jewel crystal amber" },
  { id: "orb", name: "Orb", w: 782, h: 956, search: "sphere magic crystal ball" },
  { id: "owl", name: "Owl", w: 818, h: 803, search: "bird night wise forest" },
  { id: "paintbrush", name: "Paintbrush", w: 866, h: 956, search: "art paint brush create" },
  { id: "panda", name: "Panda", w: 866, h: 803, search: "animal bear bamboo" },
  { id: "penguin", name: "Penguin", w: 829, h: 803, search: "bird ice antarctic animal" },
  { id: "pinata", name: "Piñata", w: 1043, h: 967, search: "party horse candy fiesta birthday" },
  { id: "pinecone", name: "Pinecone", w: 757, h: 811, search: "pine forest autumn" },
  { id: "popsicle", name: "Popsicle", w: 865, h: 963, search: "ice lolly frozen treat summer" },
  { id: "potion_red", name: "Red Potion", w: 720, h: 835, search: "flask bottle elixir health brew" },
  { id: "purple_block", name: "Purple Block", w: 950, h: 907, search: "crate cube crystal tile" },
  { id: "rocket", name: "Rocket", w: 865, h: 967, search: "firework spaceship launch" },
  { id: "rose", name: "Rose", w: 721, h: 811, search: "flower red romance" },
  { id: "scroll", name: "Scroll", w: 806, h: 892, search: "parchment quest paper message" },
  { id: "shield", name: "Shield", w: 745, h: 835, search: "defense armor crest guard" },
  { id: "snowflake", name: "Snowflake", w: 781, h: 811, search: "winter ice frozen cold" },
  { id: "spikes", name: "Spikes", w: 878, h: 892, search: "trap hazard danger" },
  { id: "star", name: "Star", w: 866, h: 851, search: "gold shine favorite rating" },
  { id: "sunflower", name: "Sunflower", w: 878, h: 811, search: "flower yellow garden" },
  { id: "sword", name: "Sword", w: 733, h: 835, search: "blade weapon knight steel" },
  { id: "target", name: "Target", w: 902, h: 956, search: "bullseye aim archery" },
  { id: "telescope", name: "Telescope", w: 793, h: 892, search: "spyglass explore stars pirate" },
  { id: "tnt", name: "TNT", w: 769, h: 956, search: "dynamite explosive crate blast" },
  { id: "tower", name: "Tower", w: 684, h: 892, search: "turret castle defense" },
  { id: "windmill", name: "Windmill", w: 805, h: 892, search: "mill farm wind dutch" },
];

const BY_ID: Record<string, BigGlyphDef> = Object.fromEntries(BIG_GLYPHS.map((g) => [g.id, g]));
export function bigGlyphById(id: string): BigGlyphDef | undefined { return BY_ID[id]; }

/** Full-res art, served static from public/ (CDN on the live site).
 *  BAKES ONLY — the board PNG compositor and the Unity scene/prefab
 *  export read this; the stage never does (the "boards take a long time
 *  to load" round: 8 placed glyphs used to pull ~4.4MB of originals just
 *  to display). The bytes are sacred: they ship to Unity verbatim, so
 *  nothing may recompress or rewrite public/bigglyphs. */
export function bigGlyphUrl(id: string): string { return `/bigglyphs/${id}.png`; }
/** The tray's 128px thumb — the rail must never pull the 34MB set. */
export function bigGlyphThumb(id: string): string { return `/bigglyph-thumbs/${id}.webp`; }
/** Mid-tier display raster: 512 fit-inside webp (~20KB), cut from the
 *  original by the same fit-inside pipeline as the thumbs. This is what
 *  the board STAGE shows; the 128 thumb paints first while it arrives. */
export function bigGlyphMid(id: string): string { return `/bigglyph-mid/${id}.webp`; }

/** Stage footprint: the art places at half its natural raster, which
 *  lands the typical ~800px glyph around 400 board px on a 1920 stage. */
export const BIG_GLYPH_BASE = 0.5;

/** A big-glyph board instance's own dials — the type stamp's grain. */
export interface BigGlyphFx {
  /** registry id (BIG_GLYPHS) */
  gid: string;
  /** drop shadow strength 0..100 — 0/absent = off */
  shadow?: number;
  /** shadow pose overrides (px at art scale); absent = the strength-derived
   *  house curve, identical to the type stamp's */
  shadowX?: number; shadowY?: number; shadowBlur?: number;
  /** glow strength 0..100 — 0/absent = off */
  glow?: number;
  /** glow ink; absent = FOLLOW THE KIT's Glow role (the kit-following
   *  default every instance starts with) */
  glowInk?: string;
}

/** One filter string for a big glyph's dials — the stage, the board PNG
 *  compositor and the Unity scene bake all speak THIS, so they can't
 *  drift (the stampFilter contract).
 *
 *  `pxScale` scales the recipe's px values for a surface whose drawing
 *  space does NOT already scale with the instance. The stage applies the
 *  filter INSIDE the instance's `transform: scale()` wrapper (halo scales
 *  for free, pxScale 1); the Unity bake filters the native raster and
 *  ships sprite+halo as one scaled unit (pxScale 1). The board PNG
 *  compositor filters the FLAT board canvas, so it must pass the
 *  instance's scale or a 12% match-3 tile drowns under a 100%-sized
 *  shadow (the scale-floor round). */
export function bigGlyphFilter(cfg: GenConfig, fx: BigGlyphFx, pxScale = 1): string | undefined {
  const p: string[] = [];
  if (fx.shadow) {
    const dx = (fx.shadowX ?? 0) * pxScale;
    const dy = (fx.shadowY ?? 2 + fx.shadow * 0.1) * pxScale;
    const bl = (fx.shadowBlur ?? 2 + fx.shadow * 0.22) * pxScale;
    p.push(`drop-shadow(${dx.toFixed(1)}px ${dy.toFixed(1)}px ${bl.toFixed(1)}px rgba(0,0,0,${(fx.shadow / 100 * 0.6).toFixed(2)}))`);
  }
  if (fx.glow) {
    const g = fx.glowInk ?? cfg.effects.Glow ?? "#7DF9FF";
    p.push(`drop-shadow(0 0 ${((3 + fx.glow * 0.22) * pxScale).toFixed(1)}px ${g}) drop-shadow(0 0 ${((6 + fx.glow * 0.5) * pxScale).toFixed(1)}px ${g})`);
  }
  return p.length ? p.join(" ") : undefined;
}

/** The filter's paint reach past the raster (px at 1:1) — bakes pad their
 *  canvas by this so shadows and glow never clip. */
export function bigGlyphFilterPad(fx: BigGlyphFx): number {
  let pad = 0;
  if (fx.shadow) {
    const dy = Math.abs(fx.shadowY ?? 2 + fx.shadow * 0.1) + Math.abs(fx.shadowX ?? 0);
    pad = Math.max(pad, dy + (fx.shadowBlur ?? 2 + fx.shadow * 0.22) * 2);
  }
  if (fx.glow) pad = Math.max(pad, (6 + fx.glow * 0.5) * 3);
  return Math.ceil(pad);
}
