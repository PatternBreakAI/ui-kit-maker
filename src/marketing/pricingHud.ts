/* The game-HUD dressing that frames the pricing table.

   These are NOT decorative mockups. Every piece is a live render from the
   same engine that draws the editor canvas — the exact renderKit() calls
   the app makes, on the authored Grape Jelly preset. That matters on this
   page in particular: it is the page asking for money, and the ornament
   around the table is a working sample of the thing being sold.

   The engine is a heavy module, so it loads lazily after paint and the
   ornaments simply stay empty if that import never resolves. Nothing on
   the page depends on them. */

type Spec = {
  /** kit component id, straight from KIT_COMPONENTS */
  kid: string;
  /** rendered width in CSS px — the SVG is cropped to its shell, then scaled */
  w: number;
  value?: number;
  label?: string;
  /** STOCK_ICONS key, for the slots that take gear */
  icon?: string;
  size?: "s" | "m" | "l";
};

/** Left rail: who you are. Portrait, party rails, purse. */
export const HUD_LEFT: Spec[] = [
  { kid: "avatarframe", w: 86, value: 0.12 },          // value × 99 = LV 12
  { kid: "partyframe", w: 184, value: 0.72 },
  { kid: "currency", w: 124, label: "12,450" },
  { kid: "currency", w: 102, label: "840" },
];

/** Right rail: what you're carrying, and what you're doing. */
export const HUD_RIGHT: Spec[] = [
  { kid: "equipslot", w: 40, icon: "sword" },
  { kid: "equipslot", w: 40, icon: "shield" },
  { kid: "equipslot", w: 40, icon: "flask" },
  { kid: "equipslot", w: 40, icon: "bag" },
  { kid: "questpanel", w: 182, value: 0.66, label: "MISSION" },
];

type Merge = Record<string, unknown>;
function deepMerge(base: Merge, over: Merge): Merge {
  for (const k of Object.keys(over)) {
    const b = base[k], o = over[k];
    if (b && typeof b === "object" && !Array.isArray(b) && o && typeof o === "object" && !Array.isArray(o)) {
      deepMerge(b as Merge, o as Merge);
    } else base[k] = o;
  }
  return base;
}

/** Crop a render's viewBox to its shell so the piece fills its box. */
function tighten(svg: string, pad = 16): string {
  const m = /data-shell="([-\d. ]+)"/.exec(svg);
  if (!m) return svg;
  const [sx, sy, sw, sh] = m[1].split(" ").map(Number);
  return svg
    .replace(/width="[^"]*"/, `width="${Math.round(sw + pad * 2)}"`)
    .replace(/height="[^"]*"/, `height="${Math.round(sh + pad * 2)}"`)
    .replace(/viewBox="[^"]*"/, `viewBox="${(sx - pad).toFixed(1)} ${(sy - pad).toFixed(1)} ${(sw + pad * 2).toFixed(1)} ${(sh + pad * 2).toFixed(1)}"`);
}

/** Fill every [data-hud] node under `root` with its render. Safe to call
    on an unmounted tree — it no-ops once `cancelled` flips. */
export async function paintHud(root: HTMLElement, isCancelled: () => boolean): Promise<void> {
  let E: typeof import("./engine").engineApi;
  try {
    ({ engineApi: E } = await import("./engine"));
  } catch {
    return;   // engine chunk unavailable — the ornaments stay empty
  }
  if (isCancelled()) return;

  const { STOCK_ICONS } = await import("@/generator/model");
  if (isCancelled()) return;

  const cfg = deepMerge(
    E.defaultConfig() as unknown as Merge,
    JSON.parse(JSON.stringify(E.AUTHORED["grape-jelly"])) as Merge,
  ) as unknown as Parameters<typeof E.renderKit>[0];

  /* Grape Jelly ships with a diagonal stripe and a hot gloss — right for a
     specimen on the kit page, far too loud for chrome sitting beside a
     price. Strip the pattern and calm the shine so these read as the
     console bezel they are, not a second thing competing for the eye. */
  cfg.candy.pattern.type = "none";
  cfg.candy.gloss.opacity = Math.min(cfg.candy.gloss.opacity, 4);

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-hud]"))) {
    if (isCancelled()) return;
    const kid = (el.dataset.hud ?? "") as Parameters<typeof E.renderKit>[1];
    const v = el.dataset.v ? Number(el.dataset.v) : undefined;
    const icon = el.dataset.icon ? STOCK_ICONS[el.dataset.icon] : undefined;
    try {
      el.innerHTML = tighten(
        E.renderKit(cfg, kid, (el.dataset.sz as "s" | "m" | "l") || "m", "default", v, undefined, {
          label: el.dataset.label,
          icon,
        }),
      );
    } catch {
      /* one bad piece never takes the page down */
    }
  }
}
