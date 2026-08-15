import { useGen } from "@/generator/store";
import { applyKitDesign, applyKitTextFill, baseOf, effKitSize } from "@/generator/model";
import type { GenConfig, KitComponentId, KitSlice } from "@/generator/model";
import { renderKit } from "@/generator/bevel";

export interface SliceProbe {
  auto: KitSlice;
  /** Tight-cropped sprite at design scale — the crop the export ships. */
  cv: HTMLCanvasElement;
  /** The calmed svg the sprite came from, for re-rendering at zoom. */
  svg: string;
  /** The tight crop's box inside that svg, design px. */
  box: { x0: number; y0: number; w: number; h: number };
}

/* the export's ground-truth slice measurement, run client-side so the
   "Custom" editor seeds FROM what Auto would ship (owner: "so that the
   computer doesn't have to guess and the user can adjust") — render the
   calmed piece, walk each edge profile to where it flattens, pad. */
export async function measureAutoSlice(cid: KitComponentId): Promise<SliceProbe | null> {
  try {
    const st = useGen.getState();
    const c = JSON.parse(JSON.stringify(applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns[cid]), st.kitTextFill[cid]))) as GenConfig;
    c.stateDesigns = {};
    c.shadow.opacity = 0;
    c.candy.contact.opacity = 0;
    for (const g of Object.values(c.states)) g.glow = 0;
    // a duplicated piece measures through its BASE geometry — renderKit
    // refuses clone ids; every map read above stays keyed to the piece
    const svg = renderKit(c, baseOf(cid), effKitSize(st.kitSizes[cid]), "default", undefined, st.kitShapes[cid], { label: "", icon: null });
    const cv = await new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { const k = document.createElement("canvas"); k.width = img.width; k.height = img.height; k.getContext("2d")!.drawImage(img, 0, 0); resolve(k); };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    const w = cv.width, h = cv.height;
    const d = cv.getContext("2d")!.getImageData(0, 0, w, h).data;
    const solid = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 40;
    const topAt = new Int32Array(w).fill(-1), botAt = new Int32Array(w).fill(-1);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) if (solid(x, y)) { topAt[x] = y; break; }
      for (let y = h - 1; y >= 0; y--) if (solid(x, y)) { botAt[x] = y; break; }
    }
    const cols: number[] = [];
    for (let x = 0; x < w; x++) if (topAt[x] >= 0) cols.push(x);
    if (cols.length < 8) return null;
    const x0 = cols[0], x1 = cols[cols.length - 1];
    let yT = h, yB = -1;
    for (const x of cols) { if (topAt[x] < yT) yT = topAt[x]; if (botAt[x] > yB) yB = botAt[x]; }
    const leftAt = new Int32Array(h).fill(-1), rightAt = new Int32Array(h).fill(-1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (solid(x, y)) { leftAt[y] = x; break; }
      for (let x = w - 1; x >= 0; x--) if (solid(x, y)) { rightAt[y] = x; break; }
    }
    const rows: number[] = [];
    for (let y = 0; y < h; y++) if (leftAt[y] >= 0) rows.push(y);
    if (rows.length < 8) return null;
    const ry0 = rows[0], ry1 = rows[rows.length - 1];
    const T = 2;
    let tl = x0; while (tl <= x1 && (topAt[tl] < 0 || topAt[tl] > yT + T)) tl++;
    let tr = x1; while (tr >= x0 && (topAt[tr] < 0 || topAt[tr] > yT + T)) tr--;
    let bl = x0; while (bl <= x1 && (botAt[bl] < 0 || botAt[bl] < yB - T)) bl++;
    let br = x1; while (br >= x0 && (botAt[br] < 0 || botAt[br] < yB - T)) br--;
    let lt = ry0; while (lt <= ry1 && (leftAt[lt] < 0 || leftAt[lt] > x0 + T)) lt++;
    let lb = ry1; while (lb >= ry0 && (leftAt[lb] < 0 || leftAt[lb] > x0 + T)) lb--;
    let rt2 = ry0; while (rt2 <= ry1 && (rightAt[rt2] < 0 || rightAt[rt2] < x1 - T)) rt2++;
    let rb = ry1; while (rb >= ry0 && (rightAt[rb] < 0 || rightAt[rb] < x1 - T)) rb--;
    const PAD = 3;
    /* the tight-cropped sprite — the same crop the export ships, so the
       preview and the measured numbers speak the same coordinates */
    const tw = x1 - x0 + 1, th = ry1 - ry0 + 1;
    const tight = document.createElement("canvas");
    tight.width = tw; tight.height = th;
    tight.getContext("2d")!.drawImage(cv, x0, ry0, tw, th, 0, 0, tw, th);
    return {
      auto: {
        left: Math.max(tl, bl) - x0 + PAD,
        right: x1 - Math.min(tr, br) + PAD,
        top: Math.max(lt, rt2) - ry0 + PAD,
        bottom: ry1 - Math.min(lb, rb) + PAD,
      },
      cv: tight,
      svg,
      box: { x0, y0: ry0, w: tw, h: th },
    };
  } catch { return null; }
}

/** The calmed sprite re-rendered at `scale`, tight-cropped to the probe's
 *  box — vector-crisp for the big workbench (the svg's own width/height
 *  are patched so the browser rasterizes at the target resolution). */
export async function renderSliceSprite(probe: SliceProbe, scale: number): Promise<HTMLCanvasElement | null> {
  try {
    const m = probe.svg.match(/width="([\d.]+)" height="([\d.]+)"/);
    if (!m) return null;
    const big = probe.svg.replace(
      /width="([\d.]+)" height="([\d.]+)"/,
      `width="${+m[1] * scale}" height="${+m[2] * scale}"`,
    );
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(big);
    });
    const k = document.createElement("canvas");
    k.width = Math.round(probe.box.w * scale);
    k.height = Math.round(probe.box.h * scale);
    k.getContext("2d")!.drawImage(
      img,
      probe.box.x0 * scale, probe.box.y0 * scale, probe.box.w * scale, probe.box.h * scale,
      0, 0, k.width, k.height,
    );
    return k;
  } catch { return null; }
}

/** Unity's Sliced Image draw — nine regions, rigid corners, edges stretch
 *  one axis, the middle both. Shared by every preview so they cannot lie
 *  differently. Borders are in SOURCE px. */
export function drawNineSlice(
  ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, s: KitSlice,
  dx: number, dy: number, dw: number, dh: number,
): void {
  const w = src.width, h = src.height;
  const l = Math.min(s.left, Math.floor(w / 2) - 2), r = Math.min(s.right, Math.floor(w / 2) - 2);
  const t = Math.min(s.top, Math.floor(h / 2) - 2), b = Math.min(s.bottom, Math.floor(h / 2) - 2);
  const xs = [0, l, w - r, w], dxs = [0, l, dw - r, dw];
  const ys = [0, t, h - b, h], dys = [0, t, dh - b, dh];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const sw = xs[i + 1] - xs[i], sh = ys[j + 1] - ys[j];
    const ddw = dxs[i + 1] - dxs[i], ddh = dys[j + 1] - dys[j];
    if (sw > 0 && sh > 0 && ddw > 0 && ddh > 0)
      ctx.drawImage(src, xs[i], ys[j], sw, sh, dx + dxs[i], dy + dys[j], ddw, ddh);
  }
}
