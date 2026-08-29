import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { IconDef } from "./model";

// Multi-library icon engine. Every library is normalized to the same
// IconDef shape (viewBox + inner markup + stroke/fill mode) so the renderer,
// the code view, and the exports all embed identical vectors. Lucide ships in
// the main bundle; the other libraries are code-split and load on demand the
// first time you open them.

export interface IconLibMeta { id: string; name: string; note: string }
export const ICON_LIBS: IconLibMeta[] = [
  { id: "lucide", name: "Lucide", note: "clean stroke set" },
  { id: "phosphor", name: "Phosphor", note: "friendly & rounded" },
  { id: "tabler", name: "Tabler", note: "sharp stroke set" },
  { id: "game", name: "Game Icons", note: "swords, loot & spells" },
  { id: "hero", name: "Heroicons", note: "by Tailwind" },
  { id: "iconoir", name: "Iconoir", note: "light & minimal" },
  { id: "remix", name: "Remix", note: "versatile line set" },
];

type AnyComp = ComponentType<Record<string, unknown>>;
interface Loaded { names: string[]; comps: Record<string, AnyComp> }

const loaded = new Map<string, Loaded>();
const pending = new Map<string, Promise<Loaded>>();
const defCache = new Map<string, IconDef>();

/* Curated Game Icons subset — game-icons.net is 4000+ strong; this keeps the
   grid game-relevant. Names are filtered against the module at load time. */
const GAME_PICKS = [
  "GiBroadsword", "GiCrossedSwords", "GiSwordWound", "GiKatana", "GiStiletto", "GiBattleAxe", "GiWarhammer",
  "GiSpartanHelmet", "GiVikingHelmet", "GiCrestedHelmet", "GiShardSword", "GiBowArrow", "GiCrossbow",
  "GiShield", "GiCheckedShield", "GiBorderedShield", "GiRoundShield", "GiShieldReflect",
  "GiHealthPotion", "GiPotionBall", "GiStandingPotion", "GiMagicPotion", "GiHeartBottle",
  "GiTreasureMap", "GiOpenTreasureChest", "GiLockedChest", "GiChest", "GiKey", "GiSkeletonKey",
  "GiTwoCoins", "GiCoins", "GiGoldBar", "GiCash", "GiMoneyStack", "GiReceiveMoney",
  "GiCutDiamond", "GiDiamondHard", "GiGems", "GiEmerald", "GiRupee", "GiCrystalGrowth", "GiCrystalCluster",
  "GiCrown", "GiCrownCoin", "GiQueenCrown", "GiLaurelCrown", "GiTrophyCup", "GiTrophy", "GiLaurelsTrophy",
  "GiMagicSwirl", "GiSpellBook", "GiSpellCast", "GiScrollUnfurled", "GiScrollQuill", "GiBookmarklet",
  "GiFireball", "GiFlame", "GiFlamer", "GiIceBolt", "GiLightningTrio", "GiPowerLightning", "GiThunderball",
  "GiSnowflake1", "GiWaterDrop", "GiTornado", "GiEarthCrack", "GiPoisonBottle", "GiDeathSkull",
  "GiSkullCrossedBones", "GiPirateSkull", "GiDaemonSkull", "GiGhost", "GiSpectre", "GiHaunting",
  "GiDragonHead", "GiSpikedDragonHead", "GiDragonSpiral", "GiSeaDragon", "GiGriffinSymbol", "GiUnicorn",
  "GiWolfHead", "GiLionFace", "GiBearFace", "GiEagleEmblem", "GiOwl", "GiRaven", "GiSnakeBite",
  "GiCastle", "GiMedievalGate", "GiTowerFlag", "GiVillage", "GiDungeonGate", "GiStoneTower",
  "GiHearts", "GiHeartPlus", "GiHeartMinus", "GiBrokenHeart", "GiShieldedHeart", "GiHeartTower",
  "GiStarMedal", "GiStarsStack", "GiStarFormation", "GiRank3", "GiAchievement", "GiMedal", "GiPodium",
  "GiDiceSixFacesFive", "GiPerspectiveDiceSixFacesRandom", "GiRollingDices", "GiCardAceHearts", "GiPokerHand",
  "GiJoystick", "GiGamepad", "GiRetroController", "GiConsoleController", "GiArcadeMachine",
  "GiRocket", "GiRocketFlight", "GiUfo", "GiRayGun", "GiLaserBlast", "GiMissileSwarm",
  "GiRun", "GiSprint", "GiJumpAcross", "GiBoots", "GiWingedShield", "GiWingfoot",
  "GiMuscleUp", "GiBiceps", "GiFist", "GiPunch", "GiBootKick", "GiHighKick",
  "GiHourglass", "GiSandsOfTime", "GiStopwatch", "GiAlarmClock", "GiCompass", "GiPathDistance",
  "GiUpgrade", "GiLevelEndFlag", "GiFinishLine", "GiCheckeredFlag", "GiFlyingFlag",
  "GiPadlock", "GiPadlockOpen", "GiHazardSign", "GiTargetShot", "GiCrosshair", "GiBullseye",
  "GiMushroom", "GiSuperMushroom", "GiCherry", "GiBanana", "GiCandyCanes", "GiLollipop", "GiCupcake",
  "GiApple", "GiShinyApple", "GiChickenLeg", "GiMeat", "GiPizzaSlice",
];

function pickFrom(mod: Record<string, unknown>, test: (n: string) => boolean, rename: (n: string) => string): Loaded {
  const comps: Record<string, AnyComp> = {};
  for (const k of Object.keys(mod)) {
    if (typeof mod[k] !== "function" && typeof mod[k] !== "object") continue;
    if (!test(k)) continue;
    comps[rename(k)] = mod[k] as AnyComp;
  }
  return { names: Object.keys(comps).sort(), comps };
}

async function loadRaw(id: string): Promise<Loaded> {
  switch (id) {
    case "lucide": {
      // code-split like every other library — the registry is heavy
      const m = await import("./lucideLib");
      return pickFrom(m.default as unknown as Record<string, unknown>, () => true, (n) => n);
    }
    case "phosphor": {
      const m = await import("react-icons/pi");
      return pickFrom(m as Record<string, unknown>, (n) => /^Pi[A-Z]/.test(n) && !/(Bold|Duotone|Fill|Light|Thin)$/.test(n), (n) => n.slice(2));
    }
    case "tabler": {
      const m = await import("react-icons/tb");
      return pickFrom(m as Record<string, unknown>, (n) => /^Tb[A-Z]/.test(n) && !/Filled$/.test(n), (n) => n.slice(2));
    }
    case "game": {
      const m = await import("react-icons/gi") as Record<string, unknown>;
      const picks = GAME_PICKS.filter((n) => n in m);
      const src: Record<string, unknown> = {};
      for (const n of picks) src[n] = m[n];
      return pickFrom(src, () => true, (n) => n.slice(2));
    }
    case "hero": {
      const m = await import("react-icons/hi2");
      return pickFrom(m as Record<string, unknown>, (n) => /^HiOutline[A-Z]/.test(n), (n) => n.slice(9));
    }
    case "iconoir": {
      const m = await import("iconoir-react");
      return pickFrom(m as Record<string, unknown>, (n) => /^[A-Z]/.test(n) && !/^Iconoir/.test(n), (n) => n);
    }
    case "remix": {
      const m = await import("react-icons/ri");
      return pickFrom(m as Record<string, unknown>, (n) => /^Ri[A-Z]/.test(n) && /Line$/.test(n), (n) => n.slice(2).replace(/Line$/, ""));
    }
    default:
      return loadRaw("lucide");
  }
}

export function libLoaded(id: string): boolean { return loaded.has(id); }

export function loadLib(id: string): Promise<Loaded> {
  const hit = loaded.get(id);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const p = loadRaw(id).then((l) => { loaded.set(id, l); pending.delete(id); return l; });
  pending.set(id, p);
  return p;
}

// Lucide loads through loadLib like every other library — the registry
// lives in its own lazy chunk so the app shell stays light.

export function searchLib(id: string, query: string, limit = 24): string[] {
  const l = loaded.get(id);
  if (!l) return [];
  const q = query.trim().toLowerCase();
  if (!q) return l.names.slice(0, limit);
  const starts: string[] = [], contains: string[] = [];
  for (const n of l.names) {
    const ln = n.toLowerCase();
    if (ln.startsWith(q)) starts.push(n);
    else if (ln.includes(q)) contains.push(n);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Normalize a component render into an IconDef (cached). */
export function getDef(lib: string, name: string): IconDef | null {
  const key = lib + "/" + name;
  const hit = defCache.get(key);
  if (hit) return hit;
  const l = loaded.get(lib);
  const comp = l?.comps[name];
  if (!comp) return null;
  const svg = renderToStaticMarkup(createElement(comp, { size: 24, width: 24, height: 24 }));
  const open = /^<svg([^>]*)>/i.exec(svg)?.[1] ?? "";
  const viewBox = /viewBox="([^"]+)"/.exec(open)?.[1] ?? "0 0 24 24";
  const strokeAttr = /stroke="([^"]*)"/.exec(open)?.[1];
  const fillAttr = /fill="([^"]*)"/.exec(open)?.[1];
  const mode: IconDef["mode"] =
    (strokeAttr && strokeAttr !== "none") || fillAttr === "none" ? "stroke" : "fill";
  const inner = svg.replace(/^<svg[^>]*>/i, "").replace(/<\/svg>$/i, "");
  const def: IconDef = { lib, name, viewBox, inner, mode };
  defCache.set(key, def);
  return def;
}

/** Small inline preview markup for the icon grid. */
export function previewSvg(def: IconDef, size = 17): string {
  const paint = def.mode === "stroke"
    ? `fill="none" stroke="currentColor" stroke-width="${def.viewBox.includes("256") ? 16 : 2}" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="currentColor"`;
  return `<svg viewBox="${def.viewBox}" width="${size}" height="${size}" ${paint} color="currentColor">${def.inner}</svg>`;
}

/* fill-weight morphology ids — normalized away by the byte fences like
   every other UID family */
let FW_UID = 0;

/** Positioned, colored icon group for embedding in a component SVG string. */
export function iconGroup(def: IconDef, x: number, y: number, size: number, color: string, opts: {
  strokeWidth?: number; opacity?: number; rotation?: number; filter?: string;
  /** Weight factor for FILL-mode glyphs (1 = as authored). Stroke glyphs
   *  carry weight in `strokeWidth`; filled glyphs (Phosphor, Game Icons,
   *  Remix) have no stroke to widen, so the Icons panel's Weight dial was
   *  dead on three of the seven libraries. A feMorphology dilate/erode on
   *  the glyph's own rendering moves the silhouette edge by the same
   *  distance the equivalent stroke-width change would — the dial now
   *  means the same thing in every library. Exactly 1 (or absent) emits
   *  byte-identical markup to before. */
  fillWeight?: number;
} = {}): string {
  const vb = def.viewBox.split(/[\s,]+/).map(Number);
  const vx = vb[0] || 0, vy = vb[1] || 0, vw = vb[2] || 24, vh = vb[3] || 24;
  const s = size / Math.max(vw, vh);
  // Stroke widths are authored for a 24-box; rescale for other viewBoxes.
  const swScale = Math.max(vw, vh) / 24;
  const rot = opts.rotation ? ` rotate(${opts.rotation.toFixed(1)} ${(vx + vw / 2).toFixed(1)} ${(vy + vh / 2).toFixed(1)})` : "";
  const paint = def.mode === "stroke"
    ? `fill="none" stroke="${color}" stroke-width="${((opts.strokeWidth ?? 2.4) * swScale).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${color}" stroke="none"`;
  const op = opts.opacity !== undefined && opts.opacity < 1 ? ` opacity="${opts.opacity.toFixed(2)}"` : "";
  const filt = opts.filter ? ` style="filter:${opts.filter}"` : "";
  /* edge shift matches the stroke world: a stroke going 2.4 → sw moves each
     edge by (sw − 2.4)/2, i.e. 1.2·(fw − 1) at fw = sw/2.4. Same clamp
     window as bevel's iconWK. The filter rides an INNER group so the erode/
     dilate radius lives in the glyph's own viewBox units (swScale applies),
     and the region is widened so a dilated glyph never clips. */
  const fw = def.mode === "fill" && opts.fillWeight !== undefined
    ? Math.min(1.8, Math.max(0.35, opts.fillWeight)) : 1;
  let inner = def.inner;
  if (Math.abs(fw - 1) > 0.001) {
    const shift = 1.2 * (fw - 1) * swScale;
    const fid = `ifw${FW_UID++}`;
    inner = `<defs><filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feMorphology operator="${shift > 0 ? "dilate" : "erode"}" radius="${Math.abs(shift).toFixed(2)}"/></filter></defs><g filter="url(#${fid})">${def.inner}</g>`;
  }
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(4)})${rot} translate(${-vx} ${-vy})" color="${color}" ${paint}${op}${filt}>${inner}</g>`;
}
