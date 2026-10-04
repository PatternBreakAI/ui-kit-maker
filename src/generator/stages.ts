/* Device stages — the artboard sizes the Board offers (owner, 2026-10-04:
   "there should be a pulldown with various sizes from popular device types
   that I will have to develop for"; iPhone 18 landscape and portrait first).

   Units are the platform's points (iOS pt, Android dp): the Mobile stage has
   always been 390 × 844, so every phone and tablet here speaks the same unit
   as the Brightside boards, and the 16:9 stage keeps its 1920 × 1080. A board
   stores its stage's id in `aspect`; the two legacy ids ("169", "mobile")
   never change, so saved boards, share links, the starter templates and the
   Unity export keep loading exactly as before.

   `safe` is the device's safe-area inset in stage units (the status bar or
   Dynamic Island at the top, the home indicator at the bottom, the ears in
   landscape) and feeds the Board's safe-area guides; it never exports.
   Sizes are the makers' published logical sizes (Apple's HIG and tech specs,
   Android's dp tables), not guesses — edit this table, not the Board. */

export type StageGroup = "Wide" | "iPhone" | "iPad" | "Android";

export type StageId =
  | "169" | "mobile"
  | "iphone-pro-p" | "iphone-pro-l" | "iphone-promax-p" | "iphone-promax-l"
  | "iphone-air-p" | "iphone-air-l" | "iphone-16-p" | "iphone-16-l" | "iphone-16e-l"
  | "ipad-pro-13-p" | "ipad-pro-13-l" | "ipad-pro-11-p" | "ipad-pro-11-l"
  | "ipad-11-p" | "ipad-11-l" | "ipad-mini-p" | "ipad-mini-l"
  | "android-phone-p" | "android-phone-l" | "android-compact-p" | "android-compact-l"
  | "android-tablet-p" | "android-tablet-l";

export type StageSafe = { top: number; bottom: number; left: number; right: number };

export type StageDef = {
  id: StageId;
  /** the pulldown's line, without the size */
  name: string;
  /** the short name the desk prints under a board ("16:9", "Mobile", "iPhone 18 Pro") */
  short: string;
  group: StageGroup;
  w: number;
  h: number;
  safe: StageSafe;
  /** other devices that share this exact logical size */
  note?: string;
};

export const DEFAULT_STAGE: StageId = "169";

const ISLAND_P: StageSafe = { top: 62, bottom: 34, left: 0, right: 0 };
const ISLAND_L: StageSafe = { top: 0, bottom: 21, left: 62, right: 62 };
const NOTCH_P: StageSafe = { top: 59, bottom: 34, left: 0, right: 0 };
const NOTCH_L: StageSafe = { top: 0, bottom: 21, left: 59, right: 59 };
const PAD: StageSafe = { top: 24, bottom: 20, left: 0, right: 0 };
const DROID_P: StageSafe = { top: 24, bottom: 24, left: 0, right: 0 };
const DROID_L: StageSafe = { top: 0, bottom: 24, left: 24, right: 24 };

/** Every stage, in the order the pulldown lists them. */
export const STAGE_LIST: readonly StageDef[] = [
  { id: "169", name: "Wide 16:9", short: "16:9", group: "Wide", w: 1920, h: 1080, safe: { top: 54, bottom: 54, left: 96, right: 96 }, note: "desktop, console, TV; the guides show action and title safe" },

  { id: "iphone-pro-p", name: "iPhone 18 Pro · portrait", short: "iPhone 18 Pro", group: "iPhone", w: 402, h: 874, safe: ISLAND_P, note: "also iPhone 17 Pro, iPhone 17, iPhone 16 Pro" },
  { id: "iphone-pro-l", name: "iPhone 18 Pro · landscape", short: "iPhone 18 Pro", group: "iPhone", w: 874, h: 402, safe: ISLAND_L, note: "also iPhone 17 Pro, iPhone 17, iPhone 16 Pro" },
  { id: "iphone-promax-p", name: "iPhone 18 Pro Max · portrait", short: "iPhone 18 Pro Max", group: "iPhone", w: 440, h: 956, safe: ISLAND_P, note: "also iPhone 17 Pro Max, iPhone 16 Pro Max" },
  { id: "iphone-promax-l", name: "iPhone 18 Pro Max · landscape", short: "iPhone 18 Pro Max", group: "iPhone", w: 956, h: 440, safe: ISLAND_L, note: "also iPhone 17 Pro Max, iPhone 16 Pro Max" },
  { id: "iphone-air-p", name: "iPhone Air · portrait", short: "iPhone Air", group: "iPhone", w: 420, h: 912, safe: ISLAND_P },
  { id: "iphone-air-l", name: "iPhone Air · landscape", short: "iPhone Air", group: "iPhone", w: 912, h: 420, safe: ISLAND_L },
  { id: "iphone-16-p", name: "iPhone 16 · portrait", short: "iPhone 16", group: "iPhone", w: 393, h: 852, safe: NOTCH_P, note: "also iPhone 15, iPhone 14 Pro" },
  { id: "iphone-16-l", name: "iPhone 16 · landscape", short: "iPhone 16", group: "iPhone", w: 852, h: 393, safe: NOTCH_L, note: "also iPhone 15, iPhone 14 Pro" },
  { id: "mobile", name: "Mobile · iPhone 16e · portrait", short: "Mobile", group: "iPhone", w: 390, h: 844, safe: { top: 47, bottom: 34, left: 12, right: 12 }, note: "the original Mobile stage; also iPhone 14, iPhone 13" },
  { id: "iphone-16e-l", name: "iPhone 16e · landscape", short: "iPhone 16e", group: "iPhone", w: 844, h: 390, safe: { top: 0, bottom: 21, left: 47, right: 47 }, note: "also iPhone 14, iPhone 13" },

  { id: "ipad-pro-13-p", name: "iPad Pro 13″ · portrait", short: "iPad Pro 13″", group: "iPad", w: 1032, h: 1376, safe: PAD, note: "also iPad Air 13″" },
  { id: "ipad-pro-13-l", name: "iPad Pro 13″ · landscape", short: "iPad Pro 13″", group: "iPad", w: 1376, h: 1032, safe: PAD, note: "also iPad Air 13″" },
  { id: "ipad-pro-11-p", name: "iPad Pro 11″ · portrait", short: "iPad Pro 11″", group: "iPad", w: 834, h: 1210, safe: PAD },
  { id: "ipad-pro-11-l", name: "iPad Pro 11″ · landscape", short: "iPad Pro 11″", group: "iPad", w: 1210, h: 834, safe: PAD },
  { id: "ipad-11-p", name: "iPad · portrait", short: "iPad", group: "iPad", w: 820, h: 1180, safe: PAD, note: "iPad (A16) and iPad Air 11″" },
  { id: "ipad-11-l", name: "iPad · landscape", short: "iPad", group: "iPad", w: 1180, h: 820, safe: PAD, note: "iPad (A16) and iPad Air 11″" },
  { id: "ipad-mini-p", name: "iPad mini · portrait", short: "iPad mini", group: "iPad", w: 744, h: 1133, safe: PAD },
  { id: "ipad-mini-l", name: "iPad mini · landscape", short: "iPad mini", group: "iPad", w: 1133, h: 744, safe: PAD },

  { id: "android-phone-p", name: "Android phone · portrait", short: "Android phone", group: "Android", w: 412, h: 915, safe: DROID_P, note: "Pixel 10 and most 6.1″ to 6.3″ phones" },
  { id: "android-phone-l", name: "Android phone · landscape", short: "Android phone", group: "Android", w: 915, h: 412, safe: DROID_L, note: "Pixel 10 and most 6.1″ to 6.3″ phones" },
  { id: "android-compact-p", name: "Android compact · portrait", short: "Android compact", group: "Android", w: 360, h: 780, safe: DROID_P, note: "Galaxy S25 and the 360 dp class" },
  { id: "android-compact-l", name: "Android compact · landscape", short: "Android compact", group: "Android", w: 780, h: 360, safe: DROID_L, note: "Galaxy S25 and the 360 dp class" },
  { id: "android-tablet-p", name: "Android tablet · portrait", short: "Android tablet", group: "Android", w: 800, h: 1280, safe: DROID_P, note: "Pixel Tablet, Galaxy Tab" },
  { id: "android-tablet-l", name: "Android tablet · landscape", short: "Android tablet", group: "Android", w: 1280, h: 800, safe: DROID_P, note: "Pixel Tablet, Galaxy Tab" },
];

const BY_ID: Record<string, StageDef> = Object.fromEntries(STAGE_LIST.map((s) => [s.id, s]));

export const isStageId = (v: unknown): v is StageId => typeof v === "string" && v in BY_ID;

/** Anything a saved board carries becomes a known stage; unknown or missing reads as the 16:9 default, as it always has. */
export const coerceStageId = (v: unknown): StageId => (isStageId(v) ? v : DEFAULT_STAGE);

/** The stage for an id; an unknown id (or none) is the 16:9 stage. */
export const stageOf = (id: string | null | undefined): StageDef => BY_ID[id ?? ""] ?? BY_ID[DEFAULT_STAGE];

/** [width, height] in stage units. */
export const stageDims = (id: string | null | undefined): [number, number] => { const s = stageOf(id); return [s.w, s.h]; };

/** Taller than wide: phones and tablets held upright. These share a desk row (up to three); everything else stands alone. */
export const stageIsPortrait = (id: string | null | undefined): boolean => { const s = stageOf(id); return s.h > s.w; };

/** A phone-sized stage (under 700 units on its short side): drops seat tighter, big glyphs shrink to fit. */
export const stageIsPhone = (id: string | null | undefined): boolean => { const s = stageOf(id); return Math.min(s.w, s.h) < 700; };

/** The pulldown's groups, in order. */
export const STAGE_GROUPS: readonly { group: StageGroup; stages: readonly StageDef[] }[] = (["Wide", "iPhone", "iPad", "Android"] as const)
  .map((group) => ({ group, stages: STAGE_LIST.filter((s) => s.group === group) }));
