/* ── atomic engine export ─────────────────────────────────────────
   The engine contract: NOTHING replaceable is baked. Every component
   ships as atomic, transparent PNGs (frames and surfaces as nine-slice
   with explicit margins), a manifest with native dimensions, slice
   margins, pivots, tintability and usage, plus Unity import tooling.
   Labels are LIVE ENGINE TEXT — the manifest carries
   the display face and its source instead of pixels. The packed sheet is
   a visual catalog only, produced after the atomics. */
import type { GenConfig, KitComponentId, KitDesign, Shape } from "./model";
import type { BoardDef, LibItem } from "./store";
import { stampFilter, stampFilterPad, boardBgFilter, drawBoardNoise, drawBoardOverlays, stampSvg, warpStampRaster } from "./store";
import { applyKitDesign, applyKitTextFill, darken, lighten, hexRgba, fontByName, isFlipShape, KIT_SHAPE, KIT_SLICEABLE, STOCK_ICONS, effKitSize, kitVisible, resolveKitIcon, sanitizeUnitySlug } from "./model";
import { renderKit, renderBevel, rarityTiers, textPatternCell, renderTypeSpecimen, userShapeCaps } from "./bevel";
import { flattenPath } from "./importedShapes";
import { silhouetteMeta } from "./silhouettes";
import { download, makeZip, svgToPngBytes, svgToPngBytesTight, svgsToPngBytesTightUnion, svgAlphaBox, glowFromPng, setEmbedFont, inlineKitFace, measureSliceRGBA } from "./exportUtils";
import type { CropBox } from "./exportUtils";
import { kitSpecMarkdown, fontNotesMarkdown, kitFontFamilies } from "./kitDocs";

const clone = (c: GenConfig) => (typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c))) as GenConfig;
const PNG_SCALE = 2;

interface AssetMeta {
  file: string; component: string; part: string;
  nativeW: number; nativeH: number;
  /** Content hash — the importer's receipt compares these across sends to
      report new / restyled / unchanged without touching file bytes (I2). */
  sha256: string;
  nineSlice: { left: number; right: number; top: number; bottom: number } | null;
  pivot: { x: number; y: number };
  tintable: boolean;
  usage: string;
  /** The SHELL's box inside the shipped sprite, in file pixels (at
   *  pngScale). Scenes size pieces shell-to-shell with it — scaling by
   *  the sprite rect compared a glow-padded board box against a cropped
   *  sprite and every prefab landed oversized (owner: "weird sizing"). */
  shell?: { x: number; y: number; w: number; h: number } | null;
  /** The bake's silhouette is MIRRORED (~flip) — flip provenance so board
   *  scenes can honor a mirrored board copy against an unmirrored sprite
   *  (and so field reports can name which side lost the flip). */
  flip?: boolean;
  /** The shell's footprint measured WITH the prefab's stock words, design
   *  px (base rows of labeled families only). The importer grows the
   *  prefab's default rect so the label fits at drag-in — the labeless
   *  natural rect squished fluid silhouettes under overflowing text. */
  prefW?: number; prefH?: number;
  /** The app's EXACT label metrics, parsed from the ghosted bake's own
   *  <text> node (base rows of labeled families): center offset from the
   *  shell CENTER in design px (y down — frame-invariant, so the importer
   *  can seat in sprite space) and the true rendered font size (fit-downs
   *  included). The app centers words in the CONTENT zone, not the shell
   *  (owner: "we are always cheating right a bit" on the flame). */
  labelDx?: number; labelDy?: number; labelFs?: number;
}

export interface EngineExportState {
  cfg: GenConfig;
  /** Release states for staged pieces — a staged prop family ships only
      when released or actually placed on one of this export's boards. */
  releases?: Parameters<typeof kitVisible>[1];
  kitDesigns: Partial<Record<KitComponentId, KitDesign>>;
  kitTextFill: Partial<Record<KitComponentId, string>>;
  kitShapes: Partial<Record<KitComponentId, Shape>>;
  kitSizes: Partial<Record<KitComponentId, "s" | "m" | "l">>;
  /** Per-piece 9-slice override from the app's slicing editor, design px —
      absent = borders measured from the rendered pixels. */
  kitSlices?: Partial<Record<KitComponentId, { left: number; right: number; top: number; bottom: number }>>;
  kitName: string;
  /** I1 — the kit's PERMANENT address inside the user's Unity project
      (Assets/UIKitMaker/<slug>/). Minted at first export, survives display
      renames; changing it would orphan everything a user has placed. */
  slug: string;
  /** Monotonic per-export counter for the manifest + import receipts. */
  kitVersion: number;
  /** Free tier ships a STARTER payload (master button + chip + progress —
      states, nine-slice and the overwrite restyle all demonstrated); paid
      tiers ship every component. Same folder, same paths: upgrading later
      lands the full kit over the starter without moving anything. */
  scope: "free" | "full";
  /** Boards→Scenes (Pro): the user's artboards, pre-collected by
      collectExportBoards. Emitted ONLY when scope is "full" — a remix
      never exits the browser on the free tier. */
  boards?: ExportBoardData[];
}

/* ── Boards→Scenes: the board document, serialized for the importer ──
   Positions are BOARD coordinates (1920×1080 / 390×844, y down, item
   CENTER); the importer re-anchors each piece to its nearest zone so the
   layout survives resolution changes. w/h are the piece's intended
   design-px footprint — the importer scales the prefab to match, so any
   prefab sizing convention stays correct. */
export interface ExportBoardItemData {
  component: string;
  cx: number; cy: number;
  w: number; h: number;
  rot: number;
  /** per-copy words (owner: two START buttons on one screen) — null = the
      prefab's own label stands */
  label: string | null;
  value: number | null;
  /** zone anchor, Unity convention (ax 0..1 left→right, ay 0..1 bottom→top) */
  ax: number; ay: number;
  anchor: string;
  /** a TYPE STAMP item: the zip path of its baked sprite (adjust dials +
      shadow/glow already in the pixels); null for prefab-backed pieces */
  stamp: string | null;
  /** a POSED bake for a prefab piece whose board pose diverges from the
      family sprite's natural aspect — the engine's own render at the
      exact board proportions, label stripped (words stay live). The
      scene wears it 1:1 on an ART CHILD instead of stretching the
      nine-slice; the item's own rect stays the SHELL footprint. */
  posed?: string | null;
  /** the posed art's footprint in board px (crop box: shell + overhang —
      extrusion, bloom) and its center's offset from the shell center
      (board y runs down). The importer sizes the art child with these. */
  posedW?: number; posedH?: number; posedDx?: number; posedDy?: number;
  /** the copy's designed states at the same posed crop — Sprite Swap
      skins for the art child (press sink and state looks in the pixels) */
  posedHover?: string; posedPressed?: string; posedDisabled?: string;
  /** the copy's OWN label center offset from the shell center, board px
      (y down) — the scene seats the live words exactly where this copy
      drew them, not where the stock bake did */
  posedLabelDx?: number; posedLabelDy?: number;
  /** render-variant overlay (trophy ~gold) — the importer swaps the
      matching variant sprite onto the placed prefab; null = stock */
  ov?: string | null;
  /** the board copy's silhouette is MIRRORED (~flip) — the scene compares
      this against the family sprite's own flip and mirrors the instance
      when they disagree (belt-and-braces for the BACK-tab report) */
  flip?: boolean;
  /** inventory grid only: the wells' boxes as fractions of the baked
      raster, flattened x,y,w,h per cell — the scene builds live click
      tiles from these and re-draws the selection ring itself */
  cells?: number[];
  cellSel?: number | null;
}
export interface ExportBoardData {
  name: string;
  w: number; h: number;
  bg: {
    file: string; opacity: number; blur: number;
    overlay: string; overlayStrength: number; overlayBlend: string;
    /** the darkroom dials — already BAKED into the bytes, so the importer
        places the image as-is; recorded for transparency */
    saturation: number; hue: number; brightness: number; contrast: number; noise: number;
    /** original upload bytes from the vault, or the decoded proxy when the
        vault has no original (other device / pre-vault board) */
    bytes: Uint8Array;
    /** true when the vault original shipped; false = proxy fallback */
    original: boolean;
  } | null;
  items: ExportBoardItemData[];
  /** baked stamp sprites for this board — pushed into the zip beside bg */
  stampFiles: { file: string; bytes: Uint8Array }[];
}

const dataUrlBytes = (u: string): { bytes: Uint8Array; ext: string } | null => {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(u);
  if (!m) return null;
  const bin = atob(m[2]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { bytes: out, ext: m[1] === "jpeg" ? "jpg" : m[1] };
};

/** Assemble the boards for a scene export: geometry from the same render
    recipe the Board stage uses, background bytes vault-first. Boards with
    no kit pieces are skipped (nothing to build a scene from). */
/* Which board pieces arrive in scenes as LIVE prefabs, and under which
   manifest family. The board stores editor ids ("primary") while the
   importer names prefabs from sprite families ("button-primary" →
   ButtonPrimary.prefab) — emitting the raw id sent the scene builder
   looking for Primary.prefab and the piece was skipped (owner: "missing
   the custom buttons"). Ids OUTSIDE this map ship no sprite family at
   all (staged props, newer pieces), so those pieces travel as BAKED
   SPRITES of exactly what the board showed instead. Keep in step with
   the NINE table and the importer's prefab builders. */
const PREFAB_FAMILY: Partial<Record<KitComponentId, string>> = {
  primary: "button-primary", secondary: "button-secondary", small: "button-small",
  chip: "chip", tab: "tab", tabback: "tab-back", input: "input", panel: "panel", header: "header-banner",
  datarow: "list-row", slot: "item-slot",
  iconbtn: "iconbtn", checkbox: "checkbox", radio: "radio", badge: "badge",
  progress: "progress", joystick: "joystick", seasontrack: "seasontrack",
  /* the prop pieces went live (owner: only TEXT stays baked) — identity
     families shipped by the PROPS export block */
  gearicon: "gearicon", trophyicon: "trophyicon", gifticon: "gifticon",
  firebutton: "firebutton", endturn: "endturn", keycap: "keycap",
  pricebtn: "pricebtn", countbadge: "countbadge",
  /* the settings controls place as WIRED rigs (owner: "let's get those
     settings screens working") — Slider / Switch prefabs, value-driven */
  slider: "slider", toggle: "toggle",
  // the mini-map places as the Minimap prefab (demo radar aboard)
  minimap: "minimap",
};

/* The stock words each labeled family's prefab wears (mirror of the
   importer's DefaultLabel). The sliced family sprites BAKE at this labeled
   geometry — a fluid silhouette draws its true decorated ends at the width
   the words need, with the content group rendered invisible so the pixels
   stay labeless (owner: "how can we get the prefab to look more like the
   button in the kit"). The posed-divergence test measures its natural
   aspect against the same words, so a board copy at stock proportions
   rides the sliced prefab and only true re-poses bake. */
const PREF_LABEL: Partial<Record<KitComponentId, string>> = {
  primary: "PLAY", secondary: "PLAY", small: "PLAY",
  chip: "NEW", tab: "TAB", tabback: "BACK", header: "SETTINGS",
};

export async function collectExportBoards(st: {
  boards: BoardDef[];
  cfg: GenConfig;
  kitTextFill: Partial<Record<KitComponentId, string>>;
  kitSizes: Partial<Record<KitComponentId, "s" | "m" | "l">>;
  kitShapes: Partial<Record<KitComponentId, Shape>>;
  kitLabels: Partial<Record<KitComponentId, string>>;
  kitVals: Partial<Record<KitComponentId, number>>;
  /** Per-component icon overrides — board pieces wear them on the stage,
   *  so measurements and baked sprites must too (optional: older callers). */
  kitIcons?: Partial<Record<KitComponentId, Parameters<typeof resolveKitIcon>[0]>>;
  /** Per-component design forks — the Board stage applies them, so the
   *  exported scenes must too (optional: older callers ship master-only). */
  kitDesigns?: Partial<Record<KitComponentId, Parameters<typeof applyKitDesign>[1]>>;
  /** The saved-asset library — board pieces frozen from a reworked copy
   *  (the BACK-button story). Needed so those pieces travel to Unity. */
  library?: LibItem[];
}): Promise<ExportBoardData[]> {
  const { getBgOriginal, captureVideoPoster } = await import("./bgvault");
  const STAGE_DIMS: Record<"169" | "mobile", [number, number]> = { "169": [1920, 1080], mobile: [390, 844] };
  const out: ExportBoardData[] = [];
  const seen = new Set<string>();
  for (const bd of st.boards) {
    const items = bd.items.filter((b) => b.kitId || b.stamp || b.libId);
    if (!items.length) continue;
    const [W, H] = STAGE_DIMS[bd.aspect];
    let slug = bd.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "board";
    while (seen.has(slug)) slug += "2";
    seen.add(slug);

    let bg: ExportBoardData["bg"] = null;
    // a video board carries no bgImage locally, but its vaulted POSTER
    // (the first frame) still gives the scene a background
    if ((bd.bgImage || bd.bgAssetId || bd.bgVideo) && (bd.bgShow ?? true)) {
      let bytes: Uint8Array | null = null, ext = "png", original = false;
      if (bd.bgAssetId) {
        const rec = await getBgOriginal(bd.bgAssetId);
        if (rec) {
          bytes = new Uint8Array(await rec.blob.arrayBuffer());
          ext = /png$/.test(rec.type) ? "png" : /webp$/.test(rec.type) ? "webp" : "jpg";
          original = true;
        }
      }
      if (!bytes && bd.bgImage) {
        const d = dataUrlBytes(bd.bgImage);
        if (d) { bytes = d.bytes; ext = d.ext; }
        else if (bd.bgImage.startsWith("/")) {
          // bundled backdrop — fetch the shipped asset itself
          try {
            const r = await fetch(bd.bgImage);
            if (r.ok) { bytes = new Uint8Array(await r.arrayBuffer()); ext = bd.bgImage.split(".").pop() ?? "jpg"; }
          } catch { /* scene ships without a backdrop */ }
        }
        else if (/^https:\/\//.test(bd.bgImage)) {
          // library scene (or any remote image) — the storage bucket serves
          // permissive CORS, so the bytes bake exactly like a bundled one
          try {
            const r = await fetch(bd.bgImage);
            if (r.ok) {
              bytes = new Uint8Array(await r.arrayBuffer());
              const ct = r.headers.get("content-type") ?? "";
              ext = /png/.test(ct) ? "png" : /webp/.test(ct) ? "webp" : /jpe?g/.test(ct) ? "jpg"
                : (bd.bgImage.split(".").pop()?.split("?")[0] ?? "png");
            }
          } catch { /* scene ships without a backdrop */ }
        }
      }
      if (!bytes && bd.bgVideo) {
        /* a video board with NO vaulted poster — boards from before posters
           existed, or a capture that failed at set time. Grab the first
           frame NOW, at export (owner: "it didn't bring in the video
           snapshot"); a CORS-refusing host still ships no backdrop. */
        try {
          const pb0 = await captureVideoPoster(bd.bgVideo);
          if (pb0) { bytes = new Uint8Array(await pb0.arrayBuffer()); ext = "jpg"; }
        } catch { /* scene ships without a backdrop */ }
      }
      /* the whole darkroom BAKES into the shipped pixels — hue, saturation,
         brightness, contrast, blur AND the seeded grain are deterministic
         ops, so what the stage shows is exactly what Unity places. A failed
         decode ships the untouched bytes; the manifest keeps the dials. */
      const grade = boardBgFilter(bd);
      const grain = bd.bgNoise ?? 0;
      /* the scene must LOOK like the board (owner): a Fit-mode backdrop, an
         overlay wash or the center scrim can't ride as live Unity layers —
         so those boards flatten the WHOLE backdrop stack at board resolution
         (stage floor, fit layout, grade, grain, wash, scrim, even the bg
         opacity), the exact drawBoardOverlays recipe the PNG export uses.
         The importer then places ONE finished image and adds nothing. */
      const ovBake = bd.bgFit === "fit" || (bd.ovMode ?? "none") !== "none" || (bd.ovCenter ?? 0) > 0;
      let baked = false;
      if (bytes && (grade || grain > 0 || ovBake)) {
        try {
          const bmp = await createImageBitmap(new Blob([bytes.slice().buffer as ArrayBuffer]));
          const cv = document.createElement("canvas");
          const ctx0 = cv.getContext.bind(cv);
          if (ovBake) {
            cv.width = W; cv.height = H;
            const ctx = ctx0("2d")!;
            ctx.fillStyle = "#0D0F16"; // the stage floor behind a translucent bg
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = Math.min(1, Math.max(0, (bd.bgOpacity ?? 100) / 100));
            if (bd.bgFit === "fit") {
              const sc = Math.max(W / bmp.width, H / bmp.height) * 1.12;
              ctx.filter = [grade, `blur(${Math.round(W * 0.014)}px) brightness(0.72)`].filter(Boolean).join(" ");
              ctx.drawImage(bmp, (W - bmp.width * sc) / 2, (H - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
              ctx.filter = grade || "none";
              const sf = Math.min(W / bmp.width, H / bmp.height);
              ctx.drawImage(bmp, (W - bmp.width * sf) / 2, (H - bmp.height * sf) / 2, bmp.width * sf, bmp.height * sf);
            } else {
              if (grade) ctx.filter = grade;
              const s9 = Math.max(W / bmp.width, H / bmp.height);
              ctx.drawImage(bmp, (W - bmp.width * s9) / 2, (H - bmp.height * s9) / 2, bmp.width * s9, bmp.height * s9);
            }
            ctx.filter = "none";
            ctx.globalAlpha = 1;
            drawBoardNoise(ctx, W, H, grain);
            drawBoardOverlays(ctx, W, H, bd);
          } else {
            cv.width = bmp.width; cv.height = bmp.height;
            const ctx = ctx0("2d")!;
            if (grade) ctx.filter = grade;
            ctx.drawImage(bmp, 0, 0);
            ctx.filter = "none";
            drawBoardNoise(ctx, cv.width, cv.height, grain);
          }
          bmp.close();
          const jpeg = ext === "jpg" && !ovBake;
          const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, jpeg ? "image/jpeg" : "image/png", jpeg ? 0.92 : undefined));
          if (blob) { bytes = new Uint8Array(await blob.arrayBuffer()); if (!jpeg) ext = "png"; }
          if (ovBake) baked = true;
        } catch { /* undecodable — ship as-is */ }
      }
      if (bytes) {
        bg = {
          file: `backgrounds/${slug}.${ext}`, bytes, original: baked ? false : original,
          opacity: baked ? 100 : (bd.bgOpacity ?? 100), blur: bd.bgBlur ?? 0, saturation: bd.bgSat ?? 100, hue: bd.bgHue ?? 0, brightness: bd.bgBright ?? 100, contrast: bd.bgContrast ?? 100, noise: bd.bgNoise ?? 0,
          overlay: baked ? "none" : (bd.ovMode ?? "none"), overlayStrength: bd.ovStrength ?? 100,
          overlayBlend: bd.ovBlend ?? "normal",
        };
      }
    }

    const exItems: ExportBoardItemData[] = [];
    const stampFiles: { file: string; bytes: Uint8Array }[] = [];
    for (const b of items) {
      if (b.stamp) {
        /* a stamp bakes to its own sprite: specimen svg → raster → the
           instance's adjust filter (shadow/glow included) on a canvas
           padded so nothing clips. Center is preserved (symmetric pad).
           The face rides INSIDE the svg: boards collect BEFORE the engine
           pipeline arms setEmbedFont, and a sealed raster with no embed
           bakes system glyphs (owner: warp "loses the font" — same trap). */
        const fd0 = fontByName(st.cfg.type.font);
        const stampSvgF = await inlineKitFace(stampSvg(st.cfg, b.stamp), st.cfg.type.font, fd0.name === st.cfg.type.font ? fd0.css ?? null : null);
        const { bytes: raw, w: rw0, h: rh0 } = await svgToPngBytes(stampSvgF, 2);
        const bmp = await createImageBitmap(new Blob([raw.slice().buffer as ArrayBuffer]));
        // warp FIRST (shadow/glow then follow the bent shape), filter second
        const warped = b.stamp.warp && b.stamp.warp.style !== "none" && b.stamp.warp.amount
          ? warpStampRaster(bmp, rw0, rh0, b.stamp.warp) : null;
        const rw = warped ? warped.width : rw0, rh = warped ? warped.height : rh0;
        const padPx = stampFilterPad(b.stamp) * 2;
        const cv = document.createElement("canvas");
        cv.width = rw + padPx * 2; cv.height = rh + padPx * 2;
        const cx2 = cv.getContext("2d")!;
        const sf = stampFilter(st.cfg, b.stamp);
        if (sf) cx2.filter = sf;
        cx2.drawImage(warped ?? bmp, padPx, padPx);
        bmp.close();
        const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
        if (!blob) continue;
        const file = `boardstamps/${slug}-${stampFiles.length + 1}.png`;
        stampFiles.push({ file, bytes: new Uint8Array(await blob.arrayBuffer()) });
        const k = b.scale ?? 1;
        const w = (cv.width / 2) * k, h = (cv.height / 2) * k;
        const cx = b.x + ((rw / 2) * k) / 2, cy = b.y + ((rh / 2) * k) / 2;
        const ax = cx < W / 3 ? 0 : cx > (2 * W) / 3 ? 1 : 0.5;
        const ay = cy < H / 3 ? 1 : cy > (2 * H) / 3 ? 0 : 0.5;
        exItems.push({
          component: "typestamp", cx: Math.round(cx * 10) / 10, cy: Math.round(cy * 10) / 10,
          w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10,
          rot: b.rot ?? 0, label: b.stamp.text, value: null, ax, ay,
          anchor: `${ay === 1 ? "top" : ay === 0 ? "bottom" : "middle"}-${ax === 0 ? "left" : ax === 1 ? "right" : "center"}`,
          stamp: file,
        });
        continue;
      }
      if (!b.kitId && b.libId) {
        /* a SAVED ASSET — its look and words are a frozen snapshot by
           design (the master is never touched), so it travels as a BAKED
           SPRITE exactly like a stamp: faithful to the pixel, and Unity
           shows the fork, not the master (owner: BACK arrived as the
           master's TAB). SMIL loops strip first — rasterizing at t=0
           leaves fade-in loops blank. */
        const item = st.library?.find((l) => l.id === b.libId);
        if (!item) continue;
        const raw0 = item.kit
          ? renderKit(item.cfg, item.kit.id, item.kit.size, "default", item.kit.v, item.kit.shape, item.kit.label ? { label: item.kit.label } : undefined)
          : renderBevel(item.cfg, "default");
        const still = raw0
          .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, "")
          .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, "");
        const fdL = fontByName(item.cfg.type.font);
        const svgL = await inlineKitFace(still, item.cfg.type.font, fdL.name === item.cfg.type.font ? fdL.css ?? null : null);
        const { bytes: pb } = await svgToPngBytes(svgL, 2);
        const swL = parseFloat(/width="([\d.]+)"/.exec(still)?.[1] ?? "200");
        const shL = parseFloat(/height="([\d.]+)"/.exec(still)?.[1] ?? "80");
        const file = `boardstamps/${slug}-a${stampFiles.length + 1}.png`;
        stampFiles.push({ file, bytes: pb });
        const kL = b.scale ?? 1;
        const wL = swL * kL, hL = shL * kL;
        const cxL = b.x + wL / 2, cyL = b.y + hL / 2;
        const axL = cxL < W / 3 ? 0 : cxL > (2 * W) / 3 ? 1 : 0.5;
        const ayL = cyL < H / 3 ? 1 : cyL > (2 * H) / 3 ? 0 : 0.5;
        exItems.push({
          component: "libasset", cx: Math.round(cxL * 10) / 10, cy: Math.round(cyL * 10) / 10,
          w: Math.round(wL * 10) / 10, h: Math.round(hL * 10) / 10,
          rot: b.rot ?? 0, label: null, value: null, ax: axL, ay: ayL,
          anchor: `${ayL === 1 ? "top" : ayL === 0 ? "bottom" : "middle"}-${axL === 0 ? "left" : axL === 1 ? "right" : "center"}`,
          stamp: file,
        });
        continue;
      }
      const id = b.kitId!;
      /* the Board stage's own recipe, WHOLE (Board.tsx svgOf): icon
         override, variant overlay (~gold), 9-slice stretch — dims and
         baked pixels must match what the maker saw */
      const cfgP = applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns?.[id]), st.kitTextFill[id]);
      const svg = renderKit(cfgP, id, st.kitSizes[id] ?? "l", "default", b.v ?? st.kitVals[id], st.kitShapes[id], {
        icon: resolveKitIcon(st.kitIcons?.[id], undefined),
        label: b.label ?? st.kitLabels[id], stretch: b.stretch, stretchY: b.stretchY, overlay: b.ov,
        themedText: !!st.kitDesigns?.[id]?.type || !!st.kitTextFill[id],
      });
      const sw = parseFloat(/width="([\d.]+)"/.exec(svg)?.[1] ?? "200");
      const sh = parseFloat(/height="([\d.]+)"/.exec(svg)?.[1] ?? "80");
      const k = b.scale ?? 1;
      const w = sw * k, h = sh * k;
      const cx = b.x + w / 2, cy = b.y + h / 2;
      const ax = cx < W / 3 ? 0 : cx > (2 * W) / 3 ? 1 : 0.5;
      // board y runs DOWN; Unity anchors run UP — top third = ay 1
      const ay = cy < H / 3 ? 1 : cy > (2 * H) / 3 ? 0 : 0.5;
      const anchor = `${ay === 1 ? "top" : ay === 0 ? "bottom" : "middle"}-${ax === 0 ? "left" : ax === 1 ? "right" : "center"}`;
      const fam = PREFAB_FAMILY[id];
      if (!fam) {
        /* no sprite family ships for this piece — it can never place as a
           prefab, and it used to just vanish from the scene ("7 skipped").
           It travels as a BAKED SPRITE of the board's exact pixels, same
           pipeline as saved assets. */
        let still = svg
          .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, "")
          .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, "");
        /* the inventory grid's tiles go LIVE in the scene (owner: "make
           the inventory panel interactive in boards — just the tiles
           clickable"): the panel bakes RINGLESS, the wells' boxes ride
           along as fractions of the raster, and a rig re-draws the
           selection over whichever tile is clicked. The well rects are
           parsed, not re-derived — the drawn pixels are the truth. */
        let cells: number[] | null = null, cellSel: number | null = null;
        if (id === "invgrid") {
          still = still.replace(/<rect data-invring="1"[^>]*\/?>/g, "");
          const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(still);
          if (vb) {
            const [vx, vy, vw, vh] = [+vb[1], +vb[2], +vb[3], +vb[4]];
            cells = [];
            const wellRe = /<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)" rx="[\d.]+" fill="[^"]*" opacity="0\.9"\/>/g;
            for (let mW; (mW = wellRe.exec(still)) && cells.length < 48; ) {
              cells.push(
                Math.round(((+mW[1] - vx) / vw) * 10000) / 10000, Math.round(((+mW[2] - vy) / vh) * 10000) / 10000,
                Math.round((+mW[3] / vw) * 10000) / 10000, Math.round((+mW[4] / vh) * 10000) / 10000);
            }
            if (cells.length < 8) cells = null;
            const vSel = Math.min(1, Math.max(0, b.v ?? st.kitVals[id] ?? 0.42));
            cellSel = Math.min(11, Math.max(0, Math.round(vSel * 11)));
          }
        }
        const fdK = fontByName(cfgP.type.font);
        const svgK = await inlineKitFace(still, cfgP.type.font, fdK.name === cfgP.type.font ? fdK.css ?? null : null);
        const { bytes: pk } = await svgToPngBytes(svgK, 2);
        const file = `boardstamps/${slug}-k${stampFiles.length + 1}.png`;
        stampFiles.push({ file, bytes: pk });
        exItems.push({
          component: id, cx: Math.round(cx * 10) / 10, cy: Math.round(cy * 10) / 10,
          w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10,
          rot: b.rot ?? 0, label: null, value: null, ax, ay, anchor, stamp: file,
          ...(cells ? { cells, cellSel } : {}),
        });
        continue;
      }
      /* prefab pieces size SHELL-TO-SHELL: the svg box carries glow and
         shadow padding while the Unity sprite is cropped, so scaling by
         the outer box inflated every prefab by its padding ratio (owner:
         "weird sizing issues" — the baked boards, which carry their
         padding inside the image, came out right). data-shell is the
         DRAWN shell box (extrusion-headroom shift included); the importer
         matches it against the manifest's shell-in-sprite, which speaks
         the same drawn frame — these two must always read the SAME stamp,
         or scene placement inherits the difference. */
      let pw = w, ph = h, pcx = cx, pcy = cy;
      const shm2 = /data-shell="([-\d. ]+)"/.exec(svg) ?? /data-shell0="([-\d. ]+)"/.exec(svg);
      const vbm2 = /viewBox="(-?[\d.]+) (-?[\d.]+)/.exec(svg);
      if (shm2 && vbm2) {
        const [bx3, by3, bw4, bh4] = shm2[1].split(" ").map(Number);
        pw = bw4 * k; ph = bh4 * k;
        pcx = b.x + ((bx3 - +vbm2[1]) + bw4 / 2) * k;
        pcy = b.y + ((by3 - +vbm2[2]) + bh4 / 2) * k;
      }
      const pax = pcx < W / 3 ? 0 : pcx > (2 * W) / 3 ? 1 : 0.5;
      const pay = pcy < H / 3 ? 1 : pcy > (2 * H) / 3 ? 0 : 0.5;
      /* ── the POSED bake: a fluid silhouette redraws its decorated ends
         at every width in the app, but a sliced sprite can only stretch
         pixels — and the field showed the difference (owner: "the back of
         the flame button looks scrunched up", with the app's render as
         the reference). When this copy's pose diverges from the family
         sprite's natural aspect, bake the engine's own render at the
         exact board proportions — label stripped, the words stay live —
         and the scene wears it 1:1 instead of stretching the nine-slice. */
      let posed: string | null = null;
      let posedBox: { w: number; h: number; dx: number; dy: number } | null = null;
      let posedStates: { hover?: string; pressed?: string; disabled?: string } | null = null;
      let posedLabelPx: { dx: number; dy: number } | null = null;
      try {
        const shellCfg = (src: GenConfig) => {
          const c2 = JSON.parse(JSON.stringify(src)) as GenConfig;
          c2.shadow.opacity = 0;
          c2.candy.contact.opacity = 0;
          for (const s2 of Object.values(c2.states)) s2.glow = 0;
          return c2;
        };
        const shellBoxOf = (s: string): [number, number, number, number] | null => {
          const m2 = /data-shell="([-\d. ]+)"/.exec(s) ?? /data-shell0="([-\d. ]+)"/.exec(s);
          if (!m2) return null;
          const v2 = m2[1].split(" ").map(Number);
          return v2.length === 4 && v2.every(Number.isFinite) ? (v2 as [number, number, number, number]) : null;
        };
        /* the family sprite bakes at its STOCK-WORD geometry now — the
           divergence test must measure against the same words, or every
           stock-proportioned copy would falsely re-pose */
        const natural = renderKit(shellCfg(cfgP), id, st.kitSizes[id] ?? "l", "default", b.v ?? st.kitVals[id], st.kitShapes[id], { label: PREF_LABEL[id] ?? "", icon: null });
        const nb = shellBoxOf(natural);
        const poseAspect = ph > 0 ? pw / ph : 1;
        const natAspect = nb && nb[3] > 0 ? nb[2] / nb[3] : poseAspect;
        if (Math.abs(poseAspect / natAspect - 1) > 0.08) {
          let ps2 = renderKit(shellCfg(cfgP), id, st.kitSizes[id] ?? "l", "default", b.v ?? st.kitVals[id], st.kitShapes[id], {
            icon: resolveKitIcon(st.kitIcons?.[id], undefined),
            label: b.label ?? st.kitLabels[id], stretch: b.stretch, stretchY: b.stretchY, overlay: b.ov,
            themedText: !!st.kitDesigns?.[id]?.type || !!st.kitTextFill[id],
          });
          /* the copy's OWN label metrics, parsed BEFORE the strip — this
             copy's words center differently than the stock bake, and the
             scene must seat the live text exactly where the app drew it.
             Offsets vs the shell0 center (the text's own frame); the crop
             block below converts to board px. */
          let posedLabelRaw: { dx: number; dy: number } | null = null;
          {
            const lg2 = ps2.slice(ps2.indexOf('data-part="label"'));
            const tm2 = /<text x="(-?[\d.]+)" y="(-?[\d.]+)" font-size="([\d.]+)"/.exec(lg2);
            const s0m2 = /data-shell0="([-\d. ]+)"/.exec(ps2);
            const s02 = s0m2?.[1].split(" ").map(Number);
            if (tm2 && s02 && s02.length === 4)
              posedLabelRaw = { dx: +tm2[1] - (s02[0] + s02[2] / 2), dy: +tm2[2] - (s02[1] + s02[3] / 2) };
          }
          // the label leaves the pixels — it rides the prefab as live text
          const dom2 = new DOMParser().parseFromString(ps2, "image/svg+xml");
          for (const n2 of Array.from(dom2.querySelectorAll('[data-part="label"]'))) n2.remove();
          ps2 = new XMLSerializer().serializeToString(dom2.documentElement)
            .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, "")
            .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, "");
          if (/<text/.test(ps2)) {
            const fdP = fontByName(cfgP.type.font);
            ps2 = await inlineKitFace(ps2, cfgP.type.font, fdP.name === cfgP.type.font ? fdP.css ?? null : null);
          }
          /* crop to the DRAWN box, not the shell box — the extrusion (and
             bloom) reach past the shell, and a shell-tight crop cut the
             extrusion's bottom off in the scene (owner: "bottom extrusion
             is cut off"). The scene rect then maps shell→board exactly:
             the sprite grows by its overhang and the item's rect grows and
             shifts by the same ratio, so the SHELL still lands precisely
             where the board drew it. */
          const pb3 = shellBoxOf(ps2);
          let cropBox: [number, number, number, number] | null = null;
          if (pb3) {
            let box: [number, number, number, number] = pb3;
            const ab = await svgAlphaBox(ps2, 2, 8).catch(() => null);
            const vbm3 = /viewBox="(-?[\d.]+) (-?[\d.]+)/.exec(ps2);
            if (ab && vbm3) {
              const pad = 2; // soft AA tails below the alpha threshold
              const ax = +vbm3[1] + ab.x0 / 2 - pad, ay = +vbm3[2] + ab.y0 / 2 - pad;
              const ax1 = +vbm3[1] + (ab.x1 + 1) / 2 + pad, ay1 = +vbm3[2] + (ab.y1 + 1) / 2 + pad;
              // union with the shell so a sparse render can never crop inside it
              const ux = Math.min(ax, pb3[0]), uy = Math.min(ay, pb3[1]);
              box = [ux, uy, Math.max(ax1, pb3[0] + pb3[2]) - ux, Math.max(ay1, pb3[1] + pb3[3]) - uy];
            }
            cropBox = box;
            ps2 = ps2
              .replace(/viewBox="[^"]+"/, `viewBox="${box[0].toFixed(1)} ${box[1].toFixed(1)} ${box[2].toFixed(1)} ${box[3].toFixed(1)}"`)
              .replace(/width="[\d.]+"/, `width="${box[2].toFixed(1)}"`)
              .replace(/height="[\d.]+"/, `height="${box[3].toFixed(1)}"`);
            const kx2 = pw / pb3[2], ky2 = ph / pb3[3];
            posedBox = {
              w: box[2] * kx2, h: box[3] * ky2,
              dx: ((box[0] + box[2] / 2) - (pb3[0] + pb3[2] / 2)) * kx2,
              dy: ((box[1] + box[3] / 2) - (pb3[1] + pb3[3] / 2)) * ky2,
            };
            // shell-center offsets are frame-invariant → straight to board px
            if (posedLabelRaw) posedLabelPx = { dx: posedLabelRaw.dx * kx2, dy: posedLabelRaw.dy * ky2 };
          }
          const { bytes: pbp } = await svgToPngBytes(ps2, 2);
          const poseN = stampFiles.length + 1;
          const fileP = `boardstamps/${slug}-pose${poseN}.png`;
          stampFiles.push({ file: fileP, bytes: pbp });
          posed = fileP;
          /* the copy's DESIGNED states, posed too — retiring Sprite Swap
             left press moving only the label's own shift while the body
             sat still (owner: "only the text play animates down, the
             button stays static"). Same crop box as the default bake, so
             the swap never jumps a pixel. */
          if (cropBox) {
            posedStates = {};
            for (const stN of ["hover", "pressed", "disabled"] as const) {
              let ssv = renderKit(shellCfg(cfgP), id, st.kitSizes[id] ?? "l", stN, b.v ?? st.kitVals[id], st.kitShapes[id], {
                icon: resolveKitIcon(st.kitIcons?.[id], undefined),
                label: b.label ?? st.kitLabels[id], stretch: b.stretch, stretchY: b.stretchY, overlay: b.ov,
                themedText: !!st.kitDesigns?.[id]?.type || !!st.kitTextFill[id],
              });
              const domS = new DOMParser().parseFromString(ssv, "image/svg+xml");
              for (const nS of Array.from(domS.querySelectorAll('[data-part="label"]'))) nS.remove();
              ssv = new XMLSerializer().serializeToString(domS.documentElement)
                .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, "")
                .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, "");
              if (/<text/.test(ssv)) {
                const fdS = fontByName(cfgP.type.font);
                ssv = await inlineKitFace(ssv, cfgP.type.font, fdS.name === cfgP.type.font ? fdS.css ?? null : null);
              }
              ssv = ssv
                .replace(/viewBox="[^"]+"/, `viewBox="${cropBox[0].toFixed(1)} ${cropBox[1].toFixed(1)} ${cropBox[2].toFixed(1)} ${cropBox[3].toFixed(1)}"`)
                .replace(/width="[\d.]+"/, `width="${cropBox[2].toFixed(1)}"`)
                .replace(/height="[\d.]+"/, `height="${cropBox[3].toFixed(1)}"`);
              const { bytes: pbS } = await svgToPngBytes(ssv, 2);
              const fS = `boardstamps/${slug}-pose${poseN}-${stN}.png`;
              stampFiles.push({ file: fS, bytes: pbS });
              posedStates[stN] = fS;
            }
          }
        }
      } catch { /* the sliced prefab remains the honest fallback */ }
      exItems.push({
        component: fam, cx: Math.round(pcx * 10) / 10, cy: Math.round(pcy * 10) / 10,
        w: Math.round(pw * 10) / 10, h: Math.round(ph * 10) / 10,
        /* the words the maker actually SAW: per-copy label first, the
           kit-wide custom words second. Emitting only the per-copy label
           left kit-wide words behind — the baked board PNG said BACK, the
           live scene label reverted to the prefab's default TAB (owner:
           "the custom stuff from the boards isn't coming through") */
        rot: b.rot ?? 0, label: b.label ?? st.kitLabels[id] ?? null,
        // the EFFECTIVE pose — the importer drives live content from it
        // (count badge number, end-turn ring, slider value, switch on/off);
        // instance value wins, and the settings rigs always send their
        // render default so the scene strikes the pose the board showed
        value: b.v ?? st.kitVals[id] ?? (id === "slider" ? 0.62 : id === "toggle" ? 1 : null), ax: pax, ay: pay,
        anchor: `${pay === 1 ? "top" : pay === 0 ? "bottom" : "middle"}-${pax === 0 ? "left" : pax === 1 ? "right" : "center"}`, stamp: null,
        ...(posed ? { posed } : {}),
        /* the posed ART's own footprint: crop box mapped to board px, and
           its center's offset from the shell center (board y runs down).
           The item's rect above stays the SHELL — labels, state fx and
           anchors all speak shell coordinates; the art child wears these. */
        ...(posed && posedBox ? {
          posedW: Math.round(posedBox.w * 10) / 10, posedH: Math.round(posedBox.h * 10) / 10,
          posedDx: Math.round(posedBox.dx * 10) / 10, posedDy: Math.round(posedBox.dy * 10) / 10,
        } : {}),
        /* the copy's live label seats at ITS OWN center — board px offsets
           from the shell center, straight from this copy's render */
        ...(posed && posedLabelPx ? {
          posedLabelDx: Math.round(posedLabelPx.dx * 10) / 10,
          posedLabelDy: Math.round(posedLabelPx.dy * 10) / 10,
        } : {}),
        /* posed STATE skins — Sprite Swap slots for the art child */
        ...(posed && posedStates ? {
          ...(posedStates.hover ? { posedHover: posedStates.hover } : {}),
          ...(posedStates.pressed ? { posedPressed: posedStates.pressed } : {}),
          ...(posedStates.disabled ? { posedDisabled: posedStates.disabled } : {}),
        } : {}),
        ov: b.ov ?? null,
        // flip provenance — the silhouette THIS copy rendered with
        ...(isFlipShape(st.kitShapes[id] ?? KIT_SHAPE[id] ?? st.cfg.shape) ? { flip: true } : {}),
      });
    }
    out.push({ name: bd.name, w: W, h: H, bg, items: exItems, stampFiles });
  }
  return out;
}

const sha256Hex = async (data: Uint8Array): Promise<string> => {
  // copy into a plain ArrayBuffer — subtle.digest's type rejects views that
  // could be backed by a SharedArrayBuffer
  const d = await crypto.subtle.digest("SHA-256", data.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/* ── the kit's faces ship WITH the kit (spec-blessed: OFL/Apache/UFL faces
   travel with their license file, or not at all) — so generated prefab
   labels speak the right font with zero user steps. TTFs come from the
   google/fonts repo at export time; ANY failure degrades to the manifest's
   Google Fonts link and never blocks the export. */
export async function fetchKitFont(family: string): Promise<{ file: string; bytes: Uint8Array; licenceName: string; licenceText: string } | null> {
  const slug = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!slug) return null;
  for (const dir of ["ofl", "apache", "ufl"]) {
    try {
      const res = await fetch(`https://api.github.com/repos/google/fonts/contents/${dir}/${slug}`);
      if (!res.ok) continue;
      const listing = (await res.json()) as { name: string; type: string; download_url: string | null }[];
      if (!Array.isArray(listing)) continue;
      const ttfs = listing.filter((f) => f.type === "file" && /\.ttf$/i.test(f.name) && f.download_url);
      // prefer the static Regular; variable faces ([wght]) are the usual fallback
      const pick = ttfs.find((f) => /-Regular\.ttf$/i.test(f.name)) ?? ttfs.find((f) => f.name.includes("[")) ?? ttfs[0];
      const lic = listing.find((f) => f.type === "file" && /^(OFL\.txt|LICEN[CS]E\.txt|UFL\.txt)$/i.test(f.name) && f.download_url);
      if (!pick?.download_url || !lic?.download_url) continue; // no license file, no binary
      const [fontRes, licRes] = await Promise.all([fetch(pick.download_url), fetch(lic.download_url)]);
      if (!fontRes.ok || !licRes.ok) continue;
      return {
        file: pick.name,
        bytes: new Uint8Array(await fontRes.arrayBuffer()),
        licenceName: lic.name,
        licenceText: await licRes.text(),
      };
    } catch { /* try the next collection */ }
  }
  return null;
}

/* minimal local geometry helpers (mirror the renderer's recipes) */
const rr = (x: number, y: number, w: number, h: number, r: number) => {
  const rc = Math.min(r, h / 2, w / 2);
  return `M ${x + rc} ${y} H ${x + w - rc} Q ${x + w} ${y} ${x + w} ${y + rc} V ${y + h - rc} Q ${x + w} ${y + h} ${x + w - rc} ${y + h} H ${x + rc} Q ${x} ${y + h} ${x} ${y + h - rc} V ${y + rc} Q ${x} ${y} ${x + rc} ${y} Z`;
};
const svgWrap = (w: number, h: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;

/** `licence` is issued by /api/export and rides inside the ZIP — it names
    the account the kit belongs to, so a redistributed bundle is traceable
    back to its source. Reached through guardedExport, never directly. */
/* The Glints ink's blend — the 1-1 SYSTEM for the app's six modes (owner:
   "we need some kind of 1-1 system for the blending modes we are offering
   in the app", then: "let's think through what overlay does and write
   something completely custom"). The custom derivation: glint ink is
   WHITE, and every blend formula collapses when s=1. True overlay with
   white at coverage a over backdrop b:
     b ≤ ½ : b·(1+a)     — multiplicative gain, hue-preserving
     b > ½ : b + a·(1−b) — screen
   The dark branch is EXACTLY what Blend DstColor One computes with a
   premultiplied source (a·b + b), so overlay ships as the CANDY GAIN —
   true overlay wherever the letters are mid-tone or darker, clamping to
   white above (which is where overlay is headed anyway). No more flat
   white addition washing the fill's hue.
     normal     SrcAlpha/OneMinusSrcAlpha  pack 0 (plain)        EXACT
     multiply   DstColor/Zero              pack 2 (lerp→white)   EXACT (white ink: no-op, as in the app)
     screen     One/OneMinusSrcColor       pack 1 (premultiply)  EXACT
     overlay    DstColor/One               pack 4 (premult·0.9)  EXACT shape for b ≤ ½, clamps above;
                                                the ·0.9 is the owner's dial — set by eye on the real kit
     hard-light One/OneMinusSrcColor       pack 1 (premultiply)  EXACT (hard-light with white IS screen)
     soft-light One/OneMinusSrcColor       pack 3 (premult·0.4)  fit of b + a(√b − b), mid-tone error < 0.03
   Single-pass fixed-function cannot branch on the backdrop per channel —
   that is the only gap left, and it only shows on already-bright fills.
   A tint darker than 50% gray cannot darken (the gain floor); glints ship
   white so this stays theoretical. Kit-independent, so it ships as a
   shared script beside the importer. */
const GLINT_INK_SHADER = `Shader "UIKitMaker/GlintInk" {
  Properties {
    _MainTex ("Glints Atlas", 2D) = "white" {}
    _Color ("Tint", Color) = (1,1,1,1)
    _Pack ("Source packing", Float) = 1
    _SrcBlend ("Src blend", Float) = 2  // DstColor — overlay's candy gain
    _DstBlend ("Dst blend", Float) = 1  // One
    // ── the LIVE FIELD (owner: "the glint should be one graphic, not a
    // bunch of little letters"). 0 = draw the atlas as-is (old zips).
    // 1 slab / 2 streak / 3 sheen / 4 stars: the atlas carries only the
    // letterform mask; band AND stars are computed HERE, in the label's
    // own space, so one sweep + one constellation cross the whole word
    // at the kit's light angle — any text, any length, still typeable.
    // _StarsOnly marks HeroLabel's full-word quad: stars may spill past
    // the letterforms exactly like the app draws them.
    _Style ("Field style", Float) = 0
    _StarsOnly ("1 = this renderer draws only the stars", Float) = 0
    _Op ("Glint opacity 0..1", Float) = 0.55
    _Lx ("Kit light dir X (app space, y down)", Float) = 0.5
    _Ly ("Kit light dir Y (app space, y down)", Float) = -0.86
    _OxEm ("User glint nudge X in em", Float) = 0
    _OyEm ("User glint nudge Y in em", Float) = 0
    _Em ("Label em height (HeroLabel writes this)", Float) = 52
    _Cx ("Word center X, label space (HeroLabel)", Float) = 0
    _Cy ("Word center Y, label space (HeroLabel)", Float) = 0
    _TextW ("Word width, label space (HeroLabel)", Float) = 200
  }
  SubShader {
    Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "PreviewType"="Plane" "CanUseSpriteAtlas"="True" }
    Cull Off Lighting Off ZWrite Off ZTest [unity_GUIZTestMode]
    Blend [_SrcBlend] [_DstBlend]
    Pass {
      CGPROGRAM
      #pragma vertex vert
      #pragma fragment frag
      #pragma target 2.5
      #include "UnityCG.cginc"
      struct appdata_t { float4 vertex : POSITION; float4 color : COLOR; float2 texcoord : TEXCOORD0; };
      struct v2f { float4 vertex : SV_POSITION; fixed4 color : COLOR; float2 texcoord : TEXCOORD0; float2 lpos : TEXCOORD1; };
      sampler2D _MainTex; fixed4 _Color; float _Pack;
      float _Style, _StarsOnly, _Op, _Lx, _Ly, _OxEm, _OyEm, _Em, _Cx, _Cy, _TextW;
      /* the app's own star tables (bevel.ts): x fraction across the word,
         y offset / size in em, tilt in degrees. slab rides rows 0-2,
         stars rides rows 3-8; streak and sheen stay pure bands. */
      static const float4 STAR_TAB[9] = {
        float4(0.16, -0.24, 0.16, 0.0), float4(0.52, 0.16, 0.09, 18.0), float4(0.85, -0.1, 0.125, -14.0),
        float4(0.06, -0.3, 0.15, 0.0), float4(0.28, 0.2, 0.09, 22.0), float4(0.48, -0.18, 0.135, -10.0),
        float4(0.66, 0.26, 0.08, 14.0), float4(0.86, -0.08, 0.145, -18.0), float4(0.97, 0.28, 0.07, 30.0)
      };
      v2f vert (appdata_t v) {
        v2f o;
        o.vertex = UnityObjectToClipPos(v.vertex);
        o.texcoord = v.texcoord;
        o.color = v.color * _Color;
        o.lpos = v.vertex.xy; // the echo repaints the text's own mesh, so this IS label space
        return o;
      }
      // anti-aliased rounded-rect coverage in a frame rotated to 'dir' around 'c'
      float RectCov (float2 p, float2 c, float2 dir, float halfL, float halfH, float r) {
        float2 d = p - c;
        float2 q = float2(abs(dot(d, dir)), abs(dot(d, float2(-dir.y, dir.x)))) - float2(halfL - r, halfH - r);
        float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        float aa = max(fwidth(dist), 0.75);
        return saturate(0.5 - dist / aa);
      }
      /* the app's own band recipes, verbatim geometry (bevel.ts glints):
         slab   = wide pill + short chasing bar, tilted perpendicular to the light
         streak = three thin sharp bands
         sheen  = two horizontal cap-line pills, rotation-free by design
         All in APP space: origin at the word's center, y DOWN, fs = one em. */
      float Field (float2 p) {
        float fs = _Em;
        float2 L = float2(_Lx, _Ly);
        float2 bc = float2(L.x * fs * 0.08 + _OxEm * fs, L.y * fs * 0.24 + _OyEm * fs);
        float bandW = _TextW * 1.18, bandH = fs * 0.28;
        if (_Style > 3.5) return 0.0; // stars: constellation only
        if (_Style > 2.5) {           // sheen — anchored to the text box, not the light
          float2 g = float2(_OxEm * fs, _OyEm * fs);
          float2 dirH = float2(1, 0);
          float a1 = RectCov(p, float2(0, -0.34 * fs) + g, dirH, _TextW * 0.5 + fs * 0.2, fs * 0.1, fs * 0.1);
          float a2 = RectCov(p, float2(-0.165 * _TextW, -0.12 * fs) + g, dirH, _TextW * 0.275, fs * 0.04, fs * 0.04) * 0.55;
          return max(a1, a2);
        }
        float rot = atan2(L.y, L.x) + 1.5707964; // the slab tilts perpendicular to the light
        float2 dir = float2(cos(rot), sin(rot));
        if (_Style > 1.5) {           // streak — each thin band around its own center
          float s1 = RectCov(p, float2(bc.x, bc.y - 0.22 * fs), dir, bandW * 0.5, 0.045 * fs, 0.0);
          float s2 = RectCov(p, float2(bc.x, bc.y + 0.02 * fs), dir, bandW * 0.5, 0.0225 * fs, 0.0) * 0.75;
          float s3 = RectCov(p, float2(bc.x, bc.y + 0.21 * fs), dir, bandW * 0.5, 0.035 * fs, 0.0) * 0.5;
          return max(s1, max(s2, s3));
        }
        // slab (the original): main pill, then the chaser rotated along with it
        float m = RectCov(p, bc, dir, bandW * 0.5, bandH * 0.5, bandH * 0.5);
        float2 perp = float2(-dir.y, dir.x);
        float m2 = RectCov(p, bc + perp * (bandH * 0.96), dir, bandW * 0.19, bandH * 0.21, bandH * 0.21) * 0.7;
        return max(m, m2);
      }
      // 4-point sparkle coverage, the app's star4 path as an SDF: fold into
      // one octant, then one straight edge from tip (s,0) to waist (.22s,.22s)
      float Star4 (float2 p, float2 c, float s, float rotDeg) {
        float r = rotDeg * 0.017453293;
        float2 d = p - c;
        float cr = cos(r), sr = sin(r);
        d = float2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y);
        d = abs(d);
        if (d.y > d.x) d = d.yx;
        float2 A = float2(s, 0.0), B = float2(0.22 * s, 0.22 * s);
        float2 e = B - A;
        float t = saturate(dot(d - A, e) / dot(e, e));
        float2 q = A + e * t;
        float side = e.x * (d.y - A.y) - e.y * (d.x - A.x);
        float dist = length(d - q) * (side > 0.0 ? -1.0 : 1.0); // origin side = inside
        float aa = max(fwidth(dist), 0.75);
        return saturate(0.5 - dist / aa);
      }
      float Stars (float2 p) {
        int i0 = 0, n = 0;
        if (_Style < 1.5) { i0 = 0; n = 3; }        // slab
        else if (_Style > 3.5) { i0 = 3; n = 6; }   // stars
        if (n == 0) return 0.0;
        float fs = _Em;
        float2 g = float2(_Lx * fs * 0.06 + _OxEm * fs, _Ly * fs * 0.06 + _OyEm * fs);
        float a = 0.0;
        for (int k = 0; k < 6; k++) {
          if (k >= n) break;
          float4 st = STAR_TAB[i0 + k];
          a = max(a, Star4(p, float2((st.x - 0.5) * _TextW, st.y * fs) + g, fs * st.z, st.w));
        }
        return a;
      }
      fixed4 frag (v2f i) : SV_Target {
        fixed4 c;
        if (_Style > 0.5) {
          // app space: word center origin, y flipped DOWN — the app's frame
          float2 p = float2(i.lpos.x - _Cx, -(i.lpos.y - _Cy));
          float a;
          if (_StarsOnly > 0.5) {
            // HeroLabel's full-word quad: stars spill past letterforms, like the app
            a = Stars(p) * saturate(_Op * 1.15);
          } else {
            // the glyph mesh: atlas alpha IS the letterform mask for the band
            a = Field(p) * tex2D(_MainTex, i.texcoord).a * saturate(_Op);
          }
          c = fixed4(i.color.rgb, i.color.a * a);
        } else {
          c = tex2D(_MainTex, i.texcoord) * i.color; // old zips: bands live in the atlas
        }
        if (_Pack > 3.5) c.rgb *= c.a * 0.9;            // 4: candy gain at 90% (owner's dial)
        else if (_Pack > 2.5) c.rgb *= c.a * 0.4;       // 3: gentle light — 0.4·(1−b) fits soft-light's a·(√b−b)
        else if (_Pack > 1.5) c.rgb = lerp(fixed3(1,1,1), c.rgb, c.a); // 2: multiply — empty air multiplies by 1
        else if (_Pack > 0.5) c.rgb *= c.a;             // 1: premultiply — empty air adds nothing
        return c;
      }
      ENDCG
    }
  }
}
`;

export async function downloadEngineExport(st: EngineExportState, catalog?: () => Promise<Uint8Array | null>, licence?: string, onProgress?: (done: number, total: number, label: string) => void): Promise<void> {
  const files: { path: string; data: string | Uint8Array }[] = [];
  const manifest: AssetMeta[] = [];
  setEmbedFont("", null); // never inherit a stale embed from a crashed export

  const pieceCfg = (id: KitComponentId) => applyKitTextFill(applyKitDesign(st.cfg, st.kitDesigns[id]), st.kitTextFill[id]);
  const base = pieceCfg("primary");
  const bevelC = base.effects.Bevel ?? "#0E9CC9";
  const glowC = base.effects.Glow ?? lighten(bevelC, 0.55);
  const innerC = base.effects["Inner Fill"] ?? lighten(bevelC, 0.15);
  const wellC = darken(innerC, 0.72);

  /* content-free shell render: no label, no icon, no baked values; the
     cast shadow and contact pool are stripped (the engine owns shadows) */
  const shell = (id: KitComponentId, opts: Record<string, unknown> = {}, mutate?: (c: GenConfig) => void, value?: number) => {
    const c = clone(pieceCfg(id));
    c.stateDesigns = {};
    c.shadow.opacity = 0;
    c.candy.contact.opacity = 0;
    for (const s of Object.values(c.states)) s.glow = 0;
    mutate?.(c);
    return renderKit(c, id, effKitSize(st.kitSizes[id]), "default", value, st.kitShapes[id], { label: "", icon: null, ...opts });
  };
  const flat = (c: GenConfig) => {
    c.candy.gloss.on = false;
    c.candy.specular.on = false;
    c.candy.pattern.type = "none";
  };
  /* nine-slice renders drop the bloom halo too: it reaches past the shell,
     and a sliced sprite must hug its geometry — glows are engine-composed
     (fx/glow.png, states recipe), same contract as shadows. The micro
     TEXTURE grain goes with it (owner: "how do we handle the issue of
     noise in 9-slice scaling"): stretched grain reads as compression
     artifacts, worse than none. Fixed-size sprites — badges, orbs,
     tokens — never stretch and keep their grain. */
  const slim = (c: GenConfig) => {
    c.candy.bloom.opacity = 0;
    c.candy.texture.amount = 0;
    /* the SPECULAR STREAK leaves the sliced bake too (owner: "Specular
       shine is being translated to unity very bluntly") — stretching the
       center strip smeared its feathered window flat. It ships as its own
       overlay sprite (<fam>/specular.png) that prefabs anchor
       shell-to-shell, so it scales WITH the piece like the app's
       proportional streak. Blend-mode speculars stay baked: Unity UI
       composits plain alpha, and honest color beats a misplaced streak. */
    if (!c.candy.specular.blend || c.candy.specular.blend === "normal") c.candy.specular.on = false;
  };
  /* Designed state renders — unlike shell(), state forks are KEPT: the
     hover/pressed/disabled looks are the kit's own recipes, baked so the
     engine can Sprite-Swap them. Outer effects still engine-composed —
     AND that must hold inside the fork too: a designed state carries its
     own shadow/contact/bloom, and zeroing only the master let them bake
     back in. The hover sprite shipped 32px wider and 74px taller than
     base, so the swap shrank the art inside the same rect and added a
     smudged halo (owner: "the rollovers are weird and incorrect"). Calm
     the fork exactly like the master so all four states share base's
     geometry. */
  const stateShell = (id: KitComponentId, state: "hover" | "pressed" | "disabled", opts: Record<string, unknown> = {}, value?: number, slimSpec = false, mutate?: (c: GenConfig) => void) => {
    const c = clone(pieceCfg(id));
    mutate?.(c); // labeled-geometry bakes ghost the content group (opacity 0)
    /* forks are PARTIAL (designFor: every field falls back to the master
       independently) — calm only what a fork actually carries, or a
       face-only fork crashes the whole export */
    const calm = (g: { shadow?: GenConfig["shadow"]; candy?: GenConfig["candy"] }) => {
      if (g.shadow) g.shadow.opacity = 0;
      if (g.candy) {
        g.candy.contact.opacity = 0;
        g.candy.bloom.opacity = 0;
        g.candy.texture.amount = 0; // sliced state sprites: no stretching grain
        /* SLICED swap states drop the baked streak exactly like their base
           (slim) — a hover that suddenly grows a smeared streak while the
           base wears the clean overlay would pop. Full-canvas states
           (icon button, checkbox, radio, props) keep it baked. */
        if (slimSpec && (!g.candy.specular.blend || g.candy.specular.blend === "normal")) g.candy.specular.on = false;
      }
    };
    calm(c);
    for (const s of Object.values(c.states)) s.glow = 0;
    for (const f of Object.values(c.stateDesigns)) if (f) calm(f);
    return renderKit(c, id, effKitSize(st.kitSizes[id]), state, value, st.kitShapes[id], { label: "", icon: null, ...opts });
  };

  /* nine-slice margins in PNG pixels: the silhouette's own cap zone plus the
     crop margin — nothing else. Sliced sprites are exported TIGHT (see
     svgToPngBytesTight); the old padded-canvas borders (pad + inset + cap)
     summed past the component's own footprint on effect-heavy kits, and
     Unity draws a sliced image whose borders outgrow the rect as four caps
     of transparent padding with a zero-size center — an invisible button
     (owner report, Unity 6.5). */
  const sliceOf = (id: KitComponentId, shellH: number) => {
    const shape = st.kitShapes[id] ?? KIT_SHAPE[id] ?? st.cfg.shape;
    const bare = shape.endsWith("~flip") ? shape.slice(0, -5) : shape;
    // user imports carry their caps in their drawn proportions — a wide
    // drawing has wide caps, and guessing from height alone put the slice
    // borders inside the decoration
    const met = silhouetteMeta(shape) ?? userShapeCaps(shape);
    /* the LEFT/RIGHT borders must clear the shape's actual corner radius —
       the default pill is a full capsule (corner radius = h/2), and the old
       0.3h guess planted the guides mid-curve (dev field report: "original
       slicing hits on part of the corner curves"). Corner cells own the
       whole curve once capX ≥ r; the top/bottom edges between the caps are
       flat, so capY keeps its tuning. Narrow sprites stay safe via the
       center-strip clamp downstream. */
    const cornerR = bare === "pill" ? shellH * 0.5
      : bare === "round" ? 4 + (pieceCfg(id).bevel.softness ?? 0) * 0.52
      : 0;
    const capX = Math.max(met ? met.capScale * shellH : shellH * 0.3, shellH * 0.22, cornerR);
    const capY = Math.min(shellH * 0.42, Math.max(shellH * 0.28, capX * 0.8, Math.min(cornerR, shellH * 0.38)));
    return {
      left: Math.round((capX + 10) * PNG_SCALE),
      right: Math.round((capX + 10) * PNG_SCALE),
      top: Math.round((capY + 10) * PNG_SCALE),
      bottom: Math.round((capY + 10) * PNG_SCALE),
    };
  };

  /* Two-phase build so progress is REAL: sections enqueue their renders
     (cheap synchronous SVG strings), then one raster loop turns them into
     PNGs with an exact done/total — rasterization is where the time goes,
     and a long silent "Working…" reads as a hang (owner report). */
  const pngQueue: { path: string; svg: string; crop: boolean; group?: string; meta: Omit<AssetMeta, "file" | "nativeW" | "nativeH" | "sha256"> }[] = [];
  /* FINDABLE NAMES (dev field report: '"base" and "base-" + X being the
     naming convention for everything makes some assets hard to find' —
     Unity search showed sixteen identical "base" rows). Every filename now
     carries its family: button-primary/button-primary-base.9.png. icons/
     already have distinct names and stay put. The importer deletes the
     legacy short-named twins on refresh (owner: no migration needed). */
  const NAME_EXEMPT = new Set(["icons"]);
  const famPath = (path: string): string => {
    const i = path.indexOf("/");
    if (i < 0) return path;
    const dir = path.slice(0, i), file = path.slice(i + 1);
    if (NAME_EXEMPT.has(dir) || file.startsWith(dir + "-")) return path;
    return `${dir}/${dir}-${file}`;
  };
  const addPng = (path: string, svg: string, meta: Omit<AssetMeta, "file" | "nativeW" | "nativeH" | "sha256">, crop = false, group?: string): Promise<void> => {
    // own copy of the slice — call sites share one object across variants,
    // and the post-crop clamp adjusts it per asset
    pngQueue.push({ path: famPath(path), svg, crop, group, meta: { ...meta, nineSlice: meta.nineSlice ? { ...meta.nineSlice } : null } });
    return Promise.resolve();
  };
  /* families whose prefabs swap states, so they are the ones that get an
     aura sprite — kept beside the manifest's stateFx list, which drives the
     runtime that fades it */
  const GLOW_FAMS = new Set(["button-primary", "button-secondary", "button-small", "chip", "tab", "tab-back",
    "list-row", "item-slot", "iconbtn", "checkbox", "radio",
    /* the props glow in their own silhouette too — without an aura sprite
       they fell to the generic radial blob (owner: "the glows are all
       very generic in shape and don't follow the silhouette") */
    "gearicon", "trophyicon", "gifticon", "firebutton", "endturn", "keycap", "pricebtn", "countbadge"]);
  /* GROUND-TRUTH SLICING (Jimi's notes, round two: even geometry-derived
     borders kinked a stretched corner — his kit's face is not the
     design-space shape, and extrusion regrows the crop box, so ANY formula
     lies for some kit). The borders are now MEASURED from the rendered
     alpha: walk each edge's silhouette profile to where it flattens
     against its extreme — that is where curvature ends — and pad. Shape-,
     extrusion- and kit-agnostic. A group (base + states + face layers)
     measures ONCE from its first member, so Sprite Swap never pops.
     Organic shapes that never flatten fall to the caps below, as before. */
  /* the maker's own guides outrank the measurement — same respect the
     importer pays to hand-tuned borders on the Unity side */
  const userSliceByFam = new Map<string, { cid: KitComponentId; left: number; right: number; top: number; bottom: number }>();
  for (const [cid, fam] of Object.entries(KIT_SLICEABLE)) {
    const o = st.kitSlices?.[cid as KitComponentId];
    if (o && fam) userSliceByFam.set(fam, {
      cid: cid as KitComponentId,
      left: Math.round(o.left * PNG_SCALE), right: Math.round(o.right * PNG_SCALE),
      top: Math.round(o.top * PNG_SCALE), bottom: Math.round(o.bottom * PNG_SCALE),
    });
  }
  /* Hand-set borders are authored in the slicing workbench, which crops the
     piece to its CALMED alpha box — default state, threshold 40, no margin
     (sliceProbe.measureAutoSlice). The export crops to the swap group's
     UNION box at threshold 8 plus margin: a bigger frame whenever a state
     fork grows the ink. The numbers were right and the frame was wrong —
     guides shipped offset by the whole delta (owner: "these slices aren't
     anywhere near being close"). Both renders share one SVG frame, so the
     cure is a translation: find the workbench box in that frame and shift
     each border by the gap on its own side of the shipped crop. shell(cid)
     with no extras IS the workbench render — same pieceCfg, same calming,
     bloom and texture kept. */
  const wbBoxCache = new Map<KitComponentId, CropBox | null>();
  const workbenchBox = async (cid: KitComponentId): Promise<CropBox | null> => {
    let b = wbBoxCache.get(cid);
    if (b === undefined) {
      try { b = await svgAlphaBox(shell(cid), PNG_SCALE, 40); } catch { b = null; }
      wbBoxCache.set(cid, b);
    }
    return b;
  };
  const sliceMeasureCache = new Map<string, { left: number; right: number; top: number; bottom: number } | null>();
  /* the walk itself lives in exportUtils (measureSliceRGBA) — shared with
     the gamekit sheet so BOTH export paths measure instead of guess */
  const measureSlice = async (bytes: Uint8Array, w: number, h: number) => {
    try {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const cx = cv.getContext("2d")!;
      cx.drawImage(bmp, 0, 0);
      return measureSliceRGBA(cx.getImageData(0, 0, w, h).data, w, h, PNG_SCALE);
    } catch { return null; }
  };
  const rasterQueue = async () => {
    const total = pngQueue.length + (catalog ? 1 : 0);
    /* entries sharing a group (a family's rest + swap states) rasterize
       together on ONE union crop box, so every state sprite shares base's
       coordinate space — a pressed sink stays a sink instead of being
       stretched back over the rect, and nothing jumps on swap. Groups
       resolve lazily when their first member is reached, keeping the
       progress bar honest. */
    const byGroup = new Map<string, number[]>();
    pngQueue.forEach((q, i) => { if (q.group) byGroup.set(q.group, [...(byGroup.get(q.group) ?? []), i]); });
    const grouped = new Map<number, { bytes: Uint8Array; w: number; h: number; box?: CropBox }>();
    for (let qi = 0; qi < pngQueue.length; qi++) {
      const q = pngQueue[qi];
      onProgress?.(qi, total, q.path);
      if (q.group && !grouped.has(qi)) {
        const idxs = byGroup.get(q.group)!;
        const outs = await svgsToPngBytesTightUnion(idxs.map((i) => pngQueue[i].svg), PNG_SCALE);
        idxs.forEach((i, j) => grouped.set(i, outs[j]));
      }
      const raster: { bytes: Uint8Array; w: number; h: number; box?: CropBox } =
        grouped.get(qi) ?? (q.crop ? await svgToPngBytesTight(q.svg, PNG_SCALE) : await svgToPngBytes(q.svg, PNG_SCALE));
      const { bytes, w, h } = raster;
      /* shell-in-sprite, for shell-true scene sizing: the svg states its
         shell box in viewBox units; the crop box places it inside the
         shipped file's pixels. Use data-shell (the DRAWN box): the canvas
         reserves the extrusion slider's full travel and translates all ink
         down by the unused headroom, and data-shell0 predates that shift —
         reading it seated every knob and fill exactly riseDy too high
         (owner, twice, with screenshots). The crop measures drawn pixels,
         so the row must speak the drawn frame. */
      let shellBox: AssetMeta["shell"] = null;
      {
        const shm = /data-shell="([-\d. ]+)"/.exec(q.svg) ?? /data-shell0="([-\d. ]+)"/.exec(q.svg);
        const vbm = /viewBox="(-?[\d.]+) (-?[\d.]+)/.exec(q.svg);
        if (shm && vbm) {
          const [bx2, by2, bw3, bh3] = shm[1].split(" ").map(Number);
          shellBox = {
            x: Math.round((bx2 - +vbm[1]) * PNG_SCALE - (raster.box?.x0 ?? 0)),
            y: Math.round((by2 - +vbm[2]) * PNG_SCALE - (raster.box?.y0 ?? 0)),
            w: Math.round(bw3 * PNG_SCALE), h: Math.round(bh3 * PNG_SCALE),
          };
        }
      }
      // Last line of defence: whatever the cap math says, borders must leave
      // a real center strip or engines render nothing. Scale down to fit.
      const s = q.meta.nineSlice;
      if (s) {
        // the real pixels overrule the estimate — measured curvature is
        // where the guides go; the sliceOf math survives only as fallback
        const uo = userSliceByFam.get(q.meta.component);
        if (uo) {
          /* EXACT numbers, exactly (owner: "I don't think Unity is reading
             my slices" — the organic-shape caps below were silently
             crushing hand-set values; a 466px-wide sprite capped left/right
             at 116 while the maker asked for 172). The caps exist to rein
             in the MEASUREMENT on shapes that never flatten — a human's
             explicit numbers are the point, not a hazard. Only the
             engine-sanity guard below still applies. */
          s.left = uo.left; s.right = uo.right; s.top = uo.top; s.bottom = uo.bottom;
          /* …exact, but in the WORKBENCH's frame. Shift each side by where
             that frame sits inside this sprite's crop (see workbenchBox).
             No box or no calmed render → ship the raw numbers, the old
             behavior. */
          const wb = raster.box ? await workbenchBox(uo.cid) : null;
          if (wb && raster.box) {
            s.left = Math.max(1, uo.left + (wb.x0 - raster.box.x0));
            s.right = Math.max(1, uo.right + (raster.box.x1 - wb.x1));
            s.top = Math.max(1, uo.top + (wb.y0 - raster.box.y0));
            s.bottom = Math.max(1, uo.bottom + (raster.box.y1 - wb.y1));
          }
          const dbg = (globalThis as unknown as { __ukmSliceDebug?: unknown[] }).__ukmSliceDebug;
          if (dbg) dbg.push({ path: q.path, component: q.meta.component, uo: { ...uo }, wb, crop: raster.box ?? null, shipped: { ...s } });
        }
        else {
          const mkey = q.group ?? q.path;
          let mz = sliceMeasureCache.get(mkey);
          if (mz === undefined) { mz = await measureSlice(bytes, w, h); sliceMeasureCache.set(mkey, mz); }
          if (mz) { s.left = mz.left; s.right = mz.right; s.top = mz.top; s.bottom = mz.bottom; }
          /* organic silhouettes can push the cap math past reason — the wavy
             button's slice guides nearly met in the middle, caps ate ~92% of
             the sprite and the type area with it (owner: "this is clearly
             off", then at 35%: "still off... lots more room for text in the
             middle between the concave/convex"). A cap never takes more
             than 25% of the width / 30% of the height per side — the
             stretchable middle is at least HALF the width and 40% of the
             height of every sprite. */
          const maxLR = Math.floor(w * 0.25), maxTB = Math.floor(h * 0.3);
          if (s.left > maxLR) s.left = maxLR;
          if (s.right > maxLR) s.right = maxLR;
          if (s.top > maxTB) s.top = maxTB;
          if (s.bottom > maxTB) s.bottom = maxTB;
        }
        const fx = (w - 12) / (s.left + s.right), fy = (h - 12) / (s.top + s.bottom);
        if (fx < 1) { s.left = Math.max(1, Math.floor(s.left * fx)); s.right = Math.max(1, Math.floor(s.right * fx)); }
        if (fy < 1) { s.top = Math.max(1, Math.floor(s.top * fy)); s.bottom = Math.max(1, Math.floor(s.bottom * fy)); }
      }
      files.push({ path: `assets/${q.path}`, data: bytes });
      // per-piece forks can arm the edge shine even when the kit default is
      // off, so any armed fork keeps the outlines flowing into the manifest
      const idleOutline = (st.cfg.idle?.edge || Object.values(st.kitDesigns ?? {}).some((kd) => kd?.idle?.edge)) && q.meta.part === "base" ? sampleOutline(q.svg) : null;
      manifest.push({ file: `assets/${q.path}`, nativeW: w, nativeH: h, sha256: await sha256Hex(bytes), shell: shellBox, ...(idleOutline ? { outline: idleOutline } : {}), ...q.meta });
      /* the piece's own aura, derived from the sprite we just made — the
         silhouette blurred exactly the way the app blurs it. Only for the
         families that swap: a panel has no hover to announce. */
      if (q.meta.part === "base" && GLOW_FAMS.has(q.meta.component)) {
        const g = await glowFromPng(bytes, PNG_SCALE);
        files.push({ path: `assets/${q.meta.component}/${q.meta.component}-glow.png`, data: g.bytes });
        manifest.push({
          file: `assets/${q.meta.component}/${q.meta.component}-glow.png`, nativeW: g.w, nativeH: g.h,
          sha256: await sha256Hex(g.bytes), component: q.meta.component, part: "glow",
          nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true,
          usage: "This piece's aura — its silhouette, blurred the way the app blurs it. White, so it tints to any role; the hover glow uses it behind the piece.",
        });
      }
    }
    onProgress?.(pngQueue.length, total, catalog ? "catalog" : "zip");
  };

  /* ── tier scope: the free STARTER is three pieces that together demo
     states, nine-slice stretch and the overwrite restyle (spec §1) —
     master button + chip here, progress track/fill below. Everything else
     renders only for the paid full kit. Paths are IDENTICAL in both
     scopes, so an upgrade lands the full kit over the starter in place. */
  const full = st.scope === "full";
  const FREE_NINE = new Set<KitComponentId>(["primary", "chip"]);
  /* the slug becomes a zip path segment in end users' projects — re-apply
     the canonical shape at USE time so nothing traversal-shaped can ride
     in from a poisoned project doc or share link, wherever it was minted */
  const safeSlug = sanitizeUnitySlug(st.slug) ?? "ui-kit";
  // measured inside the full-kit block, read by the manifest below it
  let globeWell: { x0: number; y0: number; x1: number; y1: number } | null = null;
  // rarity ladder — rendered as frames only in the full kit, but declared
  // here because the manifest's rarity block (full-gated) also reads it
  const tiersR = rarityTiers(st.cfg);

  /* ── nine-sliced frames & surfaces — full material and flat variants ── */
  const NINE: { id: KitComponentId; family: string; h: number; usage: string }[] = [
    { id: "primary", family: "button-primary", h: 136, usage: "Main action button. Nine-slice base + live engine text; add icons as separate images." },
    { id: "secondary", family: "button-secondary", h: 136, usage: "Secondary action. Same construction as primary." },
    { id: "small", family: "button-small", h: 100, usage: "Compact action button." },
    { id: "chip", family: "chip", h: 84, usage: "Pill / chip. Value text is live engine text." },
    { id: "tab", family: "tab", h: 84, usage: "Tab. Selected state = tint or the full-material variant." },
    { id: "tabback", family: "tab-back", h: 84, usage: "Back tab — the tab\'s mirror twin (reversed pointer silhouette by default), so both directions ship in one kit." },
    { id: "input", family: "input", h: 124, usage: "Input field surface (well included). Nothing is baked into it — the placeholder ships as a live text layer on the prefab, and the value and caret are engine widgets." },
    { id: "panel", family: "panel", h: 380, usage: "Container / window. Content is engine layout." },
    { id: "header", family: "header-banner", h: 158, usage: "Header banner. Title is live engine text." },
    { id: "datarow", family: "list-row", h: 128, usage: "List row surface. Portrait, texts and bar are separate engine elements." },
    { id: "slot", family: "item-slot", h: 128, usage: "Item slot frame + well. Item icon and count are engine content." },
  ];
  /* the prefab's DEFAULT rect wears the kit's WORDS — see PREF_LABEL at
     module scope (the labeled-geometry bakes and the posed-divergence
     test read the same map). */
  /* staged pieces obey the bay in the ENGINE zip too: they ship only
     once RELEASED, or when this maker actually placed one on a board
     (only an admin can place a staged piece) — same rule as shipProp */
  const usedOnBoards0 = new Set<string>();
  for (const bd0 of st.boards ?? []) for (const bi0 of bd0.items) usedOnBoards0.add(bi0.component);
  // boards record FAMILY names ("tab-back"), not editor ids ("tabback") —
  // comparing the id silently broke the placed-piece fallback (field: the
  // owner's placed Back tab shipped nothing while still staged)
  const stagedShips = (id: KitComponentId) => kitVisible(id, st.releases ?? {}, false) || usedOnBoards0.has(PREFAB_FAMILY[id] ?? id);
  for (const n of NINE) {
    if (!full && !FREE_NINE.has(n.id)) continue;
    if (n.id === "tabback" && !stagedShips("tabback")) continue;
    /* NOTHING replaceable is baked into a sprite. The input's "Type
       something…" used to ride along as art — the affordance reads well in
       the app, but in Unity it arrived welded to the surface and there was
       no way to take it off (owner: "I didn't realize the text would be
       burned into the image"). It ships as a live text layer on the prefab
       instead: editable, or deletable in one keystroke. */
    const rowOpts: Record<string, unknown> = n.id === "datarow"
      ? { row: { title: "", sub: "", avatar: false, progress: false, action: false } as never }
      : n.id === "input" ? { placeholder: false } : {};
    /* LABELED-GEOMETRY bake: a fluid silhouette redraws its decorated ends
       at whatever width its words need — baked labeless, the shell hugged
       nothing and the prefab stretched ~2x to fit its live label, smearing
       the middle (owner: prefab vs scene screenshots). So labeled families
       render WITH their stock words and the content group at opacity 0:
       true geometry, labeless pixels. The words themselves stay live text. */
    const word = PREF_LABEL[n.id];
    const wordOpts = word !== undefined ? { ...rowOpts, label: word } : rowOpts;
    const ghost = word !== undefined ? (m?: (c: GenConfig) => void) => (c: GenConfig) => { m?.(c); c.transparency.content = 0; } : (m?: (c: GenConfig) => void) => m;
    const fullSvg = shell(n.id, wordOpts, ghost(slim));
    const slice = sliceOf(n.id, n.h);
    /* swap families crop base + states on ONE union box (the group) so the
       four sprites share a coordinate space — see rasterQueue */
    const swap = ["primary", "secondary", "small", "chip", "tab", "tabback", "slot", "datarow"].includes(n.id);
    // flip provenance: which silhouette this bake actually wears
    const famFlip = isFlipShape(st.kitShapes[n.id] ?? KIT_SHAPE[n.id] ?? st.cfg.shape);
    let pref: { prefW: number; prefH: number } | null = null;
    if (word !== undefined) {
      /* with the bake itself labeled, prefW ≈ the sprite's own shell — the
         rect math in FamilyPrefab degrades to identity, kept as the truth
         anchor if bake and measurement ever diverge */
      const lShm = /data-shell="([-\d. ]+)"/.exec(fullSvg);
      const lV = lShm?.[1].split(" ").map(Number);
      if (lV && lV.length === 4 && lV[2] > 4 && lV[3] > 4)
        pref = { prefW: Math.round(lV[2] * 10) / 10, prefH: Math.round(lV[3] * 10) / 10 };
    }
    /* the ghosted bake still carries the label <text> invisibly — its x is
       the word's true center (text-anchor middle on every labeled family),
       its y pairs with data-shell0 (the node sits inside the rise/lift
       transforms), its font-size is the true rendered size. Offsets from
       the shell CENTER are frame-invariant, so ship those. */
    let labelMeta: { labelDx: number; labelDy: number; labelFs: number } | null = null;
    if (word !== undefined) {
      const lg = fullSvg.slice(fullSvg.indexOf('data-part="label"'));
      const tm = /<text x="(-?[\d.]+)" y="(-?[\d.]+)" font-size="([\d.]+)"/.exec(lg);
      const s0m = /data-shell0="([-\d. ]+)"/.exec(fullSvg) ?? /data-shell="([-\d. ]+)"/.exec(fullSvg);
      const s0 = s0m?.[1].split(" ").map(Number);
      if (tm && s0 && s0.length === 4 && +tm[3] > 1) {
        labelMeta = {
          labelDx: Math.round((+tm[1] - (s0[0] + s0[2] / 2)) * 10) / 10,
          labelDy: Math.round((+tm[2] - (s0[1] + s0[3] / 2)) * 10) / 10,
          labelFs: Math.round(+tm[3] * 10) / 10,
        };
      }
    }
    await addPng(`${n.family}/base.9.png`, fullSvg,
      { component: n.family, part: "base", nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: n.usage, ...(famFlip ? { flip: true } : {}), ...(pref ?? {}), ...(labelMeta ?? {}) }, true, swap ? n.family : undefined);
    const flatSvg = shell(n.id, wordOpts, ghost((c) => { slim(c); flat(c); }));
    await addPng(`${n.family}/base-flat.9.png`, flatSvg,
      { component: n.family, part: "base-flat", nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Flat variant (no gloss/specular/pattern) — tint freely or layer your own effects above it." }, true);
    /* interactive pieces ship their DESIGNED states for engine Sprite Swap —
       generic color-tint transitions never match the kit's own recipes */
    if (swap) {
      const SWAP: Record<string, string> = { hover: "Highlighted (and Selected)", pressed: "Pressed", disabled: "Disabled" };
      for (const stName of ["hover", "pressed", "disabled"] as const) {
        await addPng(`${n.family}/base-${stName}.9.png`, stateShell(n.id, stName, wordOpts, undefined, true, word !== undefined ? (c) => { c.transparency.content = 0; } : undefined),
          { component: n.family, part: `base-${stName}`, nineSlice: slice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: `The kit's designed ${stName} state — Sprite Swap slot: ${SWAP[stName]}. Same nine-slice and coordinate space as base (union-cropped together). Glow and lift stay engine-composed (fx/fx-glow.png, a small translate).` }, true, n.family);
      }
    }
    /* the SPECULAR STREAK as its own overlay (owner: "needs more nuance to
       match the original") — the sliced base dropped it (slim); prefabs
       anchor this sprite shell-to-shell above the face so the feathered
       window scales with the piece instead of smearing through the
       nine-slice. Blend-mode speculars stay baked, so no sprite ships.
       Same labeled geometry as base, or the anchored overlay would stretch. */
    const spC = pieceCfg(n.id).candy.specular;
    if (spC.on && spC.intensity > 1 && (!spC.blend || spC.blend === "normal"))
      await addPng(`${n.family}/specular.png`, shell(n.id, { faceLayer: "specular", ...wordOpts }, ghost()),
        { component: n.family, part: "specular", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
          usage: "The kit's specular streak alone — overlay it (Simple image, anchored shell-to-shell; the prefabs wire this) so it scales with the piece. Deliberately NOT sliced." }, true);
  }

  /* ── controls: separated track / fill / thumb ─────────────────── */
  const capsule = (w: number, h: number, fill: string, extra = "") =>
    svgWrap(w, h, `<path d="${rr(0.5, 0.5, w - 1, h - 1, h / 2)}" fill="${fill}"/>` + extra);
  const grad = (idp: string, a: string, b: string) =>
    `<defs><linearGradient id="${idp}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;

  const trackSvg = (w: number, h: number) => capsule(w, h, wellC);
  const fillSvg = (w: number, h: number) =>
    svgWrap(w, h, grad("f", bevelC, glowC) +
      `<path d="${rr(0.5, 0.5, w - 1, h - 1, h / 2)}" fill="url(#f)"/>` +
      `<path d="${rr(w * 0.03, h * 0.09, w * 0.94, h * 0.34, h * 0.17)}" fill="#FFFFFF" opacity="0.3"/>`);
  const barSlice = (h: number) => ({ left: h, right: h, top: Math.round(h * 0.9), bottom: Math.round(h * 0.9) });

  await addPng("progress/track.9.png", trackSvg(440, 44), { component: "progress", part: "track", nineSlice: barSlice(44), pivot: { x: 0, y: 0.5 }, tintable: true, usage: "Progress track. Stretch horizontally; fill goes above it." });
  await addPng("progress/fill.9.png", fillSvg(440, 36), { component: "progress", part: "fill", nineSlice: barSlice(36), pivot: { x: 0, y: 0.5 }, tintable: false, usage: "Progress fill. Engine drives width/scissor from the live value." });
  if (full) {
  // segmented meter — empty well plus one lit cell; the engine tiles cells
  // into the well at its own count/gap. The docked emblem socket ships as
  // the icon-button base: same silhouette, drop any art in the well.
  await addPng("segbar/base.png", shell("segbar", { bar: { segments: 5 } }, undefined, 0), { component: "segbar", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Segmented meter, empty — 5 ghost cells in the themed well. Layer lit cells above." });
  await addPng("segbar/lit.png", shell("segbar", { bar: { segments: 5 } }, undefined, 1), { component: "segbar", part: "lit", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Segmented meter, full — crop one cell for a tile, or scissor horizontally per lit count." });
  /* the settings controls, COMPONENT-TRUE (owner: "let's get those
     settings screens working this round") — the REAL slider and toggle
     pieces split into rig layers: track, full-run mercury, candy knob.
     The importer assembles a working Unity Slider / Switch from these,
     so the live control is the piece the maker styled, not a generic
     capsule approximation. Same filenames as the old synthesized strips —
     existing projects upgrade in place. */
  await addPng("slider/track.9.png", shell("slider", { overlay: "track" }, slim), { component: "slider", part: "track", nineSlice: sliceOf("slider", 64), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Slider track — the real component's shell + well, no fill, no knob. The wired Slider prefab stretches it." }, true);
  await addPng("slider/fill.9.png", shell("slider", { overlay: "fill" }, slim, 1), { component: "slider", part: "fill", nineSlice: sliceOf("slider", 44), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Slider mercury at 100% — the wired prefab's Fill Rect scissors it to the live value." }, true);
  await addPng("slider/thumb.png", shell("slider", { overlay: "knob" }, slim), { component: "slider", part: "thumb", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Slider knob — the kit's candy ball; the wired prefab drags it." }, true);
  await addPng("toggle/track.9.png", shell("toggle", { overlay: "track" }, slim, 1), { component: "toggle", part: "track", nineSlice: sliceOf("toggle", 102), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Switch track — the real component's shell + well. The wired Switch prefab slides the knob across it." }, true);
  await addPng("toggle/thumb.png", shell("toggle", { overlay: "knob" }, slim, 1), { component: "toggle", part: "thumb", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Switch knob, ON dot — the wired prefab slides it and swaps the OFF twin in." }, true);
  await addPng("toggle/thumb-off.png", shell("toggle", { overlay: "knob-off" }, slim, 1), { component: "toggle", part: "thumb-off", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Switch knob, OFF dot — the wired prefab shows it when the switch is off." }, true);

  /* affordance glyphs SHIP (owner call — the ghost marks, chevron and kit
     icon are how the pieces read; "none" per piece on uikitmaker.com is
     the strip switch, honored end to end): icon undefined here overrides
     shell()'s blanket null back to "as designed" */
  await addPng("checkbox/base.png", shell("checkbox", { icon: undefined }, undefined, 0), { component: "checkbox", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Unchecked box, ghost mark included (as designed). The lit check is a separate tintable glyph (icons/check.png)." });
  await addPng("radio/base.png", shell("radio", { icon: undefined }, undefined, 0), { component: "radio", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Radio shell, ghost pip included (as designed). The lit dot is a separate tintable glyph (icons/dot.png)." });
  /* the PLAIN twins (dev field report: "the checkbox base background has
     the check baked on"; owner: "offer both types to cover all bases") —
     bare wells with no ghost mark, so Unity's own Toggle can own the
     checkmark. The importer wires CheckboxToggle / RadioToggle prefabs
     from these; the designed ghost-mark bases keep shipping beside them. */
  await addPng("checkbox/base-plain.png", shell("checkbox", { icon: null }, undefined, 0), { component: "checkbox", part: "base-plain", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Bare unchecked box, NO ghost mark — background for the wired CheckboxToggle prefab (Unity Toggle; icons/check.png is the checkmark)." });
  await addPng("radio/base-plain.png", shell("radio", { icon: null }, undefined, 0), { component: "radio", part: "base-plain", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Bare radio well, NO ghost pip — background for the wired RadioToggle prefab (Unity Toggle + your ToggleGroup; icons/dot.png is the dot)." });
  /* the SCROLL VIEW (dev field report: "especially useful would be the
     scroll view components... the slider materials seem more geared toward
     mixer volumes"): a vertical track in the kit's well, a candy handle,
     and a wired ScrollView prefab the importer assembles around them. */
  const vcap = (w: number, h: number, fill: string, extra = "") =>
    svgWrap(w, h, `<path d="${rr(0.5, 0.5, w - 1, h - 1, (w - 1) / 2)}" fill="${fill}"/>` + extra);
  const vSlice = (w: number) => ({ left: Math.round(w * 0.45), right: Math.round(w * 0.45), top: w, bottom: w });
  await addPng("scrollview/track.9.png", vcap(44, 440, wellC), { component: "scrollview", part: "track", nineSlice: vSlice(44), pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Vertical scrollbar track in the kit's well. Stretch vertically." });
  await addPng("scrollview/handle.9.png", vcap(36, 220, bevelC,
    `<path d="${rr(5, 6, 8, 208, 4)}" fill="#FFFFFF" opacity="0.28"/>`),
    { component: "scrollview", part: "handle", nineSlice: vSlice(36), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Scrollbar handle — the kit's bevel candy with an edge light. The ScrollView prefab wires it." });
  await addPng("orb/lit.png", shell("orb", {}, undefined, 1), { component: "orb", part: "lit", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Glow orb, lit — streaks, statuses, day markers." });
  await addPng("orb/off.png", shell("orb", {}, undefined, 0), { component: "orb", part: "off", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Glow orb, off (dark glass)." });
  await addPng("badge/base.png", shell("badge"), { component: "badge", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Badge / medallion shell. Number or glyph is engine content." });
  await addPng("iconbtn/base.png", shell("iconbtn", { icon: undefined }), { component: "iconbtn", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Icon button wearing the kit's own glyph. Want it bare for your own icons? Set this piece's icon to 'none' on uikitmaker.com and re-export." });
  await addPng("iconbtn/base-plain.png", shell("iconbtn", { icon: null }), { component: "iconbtn", part: "base-plain", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Icon button shell, NO glyph baked — drop any icons/* on top for close/X, back, settings buttons." });

  /* ── states for the OTHER controls people actually point at. Only the
     nine-slice buttons shipped hover/pressed/disabled, so an icon button,
     a checkbox and a radio arrived inert — you hover them in the Playground
     and nothing happens (owner: "I think it's missing the hover states").
     These bases render on the FULL canvas rather than cropped, so all four
     states already share one geometry — the swap can't shift the art. ── */
  const STATEFUL: { id: KitComponentId; family: string; opts: Record<string, unknown>; value?: number }[] = [
    { id: "iconbtn", family: "iconbtn", opts: { icon: undefined } },
    { id: "checkbox", family: "checkbox", opts: { icon: undefined }, value: 0 },
    { id: "radio", family: "radio", opts: { icon: undefined }, value: 0 },
  ];
  const SWAP_USAGE: Record<string, string> = {
    hover: "Highlighted (and Selected)",
    pressed: "Pressed",
    disabled: "Disabled",
  };
  for (const s of STATEFUL) {
    for (const stName of ["hover", "pressed", "disabled"] as const) {
      await addPng(`${s.family}/base-${stName}.png`, stateShell(s.id, stName, s.opts, s.value),
        { component: s.family, part: `base-${stName}`, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
          usage: `${SWAP_USAGE[stName]} state — wire as Sprite Swap beside base.png.` });
    }
  }

  /* ── PROP PIECES GO LIVE (owner: "too many things are board stamps and
     not interactive… only text should be treated this way" / "the main
     point of this kit is to be useful, not to just show examples").
     Each ships a real sprite family so the importer builds a wired
     prefab and board scenes place components, not pictures. Fixed-size
     art, never sliced. A still-staged piece ships only when RELEASED or
     actually placed on a board — only an admin can place a staged piece,
     so their zip carries it while everyone else's stays clean. ── */
  if (full) {
    const usedOnBoards = new Set<string>();
    for (const bd of st.boards ?? []) for (const bi of bd.items) usedOnBoards.add(bi.component);
    const shipProp = (id: KitComponentId) => kitVisible(id, st.releases ?? {}, false) || usedOnBoards.has(id);
    const PROPS: { id: KitComponentId; states: ("hover" | "pressed" | "disabled")[]; value?: number; usage: string }[] = [
      { id: "gearicon", states: ["hover", "pressed", "disabled"], usage: "Settings gear, hub baked in — wire as a Button; glow rides the engine aura." },
      { id: "trophyicon", states: ["disabled"], usage: "Trophy, kit material. Podium finishes ship beside it (gold/silver/bronze) — swap the sprite for placements. States are calmed by design; glow is engine-composed." },
      { id: "gifticon", states: ["disabled"], usage: "Gift box, fold lines baked (they are the drawing). States are calmed by design; glow is engine-composed." },
      /* the full carousel pose stays as a pictorial reference; its state
         swaps moved to the RIG's dome sprites (firebutton-dome-*) */
      { id: "firebutton", states: [], value: 0, usage: "Fire button with quick-select carousel, full pose baked (reference/thumbnail). The WORKING piece is the Firebutton prefab: bare dome + chambers + live icons/ glyphs — swipe left/right cycles the armed weapon." },
      { id: "endturn", states: ["hover", "pressed", "disabled"], value: 0, usage: "End-turn button, bare shell — the label is LIVE text and the countdown ring is endturn-arc (Filled/Radial360, drive fillAmount)." },
      { id: "keycap", states: ["hover", "pressed", "disabled"], usage: "Key prompt cap, bare — the key glyph is LIVE text. Single-char width; wide keys (SPACE) stretch poorly, scale instead." },
      { id: "pricebtn", states: ["hover", "pressed", "disabled"], usage: "Price button — coin and ribbon plate baked (v1: ribbon words too), the PRICE is live text." },
    ];
    for (const p of PROPS) {
      if (!shipProp(p.id)) continue;
      await addPng(`${p.id}/base.png`, shell(p.id, {}, undefined, p.value),
        { component: p.id, part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: p.usage }, true, p.id);
      for (const stName of p.states)
        await addPng(`${p.id}/base-${stName}.png`, stateShell(p.id, stName, {}, p.value),
          { component: p.id, part: `base-${stName}`, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
            usage: `${SWAP_USAGE[stName]} state — wire as Sprite Swap beside base.png.` }, true, p.id);
      if (p.id === "trophyicon") for (const fin of ["gold", "silver", "bronze"] as const)
        await addPng(`trophyicon/${fin}.png`, shell("trophyicon", { overlay: fin }),
          { component: "trophyicon", part: fin, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
            usage: `${fin} podium finish — same geometry as base; swap it onto the Trophy prefab for placements.` }, true, "trophyicon");
      if (p.id === "endturn")
        await addPng("endturn/arc.png",
          `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="86" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round"/></svg>`,
          { component: "endturn", part: "arc", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true,
            usage: "Countdown ring — Image Type Filled/Radial360, fillAmount = time left. The prefab tints it to the kit Glow and stages it at 0.7." });
      if (p.id === "firebutton") {
        /* the SWIPE RIG's layers (owner: "when you swipe left or right the
           center icon changes… bring that wiring into Unity"): a bare dome
           (no baked glyph, no satellites) with pressed/disabled twins in
           one union-crop group (the press sink stays in the pixels), plus
           each waiting-weapon chamber as its own bare sprite. The glyphs
           ride icons/ (sword, zap, flask, shield — tintable) and the
           FireButton runtime deals and re-deals them as the swipe cycles. */
        await addPng("firebutton/dome.png", shell("firebutton", { overlay: "plain" }, undefined, 0),
          { component: "firebutton", part: "dome", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
            usage: "Fire dome, bare — the armed glyph is a live icons/ layer on the FireButton prefab; swipe left/right cycles it." }, true, "firebutton-dome");
        for (const stName of ["pressed", "disabled"] as const)
          await addPng(`firebutton/dome-${stName}.png`, stateShell("firebutton", stName, { overlay: "plain" }, 0),
            { component: "firebutton", part: `dome-${stName}`, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
              usage: `${SWAP_USAGE[stName]} dome — Sprite Swap beside firebutton-dome.png; the press sink is in the pixels.` }, true, "firebutton-dome");
        for (const sn of [1, 2, 3] as const)
          await addPng(`firebutton/sat${sn}.png`, shell("firebutton", { overlay: `sat${sn}` }, undefined, 0),
            { component: "firebutton", part: `sat${sn}`, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
              usage: `Carousel chamber ${sn} (1 = biggest, the NEXT weapon) — bare; its glyph is a live layer the rig re-deals.` });
        /* the arsenal, KIT-THEMED (owner: "make the icons more on-brand") —
           the same treated glyphs the app draws: outline, lit fill, glow */
        for (const wp of ["sword", "zap", "flask", "shield"] as const)
          await addPng(`firebutton/glyph-${wp}.png`, shell("firebutton", { overlay: `glyph-${wp}` }, undefined, 0),
            { component: "firebutton", part: `glyph-${wp}`, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
              usage: `Weapon glyph, kit-themed (${wp}) — the Firebutton rig deals these across the dome and chambers; swap in your own art freely.` });
      }
    }
    /* the count badge goes DYNAMIC: bare circle + live count text on the
       prefab (owner: "the countdown numerics should be dynamic — I'll
       want those to animate on play") */
    if (shipProp("countbadge"))
      await addPng("countbadge/base-plain.png", shell("countbadge", { overlay: "plain" }, undefined, 0.03),
        { component: "countbadge", part: "base-plain", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false,
          usage: "Bare count circle — the number is LIVE text on the CountBadge prefab. Drive it and it animates." });
  }

  /* ── rarity system: one pre-tinted frame per tier + the bare loot plate.
     The tier ladder (this kit's names and colors, custom edits included)
     rides kit-manifest.json > rarity — the engine picks the tier from its
     own item data and renders the tier word as live text. ── */
  const slugR = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tier";
  for (let i = 0; i < tiersR.length; i++) {
    await addPng(`rarityframe/${slugR(tiersR[i].name)}.png`, shell("rarityframe", { overlay: "frame" }, undefined, i / (tiersR.length - 1)),
      { component: "rarityframe", part: slugR(tiersR[i].name), nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: `Item frame, ${tiersR[i].name} tier — aura pre-tinted ${tiersR[i].c}. Drop the item icon in the well; the tier word is live engine text (see manifest > rarity).` });
  }
  {
    const ltSvg = shell("loottag", { overlay: "frame" }, slim);
    await addPng("loottag/base.9.png", ltSvg,
      { component: "loottag", part: "base", nineSlice: sliceOf("loottag", 92), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Loot-tag plate, bare. Stripe = a rounded rect tinted to the tier color; item name and tier word are live engine text (colors in manifest > rarity)." }, true);
  }

  /* ── dropdown: closed shell, menu plate, and the two row overlays.
     A row's DEFAULT face needs no asset (it's live text on the plate);
     what the engine needs are the two emphasis layers — the hover bar
     and the selected check — as swappable pieces. The bar is this kit's
     Hover recipe made into an asset: the hover state's aura color at the
     hover glow dial's strength. */
  {
    const ddSvg = shell("dropdown", { icon: undefined }, slim);
    /* the shell's chevron rides ~56 SVG units off the right edge — the
       right border grows past it so nine-slice stretching never touches
       the glyph (the raster clamp still guards the center strip) */
    const ddSlice = sliceOf("dropdown", 110);
    ddSlice.right = Math.max(ddSlice.right, Math.round(80 * PNG_SCALE));
    /* no base-hover/pressed here on purpose: the dropdown is a COMPOSED
       control with no generated prefab, and its emphasis already ships as
       the row-highlight and row-check layers below. Three more full-size
       sprites nobody wires isn't free — a full kit is already 134 MB of
       uncompressed texture. */
    await addPng("dropdown/base.9.png", ddSvg,
      { component: "dropdown", part: "base", nineSlice: ddSlice, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Closed dropdown shell, chevron included (as designed, safe inside the right cap). The value text is live engine content." }, true);
    await addPng("dropdown/menu.9.png",
      svgWrap(440, 260, `<path d="${rr(1, 1, 438, 258, 14)}" fill="${darken(innerC, 0.55)}" stroke="${darken(bevelC, 0.5)}" stroke-width="1.5"/>`),
      { component: "dropdown", part: "menu", nineSlice: { left: 28, right: 28, top: 28, bottom: 28 }, pivot: { x: 0.5, y: 0 }, tintable: false, usage: "Open-menu plate. Stretch vertically to the option count; option rows are live engine text." });
    const dd = pieceCfg("dropdown");
    const hd = dd.stateDesigns.hover ?? dd;
    const hovC = hd.candy.aura.color ?? hd.effects.Glow ?? glowC;
    const hovOp = Math.min(0.55, 0.1 + 0.35 * (dd.states.hover.glow / 100));
    await addPng("dropdown/row-highlight.9.png",
      svgWrap(440, 88, `<path d="${rr(1, 1, 438, 86, 12)}" fill="${hexRgba(hovC, hovOp)}"/>`),
      { component: "dropdown", part: "row-highlight", nineSlice: { left: 24, right: 24, top: 24, bottom: 24 }, pivot: { x: 0, y: 0.5 }, tintable: true, usage: "The bar for the row under the cursor — derived from this kit's Hover state recipe. Show it on pointer hover AND keyboard/gamepad focus (same visual for both), never on the selected row." });
    await addPng("dropdown/row-check.png",
      svgWrap(96, 96, `<path d="M 24 52 l 15 15 l 33 -37" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`),
      { component: "dropdown", part: "row-check", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "The selected-row check — marks the choice that is currently TRUE, with full-strength row text. Keep it distinct from the hover bar: highlighted moves constantly, selected only changes on commit." });
  }

  /* ── racing HUD: dial face + needle, segment arc + one segment, track ── */
  await addPng("speedo/face.png", shell("speedo", { part: "face" }, undefined, 0), { component: "speedo", part: "face", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Classic dial face — ticks and red zone only. The km/h readout is live engine text." });
  await addPng("speedo/needle.png", shell("speedo", { part: "needle" }, undefined, 0), { component: "speedo", part: "needle", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Needle at zero (pointing to the sweep start). Rotate up to 270° around the canvas center from live speed." });
  await addPng("speedo2/face.png", shell("speedo2", { part: "face" }, undefined, 0), { component: "speedo2", part: "face", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "HUD segment arc, all 24 segments unlit. Light segments with segment.png copies placed on the same polar grid." });
  await addPng("speedo2/segment.png", shell("speedo2", { part: "segment" }, undefined, 1), { component: "speedo2", part: "segment", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "One lit segment — instance and rotate per step; tint along the palette for the sweep gradient." });
  await addPng("circuit/track.png", shell("circuit", { part: "track" }), { component: "circuit", part: "track", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Circuit ribbon with start/finish tick. Position markers and the venue label are live engine sprites/text." });
  {
    const lbSvg = shell("leaderboard", { part: "base" }, slim);
    await addPng("leaderboard/base.9.png", lbSvg, { component: "leaderboard", part: "base", nineSlice: sliceOf("leaderboard", 250), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Position-list panel. Heading, rows and the highlighted player row are live engine content." }, true);
  }
  {
    const lpSvg = shell("laptimes", { part: "base" }, slim);
    await addPng("laptimes/base.9.png", lpSvg, { component: "laptimes", part: "base", nineSlice: sliceOf("laptimes", 240), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Lap-comparison panel. Traces, legend and delta are live engine content." }, true);
    const tmSvg = shell("telemetry", { part: "base" }, slim);
    await addPng("telemetry/base.9.png", tmSvg, { component: "telemetry", part: "base", nineSlice: sliceOf("telemetry", 240), pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Telemetry panel. Throttle/brake/speed traces are live engine content." }, true);
  }
  await addPng("startlights/base.png", shell("startlights", { part: "base" }), { component: "startlights", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Start-light gantry, all pods dark. Light the pods with tinted circles (alarm red) from the engine's countdown." });

  /* ── the RIGS (owner round, 2026-08-04): joystick, health globe and
     season track ship as WORKING prefab ingredients, plus bare extras
     shells. Live-content rule holds: no words, numbers or reward icons
     baked anywhere — the shells carry the material, the engine carries
     the content. ── */
  await addPng("joystick/base.png", shell("joystick", { part: "base" }), { component: "joystick", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Touch-stick base — well and travel ring. The importer builds a wired Joystick prefab (PatternBreakJoystick drives the thumb)." });
  await addPng("joystick/thumb.png", shell("joystick", { part: "thumb" }), { component: "joystick", part: "thumb", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Touch-stick thumb (candy knob) — PatternBreakJoystick moves it and reports a normalized Vector2." });
  await addPng("globe/rim.png", shell("healthglobe", { part: "rim" }, undefined, 0), { component: "globe", part: "rim", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Health-globe bezel — draws ABOVE the liquid." });
  await addPng("globe/glass.png", shell("healthglobe", { part: "glass" }, undefined, 0), { component: "globe", part: "glass", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Health-globe glass — the dark sphere behind the liquid; doubles as the liquid's circular mask." });
  /* the liquid ships CROPPED to its real ink, and the manifest records
     where that band sits inside the glass frame — so the prefab can anchor
     the fill to the visible well and fillAmount 0..1 means visually
     empty..full (dev field report: full health read at 0.87, "dead" still
     held 10%+ — a game gating an ability on health == 1 never fires). */
  try {
    /* the liquid is a full-bleed gradient panel — the padding lives in the
       GLASS frame (structural air around the sphere). The visible well is
       the glass sphere's own ink box; its fractions of the (uncropped)
       glass frame are exactly where the fill must span. */
    const glassBox = await rasterInk(shell("healthglobe", { part: "glass" }, undefined, 0), 1);
    if (glassBox) {
      const fw = glassBox.cv.width, fh = glassBox.cv.height;
      globeWell = {
        x0: Math.max(0, glassBox.x0 / fw),
        x1: Math.min(1, (glassBox.x0 + glassBox.w) / fw),
        y0: Math.max(0, (fh - (glassBox.y0 + glassBox.h)) / fh),
        y1: Math.min(1, (fh - glassBox.y0) / fh),
      };
    }
  } catch { /* measurement is an upgrade, not a dependency — prefab falls back to full stretch */ }
  await addPng("globe/liquid.png", shell("healthglobe", { part: "liquid" }, undefined, 0), { component: "globe", part: "liquid", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Health-globe liquid panel — Filled (Vertical) Image masked by the glass. The prefab anchors it to the visible well, so fillAmount 0..1 IS the health, brim to floor." });
  await addPng("seasontrack/base.png", shell("seasontrack", { part: "shell" }), { component: "seasontrack", part: "base", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Season track, bare — lanes, spine, nodes and empty reward tiles. Lane names, level numbers and progress are live engine content (PatternBreakSeasonTrack)." });
  /* its own component id so the wired Minimap prefab (RadarDemo sweep +
     blips) can find its shell box in the manifest; the file stays in
     extras/ so existing projects keep their sprite in place */
  await addPng("extras/minimap.png", shell("minimap", { part: "shell" }), { component: "minimap", part: "minimap", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Mini-map frame in the kit silhouette — the Minimap prefab adds a demo radar sweep + blips (children named 'Demo …', delete freely and render your map inside the well)." });
  await addPng("extras/movecounter.png", shell("movecounter", { part: "shell" }, undefined, 0.8), { component: "extras", part: "movecounter", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Move-counter tile, bare — the number and caption are live engine text." });
  await addPng("extras/achievement.png", shell("achievetoast", { part: "shell" }), { component: "extras", part: "achievement", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Achievement toast plate with the gold medallion — the announcement and title are live engine text." });

  /* ── STRETCH-SAFE FACES (owner: a diagonal pattern shears when the
     nine-slice middle stretches). The wide, stateless pieces ship their
     face SPLIT: under (shell, rim, fill) → the pattern as a seamless
     tile → over (gloss, grain, inner edge, specular). Stacked in-engine
     the frame stretches, the pattern tiles at constant scale, and the
     gloss stays one sweep — the app's look at any width. Only worth the
     bytes when the kit actually wears a pattern. ── */
  const facePat = base.candy.pattern;
  if (facePat && facePat.type !== "none" && facePat.opacity > 1) {
    /* buttons and rows joined the split-face set (owner: "the pattern gets
       stretched out rather than a repeating pattern that is masked by
       whatever shape") — the tiled-face prefab keeps the pattern's rhythm
       at any width. Their sliced state-swap prefabs still ship beside it;
       the README's Sliced-vs-Tiled trade-off section says when to reach
       for which. */
    const FACE_H: Record<string, number> = { panel: 380, header: 158, "button-primary": 136, "button-secondary": 136, "list-row": 128, "item-slot": 128 };
    for (const [fam, cid] of [["panel", "panel"], ["header", "header"],
      ["button-primary", "primary"], ["button-secondary", "secondary"],
      ["list-row", "datarow"], ["item-slot", "slot"]] as const) {
      const sl = sliceOf(cid as KitComponentId, FACE_H[fam]);
      /* ONE union crop box for the pair (same trick the swap states use):
         cropped apart, the over layer — which has no shell or shadow —
         lands in a tighter box and every gloss sits misplaced once the
         two are stretched over the same rect */
      const grp = `faceLayer-${fam}`;
      /* the face layers are SURFACES — demo content must not ride along.
         The plain base already ships bare; the tiled list-row skipped the
         bare-row opts and baked "Level 12 · Warrior" into the under layer
         (owner: "is this level 2 warrior stuff meant to be a baked
         image? the main point of this kit is to be useful"). */
      const bare0: Record<string, unknown> = cid === "datarow"
        ? { row: { title: "", sub: "", avatar: false, progress: false, action: false } as never } : {};
      /* labeled families' face layers share the base sprite's LABELED
         geometry (see the NINE loop) — mixed-width layers would misalign
         the tiled-face stack */
      const wordF = PREF_LABEL[cid as KitComponentId];
      const bare: Record<string, unknown> = wordF !== undefined ? { ...bare0, label: wordF } : bare0;
      const slimF = wordF !== undefined ? (c: GenConfig) => { slim(c); c.transparency.content = 0; } : slim;
      await addPng(`${fam}/base-under.9.png`, shell(cid as KitComponentId, { faceLayer: "under", ...bare }, slimF),
        { component: fam, part: "base-under", nineSlice: sl, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Stretch-safe face, LOWER half: shell, rim and fill, no pattern. Sliced. Put the tiled pattern above it (masked), then base-over." }, true, grp);
      await addPng(`${fam}/base-over.9.png`, shell(cid as KitComponentId, { faceLayer: "over", ...bare }, slimF),
        { component: fam, part: "base-over", nineSlice: sl, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Stretch-safe face, UPPER half: gloss, grain, inner edge and specular over transparency. Sliced, drawn last — the gloss stays ONE sweep at any width." }, true, grp);
      /* the STENCIL: the face silhouette alone, opaque. Unity's Mask only
         alpha-clips when its graphic is hidden, so masking with a visible
         art layer gives a RECTANGULAR mask and the pattern spills past
         the shape (field: "pattern mask is off here"). A dedicated hidden
         mask sprite clips exactly, with no glow fringe to leak through. */
      await addPng(`${fam}/base-mask.9.png`, shell(cid as KitComponentId, { faceLayer: "mask", ...bare }, slimF),
        { component: fam, part: "base-mask", nineSlice: sl, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Stretch-safe face STENCIL: the bare face silhouette. Put it on a hidden Mask (Show Mask Graphic OFF) with the tiled pattern as its child — that clips the pattern to the shape exactly." }, true, grp);
    }
    /* the face pattern as a seamless tile: one cell, drawn at the same
       size and angle build() uses, so a Tiled Image reads identical to
       the baked pattern at 1:1 */
    const K1 = 1; // component faces render at K=1 in the export sizes
    const ps = (8 + facePat.scale * 0.9) * K1;
    const ang = ((facePat.angle ?? 0) % 180 + 180) % 180;
    /* an integer cell spanning WHOLE pattern periods with minimal drift —
       a fractional period leaves a hairline at every Tiled repeat. The old
       √2 square was only period-exact at 45°; stripes are invariant along
       their own axis, so their true sample is p/|sin| across, p/|cos| down
       at ANY angle (45° reduces to the √2 cell). */
    const intFit = (period: number) => {
      let best = Math.max(8, Math.round(period)), bestErr = Math.abs(best - period) / period;
      for (let n = 2; n <= 8; n++) {
        const w = period * n;
        if (w > 600) break;
        const r = Math.round(w);
        const err = Math.abs(r - w) / w;
        if (r >= 8 && err < bestErr - 1e-9) { best = r; bestErr = err; }
      }
      return best;
    };
    let cellW: number, cellH: number;
    if (facePat.type === "stripes" && ang % 90 !== 0) {
      const rad = (ang * Math.PI) / 180;
      cellW = intFit(ps / Math.abs(Math.sin(rad)));
      cellH = intFit(ps / Math.abs(Math.cos(rad)));
    } else {
      cellW = cellH = Math.max(8, Math.round(ps * (ang % 90 !== 0 ? Math.SQRT2 : 1)));
    }
    const patC = facePat.color ? facePat.color : darken(innerC, 0.2);
    const patTile = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${cellH}" viewBox="0 0 ${cellW} ${cellH}">` +
      `<defs><pattern id="fp" width="${ps.toFixed(3)}" height="${ps.toFixed(3)}" patternUnits="userSpaceOnUse"${ang ? ` patternTransform="rotate(${ang})"` : ""}>${textPatternCell(facePat.type, ps, patC)}</pattern></defs>` +
      `<rect width="${cellW}" height="${cellH}" fill="url(#fp)" opacity="${Math.max(0, Math.min(1, facePat.opacity / 100)).toFixed(2)}"/></svg>`;
    await addPng("fx/face-tile.png", patTile,
      { component: "fx", part: "face-tile", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "The kit's face pattern as ONE seamless cell. Use on a Tiled Image between -base-under and -base-over — it keeps its angle and rhythm at any size, so stretching never shears it." });
  }
  } // full scope

  /* ── shared FX blobs — engines compose their own shadows/glows ── */
  const blob = (color: string, opacity: number) =>
    svgWrap(256, 256, `<defs><radialGradient id="g"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="128" cy="128" r="126" fill="url(#g)"/>`);
  await addPng("fx/drop-shadow.png", blob("#04070E", 0.55), { component: "fx", part: "drop-shadow", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Soft shadow blob — scale/flatten under any piece." });
  await addPng("fx/glow.png", blob("#FFFFFF", 0.85), { component: "fx", part: "glow", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "Radial glow blob — tint to the Glow role for auras and pulses." });

  /* the inventory grid's SELECTION RING, the app's exact stroke-and-glow
     recipe as its own sprite — the boards bake the panel ringless and a
     rig moves this over whichever tile is clicked. Ships only when a
     board actually places an inventory grid. */
  if (st.boards?.some((bd) => bd.items.some((it) => it.component === "invgrid" && it.cells))) {
    const rGlow = pieceCfg("invgrid").effects.Glow ?? "#8FF0FF";
    const rr9 = parseInt(rGlow.slice(1, 3), 16), rg9 = parseInt(rGlow.slice(3, 5), 16), rb9 = parseInt(rGlow.slice(5, 7), 16);
    const ringSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="264" height="264" viewBox="-12 -12 132 132">` +
      `<rect x="0" y="0" width="108" height="108" rx="12" fill="none" stroke="${rGlow}" stroke-opacity="0.8" stroke-width="2.2" style="filter: drop-shadow(0 0 5px rgba(${rr9},${rg9},${rb9},0.6))"/></svg>`;
    await addPng("invgrid/cell-ring.png", ringSvg, { component: "invgrid", part: "cellring", nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: false, usage: "Inventory selection ring — the scene rig moves it between tiles; scale it to your cell." });
  }

  /* ── tintable white icon set (engine swaps freely) ────────────── */
  if (full) for (const [name, def] of Object.entries(STOCK_ICONS)) {
    const stroke = def.mode === "stroke";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="${def.viewBox}">` +
      `<g fill="${stroke ? "none" : "#FFFFFF"}" stroke="${stroke ? "#FFFFFF" : "none"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${def.inner}</g></svg>`;
    await addPng(`icons/${name}.png`, svg, { component: "icons", part: name, nineSlice: null, pivot: { x: 0.5, y: 0.5 }, tintable: true, usage: "White glyph — tint in-engine; never bake into components." });
  }

  /* ── fonts FIRST: ship the kit's faces with their licenses — and register
     the primary for embedding, because an SVG rasterized through an <img>
     is a SEALED document that cannot see the page's fonts. Without this,
     every <text> in every rasterized export (baked alphabet, stamps, any
     text-bearing sprite) silently falls back to a system face (field: the
     baked MIAMI shipped skinny system glyphs in full kit dress). ── */
  onProgress?.(0, pngQueue.length + 1, "fonts");
  const famList = [...new Set([st.cfg.type.font, ...(st.cfg.type.listFont ? [st.cfg.type.listFont] : [])])].slice(0, 4);
  let primaryFontFile: string | null = null;
  let primaryFontBytes: Uint8Array | null = null;
  for (const fam of famList) {
    const got = await fetchKitFont(fam).catch(() => null);
    if (!got) continue;
    const famSlug = fam.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    files.push({ path: `fonts/${got.file}`, data: got.bytes });
    files.push({ path: `fonts/${famSlug}-${got.licenceName}`, data: got.licenceText });
    if (fam === st.cfg.type.font) { primaryFontFile = `fonts/${got.file}`; primaryFontBytes = got.bytes; }
  }
  setEmbedFont(st.cfg.type.font, primaryFontBytes);

  /* ── rasterise everything queued above, reporting progress ────── */
  await rasterQueue();

  /* ── the letterform pattern, as a LIVE-TEXT tile: the app's own rotated
     <pattern> rasterized onto an opaque white ground (TMP's face texture
     MULTIPLIES the face color, so white = untouched fill, pattern strokes
     darken through) — the importer feeds it to the SDF shader's Face
     Texture slot. The kit's angle is snapped to the nearest 45°: those are
     the only rotations where a square window tiles seamlessly (diagonals
     wrap over cell·√2 — lattice vectors v1−v2 and v1+v2 land back on the
     axes). The window is sized so the wrap is exact, then the cell is
     re-derived from it. ── */
  let patternFile: string | null = null;
  let patternAngle = 0;
  let patternReps = 0;
  if (base.type.stripes?.on) {
    const scaleF = Math.max(0.25, Math.min(4, (base.type.stripes.scale ?? 100) / 100));
    patternAngle = ((Math.round((base.type.stripes.angle ?? 45) / 45) * 45) % 180 + 180) % 180;
    const diag = patternAngle % 90 === 45;
    const W = Math.max(8, Math.round(64 * scaleF * (diag ? Math.SQRT2 : 1)));
    const pcell = diag ? W / Math.SQRT2 : W;
    const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">` +
      `<rect width="${W}" height="${W}" fill="#FFFFFF"/>` +
      `<defs><pattern id="pbt" width="${pcell.toFixed(4)}" height="${pcell.toFixed(4)}" patternUnits="userSpaceOnUse"${patternAngle ? ` patternTransform="rotate(${patternAngle})"` : ""}>${textPatternCell(base.type.stripes.style ?? "stripes", pcell, darken(bevelC, 0.25))}</pattern></defs>` +
      `<rect width="${W}" height="${W}" fill="url(#pbt)" opacity="${Math.max(0, Math.min(1, (base.type.stripes.opacity ?? 30) / 100)).toFixed(2)}"/></svg>`;
    const tileBytes = (await svgToPngBytes(tile, 2)).bytes;
    files.push({ path: "fonts/face-pattern.png", data: tileBytes });
    patternFile = "fonts/face-pattern.png";
    /* the density the importer should tile at: the app draws cells of
       fontSize·0.3·scale, i.e. 3.33/scale cells per em; prefab labels map
       the texture across the whole line (~2.2em for the shipped PLAY-length
       words), and a diagonal window holds √2 cells per axis */
    patternReps = Math.min(32, Math.max(1, 7.33 / scaleF / (diag ? Math.SQRT2 : 1)));
  }

  /* ── the BAKED ALPHABET FACE (owner-promoted): every glyph rendered by
     the app's own type engine — pattern, glints, gloss, the whole
     treatment — packed into a color font atlas. The importer assembles a
     TextMeshPro font asset from it, so Unity types hero text with the
     app's exact pixels. The SDF face stays the length-proof workhorse;
     this is the showpiece for display text. ── */
  let bakedFace: { file: string; metrics: string; pointSize: number; layerFill: string | null; layerStroke: string | null; layerShadow: string | null; layerGlints: string | null } | null = null;
  try {
    /* Pro-only (owner call): the baked faces are the type showpiece — the
       starter keeps the SDF face + gradient preset and upsells the rest.
       No font bytes = the rasterizer would bake SYSTEM glyphs in kit dress
       (review catch: an offline export shipped that silently) — skip the
       bake then too; the SDF face still styles labels from the recipe */
    if (full && !primaryFontBytes) console.warn("engine export: kit font unavailable — the baked alphabet face is skipped this export");
    const baked = full && primaryFontBytes ? await bakeAlphabetFace(base) : null;
    if (baked) {
      files.push({ path: "fonts/kitface-baked.png", data: baked.png });
      files.push({ path: "fonts/kitface-baked.json", data: new TextEncoder().encode(baked.metrics) });
      const lp = baked.layerPngs;
      const lput = (k: "fill" | "stroke" | "shadow" | "glints"): string | null => {
        const d = lp?.[k];
        if (!d) return null;
        const path = `fonts/kitface-baked-${k}.png`;
        files.push({ path, data: d });
        return path;
      };
      bakedFace = { file: "fonts/kitface-baked.png", metrics: "fonts/kitface-baked.json", pointSize: baked.pointSize,
        layerFill: lput("fill"), layerStroke: lput("stroke"), layerShadow: lput("shadow"), layerGlints: lput("glints") };
    }
  } catch (e) {
    console.warn("engine export: alphabet face bake failed — kit ships without it", e);
  }

  /* ── manifest ─────────────────────────────────────────────────── */
  const fdef = fontByName(st.cfg.type.font);
  files.push({
    path: "kit-manifest.json",
    data: JSON.stringify({
      kit: st.kitName,
      // idle motion — the kit's resting-state animations (owner spec);
      // the importer wires removable rigs only when these say so
      idle: { wipe: st.cfg.idle?.wipe ? 1 : 0, edge: st.cfg.idle?.edge ? 1 : 0,
        freq: st.cfg.idle?.freq ?? 0, blend: st.cfg.idle?.blend ?? "normal" },
      /* per-piece idle forks (owner: shine on/off per component) — keyed by
         sprite family; -1 follows the kit toggle, 0/1 pin off/on */
      idleForks: Object.entries(st.kitDesigns ?? {}).flatMap(([cid, kd]) => {
        const i = kd?.idle;
        if (!i || (i.wipe === undefined && i.edge === undefined)) return [];
        const fam = KIT_SLICEABLE[cid as KitComponentId] ?? NINE.find((n) => n.id === (cid as KitComponentId))?.family ?? cid;
        return [{ family: fam, wipe: i.wipe === undefined ? -1 : i.wipe ? 1 : 0, edge: i.edge === undefined ? -1 : i.edge ? 1 : 0 }];
      }),
      /* I1 — the slug is this kit's permanent identity in the user's
         project; the importer files everything under it and re-exports
         land on the same paths, so placed UI restyles instead of breaking */
      slug: safeSlug,
      kitVersion: st.kitVersion,
      generatorVersion: typeof __BUILD_STAMP__ === "string" ? __BUILD_STAMP__ : "dev",
      tier: st.scope,
      exported: new Date().toISOString(),
      pngScale: PNG_SCALE,
      /* the health globe's visible well as frame fractions (bottom-left
         origin) — the prefab anchors the cropped liquid here so
         Image.fillAmount 0..1 is visually empty..full, no padding lie */
      globeWell,
      rules: [
        "Nothing replaceable is baked: labels, numbers, values, avatars and swappable icons are live engine content.",
        "Nine-slice assets stretch only their center region; margins below are in PNG pixels at pngScale.",
        "Nine-slice bases are cropped tight to the geometry — no shadow/glow padding baked in. Compose glows and shadows in-engine (fx/fx-drop-shadow.png, fx/fx-glow.png, the states recipe).",
        "<family>-base.9.png = full material (gloss baked); <family>-base-flat.9.png = tintable flat variant for independent effects. Every filename carries its family so search finds it.",
        "Progress = track + fill; slider = track + fill + thumb; toggle = track + thumb; buttons = base + engine text + separate icon.",
        "Rarity: drive the displayed tier from your item data. rarityframe/ ships one pre-tinted frame per tier; the rarity block below carries the tier names and colors for stripes, tier words and glows.",
        "States: interactive pieces ship base-hover/base-pressed/base-disabled — the kit's designed states, same nine-slice as base. Sprite Swap them; hover glow and press lift stay engine-composed.",
      ],
      /* The input's affordance, as NUMBERS rather than baked pixels. The
         renderer draws it at x = (bevel + 4) + 20k from the shell's left
         edge, centred on the well, at 30k — and one SVG px is one prefab
         unit (the sprite rasterizes at pngScale and the prefab divides by
         it again), so these travel straight through. */
      placeholder: (() => {
        const pc = pieceCfg("input");
        const pk = ({ s: 0.72, m: 1, l: 1.22 } as const)[effKitSize(st.kitSizes.input)] ?? 1;
        const pbw = pc.bevel.off ? 0 : pc.bevel.width;
        return {
          text: "Type something…",
          left: Math.round(((pbw + 4) + 20 * pk) * 10) / 10,
          size: Math.round(30 * pk * 10) / 10,
          /* Measured DOWN from the sprite's top edge, because the sprite is
             cropped tight to the geometry and the extrusion hangs below the
             field — so the sprite's middle is NOT the field's middle. The
             importer turns this into a Unity offset once it knows the rect:
             y = rect.height / 2 - centerFromTop. */
          centerFromTop: Math.round(((124 * pk) / 2 + 1 + (pc.type.oy ?? 0) * pk) * 10) / 10,
          color: "#FFFFFF",
          opacity: 55,
          italic: true,
        };
      })(),
      typography: {
        font: st.cfg.type.font,
        source: `https://fonts.google.com/specimen/${encodeURIComponent(st.cfg.type.font).replace(/%20/g, "+")}`,
        googleFontsQuery: fdef?.css ?? null,
        /* the shipped TTF (with its license beside it) — the importer wires
           generated prefab labels to it; null = fetch failed at export
           time, fall back to the source link above */
        fontFile: primaryFontFile,
        /* the styled-text recipe — enough numbers to rebuild the kit's
           display treatment as a TextMeshPro material preset: face fill
           (or vertex gradient), outline, and glow/underlay */
        style: {
          weight: base.type.weight,
          italic: base.type.italic,
          /* prefab label font size in design px — the app scales button
             words by the kit's Type Size dial (52 = baseline); hardcoding
             40 left big-type kits with tiny words (owner: "the text sits
             so small in that area") */
          labelSize: Math.round(40 * (base.type.size / 52) * 10) / 10,
          spacingEmPct: base.type.spacing,
          case: base.type.case,
          fillMode: base.type.fillMode,
          fill: base.type.fill,
          fill2: base.type.fillMode === "gradient" ? base.type.fill2 : null,
          fillOpacity: base.type.fillOpacity ?? 100,
          outline: base.type.outline.on ? { color: base.type.outline.color, color2: base.type.outline.color2, width: base.type.outline.width } : null,
          glow: base.type.glow.on ? { color: base.type.glow.color, size: base.type.glow.size, opacity: base.type.glow.opacity } : null,
          shadow: base.type.shadow.on ? { color: base.type.shadow.color, x: base.type.shadow.x, y: base.type.shadow.y, blur: base.type.shadow.blur, opacity: base.type.shadow.opacity } : null,
          /* the deeper layers — TMP's full Distance Field shader carries
             them as bevel lighting and a face texture */
          emboss: base.type.emboss.on ? { strength: base.type.emboss.strength, distance: base.type.emboss.distance, softness: base.type.emboss.softness } : null,
          lightAngle: base.lighting.angle,
          pattern: patternFile ? { file: patternFile, style: base.type.stripes?.style ?? "stripes", scale: base.type.stripes?.scale ?? 100, angle: patternAngle, reps: Math.round(patternReps * 100) / 100 } : null,
          /* the ONE live-blended layer in the prefab: the Glints ink. Its
             blend mode ships so the importer can pick the matching GlintInk
             blend state — the app's six modes map 1-1 (multiply, screen and
             normal are exact fixed-function; overlay, soft- and hard-light
             ride their closest additive read). Everything else composites
             its blend INTO baked pixels and needs no runtime story. */
          glintBlend: base.type.glints?.on ? (base.type.glints.blend ?? "overlay") : null,
          /* the LIVE FIELD recipe (owner: "one graphic, not a bunch of
             little letters"): the GlintInk shader draws the band across the
             whole word in label space; these are the knobs it needs — the
             kit's style, opacity and nudges, plus the key light's direction
             in app coordinates (y down). Bands never bake into glyphs. */
          glintStyle: base.type.glints?.on ? (base.type.glints.style ?? "slab") : null,
          glintOpacity: base.type.glints?.on ? (base.type.glints.opacity ?? 55) : 0,
          glintOx: base.type.glints?.on ? (base.type.glints.ox ?? 0) : 0,
          glintOy: base.type.glints?.on ? (base.type.glints.oy ?? 0) : 0,
          glintLx: Math.cos((((base.lighting.angle % 360) + 360) % 360) * Math.PI / 180),
          glintLy: -Math.sin((((base.lighting.angle % 360) + 360) % 360) * Math.PI / 180),
        },
        /* per-state text ink — the kit's OWN state recipes for live labels
           (owner field report: the face swaps on press but "the text isn't
           following the face" — e.g. a down state that flips the gradient).
           Only states whose designed fork actually changes the ink are
           listed; the importer wires a Label State Ink component that
           applies them in sync with the Button's Sprite Swap. */
        stateStyles: (["hover", "pressed", "disabled"] as const).flatMap((sn) => {
          const f = base.stateDesigns[sn];
          if (!f) return [];
          /* ink entry only when the fork EXPLICITLY changes the text ink
             (designFor: absent .type mirrors the master live) */
          const t = f.type, b = base.type;
          const inkOk = !!t && (t.fillMode === "solid" || t.fillMode === "gradient")
            && !(t.fillMode === b.fillMode && t.fill === b.fill && (t.fillMode !== "gradient" || t.fill2 === b.fill2));
          /* the label RIDES THE FACE: a state that forks its extrusion depth
             sinks/lifts the face top by the delta and the app's label moves
             with it — the owner's Miami pressed state (23 -> 9) is exactly
             this, no ink change at all ("type is not following face") */
          const dy = f.candy ? Math.round((base.candy.extrusion.depth - f.candy.extrusion.depth) * 10) / 10 : 0;
          if (!inkOk && !dy) return [];
          return [{ state: sn, fillMode: inkOk ? t!.fillMode : null, fill: inkOk ? t!.fill : null, fill2: inkOk && t!.fillMode === "gradient" ? t!.fill2 : null, dy }];
        }),
        /* the baked color font — atlas + metrics the importer assembles
           into "KitFace Baked": app-exact glyphs for hero/display text */
        bakedFace,
        note: "Render all labels as live engine text in this face.",
      },
      /* highlight = the app's bloom/aura ink: lighting tint FIRST, Highlight
         role as fallback (bevel's hiC) — emitting only the Highlight left
         tinted-light kits with neutral gray auras in Unity (owner: "the
         glows underneath the components are rendering weird") */
      /* per-FAMILY label state ink: the maker may fork the text on one
         specific button (a piece-scope down state), not the master — the
         master-level typography.stateStyles above would miss it. Same
         qualification rules; family entries win over the master set. */
      /* The hover GLOW and press LIFT, per family. These are the two moves
         the app makes on a state that the sprite deliberately doesn't
         carry: the glow is a soft halo that would blow up the sprite's
         bounds and can't nine-slice, and the lift is a transform. Without
         them a Unity rollover is a quiet face swap — the piece changes but
         nothing announces it (owner: "I'm not getting the glows on hover…
         it's impossible for me to know" whether it hovered at all). */
      stateFx: ([["primary", "button-primary"], ["secondary", "button-secondary"], ["small", "button-small"],
                 ["chip", "chip"], ["tab", "tab"], ["tabback", "tab-back"], ["datarow", "list-row"], ["slot", "item-slot"],
                 ["iconbtn", "iconbtn"], ["checkbox", "checkbox"], ["radio", "radio"],
                 /* the props announce their states too (owner: "settings
                    gear doesn't work on play", "trophy states aren't in") —
                    glow + lift ride the same engine recipe as the buttons */
                 ["gearicon", "gearicon"], ["trophyicon", "trophyicon"], ["gifticon", "gifticon"],
                 ["firebutton", "firebutton"], ["endturn", "endturn"], ["keycap", "keycap"], ["pricebtn", "pricebtn"]] as const).flatMap(([pid, fam]) => {
        const ps = pieceCfg(pid).states;
        return (["default", "hover", "pressed", "disabled"] as const).map((sn) => ({
          family: fam,
          state: sn,
          // a disabled piece never glows, whatever the dial says — the
          // renderer forces it to zero too, and a glowing dead button is
          // the wrong signal in any kit
          glow: sn === "disabled" ? 0 : Math.round(ps[sn].glow),
          /* RELATIVE to the resting state, and that matters: most kits set
             the same lift on all four (Miami is -8 across the board), so
             shipping the absolute number would shove every button off the
             spot the designer put it in the moment the scene woke up. The
             delta is the only part Unity can use. Positive is UP, Unity's
             convention — the app measures the other way. */
          lift: Math.round((ps.default.lift - ps[sn].lift) * 10) / 10,
        }));
      }),
      labelStates: ([["primary", "button-primary"], ["secondary", "button-secondary"], ["small", "button-small"], ["chip", "chip"], ["tab", "tab"], ["tabback", "tab-back"]] as const).flatMap(([pid, fam]) => {
        const pc = pieceCfg(pid);
        return (["hover", "pressed", "disabled"] as const).flatMap((sn) => {
          const f = pc.stateDesigns[sn];
          if (!f) return [];
          const t = f.type, b2 = pc.type;
          const inkOk = !!t && (t.fillMode === "solid" || t.fillMode === "gradient")
            && !(t.fillMode === b2.fillMode && t.fill === b2.fill && (t.fillMode !== "gradient" || t.fill2 === b2.fill2));
          const dy = f.candy ? Math.round((pc.candy.extrusion.depth - f.candy.extrusion.depth) * 10) / 10 : 0;
          if (!inkOk && !dy) return [];
          return [{ family: fam, state: sn, fillMode: inkOk ? t!.fillMode : null, fill: inkOk ? t!.fill : null, fill2: inkOk && t!.fillMode === "gradient" ? t!.fill2 : null, dy }];
        });
      }),
      /* per-family label sizes, the APP'S OWN formula (owner: "make sure
         these sizes correlate to what we output from the app"): each
         family's geometry font size x the kit-size factor x the Type Size
         dial over its 52 baseline — the same three numbers renderKit uses */
      labelSizes: ([["primary", "button-primary", 42], ["secondary", "button-secondary", 42], ["small", "button-small", 32], ["chip", "chip", 28], ["tab", "tab", 30], ["tabback", "tab-back", 30], ["header", "header-banner", 46]] as const).map(([pid, fam, fs]) => {
        const pc = pieceCfg(pid);
        const sk = ({ s: 0.72, m: 1, l: 1.22 } as const)[effKitSize(st.kitSizes[pid])] ?? 1; // bevel's SIZE_K
        /* x0.74 fit factor: the app WIDENS its shell to the word, a Unity
           rect is fixed — the raw app size crowds it. Owner-calibrated in
           three field passes ("too big" at 1.0/0.78, "too much vertical
           space" at 0.70 — the middle ground); per-font taste stays a
           per-label Inspector edit. */
        /* `scene` is the UNFITTED app-true size: a board copy's rect IS
           the app's shell, sized to those very words, so scenes restore
           full size (owner: "the buttons seem to change so much" — the
           0.74 prefab fit shrank every placed word by a quarter) */
        return { family: fam, size: Math.round(fs * sk * (pc.type.size / 52) * 0.74 * 10) / 10, scene: Math.round(fs * sk * (pc.type.size / 52) * 10) / 10 };
      }),
      /* markInk/radioInk — the SELECTED-mark tint for the wired Toggles,
         renderKit's own chain: the piece's Pressed-state icon color, else
         its main icon color, else the Glow role (owner: recolor the check
         "without having to change the glow color") */
      palette: { bevel: bevelC, glow: glowC, innerFill: innerC, well: wellC, highlight: base.lighting.tint ?? base.effects.Highlight ?? "#FFFFFF", shadow: base.effects.Shadow ?? darken(bevelC, 0.5),
        markInk: (() => { const pc = pieceCfg("checkbox"); return pc.stateDesigns?.pressed?.icon?.color ?? pc.icon.color ?? glowC; })(),
        radioInk: (() => { const pc = pieceCfg("radio"); return pc.stateDesigns?.pressed?.icon?.color ?? pc.icon.color ?? glowC; })() },
      /* the resting aura around pieces (app: candy.bloom) — deliberately NOT
         baked into sprites (auras overlap what's behind them), composed
         engine-side from fx/glow.png; the Playground shows the pattern */
      bloom: { opacity: base.candy.bloom?.opacity ?? 0, size: base.candy.bloom?.size ?? 0 },
      ...(full ? {
        rarity: {
          note: "This kit's five-tier ladder, lowest to highest — names and colors are the maker's own (custom edits included). Pick the tier from your item data: frame = assets/rarityframe/rarityframe-<tier>.png, stripe/glow/tier-word color = the tier's color, tier word = live engine text.",
          tiers: tiersR.map((t, i) => ({ index: i, name: t.name, color: t.c })),
        },
      } : {}),
      /* Boards→Scenes (Pro): the maker's artboards — the importer builds a
         ready scene per board, per-copy words on live labels, zone-anchored.
         Emitted on the FULL scope only: a remix never exits the browser on
         the free tier (commercial-architecture.md). */
      ...(full && st.boards?.length ? {
        boards: st.boards.map((b) => ({
          name: b.name, w: b.w, h: b.h,
          bg: b.bg ? { file: b.bg.file, opacity: b.bg.opacity, blur: b.bg.blur, saturation: b.bg.saturation, hue: b.bg.hue, brightness: b.bg.brightness, contrast: b.bg.contrast, noise: b.bg.noise, overlay: b.bg.overlay, overlayStrength: b.bg.overlayStrength, overlayBlend: b.bg.overlayBlend, original: b.bg.original } : null,
          items: b.items,
        })),
      } : {}),
      assets: manifest,
    }, null, 2),
  });
  if (full && st.boards?.length) {
    for (const b of st.boards) {
      if (b.bg) files.push({ path: b.bg.file, data: b.bg.bytes });
      for (const sf of b.stampFiles) files.push({ path: sf.file, data: sf.bytes });
    }
  }

  /* ── Unity: the importer IS the product's second half. It applies
     borders/pivots idempotently, keeps the I1–I5 overwrite contract, and
     GENERATES wired example prefabs on first import (a text prefab cannot
     carry sprite GUIDs, so the old drag-the-sprite examples are gone —
     the importer builds real ones with real references instead). ── */
  /* illustrated docs, drawn from THIS kit (never stock art) — a failed
     rasterization just means a text-only README, never a failed export */
  let figs: { path: string; data: Uint8Array }[] = [];
  try { figs = await readmeFigures(base); } catch { figs = []; }
  for (const f of figs) files.push(f);
  files.push({ path: "UNITY-README.md", data: unityReadme(st, !!primaryFontFile, bakedFace != null, figs.length > 0) });
  files.push({ path: "Editor/PatternBreakKitImporter.cs", data: UNITY_IMPORTER });
  /* assembly definitions — the kit's scripts compile into their OWN
     assemblies. Without these, a second copy of the kit anywhere in the
     project (a drop into an open subfolder, an unmerged macOS folder)
     lands duplicate classes in Assembly-CSharp-Editor: CS0101, the WHOLE
     editor assembly dies, and Unity silently keeps running stale code
     while every tool looks alive (field: boards fell apart, rebuilds did
     nothing — a full kit copy sat inside TextMesh Pro/Examples). With
     asmdefs a duplicate only fails OUR assembly, the Console names both
     folders, and the rest of the project keeps compiling. */
  files.push({
    path: "Editor/PatternBreak.Editor.asmdef",
    data: JSON.stringify({
      name: "PatternBreak.Editor",
      rootNamespace: "",
      /* Unity.InputSystem: the scene builder's EventSystem wiring is
         #if ENABLE_INPUT_SYSTEM — the reference resolves when the package
         is installed and is silently ignored when it isn't. Omitting it
         broke EVERY new-Input-System project (field: CS0234 on a fresh
         Unity 6 project, nothing imported). */
      references: ["PatternBreak.Runtime", "Unity.TextMeshPro", "UnityEngine.UI", "Unity.InputSystem"],
      includePlatforms: ["Editor"],
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    }, null, 2),
  });
  files.push({
    path: "Runtime/PatternBreak.Runtime.asmdef",
    data: JSON.stringify({
      name: "PatternBreak.Runtime",
      rootNamespace: "",
      references: ["Unity.TextMeshPro", "UnityEngine.UI"],
      includePlatforms: [],
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    }, null, 2),
  });
  files.push({ path: "Runtime/PatternBreakHeroLabel.cs", data: HERO_LABEL_RUNTIME });
  files.push({ path: "Runtime/PatternBreakLabelStateInk.cs", data: LABEL_STATE_INK_RUNTIME });
  files.push({ path: "Runtime/PatternBreakTouchStick.cs", data: TOUCH_STICK_RUNTIME });
  files.push({ path: "Runtime/PatternBreakSwitchGlide.cs", data: SWITCH_GLIDE_RUNTIME });
  files.push({ path: "Runtime/PatternBreakFireButton.cs", data: FIREBUTTON_RUNTIME });
  files.push({ path: "Runtime/PatternBreakBoardRigs.cs", data: BOARD_RIGS_RUNTIME });
  files.push({ path: "Runtime/PatternBreakClaimBurst.cs", data: CLAIMBURST_RUNTIME });
  files.push({ path: "Runtime/PatternBreakInvGrid.cs", data: INVGRID_RUNTIME });
  files.push({ path: "Runtime/PatternBreakCountdownLabel.cs", data: COUNTDOWN_RUNTIME });
  files.push({ path: "Runtime/PatternBreakIdleShine.cs", data: IDLE_SHINE_RUNTIME });
  files.push({ path: "Runtime/PatternBreakPopNumber.cs", data: POP_NUMBER_RUNTIME });
  files.push({ path: "Runtime/PatternBreakRadarDemo.cs", data: RADAR_DEMO_RUNTIME });
  files.push({ path: "Runtime/PatternBreakSeasonTrack.cs", data: SEASON_TRACK_RUNTIME });
  files.push({ path: "Runtime/PatternBreakStateFx.cs", data: STATE_FX_RUNTIME });
  files.push({ path: "Runtime/UIKitGlintInk.shader", data: GLINT_INK_SHADER });

  /* ── OPTIONAL packed atlas — produced last, catalog only ──────── */
  if (full && catalog) {
    const cat = await catalog().catch(() => null);
    if (cat) files.push({ path: "atlas/catalog.png", data: cat });
    files.push({ path: "atlas/README.md", data: "The packed sheet is a VISUAL CATALOG for humans.\nDo not slice it for engine use — build from /assets and kit-manifest.json instead.\n" });
    onProgress?.(pngQueue.length + 1, pngQueue.length + 1, "zip");
  }

  /* paperwork — the recipe by hand, the machine file, the font terms */
  files.push({ path: "README.md", data: kitSpecMarkdown(st.cfg, st.kitName) + "\n" + fontNotesMarkdown(kitFontFamilies(st.cfg)) });
  files.push({ path: "settings.json", data: JSON.stringify(st.cfg, null, 2) });
  if (licence) files.push({ path: "LICENCE.txt", data: licence });

  /* ── I1: everything lives under UIKitMaker/<slug>/ INSIDE the zip, so
     "extract into Assets/" is the whole install — and extracting a later
     export over the same spot is the whole update. .meta files (Unity's
     identity records) live beside each file and are never in the zip, so
     GUIDs survive every overwrite and placed UI restyles in place. ── */
  /* the importer ships OUTSIDE the slug folder — one shared copy at
     UIKitMaker/Editor/ serving every kit. Per-slug copies would compile
     duplicate PatternBreak types into Assembly-CSharp-Editor the moment a
     user installs a second kit (CS0101 — the whole editor assembly dies).
     Its content is kit-independent, so every kit's zip overwrites the same
     file byte-for-byte, and Apply() already walks ALL manifests. */
  const sharedScripts = new Set([
    "Editor/PatternBreakKitImporter.cs",
    "Editor/PatternBreak.Editor.asmdef", "Runtime/PatternBreak.Runtime.asmdef",
    "Runtime/PatternBreakHeroLabel.cs", "Runtime/PatternBreakLabelStateInk.cs",
    "Runtime/PatternBreakTouchStick.cs", "Runtime/PatternBreakSeasonTrack.cs",
    "Runtime/PatternBreakSwitchGlide.cs", "Runtime/PatternBreakFireButton.cs",
    "Runtime/PatternBreakBoardRigs.cs", "Runtime/PatternBreakCountdownLabel.cs",
    "Runtime/PatternBreakPopNumber.cs", "Runtime/PatternBreakRadarDemo.cs",
    "Runtime/PatternBreakClaimBurst.cs", "Runtime/PatternBreakInvGrid.cs",
    "Runtime/PatternBreakStateFx.cs", "Runtime/UIKitGlintInk.shader",
    /* the idle-shine runtime is SHARED like every other runtime script —
       it missed this list on its first ship, landed per-slug OUTSIDE the
       PatternBreak.Runtime assembly, and the shared Editor importer could
       not resolve WipeShine/EdgeShine (field: CS0246, "latest kit export
       isn't firing in unity" — the whole importer died). */
    "Runtime/PatternBreakIdleShine.cs",
  ]);
  const rooted = files.map((f) => ({
    ...f,
    path: sharedScripts.has(f.path) ? `UIKitMaker/${f.path}` : `UIKitMaker/${safeSlug}/${f.path}`,
  }));
  download(`${safeSlug}-engine-kit.zip`, makeZip(rooted));
  setEmbedFont("", null); // don't leak the embed into unrelated rasterizations
}

/* ── the alphabet bake ──────────────────────────────────────────────
   Self-calibrating: an ink-only "H" (all fx stripped) pins where the pen
   and baseline sit in specimen coordinates; canvas measureText supplies
   the font-true advances; then every glyph renders with the FULL
   treatment and its art box is placed relative to that pen. No guessing
   about effect bleed — the calibration render IS the reference. */
const BAKE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,:;%+-'&()";
const BAKE_S = 3; // raster scale over the 52px specimen em → 156px baked em

async function rasterCanvas(svg: string, scale: number): Promise<HTMLCanvasElement> {
  const full = await svgToPngBytes(svg, scale);
  const img = await createImageBitmap(new Blob([full.bytes.buffer as ArrayBuffer], { type: "image/png" }));
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  cv.getContext("2d")!.drawImage(img, 0, 0);
  return cv;
}
function scanInk(cv: HTMLCanvasElement): { cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number } | null {
  const px = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let yy = 0; yy < cv.height; yy++)
    for (let xx = 0; xx < cv.width; xx++)
      if (px[(yy * cv.width + xx) * 4 + 3] > 8) {
        if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
      }
  if (x1 < 0) return null; // nothing opaque (space)
  return { cv, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
async function rasterInk(svg: string, scale: number): Promise<{ cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number } | null> {
  return scanInk(await rasterCanvas(svg, scale));
}

// exported for direct verification — the bake runs headless-testable this way
/* Idle motion: the edge-shine spark needs the silhouette to walk. The
   rendered svg's face clip IS that outline — flattened, the largest loop
   resampled to 48 even arc-length stations, stored as full-image
   fractions (y down) so the Unity runtime maps them straight through the
   piece's rect. Sampled only on base sprites, only when the kit turned
   the idle edge on. */
function sampleOutline(svg: string): number[] | null {
  const fc = /<clipPath id="[A-Za-z0-9]+fc"><path d="([^"]+)"/.exec(svg);
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!fc || !vb) return null;
  const loops = flattenPath(fc[1], 10);
  if (!loops.length) return null;
  const P = (pt: unknown): [number, number] => Array.isArray(pt) ? [pt[0], pt[1]] : [(pt as { x: number }).x, (pt as { y: number }).y];
  const loop = loops.reduce((a, b) => (b.length > a.length ? b : a)).map(P);
  if (loop.length < 3) return null;
  const seg: number[] = [0];
  for (let i = 1; i <= loop.length; i++) {
    const a = loop[i - 1], b = loop[i % loop.length];
    seg.push(seg[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = seg[seg.length - 1];
  if (!total) return null;
  const [, x0s, y0s, ws, hs] = vb;
  const x0 = +x0s, y0 = +y0s, w = +ws, h = +hs;
  const N = 48, out: number[] = [];
  for (let k = 0; k < N; k++) {
    const d = (k / N) * total;
    let i = 1;
    while (i < seg.length - 1 && seg[i] < d) i++;
    const t = (d - seg[i - 1]) / Math.max(1e-6, seg[i] - seg[i - 1]);
    const a = loop[i - 1], b = loop[i % loop.length];
    out.push(+(((a[0] + (b[0] - a[0]) * t) - x0) / w).toFixed(4), +(((a[1] + (b[1] - a[1]) * t) - y0) / h).toFixed(4));
  }
  return out;
}

export async function bakeAlphabetFace(base: GenConfig): Promise<{ png: Uint8Array; layerPngs: { fill?: Uint8Array; stroke?: Uint8Array; shadow?: Uint8Array; glints?: Uint8Array } | null; metrics: string; pointSize: number } | null> {
  const family = base.type.font;
  const weight = base.type.weight;
  const italicPfx = base.type.italic ? "italic " : "";
  const fontStr = `${italicPfx}${weight} 52px "${family}"`;
  try { await document.fonts.load(fontStr); } catch { /* measure with what's there */ }
  const mcv = document.createElement("canvas");
  const mx = mcv.getContext("2d")!;
  mx.font = fontStr;
  const fmRef = mx.measureText("Hg");
  const ascent = (fmRef.fontBoundingBoxAscent ?? 41) * BAKE_S;
  const descent = (fmRef.fontBoundingBoxDescent ?? 11) * BAKE_S;

  
/* the type effects' full blur reach, reserved on EVERY bake render — the
     specimen svg says overflow:visible, but a raster clips at the canvas
     edge, and a strong glow baked a hard-edged slab into each glyph cell
     (owner, Unity: "any way to prevent this clipping on the glow?"). The
     SAME pad goes to the calibration render too, so pen/baseline and every
     variant stay in one coordinate frame. The glow reach is FOUR sigma —
     the live filter region rides fs-slack past its 3-sigma envelope, but a
     baked cell crops hard at its edge, and 3-sigma still carries ~1% of
     peak there: a visible line (dev field report: the falloff "gets cut
     off pretty abruptly"). Past 4-sigma the residual is ~0.01% — the shell
     blurs' precedent. Shadow keeps the engine's own margin. */
  const fxPad = Math.ceil(Math.max(
    base.type.glow.on ? base.type.glow.size * 0.8 * 4 : 0,
    base.type.shadow.on ? Math.abs(base.type.shadow.x) + Math.abs(base.type.shadow.y) + base.type.shadow.blur * 1.5 : 0,
  ));

  // calibration: ink-only H → pen x and baseline y in raster coordinates
  const strip = (c: GenConfig) => {
    c.type.size = 52;
    c.type.outline.on = false; c.type.shadow.on = false;
    c.type.glow.on = false; c.type.emboss.on = false;
    c.type.stripes = undefined; c.type.glints = undefined;
  };
  const calBox = await rasterInk(renderTypeSpecimen(base, "H", { keepCase: true, highlight: "", mutate: strip, fxPad }), BAKE_S);
  if (!calBox) return null;
  const hMet = mx.measureText("H");
  const penX = calBox.x0 + (hMet.actualBoundingBoxLeft ?? 0) * BAKE_S;
  const baseY = calBox.y0 + (hMet.actualBoundingBoxAscent ?? ascent / BAKE_S) * BAKE_S;

  type Baked = { u: number; adv: number; bx: number; by: number; w: number; h: number; cv?: HTMLCanvasElement; sx?: number; sy?: number; x?: number; y?: number };
  /* four treatments per glyph:
     - full: the solo face (everything) — what a single KitFace Baked shows
     - fill: fill + pattern + glints + emboss, NO stroke/shadow/glow
     - stroke: outline + glow only — NO shadow (owner: per-glyph shadows
       painted seams onto neighboring strokes)
     - shadow: the pure cast shadow, isolated by rendering the stroked
       glyph WITH and WITHOUT its shadow and subtracting — one soft
       app-exact shadow layer that sits behind the whole stroke badge
     Shadow → Stroke → Fill stacked reproduces the app's paint order:
     one universal shadow, all strokes merged, no stroke over a fill. */
  const strokeBase = (c: GenConfig) => {
    c.type.size = 52; c.type.fillOpacity = 0;
    c.type.stripes = undefined; c.type.glints = undefined; c.type.emboss.on = false;
  };
  type VKey = "full" | "fill" | "stroke" | "glints";
  /* the GLINTS layer went LIVE (owner, field report with the app/Unity
     side-by-side: "the glint should be one graphic, not a bunch of little
     letters"). No band ever bakes into a glyph again: each glints cell
     carries only (a) the letterform as a HALF-ALPHA white mask and (b) its
     seeded star sparks at full alpha. The GlintInk shader decodes the two
     by alpha level and draws the band itself — the kit's real recipe, one
     sweep across the whole word in label space, tilted by the kit's light.
     Fill stays the pure letterform: it is also the feather's reference box. */
  const variants: { key: VKey; mutate: (c: GenConfig) => void }[] = [
    { key: "full", mutate: (c) => { c.type.size = 52; } },
    // fill drops glints too — the dedicated Glints layer carries them in
    // the HeroLabel stack (baking them into Fill would double them)
    { key: "fill", mutate: (c) => { c.type.size = 52; c.type.outline.on = false; c.type.shadow.on = false; c.type.glow.on = false; c.type.glints = undefined; } },
    { key: "stroke", mutate: (c) => { strokeBase(c); c.type.shadow.on = false; } },
    /* solid-white letterform at FULL alpha = the mask, nothing else: the
       shader multiplies its live band by this alpha, and the stars ride
       HeroLabel's full-word quad (no texture at all). Glints OFF renders
       nothing — no layer ships, exactly as before. */
    { key: "glints", mutate: (c) => { c.type.size = 52; c.type.outline.on = false; c.type.shadow.on = false; c.type.glow.on = false; c.type.emboss.on = false; c.type.stripes = undefined; if (!c.type.glints?.on) { c.type.fillOpacity = 0; } else { c.type.fillMode = "solid"; c.type.fill = "#FFFFFF"; c.type.fillOpacity = 100; } c.type.glints = undefined; } },
  ];
  const sets: Record<VKey | "shadow", Baked[]> = { full: [], fill: [], stroke: [], glints: [], shadow: [] };
  const hasShadow = !!base.type.shadow.on;
  const spacingPx = 52 * ((base.type.spacing ?? 0) / 100) * BAKE_S;
  /* KERNING PAIRS (owner: "look at how far away the Y is from the other
     letterforms"): per-glyph advances can't carry the pair adjustments
     the browser applies (A·Y, L·T, …). Measure every pair against its
     glyphs' solo widths and ship the non-zero deltas; the importer
     writes them into TMP's pair-adjustment table so Unity spaces baked
     pairs exactly like the app. Same units as the advances. */
  const kerning: { l: number; r: number; k: number }[] = [];
  {
    const solo = new Map<string, number>();
    for (const ch of BAKE_GLYPHS) solo.set(ch, mx.measureText(ch).width);
    for (const a of BAKE_GLYPHS) for (const b of BAKE_GLYPHS) {
      const kp = mx.measureText(a + b).width - solo.get(a)! - solo.get(b)!;
      if (Math.abs(kp) > 0.1) kerning.push({ l: a.codePointAt(0)!, r: b.codePointAt(0)!, k: Math.round(kp * BAKE_S * 10) / 10 });
    }
  }
  for (const ch of BAKE_GLYPHS + " ") {
    const adv = mx.measureText(ch).width * BAKE_S + spacingPx;
    if (ch === " ") {
      for (const k of ["full", "fill", "stroke", "glints", "shadow"] as const)
        sets[k].push({ u: 32, adv, bx: 0, by: 0, w: 0, h: 0 });
      continue;
    }
    const u = ch.codePointAt(0)!;
    /* seeded glint variation (owner: stars on EVERY letter read as
       repetition). Per-glyph seed: ~1/3 of glyphs get one star at a
       scattered spot — so typed words read sprinkled, not stamped. The
       Glints layer's BAND never bakes here anymore (the shader draws it
       across the whole word); the solo "full" face keeps its own 3x-wide
       slab so it stays self-contained. Kits with glints off untouched. */
    const h32 = (u * 2654435761) >>> 0;
    const rnd = (k: number) => ((h32 >>> (k * 7)) & 127) / 127;
    const glintStars = rnd(0) < 0.36
      ? [{ f: 0.12 + rnd(1) * 0.72, dy: (rnd(2) - 0.5) * 0.56, s: 0.08 + rnd(3) * 0.09, r: rnd(1) * 44 - 22 }]
      : null;
    const push = (key: VKey | "shadow", box: { cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number } | null) => {
      if (!box) return;
      sets[key].push({
        u, adv,
        bx: box.x0 - penX, by: baseY - box.y0,
        w: box.w, h: box.h, cv: box.cv, sx: box.x0, sy: box.y0,
      });
    };
    for (const v of variants) {
      const box = await rasterInk(
        renderTypeSpecimen(base, ch, {
          keepCase: true, highlight: "", mutate: v.mutate, fxPad,
          // the mask cell strips glints in its mutate — band and stars are
          // the shader's job now, one field across the whole word. Only the
          // self-contained solo face still normalizes its own per-glyph glint.
          glintBand: v.key === "full" ? 3 : undefined,
          glintStars: v.key === "full" ? glintStars : undefined,
        }),
        BAKE_S,
      );
      if (v.key === "stroke" && box && hasShadow) {
        // shadow isolation: (stroke + shadow) minus (stroke) = the shadow
        const withSh = await rasterCanvas(
          renderTypeSpecimen(base, ch, { keepCase: true, highlight: "", mutate: strokeBase, fxPad }),
          BAKE_S,
        );
        const wcx = withSh.getContext("2d")!;
        wcx.globalCompositeOperation = "destination-out";
        wcx.drawImage(box.cv, 0, 0);
        wcx.globalCompositeOperation = "source-over";
        push("shadow", scanInk(withSh));
      }
      push(v.key, box); // a face without this glyph — skip, TMP falls back
    }
  }
  if (sets.full.length < 10) return null; // face never loaded — don't ship garbage

  // shelf-pack into a 2048-wide atlas, tallest first for tight rows
  const PAD = 2;
  const AW = 2048;
  const pack = (list: Baked[]): number | null => {
    const order = list.filter((g) => g.w > 0).sort((a, b) => b.h - a.h);
    let cx = PAD, cy = PAD, rowH = 0;
    for (const g of order) {
      if (cx + g.w + PAD > AW) { cx = PAD; cy += rowH + PAD; rowH = 0; }
      g.x = cx; g.y = cy;
      cx += g.w + PAD;
      if (g.h > rowH) rowH = g.h;
    }
    const AH = cy + rowH + PAD;
    return AH > 4096 ? null : AH; // absurd treatment size — bail rather than truncate
  };
  /* Guaranteed fade-out: a glyph's glow/shadow slab must reach ZERO alpha
     inside its own cell — quads butt in the mesh, and a slab still carrying
     ink at the crop line renders as a hard-edged plate around the word
     (owner: "the color has to fade out completely on the outside edge of
     the first and last letters and the tops and bottoms of all letters").
     The letterform's own box says how much of each cell is effect slab; the
     slab's outer stretch (beyond KEEP, which shelters the outline and the
     falloff's bright core) eases to zero with a smoothstep. Cells with no
     slab — plain or outline-only faces — pass through untouched, and
     between letters the neighbors' feathered slabs crossfade instead of
     butting. No dial gets capped; the bake just finishes the fade. */
  const FEATHER_KEEP = 12 * BAKE_S;
  type Slab = { l: number; t: number; r: number; b: number };
  const featherCell = (g: Baked, m: Slab): HTMLCanvasElement | null => {
    /* the shelter yields when the slab is modest: the fixed KEEP on a
       ~40px slab left a below-minimum zone, so mid-size glows shipped
       with their hard crop edge intact (dev field report: the falloff
       "gets cut off pretty abruptly"). The zone now claims up to 8px·S
       or 40% of the slab — whichever is smaller — whenever the full
       shelter would starve it; truly tiny slabs still pass untouched. */
    const zone = (mm: number) => Math.max(mm - FEATHER_KEEP, Math.min(8 * BAKE_S, mm * 0.4));
    const zl = Math.max(0, zone(m.l)), zr = Math.max(0, zone(m.r));
    const zt = Math.max(0, zone(m.t)), zb = Math.max(0, zone(m.b));
    const Z = 4 * BAKE_S; // a zone thinner than this can't fade convincingly
    if (zl < Z && zr < Z && zt < Z && zb < Z) return null;
    const out = document.createElement("canvas");
    out.width = g.w; out.height = g.h;
    const ox = out.getContext("2d")!;
    ox.drawImage(g.cv!, g.sx!, g.sy!, g.w, g.h, 0, 0, g.w, g.h);
    const id = ox.getImageData(0, 0, g.w, g.h);
    const px = id.data;
    const ramp = (d: number, z: number) => { if (z < Z) return 1; const t = Math.min(1, d / z); return t * t * (3 - 2 * t); };
    for (let y = 0; y < g.h; y++) {
      const ay = Math.min(ramp(y, zt), ramp(g.h - 1 - y, zb));
      for (let x = 0; x < g.w; x++) {
        const a = Math.min(ay, ramp(x, zl), ramp(g.w - 1 - x, zr));
        if (a < 1) px[(y * g.w + x) * 4 + 3] *= a;
      }
    }
    ox.putImageData(id, 0, 0);
    return out;
  };
  const rasterAtlas = (list: Baked[], AH: number, slabs?: Map<number, Slab>): Promise<Uint8Array> => {
    const atlas = document.createElement("canvas");
    atlas.width = AW; atlas.height = AH;
    const ax = atlas.getContext("2d")!;
    for (const g of list) if (g.w > 0) {
      const m = slabs?.get(g.u);
      const fc = m ? featherCell(g, m) : null;
      if (fc) ax.drawImage(fc, g.x!, g.y!);
      else ax.drawImage(g.cv!, g.sx!, g.sy!, g.w, g.h, g.x!, g.y!, g.w, g.h);
    }
    return new Promise((resolve, reject) => {
      atlas.toBlob(async (b) => {
        if (!b) { reject(new Error("atlas raster failed")); return; }
        resolve(new Uint8Array(await b.arrayBuffer()));
      }, "image/png");
    });
  };

  /* the letterform's own ink boxes, captured BEFORE the union pass rewrites
     them — each cell's slab margins = how far its effects reach past the
     letter, and that is the room the feather may use */
  const fillBox = new Map(sets.fill.filter((g) => g.w > 0 && g.cv).map((g) => [g.u, { sx: g.sx!, sy: g.sy!, w: g.w, h: g.h }]));
  const slabsVs = (list: Baked[]): Map<number, Slab> => {
    const m = new Map<number, Slab>();
    for (const g of list) {
      const f = fillBox.get(g.u);
      if (!f || g.w <= 0) continue;
      m.set(g.u, {
        l: Math.max(0, f.sx - g.sx!), t: Math.max(0, f.sy - g.sy!),
        r: Math.max(0, (g.sx! + g.w) - (f.sx + f.w)), b: Math.max(0, (g.sy! + g.h) - (f.sy + f.h)),
      });
    }
    return m;
  };

  const fullH = pack(sets.full);
  if (fullH == null) return null;
  const png = await rasterAtlas(sets.full, fullH, slabsVs(sets.full));

  /* ── ONE SKELETON, FOUR SKINS (owner: "think about a foolproof way to
     bind these together"). Every glyph's four layer variants are packed
     in the UNION of their ink boxes, so all four textures share identical
     rects, bearings and advances — the importer builds ONE font asset
     (one kerning table, one Glyph Adjustment Table) and four materials
     that differ only in texture. The layers become incapable of
     disagreeing about layout; the whole face-to-face sync class of bugs
     (torn strokes, half-applied pairs, stale re-flows) has nothing left
     to act on. All variants render on the same specimen grid, so the
     union is box arithmetic and each atlas crops from the variant's
     existing canvas — no re-rendering. */
  const LAYER_KEYS = ["fill", "stroke", "shadow", "glints"] as const;
  const byU = (list: Baked[]) => new Map(list.map((g) => [g.u, g]));
  const maps = { fill: byU(sets.fill), stroke: byU(sets.stroke), shadow: byU(sets.shadow), glints: byU(sets.glints) };
  const skeleton: Baked[] = [];
  for (const ch of BAKE_GLYPHS + " ") {
    const u = ch.codePointAt(0)!;
    const present = LAYER_KEYS.map((k) => maps[k].get(u)).filter((g): g is Baked => !!g);
    if (!present.length) continue;
    const inked = present.filter((g) => g.w > 0);
    if (!inked.length) { skeleton.push(present[0]); continue; } // the space: advance only
    const ux0 = Math.min(...inked.map((g) => g.sx!));
    const uy0 = Math.min(...inked.map((g) => g.sy!));
    const ux1 = Math.max(...inked.map((g) => g.sx! + g.w));
    const uy1 = Math.max(...inked.map((g) => g.sy! + g.h));
    const skel: Baked = { u, adv: present[0].adv, bx: ux0 - penX, by: baseY - uy0, w: ux1 - ux0, h: uy1 - uy0 };
    skeleton.push(skel);
    for (const g of inked) { g.sx = ux0; g.sy = uy0; g.w = skel.w; g.h = skel.h; g.bx = skel.bx; g.by = skel.by; }
  }
  const layersH = pack(skeleton);
  const layerPngs: { fill?: Uint8Array; stroke?: Uint8Array; shadow?: Uint8Array; glints?: Uint8Array } = {};
  if (layersH != null) {
    for (const skel of skeleton)
      for (const k of LAYER_KEYS) { const g = maps[k].get(skel.u); if (g) { g.x = skel.x; g.y = skel.y; } }
    /* a set with only the space entry means the kit has that layer OFF.
       stroke (outline + glow) and shadow carry the blurred slabs — they
       feather; fill is the letterform and glints fuse across letters by
       design, so both ship exact. */
    if (sets.fill.length > 5) layerPngs.fill = await rasterAtlas(sets.fill, layersH);
    if (sets.stroke.length > 5) layerPngs.stroke = await rasterAtlas(sets.stroke, layersH, slabsVs(sets.stroke));
    if (sets.shadow.length > 5) layerPngs.shadow = await rasterAtlas(sets.shadow, layersH, slabsVs(sets.shadow));
    if (sets.glints.length > 5) layerPngs.glints = await rasterAtlas(sets.glints, layersH);
  }
  const layered = layersH != null && layerPngs.fill && layerPngs.stroke;

  const emit = (list: Baked[]) => list.map((g) => ({
    u: g.u, x: g.x ?? 0, y: g.y ?? 0, w: g.w, h: g.h,
    bx: Math.round(g.bx * 10) / 10, by: Math.round(g.by * 10) / 10,
    adv: Math.round(g.adv * 10) / 10,
  }));
  const pointSize = 52 * BAKE_S;
  const metrics = JSON.stringify({
    pointSize,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    lineHeight: Math.round((ascent + descent) * 1.06),
    atlasW: AW, atlasH: fullH,
    kerning,
    glyphs: emit(sets.full),
    ...(layered ? {
      layersAtlasW: AW, layersAtlasH: layersH,
      // ONE glyph list for every layer — the shared skeleton
      layerGlyphs: emit(skeleton),
    } : {}),
  });
  return { png, layerPngs: layered ? layerPngs : null, metrics, pointSize };
}

/* The kit's ONE runtime script: the HeroLabel sync (owner, on editing a
   four-layer label by hand: "no real point if it is supposed to be
   dynamic"). Everything else the importer does is editor-only, but a
   layered label must follow dynamic text in play mode and in builds, so
   this ships as a real component — tiny and dependency-free on purpose. */
/* Runtime: the two things a state sprite CAN'T carry — the hover glow and
   the press lift. The glow is a soft halo that would blow up the sprite's
   bounds and can't nine-slice; the lift is a transform. Both were promised
   as "engine-composed" in the README and never actually built, so a Unity
   rollover was a quiet face swap (owner: "I'm not getting the glows on
   hover… it's impossible for me to know" whether it hovered). */
const STATE_FX_RUNTIME = `using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace PatternBreak {
  /* Sits beside the Button. Numbers come from the kit's own state dials —
     the same Glow and Lift you set on uikitmaker.com. */
  [AddComponentMenu("UI Kit Maker/State FX")]
  [RequireComponent(typeof(RectTransform))]
  public class StateFx : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler {
    [Header("Look — edited on uikitmaker.com, tune freely here")]
    public Sprite glowSprite;
    [Tooltip("How far the aura sprite overhangs the piece, per side, in UI units.")]
    public Vector2 glowPad;
    public Color glowColor = Color.white;
    [Tooltip("Glow strength 0-100 per state, straight from the kit's Glow dial.")]
    public float restGlow, hoverGlow = 100f, pressedGlow, disabledGlow;
    [Tooltip("Vertical shift in pixels per state — the press sink. Positive is up.")]
    public float restLift, hoverLift, pressedLift;
    [Tooltip("Seconds to cross-fade between states.")]
    public float fade = 0.11f;

    RectTransform rt, glowRt;
    Image glowImg;
    Selectable sel;
    bool over, down;
    float glowNow, glowTo, liftNow, liftTo, baseY;
    float lastWroteY = float.NaN;
    bool settling;

    void OnEnable() {
      rt = GetComponent<RectTransform>();
      sel = GetComponent<Selectable>();
      baseY = rt.anchoredPosition.y;
      glowNow = glowTo = Target(out liftTo);
      liftNow = liftTo;
      /* the halo has to draw BEHIND the piece, and in Unity UI a child
         always draws in FRONT of its parent's own graphic — so it is a
         SIBLING inserted just before us. Built at runtime, which also
         keeps it out of the prefab and out of your scene until it's
         actually doing something. */
      if (Application.isPlaying && glowSprite != null && rt.parent != null) BuildGlow();
      Push(true);
    }
    void OnDisable() {
      if (glowRt != null) Destroy(glowRt.gameObject);
      glowRt = null; glowImg = null;
      if (rt != null) rt.anchoredPosition = new Vector2(rt.anchoredPosition.x, baseY);
    }
    void BuildGlow() {
      var go = new GameObject(name + " Glow", typeof(RectTransform), typeof(CanvasRenderer), typeof(LayoutElement), typeof(Image));
      go.hideFlags = HideFlags.DontSave;
      /* the halo is DECOR, not layout — and the exemption must exist BEFORE
         the layout group ever meets the child. Parenting a bare Image first
         queued a rebuild that measured the aura sprite as a real cell, and
         a HorizontalLayoutGroup bunched the whole menu around it (dev field
         report, round two: prefabs "spawn in grouped in one place"). */
      go.GetComponent<LayoutElement>().ignoreLayout = true;
      glowRt = go.GetComponent<RectTransform>();
      glowRt.SetParent(rt.parent, false);
      glowRt.SetSiblingIndex(rt.GetSiblingIndex()); // immediately before us = behind us
      glowImg = go.GetComponent<Image>();
      glowImg.sprite = glowSprite;
      glowImg.raycastTarget = false;
      glowImg.color = new Color(glowColor.r, glowColor.g, glowColor.b, 0f);
      MirrorHost();
    }
    /* The halo MIRRORS the host's frame — anchors, pivot, scale, slot and
       size — instead of copying it once. A layout group owns its children's
       frames and rewrites them whenever it pleases, and a HORIZONTAL group
       varies exactly the axis the old event-driven copy never carried (dev
       field report: auras stacked in one place, spread on first mouse-over,
       never sat right). Following every frame is the only honest contract.
       Change-guarded: a quiet frame costs six compares and writes nothing,
       so no canvas is dirtied at rest — the Playground slowdown of old was
       per-frame ALLOCATION, and this allocates nothing. */
    void MirrorHost() {
      if (glowRt == null || rt == null) return;
      if (glowRt.anchorMin != rt.anchorMin) glowRt.anchorMin = rt.anchorMin;
      if (glowRt.anchorMax != rt.anchorMax) glowRt.anchorMax = rt.anchorMax;
      if (glowRt.pivot != rt.pivot) glowRt.pivot = rt.pivot;
      if (glowRt.localScale != rt.localScale) glowRt.localScale = rt.localScale;
      // the aura sprite is the piece plus a fixed overhang, so the pad is an
      // ADDITIVE offset — correct whether the piece is fixed or stretched
      var size = rt.sizeDelta + glowPad * 2f;
      if (glowRt.sizeDelta != size) glowRt.sizeDelta = size;
      // the piece's own y already carries the lift — the halo just sits
      // exactly where the piece sits, no lift math of its own
      if (glowRt.anchoredPosition != rt.anchoredPosition) glowRt.anchoredPosition = rt.anchoredPosition;
    }
    void LateUpdate() {
      if (rt == null) return;
      /* adopt outside moves the dimension callback never hears about: a
         layout group can re-flow us WITHOUT a size change (a sibling added
         to the row shifts everyone sideways and, centered, vertically). A
         y we didn't write ourselves belongs to the layout — it becomes the
         new resting base the press sink measures from. */
      float cur = rt.anchoredPosition.y;
      if (!settling && (float.IsNaN(lastWroteY) || Mathf.Abs(cur - lastWroteY) > 0.01f)) { baseY = cur; lastWroteY = cur; }
      MirrorHost();
    }
    /* a layout group repositions and resizes us AFTER OnEnable — adopt its
       slot as the new resting base and re-seat the halo, or the press sink
       measures from a stale home and the glow parks on the old spot. A
       y we didn't write ourselves belongs to an outside owner (the layout);
       one we did still carries the lift and stays ours. */
    void OnRectTransformDimensionsChange() {
      if (rt == null) return;
      float cur = rt.anchoredPosition.y;
      if (float.IsNaN(lastWroteY) || Mathf.Abs(cur - lastWroteY) > 0.01f) baseY = cur;
      Push(true);
    }
    float Target(out float lift) {
      if (sel != null && !sel.IsInteractable()) { lift = restLift; return disabledGlow; }
      if (down) { lift = pressedLift; return pressedGlow; }
      if (over) { lift = hoverLift; return hoverGlow; }
      lift = restLift; return restGlow;
    }
    void Retarget() { glowTo = Target(out liftTo); settling = true; }
    public void OnPointerEnter(PointerEventData e) { over = true; Retarget(); }
    public void OnPointerExit(PointerEventData e) { over = false; down = false; Retarget(); }
    public void OnPointerDown(PointerEventData e) { down = true; Retarget(); }
    public void OnPointerUp(PointerEventData e) {
      down = false;
      /* Unity parks a clicked Selectable in its SELECTED state, which
         outranks Highlighted — after the first click the sprite swap goes
         quiet while the pointer-driven text and glow keep answering (dev
         field report: "only the text was moving, not the rest of the
         button"). Releasing the click releases the selection: hover and
         press read identically on every click after the first. Delete
         this if your game drives menus by keyboard/gamepad selection. */
      if (sel != null && EventSystem.current != null && EventSystem.current.currentSelectedGameObject == gameObject)
        EventSystem.current.SetSelectedGameObject(null);
      Retarget();
    }

    /* Update runs ONLY while a transition is in flight — a component that
       ticks forever is how the Playground got slow the first time. */
    void Update() {
      if (!settling) return;
      var step = fade > 0.001f ? Time.unscaledDeltaTime / fade : 1f;
      glowNow = Mathf.MoveTowards(glowNow, glowTo, Mathf.Abs(glowTo - glowNow) * 1f + step * 100f);
      liftNow = Mathf.MoveTowards(liftNow, liftTo, Mathf.Abs(liftTo - liftNow) * 1f + step * 40f);
      if (Mathf.Abs(glowNow - glowTo) < 0.2f && Mathf.Abs(liftNow - liftTo) < 0.05f) {
        glowNow = glowTo; liftNow = liftTo; settling = false;
      }
      Push(false);
    }
    void Push(bool snap) {
      if (snap) { glowNow = glowTo; liftNow = liftTo; }
      if (glowImg != null) glowImg.color = new Color(glowColor.r, glowColor.g, glowColor.b, Mathf.Clamp01(glowNow / 100f) * 0.85f);
      if (rt != null) {
        rt.anchoredPosition = new Vector2(rt.anchoredPosition.x, baseY + liftNow);
        lastWroteY = baseY + liftNow;
      }
      // the halo follows in MirrorHost — the piece's y carries the lift
      MirrorHost();
    }
  }
}
`;

const IDLE_SHINE_RUNTIME = `using UnityEngine;
using UnityEngine.UI;

namespace PatternBreak {
  /* Idle motion, half one: the wipe — a soft highlight band sweeps the
     piece and rests, clipped to the piece's own silhouette by a Mask on
     the host image (the app's clipped, staggered glint, same recipe).
     Fully procedural: no sprite assets, one tiny gradient texture shared
     by every band. Delete the component and the piece is untouched. */
  [AddComponentMenu("UI Kit Maker/Wipe Shine")]
  public class WipeShine : MonoBehaviour {
    [Tooltip("Seconds from one sweep to the next.")] public float period = 9f;
    [Tooltip("Seconds one sweep takes.")] public float sweep = 1.4f;
    [Range(0f, 1f)] public float strength = 0.38f;
    public float tilt = -14f;
    float phase; RectTransform rt, bandRt; Image band; Mask mask; bool ownMask;
    static Sprite bandSprite;
    void OnEnable() {
      rt = GetComponent<RectTransform>();
      if (bandSprite == null) {
        var tex = new Texture2D(64, 1, TextureFormat.RGBA32, false);
        var px = new Color[64];
        for (int i = 0; i < 64; i++) { float t = Mathf.Sin(i / 63f * Mathf.PI); px[i] = new Color(1f, 1f, 1f, t * t); }
        tex.SetPixels(px); tex.Apply(); tex.wrapMode = TextureWrapMode.Clamp; tex.hideFlags = HideFlags.DontSave;
        bandSprite = Sprite.Create(tex, new Rect(0, 0, 64, 1), new Vector2(.5f, .5f));
        bandSprite.hideFlags = HideFlags.DontSave;
      }
      mask = GetComponent<Mask>();
      if (mask == null && GetComponent<Image>() != null) { mask = gameObject.AddComponent<Mask>(); mask.showMaskGraphic = true; ownMask = true; }
      var go = new GameObject(name + " Wipe", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      go.hideFlags = HideFlags.DontSave;
      band = go.GetComponent<Image>();
      band.sprite = bandSprite; band.raycastTarget = false; band.color = new Color(1f, 1f, 1f, 0f);
      bandRt = (RectTransform)go.transform;
      bandRt.SetParent(rt, false);
      bandRt.localRotation = Quaternion.Euler(0f, 0f, tilt);
      // deterministic stagger, so a menu of pieces never flashes in unison
      phase = -(Mathf.Abs(name.GetHashCode()) % 1000) / 1000f * period;
    }
    void OnDisable() {
      if (band != null) Destroy(band.gameObject);
      if (ownMask && mask != null) Destroy(mask);
      band = null; mask = null; ownMask = false;
    }
    void Update() {
      if (band == null || rt == null) return;
      phase += Time.unscaledDeltaTime;
      float t = phase % period;
      if (t < 0f || t > sweep) { if (band.canvasRenderer.GetAlpha() != 0f || band.color.a != 0f) band.color = new Color(1f, 1f, 1f, 0f); return; }
      float w = rt.rect.width, h = rt.rect.height;
      bandRt.sizeDelta = new Vector2(w * 0.3f, h * 2.4f);
      float u = t / sweep;
      bandRt.anchoredPosition = new Vector2(Mathf.Lerp(-w * 0.75f, w * 0.75f, u), 0f);
      band.color = new Color(1f, 1f, 1f, strength * Mathf.Sin(u * Mathf.PI));
    }
  }

  /* Idle motion, half two: the edge shine — a spark that runs the piece's
     silhouette, shrinking as it travels, flickering along the journey,
     then resting (owner: "gets smaller and fades out… points of
     flicker"). The outline arrives from kit-manifest as even arc-length
     stations in image fractions (y down), so the walk is constant-speed
     with a plain index lerp. Procedural radial glow, no assets. */
  [AddComponentMenu("UI Kit Maker/Edge Shine")]
  public class EdgeShine : MonoBehaviour {
    [Tooltip("Seconds from one run to the next.")] public float period = 11f;
    [Tooltip("Seconds one lap takes.")] public float run = 2.6f;
    public Color color = Color.white;
    [Tooltip("Outline stations as image fractions (x0,y0,x1,y1..., y down) — from kit-manifest.")]
    public float[] outline;
    float phase; int seed; RectTransform rt, sparkRt; Image spark;
    static Sprite glowSprite;
    void OnEnable() {
      rt = GetComponent<RectTransform>();
      if (glowSprite == null) {
        const int S = 32;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false);
        var px = new Color[S * S];
        for (int y = 0; y < S; y++) for (int x = 0; x < S; x++) {
          float d = Vector2.Distance(new Vector2(x, y), new Vector2(S / 2f - .5f, S / 2f - .5f)) / (S / 2f);
          float a = Mathf.Clamp01(1f - d); a *= a;
          px[y * S + x] = new Color(1f, 1f, 1f, a);
        }
        tex.SetPixels(px); tex.Apply(); tex.wrapMode = TextureWrapMode.Clamp; tex.hideFlags = HideFlags.DontSave;
        glowSprite = Sprite.Create(tex, new Rect(0, 0, S, S), new Vector2(.5f, .5f));
        glowSprite.hideFlags = HideFlags.DontSave;
      }
      var go = new GameObject(name + " Edge Spark", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      go.hideFlags = HideFlags.DontSave;
      spark = go.GetComponent<Image>();
      spark.sprite = glowSprite; spark.raycastTarget = false; spark.color = new Color(color.r, color.g, color.b, 0f);
      sparkRt = (RectTransform)go.transform;
      sparkRt.SetParent(rt, false);
      sparkRt.anchorMin = sparkRt.anchorMax = new Vector2(0f, 1f); // image fractions are y-down from the top-left
      seed = Mathf.Abs(name.GetHashCode());
      phase = -(seed % 1000) / 1000f * period;
    }
    void OnDisable() { if (spark != null) Destroy(spark.gameObject); spark = null; }
    void Update() {
      if (spark == null || rt == null || outline == null || outline.Length < 8) return;
      phase += Time.unscaledDeltaTime;
      float t = phase % period;
      if (t < 0f || t > run) { if (spark.color.a != 0f) spark.color = new Color(color.r, color.g, color.b, 0f); return; }
      float u = t / run;
      int n = outline.Length / 2;
      float fi = u * n;
      int i0 = ((int)fi) % n, i1 = (i0 + 1) % n;
      float ft = fi - (int)fi;
      float fx = Mathf.Lerp(outline[i0 * 2], outline[i1 * 2], ft);
      float fy = Mathf.Lerp(outline[i0 * 2 + 1], outline[i1 * 2 + 1], ft);
      float w = rt.rect.width, h = rt.rect.height;
      sparkRt.anchoredPosition = new Vector2(fx * w, -fy * h);
      // the journey: shrink, fade, and flicker at deterministic stations
      float size = Mathf.Clamp(h * 0.26f, 10f, 44f) * Mathf.Lerp(1f, 0.3f, u);
      sparkRt.sizeDelta = new Vector2(size, size);
      uint step = (uint)(u * 24f) * 2654435761u + (uint)seed;
      float flicker = 0.45f + 0.55f * (((step >> 9) & 1023u) / 1023f);
      spark.color = new Color(color.r, color.g, color.b, Mathf.Sin(u * Mathf.PI) * flicker);
    }
  }
}
`;

const HERO_LABEL_RUNTIME = `using UnityEngine;
#if UNITY_2023_2_OR_NEWER
using TMPro;
#endif

namespace PatternBreak {
  /* One text box for the whole layered hero label — and one TEXT, full
     stop. The Fill child is the only TextMeshPro in the stack: the only
     thing that lays out glyphs, wraps lines or reads the kerning table.
     Shadow, Stroke and Glints are ECHOES — plain CanvasRenderers that
     redraw the Fill's own mesh (the same mesh object, not a copy)
     wearing a different ink texture, behind it or in front of it. A
     layer cannot lag, wrap differently or kern differently, because a
     layer has nothing of its own to be wrong with: one geometry exists
     and every ink repaints it. Probe-proven in the field before it
     shipped — the echo held through live retyping, font-size scrubbing
     and Play mode, exactly where the four-text stack kept tearing. */
  [ExecuteAlways]
  [AddComponentMenu("UI Kit Maker/Hero Label")]
  public class HeroLabel : MonoBehaviour {
#if UNITY_2023_2_OR_NEWER
    [TextArea] public string text = "PLAY";
    public float fontSize = 150f;
    [Tooltip("Character spacing (tracking).")]
    public float spacing = 0f;
    [Tooltip("Word spacing.")]
    public float wordSpacing = 0f;
    [Tooltip("Line height for wrapped labels. Negative pulls lines together. (Field: a line height typed on the text used to leave the old shadow text behind — with echoes every layer follows it natively; this field just makes the value survive re-imports.)")]
    public float lineSpacing = 0f;
    [Tooltip("The button height this label was authored at. When set, resizing the button scales the type proportionally — like scaling. 0 = off.")]
    public float authoredHeight = 0f;
    [Tooltip("Move the whole word inside its button. Y up is positive — raise a word that optically sits low.")]
    public Vector2 nudge = Vector2.zero;
    [Tooltip("TMP margins (left, top, right, bottom). Editing the text's own Margins adopts into this.")]
    public Vector4 margins = Vector4.zero;
    [Header("Layer inks — wired by the importer")]
    [Tooltip("Soft shadow behind the whole word. Empty = this kit has no shadow layer.")]
    public Material shadowInk;
    [Tooltip("Every stroke merged into one band behind every fill. Empty = no stroke layer.")]
    public Material strokeInk;
    [Tooltip("The glint layer in front of the fills: the kit's light band AND star sparks, both drawn LIVE across the whole word by the GlintInk shader. Empty = no glint layer.")]
    public Material glintsInk;
    string appliedText; float appliedSize; float appliedSpacing; float appliedWordSpacing; float appliedLineSpacing; float appliedK = 1f; Vector2 appliedNudge; Vector4 appliedMargins;
    TextMeshProUGUI tmp;
    CanvasRenderer shadowEcho, strokeEcho, glintsEcho;
    /* the Glints ink draws its band AND stars LIVE across the whole word
       (owner: "one graphic, not a bunch of little letters") — the shader
       needs THIS label's em height, word center and word width, so the
       shared kit material gets per-label understudies that carry them:
       one for the band on the glyph mesh, one flagged _StarsOnly for the
       full-word quad (stars spill past letterforms, like the app).
       DontSave: rebuilt on load, never stales on disk. */
    Material glintsLive, starsLive;
    CanvasRenderer starsEcho;
    Mesh starsMesh;
    Vector3 starsB0, starsB1;
    Material LiveCopy(ref Material live, float starsOnly) {
      if (glintsInk == null) return null;
      if (live == null || live.shader != glintsInk.shader) {
        Retire(ref live);
        live = new Material(glintsInk);
        live.name = glintsInk.name + (starsOnly > 0.5f ? " (stars)" : " (live)");
        live.hideFlags = HideFlags.DontSave;
        if (live.HasProperty("_StarsOnly")) live.SetFloat("_StarsOnly", starsOnly);
      }
      return live;
    }
    static void Retire(ref Material m) {
      if (m == null) return;
      if (Application.isPlaying) Destroy(m); else DestroyImmediate(m);
      m = null;
    }
    void OnDestroy() {
      Retire(ref glintsLive); Retire(ref starsLive);
      if (starsMesh != null) { if (Application.isPlaying) Destroy(starsMesh); else DestroyImmediate(starsMesh); starsMesh = null; }
    }
    float SizeK() {
      if (authoredHeight < 0.5f) return 1f;
      var p = transform.parent as RectTransform;
      return p != null && p.rect.height > 1f ? p.rect.height / authoredHeight : 1f;
    }
    TextMeshProUGUI Tmp() {
      // cached: destroyed references fail the != null check (Unity's
      // overload) and re-collect on their own
      if (tmp != null) return tmp;
      foreach (var t in GetComponentsInChildren<TextMeshProUGUI>(true)) {
        if (t.gameObject.name == "Fill") { tmp = t; break; }
        if (tmp == null) tmp = t;
      }
      /* the retired four-text construction kept Shadow/Stroke/Glints
         TEXTS beside the Fill. With inks armed those are corpses —
         drawing them doubles every layer — so they sleep here and the
         echoes take over. (The importer rebuilds prefabs properly; this
         covers copies already placed in scenes.) */
      if (tmp != null && (strokeInk != null || shadowInk != null || glintsInk != null))
        foreach (var t in GetComponentsInChildren<TextMeshProUGUI>(true))
          if (t != tmp && (t.gameObject.name == "Shadow" || t.gameObject.name == "Stroke" || t.gameObject.name == "Glints") && t.gameObject.activeSelf)
            t.gameObject.SetActive(false);
      return tmp;
    }
    void OnEnable() { tmp = null; Apply(); }
    void OnTransformChildrenChanged() { tmp = null; }
    void OnDisable() {
      /* echoes SLEEP instead of dying: destroying a child while its
         parent is mid-(de)activation is a Unity error (field: the red
         "Cannot destroy GameObject" line during the probe), and a
         sleeping echo wakes clean with nothing to rebuild */
      if (shadowEcho != null) shadowEcho.gameObject.SetActive(false);
      if (strokeEcho != null) strokeEcho.gameObject.SetActive(false);
      if (glintsEcho != null) glintsEcho.gameObject.SetActive(false);
      if (starsEcho != null) starsEcho.gameObject.SetActive(false);
    }
    void Update() {
      var t = Tmp();
      if (t == null) return;
      if (text != appliedText || fontSize != appliedSize || spacing != appliedSpacing || wordSpacing != appliedWordSpacing || lineSpacing != appliedLineSpacing || nudge != appliedNudge || margins != appliedMargins || !Mathf.Approximately(SizeK(), appliedK)) { Apply(); return; }
      /* Adoption, in the editor AND in play mode: people tune the text
         itself — retype it, scrub Font Size, set Line Spacing, set
         Margins — and the group field follows so the change survives
         re-imports. With one text there is one voice to listen to; the
         four-way arbitration that used to live here is gone with the
         extra texts. */
      if (t.text != appliedText) { text = t.text; Apply(); return; }
      if (t.characterSpacing != appliedSpacing) { spacing = t.characterSpacing; Apply(); return; }
      if (t.wordSpacing != appliedWordSpacing) { wordSpacing = t.wordSpacing; Apply(); return; }
      if (t.lineSpacing != appliedLineSpacing) { lineSpacing = t.lineSpacing; Apply(); return; }
      if (!Mathf.Approximately(t.fontSize, appliedSize * appliedK)) { fontSize = appliedK > 0f ? t.fontSize / appliedK : t.fontSize; Apply(); return; }
      if (t.margin != appliedMargins) { margins = t.margin; Apply(); return; }
    }
    public void SetText(string value) { text = value; Apply(); }
    void Apply() {
      var t = Tmp();
      if (t == null) return;
      var k = SizeK();
      appliedText = text; appliedSize = fontSize; appliedSpacing = spacing; appliedWordSpacing = wordSpacing; appliedLineSpacing = lineSpacing; appliedK = k; appliedNudge = nudge; appliedMargins = margins;
      // auto-fit stays OFF: the group owns the size — TMP re-solving it
      // behind our back is how sizes used to wander
      t.enableAutoSizing = false;
      t.text = text;
      t.fontSize = fontSize * k;
      t.characterSpacing = spacing;
      t.wordSpacing = wordSpacing;
      t.lineSpacing = lineSpacing;
      /* the nudge rides the TEXT, never this root — the press sink
         (LabelStateInk) owns the root's position, and two writers on one
         transform is how things drift. The echoes copy the text's frame,
         so the nudge carries them automatically. */
      t.rectTransform.anchoredPosition = nudge;
      t.margin = margins;
    }
    /* Painted LAST each frame, after every possible layout write, from
       whatever mesh the text owns right now. SetMesh points the echo at
       the text's OWN mesh object — when TMP regenerates the word, the
       echoes are already holding the result. */
    /* mirror the kit ink's dress (blend, recipe, atlas) onto a live copy —
       a re-import or a hand-tweak on the kit material lands here live —
       then stamp THIS label's geometry: em height, word center, word width */
    void DressLive(Material m, TextMeshProUGUI t) {
      if (m.mainTexture != glintsInk.mainTexture) m.mainTexture = glintsInk.mainTexture;
      m.SetFloat("_Style", glintsInk.GetFloat("_Style")); m.SetFloat("_Op", glintsInk.GetFloat("_Op"));
      m.SetFloat("_Lx", glintsInk.GetFloat("_Lx")); m.SetFloat("_Ly", glintsInk.GetFloat("_Ly"));
      m.SetFloat("_OxEm", glintsInk.GetFloat("_OxEm")); m.SetFloat("_OyEm", glintsInk.GetFloat("_OyEm"));
      m.SetFloat("_SrcBlend", glintsInk.GetFloat("_SrcBlend")); m.SetFloat("_DstBlend", glintsInk.GetFloat("_DstBlend"));
      m.SetFloat("_Pack", glintsInk.GetFloat("_Pack"));
      var b = t.textBounds;
      if (!float.IsInfinity(b.size.x) && b.size.x > 0.01f) {
        m.SetFloat("_Em", Mathf.Max(1f, t.fontSize));
        m.SetFloat("_Cx", b.center.x); m.SetFloat("_Cy", b.center.y);
        m.SetFloat("_TextW", b.size.x);
      }
    }
    void LateUpdate() {
      var t = Tmp();
      if (t == null) return;
      if (shadowInk != null) PaintEcho(ref shadowEcho, "Shadow (echo)", t, shadowInk);
      if (strokeInk != null) PaintEcho(ref strokeEcho, "Stroke (echo)", t, strokeInk);
      var gi = LiveCopy(ref glintsLive, 0f);
      bool field = gi != null && gi.HasProperty("_Em") && gi.GetFloat("_Style") > 0.5f;
      if (gi != null) {
        if (gi.HasProperty("_Em")) DressLive(gi, t);
        PaintEcho(ref glintsEcho, "Glints (echo)", t, gi);
      }
      // the stars quad exists only for the live field (old zips bake stars)
      if (field) {
        var si = LiveCopy(ref starsLive, 1f);
        if (si != null) { DressLive(si, t); PaintStars(t, si); }
      } else if (starsEcho != null) starsEcho.gameObject.SetActive(false);
      // draw order is sibling order: shadow, stroke, the text, glints, stars
      int i = 0;
      if (shadowEcho != null) Place(shadowEcho.transform, i++);
      if (strokeEcho != null) Place(strokeEcho.transform, i++);
      Place(t.transform, i++);
      if (glintsEcho != null) Place(glintsEcho.transform, i++);
      if (starsEcho != null && starsEcho.gameObject.activeSelf) Place(starsEcho.transform, i);
    }
    static void Place(Transform tr, int idx) {
      if (tr.GetSiblingIndex() != idx) tr.SetSiblingIndex(idx);
    }
    /* the stars ride their OWN quad spanning the word plus a spill margin:
       the app scatters sparkles across the whole word and lets them poke
       past the letterforms — glyph quads can't show ink in the gaps
       between letters, a full-word quad can. Rebuilt only when the word's
       bounds change (the per-frame allocation lesson is learned). */
    void PaintStars(TextMeshProUGUI t, Material ink) {
      if (starsEcho == null) {
        var prior = transform.Find("Glint stars (echo)");
        var go = prior != null ? prior.gameObject : null;
        if (go == null) {
          go = new GameObject("Glint stars (echo)", typeof(RectTransform), typeof(CanvasRenderer));
          go.hideFlags = HideFlags.DontSave;
          go.transform.SetParent(transform, false);
        }
        starsEcho = go.GetComponent<CanvasRenderer>();
        if (starsEcho == null) starsEcho = go.AddComponent<CanvasRenderer>();
      }
      var b = t.textBounds;
      if (float.IsInfinity(b.size.x) || b.size.x < 0.01f) { starsEcho.gameObject.SetActive(false); return; }
      if (!starsEcho.gameObject.activeSelf) starsEcho.gameObject.SetActive(true);
      var rt = (RectTransform)starsEcho.transform;
      var src = t.rectTransform;
      if (rt.anchorMin != src.anchorMin) rt.anchorMin = src.anchorMin;
      if (rt.anchorMax != src.anchorMax) rt.anchorMax = src.anchorMax;
      if (rt.pivot != src.pivot) rt.pivot = src.pivot;
      if (rt.sizeDelta != src.sizeDelta) rt.sizeDelta = src.sizeDelta;
      if (rt.anchoredPosition != src.anchoredPosition) rt.anchoredPosition = src.anchoredPosition;
      if (rt.localRotation != src.localRotation) rt.localRotation = src.localRotation;
      if (rt.localScale != src.localScale) rt.localScale = src.localScale;
      float m = Mathf.Max(1f, t.fontSize) * 0.6f; // star tips may spill this far
      var p0 = new Vector3(b.min.x - m, b.min.y - m, 0f);
      var p1 = new Vector3(b.max.x + m, b.max.y + m, 0f);
      if (starsMesh == null) { starsMesh = new Mesh(); starsMesh.hideFlags = HideFlags.DontSave; starsMesh.MarkDynamic(); }
      if (p0 != starsB0 || p1 != starsB1) {
        starsB0 = p0; starsB1 = p1;
        starsMesh.Clear();
        starsMesh.vertices = new Vector3[] { p0, new Vector3(p0.x, p1.y, 0f), p1, new Vector3(p1.x, p0.y, 0f) };
        starsMesh.uv = new Vector2[] { Vector2.zero, Vector2.up, Vector2.one, Vector2.right };
        starsMesh.colors32 = new Color32[] { new Color32(255, 255, 255, 255), new Color32(255, 255, 255, 255), new Color32(255, 255, 255, 255), new Color32(255, 255, 255, 255) };
        starsMesh.triangles = new int[] { 0, 1, 2, 0, 2, 3 };
        starsMesh.RecalculateBounds();
      }
      starsEcho.SetMesh(starsMesh);
      starsEcho.SetMaterial(ink, null);
    }
    void PaintEcho(ref CanvasRenderer slot, string echoName, TextMeshProUGUI t, Material ink) {
      if (slot == null) {
        // adopt a survivor before minting one — a domain reload clears
        // these fields, not the scene
        var prior = transform.Find(echoName);
        var go = prior != null ? prior.gameObject : null;
        if (go == null) {
          go = new GameObject(echoName, typeof(RectTransform), typeof(CanvasRenderer));
          // never saved — rebuilt on load, in scenes and prefabs alike,
          // so an echo can never go stale on disk
          go.hideFlags = HideFlags.DontSave;
          go.transform.SetParent(transform, false);
        }
        slot = go.GetComponent<CanvasRenderer>();
        if (slot == null) slot = go.AddComponent<CanvasRenderer>();
      }
      if (!slot.gameObject.activeSelf) slot.gameObject.SetActive(true);
      /* the echo wears the text's exact frame, so the shared mesh lands
         in the same place. Writes are guarded — a RectTransform write
         dirties layout even when the value is unchanged. */
      var rt = (RectTransform)slot.transform;
      var src = t.rectTransform;
      if (rt.anchorMin != src.anchorMin) rt.anchorMin = src.anchorMin;
      if (rt.anchorMax != src.anchorMax) rt.anchorMax = src.anchorMax;
      if (rt.pivot != src.pivot) rt.pivot = src.pivot;
      if (rt.sizeDelta != src.sizeDelta) rt.sizeDelta = src.sizeDelta;
      if (rt.anchoredPosition != src.anchoredPosition) rt.anchoredPosition = src.anchoredPosition;
      if (rt.localRotation != src.localRotation) rt.localRotation = src.localRotation;
      if (rt.localScale != src.localScale) rt.localScale = src.localScale;
      slot.SetMesh(t.mesh);
      slot.SetMaterial(ink, null);
    }
#endif
  }
}
`;

/* Runtime script #2: state ink for live labels (owner field report: on
   press/hover the face sprite swaps but "the text isn't following the
   face" — e.g. a down state that flips the text gradient). SpriteSwap is
   pure engine; the label's ink change must ride the same pointer events,
   in play mode and in builds. Same contract as HeroLabel: tiny,
   dependency-free, wired automatically on example prefabs, usable by hand
   on any button. */
const LABEL_STATE_INK_RUNTIME = `using UnityEngine;
using UnityEngine.EventSystems;
#if UNITY_2023_2_OR_NEWER
using TMPro;
#endif

namespace PatternBreak {
  /* The kit's designed state recipes for LIVE TEXT: when the face swaps
     (hover / press), the label's ink follows — the same colors the maker
     set on uikitmaker.com. Play-mode behavior only (the importer keeps the
     resting dress in edit mode). Point 'label' at any TMP text to reuse it
     on your own buttons. */
  [AddComponentMenu("UI Kit Maker/Label State Ink")]
  public class LabelStateInk : MonoBehaviour
#if UNITY_2023_2_OR_NEWER
    , IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler
#endif
  {
#if UNITY_2023_2_OR_NEWER
    /* what MOVES: the whole label (single text or a layered stack root) */
    public RectTransform shiftTarget;
    /* what RE-INKS: a single dynamic-color text; null for layered baked
       stacks (their pixels are painted — they only ride the shifts) */
    public TextMeshProUGUI label;
    public bool inkOn;
    public bool restGradient; public Color restTop = Color.white; public Color restBottom = Color.white;
    public bool hoverOn; public bool hoverGradient; public Color hoverTop = Color.white; public Color hoverBottom = Color.white;
    public bool pressedOn; public bool pressedGradient; public Color pressedTop = Color.white; public Color pressedBottom = Color.white;
    /* the label RIDES THE FACE: a state that sinks or lifts the face
       moves the label by the same delta (design px, positive = down) */
    public float hoverShift; public float pressedShift;
    bool over, down; Vector2 basePos; bool basePosSet;
    RectTransform Mover() { return shiftTarget != null ? shiftTarget : (label != null ? label.rectTransform : null); }
    void OnEnable() { over = false; down = false; ApplyCurrent(); }
    void OnDisable() { over = false; down = false; }
    public void OnPointerEnter(PointerEventData e) { over = true; ApplyCurrent(); }
    public void OnPointerExit(PointerEventData e) { over = false; ApplyCurrent(); }
    public void OnPointerDown(PointerEventData e) { down = true; ApplyCurrent(); }
    public void OnPointerUp(PointerEventData e) { down = false; ApplyCurrent(); }
    void ApplyCurrent() {
      var mover = Mover();
      if (mover != null) {
        // base captured lazily at first apply — no scene-load-order games
        if (!basePosSet) { basePos = mover.anchoredPosition; basePosSet = true; }
        float shift = down ? pressedShift : over ? hoverShift : 0f;
        mover.anchoredPosition = basePos + new Vector2(0f, -shift);
      }
      if (label == null || !inkOn) return;
      if (down && pressedOn) Ink(pressedTop, pressedBottom, pressedGradient);
      else if (over && hoverOn) Ink(hoverTop, hoverBottom, hoverGradient);
      else Ink(restTop, restBottom, restGradient);
    }
    void Ink(Color top, Color bottom, bool grad) {
      if (grad) { label.enableVertexGradient = true; label.colorGradient = new VertexGradient(top, top, bottom, bottom); label.color = Color.white; }
      else { label.enableVertexGradient = false; label.color = top; }
    }
    /* edit-mode probes: right-click the component header. If Test Press
       moves the label but a real Play-mode press doesn't, the mechanics
       are fine and the pointer events are the problem — and vice versa.
       Each probe LOGS what it did: "nothing happened" then reads as
       either armed-0 or nothing-wired instead of a shrug. */
    [ContextMenu("Test Press")]
    void TestPress() {
      down = true; ApplyCurrent();
      var mover = Mover();
      Debug.Log("UI Kit Maker test press on '" + gameObject.name + "' — " + (mover == null
        ? "NOTHING WIRED TO MOVE (no shift target on this component)."
        : "holding '" + mover.gameObject.name + "' " + pressedShift + "px down (the armed value). If nothing moved on screen, run this on the piece in the scene Hierarchy, not the prefab file."));
    }
    [ContextMenu("Test Release")]
    void TestRelease() { down = false; over = false; ApplyCurrent(); Debug.Log("UI Kit Maker test release on '" + gameObject.name + "' — back to rest."); }
#endif
  }
}
`;

/* Runtime script #3: the touch stick. The joystick ships as base + thumb
   sprites and this component makes them a WORKING control — the "your
   kit, driving a character, thirty seconds after the drop" demo. */
const TOUCH_STICK_RUNTIME = `using UnityEngine;
using UnityEngine.EventSystems;

namespace PatternBreak {
  /* Touch stick — press or drag anywhere on the base; the thumb follows
     and Value reports a normalized direction (-1..1 each axis). Poll
     Value in Update, or hook onChanged in the Inspector. */
  [AddComponentMenu("UI Kit Maker/Touch Stick")]
  public class TouchStick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler {
    public RectTransform thumb;
    [Tooltip("Travel radius in px. 0 = automatic (40% of this rect's width).")]
    public float radius = 0f;
    public bool snapBack = true;
    [System.Serializable] public class StickEvent : UnityEngine.Events.UnityEvent<Vector2> {}
    public StickEvent onChanged = new StickEvent();
    public Vector2 Value { get; private set; }
    RectTransform Rt { get { return (RectTransform)transform; } }
    float R { get { return radius > 0.01f ? radius : Rt.rect.width * 0.4f; } }
    void Track(PointerEventData e) {
      Vector2 local;
      if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(Rt, e.position, e.pressEventCamera, out local)) return;
      var v = Vector2.ClampMagnitude(local / R, 1f);
      Value = v;
      if (thumb != null) thumb.anchoredPosition = v * R;
      onChanged.Invoke(v);
    }
    public void OnPointerDown(PointerEventData e) { Track(e); }
    public void OnDrag(PointerEventData e) { Track(e); }
    public void OnPointerUp(PointerEventData e) {
      Value = Vector2.zero;
      if (snapBack && thumb != null) thumb.anchoredPosition = Vector2.zero;
      onChanged.Invoke(Vector2.zero);
    }
  }
}
`;

/* Runtime script: the switch knob's glide. Pairs with a Unity Toggle so
   the Switch prefab MOVES like the app's piece — knob slides between
   ends and swaps its ON/OFF dot. */
const SWITCH_GLIDE_RUNTIME = `using UnityEngine;
using UnityEngine.UI;

namespace PatternBreak {
  /* Switch glide — pairs with the Toggle on the same object: the knob
     slides between the track's ends and swaps its ON/OFF sprite, like
     the switch on uikitmaker.com. The LOOK is edited there; this script
     only moves what shipped. */
  [AddComponentMenu("UI Kit Maker/Switch Glide")]
  [RequireComponent(typeof(Toggle))]
  public class SwitchGlide : MonoBehaviour {
    public RectTransform knob;
    public Sprite onSprite;
    public Sprite offSprite;
    [Tooltip("Knob-center offset from the track center at each end, in px. 0 = automatic from the shipped sprites.")]
    public float travel = 0f;
    [Tooltip("Seconds for the full end-to-end glide.")]
    public float glideTime = 0.12f;
    Toggle tog;
    float target;
    bool moving;
    float End {
      get {
        if (travel > 0.01f) return travel;
        var rt = (RectTransform)transform;
        float kw = knob != null ? knob.rect.width : 0f;
        float kh = knob != null ? knob.rect.height : 0f;
        // the knob's edge gap mirrors its vertical gap — the app's geometry
        return Mathf.Max(4f, (rt.rect.width - kw) * 0.5f - (rt.rect.height - kh) * 0.5f);
      }
    }
    void Awake() {
      tog = GetComponent<Toggle>();
      tog.onValueChanged.AddListener(OnFlip);
      Snap();
    }
    void OnDestroy() { if (tog != null) tog.onValueChanged.RemoveListener(OnFlip); }
    /* jump straight to the current pose — scene builds and pose changes
       from code call this so nothing animates in edit mode */
    public void Snap() {
      if (tog == null) tog = GetComponent<Toggle>();
      if (knob == null || tog == null) return;
      target = tog.isOn ? End : -End;
      knob.anchoredPosition = new Vector2(target, knob.anchoredPosition.y);
      Dress();
      moving = false;
    }
    void OnFlip(bool on) { target = on ? End : -End; Dress(); moving = true; }
    void Dress() {
      if (knob == null) return;
      var img = knob.GetComponent<Image>();
      if (img == null) return;
      var want = tog != null && tog.isOn ? onSprite : offSprite;
      if (want != null) img.sprite = want;
    }
    void Update() {
      if (!moving || knob == null) return;
      var p = knob.anchoredPosition;
      float step = Mathf.Abs(End) * 2f * (Time.unscaledDeltaTime / Mathf.Max(0.02f, glideTime));
      p.x = Mathf.MoveTowards(p.x, target, step);
      knob.anchoredPosition = p;
      if (Mathf.Approximately(p.x, target)) moving = false;
    }
  }
}
`;

/* Runtime script: the fire button's quick-select carousel — swipe across
   the dome to cycle the armed weapon, the center glyph swaps with a pop
   and the waiting chambers re-deal (owner: "when you swipe left or right
   the center icon changes… bring that wiring / animation into Unity"). */
const FIREBUTTON_RUNTIME = `using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace PatternBreak {
  /* Fire button quick-select. Swipe left/right across the dome to cycle
     the armed weapon — the center glyph swaps and the waiting chambers
     re-deal, like the carousel on uikitmaker.com. A plain tap still
     presses (the Button beside this fires; a real swipe suppresses the
     click). Hook onWeaponChanged for your inventory logic, or set
     'weapons' to your own sprites. */
  [AddComponentMenu("UI Kit Maker/Fire Button")]
  public class FireButton : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler, IPointerDownHandler, IPointerUpHandler {
    [Tooltip("The armed glyph in the dome center.")]
    public Image weapon;
    [Tooltip("Waiting chambers, biggest first — their glyphs re-deal from the armed weapon.")]
    public Image[] chambers = new Image[0];
    [Tooltip("The arsenal, in cycle order. Ships with sword / zap / flask / shield from icons/.")]
    public Sprite[] weapons = new Sprite[0];
    public int armed = 0;
    [Tooltip("Swipe distance (px) that counts as a weapon switch.")]
    public float swipePx = 34f;
    [Tooltip("How far the armed glyph rides while the dome is pressed (up positive) — the kit's press sink, so the icon travels WITH the face instead of floating over the sunk artwork.")]
    public float pressedLift = 0f;
    [System.Serializable] public class WeaponEvent : UnityEngine.Events.UnityEvent<int> {}
    public WeaponEvent onWeaponChanged = new WeaponEvent();
    float dragX; bool swiped;
    float pop; // 1 → 0 after a switch: the fresh glyph lands with a pop
    Vector3 weaponScale = Vector3.one;
    Vector2 weaponSeat; bool seated, held;
    void Awake() { if (weapon != null) weaponScale = weapon.transform.localScale; DealNow(); }
    /* the dome's pressed sprite carries its sink in the pixels, so the
       glyph must make the same trip itself or it floats over the sunk
       face (owner: "the icon needs to move with the face on press") */
    public void OnPointerDown(PointerEventData e) {
      var sel = GetComponent<Selectable>();
      if (sel != null && !sel.interactable) return;
      if (weapon == null || held) return;
      if (!seated) { weaponSeat = weapon.rectTransform.anchoredPosition; seated = true; }
      weapon.rectTransform.anchoredPosition = weaponSeat + new Vector2(0f, pressedLift);
      held = true;
    }
    public void OnPointerUp(PointerEventData e) {
      if (!held) return;
      if (weapon != null && seated) weapon.rectTransform.anchoredPosition = weaponSeat;
      held = false;
    }
    void OnDisable() {
      if (held && weapon != null && seated) weapon.rectTransform.anchoredPosition = weaponSeat;
      held = false;
    }
    public void Cycle(int dir) {
      if (weapons.Length == 0) return;
      armed = ((armed + dir) % weapons.Length + weapons.Length) % weapons.Length;
      pop = 1f;
      DealNow();
      onWeaponChanged.Invoke(armed);
    }
    /* deal the current arsenal onto the glyph layers — public so scene
       builds can strike a pose in edit mode */
    public void DealNow() {
      if (weapons.Length == 0) return;
      if (weapon != null) weapon.sprite = weapons[((armed % weapons.Length) + weapons.Length) % weapons.Length];
      for (int i = 0; i < chambers.Length; i++)
        if (chambers[i] != null) chambers[i].sprite = weapons[(((armed + 1 + i) % weapons.Length) + weapons.Length) % weapons.Length];
    }
    public void OnBeginDrag(PointerEventData e) { dragX = 0f; swiped = false; }
    public void OnDrag(PointerEventData e) {
      dragX += e.delta.x;
      if (!swiped && Mathf.Abs(dragX) >= swipePx) { swiped = true; Cycle(dragX > 0f ? 1 : -1); }
    }
    public void OnEndDrag(PointerEventData e) { dragX = 0f; swiped = false; }
    void Update() {
      if (pop <= 0f || weapon == null) return;
      pop = Mathf.Max(0f, pop - Time.unscaledDeltaTime * 6f);
      float sc = 1f + 0.18f * Mathf.Sin(pop * Mathf.PI);
      weapon.transform.localScale = weaponScale * sc;
    }
  }
}
`;

/* Runtime script: the INVENTORY GRID rig — the baked panel's tiles go
   live (owner: "make the inventory panel interactive in boards — just
   the tiles clickable"). The panel sprite ships RINGLESS; the exported
   cell boxes become transparent click targets and the app's own baked
   selection ring rides whichever tile was clicked. One class per file. */
const INVGRID_RUNTIME = `using UnityEngine;
using UnityEngine.UI;

namespace PatternBreak {
  /* Inventory grid selection. The LOOK is the baked board panel behind
     this component; the rig owns only the clicks and the ring. Cells are
     fractions of this rect (x, y, w, h per tile, y from the TOP — the
     app's board space); hook onChanged(int) for your inventory logic. */
  [AddComponentMenu("UI Kit Maker/Inv Grid Select")]
  public class InvGridSelect : MonoBehaviour {
    [Tooltip("Tile boxes as fractions of this rect, flattened x,y,w,h — y measured from the top edge.")]
    public float[] cells = new float[0];
    public int selected = 0;
    [Tooltip("The kit's selection ring sprite (invgrid/cell-ring.png).")]
    public Sprite ring;
    [System.Serializable] public class PickEvent : UnityEngine.Events.UnityEvent<int> {}
    public PickEvent onChanged = new PickEvent();
    RectTransform ringRt;
    void Awake() {
      int n = cells.Length / 4;
      for (int i = 0; i < n; i++) {
        int idx = i;
        var go = new GameObject("Tile " + (i + 1), typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        var rt = go.GetComponent<RectTransform>();
        rt.SetParent(transform, false);
        Anchor(rt, i, 0f);
        var img = go.GetComponent<Image>();
        img.color = Color.clear; // invisible, but it catches the click
        var btn = go.AddComponent<Button>();
        btn.transition = Selectable.Transition.None;
        btn.onClick.AddListener(() => Pick(idx));
      }
      if (ring != null) {
        var rGo = new GameObject("Selection ring", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        rGo.hideFlags = HideFlags.DontSave;
        ringRt = rGo.GetComponent<RectTransform>();
        ringRt.SetParent(transform, false);
        var rImg = rGo.GetComponent<Image>();
        rImg.sprite = ring;
        rImg.raycastTarget = false;
        Seat();
      }
    }
    public void Pick(int i) { selected = i; Seat(); onChanged.Invoke(i); }
    void Anchor(RectTransform rt, int i, float grow) {
      float x = cells[i * 4], y = cells[i * 4 + 1], w = cells[i * 4 + 2], h = cells[i * 4 + 3];
      // app space is y-down; anchors are y-up
      rt.anchorMin = new Vector2(x - w * grow, 1f - (y + h * (1f + grow)));
      rt.anchorMax = new Vector2(x + w * (1f + grow), 1f - (y - h * grow));
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
    }
    void Seat() {
      if (ringRt == null || cells.Length < 4) return;
      int i = Mathf.Clamp(selected, 0, cells.Length / 4 - 1);
      // the ring sprite carries its glow margin — overhang like the app's
      Anchor(ringRt, i, 0.11f);
      ringRt.SetAsLastSibling();
    }
  }
}
`;

/* Runtime script: the CLAIM BURST — the app's gift-open celebration in
   engine terms (owner: "supposed to have the claim explosion to white").
   White-hot ignition of the piece's own aura, a scale pop, and a themed
   particle throw in the kit's Bevel/Glow/Highlight inks — the exact
   recipe LiveArt fires on the web. One class per file (Unity binding). */
const CLAIMBURST_RUNTIME = `using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace PatternBreak {
  /* Claim burst — white-hot flash + themed particle throw on click.
     Wired to the gift box by the importer; add it to anything that
     should celebrate. Colors and the spark sprite are serialized at
     import — nothing here invents a look. All children spawn on the
     first click and are reused, so Update never allocates. */
  [AddComponentMenu("UI Kit Maker/Claim Burst")]
  public class ClaimBurst : MonoBehaviour, IPointerClickHandler {
    [Tooltip("Soft silhouette sprite for the flash and the sparks — the piece's own aura (<family>-glow.png).")]
    public Sprite spark;
    [Tooltip("Particle inks, cycled — the kit's Bevel / Glow / Highlight wells.")]
    public Color[] inks = new Color[0];
    public int particles = 26;
    [Tooltip("Throw distance as a fraction of the piece's width.")]
    public float throwFrac = 0.75f;
    public float flashSeconds = 0.42f;
    public float life = 0.95f;
    RectTransform rt;
    Image flash;
    RectTransform[] parts;
    Vector2[] dirs;
    float t = -1f;
    Vector3 baseScale;
    void Awake() { rt = GetComponent<RectTransform>(); baseScale = rt.localScale; }
    void OnDisable() { if (t >= 0f) Settle(); }
    public void OnPointerClick(PointerEventData e) { Fire(); }
    public void Fire() {
      if (t >= 0f) return;
      if (flash == null) Build();
      if (flash == null) return;
      t = 0f;
      float reach = rt.sizeDelta.x * throwFrac;
      for (int i = 0; i < parts.Length; i++) {
        // the app's own spread: even fan plus a small per-third stagger,
        // distance stepping through the same 37-step lattice
        float a = (i / (float)parts.Length) * Mathf.PI * 2f + (i % 3) * 0.31f;
        float d = reach * (0.4f + ((i * 37) % 92) / 92f * 0.6f);
        dirs[i] = new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * d;
        parts[i].gameObject.SetActive(true);
        parts[i].anchoredPosition = Vector2.zero;
      }
      flash.gameObject.SetActive(true);
    }
    void Build() {
      if (spark == null) return;
      var fGo = new GameObject("Claim flash", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      fGo.hideFlags = HideFlags.DontSave;
      var fRt = fGo.GetComponent<RectTransform>();
      fRt.SetParent(rt, false);
      fRt.anchorMin = Vector2.zero; fRt.anchorMax = Vector2.one;
      fRt.offsetMin = new Vector2(-8f, -8f); fRt.offsetMax = new Vector2(8f, 8f);
      flash = fGo.GetComponent<Image>();
      flash.sprite = spark;
      flash.color = new Color(1f, 1f, 1f, 0f);
      flash.raycastTarget = false;
      parts = new RectTransform[Mathf.Max(0, particles)];
      dirs = new Vector2[parts.Length];
      for (int i = 0; i < parts.Length; i++) {
        var p = new GameObject("Spark", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        p.hideFlags = HideFlags.DontSave;
        var pr = p.GetComponent<RectTransform>();
        pr.SetParent(rt, false);
        float s = 6f + ((i * 13) % 8);
        pr.sizeDelta = new Vector2(s, s);
        var pi = p.GetComponent<Image>();
        pi.sprite = spark;
        pi.raycastTarget = false;
        pi.color = inks.Length > 0 ? inks[i % inks.Length] : Color.white;
        p.SetActive(false);
        parts[i] = pr;
      }
      fGo.SetActive(false);
    }
    void Settle() {
      t = -1f;
      rt.localScale = baseScale;
      if (flash != null) flash.gameObject.SetActive(false);
      if (parts != null) foreach (var p in parts) if (p != null) p.gameObject.SetActive(false);
    }
    void Update() {
      if (t < 0f) return;
      t += Time.unscaledDeltaTime;
      // white-hot ignition, then cool — the app's 0.42s fxHot curve
      float f = Mathf.Clamp01(t / flashSeconds);
      if (flash != null) {
        flash.color = new Color(1f, 1f, 1f, 0.95f * (1f - f * f));
        flash.transform.SetAsLastSibling();
      }
      rt.localScale = baseScale * (1f + 0.12f * Mathf.Sin(f * Mathf.PI));
      // the throw: fast out, easing to rest, fading through the back half
      float u = Mathf.Clamp01(t / life);
      float ease = 1f - (1f - u) * (1f - u);
      for (int i = 0; i < parts.Length; i++) {
        if (parts[i] == null) continue;
        parts[i].anchoredPosition = dirs[i] * ease;
        var img = parts[i].GetComponent<Image>();
        var c = img.color; c.a = u < 0.5f ? 1f : 1f - (u - 0.5f) * 2f; img.color = c;
      }
      if (t >= life) Settle();
    }
  }
}
`;

/* Runtime scripts: the BOARD RIGS — small behaviors that make placed
   scenes PLAY like the boards read (owner: difficulty selectable, the
   countdown counting, the damage number popping, the radar sweeping).
   ONE CLASS PER FILE: Unity binds a saved component to its script file
   only when the file holds a single class — four classes in one file
   left every one of them "referenced script missing" on scene load
   (field: dead difficulty row, static countdown, frozen radar). The
   file name keeps SelectGroup so existing installs overwrite in place. */
const BOARD_RIGS_RUNTIME = `using UnityEngine;
using UnityEngine.UI;

namespace PatternBreak {
  /* Select group — a row of buttons (difficulty keycaps, tab strips)
     where clicking one holds its pressed face and releases the others.
     The scene builder wires rows of 2+ keycaps/tabs automatically; hook
     onChanged(int) for your own logic. */
  [AddComponentMenu("UI Kit Maker/Select Group")]
  public class SelectGroup : MonoBehaviour {
    public Button[] members = new Button[0];
    public int selected = 0;
    [System.Serializable] public class PickEvent : UnityEngine.Events.UnityEvent<int> {}
    public PickEvent onChanged = new PickEvent();
    Sprite[] rest;
    void Awake() {
      rest = new Sprite[members.Length];
      for (int i = 0; i < members.Length; i++) {
        if (members[i] == null) continue;
        var img = members[i].targetGraphic as Image;
        rest[i] = img != null ? img.sprite : null;
        int idx = i;
        members[i].onClick.AddListener(() => Pick(idx));
      }
      Apply();
    }
    public void Pick(int i) { selected = i; Apply(); onChanged.Invoke(i); }
    void Apply() {
      for (int i = 0; i < members.Length; i++) {
        if (members[i] == null) continue;
        var img = members[i].targetGraphic as Image;
        if (img == null) continue;
        var press = members[i].spriteState.pressedSprite;
        img.sprite = i == selected && press != null ? press : rest[i];
      }
    }
  }
}
`;

/* Countdown label — one class per file (see BOARD_RIGS_RUNTIME). */
const COUNTDOWN_RUNTIME = `using UnityEngine;

namespace PatternBreak {
  /* Countdown label — a numeric stamp that actually counts (owner: the
     numerics should animate on play). Parses m:ss from the label at
     start, or set seconds yourself; loops for the demo, onElapsed for
     real use. Pairs with a HeroLabel on the same object. */
  [AddComponentMenu("UI Kit Maker/Countdown Label")]
  public class CountdownLabel : MonoBehaviour {
    [Tooltip("-1 = parse from the label's current text (m:ss or s).")]
    public float seconds = -1f;
    public bool loop = true;
    [System.Serializable] public class DoneEvent : UnityEngine.Events.UnityEvent {}
    public DoneEvent onElapsed = new DoneEvent();
    float t; HeroLabel hl; bool armed;
    void Start() {
#if UNITY_2023_2_OR_NEWER
      hl = GetComponent<HeroLabel>();
      if (seconds < 0f) {
        seconds = 60f;
        if (hl != null && !string.IsNullOrEmpty(hl.text)) {
          var parts = hl.text.Trim().Split(':');
          float mm, ss;
          if (parts.Length == 2 && float.TryParse(parts[0], out mm) && float.TryParse(parts[1], out ss)) seconds = mm * 60f + ss;
          else if (parts.Length == 1 && float.TryParse(parts[0], out ss)) seconds = ss;
        }
      }
      t = seconds; armed = true;
#endif
    }
    void Update() {
#if UNITY_2023_2_OR_NEWER
      if (!armed || hl == null) return;
      t -= Time.deltaTime;
      if (t <= 0f) { onElapsed.Invoke(); if (loop) t = seconds; else { t = 0f; armed = false; } }
      int whole = Mathf.Max(0, Mathf.CeilToInt(t));
      string txt = (whole / 60) + ":" + (whole % 60).ToString("00");
      if (txt != hl.text) hl.SetText(txt);
#endif
    }
  }
}
`;

/* Pop number — one class per file (see BOARD_RIGS_RUNTIME). */
const POP_NUMBER_RUNTIME = `using UnityEngine;

namespace PatternBreak {
  /* Pop number — the damage-number beat: pop, drift up, fade, repeat.
     A looping demo out of the box; call Show(n) from your game to fire
     one real pop with a new value. */
  [AddComponentMenu("UI Kit Maker/Pop Number")]
  public class PopNumber : MonoBehaviour {
    public float period = 1.6f;
    public bool demoLoop = true;
    float t; Vector3 s0; Vector2 p0; RectTransform rt; CanvasGroup cg; HeroLabel hl;
    void Start() {
      rt = (RectTransform)transform; s0 = rt.localScale; p0 = rt.anchoredPosition;
      hl = GetComponent<HeroLabel>();
      cg = gameObject.GetComponent<CanvasGroup>();
      if (cg == null) cg = gameObject.AddComponent<CanvasGroup>();
    }
    public void Show(int n) {
#if UNITY_2023_2_OR_NEWER
      if (hl != null) hl.SetText(n.ToString("N0"));
#endif
      t = 0f; demoLoop = false; enabled = true;
    }
    void Update() {
      if (rt == null) return;
      t += Time.deltaTime;
      float f = (t % period) / period;
      if (!demoLoop && t >= period) { rt.localScale = s0; rt.anchoredPosition = p0; cg.alpha = 1f; enabled = false; return; }
      float pop = 1f + 0.22f * Mathf.Exp(-6f * f) * Mathf.Sin(10f * f);
      rt.localScale = s0 * pop;
      rt.anchoredPosition = p0 + new Vector2(0f, 26f * f);
      cg.alpha = f < 0.75f ? 1f : 1f - (f - 0.75f) / 0.25f;
    }
  }
}
`;

/* Radar demo — one class per file (see BOARD_RIGS_RUNTIME). */
const RADAR_DEMO_RUNTIME = `using UnityEngine;
using UnityEngine.UI;

namespace PatternBreak {
  /* Radar demo — a sweeping line and drifting blips over the mini-map
     frame, so the piece reads alive on day one. Everything it moves is
     named "Demo …": delete those children and drive your own icons, or
     keep the component and repoint the fields. */
  [AddComponentMenu("UI Kit Maker/Radar Demo")]
  public class RadarDemo : MonoBehaviour {
    public RectTransform sweep;
    public RectTransform[] blips = new RectTransform[0];
    public float rpm = 8f;
    public float drift = 14f;
    [Tooltip("Degrees the sweep art's painted ray sits from rotation zero. Retune if your own sweep sprite points elsewhere.")]
    public float sweepRay = 90f;
    [Tooltip("How fast a swept blip's flash fades, per second.")]
    public float flashFade = 2.2f;
    Vector2[] p0;
    Graphic[] gr;
    Color[] c0;
    Vector3[] s0;
    float[] heat;
    float prevA;
    void Start() {
      p0 = new Vector2[blips.Length];
      gr = new Graphic[blips.Length];
      c0 = new Color[blips.Length];
      s0 = new Vector3[blips.Length];
      heat = new float[blips.Length];
      for (int i = 0; i < blips.Length; i++) if (blips[i] != null) {
        p0[i] = blips[i].anchoredPosition;
        s0[i] = blips[i].localScale;
        gr[i] = blips[i].GetComponent<Graphic>();
        if (gr[i] != null) c0[i] = gr[i].color;
      }
      prevA = 0f;
    }
    void Update() {
      float a = -Time.time * 6f * rpm;
      if (sweep != null) sweep.localRotation = Quaternion.Euler(0f, 0f, a);
      // degrees the ray covered this frame (clamped so a hiccup can't
      // flash the whole dial at once)
      float swept = Mathf.Min(Mathf.Abs(a - prevA), 90f);
      for (int i = 0; i < blips.Length; i++) {
        if (blips[i] == null) continue;
        blips[i].anchoredPosition = p0[i] + new Vector2(Mathf.Sin(Time.time * 0.7f + i * 2.1f), Mathf.Cos(Time.time * 0.55f + i * 1.3f)) * drift;
        /* the pass-glow (owner: "when the radar passes a blip the blip
           should glow for a little bit") — flash when the ray crossed
           this blip's bearing during the frame, then cool */
        var bp = blips[i].anchoredPosition;
        float bearing = Mathf.Atan2(bp.y, bp.x) * Mathf.Rad2Deg;
        float past = Mathf.DeltaAngle(a + sweepRay, bearing);
        if (past >= 0f && past <= swept) heat[i] = 1f;
        else heat[i] = Mathf.Max(0f, heat[i] - Time.deltaTime * flashFade);
        blips[i].localScale = s0[i] * (1f + 0.45f * heat[i]);
        if (gr[i] != null) {
          var c = Color.Lerp(c0[i], Color.white, heat[i] * 0.65f);
          c.a = Mathf.Lerp(c0[i].a, 1f, heat[i]);
          gr[i].color = c;
        }
      }
      prevA = a;
    }
  }
}
`;

/* Runtime script #4: the season track's CONTENT rig — the look is baked
   art (edited on uikitmaker.com), the content is live engine text this
   component owns and lays out. Prototyper-first Inspector (owner). */
const SEASON_TRACK_RUNTIME = `using UnityEngine;
#if UNITY_2023_2_OR_NEWER
using TMPro;
#endif

namespace PatternBreak {
  /* Season track content. THE LOOK IS EDITED ON UIKITMAKER.COM — re-export
     the kit to restyle the track art. This component owns the CONTENT:
     lane names, level numbers and progress, as live text and a live fill
     over the bare track sprite. Anchors are fractions of this rect —
     nudge them in the Inspector if your layout drifts. */
  [ExecuteAlways]
  [AddComponentMenu("UI Kit Maker/Season Track")]
  public class SeasonTrack : MonoBehaviour {
#if UNITY_2023_2_OR_NEWER
    [Header("Content — the LOOK is edited on uikitmaker.com")]
    public string laneA = "FREE";
    public string laneB = "PREMIUM";
    public int firstLevel = 12;
    [Range(0f, 1f)] public float progress = 0.5f;
    [Header("Type")]
    public TMP_FontAsset face;
    public float labelSize = 16f;
    public Color laneAColor = Color.white;
    public Color laneBColor = new Color(0.98f, 0.8f, 0.08f);
    public Color progressColor = new Color(0.4f, 0.9f, 1f, 0.9f);
    [Header("Anchors (fractions of this rect)")]
    public Vector2 laneAAnchor = new Vector2(0.11f, 0.72f);
    public Vector2 laneBAnchor = new Vector2(0.11f, 0.28f);
    public float[] nodeX = new float[] { 0.24f, 0.5f, 0.76f };
    public float nodeY = 0.5f;
    void OnEnable() { Rebuild(); }
    void OnValidate() { if (transform.Find("LaneA") != null) Apply(); }
    TextMeshProUGUI Ensure(string childName) {
      var t = transform.Find(childName);
      var g = t != null ? t.gameObject : null;
      if (g == null) { g = new GameObject(childName, typeof(RectTransform)); g.transform.SetParent(transform, false); }
      var tmp = g.GetComponent<TextMeshProUGUI>();
      if (tmp == null) tmp = g.AddComponent<TextMeshProUGUI>();
      tmp.raycastTarget = false;
      tmp.alignment = TextAlignmentOptions.Center;
      return tmp;
    }
    void Place(RectTransform rt, Vector2 frac, float w, float h) {
      rt.anchorMin = frac; rt.anchorMax = frac; rt.pivot = new Vector2(0.5f, 0.5f);
      rt.anchoredPosition = Vector2.zero; rt.sizeDelta = new Vector2(w, h);
    }
    public void Rebuild() { Apply(); }
    void Apply() {
      var a = Ensure("LaneA");
      a.text = laneA; a.fontSize = labelSize; a.color = laneAColor; if (face != null) a.font = face;
      Place(a.rectTransform, laneAAnchor, 200f, 34f);
      var b = Ensure("LaneB");
      b.text = laneB; b.fontSize = labelSize; b.color = laneBColor; if (face != null) b.font = face;
      Place(b.rectTransform, laneBAnchor, 200f, 34f);
      for (int i = 0; i < nodeX.Length; i++) {
        var n = Ensure("Node" + (i + 1));
        n.text = (firstLevel + i).ToString(); n.fontSize = labelSize * 0.85f; n.color = laneAColor; if (face != null) n.font = face;
        Place(n.rectTransform, new Vector2(nodeX[i], nodeY), 60f, 30f);
      }
      // the progress run rides the spine between the first and last node
      var t = transform.Find("Progress");
      var g = t != null ? t.gameObject : null;
      if (g == null) { g = new GameObject("Progress", typeof(RectTransform), typeof(CanvasRenderer), typeof(UnityEngine.UI.Image)); g.transform.SetParent(transform, false); g.transform.SetSiblingIndex(0); }
      var img = g.GetComponent<UnityEngine.UI.Image>();
      img.color = progressColor; img.raycastTarget = false;
      var prt = (RectTransform)g.transform;
      float x0 = nodeX.Length > 0 ? nodeX[0] : 0.2f;
      float x1 = nodeX.Length > 0 ? nodeX[nodeX.Length - 1] : 0.8f;
      prt.anchorMin = new Vector2(x0, nodeY - 0.012f);
      prt.anchorMax = new Vector2(x0 + (x1 - x0) * Mathf.Clamp01(progress), nodeY + 0.012f);
      prt.offsetMin = Vector2.zero; prt.offsetMax = Vector2.zero;
    }
#endif
  }
}
`;

/* ── README imagery (owner: "let's try to stack the readme with
   imagery"). The plates are drawn by the SAME engine that draws the
   components, from the MAKER'S OWN kit, and rasterized at export time —
   a stock screenshot would show someone else's buttons. Annotations are
   plain SVG in a system face, so the sealed rasterization needs no
   embedded font. ── */
async function readmeFigures(base: GenConfig): Promise<{ path: string; data: Uint8Array }[]> {
  const esc2 = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dimsOf = (svg: string) => {
    const m = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    return { w: m ? +m[1] : 0, h: m ? +m[2] : 0 };
  };
  /* the shell's box in the PLATE's coordinates: data-shell (the DRAWN
     box — extrusion-headroom shift included) in viewBox units, and the
     renderer's glow pad pushes the viewBox origin negative — miss either
     and every callout lands off the button */
  const shellOf = (svg: string) => {
    const m = /data-shell="([-\d. ]+)"/.exec(svg) ?? /data-shell0="([-\d. ]+)"/.exec(svg);
    const v = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!m || !v) return null;
    const [x, y, w, h] = m[1].split(" ").map(Number);
    return { x: x - +v[1], y: y - +v[2], w, h };
  };
  const INK = "#E9EDF7", DIM = "#96A0B8", LINE = "#5C6organ".replace("organ", "B8A"); // quiet slate
  const txt = (x: number, y: number, s: string, o: { size?: number; fill?: string; weight?: number; anchor?: string } = {}) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="${o.size ?? 15}" font-weight="${o.weight ?? 600}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? "start"}" dominant-baseline="central">${esc2(s)}</text>`;
  const plate = (w: number, h: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">` +
    `<rect width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#12141C"/>${body}</svg>`;
  const place = (svg: string, x: number, y: number, s: number) =>
    `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(4)})">${svg}</g>`;
  const out: { path: string; data: Uint8Array }[] = [];

  /* PLATE 1 — button anatomy: what the prefab is made of, with callouts
     at the real geometry (data-shell0 gives the shell's true box). */
  {
    const btn = renderKit(base, "primary", "l", "default", undefined, undefined, { label: "PLAY" });
    const d = dimsOf(btn), sh = shellOf(btn);
    if (d.w && sh) {
      const s = Math.max(0.3, Math.min(1.05, 430 / sh.w));
      const padX = 40, padY = 34, colGap = 34, colW = 460;
      const rowsSrc: { at: [number, number]; head: string; body: string[] }[] = [
        { at: [0.14, 0.22], head: "the base sprite (family-base.9)",
          body: ["Nine-sliced: stretch it to any size and the", "corners stay crisp. Hover, pressed and", "disabled sprites swap in automatically."] },
        { at: [0.5, 0.5], head: "Label → one Fill text + echo layers",
          body: ["One real text; shadow, stroke and glints are", "echoes — the same letters repainted in the", "app's inks. One geometry, so nothing drifts."] },
        { at: [0.62, 0.84], head: "Hero Label (on the Label object)",
          body: ["One box drives the whole stack: text, size,", "spacing and nudge. Resize the button and", "the word scales with it."] },
      ];
      // the text column sets the rhythm; the plate is only as tall as the
      // taller of the two columns (no acres of empty background)
      const rowH = (r: typeof rowsSrc[number]) => 26 + r.body.length * 21;
      const GAPY = 40;
      const textH = rowsSrc.reduce((a, r) => a + rowH(r), 0) + GAPY * (rowsSrc.length - 1);
      /* frame the SHELL, not the render canvas: the renderer reserves a
         glow pad and a deep shadow allowance below, which as a plate
         reads as acres of empty background */
      const bw2 = sh.w * s, bh = sh.h * s;
      const mX = 58, mTop = 64, mBot = 92;
      const artRegionW = bw2 + mX * 2, artRegionH = bh + mTop + mBot;
      const W = padX + artRegionW + colGap + colW + padX;
      const H = Math.max(artRegionH, textH) + padY * 2 + 18;
      const artTop = 18 + (H - 18 - artRegionH) / 2;
      const bx = padX + mX, by = artTop + mTop;
      const colX = padX + artRegionW + colGap;
      let body = place(btn, bx - sh.x * s, by - sh.y * s, s);
      let cy2 = 18 + (H - 18 - textH) / 2;
      for (const r of rowsSrc) {
        const ax = bx + bw2 * r.at[0], ay = by + bh * r.at[1];
        const ty = cy2 + 10;
        body += `<path d="M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${(colX - 20).toFixed(1)} ${ty.toFixed(1)}" fill="none" stroke="${LINE}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.8"/>`;
        body += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="4.5" fill="${INK}" opacity="0.95"/>`;
        body += txt(colX, ty, r.head, { size: 17, weight: 800 });
        r.body.forEach((l, i) => { body += txt(colX, ty + 25 + i * 21, l, { size: 14, weight: 500, fill: DIM }); });
        cy2 += rowH(r) + GAPY;
      }
      body += txt(padX, 26, "ANATOMY OF A GENERATED PREFAB", { size: 12, weight: 800, fill: DIM });
      const { bytes } = await svgToPngBytes(plate(W, H, body), 2);
      out.push({ path: "docs/button-anatomy.png", data: bytes });
    }
  }

  /* PLATE 2 — the states, as the Button component swaps them. */
  {
    const names: [string, "default" | "hover" | "pressed" | "disabled"][] =
      [["Default", "default"], ["Hover", "hover"], ["Pressed", "pressed"], ["Disabled", "disabled"]];
    const svgs = names.map(([, st2]) => renderKit(base, "primary", "m", st2, undefined, undefined, { label: "PLAY" }));
    const sh0 = shellOf(svgs[0]);
    if (sh0) {
      // framed on the shell (like the anatomy plate) so the strip isn't
      // mostly the renderer's glow allowance
      const s = Math.max(0.28, Math.min(0.85, 250 / sh0.w));
      const mX = 34, mTop = 44, mBot = 52;
      const cellW = sh0.w * s + mX * 2, cellH = sh0.h * s + mTop + mBot;
      const gap = 6, padX = 30, padY = 44;
      const W = padX * 2 + cellW * 4 + gap * 3, H = padY + cellH + 46;
      let body = "";
      svgs.forEach((svg, i) => {
        const x = padX + i * (cellW + gap);
        const shi = shellOf(svg) ?? sh0;
        body += place(svg, x + mX - shi.x * s, padY + mTop - shi.y * s, s);
        body += txt(x + cellW / 2, padY + cellH + 14, names[i][0].toUpperCase(), { size: 12, weight: 800, fill: DIM, anchor: "middle" });
      });
      body += txt(padX, 26, "STATES — PRE-WIRED ON EVERY BUTTON PREFAB", { size: 12, weight: 800, fill: DIM });
      const { bytes } = await svgToPngBytes(plate(W, H, body), 2);
      out.push({ path: "docs/states.png", data: bytes });
    }
  }
  return out;
}

/* The walkthrough deck, tuned per scope — ease of use is the product.
   Owner mandate: reads like a presentation aimed at the Unity dev, one
   idea per slide, boring-but-vital detail in callouts, walking the
   whole export in the order a dev actually meets it. */
function unityReadme(st: EngineExportState, fontShipped: boolean, bakedShipped = false, figures = false): string {
  const root = `Assets/UIKitMaker/${sanitizeUnitySlug(st.slug) ?? "ui-kit"}`;
  return `# ${st.kitName} — the Unity walkthrough

Three steps, then a slide-by-slide tour of the whole export.

1. Unzip this download.
2. Drag the **UIKitMaker** folder into your Unity project's **Assets/**
   folder (or extract it straight there).
3. That's it. Unity imports everything by itself and the Console prints
   a one-line receipt. Ready-made prefabs are BUILT FOR YOU in
   **${root}/Prefabs** — drag one into your Canvas and press Play.

The slides run in the order you'll actually meet things: what imported,
your first scene, states, hero labels, tuning type, stretching wide,
re-exporting. Skim the titles; stop where your question lives.
${figures ? `
![Anatomy of a generated prefab: the nine-sliced sprite, the one-text echo label, and the Hero Label box that drives it](docs/button-anatomy.png)

*Every picture in this README is YOUR kit, rendered at export time —
this is not a stock manual.*
` : ""}
---

## 01 · What just happened when you dropped it

Every sprite arrived nine-sliced with the right pivots and
pixels-per-unit, and the importer BUILT prefabs inside your project,
already wired: sliced sprites, the kit's hover/pressed/disabled states
on the Button, a live label. ${st.scope === "free"
    ? "The starter generates three (PrimaryButton, Chip, ProgressBar); the full kit generates one per component."
    : "Every component family gets one — buttons, panels, rows, slots, badges and more."}
The Project window highlights **${root}/Prefabs** when they land, right
after the Console receipt. They're generated once and never touched
again — edit them freely.

> **Why aren't the prefabs just in the zip?** A prefab file can only
> reference sprites through the identity (GUID) that YOUR Unity assigns
> each PNG at import. A prefab shipped inside a zip would arrive with
> every sprite slot empty — the old drag-it-yourself experience. Built
> inside your project, seconds after the drop, every slot is full.

> **No hidden state.** kit-manifest.json holds every border, pivot and
> hash in plain JSON; kit.lock.json is the last import's receipt.
> Everything the importer does is data you could set by hand — the
> script only saves you the typing.

---

## 02 · Your first scene, in sixty seconds

Drag any prefab from **${root}/Prefabs** into a Canvas, press Play,
mouse over it. That's the kit working — states, glow and press lift
included.

No scene handy? Open **${root}/Playground.unity** (generated on first
import) and press Play: a camera, a raycasting canvas, exactly one
EventSystem with the input module your project actually uses, and every
example placed. The pieces hang off a single **Board** object, scaled
down so the whole kit fits the 1920×1080 canvas — set the Board's Scale
back to 1 to work at true size and scroll around. (Playground.unity is
never overwritten once it exists; **Tools > PatternBreak > Rebuild Kit
Playground Scene** replaces it.)

**Your boards arrived as scenes.** If the kit was exported with screens
composed on the app's Board, each one is a ready scene in
**${root}/Scenes/** — background placed (the original upload, full
resolution), every piece zone-anchored so the layout survives other
aspect ratios, and any per-copy words already set on the live labels.
Open one, press Play; buttons respond. Like the Playground, a board
scene builds once and is then yours — **Tools > PatternBreak > Rebuild
Kit Board Scenes** regenerates them from the manifest when you want a
fresh copy.

> **Buttons ignoring the mouse in your own scene?** The usual suspects
> are a duplicate EventSystem (keep exactly one) or an EventSystem
> whose input module doesn't match the project's Active Input Handling.

**Scene pieces vs Prefabs — the working contract.** A board scene is a
FINISHED composition: every piece on it was crafted at its exact size,
words and pose on uikitmaker.com, and it arrives here pixel-faithful to
that intent. Treat scene pieces as final art with live words — retype a
label, nudge a position, wire an OnClick, and ship. When you need a NEW
button, a different size, or real customization, **start from
${root}/Prefabs/** — those are the elastic, resizable versions built for
exactly that. Reshaping a scene piece by hand fights art that was
already resolved; the prefab is the piece that wants your hands on it.

---

## 03 · States — designed, shipped, pre-wired
${figures ? `
![The four button states — default, hover, pressed and disabled — as the Button component swaps them](docs/states.png)
` : ""}
Interactive pieces ship their DESIGNED states (base-hover /
base-pressed / base-disabled next to base), and the generated Button
prefabs arrive with **Sprite Swap already wired** — nothing to
reconnect. What a swapped sprite can't carry is composed in-engine by
the small **StateFx** runtime on each prefab: the hover glow (the kit's
own glow color over fx/fx-glow.png, shaped to the piece) and the press
lift, driven by pointer events with the exact numbers you set on
uikitmaker.com.

> **The aura, in your own scenes.** The glow field around pieces in the
> app is the kit's bloom, and an aura must overlap whatever sits behind
> it — so it can't ship inside a cropped sprite. Compose it the way the
> Playground does: fx/fx-glow.png behind the piece, tinted the manifest's
> palette.glow, sized by the bloom block. That's the full resting look.

---

## 04 · Labels are live text — never pixels

${fontShipped
    ? `Your kit's face ships in **fonts/** with its open-font license
beside it. On Unity 2023.2+ the importer builds **KitFace SDF** from it
automatically and styles the material with the kit's own type recipe;
prefab labels arrive already wearing it. On older editors labels use the
shipped TTF, and the recipe in kit-manifest.json > typography > style is
ready to become a TMP material preset by hand.`
    : `The kit's face is named in kit-manifest.json > typography with its
Google Fonts link — download the TTF, drop it in the project, and swap
it onto the prefab labels (the export couldn't fetch it automatically
this time). The styled-text recipe lives in typography > style.`}

${bakedShipped ? `### KitFace Baked — hero text in the app's exact pixels

Beside the SDF face, the kit ships a BAKED color font: A–z, 0–9 and
punctuation, every glyph rendered by the app's own engine with the FULL
treatment — pattern, glints and gloss included — assembled on import as
**fonts/KitFace Baked.asset**. For titles, buttons and victory text:
set a label's Font Asset to *KitFace Baked*, keep the label color WHITE,
and leave **Color Gradient OFF** — these glyphs come pre-painted, and a
gradient on top tints them muddy. (The opposite of KitFace SDF, where
Color Gradient IS the paint.) It's raster art — crisp at
and below its baked size, softening far beyond, like any bitmap game
font; the SDF face stays the size-proof workhorse for everything else.
Re-exports re-bake the atlas and Regenerate Example Prefabs reassembles
the font in place, so placed labels restyle with the kit.

### The HeroLabel prefab — one text, echo inks

Want the strokes to MERGE behind the letterforms like the app (no
sticker-overlap between tight letters)? That's the **HeroLabel** prefab,
and it works like this: there is ONE real text — the **Fill** — and the
other layers are **echoes**: invisible painters that redraw the very
same letters wearing a different ink. Shadow and stroke echo behind the
word (every stroke fusing into one silent band), glints echo in front —
and the glint's light band isn't stamped into any letter: the GlintInk
shader draws it live across the whole word, one sweep at the kit's own
light angle, blended with the kit's own blend mode. Type anything, any
length — the streak crosses the letterforms as one graphic, exactly as
the app draws it.
Because each layer is literally the same letters repainted — one
geometry, one kerning table, one line-wrap — the layers **cannot**
drift, lag, or wrap differently. Not "are kept in sync": there is
nothing separate to sync. Retype the word, scrub the size, change the
line height — the whole stack IS the text. Type on the Fill or on the
root's **Hero Label** box, whichever you reach first; they stay in
step. (The echoes appear in the Hierarchy as "Stroke (echo)" etc. —
they rebuild themselves, never save to disk, and need nothing from
you.) Solo KitFace Baked stays the one-object option.

` : ""}Hand-made SDF labels start WHITE — the fill is a per-label setting,
not a font setting (prefab labels arrive with it wired). One click fixes
it: on the text, tick **Color Gradient** and set Color Preset to
**KitFace Gradient** (in fonts/) — the kit's own fill, and it restyles
with every re-import. Outline, glow, shadow and bevel are already on the
shared face material.

How the type treatment travels: fill and gradient, outline (outside the
letterform, like the app), glow, drop shadow, and emboss (lit from the
kit's own light angle) translate 1:1 onto live text. The letterform
pattern, glints and per-letter gloss stay OFF live labels on purpose —
a shared text material can't carry them correctly for every label a
game might type. They're exactly what Type Stamps are for; the pattern
also ships as a seamless tile (fonts/face-pattern.png, tiling density
in the manifest's pattern.reps) if you want it in the face material's
Face Texture slot for a specific label.
${st.cfg.type.stripes?.on ? `
### The letterform pattern on ONE label, by hand

The kit ships everything needed; it just doesn't apply it for you,
because the right tiling depends on how long each label is.

1. Select the label (e.g. Prefabs > ButtonPrimary > Label).
2. In the Inspector, open the context menu on the material header
   ("KitFace SDF Material") and choose **Create Material Preset** —
   this label gets its own copy; every other label keeps the shared face.
3. In the preset's **Face** section, drag \`fonts/face-pattern.png\`
   into **Texture**, and set **Tiling** X and Y to the \`reps\` number
   from kit-manifest.json > typography > style > pattern.
4. On the text component, set **Horizontal Mapping** to Line and
   **Vertical Mapping** to Match Aspect — the pattern flows across the
   word with square cells, like the app.
5. Label longer than a word or two? Raise Tiling until the cells match
   the rest of your kit (bigger number = smaller cells).

The tile is seamless and pre-rotated to the kit's pattern angle
(snapped to 45°). It multiplies the face color: the white ground leaves
your fill untouched; the pattern strokes tint through.
` : ""}

For pixel-perfect HERO text — titles, banners, victory moments — use
**Type Stamps** on uikitmaker.com: type your phrases, download, extract
into Assets/ — they land in ${root}/stamps as ready sprites in the full
styled treatment, and re-exports overwrite in place like everything else.

**How faithful is the type?** The baked faces snapshot the app's exact
glyphs — the font instance your kit uses (variable-font width/weight
included), its gradients, patterns and effects — plus each letter's true
width AND the font's kerning pairs, measured in the app and written into
the TMP faces. What can't travel: live variable-font axes (Unity's text
system has no dials for them — the kit's instance is frozen in) and
browser-only shaping extras. If a word ever spaces differently than the
app, re-export first — older zips predate the kerning bake.

---

## 05 · Shaping the word: move, size, leading

Select the **Label** object and use **Hero Label → Nudge** (Y up is
positive). One field and the whole word moves — shadow, stroke and
glints included, because they are repaints of the same letters.

Or just edit the Fill text directly: Font Size, Margins, tracking,
**Line Spacing (leading)** — every layer follows the moment you type,
since there is no separate shadow or stroke object left to fall behind.
(Older kits DID have a separate Shadow text, and a line-height change
could leave it stranded until you matched the number by hand — that
chore is gone; re-import this kit and the old texts retire themselves.)
The Hero Label fields exist to REMEMBER your values so they survive
re-imports; anything you tune on the text adopts into them by itself.

---

## 06 · The kerning clinic: tuning a letter pair by hand

Say the A–Y gap bothers you. The kerning table lives on the **font
asset** — NOT on the text object. Selecting a label shows you the
TextMeshPro component and its material; neither has the table.

1. In the **Project window** open \`${root}/fonts\` and click
   **KitFace Baked Layers** (the blue **F** icon). Shortcut: with a label
   selected, click the little ⊙ target at the right of its *Font Asset*
   field to ping the asset, then click the asset itself.
2. In that asset's Inspector, scroll past Face Info / Generation
   Settings / Atlas & Material to the tables at the very bottom.
   Depending on your TextMesh Pro version the section is called
   **Glyph Adjustment Table** or **Font Feature Table → Glyph Pair
   Adjustment Records**.
3. Find the pair and edit the FIRST (left) glyph's **AX / X Advance** —
   negative pulls the letters together, live in the scene. The right
   glyph's AX is a different thing: it sets the gap AFTER that letter.
4. Mind the case. Every pair is listed separately, and the glyph IDs run
   \`A\`=1…\`Z\`=26, then \`a\`=27…\`z\`=52 — so a button reading PLAY needs
   the row whose right glyph is uppercase **Y (ID 25)**, not lowercase
   \`y\` (ID 51). Sanity check against neighbouring diagonals (A–V, A–W):
   a pair that reads near zero while its neighbours read −14 is usually
   the wrong row.

### Where the numbers come from, and where they live

- **The bake measures your font.** At export we set every letter pair
  against its two letters' solo widths in the browser, at your kit's
  exact font instance, and ship the differences. That's the typeface's
  own kerning, captured — nothing invented.
- **Units are the baked em, not pixels.** The baked em is
  \`${Math.round(52 * 3)}\` units, so \`-14\` is about −0.09 em: roughly
  −5 px on a label rendering near 55. Compare a pair against its
  neighbours (A–V, A–W) rather than guessing an absolute number.
- **There is only ONE table.** The whole hero stack — fill, stroke,
  shadow, glints — is a single font asset, **KitFace Baked Layers**,
  and every label lays its word out exactly once from it. Tune a pair
  and every layer moves AS YOU TYPE, because the other layers are
  repaints of the same letters, not copies with their own tables. There
  is no second place a kerning number could live, so there is nothing
  to sync, nothing to overwrite, and nothing that can lag behind.
- **OX and OY travel too.** Nudge a pair's placement, not just its
  advance, and the whole stack carries it — and it survives re-imports.
- **A half-entered row is safe.** "Add New Glyph Adjustment Record"
  gives you a blank pair; nothing touches your font while you type
  (the bookkeeping pass only reads), and a pair with no numbers yet is
  never mistaken for a tweak.
- **Your edits live in \`fonts/kerning-overrides.json\`.** Saving — or
  just pausing for a second — records your deviations from the shipped
  bake into that file. It is never shipped in a zip, so extracting a new
  export over the same folder cannot clobber it, and every import
  re-applies it onto the rebuilt asset. Reverting a pair back to the
  shipped value removes it from the record.
- **Renaming the kit leaves it behind.** A new kit name mints a new
  Unity folder; copy \`fonts/kerning-overrides.json\` across if you want
  the tuning to follow.
- **To start clean**, delete that file and re-import — you're back to the
  typeface's own spacing.

**Pair not in the list at all?** Then the font itself specifies no kern
for it — the table only carries what the typeface asks for, and plenty
of display faces kern their lowercase thoroughly and their capitals
barely at all. Add the record by hand: **+** at the bottom of the table,
set the first glyph to the left letter's ID and the second to the right
letter's (\`A\`=1 … \`Z\`=26, \`a\`=27 … \`z\`=52 — so A–Y is 1 and 25), then
pull the first glyph's AX negative.

The import receipt tells you the table is really there: each face logs
"N kerning pairs written". If it says KERNING SKIPPED, your TMP version
refused the table — send that line to uikitmaker.com.

**Which asset do I open?** \`fonts/KitFace Baked Layers\` — the only
one with the hero table. Quickest route: double-click the Font Asset
field on a hero label's **Fill** text. (\`KitFace Baked\` beside it is
the solo single-layer face with its own table; the \`KitFace Ink\`
files are materials, not fonts — they carry a layer's pixels and have
no tables at all.)

---

## 07 · Stretching wide — and the diagonal-stripe question

Nine-slice keeps the CORNERS honest and stretches the middle — so a
pattern living in that middle stretches with it. Horizontal and vertical
stripes survive (stretching a stripe along its own axis changes nothing),
but a DIAGONAL shears: pull a 45° chevron to double width and it lands
near 63°, with the bands wider. That's geometry, not a bug — and for the
±20–30% stretches most UI does, nobody sees it.

**You don't pick this at export time.** Sliced and Tiled read the SAME
sprite and the same nine-slice borders — Image Type lives on the Image
component of each instance, not in the asset. So every piece in this kit
can already do either; it's one dropdown on the piece you're placing,
and nothing has to be re-exported.

**Try Tiled where the middle is mostly pattern.** On the piece's
**Image** component set **Image Type** to *Tiled*: Unity repeats the
middle at native scale instead of stretching it, so the pattern keeps its
angle and rhythm at any width. **Pixels Per Unit Multiplier** on the same
component tunes how big the repeat is.

**And know what it costs.** Tiled repeats the WHOLE middle, not just the
pattern — the face gradient and the gloss sweep live in there too, so on
a glossy face you can trade a sheared pattern for a repeated highlight.
Look at both and pick per piece: flat, pattern-heavy faces usually win
with Tiled; glossy gradient faces usually win with Sliced. For a modest
stretch (±20–30%) Sliced is almost always the right answer — the shear
simply isn't visible.

### The stretch-safe face (no compromise)

When a kit wears a pattern, the wide pieces also ship **split into
layers**, and the importer builds them as ready prefabs in their own
folder — **Prefabs/Tiled face/** — so the two flavors never blur
together: \`Prefabs/\` is the plain drag-in pieces, \`Prefabs/Tiled face/\`
is the stretch-safe pattern flavor of the same names (panel, header,
both buttons, list row, item slot). The buttons in there carry the same
live label and engine-side states (glow, lift, label ink) as their
plain siblings — no sprite swap, because swapping one layer of a
layered build would double the pattern.

Inside: \`base-under.9\` (shell, rim, fill — Sliced) at the bottom, then a
hidden \`base-mask.9\` carrying a **Mask** with *Show Mask Graphic* OFF —
that clips a Tiled \`fx/fx-face-tile.png\` to the exact silhouette — and
\`base-over.9\` (gloss, grain, inner edge, specular — Sliced) laying the
light back on top. The mask has to be its own hidden layer: Unity only
alpha-clips a stencil when its graphic is hidden, so masking with
visible art gives a RECTANGULAR mask and the pattern spills. Drag
one out and stretch it as far as you like: the frame stretches, the
pattern keeps its exact angle and rhythm, and the gloss stays ONE sweep
instead of repeating. That's the app's look at any width, with no
trade — use these for wide banners, dialog frames and bars that grow.

The plain single-sprite prefabs still ship beside them; they're lighter
(one draw instead of three), so keep those for pieces that barely
stretch.

---

## 08 · Why Unity's lights don't change the kit

The kit is PRE-LIT ART. The gloss sweeps, specular hits, extrusion
shading and glints ARE the lighting — computed by the kit engine and
painted into the pixels, so what you designed is exactly what ships, on
every device, in every project. UI sprites render unlit: skyboxes and
scene lights pass through them by design. Want the light to move? That's
the Lighting angle dial on uikitmaker.com — change it and re-export, and
every gloss, bevel and emboss re-renders from the new direction (the
text bevel on live labels follows it too). Game-time reactions — hover
glow, press lift — are the states plus the fx/ layer, composed in-engine
(slide 03).

---

## 09 · Re-exporting: the one rule

When you change the kit on uikitmaker.com, download again and extract
over the SAME spot. Same folder in, same files over — every button, bar
and chip you already placed in your scenes restyles in place. Unity
tracks each sprite through a .meta file that lives beside it in your
project; the zip never contains .meta files, so overwriting a PNG keeps
its identity and nothing you built ever breaks.

**On macOS you can't actually "extract over"** — Finder never merges
folders, so a re-drop lands as "UIKitMaker 1". That's fine: drop it into
Assets anyway. The importer notices, moves every file home into
Assets/UIKitMaker (your .meta files and identities untouched), removes
the duplicate folder, and re-imports. Drop updates anywhere; the kit
finds its way.

The importer keeps four promises on every re-import:
- **Nothing is deleted without you.** Pieces removed from the kit stay on
  disk and are listed in the Console; Tools > PatternBreak > Review
  Orphaned Kit Files removes them only when you say so.
- **Unchanged files cost nothing.** The receipt (kit.lock.json) carries a
  hash per sprite, so a re-import reports exactly what's new, what
  restyled and what stayed put — and settings are only re-applied when
  they actually differ.
- **Your prefabs are yours.** The examples in Prefabs/ are generated once,
  on first import, fully wired (sliced sprites, hover/pressed/disabled
  states on the Button, a label). After that the importer never edits
  them — and because your re-exports keep the same sprite files, prefabs
  you've customized restyle automatically anyway. One additive exception:
  examples generated by an older kit version, before state wiring
  existed, get their Button + Sprite Swap added in place on the next
  import (skipped the moment a prefab carries any Selectable — your own
  wiring choices always win).
- **Everything is inspectable.** kit-manifest.json holds every border,
  pivot and hash in plain JSON; kit.lock.json is the last import's
  receipt. No hidden state.
${st.scope === "free" ? `
---

## This is the free starter kit

Three pieces — the master button, a chip and the progress bar — with the
complete import pipeline: nine-slice, states, wired prefabs and in-place
restyling all work exactly as they do in the full kit. Upgrading at
uikitmaker.com/#/pricing and re-exporting lands EVERY component in this
same folder — plus the baked hero fonts (your kit's type as app-exact,
typeable glyphs, with the layered HeroLabel treatment) — and everything
you've already placed stays put.
` : ""}
---

## 10 · When something looks wrong

**You dropped the kit while the game was running.** Unity can't build
scenes or prefabs during Play, so a kit dropped in that window waits:
the Console says **"the editor is in PLAY MODE — press STOP … and the
kit build finishes by itself."** Press Stop and it does. The sprites
land either way, so if you never press Stop you get the new art wearing
the old prefabs — new buttons, dead rollovers. The importer compares
its receipt against the manifest on every launch and finishes the
interrupted build by itself, so this heals even if you quit Unity
mid-Play.

**Something looks unsliced.** Tools > PatternBreak > Reapply Kit Import
Settings re-runs the pass (with Play off) and says exactly what it
fixed.

**Not sure which build a kit is running?** Tools > PatternBreak > Kit
Status tells you, per kit — check it before blaming the export.

**A kerning line says KERNING SKIPPED?** Your TMP version refused the
table — send that Console line to uikitmaker.com.
`;
}

/* eslint-disable no-useless-escape */
const UNITY_IMPORTER = `// UI Kit Maker / PatternBreak — kit importer. Editor-only; nothing here
// ships into your game build.
//
// THE OVERWRITE CONTRACT this file keeps (extract a newer export over the
// same folder and everything you placed restyles in place):
//  I1  stable addresses — the kit lives at Assets/UIKitMaker/<slug>/ with
//      deterministic sprite paths; re-exports land on the same paths.
//  I2  write over, never delete-and-recreate — newer exports replace bytes
//      in place; .meta files (and so GUIDs) survive, scenes keep pointing
//      at the same assets. The manifest carries a sha256 per sprite so the
//      receipt reports new / restyled / unchanged exactly.
//  I3  nothing disappears silently — pieces removed from the kit stay on
//      disk, are listed loudly, and are deleted only from the explicit
//      Tools > PatternBreak > Review Orphaned Kit Files action.
//  I4  idempotent settings — import settings are applied only when they
//      differ, so repeat imports don't churn the asset database.
//  I5  prefabs generate once — wired examples are created on FIRST import
//      only and never regenerated over files you may have edited.
// Each pass writes kit.lock.json — the receipt behind the report, orphan
// detection and support.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
#if UNITY_2023_2_OR_NEWER
// TextMeshPro ships inside uGUI from 2023.2 — guaranteed to compile.
// Older editors keep legacy Text labels + the recipe JSON (TMP there is a
// separate package we cannot assume, and a missing namespace would kill
// this whole assembly).
using TMPro;
#endif

namespace PatternBreak {
  [Serializable] class PBSlice { public int left, right, top, bottom; }
  [Serializable] class PBPivot { public float x = 0.5f, y = 0.5f; }
  [Serializable] class PBShellBox { public float x; public float y; public float w; public float h; }
  [Serializable] class PBIdle { public int wipe; public int edge; public float freq; public string blend; }
  [Serializable] class PBIdleFork { public string family; public int wipe; public int edge; }
  [Serializable] class PBAsset { public string file; public string component; public string part; public string sha256; public PBSlice nineSlice; public PBPivot pivot; public PBShellBox shell; public bool flip; public float[] outline; public float prefW; public float prefH; public float labelDx; public float labelDy; public float labelFs; }
  [Serializable] class PBStyleOutline { public string color; public string color2; public float width; }
  [Serializable] class PBStyleGlow { public string color; public float size; public float opacity; }
  [Serializable] class PBStyleShadow { public string color; public float x; public float y; public float blur; public float opacity; }
  [Serializable] class PBStyleEmboss { public float strength; public float distance; public float softness; }
  [Serializable] class PBStylePattern { public string file; public string style; public float scale; public float angle; public float reps; } // angle is already baked into the tile; reps = the app-computed tiling density
  [Serializable] class PBStyle { public int weight; public bool italic; public float labelSize; public float spacingEmPct; public string fillMode; public string fill; public string fill2; public float fillOpacity; public PBStyleOutline outline; public PBStyleGlow glow; public PBStyleShadow shadow; public PBStyleEmboss emboss; public float lightAngle; public PBStylePattern pattern; public string glintBlend; public string glintStyle; public float glintOpacity; public float glintOx; public float glintOy; public float glintLx; public float glintLy; }
  [Serializable] class PBBakedRef { public string file; public string metrics; public float pointSize; public string layerFill; public string layerStroke; public string layerShadow; public string layerGlints; }
  [Serializable] class PBBakedGlyph { public int u; public int x; public int y; public int w; public int h; public float bx; public float by; public float adv; }
  [Serializable] class PBBakedKern { public int l; public int r; public float k; }
  /* the maker's hand-tuned pairs, kept beside the faces so a re-import
     restores them (the faces themselves rebuild every drop) */
  [Serializable] class PBKernOv { public int l; public int r; public float k; public float ox; public float oy; }
  [Serializable] class PBKernOvFile { public PBKernOv[] pairs; }
  [Serializable] class PBBakedFace { public float pointSize; public float ascent; public float descent; public float lineHeight; public int atlasW; public int atlasH; public PBBakedKern[] kerning; public PBBakedGlyph[] glyphs; public int layersAtlasW; public int layersAtlasH; public PBBakedGlyph[] layerGlyphs; }
  [Serializable] class PBStateStyle { public string state; public string fillMode; public string fill; public string fill2; public float dy; }
  [Serializable] class PBTypography { public string font; public string fontFile; public PBStyle style; public PBStateStyle[] stateStyles; public PBBakedRef bakedFace; }
  [Serializable] class PBPalette { public string glow; public string highlight; public string bevel; public string markInk; public string radioInk; }
  [Serializable] class PBBloom { public float opacity; public float size; }
  [Serializable] class PBLabelState { public string family; public string state; public string fillMode; public string fill; public string fill2; public float dy; }
  [Serializable] class PBStateFx { public string family; public string state; public float glow; public float lift; }
  [Serializable] class PBLabelSize { public string family; public float size; public float scene; }
  [Serializable] class PBPlaceholder { public string text; public float left; public float size; public float centerFromTop; public string color; public float opacity; public bool italic; }
  [Serializable] class PBWell { public float x0; public float y0; public float x1; public float y1; }
  // ── Boards→Scenes: the maker's artboards, one ready scene each ──
  [Serializable] class PBBoardItem { public string component; public float cx; public float cy; public float w; public float h; public float rot; public string label; public float ax; public float ay; public string anchor; public string stamp; public string posed; public float posedW; public float posedH; public float posedDx; public float posedDy; public string posedHover; public string posedPressed; public string posedDisabled; public float posedLabelDx; public float posedLabelDy; public string ov; public float value; public bool flip; public float[] cells; public int cellSel = -1; }
  [Serializable] class PBBoardBg { public string file; public float opacity; public float blur; public float saturation; public float hue; public float brightness; public float contrast; public float noise; public string overlay; public float overlayStrength; public string overlayBlend; public bool original; }
  [Serializable] class PBBoard { public string name; public int w; public int h; public PBBoardBg bg; public PBBoardItem[] items; }
  [Serializable] class PBManifest { public string kit; public string slug; public int kitVersion; public string generatorVersion; public string tier; public int pngScale; public PBWell globeWell; public PBTypography typography; public PBPlaceholder placeholder; public PBLabelState[] labelStates; public PBStateFx[] stateFx; public PBLabelSize[] labelSizes; public PBPalette palette; public PBBloom bloom; public PBBoard[] boards; public PBAsset[] assets; public PBIdle idle; public PBIdleFork[] idleForks; }
  [Serializable] class PBLockEntry { public string file; public string sha256; }
  [Serializable] class PBLock { public string slug; public int kitVersion; public string generatorVersion; public string imported; public bool prefabsGenerated; public PBLockEntry[] files; public string[] orphans; }

  public static class KitImporter {
    /* ── I4: every setting is compared before it is written; the return
       value says whether a reimport is needed at all. INTERNAL, not
       public: PBAsset is assembly-internal, and a public signature over
       an internal type is CS0051 — the whole editor assembly would fail
       to compile and the importer would never run. ── */
    internal static bool Configure(TextureImporter ti, PBAsset a) {
      bool changed = false;
      if (ti.textureType != TextureImporterType.Sprite) { ti.textureType = TextureImporterType.Sprite; changed = true; }
      if (ti.spriteImportMode != SpriteImportMode.Single) { ti.spriteImportMode = SpriteImportMode.Single; changed = true; }
      if (ti.mipmapEnabled) { ti.mipmapEnabled = false; changed = true; }
      if (!ti.alphaIsTransparency) { ti.alphaIsTransparency = true; changed = true; }
      // these sprites ARE the app's pixels — Unity's default block compression
      // mottles the smooth gradients, so the kit imports lossless; re-compress
      // per platform at ship time if you need the memory back
      if (ti.textureCompression != TextureImporterCompression.Uncompressed) { ti.textureCompression = TextureImporterCompression.Uncompressed; changed = true; }
      // and nothing gets silently downscaled: big panels at 2x can pass the
      // 2048 default ceiling, which would quietly soften them
      if (ti.maxTextureSize < 4096) { ti.maxTextureSize = 4096; changed = true; }
      var settings = new TextureImporterSettings();
      ti.ReadTextureSettings(settings);
      var pivot = new Vector2(a.pivot != null ? a.pivot.x : 0.5f, a.pivot != null ? a.pivot.y : 0.5f);
      // art ships at 2x resolution: PPU 200 lands every piece at DESIGN
      // size, so caps keep their designed thickness at any rect size
      /* Full Rect is REQUIRED by both Sliced and Tiled image types — on a
         Tight mesh Unity warns and mis-draws the stretched middle, which
         is exactly where a maker goes to escape pattern distortion */
      if (settings.spriteAlignment != (int)SpriteAlignment.Custom || settings.spritePivot != pivot
          || settings.spritePixelsPerUnit != 200f || settings.spriteMeshType != SpriteMeshType.FullRect) {
        settings.spriteAlignment = (int)SpriteAlignment.Custom;
        settings.spritePivot = pivot;
        settings.spritePixelsPerUnit = 200f;
        settings.spriteMeshType = SpriteMeshType.FullRect;
        ti.SetTextureSettings(settings);
        changed = true;
      }
      if (a.nineSlice != null && (a.nineSlice.left + a.nineSlice.right + a.nineSlice.top + a.nineSlice.bottom) > 0) {
        var border = new Vector4(a.nineSlice.left, a.nineSlice.bottom, a.nineSlice.right, a.nineSlice.top);
        /* respect hand-tuned slices (dev field report: "the tool reset the
           slices of the original asset whenever I tried to tweak them").
           The stamp in userData records the border THIS importer last
           wrote; if the current border no longer matches it, a human moved
           the guides — theirs to keep, every pass after. Untouched assets
           still receive genuine slice updates from new exports. */
        string prevData = ti.userData ?? "";
        string oldTok = null;
        foreach (var tok in prevData.Split(' ')) if (tok.StartsWith("pbb:")) { oldTok = tok; break; }
        bool touched = oldTok != null && oldTok != "pbb:" + BorderKey(ti.spriteBorder);
        if (!touched) {
          if (ti.spriteBorder != border) { ti.spriteBorder = border; changed = true; }
          string mine = "pbb:" + BorderKey(border);
          string stamped = oldTok == null
            ? (prevData.Length > 0 ? prevData + " " : "") + mine
            : prevData.Replace(oldTok, mine);
          if (stamped != prevData) { ti.userData = stamped; changed = true; }
        }
      }
      return changed;
    }
    static string BorderKey(Vector4 v) {
      return ((int)v.x) + "," + ((int)v.y) + "," + ((int)v.z) + "," + ((int)v.w);
    }

    /* One click, whole truth — the debugging loop this kit went through
       pried these facts loose one screenshot at a time: play mode? build
       queued? which export build? fonts in the zip? faces assembled? */
    /* Hierarchy right-click → UI Kit Maker → piece (dev field report: "a
       nice feature might be to get the UI Kit prefabs in the right click
       menu — I found myself looking for them there like other UI
       elements"). Each entry drops the kit's generated prefab under the
       clicked object — or the scene's first Canvas — centered and
       undo-able. With several kits in one project the first manifest
       found wins, the same rule Kit Status lives by. */
    static void PlaceKitPrefab(string fam, MenuCommand cmd) {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) {
        EditorUtility.DisplayDialog("UI Kit Maker", "No kit in this project yet — drop the UIKitMaker folder from the export zip into Assets/ first.", "OK");
        return;
      }
      var root = Path.GetDirectoryName(AssetDatabase.GUIDToAssetPath(manifests[0])).Replace("\\\\", "/");
      var pf = AssetDatabase.LoadAssetAtPath<GameObject>(root + "/Prefabs/" + NiceName(fam) + ".prefab");
      if (pf == null) {
        EditorUtility.DisplayDialog("UI Kit Maker", NiceName(fam) + ".prefab isn't in " + root + "/Prefabs yet — run the kit import (or Tools → PatternBreak → Regenerate Example Prefabs) first.", "OK");
        return;
      }
      var go = (GameObject)PrefabUtility.InstantiatePrefab(pf);
      Transform parent = null;
      var ctxGo = cmd != null ? cmd.context as GameObject : null;
      if (ctxGo != null) parent = ctxGo.transform;
      if (parent == null) { var cv = UnityEngine.Object.FindFirstObjectByType<Canvas>(); if (cv != null) parent = cv.transform; }
      if (parent != null) go.transform.SetParent(parent, false);
      var prt = go.transform as RectTransform;
      if (prt != null) prt.anchoredPosition = Vector2.zero;
      Undo.RegisterCreatedObjectUndo(go, "Place " + NiceName(fam));
      Selection.activeGameObject = go;
    }
    [MenuItem("GameObject/UI Kit Maker/Button (Primary)", false, 10)] static void PBGoBtnP(MenuCommand c) { PlaceKitPrefab("button-primary", c); }
    [MenuItem("GameObject/UI Kit Maker/Button (Secondary)", false, 11)] static void PBGoBtnS(MenuCommand c) { PlaceKitPrefab("button-secondary", c); }
    [MenuItem("GameObject/UI Kit Maker/Button (Small)", false, 12)] static void PBGoBtnSm(MenuCommand c) { PlaceKitPrefab("button-small", c); }
    [MenuItem("GameObject/UI Kit Maker/Chip", false, 13)] static void PBGoChip(MenuCommand c) { PlaceKitPrefab("chip", c); }
    [MenuItem("GameObject/UI Kit Maker/Tab", false, 14)] static void PBGoTab(MenuCommand c) { PlaceKitPrefab("tab", c); }
    [MenuItem("GameObject/UI Kit Maker/Slider", false, 15)] static void PBGoSlider(MenuCommand c) { PlaceKitPrefab("slider", c); }
    [MenuItem("GameObject/UI Kit Maker/Toggle", false, 16)] static void PBGoToggle(MenuCommand c) { PlaceKitPrefab("toggle", c); }
    [MenuItem("GameObject/UI Kit Maker/Checkbox", false, 17)] static void PBGoCheck(MenuCommand c) { PlaceKitPrefab("checkbox", c); }
    [MenuItem("GameObject/UI Kit Maker/Radio", false, 18)] static void PBGoRadio(MenuCommand c) { PlaceKitPrefab("radio", c); }
    [MenuItem("GameObject/UI Kit Maker/Progress Bar", false, 19)] static void PBGoProg(MenuCommand c) { PlaceKitPrefab("progress", c); }
    [MenuItem("GameObject/UI Kit Maker/Panel", false, 20)] static void PBGoPanel(MenuCommand c) { PlaceKitPrefab("panel", c); }
    [MenuItem("GameObject/UI Kit Maker/Input Field", false, 21)] static void PBGoInput(MenuCommand c) { PlaceKitPrefab("input", c); }

    [MenuItem("Tools/PatternBreak/Kit Status")]
    public static void KitStatus() {
      var sb = new System.Text.StringBuilder();
      sb.Append("UI Kit Maker status — ");
      sb.Append(EditorApplication.isPlayingOrWillChangePlaymode
        ? "editor is in PLAY MODE (kit builds wait for Stop). "
        : "edit mode. ");
      if (SessionState.GetBool("PBKitPlayPending", false)) sb.Append("A kit build is QUEUED and runs when Play stops. ");
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) sb.Append("No kit-manifest.json in this project — drop the UIKitMaker folder from the export zip into Assets/.");
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest m = null;
        try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
        if (m == null) { sb.Append("\\n" + mPath + ": unreadable manifest."); continue; }
        sb.Append("\\n'" + (string.IsNullOrEmpty(m.kit) ? m.slug : m.kit) + "'" + (m.kitVersion > 0 ? " v" + m.kitVersion : "")
          + " [export build " + (string.IsNullOrEmpty(m.generatorVersion) ? "UNKNOWN — old zip, re-download" : m.generatorVersion) + "] — ");
        sb.Append(File.Exists(root + "/kit.lock.json") ? "imported. " : "NOT imported yet. ");
        sb.Append(m.typography != null && m.typography.bakedFace != null
          ? "Zip carries the baked hero fonts. "
          : "Zip has NO baked hero fonts (the font fetch failed during export — re-export from uikitmaker.com). ");
#if UNITY_2023_2_OR_NEWER
        sb.Append(AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset") != null
          ? "Layer face assembled (one font asset, four materials)."
          : "Layer face NOT assembled in this project.");
#endif
      }
      Debug.Log(sb.ToString());
#if UNITY_2023_2_OR_NEWER
      /* the sink, family by family — ONE Console entry each: the list
         view truncates entries to two lines, and packing these into the
         header entry hid them behind a click (owner: "didn't get the
         expected text") */
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest m = null;
        try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
        if (m == null) continue;
        foreach (var fam in new string[] { "button-primary", "button-secondary", "button-small", "chip", "tab", "tab-back" }) {
          var pf = AssetDatabase.LoadAssetAtPath<GameObject>(root + "/Prefabs/" + NiceName(fam) + ".prefab");
          if (pf == null) continue;
          var inkc = pf.GetComponent<LabelStateInk>();
          /* the "export build" tag rides along so a Console search filter
             for "export" (the habit the receipt taught) can't hide these */
          Debug.Log("UI Kit Maker status — " + fam + ": label size " + LabelSize(m, fam)
            + " · press sink expected " + ExpectedShift(m, fam, "pressed") + "px, armed "
            + (inkc != null ? inkc.pressedShift + "px" : "NONE (no state component)")
            + " [export build " + (string.IsNullOrEmpty(m.generatorVersion) ? "UNKNOWN" : m.generatorVersion) + "]");
        }
      }
#endif
    }

    [MenuItem("Tools/PatternBreak/Reapply Kit Import Settings")]
    public static void Apply() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) {
        Debug.LogWarning("UI Kit Maker: no kit-manifest.json in this project. Drop the whole UIKitMaker folder from the export zip into Assets/ and the import runs by itself.");
        return;
      }
      foreach (var guid in manifests) ImportKit(AssetDatabase.GUIDToAssetPath(guid));
    }

    /* ── the FIRST-DROP gap, closed. On a fresh drop the whole batch —
       manifest included — can finish importing before this script even
       compiles, so the postprocessor's "manifest arrived" trigger fires
       into an assembly that doesn't contain it yet, and the domain reload
       that follows wipes any pending delayCall (owner repro: empty
       Console, no prefabs). Every domain reload therefore sweeps for
       kits that have a manifest but no receipt and imports them. Cheap
       and idempotent: once the receipt exists, the sweep does nothing. */
    [InitializeOnLoadMethod]
    static void FirstImportSweep() {
      EditorApplication.delayCall += () => {
        // the valet raises this flag before the domain reload wipes its
        // queued pass — honor it by re-importing EVERYTHING once, receipts
        // intact (fully idempotent: unchanged kits report "already right")
        bool force = SessionState.GetBool("PBKitValetPending", false);
        if (force) SessionState.SetBool("PBKitValetPending", false);
        /* a NEW importer version arriving mid-Play recompiles scripts, and
           that domain reload wipes the play-wait subscription — without
           this re-arm, stopping Play finished NOTHING and the kit sat
           half-imported behind old receipts (owner field repro: "now, NO
           type at all"). Re-arm while playing; run the deferred build if
           Play already ended. */
        if (SessionState.GetBool("PBKitPlayPending", false)) {
          if (EditorApplication.isPlayingOrWillChangePlaymode) {
            if (!playWaitArmed) { playWaitArmed = true; EditorApplication.playModeStateChanged += ResumeAfterPlay; }
          } else {
            SessionState.SetBool("PBKitPlayPending", false);
            Debug.Log("UI Kit Maker: Play ended before the last import could finish — completing the kit build now.");
            force = true;
          }
        }
        var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
        foreach (var guid in manifests) {
          var mPath = AssetDatabase.GUIDToAssetPath(guid);
          var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
          if (force || Stale(root, mPath)) ImportKit(mPath);
        }
      };
    }

    /* Does the receipt describe the manifest sitting next to it? "No
       receipt" means a first drop, but a receipt for an OLDER export means
       a drop whose build never finished — and the only reason it wouldn't
       have is that something interrupted it. Play mode is the usual one:
       the build defers to edit mode through a SessionState flag, and
       SessionState dies with the editor. Quit Unity without pressing Stop
       and the old code saw a lock file, called the kit done, and left the
       new sprites sitting beside last export's prefabs — the field shape
       is new art with dead rollovers (owner: "I wasn't able to get the
       rollovers working but I think I imported everything while in play
       mode"). Comparing the receipt heals that on the next launch no
       matter what interrupted the build. */
    static bool Stale(string root, string mPath) {
      var lockPath = root + "/kit.lock.json";
      if (!File.Exists(lockPath)) return true;
      PBLock l = null; PBManifest m = null;
      try { l = JsonUtility.FromJson<PBLock>(File.ReadAllText(lockPath)); } catch (Exception) { }
      try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
      if (l == null || m == null) return true; // unreadable either side: rebuild rather than guess
      if (l.kitVersion != m.kitVersion) return true;
      return (l.generatorVersion ?? "") != (m.generatorVersion ?? "");
      /* deliberately NOT "&& l.prefabsGenerated": a kit whose prefabs can't
         build (no TMP yet, say) would then look stale forever, and entering
         Play mode is a domain reload — so every Play would kick off a full
         re-import. The version pair is the honest signal; a genuinely
         prefab-less kit is one Reapply away. */
    }

    /* Play-mode drops half-import: scene creation is forbidden (the
       Playground builder throws InvalidOperationException), TMP essentials
       can't come in cleanly, and prefabs generated in that window are born
       with naked labels (owner field repro on a fresh machine: every layer
       logging "no Font Asset assigned"). Sprites and their import settings
       are handled by the texture postprocessor regardless, so the rest of
       the kit build simply WAITS for edit mode and runs then. */
    static bool playWaitArmed;
    static void ResumeAfterPlay(PlayModeStateChange change) {
      if (change != PlayModeStateChange.EnteredEditMode) return;
      EditorApplication.playModeStateChanged -= ResumeAfterPlay;
      playWaitArmed = false;
      SessionState.SetBool("PBKitPlayPending", false);
      Debug.Log("UI Kit Maker: Play stopped — finishing the kit build now.");
      EditorApplication.delayCall += Apply;
    }
    static void ImportKit(string mPath) {
      if (EditorApplication.isPlayingOrWillChangePlaymode) {
        /* the flag persists across domain reloads (a NEW importer version
           arriving mid-Play recompiles scripts and wipes this class's
           statics — the sweep re-arms the wait from the flag, field repro:
           "now, NO type at all") */
        SessionState.SetBool("PBKitPlayPending", true);
        if (!playWaitArmed) {
          playWaitArmed = true;
          EditorApplication.playModeStateChanged += ResumeAfterPlay;
        }
        /* say it EVERY time — the once-latched version left the Reapply
           menu perfectly mute when run during Play (field: an owner deep
           in a debugging loop, screenshotting an empty Console) */
        Debug.Log("UI Kit Maker: the editor is in PLAY MODE — press STOP (the square, top center) and the kit build finishes by itself.");
        return;
      }
      var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
      PBManifest manifest = null;
      try { manifest = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
      if (manifest == null || manifest.assets == null || manifest.assets.Length == 0) {
        Debug.LogWarning("UI Kit Maker: " + mPath + " has no asset list — is it the kit-manifest.json from the export zip?");
        return;
      }

      // the previous receipt, if any — its absence means FIRST import
      var lockPath = root + "/kit.lock.json";
      PBLock prev = null;
      if (File.Exists(lockPath)) {
        try { prev = JsonUtility.FromJson<PBLock>(File.ReadAllText(lockPath)); } catch (Exception) { prev = null; }
      }
      var prevHash = new Dictionary<string, string>();
      if (prev != null && prev.files != null)
        foreach (var f in prev.files) if (f != null && !string.IsNullOrEmpty(f.file)) prevHash[f.file] = f.sha256;

      int applied = 0, already = 0, missing = 0, fresh = 0, restyled = 0, same = 0;
      try {
        AssetDatabase.StartAssetEditing();
        foreach (var a in manifest.assets) {
          var ti = AssetImporter.GetAtPath(root + "/" + a.file) as TextureImporter;
          if (ti == null) { missing++; continue; }
          if (Configure(ti, a)) { ti.SaveAndReimport(); applied++; } else { already++; }
          string was;
          if (prev == null || !prevHash.TryGetValue(a.file, out was)) fresh++;
          else if (was != a.sha256) restyled++;
          else same++;
        }
      } finally {
        AssetDatabase.StopAssetEditing();
      }

      /* self-heal a mis-shipped runtime: PatternBreakIdleShine.cs briefly
         landed PER-SLUG (outside the PatternBreak.Runtime assembly), where
         the shared Editor importer could not see its types — CS0246 and a
         dead import. The shared copy ships correctly now; the stray twin
         deletes itself so old installs come back to life on the next drop. */
      if (File.Exists(root + "/Runtime/PatternBreakIdleShine.cs")) {
        AssetDatabase.DeleteAsset(root + "/Runtime/PatternBreakIdleShine.cs");
        Debug.Log("UI Kit Maker: removed a stray per-kit PatternBreakIdleShine.cs — the shared Runtime copy owns those types now.");
      }
      /* ── I3: anything the last receipt knew that this manifest dropped
         stays on disk and gets named — deletion is a human's click. ONE
         exception: the great renaming (dev field report: sixteen identical
         "base" files in search — filenames now carry their family). A
         dropped file whose family-prefixed twin IS in this manifest isn't
         a design decision, it's the same asset renamed; it deletes itself
         so the rename doesn't bury the report in false orphans. ── */
      var inManifest = new HashSet<string>();
      foreach (var a in manifest.assets) inManifest.Add(a.file);
      var orphans = new List<string>();
      if (prev != null && prev.files != null)
        foreach (var f in prev.files)
          if (f != null && !string.IsNullOrEmpty(f.file) && !inManifest.Contains(f.file) && File.Exists(root + "/" + f.file)) {
            var slash = f.file.LastIndexOf('/');
            if (slash > 0) {
              var dirp = f.file.Substring(0, slash);
              var dslash = dirp.LastIndexOf('/');
              var dname = dslash >= 0 ? dirp.Substring(dslash + 1) : dirp;
              var renamed = dirp + "/" + dname + "-" + f.file.Substring(slash + 1);
              if (inManifest.Contains(renamed)) { AssetDatabase.DeleteAsset(root + "/" + f.file); continue; }
            }
            orphans.Add(f.file);
          }
      if (prev != null && prev.orphans != null)
        foreach (var o in prev.orphans)
          if (!string.IsNullOrEmpty(o) && !inManifest.Contains(o) && !orphans.Contains(o) && File.Exists(root + "/" + o))
            orphans.Add(o);

      /* ── the styled face + the FONT STORY, told out loud ── */
      bool tmpPending = false;
      Font kitTtf = null;
      if (manifest.typography == null || string.IsNullOrEmpty(manifest.typography.fontFile)) {
        Debug.Log("UI Kit Maker: this export shipped no font file (the fetch failed in the browser at export time) — labels use Unity's built-in face. Re-export from uikitmaker.com to retry.");
      } else {
        kitTtf = AssetDatabase.LoadAssetAtPath<Font>(root + "/" + manifest.typography.fontFile);
        if (kitTtf == null)
          Debug.LogWarning("UI Kit Maker: the kit names " + manifest.typography.fontFile + " but it isn't in the project — was the fonts folder extracted with the rest?");
      }
#if UNITY_2023_2_OR_NEWER
      /* the styled TMP face generates on EVERY import when missing — not
         only alongside prefabs — so projects that already generated their
         prefabs before this feature still receive KitFace SDF. If TMP's
         essentials are absent, they auto-import and BOTH the face and the
         prefabs wait one pass, so labels never lock in unstyled. */
      bool sdfWasThere = File.Exists(root + "/fonts/KitFace SDF.asset");
      // the baked faces need TMP even when no TTF shipped — request always
      if (!TmpReady()) tmpPending = RequestEssentials();
      if (kitTtf != null && !tmpPending) EnsureTmpFace(root, manifest, kitTtf);
      /* the baked faces refresh on EVERY import (review catch: an
         extract-over rewrites the atlas and metrics, and stale glyph rects
         over a new atlas garble every letter — restyle-in-place demands the
         assembly track the files). They're generated mirrors of kit data,
         like the gradient preset; the asset GUIDs survive the in-place
         rebuild, so placed labels keep their face. */
      if (!tmpPending) EnsureBakedFace(root, manifest, true);
      if (!tmpPending) EnsureGradientPreset(root, manifest);
      /* a full-tier zip born while the browser couldn't fetch the kit font
         ships WITHOUT the baked hero fonts — silently, unless we say so
         (field repro: every hero/button word vanished on the next drop) */
      if (string.Equals(manifest.tier, "full") && (manifest.typography == null || manifest.typography.bakedFace == null))
        Debug.LogWarning("UI Kit Maker: this export shipped WITHOUT the baked hero fonts — the kit's font couldn't be fetched in the browser during export. Labels fall back to the styled SDF face. Re-export from uikitmaker.com (check the connection there) to restore the exact type.");
      /* new text objects are BORN in the kit's face (owner: the custom font
         "should kinda just be there") — set TMP's project-wide default, but
         only while it's still the stock Liberation face; a deliberate user
         choice is never stomped. */
      if (!tmpPending) {
        var sdfFace = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace SDF.asset");
        if (sdfFace != null && TMP_Settings.instance != null) {
          var curDefault = TMP_Settings.defaultFontAsset;
          if (curDefault == null || curDefault.name.StartsWith("LiberationSans")) {
            var so = new SerializedObject(TMP_Settings.instance);
            var prop = so.FindProperty("m_defaultFontAsset");
            if (prop != null) {
              prop.objectReferenceValue = sdfFace;
              so.ApplyModifiedProperties();
              EditorUtility.SetDirty(TMP_Settings.instance);
              AssetDatabase.SaveAssets();
              Debug.Log("UI Kit Maker: new TextMeshPro texts are now born in the kit's face (project default font = KitFace SDF). Change it anytime in Project Settings > TextMesh Pro > Settings.");
            }
          }
        }
      }
      // the face arriving AFTER the prefabs did (first-ever TMP install
      // ordering) leaves plain labels behind — say so, with the one-click cure
      if (!sdfWasThere && File.Exists(root + "/fonts/KitFace SDF.asset")
          && ((prev != null && prev.prefabsGenerated) || AssetDatabase.IsValidFolder(root + "/Prefabs")))
        Debug.Log("UI Kit Maker: the styled face arrived after your prefabs were generated — run Tools > PatternBreak > Regenerate Example Prefabs to upgrade their labels (your own prefabs are untouched).");
#endif

      /* ── I5: examples appear once, fully wired, then are yours ── */
      bool prefabsReady = (prev != null && prev.prefabsGenerated) || AssetDatabase.IsValidFolder(root + "/Prefabs");
      bool prefabsNew = false;
      if (!prefabsReady && !tmpPending) { prefabsNew = GeneratePrefabs(root, manifest); prefabsReady = prefabsNew; }
      // per-import maintenance for examples generated by OLDER kit versions:
      // missing state wiring is added, stale label dress is re-applied —
      // in place, surgical, no menu hunt (fresh generations are current
      // by construction and skip this)
      if (prefabsReady && !prefabsNew) { MaintainExamplePrefabs(root, manifest); GenerateMissingPrefabs(root, manifest); }
#if UNITY_2023_2_OR_NEWER
      if (tmpPending) EditorApplication.delayCall += Apply; // one bounded re-pass once the essentials land
#endif
      if (prefabsNew) {
        // walk the user to the goods: highlight the fresh Prefabs folder
        var folder = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(root + "/Prefabs");
        if (folder != null) EditorGUIUtility.PingObject(folder);
      }
      // press-Play-ready: a scene with camera, canvas, ONE correct EventSystem
      // and the examples placed — built once after this pass settles, then
      // yours (Tools > PatternBreak > Rebuild Kit Playground Scene refreshes).
      // Scenes can't be created mid-import, hence the delayCall.
      if (!File.Exists(root + "/Playground.unity"))
        EditorApplication.delayCall += () => BuildPlayground(root);
      else if (prev != null)
        /* the Playground never rebuilds itself ("yours after first
           generation") — but a kit UPDATE leaving it stale in SILENCE
           read as "same problem" in the field. Say where the fresh one
           is. */
        Debug.Log("UI Kit Maker: Playground.unity kept as-is (yours). This update may have changed sizes or added pieces — Tools > PatternBreak > Rebuild Kit Playground Scene builds a fresh one.");
      // the maker's board scenes ride the same after-import beat — each
      // builds once, then it's yours (existing scenes are never touched)
      EditorApplication.delayCall += () => {
        BuildBoardScenes(root, manifest);
        /* a kit UPDATE leaves existing scenes wearing their FIRST build's
           sizing and words — new sprites on old decisions (field: the
           flame button back at its default proportions and label). A
           Console line was too quiet for that; ASK, once, at the moment
           it matters. "Keep mine" is a real answer — the scenes are the
           maker's after generation. */
        if (prev != null && manifest.boards != null && manifest.boards.Length > 0) {
          bool anyKept = false;
          foreach (var bd in manifest.boards)
            if (File.Exists(root + "/Scenes/" + BoardSlug(bd.name) + ".unity")) { anyKept = true; break; }
          if (anyKept && EditorUtility.DisplayDialog("UI Kit Maker — board scenes",
              "This kit update changed the export, but your board scenes keep the sizes and words they were FIRST built with (they are yours after generation).\\n\\nRebuild them from this update now? Hand edits inside those scenes will be redone.",
              "Rebuild scenes", "Keep mine")) {
            foreach (var bd in manifest.boards) {
              try { BuildBoardScene(root, manifest, bd, true); }
              catch (Exception e) { Debug.LogWarning("UI Kit Maker: board scene '" + bd.name + "' failed — " + e.Message); }
            }
          } else if (anyKept) {
            Debug.Log("UI Kit Maker: board scenes kept — Tools > PatternBreak > Rebuild Kit Board Scenes adopts this update's sizing and words whenever you're ready.");
          }
        }
      };

      // ── the receipt ──
      var receipt = new PBLock();
      receipt.slug = manifest.slug;
      receipt.kitVersion = manifest.kitVersion;
      receipt.generatorVersion = manifest.generatorVersion;
      receipt.imported = DateTime.UtcNow.ToString("o");
      receipt.prefabsGenerated = prefabsReady;
      var entries = new List<PBLockEntry>();
      foreach (var a in manifest.assets) { var e = new PBLockEntry(); e.file = a.file; e.sha256 = a.sha256; entries.Add(e); }
      receipt.files = entries.ToArray();
      receipt.orphans = orphans.ToArray();
      File.WriteAllText(lockPath, JsonUtility.ToJson(receipt, true));

      var kitName = string.IsNullOrEmpty(manifest.kit) ? (string.IsNullOrEmpty(manifest.slug) ? "kit" : manifest.slug) : manifest.kit;
      // the receipt tells the LABEL story too — no more guessing which face won
      string faceNote = "";
#if UNITY_2023_2_OR_NEWER
      if (File.Exists(root + "/fonts/KitFace SDF.asset")) faceNote = " Labels: KitFace SDF (styled).";
      else if (tmpPending) faceNote = " Styled face: finishing right after the TMP essentials import.";
      else if (kitTtf != null) faceNote = " Labels: shipped TTF.";
#else
      if (kitTtf != null) faceNote = " Labels: shipped TTF.";
#endif
      var line = "UI Kit Maker — '" + kitName + "'" + (manifest.kitVersion > 0 ? " v" + manifest.kitVersion : "")
        + (prev == null ? " imported: " : " updated: ") + manifest.assets.Length + " sprites ("
        + (prev == null ? fresh + " new" : fresh + " new, " + restyled + " restyled, " + same + " unchanged")
        + "; settings: " + applied + " applied, " + already + " already right)."
        + (prefabsNew ? " Wired prefabs are ready in " + root + "/Prefabs — drag one into your Canvas." : "")
        + faceNote
        /* which uikitmaker.com BUILD packed this zip — ends the "is this
           the latest download?" guessing game right in the Console */
        + (string.IsNullOrEmpty(manifest.generatorVersion) ? "" : " [export build " + manifest.generatorVersion + "]");
      if (orphans.Count > 0)
        Debug.LogWarning(line + "\\n" + orphans.Count + " piece(s) are no longer part of this kit but STAY on disk (nothing is deleted without you): "
          + string.Join(", ", orphans.ToArray())
          + "\\nRemove them via Tools > PatternBreak > Review Orphaned Kit Files.");
      else
        Debug.Log(line);
      if (missing > 0)
        Debug.LogWarning("UI Kit Maker: " + missing + " sprites named in " + mPath + " were not found on disk — keep the export's assets folder next to kit-manifest.json, named exactly 'assets'.");
    }

    /* ── the I5 escape hatch, explicit and confirmed: rebuild the GENERATED
       examples with the current sprites and the styled face. Needed when
       the face arrives after the prefabs did (first-ever TMP install
       ordering — owner: "maybe the text baked before the install
       finished"). SaveAsPrefabAsset overwrites in place, so prefab GUIDs
       survive and placed instances restyle; prefabs the user created or
       renamed are never touched. ── */
    [MenuItem("Tools/PatternBreak/Regenerate Example Prefabs")]
    public static void RegeneratePrefabs() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) {
        Debug.LogWarning("UI Kit Maker: no kit-manifest.json in this project — drop a kit in first.");
        return;
      }
      if (!EditorUtility.DisplayDialog("UI Kit Maker — regenerate example prefabs",
        "Rebuilds the GENERATED examples in each kit's Prefabs folder (PrimaryButton, Chip, ProgressBar and friends) from the current sprites and the styled face. Same-named generated prefabs are replaced in place — placed instances restyle. Prefabs you created or renamed are not touched.",
        "Regenerate", "Cancel")) return;
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest manifest = null;
        try { manifest = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
        if (manifest == null || manifest.assets == null) continue;
#if UNITY_2023_2_OR_NEWER
        /* regenerating means "give me the kit's CURRENT look" — refresh the
           styled face's material from the manifest recipe too */
        var face = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace SDF.asset");
        if (face != null && face.material != null) {
          ApplyStyle(face.material, manifest, root);
          EditorUtility.SetDirty(face.material);
          AssetDatabase.SaveAssets();
        }
        // the baked face rebuilds IN PLACE too (same GUID — placed labels keep it)
        EnsureBakedFace(root, manifest, true);
        EnsureGradientPreset(root, manifest);
#endif
        GeneratePrefabs(root, manifest);
        Debug.Log("UI Kit Maker: regenerated the example prefabs under " + root + "/Prefabs.");
      }
    }

    /* ── press Play, nothing to wire: a ready scene with the examples
       placed, a camera, a raycasting canvas and exactly ONE EventSystem
       carrying the input module this project actually uses (the classic
       Play-mode dead-button causes are a duplicate EventSystem or the
       wrong module for the project's input setting). Generated once on
       first import, then it's yours; the menu below rebuilds it. ── */
    /* Additive scene creation FAILS while the open scene is an unsaved
       Untitled — the exact state of a brand-new project that never saved
       a scene (field: every board "failed — Cannot create a new scene
       additively with an untitled scene unsaved", an empty Scenes
       folder). A PRISTINE Untitled loses nothing when replaced, so the
       first generated scene builds in its slot; saving it titles the
       editor and everything after goes additive as usual. A DIRTY
       Untitled is the maker's unsaved work — never discard it: skip
       loudly with the way out instead. */
    static bool TryNewKitScene(out UnityEngine.SceneManagement.Scene scene, string what) {
      var active = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
      bool untitled = string.IsNullOrEmpty(active.path);
      if (untitled && active.isDirty) {
        scene = default(UnityEngine.SceneManagement.Scene);
        Debug.LogWarning("UI Kit Maker: " + what + " skipped — the open Untitled scene has unsaved changes, and Unity won't create scenes beside an unsaved Untitled scene. Save your scene (File > Save As…), then run the Rebuild menus under Tools > PatternBreak.");
        return false;
      }
      scene = UnityEditor.SceneManagement.EditorSceneManager.NewScene(
        UnityEditor.SceneManagement.NewSceneSetup.EmptyScene,
        untitled ? UnityEditor.SceneManagement.NewSceneMode.Single : UnityEditor.SceneManagement.NewSceneMode.Additive);
      return true;
    }
    static void BuildPlayground(string root) {
      var scenePath = root + "/Playground.unity";
      if (File.Exists(scenePath)) return; // yours after first generation
      var guids = AssetDatabase.FindAssets("t:Prefab", new string[] { root + "/Prefabs" });
      if (guids.Length == 0) return; // prefabs not in yet — the next pass retries
      UnityEngine.SceneManagement.Scene scene;
      if (!TryNewKitScene(out scene, "the Playground scene")) return;
      try {
        /* field case: the user deleted the kit folder while the old
           Playground was still OPEN — its file is gone but the editor
           holds the scene, and saving to a path an open scene claims is
           refused. Our new scene is already loaded, so the stale one is
           safely closable; close it before claiming the path. */
        var stale = UnityEngine.SceneManagement.SceneManager.GetSceneByPath(scenePath);
        if (stale.IsValid() && stale != scene) UnityEditor.SceneManagement.EditorSceneManager.CloseScene(stale, true);
        var camGo = new GameObject("Camera", typeof(Camera));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(camGo, scene);
        var cam = camGo.GetComponent<Camera>();
        cam.orthographic = true;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.09f, 0.10f, 0.15f);
        camGo.tag = "MainCamera";

        var canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(canvasGo, scene);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920f, 1080f);

        var esGo = new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(esGo, scene);
#if ENABLE_LEGACY_INPUT_MANAGER
        esGo.AddComponent<UnityEngine.EventSystems.StandaloneInputModule>();
#elif ENABLE_INPUT_SYSTEM
        esGo.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#endif

        /* NO auras (owner verdict after two calibration rounds: "just get
           rid of the white glow beneath every object") — pieces place
           clean; the bloom recipe stays in kit-manifest.json for anyone
           who wants to compose their own with fx/glow.png. */
        var prefabs = new List<GameObject>();
        foreach (var g in guids) {
          var p = AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(g));
          if (p != null) prefabs.Add(p);
        }
        prefabs.Sort((a, b) => string.CompareOrdinal(a.name, b.name));
        /* v2 — a true mini UI kit (owner: "laid out like a true mini-ui
           kit with sections and labels… filled with all kinds of
           different components"): pieces group into labeled sections, one
           of each (the tiled-face twins stay in Prefabs/, not here — the
           repeats were most of the noise), flowing rows with real
           gutters. Everything hangs off one Board scaled to fit at the
           end. */
        var SECTIONS = new (string title, string[] names)[] {
          ("BUTTONS", new[] { "ButtonPrimary", "ButtonSecondary", "ButtonSmall", "Endturn", "Keycap", "Pricebtn", "Iconbtn", "Chip", "Tab", "TabBack" }),
          ("TOGGLES & INPUT", new[] { "Checkbox", "Radio", "CheckboxToggle", "RadioToggle", "Switch", "Input", "Joystick" }),
          ("BARS & METERS", new[] { "ProgressBar", "Slider", "HealthGlobe", "SeasonTrack", "CountBadge", "Badge" }),
          ("PANELS & FRAMES", new[] { "Panel", "HeaderBanner", "ListRow", "ItemSlot", "ScrollView" }),
          ("PROPS", new[] { "Gearicon", "Trophyicon", "Gifticon", "Firebutton" }),
        };
        var byName = new Dictionary<string, GameObject>();
        foreach (var p in prefabs) if (!byName.ContainsKey(p.name)) byName[p.name] = p;
        var claimed = new HashSet<string>();
        foreach (var sec in SECTIONS) foreach (var n in sec.names) claimed.Add(n);
        // future prefabs never vanish: everything unclaimed lands in MORE
        var moreNames = new List<string>();
        foreach (var p in prefabs) if (!claimed.Contains(p.name) && !p.name.Contains("(tiled face)") && p.name != "HeroLabel") moreNames.Add(p.name);
        var boardGo = new GameObject("Board", typeof(RectTransform));
        boardGo.transform.SetParent(canvasGo.transform, false);
        var board = boardGo.GetComponent<RectTransform>();
        board.anchorMin = new Vector2(0f, 1f); board.anchorMax = new Vector2(0f, 1f);
        board.pivot = new Vector2(0f, 1f);
        float rowW = 1760f, gut = 40f, y = -70f, widest = 0f; int placed = 0;
        var allSecs = new List<(string title, string[] names)>(SECTIONS);
        if (moreNames.Count > 0) allSecs.Add(("MORE", moreNames.ToArray()));
        foreach (var sec in allSecs) {
          // does this kit ship anything for the section?
          bool anyIn = false;
          foreach (var n in sec.names) if (byName.ContainsKey(n)) { anyIn = true; break; }
          if (!anyIn) continue;
#if UNITY_2023_2_OR_NEWER
          var head = new GameObject(sec.title, typeof(RectTransform), typeof(CanvasRenderer), typeof(TextMeshProUGUI));
          head.transform.SetParent(board, false);
          var ht = head.GetComponent<TextMeshProUGUI>();
          ht.text = sec.title;
          ht.fontSize = 30f; ht.fontStyle = FontStyles.Bold;
          ht.color = new Color(0.59f, 0.63f, 0.72f);
          ht.alignment = TextAlignmentOptions.MidlineLeft;
          var hrt = head.GetComponent<RectTransform>();
          hrt.anchorMin = new Vector2(0f, 1f); hrt.anchorMax = new Vector2(0f, 1f); hrt.pivot = new Vector2(0f, 1f);
          hrt.sizeDelta = new Vector2(rowW, 40f);
          hrt.anchoredPosition = new Vector2(90f, y);
          y -= 56f;
#endif
          float x = 90f, rowH = 0f;
          foreach (var n in sec.names) {
            GameObject pf;
            if (!byName.TryGetValue(n, out pf)) continue;
            var inst = (GameObject)PrefabUtility.InstantiatePrefab(pf, scene);
            inst.transform.SetParent(board, false);
            var rt = inst.GetComponent<RectTransform>();
            if (rt == null) continue;
            float w = Mathf.Max(80f, rt.sizeDelta.x), h = Mathf.Max(40f, rt.sizeDelta.y);
            // oversized furniture scales down to sit in the flow
            float ps2 = Mathf.Min(1f, Mathf.Min(300f / h, 620f / w));
            if (x + w * ps2 > rowW && x > 91f) { x = 90f; y -= rowH + gut; rowH = 0f; }
            rt.anchorMin = new Vector2(0f, 1f); rt.anchorMax = new Vector2(0f, 1f);
            rt.anchoredPosition = new Vector2(x + w * ps2 * 0.5f, y - h * ps2 * 0.5f);
            if (ps2 < 1f) rt.localScale = new Vector3(ps2, ps2, 1f);
            x += w * ps2 + gut;
            if (h * ps2 > rowH) rowH = h * ps2;
            if (x > widest) widest = x;
            placed++;
          }
          y -= rowH + 84f; // section breath
        }
        float boardW = Mathf.Max(widest + 50f, 800f), boardH = Mathf.Max(-y + 40f, 200f);
        board.sizeDelta = new Vector2(boardW, boardH);
        // shrink to fit, never blow up a small kit past 1:1
        float fit = Mathf.Min(1f, Mathf.Min(1920f / boardW, 1080f / boardH));
        board.localScale = new Vector3(fit, fit, 1f);
        board.anchoredPosition = new Vector2((1920f - boardW * fit) * 0.5f, -(1080f - boardH * fit) * 0.5f);
        /* no help card in the scene (owner call: the Playground stays
           clean) — the driving instructions live in the README instead */
        if (UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene, scenePath))
          Debug.Log("UI Kit Maker: Playground ready — open " + scenePath + " and press Play. Hover/press states are pre-wired (" + placed + " pieces placed).");
        else
          Debug.LogWarning("UI Kit Maker: couldn't save the Playground at " + scenePath + " — go File > New Scene, then Tools > PatternBreak > Rebuild Kit Playground Scene.");
      } finally {
        /* field catch: when the Playground ends up the ONLY loaded scene
           (the stale one was closed, nothing else open), Unity refuses to
           close it and prints a scary warning. Landing inside the freshly
           saved Playground is the nicer outcome anyway — only tidy up when
           another scene is there to return to. */
        if (UnityEngine.SceneManagement.SceneManager.sceneCount > 1)
          UnityEditor.SceneManagement.EditorSceneManager.CloseScene(scene, true);
      }
    }

    /* ── Boards→Scenes: every artboard the maker composed in the app
       arrives as a READY scene — background placed, pieces zone-anchored,
       per-copy words on the live labels. Built once per board, then yours
       (Tools > PatternBreak > Rebuild Kit Board Scenes refreshes). ── */
    static string BoardSlug(string name) {
      var sb = new System.Text.StringBuilder();
      foreach (var ch in name) sb.Append(char.IsLetterOrDigit(ch) ? ch : '-');
      var s = sb.ToString().Trim('-');
      return string.IsNullOrEmpty(s) ? "Board" : s;
    }
    static void BuildBoardScenes(string root, PBManifest m) {
      if (m == null || m.boards == null || m.boards.Length == 0) return;
      foreach (var bd in m.boards) {
        try { BuildBoardScene(root, m, bd, false); }
        catch (Exception e) { Debug.LogWarning("UI Kit Maker: board scene '" + bd.name + "' failed — " + e.Message); }
      }
    }
    static void BuildBoardScene(string root, PBManifest m, PBBoard bd, bool force) {
      var dir = root + "/Scenes";
      if (!AssetDatabase.IsValidFolder(dir)) AssetDatabase.CreateFolder(root, "Scenes");
      var scenePath = dir + "/" + BoardSlug(bd.name) + ".unity";
      if (File.Exists(scenePath)) {
        /* yours after first generation — EXCEPT a scene we know shipped
           incomplete (pieces skipped because prefabs hadn't generated on
           the first import beat): that one self-heals on the next pass
           instead of asking the maker to remember a menu path */
        bool pending = SessionState.GetBool("pbBoardPending:" + scenePath, false);
        if (!force && !pending) return;
        AssetDatabase.DeleteAsset(scenePath);
      }
      UnityEngine.SceneManagement.Scene scene;
      if (!TryNewKitScene(out scene, "board scene '" + bd.name + "'")) return;
      try {
        var stale = UnityEngine.SceneManagement.SceneManager.GetSceneByPath(scenePath);
        if (stale.IsValid() && stale != scene) UnityEditor.SceneManagement.EditorSceneManager.CloseScene(stale, true);
        var camGo = new GameObject("Camera", typeof(Camera));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(camGo, scene);
        var cam = camGo.GetComponent<Camera>();
        cam.orthographic = true;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.09f, 0.10f, 0.15f);
        camGo.tag = "MainCamera";
        var canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(canvasGo, scene);
        canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2((float)bd.w, (float)bd.h);
        scaler.matchWidthOrHeight = 0.5f;
        var esGo = new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem));
        UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(esGo, scene);
#if ENABLE_LEGACY_INPUT_MANAGER
        esGo.AddComponent<UnityEngine.EventSystems.StandaloneInputModule>();
#elif ENABLE_INPUT_SYSTEM
        esGo.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#endif
        /* background: the maker's own art, full-stretch behind everything.
           The zip carries the UPLOAD ORIGINAL when the maker's browser had
           it (manifest > boards > bg.original); opacity from the app rides
           the image color. Blur/grain are app-preview niceties — flag them
           in the log rather than faking them with hidden post-processing. */
        if (bd.bg != null && !string.IsNullOrEmpty(bd.bg.file)) {
          var bgSp = S(root + "/" + bd.bg.file);
          if (bgSp != null) {
            var bgGo = new GameObject("Background", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            bgGo.transform.SetParent(canvasGo.transform, false);
            var brt = bgGo.GetComponent<RectTransform>();
            brt.anchorMin = Vector2.zero; brt.anchorMax = Vector2.one;
            brt.offsetMin = Vector2.zero; brt.offsetMax = Vector2.zero;
            var bimg = bgGo.GetComponent<Image>();
            bimg.sprite = bgSp;
            bimg.preserveAspect = false;
            bimg.raycastTarget = false;
            bimg.color = new Color(1f, 1f, 1f, Mathf.Clamp01(bd.bg.opacity / 100f));
            if (bd.bg.overlay != null && bd.bg.overlay != "none") {
              var ovGo = new GameObject("Overlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
              ovGo.transform.SetParent(canvasGo.transform, false);
              var ort = ovGo.GetComponent<RectTransform>();
              ort.anchorMin = Vector2.zero; ort.anchorMax = Vector2.one;
              ort.offsetMin = Vector2.zero; ort.offsetMax = Vector2.zero;
              var oimg = ovGo.GetComponent<Image>();
              oimg.raycastTarget = false;
              float a = Mathf.Clamp01(bd.bg.overlayStrength / 100f);
              // vignette approximates as a soft dark wash; dark/light are exact
              oimg.color = bd.bg.overlay == "light" ? new Color(0.96f, 0.97f, 1f, a * 0.5f) : new Color(0.02f, 0.03f, 0.06f, bd.bg.overlay == "vignette" ? a * 0.45f : a * 0.6f);
            }
          }
        }
        int placed = 0, missing = 0;
        var selectRows = new List<KeyValuePair<PBBoardItem, GameObject>>();
        if (bd.items != null) foreach (var it in bd.items) {
          GameObject inst = null; RectTransform rt = null;
          if (!string.IsNullOrEmpty(it.stamp)) {
#if UNITY_2023_2_OR_NEWER
            /* NUMERIC type stamps go LIVE (owner: "750 should be animating
               on play… :56 should be counting down"): the layered kit face
               rebuilds the stamp's look as REAL text, and a rig moves it —
               a colon reads as a countdown, plain digits as a damage pop.
               Words stay baked pixels, exactly as before. */
            if (it.component == "typestamp" && !string.IsNullOrEmpty(it.label)
                && System.Text.RegularExpressions.Regex.IsMatch(it.label.Trim(), "^[0-9][0-9.,:+xX% ]*$")) {
              var hlPf = AssetDatabase.LoadAssetAtPath<GameObject>(root + "/Prefabs/HeroLabel.prefab");
              if (hlPf == null)
                Debug.LogWarning("UI Kit Maker: numeric stamp '" + it.label.Trim() + "' stays a baked image — no HeroLabel prefab yet (it ships when the kit bakes its layered face; run Tools > PatternBreak > Rebuild Kit Board Scenes after prefabs generate).");
              if (hlPf != null) {
                inst = (GameObject)PrefabUtility.InstantiatePrefab(hlPf, scene);
                inst.name = "Stamp (live) — " + it.label.Trim();
                inst.transform.SetParent(canvasGo.transform, false);
                rt = inst.GetComponent<RectTransform>();
                rt.sizeDelta = new Vector2(it.w * 1.2f, it.h * 1.25f);
                var hlN = inst.GetComponent<HeroLabel>();
                if (hlN != null) { hlN.fontSize = it.h * 0.78f; hlN.SetText(it.label.Trim()); }
                if (it.label.Contains(":")) inst.AddComponent<CountdownLabel>();
                else inst.AddComponent<PopNumber>();
              }
            }
#endif
            if (inst == null) {
            /* a type stamp — its baked sprite (adjust dials, shadow and
               glow already in the pixels), a plain Image, no prefab */
            var ssp = S(root + "/" + it.stamp);
            if (ssp == null) { missing++; continue; }
            // baked kit pieces read as themselves in the hierarchy, not as "Stamp"
            var bakedName = it.component == "typestamp" || it.component == "libasset"
              ? "Stamp — " + (string.IsNullOrEmpty(it.label) ? "text" : it.label)
              : NiceName(it.component) + " (baked)";
            inst = new GameObject(bakedName, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            inst.transform.SetParent(canvasGo.transform, false);
            var simg = inst.GetComponent<Image>();
            simg.sprite = ssp; simg.raycastTarget = false;
            rt = inst.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(it.w, it.h);
            /* the inventory grid's tiles go LIVE over the baked panel:
               the recorder shipped each well's box (the panel itself is
               baked ringless) — the rig owns the clicks and the ring */
            if (it.component == "invgrid" && it.cells != null && it.cells.Length >= 8) {
              var ig = inst.AddComponent<InvGridSelect>();
              ig.cells = it.cells;
              ig.selected = Mathf.Max(0, it.cellSel);
              ig.ring = S(root + "/assets/invgrid/invgrid-cell-ring.png");
              if (ig.ring == null)
                Debug.LogWarning("UI Kit Maker: inventory grid placed without its selection ring sprite — tiles still click, the ring just has nothing to draw. Re-export the kit to ship assets/invgrid/invgrid-cell-ring.png.");
            }
            }
          } else {
            // composed rigs publish under their own prefab names
            var pfName = NiceName(it.component);
            if (it.component == "progress") pfName = "ProgressBar";
            else if (it.component == "joystick") pfName = "Joystick";
            else if (it.component == "seasontrack") pfName = "SeasonTrack";
            else if (it.component == "toggle") pfName = "Switch";
            var pf = AssetDatabase.LoadAssetAtPath<GameObject>(root + "/Prefabs/" + pfName + ".prefab");
            /* a STRETCHED piece smears its face pattern through the
               nine-slice center (owner: "look at how the pattern inside
               the button scales") — the tiled-face build is made for
               exactly this: the frame stretches, the pattern keeps its
               rhythm. Swap it in whenever the board stretched the piece
               beyond its native aspect and the kit ships one. */
            PBAsset baseGeo = null;
            foreach (var aG in m.assets) if (aG != null && aG.component == it.component && aG.part == "base" && aG.shell != null) { baseGeo = aG; break; }
            if (string.IsNullOrEmpty(it.posed) && baseGeo != null && baseGeo.shell.w > 4f && baseGeo.shell.h > 4f && it.h > 1f) {
              float aspRatio = (it.w / it.h) / (baseGeo.shell.w / baseGeo.shell.h);
              if (Mathf.Abs(aspRatio - 1f) > 0.08f) {
                var tfPf = AssetDatabase.LoadAssetAtPath<GameObject>(root + "/Prefabs/Tiled face/" + pfName + " (tiled face).prefab");
                if (tfPf != null) pf = tfPf;
              }
            }
            if (pf == null) { missing++; continue; }
            inst = (GameObject)PrefabUtility.InstantiatePrefab(pf, scene);
            inst.transform.SetParent(canvasGo.transform, false);
            rt = inst.GetComponent<RectTransform>();
            if (rt == null) continue;
          }
          /* zone anchoring: the board records each piece's nearest ninth
             (ax/ay) — offsets are FROM that anchor, so a corner HUD piece
             hugs its corner on every aspect the game runs at */
          rt.anchorMin = new Vector2(it.ax, it.ay); rt.anchorMax = new Vector2(it.ax, it.ay);
          rt.pivot = new Vector2(0.5f, 0.5f);
          float axBoard = it.ax * bd.w;
          float ayBoard = (1f - it.ay) * bd.h; // board y runs down
          rt.anchoredPosition = new Vector2(it.cx - axBoard, -(it.cy - ayBoard));
          if (string.IsNullOrEmpty(it.stamp)) {
            if (!string.IsNullOrEmpty(it.posed)) {
              /* the POSED bake is this copy's exact pixels at its board
                 proportions — worn 1:1, no slicing, no scale math (owner:
                 "the back of the flame button looks scrunched up"). The
                 ROOT keeps the SHELL footprint (labels, state fx and the
                 specular overlay all speak shell coordinates) and an ART
                 CHILD wears the sprite at its own crop box, overhang and
                 all — a shell-tight root image cut the extrusion's reach
                 (owner: "bottom extrusion is cut off"). Sprite Swap rides
                 the art child with POSED state skins (the sliced skins
                 would not match the pose); State FX keeps the glow. */
              var psp = S(root + "/" + it.posed);
              var pimg = inst.GetComponent<Image>();
              if (psp != null && pimg != null) {
                pimg.sprite = null;
                pimg.color = new Color(1f, 1f, 1f, 0f); // invisible, still the button's raycast body
                var pbtn = inst.GetComponent<Button>();
                if (pbtn != null) pbtn.transition = Selectable.Transition.None;
                rt.sizeDelta = new Vector2(it.w, it.h);
                rt.localScale = Vector3.one;
                var artGo = new GameObject("Posed art", typeof(RectTransform), typeof(Image));
                var artRt = artGo.GetComponent<RectTransform>();
                artRt.SetParent(rt, false);
                artRt.SetSiblingIndex(0); // under the label stack and overlays
                artRt.anchorMin = new Vector2(0.5f, 0.5f);
                artRt.anchorMax = new Vector2(0.5f, 0.5f);
                artRt.pivot = new Vector2(0.5f, 0.5f);
                artRt.sizeDelta = new Vector2(it.posedW > 1f ? it.posedW : it.w, it.posedH > 1f ? it.posedH : it.h);
                artRt.anchoredPosition = new Vector2(it.posedDx, -it.posedDy); // board y runs down
                var art = artGo.GetComponent<Image>();
                art.sprite = psp;
                art.type = Image.Type.Simple;
                art.preserveAspect = false;
                art.raycastTarget = false;
                /* the copy's designed states, posed at the SAME crop —
                   Sprite Swap on the ART child, so press sinks the body
                   exactly like the app (owner: "only the text play
                   animates down, the button stays static") */
                var pspH = string.IsNullOrEmpty(it.posedHover) ? null : S(root + "/" + it.posedHover);
                var pspP2 = string.IsNullOrEmpty(it.posedPressed) ? null : S(root + "/" + it.posedPressed);
                var pspD = string.IsNullOrEmpty(it.posedDisabled) ? null : S(root + "/" + it.posedDisabled);
                if (pbtn != null && (pspH != null || pspP2 != null || pspD != null)) {
                  pbtn.transition = Selectable.Transition.SpriteSwap;
                  pbtn.targetGraphic = art;
                  var ssP = new SpriteState();
                  ssP.highlightedSprite = pspH;
                  ssP.selectedSprite = null; // resting face after a click, like the prefabs
                  ssP.pressedSprite = pspP2;
                  ssP.disabledSprite = pspD;
                  pbtn.spriteState = ssP;
                }
                /* the label scales SHELL-to-shell like everything else here.
                   HeroLabel's authoredHeight is the prefab RECT height — the
                   sprite box, crop padding and extrusion included — while
                   this root wears the SHELL box, so the type undersized by
                   that ratio (owner: "type is too small"). Re-anchor it to
                   the shell the scales actually speak. */
                var hl2 = inst.GetComponentInChildren<HeroLabel>(true);
                if (hl2 != null) {
                  PBAsset baseA3 = null;
                  foreach (var a3 in m.assets) if (a3 != null && a3.component == it.component && a3.part == "base" && a3.shell != null) { baseA3 = a3; break; }
                  float ps3 = m.pngScale > 0 ? m.pngScale : 2;
                  if (baseA3 != null && baseA3.shell.h > 4f) hl2.authoredHeight = baseA3.shell.h / ps3;
                  /* re-seat the label root for the SHELL-box root: its
                     prefab anchors are sprite-rect fractions and mis-sit
                     here. Full stretch + this copy's OWN label offset
                     (board px, from its render) — the words land exactly
                     where the app drew them. NO font change here: the
                     authoredHeight override above already supplies the
                     board scale, and a size here would double-scale. */
                  var hlRt2 = hl2.GetComponent<RectTransform>();
                  if (hlRt2 != null) {
                    hlRt2.anchorMin = Vector2.zero; hlRt2.anchorMax = Vector2.one;
                    hlRt2.offsetMin = Vector2.zero; hlRt2.offsetMax = Vector2.zero;
                    hlRt2.anchoredPosition = new Vector2(it.posedLabelDx, -it.posedLabelDy);
                  }
                }
                /* the posed pixels carry the kit's own specular streak — the
                   prefab's overlay child would draw a second one on top */
                var spT = inst.transform.Find("Specular");
                if (spT != null) spT.gameObject.SetActive(false);
                /* WipeShine masks its band with OUR image — a null-sprite,
                   alpha-0 root makes that stencil pass NOTHING and the whole
                   child stack vanishes the moment play starts (owner: "when
                   I go to play the scene the button disappears"). The sweep
                   moves to the art child, whose pixels give the mask
                   something real to hold on to. */
                var ws0 = inst.GetComponent<WipeShine>();
                if (ws0 != null) {
                  ws0.enabled = false;
                  var ws1 = artGo.AddComponent<WipeShine>();
                  ws1.period = ws0.period; ws1.sweep = ws0.sweep; ws1.strength = ws0.strength; ws1.tilt = ws0.tilt;
                }
              } else if (psp == null) {
                Debug.LogWarning("UI Kit Maker: posed sprite missing for " + NiceName(it.component) + " on '" + bd.name + "' — the sliced prefab stands in.");
              }
            } else if (rt.sizeDelta.x > 1f) {
              /* SHELL-TO-SHELL sizing: the board records the shell's box
                 and the manifest records where that shell sits inside the
                 sprite. Scaling by the sprite rect compared a glow-padded
                 board box against a cropped sprite — every prefab landed
                 oversized by its padding ratio (owner: "weird sizing
                 issues", while the baked boards came out right). */
              float ps = m.pngScale > 0 ? m.pngScale : 2;
              var rootImg2 = inst.GetComponent<Image>();
              var rootSp = rootImg2 != null ? rootImg2.sprite : null;
              /* the prefab's ROOT sprite names the truth — rig roots are
                 not "base" (Slider roots on -track, Firebutton on -dome),
                 so match the manifest row to the sprite actually worn,
                 falling back to the family's base */
              PBAsset baseA = null;
              if (rootSp != null) foreach (var a in m.assets) {
                if (a == null || a.component != it.component || a.file == null) continue;
                if (a.file.EndsWith("/" + rootSp.name + ".png")) { baseA = a; break; }
              }
              if (baseA == null) foreach (var a in m.assets) if (a != null && a.component == it.component && a.part == "base") { baseA = a; break; }
              var shl = baseA != null ? baseA.shell : null;
              float s;
              if (shl != null && shl.w > 4f && rootSp != null && rootSp.rect.width > 1f) {
                /* RECT-PROOF: scale from the SPRITE's own pixels, not the
                   prefab rect — an old prefab with a stale rect (the 2x
                   PLAY buttons) sizes true anyway, because the shell's
                   fraction of the sprite survives any rect stretch */
                s = (it.w / rt.sizeDelta.x) * (rootSp.rect.width / shl.w);
                /* STRETCHED pieces (bar / panel gestures widen the shell):
                   a width-only uniform scale would fatten the whole piece
                   vertically. Hold the TRUE vertical scale and let the
                   sliced rect carry the extra width — caps, knobs and
                   label sizes keep their proportions, the footprint is
                   exactly the board's. */
                float sH = shl.h > 4f && rt.sizeDelta.y > 1f ? (it.h / rt.sizeDelta.y) * (rootSp.rect.height / shl.h) : s;
                bool slicedRoot = rootSp.border.sqrMagnitude > 0.5f;
                if (slicedRoot && sH > 0.01f && Mathf.Abs(s / sH - 1f) > 0.08f) {
                  float fxW = shl.w / rootSp.rect.width; // shell's fraction of the sprite
                  rt.sizeDelta = new Vector2(it.w / (sH * fxW), rt.sizeDelta.y);
                  s = sH;
                }
                float fx = (shl.x + shl.w / 2f) / rootSp.rect.width;
                float fy = (shl.y + shl.h / 2f) / rootSp.rect.height;
                float dxS = rt.sizeDelta.x * (fx - 0.5f);
                float dyS = rt.sizeDelta.y * (fy - 0.5f);
                rt.anchoredPosition += new Vector2(-dxS * s, dyS * s);
              } else s = it.w / rt.sizeDelta.x;
              rt.localScale = new Vector3(s, s, 1f);
              /* FLIP fidelity (owner: "the back button doesn't respect the
                 flip"): the board copy's silhouette and the family sprite's
                 own flip are both recorded — when they disagree, mirror the
                 instance and counter-mirror its words so they stay
                 readable. Logged either way a divergence shows, so field
                 reports can finally name which side lost the flip. */
              if (baseA != null && it.flip != baseA.flip) {
                var lsF = rt.localScale; lsF.x = -lsF.x; rt.localScale = lsF;
#if UNITY_2023_2_OR_NEWER
                var lrM = FindOurLabelRoot(inst);
                if (lrM != null) {
                  var lrt9 = lrM.GetComponent<RectTransform>();
                  var l2 = lrt9.localScale; l2.x = -l2.x; lrt9.localScale = l2;
                }
#endif
                Debug.Log("UI Kit Maker: '" + bd.name + "' — " + NiceName(it.component) + " mirrored to match the board (board flipped: " + it.flip + ", sprite flipped: " + baseA.flip + ").");
              }
            } else {
              /* a stretch-anchored prefab root reports no sizeDelta — after
                 the point re-anchoring above its rect IS its sizeDelta, so
                 size it to the board footprint directly (the skip used to
                 leave such pieces at native size — the giant-tab report) */
              rt.sizeDelta = new Vector2(it.w, it.h);
            }
            // the rect may differ from the prefab's now — refit the raycast
            // to the drawn shell so clicks stop at the art on boards too
            ShellRaycastPad(inst, it.component, m);
          }
          if (Mathf.Abs(it.rot) > 0.01f) rt.localRotation = Quaternion.Euler(0f, 0f, -it.rot);
          /* per-copy words (the maker typed them on this copy in the app) —
             the override must speak to the stack's OWNER: setting the TMP
             text alone left HeroLabel's own words in charge, and it
             re-imposed the prefab default on the next rebuild (field:
             three PLAYs where PLAY / STORE / OPTIONS were typed) */
          if (string.IsNullOrEmpty(it.stamp) && !string.IsNullOrEmpty(it.label)) {
#if UNITY_2023_2_OR_NEWER
            var hlOv = inst.GetComponentInChildren<HeroLabel>(true);
            float trueSize = LabelSizeScene(m, it.component);
            /* the parsed labelFs is the app's exact rendered size (it also
               captures fit-downs LabelSizeScene can't see, e.g. header's
               fixed-width squeeze) — prefer it when the manifest ships it */
            var rowOv = LabelRow(m, it.component);
            if (rowOv != null && rowOv.labelFs > 1f) trueSize = rowOv.labelFs;
            if (hlOv != null) {
              // app-true size first, then SetText re-lays the stack
              if (trueSize > 0f) hlOv.fontSize = trueSize;
              hlOv.SetText(it.label);
            } else {
              var tmp = inst.GetComponentInChildren<TMPro.TMP_Text>(true);
              if (tmp != null) {
                tmp.text = it.label;
                if (trueSize > 0f) { tmp.enableAutoSizing = false; tmp.fontSize = trueSize; }
              }
            }
            /* longer words than the prefab default WRAPPED inside the
               fixed label box (field: BACK → "BAC K") — one line, shrink
               to fit instead */
            foreach (var wt in inst.GetComponentsInChildren<TMPro.TMP_Text>(true)) {
#pragma warning disable 0618
              wt.enableWordWrapping = false;
#pragma warning restore 0618
              wt.overflowMode = TMPro.TextOverflowModes.Overflow;
            }
#else
            var tmp = inst.GetComponentInChildren<TMPro.TMP_Text>(true);
            if (tmp != null) tmp.text = it.label;
#endif
          }
          if (string.IsNullOrEmpty(it.stamp)) {
            /* LIVE CONTENT from the board's pose (owner: components, not
               pictures — and the numerics dynamic so they animate) */
            if (!string.IsNullOrEmpty(it.ov)) {
              // variant overlay (trophy ~gold): swap the matching sprite,
              // same union-cropped geometry as base
              var vsp = S(root + "/assets/" + it.component + "/" + it.component + "-" + it.ov + ".png");
              var vim = inst.GetComponent<Image>();
              if (vsp != null && vim != null) vim.sprite = vsp;
            }
            if (it.component == "countbadge" && it.value > 0f) {
              var cntT = inst.GetComponentInChildren<TMPro.TMP_Text>(true);
              if (cntT != null) cntT.text = Mathf.Clamp(Mathf.RoundToInt(it.value * 99f), 1, 99).ToString();
            }
            if (it.component == "endturn" && it.value > 0f) {
              var arcT = inst.transform.Find("Arc");
              if (arcT != null) { var ai2 = arcT.GetComponent<Image>(); if (ai2 != null) ai2.fillAmount = Mathf.Clamp01(it.value); }
            }
            /* the settings rigs strike the board's pose (the exporter
               always sends these two an explicit value) */
            if (it.component == "slider") {
              var slC = inst.GetComponent<Slider>();
              if (slC != null) slC.SetValueWithoutNotify(Mathf.Clamp01(it.value));
            }
            if (it.component == "toggle") {
              var tgC = inst.GetComponent<Toggle>();
              if (tgC != null) tgC.SetIsOnWithoutNotify(it.value > 0.5f);
              var glC = inst.GetComponent<SwitchGlide>();
              if (glC != null) glC.Snap();
            }
            if (it.component == "firebutton" && it.value > 0f) {
              var fbC = inst.GetComponent<FireButton>();
              if (fbC != null) { fbC.armed = Mathf.Min(3, Mathf.FloorToInt(Mathf.Clamp01(it.value) * 4f)); fbC.DealNow(); }
            }
            // rows of keycaps/tabs become working select groups (below)
            if ((it.component == "keycap" || it.component == "tab") && inst.GetComponent<Button>() != null)
              selectRows.Add(new KeyValuePair<PBBoardItem, GameObject>(it, inst));
          }
          placed++;
        }
        WireSelectRows(selectRows);
        if (UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene, scenePath)) {
          // remember incompleteness so the after-prefabs pass rebuilds THIS
          // scene automatically; a complete build clears the marker
          if (missing > 0) SessionState.SetBool("pbBoardPending:" + scenePath, true);
          else SessionState.EraseBool("pbBoardPending:" + scenePath);
          Debug.Log("UI Kit Maker: scene '" + bd.name + "' ready — " + placed + " piece(s) placed" + (missing > 0 ? ", " + missing + " skipped (no prefab yet — it rebuilds itself once prefabs finish, or run Tools > PatternBreak > Rebuild Kit Board Scenes)" : "") + ". Open " + scenePath + " and press Play.");
        }
        else
          Debug.LogWarning("UI Kit Maker: couldn't save the board scene at " + scenePath + ".");
      } finally {
        if (UnityEngine.SceneManagement.SceneManager.sceneCount > 1)
          UnityEditor.SceneManagement.EditorSceneManager.CloseScene(scene, true);
      }
    }

    /* DIFFICULTY-style rows become WORKING controls (owner: "can we get
       difficulty working? … it looks better than the out of the box Unity
       version"): 2+ keycaps (or tabs) sharing a line get a SelectGroup —
       click one, it holds its pressed face, the others release. */
    static void WireSelectRows(List<KeyValuePair<PBBoardItem, GameObject>> row) {
      var used = new bool[row.Count];
      for (int i = 0; i < row.Count; i++) {
        if (used[i]) continue;
        var group = new List<KeyValuePair<PBBoardItem, GameObject>>();
        group.Add(row[i]); used[i] = true;
        for (int j = i + 1; j < row.Count; j++) {
          if (used[j] || row[j].Key.component != row[i].Key.component) continue;
          if (Mathf.Abs(row[j].Key.cy - row[i].Key.cy) > Mathf.Max(row[i].Key.h, row[j].Key.h) * 0.6f) continue;
          group.Add(row[j]); used[j] = true;
        }
        if (group.Count < 2) continue;
        group.Sort((a, b2) => a.Key.cx.CompareTo(b2.Key.cx));
        var members = new Button[group.Count];
        bool ok = true;
        for (int g2 = 0; g2 < group.Count; g2++) {
          members[g2] = group[g2].Value.GetComponent<Button>();
          if (members[g2] == null) ok = false;
        }
        if (!ok) continue;
        var sg = group[0].Value.AddComponent<SelectGroup>();
        sg.members = members;
        sg.selected = 0;
        Debug.Log("UI Kit Maker: wired a select row — " + group.Count + " × " + NiceName(group[0].Key.component) + " (click one in Play mode, it holds its pressed face).");
      }
    }
    [MenuItem("Tools/PatternBreak/Rebuild Kit Board Scenes")]
    public static void RebuildBoardScenes() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) {
        Debug.LogWarning("UI Kit Maker: no kit-manifest.json in this project — drop a kit in first.");
        return;
      }
      int total = 0;
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest m = null;
        try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { continue; }
        if (m == null || m.boards == null || m.boards.Length == 0) continue;
        total += m.boards.Length;
        if (!EditorUtility.DisplayDialog("UI Kit Maker — rebuild board scenes",
          "Replaces this kit's " + m.boards.Length + " board scene(s) with fresh ones from the manifest. Changes you made inside them are lost; every other scene is untouched.",
          "Rebuild", "Skip this kit")) continue;
        foreach (var bd in m.boards) {
          try { BuildBoardScene(root, m, bd, true); }
          catch (Exception e) { Debug.LogWarning("UI Kit Maker: board scene '" + bd.name + "' failed — " + e.Message); }
        }
      }
      if (total == 0) Debug.Log("UI Kit Maker: this kit carries no boards — compose screens on the app's Board and re-export to get scenes.");
    }

    [MenuItem("Tools/PatternBreak/Rebuild Kit Playground Scene")]
    public static void RebuildPlayground() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) {
        Debug.LogWarning("UI Kit Maker: no kit-manifest.json in this project — drop a kit in first.");
        return;
      }
      if (!EditorUtility.DisplayDialog("UI Kit Maker — rebuild the Playground scene",
        "Replaces each kit's Playground.unity with a fresh scene containing the current example prefabs. Changes you made inside the old Playground are lost; every other scene is untouched.",
        "Rebuild", "Cancel")) return;
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        var scenePath = root + "/Playground.unity";
        if (File.Exists(scenePath)) AssetDatabase.DeleteAsset(scenePath);
        BuildPlayground(root);
      }
    }

    /* ── I3's explicit hand: review and remove, never automatic ── */
    [MenuItem("Tools/PatternBreak/Review Orphaned Kit Files")]
    public static void ReviewOrphans() {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      var all = new List<string>();
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        var lockPath = root + "/kit.lock.json";
        if (!File.Exists(lockPath)) continue;
        PBLock rec = null;
        try { rec = JsonUtility.FromJson<PBLock>(File.ReadAllText(lockPath)); } catch (Exception) { continue; }
        if (rec == null || rec.orphans == null) continue;
        foreach (var o in rec.orphans)
          if (!string.IsNullOrEmpty(o) && File.Exists(root + "/" + o)) all.Add(root + "/" + o);
      }
      if (all.Count == 0) {
        EditorUtility.DisplayDialog("UI Kit Maker", "No orphaned kit files — every sprite on disk is part of the current kit.", "Nice");
        return;
      }
      var listing = string.Join("\\n", all.ToArray());
      if (EditorUtility.DisplayDialog("UI Kit Maker — orphaned kit files",
        "These " + all.Count + " file(s) were part of an earlier version of the kit and are no longer in it. They are safe to remove IF nothing in your scenes still uses them.\\n\\n" + listing,
        "Remove them", "Keep everything")) {
        foreach (var p in all) AssetDatabase.DeleteAsset(p);
        Debug.Log("UI Kit Maker: removed " + all.Count + " orphaned file(s).");
      }
    }

    /* ── generated examples — REAL sprite references (a text prefab can
       never carry the GUIDs your Unity mints at import; building them
       here, after import, is what makes them arrive wired) ── */
    static Sprite S(string path) { return AssetDatabase.LoadAssetAtPath<Sprite>(path); }
    static Font BuiltinFont() {
      try { var f = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); if (f != null) return f; } catch (Exception) { }
      try { return Resources.GetBuiltinResource<Font>("Arial.ttf"); } catch (Exception) { }
      return null;
    }
    static GameObject ImageObject(string n, Sprite sp, int pngScale) {
      var go = new GameObject(n, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      var img = go.GetComponent<Image>();
      img.sprite = sp;
      img.type = Image.Type.Sliced;
      if (sp != null && pngScale > 0)
        go.GetComponent<RectTransform>().sizeDelta = new Vector2(sp.rect.width / pngScale, sp.rect.height / pngScale);
      return go;
    }
#if UNITY_2023_2_OR_NEWER
    /* ── the styled face, AUTOMATED (owner: "we really need the styling
       to be automated"): a dynamic SDF font asset is generated from the
       shipped TTF once per kit, its material wears the kit's outline and
       glow straight from the manifest recipe, and prefab labels use it
       with the kit's fill (gradient included). Idempotent: the asset is
       created only when missing, so re-imports never churn it and user
       tweaks to the material survive.
       EVERY exit path SPEAKS — a silent fallback here cost a debugging
       round (owner: "I don't see anything in the console"). ── */
    static bool essentialsRequested;
    static bool TmpReady() {
      try { return TMP_Settings.instance != null; } catch (Exception) { return false; }
    }
    /* TMP's Essential Resources (its shaders) only auto-offer when a human
       creates a TMP object from the menu — code-created text needs them
       imported by hand. We do it FOR the user, once. */
    static bool RequestEssentials() {
      if (essentialsRequested) return false;
      string[] candidates = {
        "Packages/com.unity.ugui/Package Resources/TMP Essential Resources.unitypackage",
        "Packages/com.unity.textmeshpro/Package Resources/TMP Essential Resources.unitypackage",
      };
      foreach (var p in candidates) {
        if (File.Exists(p)) {
          essentialsRequested = true;
          AssetDatabase.ImportPackage(p, false);
          Debug.Log("UI Kit Maker: importing TextMeshPro Essential Resources (one-time — needed for the styled face). The kit finishes its styled-text setup right after.");
          return true;
        }
      }
      Debug.LogWarning("UI Kit Maker: TextMeshPro Essential Resources are missing and couldn't be auto-imported. Run Window > TextMeshPro > Import TMP Essential Resources, then Tools > PatternBreak > Reapply Kit Import Settings. Labels use the shipped TTF meanwhile.");
      return false;
    }
    static TMP_FontAsset EnsureTmpFace(string root, PBManifest m, Font ttf) {
      var path = root + "/fonts/KitFace SDF.asset";
      var existing = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(path);
      if (existing != null) return existing;
      if (ttf == null) return null; // the import pass logs the font story
      TMP_FontAsset fa = null;
      try { fa = TMP_FontAsset.CreateFontAsset(ttf); }
      catch (Exception e) {
        Debug.LogWarning("UI Kit Maker: couldn't build the SDF face from " + ttf.name + " (" + e.Message + ") — labels use the shipped TTF instead.");
        return null;
      }
      if (fa == null) {
        Debug.LogWarning("UI Kit Maker: TextMeshPro returned no font asset for " + ttf.name + " — labels use the shipped TTF instead. If TMP Essential Resources just imported, run Tools > PatternBreak > Reapply Kit Import Settings.");
        return null;
      }
      fa.name = "KitFace SDF";
      AssetDatabase.CreateAsset(fa, path);
      if (fa.material != null) {
        fa.material.name = "KitFace SDF Material";
        AssetDatabase.AddObjectToAsset(fa.material, fa);
        ApplyStyle(fa.material, m, root);
      }
      if (fa.atlasTextures != null && fa.atlasTextures.Length > 0 && fa.atlasTextures[0] != null) {
        fa.atlasTextures[0].name = "KitFace SDF Atlas";
        AssetDatabase.AddObjectToAsset(fa.atlasTextures[0], fa);
      }
      AssetDatabase.SaveAssets();
      Debug.Log("UI Kit Maker: generated the styled TextMeshPro face at " + path + " — outline and glow follow the kit's own type recipe.");
      return fa;
    }
    static void ApplyStyle(Material mat, PBManifest m, string root) {
      var s = m != null && m.typography != null ? m.typography.style : null;
      if (mat == null || s == null) return;
      /* CreateFontAsset hands back a material on the MOBILE distance-field
         shader, which has no glow, bevel or face-texture sections — every
         deep-style write below would land on deaf ears. The full shader
         ships with TMP Essential Resources (already in: TmpReady gates us). */
      var full = Shader.Find("TextMeshPro/Distance Field");
      if (full != null) { if (mat.shader != full) mat.shader = full; }
      else Debug.LogWarning("UI Kit Maker: the TextMeshPro/Distance Field shader isn't in this project, so glow, emboss and the face pattern stay off (fill, outline and shadow still apply). Re-importing TMP Essential Resources restores it.");
      Color c;
      if (s.outline != null && !string.IsNullOrEmpty(s.outline.color) && ColorUtility.TryParseHtmlString(s.outline.color, out c)) {
        /* a GRADIENT stroke (color -> color2) has no TMP equivalent — the
           single color used to be the top one, which erased the kit's
           signature bottom hue entirely (Miami: the cyan vanished). The
           midpoint mix at least carries both voices. The EXACT stroke
           lives on the baked faces. */
        Color c2;
        if (!string.IsNullOrEmpty(s.outline.color2) && ColorUtility.TryParseHtmlString(s.outline.color2, out c2)) c = Color.Lerp(c, c2, 0.5f);
        mat.SetColor("_OutlineColor", c);
        // the app paints the stroke BEHIND the fill (paint-order stroke): the
        // visible band sits OUTSIDE and never eats the character. TMP's outline
        // straddles the edge, so dilate the face by the same amount — the band
        // lands fully outside and the letterform keeps its designed weight.
        float ow = Mathf.Clamp(s.outline.width / 60f, 0.025f, 0.3f);
        mat.SetFloat("_OutlineWidth", ow);
        mat.SetFloat("_FaceDilate", ow);
      } else {
        // review catch: restyles must also TAKE effects away — a kit that
        // turned its outline off keeps a stale stroke otherwise
        mat.SetFloat("_OutlineWidth", 0f);
        mat.SetFloat("_FaceDilate", 0f);
      }
      /* the full Distance Field shader carries a REAL glow section, so the
         glow and the drop shadow (underlay) can both speak at once */
      if (s.glow != null && !string.IsNullOrEmpty(s.glow.color) && ColorUtility.TryParseHtmlString(s.glow.color, out c)) {
        c.a = Mathf.Clamp01(s.glow.opacity / 100f);
        mat.EnableKeyword("GLOW_ON");
        mat.SetColor("_GlowColor", c);
        mat.SetFloat("_GlowOuter", Mathf.Clamp(s.glow.size / 24f, 0.05f, 1f));
        mat.SetFloat("_GlowPower", 0.75f);
      } else mat.DisableKeyword("GLOW_ON");
      if (s.shadow != null && !string.IsNullOrEmpty(s.shadow.color) && ColorUtility.TryParseHtmlString(s.shadow.color, out c)) {
        c.a = Mathf.Clamp01(s.shadow.opacity / 100f);
        mat.EnableKeyword("UNDERLAY_ON");
        mat.SetColor("_UnderlayColor", c);
        mat.SetFloat("_UnderlayOffsetX", Mathf.Clamp(s.shadow.x / 50f, -1f, 1f));
        mat.SetFloat("_UnderlayOffsetY", Mathf.Clamp(0f - s.shadow.y / 50f, -1f, 1f));
        mat.SetFloat("_UnderlaySoftness", Mathf.Clamp(s.shadow.blur / 30f, 0f, 1f));
      } else mat.DisableKeyword("UNDERLAY_ON");
      /* emboss → the shader's bevel + lighting, lit from the kit's angle */
      if (s.emboss != null && Mathf.Abs(s.emboss.strength) > 0.01f) {
        mat.EnableKeyword("BEVEL_ON");
        mat.SetFloat("_Bevel", Mathf.Clamp(Mathf.Abs(s.emboss.strength) / 100f, 0.1f, 1f));
        mat.SetFloat("_BevelWidth", 0.25f);
        mat.SetFloat("_BevelRoundness", 0.35f);
        if (s.emboss.strength < 0f) mat.SetFloat("_BevelOffset", -0.25f);
        mat.SetFloat("_LightAngle", (s.lightAngle + 90f) * Mathf.Deg2Rad);
        mat.SetFloat("_SpecularPower", 1.5f);
      } else mat.DisableKeyword("BEVEL_ON");
      /* the letterform pattern deliberately does NOT ride the face material
         (owner call): one shared material can't tile correctly for every
         label length a developer might type, and a treatment that only works
         for short labels breaks the "it just works" promise. The seamless
         tile still ships (fonts/face-pattern.png, density in the manifest's
         pattern.reps) for anyone who wants it in the Face Texture slot by
         hand — and Type Stamps carry the pattern pixel-perfect. */
    }
    /* ── the BAKED alphabet face: a color font assembled from the atlas the
       app rendered — every glyph the app's exact pixels, pattern, glints
       and gloss included. TMP's internals drift across editor versions,
       so every write is reflection-tolerant and every exit speaks. ── */
    static bool SetField(object target, string name, object value) {
      var f = target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
      if (f == null) return false;
      try {
        if (f.FieldType.IsEnum) value = Enum.ToObject(f.FieldType, Convert.ToInt32(value));
        else if (f.FieldType == typeof(int)) value = Convert.ToInt32(value);
        else if (f.FieldType == typeof(float)) value = Convert.ToSingle(value);
        f.SetValue(target, value);
        return true;
      } catch (Exception) { return false; }
    }
    static void EnsureBakedFace(string root, PBManifest m, bool refresh) {
      if (m == null || m.typography == null || m.typography.bakedFace == null || string.IsNullOrEmpty(m.typography.bakedFace.file)) return;
      var jsonPath = root + "/" + m.typography.bakedFace.metrics;
      if (!File.Exists(jsonPath)) return;
      PBBakedFace face = null;
      try { face = JsonUtility.FromJson<PBBakedFace>(File.ReadAllText(jsonPath)); } catch (Exception) { }
      if (face == null || face.glyphs == null || face.glyphs.Length == 0) {
        Debug.LogWarning("UI Kit Maker: " + jsonPath + " unreadable — the baked face is skipped (labels keep the SDF face).");
        return;
      }
      AssembleBakedFont(root, m, refresh, "KitFace Baked", root + "/" + m.typography.bakedFace.file,
        face.glyphs, face.atlasW, face.atlasH, face,
        " glyphs of the app's exact pixels (pattern, glints and gloss included). Put it on any TMP label for hero text: Font Asset = KitFace Baked, label color WHITE.");
      /* ONE GEOMETRY, MANY INKS (owner: "1 character = 3 layers bound
         that move, transform, are affected by the same forces"). The
         whole layer stack is ONE font asset — this one — laid out by ONE
         TextMeshPro text. Stroke, Shadow and Glints are not fonts and
         not texts: they are plain ink materials, drawn by HeroLabel
         re-rendering the text's own mesh behind or in front of it. The
         bake packs every layer's texture over identical glyph rects, so
         the same mesh reads each ink perfectly in register. A layer
         cannot misalign, because there is no second layout to disagree
         with — and nothing left to synchronize. */
      if (!string.IsNullOrEmpty(m.typography.bakedFace.layerFill) && !string.IsNullOrEmpty(m.typography.bakedFace.layerStroke)
          && face.layerGlyphs != null && face.layerGlyphs.Length > 0) {
        AssembleBakedFont(root, m, refresh, "KitFace Baked Layers", root + "/" + m.typography.bakedFace.layerFill,
          face.layerGlyphs, face.layersAtlasW, face.layersAtlasH, face,
          " glyphs — THE layered-label font, and the ONLY place hero type lays out: glyphs, kerning and the Glyph Adjustment Table all live here, once. Stroke, Shadow and Glints redraw this font's own mesh wearing the KitFace Ink materials beside it.");
        EnsureInkMaterial(root, "Stroke", m.typography.bakedFace.layerStroke, null);
        EnsureInkMaterial(root, "Shadow", m.typography.bakedFace.layerShadow, null);
        EnsureInkMaterial(root, "Glints", m.typography.bakedFace.layerGlints, m.typography.style);
        /* retire the two dead ends this system lived through: the
           per-layer material skins (TMP silently reverts a material whose
           texture isn't the font's own atlas) and the mirror font assets
           (four layout engines kept in step by sync code — the sync
           always lost eventually). The redress pass rebuilds any label
           still wearing either. */
        foreach (var nm in new string[] { "Stroke", "Shadow", "Glints" }) {
          AssetDatabase.DeleteAsset(root + "/fonts/KitFace Layer " + nm + ".mat");
          AssetDatabase.DeleteAsset(root + "/fonts/KitFace Layer " + nm + ".asset");
        }
      }
    }
    /* An ink is the smallest possible asset: UI/Default plus the layer's
       baked texture. No font, no table, no TMP jurisdiction — TMP's
       material validation never sees it, because it never sits on a TMP
       component. */
    /* the 1-1 blend system for the app's glint blend menu — the states the
       shipped GlintInk shader consumes. Ints are UnityEngine.Rendering.
       BlendMode values; pack selects the frag's source packing. CUSTOM
       derivation for the white glint ink (every formula collapses at s=1):
       overlay's dark branch b(1+a) is exactly DstColor/One with a
       premultiplied source — the CANDY GAIN: it scales the fill's own
       color instead of adding flat white, so the glow keeps the kit's hue
       and only genuinely bright fills clamp toward white (where true
       overlay is headed anyway). Hard-light with white IS screen, so it
       ships as screen, exact. normal/multiply/screen were already exact. */
    static void ApplyGlintBlend(Material mat, string mode) {
      float src = 2, dst = 1, pack = 4;                                 // overlay (default): DstColor/One candy gain at 90%
      if (mode == "normal") { src = 5; dst = 10; pack = 0; }            // SrcAlpha/OneMinusSrcAlpha
      else if (mode == "multiply") { src = 2; dst = 0; pack = 2; }      // DstColor/Zero, empty air = white
      else if (mode == "screen") { src = 1; dst = 6; pack = 1; }        // One/OneMinusSrcColor
      else if (mode == "hard-light") { src = 1; dst = 6; pack = 1; }    // with white ink, hard-light IS screen
      else if (mode == "soft-light") { src = 1; dst = 6; pack = 3; }    // gentle screen (0.4 fit of b + a(√b−b))
      mat.SetFloat("_SrcBlend", src); mat.SetFloat("_DstBlend", dst); mat.SetFloat("_Pack", pack);
    }
    /* the LIVE FIELD (owner: "one graphic, not a bunch of little letters"):
       the kit's band recipe rides the material as shader constants and the
       GlintInk shader draws ONE sweep across the whole word in label space.
       Per-label geometry (_Em/_Cx/_Cy/_TextW) is HeroLabel's job. */
    static void ApplyGlintField(Material mat, PBStyle st) {
      if (st == null || !mat.HasProperty("_Style")) return;
      float s = 0f;
      var name = st.glintStyle != null ? st.glintStyle : "";
      if (name == "slab") s = 1f; else if (name == "streak") s = 2f;
      else if (name == "sheen") s = 3f; else if (name == "stars") s = 4f;
      mat.SetFloat("_Style", s);
      mat.SetFloat("_Op", Mathf.Clamp01(st.glintOpacity / 100f));
      mat.SetFloat("_OxEm", Mathf.Clamp(st.glintOx, -100f, 100f) / 100f);
      mat.SetFloat("_OyEm", Mathf.Clamp(st.glintOy, -100f, 100f) / 100f);
      mat.SetFloat("_Lx", st.glintLx); mat.SetFloat("_Ly", st.glintLy);
    }
    static void EnsureInkMaterial(string root, string layerName, string texFile, PBStyle style) {
      var path = root + "/fonts/KitFace Ink " + layerName + ".mat";
      if (string.IsNullOrEmpty(texFile)) { AssetDatabase.DeleteAsset(path); return; }
      var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(root + "/" + texFile);
      if (tex == null) return; // atlas not imported yet — the next pass retries
      /* the Glints ink wears the shipped GlintInk shader with the kit's own
         blend mode; UI/Default stands in until the shader compiles, and the
         next pass upgrades in place */
      var glintBlend = style != null ? style.glintBlend : null;
      var glint = Shader.Find("UIKitMaker/GlintInk");
      var want = layerName == "Glints" && glint != null ? glint : Shader.Find("UI/Default");
      var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
      if (mat == null) {
        if (want == null) { Debug.LogWarning("UI Kit Maker: UI/Default shader missing — the " + layerName + " ink is skipped."); return; }
        mat = new Material(want);
        mat.mainTexture = tex;
        if (layerName == "Glints" && want == glint) { ApplyGlintBlend(mat, string.IsNullOrEmpty(glintBlend) ? "overlay" : glintBlend); ApplyGlintField(mat, style); }
        AssetDatabase.CreateAsset(mat, path);
        return;
      }
      // re-imports retexture in place; the material file (and any tint a
      // user set on it) stays theirs — but the Glints ink's shader, blend
      // states and field recipe DO re-apply, or an app-side change never lands
      if (mat.mainTexture != tex) { mat.mainTexture = tex; EditorUtility.SetDirty(mat); }
      if (layerName == "Glints" && glint != null) {
        if (mat.shader != glint) { mat.shader = glint; mat.mainTexture = tex; }
        ApplyGlintBlend(mat, string.IsNullOrEmpty(glintBlend) ? "overlay" : glintBlend);
        ApplyGlintField(mat, style);
        EditorUtility.SetDirty(mat);
      }
    }
    static Material InkMaterial(string root, string layerName) {
      return AssetDatabase.LoadAssetAtPath<Material>(root + "/fonts/KitFace Ink " + layerName + ".mat");
    }
    /* ── kerning plumbing. Pairs are keyed by CHARACTER, not glyph index:
       glyph indices belong to one font asset, characters are the same on
       all four layer faces (and survive a glyph-set change). ── */
    static long PairKey(uint l, uint r) { return ((long)l << 32) | (long)r; }
#if UNITY_2023_2_OR_NEWER
    static Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord> ReadFacePairs(TMP_FontAsset fa) {
      var outp = new Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord>();
      if (fa == null || fa.fontFeatureTable == null || fa.characterTable == null) return outp;
      var uni = new Dictionary<uint, uint>();
      foreach (var c in fa.characterTable) if (c != null && !uni.ContainsKey(c.glyphIndex)) uni[c.glyphIndex] = c.unicode;
      foreach (var r in fa.fontFeatureTable.glyphPairAdjustmentRecords) {
        uint lu, ru;
        // a half-entered Inspector row has glyph index 0 — not a pair yet
        if (!uni.TryGetValue(r.firstAdjustmentRecord.glyphIndex, out lu)) continue;
        if (!uni.TryGetValue(r.secondAdjustmentRecord.glyphIndex, out ru)) continue;
        /* the WHOLE first-record value travels — OX/OY placement nudges
           included, not just the advance (field: an OY typed into the
           table was silently zeroed by the next pass) */
        outp[PairKey(lu, ru)] = r.firstAdjustmentRecord.glyphValueRecord;
      }
      return outp;
    }
    static void WriteFacePairs(TMP_FontAsset fa, Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord> pairs) {
      if (fa == null) return;
      // a fresh font asset has no feature table until something makes one —
      // without this every measured pair went nowhere, silently
      if (fa.fontFeatureTable == null) SetField(fa, "m_FontFeatureTable", new TMP_FontFeatureTable());
      var feat = fa.fontFeatureTable;
      if (feat == null || fa.characterTable == null) return;
      var gi = new Dictionary<uint, uint>();
      foreach (var c in fa.characterTable) if (c != null && !gi.ContainsKey(c.unicode)) gi[c.unicode] = c.glyphIndex;
      /* A row the maker is still filling in has a glyph index of 0 on one
         side and resolves to nothing. This rebuild used to drop it, so the
         blank record you get from "Add New Glyph Adjustment Record"
         vanished the instant the sync ran — pressing the button appeared
         to break the table (owner: "it broke on the glyph adjustment
         after pressing add new glyph"). Carry those rows through
         untouched; they become real pairs once both sides are set, and
         the next pass picks them up properly. */
      var inProgress = new List<UnityEngine.TextCore.LowLevel.GlyphPairAdjustmentRecord>();
      foreach (var r in feat.glyphPairAdjustmentRecords)
        if (r.firstAdjustmentRecord.glyphIndex == 0 || r.secondAdjustmentRecord.glyphIndex == 0)
          inProgress.Add(r);
      feat.glyphPairAdjustmentRecords.Clear();
      foreach (var r in inProgress) feat.glyphPairAdjustmentRecords.Add(r);
      foreach (var kv in pairs) {
        uint lu = (uint)(kv.Key >> 32), ru = (uint)(kv.Key & 0xFFFFFFFFL);
        uint li, ri;
        if (!gi.TryGetValue(lu, out li) || !gi.TryGetValue(ru, out ri)) continue;
        var first = new UnityEngine.TextCore.LowLevel.GlyphAdjustmentRecord(li, kv.Value);
        var second = new UnityEngine.TextCore.LowLevel.GlyphAdjustmentRecord(ri, new UnityEngine.TextCore.LowLevel.GlyphValueRecord(0f, 0f, 0f, 0f));
        feat.glyphPairAdjustmentRecords.Add(new UnityEngine.TextCore.LowLevel.GlyphPairAdjustmentRecord(first, second));
      }
      fa.ReadFontAssetDefinition();
      EditorUtility.SetDirty(fa);
    }
    static int ApplyKernOverrides(string root, Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord> pairs) {
      var p = root + "/fonts/kerning-overrides.json";
      if (!File.Exists(p)) return 0;
      PBKernOvFile f = null;
      try { f = JsonUtility.FromJson<PBKernOvFile>(File.ReadAllText(p)); } catch (Exception) { }
      if (f == null || f.pairs == null) return 0;
      foreach (var o in f.pairs) pairs[PairKey((uint)o.l, (uint)o.r)] = new UnityEngine.TextCore.LowLevel.GlyphValueRecord(o.ox, o.oy, o.k, 0f);
      return f.pairs.Length;
    }
    /* Tune a pair — every layer moves natively (one font asset, one
       table, echoes of one mesh). This pass only RECORDS the tweak to
       fonts/kerning-overrides.json so the next zip re-applies it. */
    static bool s_kernSyncing;
    /* saving the font asset IS the gesture — no menu item to remember
       (owner: "running a tool is a bit cumbersome") */
    public static void SyncKerningQuiet() { SyncKerningCore(true); }
    [MenuItem("Tools/PatternBreak/Sync Label Kerning (usually automatic)")]
    public static void SyncKerning() { SyncKerningCore(false); }
    static void SyncKerningCore(bool auto) {
      if (s_kernSyncing) return; // our own SaveAssets re-enters the save hook
      s_kernSyncing = true;
      try { SyncKerningRun(auto); } finally { s_kernSyncing = false; }
    }
    static void SyncKerningRun(bool auto) {
      var manifests = AssetDatabase.FindAssets("kit-manifest t:TextAsset");
      if (manifests.Length == 0) { if (!auto) Debug.LogWarning("UI Kit Maker: no kit in this project to sync."); return; }
      foreach (var guid in manifests) {
        var mPath = AssetDatabase.GUIDToAssetPath(guid);
        var root = Path.GetDirectoryName(mPath).Replace("\\\\", "/");
        PBManifest m = null;
        try { m = JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)); } catch (Exception) { }
        if (m == null) continue;
        /* ONE table now — this pass is a SNAPSHOT, not a reconciliation.
           The whole layer stack reads a single font asset, so a pair tuned
           in its Glyph Adjustment Table moves every layer natively; there
           are no sibling copies to drift, and nothing here writes to the
           font — a row you are half-way through typing cannot be touched.
           All this does is record your deviations from the shipped bake
           into fonts/kerning-overrides.json so the next import re-applies
           them onto the rebuilt asset. */
        var fa = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
        if (fa == null) fa = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked.asset");
        if (fa == null) continue;
        /* No mirror copy lives here any more. The echo layers draw the
           master's own mesh, so a tuned pair moves every layer THE FRAME
           it lands — there is no second table in the project to bring up
           to date, and the brief catch-up blink the mirrors had is gone
           with them. */
        // what we SHIPPED, so a tweak can be told apart from the bake
        var shipped = new Dictionary<long, float>();
        if (m.typography != null && m.typography.bakedFace != null && !string.IsNullOrEmpty(m.typography.bakedFace.metrics)) {
          var jp = root + "/" + m.typography.bakedFace.metrics;
          if (File.Exists(jp)) {
            PBBakedFace bf = null;
            try { bf = JsonUtility.FromJson<PBBakedFace>(File.ReadAllText(jp)); } catch (Exception) { }
            if (bf != null && bf.kerning != null) foreach (var kp in bf.kerning) shipped[PairKey((uint)kp.l, (uint)kp.r)] = kp.k;
          }
        }
        /* seed from the record: a pair the face LOST (an older importer's
           rebuild) survives — the record is intent, the face only its
           current rendering. A pair the face still carries speaks for
           itself below, so reverting one by hand also clears it here. */
        var rec = new Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord>();
        var prior = new Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord>();
        var ovPath = root + "/fonts/kerning-overrides.json";
        if (File.Exists(ovPath)) {
          PBKernOvFile pf = null;
          try { pf = JsonUtility.FromJson<PBKernOvFile>(File.ReadAllText(ovPath)); } catch (Exception) { }
          if (pf != null && pf.pairs != null)
            foreach (var o in pf.pairs) prior[PairKey((uint)o.l, (uint)o.r)] = new UnityEngine.TextCore.LowLevel.GlyphValueRecord(o.ox, o.oy, o.k, 0f);
        }
        foreach (var kv in prior) rec[kv.Key] = kv.Value;
        foreach (var kv in ReadFacePairs(fa)) {
          var v = kv.Value;
          float ship;
          bool hasShip = shipped.TryGetValue(kv.Key, out ship);
          bool zero = Mathf.Abs(v.xAdvance) < 0.01f && Mathf.Abs(v.xPlacement) < 0.01f && Mathf.Abs(v.yPlacement) < 0.01f;
          /* an all-zero pair the typeface never shipped is a row still
             being typed (glyphs set, numbers not yet) — never intent */
          if (zero && !hasShip) { rec.Remove(kv.Key); continue; }
          bool dev = (hasShip ? Mathf.Abs(v.xAdvance - ship) > 0.01f : true)
            || Mathf.Abs(v.xPlacement) > 0.01f || Mathf.Abs(v.yPlacement) > 0.01f;
          if (dev) rec[kv.Key] = v;
          else rec.Remove(kv.Key); // back to the shipped value = tweak reverted
        }
        /* nothing to record = nothing to write. An empty file must never
           replace a real one, and deleting the file must STAY deleted. */
        if (rec.Count == 0) {
          if (!auto) Debug.Log("UI Kit Maker: no kerning tweaks to record — the table matches the shipped bake.");
          continue;
        }
        bool changed = rec.Count != prior.Count;
        if (!changed) foreach (var kv in rec) {
          UnityEngine.TextCore.LowLevel.GlyphValueRecord pv;
          if (!prior.TryGetValue(kv.Key, out pv) || Mathf.Abs(pv.xAdvance - kv.Value.xAdvance) > 0.005f
              || Mathf.Abs(pv.xPlacement - kv.Value.xPlacement) > 0.005f || Mathf.Abs(pv.yPlacement - kv.Value.yPlacement) > 0.005f) { changed = true; break; }
        }
        if (!changed && auto) continue; // a quiet pass with nothing new stays quiet
        var tweaks = new List<PBKernOv>();
        foreach (var kv in rec)
          tweaks.Add(new PBKernOv { l = (int)(kv.Key >> 32), r = (int)(kv.Key & 0xFFFFFFFFL),
            k = kv.Value.xAdvance, ox = kv.Value.xPlacement, oy = kv.Value.yPlacement });
        var ovFile = new PBKernOvFile { pairs = tweaks.ToArray() };
        try {
          File.WriteAllText(ovPath, JsonUtility.ToJson(ovFile, true));
          AssetDatabase.ImportAsset(ovPath);
        } catch (Exception e) { Debug.LogWarning("UI Kit Maker: couldn't save your kerning tweaks — " + e.Message); }
        Debug.Log("UI Kit Maker: " + tweaks.Count + " tuned pair(s) recorded to fonts/kerning-overrides.json — every layer already follows (one shared table), and every future import re-applies them.");
      }
    }
#endif
    static void AssembleBakedFont(string root, PBManifest m, bool refresh, string faceName, string texPath, PBBakedGlyph[] glyphs, int atlasW, int atlasH, PBBakedFace face, string note) {
      var assetPath = root + "/fonts/" + faceName + ".asset";
      var existing = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(assetPath);
      // a half-assembled survivor of a failed pass (created, then TMP threw
      // before the tables landed) counts as missing — rebuild it in place
      bool broken = existing != null && (existing.characterTable == null || existing.characterTable.Count == 0);
      if (existing != null && !refresh && !broken) return; // yours after first assembly; Regenerate refreshes
      var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);
      if (tex == null) return; // atlas not imported yet — the next pass retries
      try {
        var shader = Shader.Find("TextMeshPro/Bitmap Custom Atlas"); // samples the atlas in full COLOR
        if (shader == null) shader = Shader.Find("TextMeshPro/Bitmap"); // alpha-only fallback: silhouettes, but working text
        if (shader == null) { Debug.LogWarning("UI Kit Maker: no TextMeshPro Bitmap shader in this project — baked face skipped."); return; }
        var fa = existing != null ? existing : ScriptableObject.CreateInstance<TMP_FontAsset>();
        fa.name = faceName;
        /* field report, first assembly attempt: "Upgrading font asset
           [KitFace Baked] to version 1.1.0" then an NRE. A fresh
           TMP_FontAsset has no version stamp, so TMP runs its legacy
           upgrade over internals that were never populated. Stamp it
           current and pre-create the table the upgrade would have built. */
        SetField(fa, "m_Version", "1.1.0");
        var fftField = typeof(TMP_FontAsset).GetField("m_FontFeatureTable", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
        if (fftField != null && fftField.GetValue(fa) == null) {
          var fftType = typeof(TMP_FontAsset).Assembly.GetType("TMPro.TMP_FontFeatureTable");
          if (fftType != null) { try { fftField.SetValue(fa, Activator.CreateInstance(fftType)); } catch (Exception) { } }
        }
        object fi = new UnityEngine.TextCore.FaceInfo();
        SetField(fi, "m_FamilyName", (string.IsNullOrEmpty(m.typography.font) ? "Kit" : m.typography.font) + " " + faceName.Replace("KitFace ", ""));
        SetField(fi, "m_StyleName", "Baked");
        SetField(fi, "m_PointSize", face.pointSize);
        SetField(fi, "m_Scale", 1f);
        SetField(fi, "m_LineHeight", face.lineHeight);
        SetField(fi, "m_AscentLine", face.ascent);
        SetField(fi, "m_CapLine", face.ascent * 0.7f);
        SetField(fi, "m_MeanLine", face.ascent * 0.5f);
        SetField(fi, "m_Baseline", 0f);
        SetField(fi, "m_DescentLine", 0f - face.descent);
        SetField(fi, "m_TabWidth", face.pointSize * 2f);
        if (!SetField(fa, "m_FaceInfo", fi)) {
          Debug.LogWarning("UI Kit Maker: this TMP version hides FaceInfo — baked face skipped (labels keep the SDF face).");
          return;
        }
        if (fa.glyphTable == null) SetField(fa, "m_GlyphTable", new List<UnityEngine.TextCore.Glyph>());
        if (fa.characterTable == null) SetField(fa, "m_CharacterTable", new List<TMP_Character>());
        if (fa.glyphTable == null || fa.characterTable == null) {
          Debug.LogWarning("UI Kit Maker: this TMP version hides the glyph tables — baked face skipped.");
          return;
        }
        fa.glyphTable.Clear();
        fa.characterTable.Clear();
        uint gi = 1;
        foreach (var g in glyphs) {
          // the JSON is top-origin (canvas); TextCore rects are bottom-origin
          var rect = new UnityEngine.TextCore.GlyphRect(g.x, atlasH - g.y - g.h, g.w, g.h);
          var met = new UnityEngine.TextCore.GlyphMetrics(g.w, g.h, g.bx, g.by, g.adv);
          var glyph = new UnityEngine.TextCore.Glyph(gi, met, rect, 1f, 0);
          fa.glyphTable.Add(glyph);
          object ch = null;
          try { ch = Activator.CreateInstance(typeof(TMP_Character), (uint)g.u, fa, glyph); }
          catch (Exception) { try { ch = Activator.CreateInstance(typeof(TMP_Character), (uint)g.u, glyph); } catch (Exception) { } }
          if (ch != null) {
            // field report: glyphs present but text fell back to the default
            // font — a character whose back-pointer to its font asset is null
            // reads as "not here" at render time. Set it no matter which
            // constructor we got.
            SetField(ch, "m_TextAsset", fa);
            fa.characterTable.Add((TMP_Character)ch);
          }
          gi++;
        }
        /* the app's KERNING PAIRS (owner: "how far away the Y is from the
           other letterforms"): what the typeface says, then the maker's
           own tweaks on top (fonts/kerning-overrides.json). One table on
           one asset is the whole story now — the echo layers draw this
           font's own mesh, so they cannot hold a different table.
           Tolerant: a TMP without the feature table keeps plain
           advances. */
        int kernApplied = 0, kernKept = 0;
        try {
          var pairs = new Dictionary<long, UnityEngine.TextCore.LowLevel.GlyphValueRecord>();
          if (face.kerning != null)
            foreach (var kp in face.kerning) pairs[PairKey((uint)kp.l, (uint)kp.r)] = new UnityEngine.TextCore.LowLevel.GlyphValueRecord(0f, 0f, kp.k, 0f);
          kernKept = ApplyKernOverrides(root, pairs);
          WriteFacePairs(fa, pairs);
          kernApplied = pairs.Count;
        } catch (Exception) { kernApplied = 0; /* pairs are a refinement — advances stay correct */ }
        SetField(fa, "m_AtlasTextures", new Texture2D[] { tex });
        SetField(fa, "m_AtlasWidth", atlasW);
        SetField(fa, "m_AtlasHeight", atlasH);
        SetField(fa, "m_AtlasPadding", 2);
        SetField(fa, "m_AtlasPopulationMode", 0); // Static — the app owns the atlas
        var mat = fa.material != null ? fa.material : new Material(shader);
        if (fa.material == null) mat.name = faceName + " Material";
        mat.SetTexture("_MainTex", tex);
        if (!SetField(fa, "m_Material", mat)) {
          Debug.LogWarning("UI Kit Maker: couldn't attach the baked face material on this TMP version — baked face skipped.");
          return;
        }
        if (existing == null) {
          AssetDatabase.CreateAsset(fa, assetPath);
          AssetDatabase.AddObjectToAsset(mat, fa);
        }
        fa.ReadFontAssetDefinition();
        EditorUtility.SetDirty(fa);
        AssetDatabase.SaveAssets();
        Debug.Log("UI Kit Maker: " + faceName + " assembled at " + assetPath + " — " + fa.characterTable.Count
          + note + " Crisp up to ~" + Mathf.RoundToInt(face.pointSize) + "px, softens beyond — that's bitmap-font physics."
          + (kernApplied > 0
            ? " " + kernApplied + " kerning pairs written" + (kernKept > 0 ? " (" + kernKept + " of them YOUR tuned pairs, re-applied from fonts/kerning-overrides.json)" : "") + "."
            : (face.kerning != null && face.kerning.Length > 0
              ? " KERNING SKIPPED — this TMP version wouldn't take a pair-adjustment table, so letter pairs keep their plain advances. Send this line to uikitmaker.com."
              : " This kit's face reported no kerning pairs.")));
      } catch (Exception e) {
        Debug.LogWarning("UI Kit Maker: " + faceName + " couldn't self-assemble on this Unity version (" + e.Message + "). The atlas and metrics are intact in fonts/ — send this line to uikitmaker.com and we'll wire it.");
      }
    }
    /* ── the kit's fill as a one-click Color Gradient preset: prefab labels
       arrive wearing the gradient automatically, but a HAND-made text
       starts white (fill is per-label vertex color, not material). The
       preset makes "paint it like the kit" a dropdown pick — and it
       updates on every import, so hand-styled labels restyle with the
       kit like everything else. ── */
    static void EnsureGradientPreset(string root, PBManifest m) {
      var s = m != null && m.typography != null ? m.typography.style : null;
      if (s == null || string.IsNullOrEmpty(s.fill)) return;
      Color top, bot;
      if (!ColorUtility.TryParseHtmlString(s.fill, out top)) return;
      if (s.fillMode != "gradient" || string.IsNullOrEmpty(s.fill2) || !ColorUtility.TryParseHtmlString(s.fill2, out bot)) bot = top;
      var path = root + "/fonts/KitFace Gradient.asset";
      var g = AssetDatabase.LoadAssetAtPath<TMP_ColorGradient>(path);
      bool fresh = g == null;
      if (fresh) g = ScriptableObject.CreateInstance<TMP_ColorGradient>();
      g.colorMode = ColorMode.FourCornersGradient;
      g.topLeft = top; g.topRight = top; g.bottomLeft = bot; g.bottomRight = bot;
      if (fresh) {
        AssetDatabase.CreateAsset(g, path);
        Debug.Log("UI Kit Maker: fill preset ready — on any TMP label, tick Color Gradient and set Color Preset to KitFace Gradient (in fonts/) to paint the text in the kit's own fill.");
      } else EditorUtility.SetDirty(g);
    }
    /* The kit's CURRENT label dress — ink (solid or gradient), weight,
       italic, tracking — shared by prefab generation and by the per-import
       maintenance pass. Words, font size and alignment are never in here:
       those belong to the user. */
    static void TargetInk(PBStyle s, out Color top, out Color bot, out bool grad) {
      top = Color.white; bot = Color.white; grad = false;
      if (s == null) return;
      if (s.fillMode == "gradient" && ColorUtility.TryParseHtmlString(s.fill != null ? s.fill : "", out top) && ColorUtility.TryParseHtmlString(s.fill2 != null ? s.fill2 : "", out bot)) grad = true;
      else if (s.fillMode == "solid" && ColorUtility.TryParseHtmlString(s.fill != null ? s.fill : "", out top)) { }
      else top = Color.white; // "auto" resolves against each face; white is the safe stage ink
    }
    static FontStyles TargetFontStyle(PBStyle s) {
      var style = s != null && s.italic ? FontStyles.Italic : FontStyles.Normal;
      if (s != null && s.weight >= 700) style = style | FontStyles.Bold;
      return style;
    }
    static void StyleLabel(TextMeshProUGUI t, PBStyle s) {
      Color top, bot; bool grad;
      TargetInk(s, out top, out bot, out grad);
      t.fontStyle = TargetFontStyle(s);
      // the kit's tracking: both sides speak hundredths of an em
      if (s != null) t.characterSpacing = s.spacingEmPct;
      if (grad) { t.enableVertexGradient = true; t.colorGradient = new VertexGradient(top, top, bot, bot); t.color = Color.white; }
      else { t.enableVertexGradient = false; t.color = top; }
    }
    static bool LabelCurrent(TextMeshProUGUI t, PBStyle s, TMP_FontAsset face) {
      Color top, bot; bool grad;
      TargetInk(s, out top, out bot, out grad);
      if (face != null && t.font != face) return false;
      if (t.fontStyle != TargetFontStyle(s)) return false;
      if (s != null && !Mathf.Approximately(t.characterSpacing, s.spacingEmPct)) return false;
      if (t.enableVertexGradient != grad) return false;
      if (grad) return t.colorGradient.topLeft == top && t.colorGradient.bottomLeft == bot && t.color == Color.white;
      return t.color == top;
    }
    /* The kit's designed state INK for live labels, wired as a tiny runtime
       component riding the same pointer events as the Button's SpriteSwap
       (field: the face swaps on press but "the text isn't following the
       face"). A fork set on ONE specific button (manifest.labelStates,
       keyed by family) wins over the master typography.stateStyles set;
       only wired when the kit actually forks its text ink. */
    static bool HasStateInk(PBManifest m, string family) {
      if (m == null) return false;
      if (m.typography != null && m.typography.stateStyles != null && m.typography.stateStyles.Length > 0) return true;
      if (m.labelStates != null) foreach (var ls in m.labelStates) if (ls.family == family) return true;
      return false;
    }
    /* ink COLOR forks need the SDF face (its vertex color is dynamic);
       shift-only entries work on any face. This gate decides whether a
       family's label may wear the EXACT baked face instead. */
    static bool HasInkColorFork(PBManifest m, string family) {
      if (m == null) return false;
      if (m.typography != null && m.typography.stateStyles != null)
        foreach (var e in m.typography.stateStyles) if (!string.IsNullOrEmpty(e.fillMode)) return true;
      if (m.labelStates != null)
        foreach (var e in m.labelStates) if (e.family == family && !string.IsNullOrEmpty(e.fillMode)) return true;
      return false;
    }
    /* the label face ladder (owner, on seeing Miami's cyan stroke and
       chevron letter-pattern missing from button labels: "type coming from
       the kit on buttons is not working"): the BAKED face carries the
       app's exact pixels — stroke gradients, letter patterns, glints —
       so any family that doesn't need dynamic ink colors wears it. The
       styled SDF stays the fallback (free tier, offline bakes, ink forks). */
    static TMP_FontAsset BakedLabelFace(PBManifest m, string root, string family) {
      if (HasInkColorFork(m, family)) return null;
      return AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked.asset");
    }
    /* the kit's button-word size: the app scales it by the Type Size dial
       (52 = baseline) — 40 stays the fallback for pre-labelSize manifests */
    /* the app-true label size for BOARD SCENES — the 0.74-fitted size is
       for loose prefab rects; a placed copy's rect is the app's own shell */
    static float LabelSizeScene(PBManifest m, string family) {
      if (m != null && m.labelSizes != null)
        foreach (var e in m.labelSizes) if (e.family == family && e.scene > 0f) return e.scene;
      return 0f;
    }
    static float LabelSize(PBManifest m, string family) {
      // the app's own per-family size, shipped in the manifest; the single
      // style.labelSize covers older zips
      if (m != null && m.labelSizes != null)
        foreach (var e in m.labelSizes) if (e.family == family) return e.size;
      var ty = m != null && m.typography != null ? m.typography.style : null;
      return ty != null && ty.labelSize > 0f ? ty.labelSize : 40f;
    }
    static float ExpectedShift(PBManifest m, string family, string state) {
      if (m == null) return 0f;
      if (m.labelStates != null)
        foreach (var ls in m.labelStates) if (ls.family == family && ls.state == state) return ls.dy;
      if (m.typography != null && m.typography.stateStyles != null)
        foreach (var e in m.typography.stateStyles) if (e.state == state) return e.dy;
      return 0f;
    }
    // kit-sized, and auto-shrinking so a long word never spills the rect
    static void SizeLabel(TextMeshProUGUI t, float ls) {
      t.fontSize = ls;
      t.enableAutoSizing = true;
      t.fontSizeMax = ls;
      t.fontSizeMin = 12f;
    }
    static void AddBakedLabel(GameObject parent, string text, string root, TMP_FontAsset solo, PBManifest m, string family) {
      float ls = LabelSize(m, family);
      /* the APP-TRUE size beats the calibrated shrink when the manifest
         ships it — with labeled-geometry bakes the prefab rect IS the true
         worded footprint, so the exact size fits by construction */
      var lrow = LabelRow(m, family);
      if (lrow != null && lrow.labelFs > 1f) ls = lrow.labelFs;
      var go = new GameObject("Label", typeof(RectTransform));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      // the word centers on the CONTENT zone, not the sprite rect (extrusion
      // pulls the rect's center below the shell, and asymmetric silhouettes
      // pull the content off the shell center)
      ShellSeatLabel(go, parent, family, m);
      var layersFa = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
      var strokeInk = InkMaterial(root, "Stroke");
      if (layersFa != null && strokeInk != null) {
        /* layered mini-hero, echo construction (owner: "the unified
           background stroke thing and effects pass on the group, instead
           of each individual letter"): ONE text lays the word out; the
           soft shadow and the merged stroke are echoes of its mesh
           painted behind it, the glints in front. HeroLabel builds the
           echoes itself at load — the prefab carries only the text and
           the ink assignments, so nothing here can go stale. */
        var lgo = new GameObject("Fill", typeof(RectTransform), typeof(CanvasRenderer));
        lgo.transform.SetParent(go.transform, false);
        var lrt = lgo.GetComponent<RectTransform>();
        lrt.anchorMin = Vector2.zero; lrt.anchorMax = Vector2.one;
        lrt.offsetMin = Vector2.zero; lrt.offsetMax = Vector2.zero;
        var lt = lgo.AddComponent<TextMeshProUGUI>();
        lt.text = text;
        lt.alignment = TextAlignmentOptions.Center;
        // the GROUP owns sizing: auto-fit re-solving the size behind the
        // group's back is how sizes used to wander
        lt.fontSize = ls;
        lt.enableAutoSizing = false;
        lt.raycastTarget = false;
        lt.font = layersFa;
        lt.color = Color.white;
        /* AddComponent fires ExecuteAlways OnEnable BEFORE the fields land
           (a fresh stack briefly applied text=PLAY/size=150 defaults and
           saved that way) — set everything, then re-Apply via SetText */
        var hl = go.AddComponent<HeroLabel>();
        hl.fontSize = ls;
        hl.shadowInk = InkMaterial(root, "Shadow");
        hl.strokeInk = strokeInk;
        hl.glintsInk = InkMaterial(root, "Glints");
        // resizing the BUTTON scales the type with it (owner: "scaling
        // needs to work like scaling") — remember the authored height
        var prt = parent.GetComponent<RectTransform>();
        hl.authoredHeight = prt != null ? prt.rect.height : 0f;
        hl.SetText(text);
        return;
      }
      // solo fallback (kit shipped no layer faces): every glyph carries
      // its own treatment
      go.AddComponent<CanvasRenderer>();
      var t = go.AddComponent<TextMeshProUGUI>();
      t.text = text;
      t.alignment = TextAlignmentOptions.Center;
      SizeLabel(t, ls);
      t.raycastTarget = false;
      t.font = solo;
      t.color = Color.white; // baked glyphs are pre-painted
    }
    /* the label WE generated is the child GameObject named "Label" — a
       single dynamic text OR a layered baked stack root */
    static GameObject FindOurLabelRoot(GameObject go) {
      foreach (var rt in go.GetComponentsInChildren<RectTransform>(true))
        if (rt.gameObject.name == "Label" && rt.gameObject != go) return rt.gameObject;
      return null;
    }
    static string LabelText(GameObject labelRoot, string fallback) {
      var hl = labelRoot.GetComponent<HeroLabel>();
      if (hl != null && !string.IsNullOrEmpty(hl.text)) return hl.text;
      var tmp = labelRoot.GetComponentInChildren<TextMeshProUGUI>(true);
      return tmp != null && !string.IsNullOrEmpty(tmp.text) ? tmp.text : fallback;
    }
    static bool WireLabelStates(GameObject go, GameObject labelRoot, PBManifest m, string family) {
      if (m == null || m.typography == null || labelRoot == null) return false;
      // the whole label moves; only a single dynamic text re-inks
      var label = labelRoot.GetComponent<TextMeshProUGUI>();
      var ty = m.typography;
      var states = new List<PBStateStyle>();
      if (m.labelStates != null)
        foreach (var ls in m.labelStates)
          if (ls.family == family) {
            var fam = new PBStateStyle();
            // dy included: the family entry MASKS the master entry below,
            // so dropping it here silently disarms the press sink (field
            // bug: every button armed 0px while the manifest said 14)
            fam.state = ls.state; fam.fillMode = ls.fillMode; fam.fill = ls.fill; fam.fill2 = ls.fill2; fam.dy = ls.dy;
            states.Add(fam);
          }
      if (ty.stateStyles != null)
        foreach (var ms in ty.stateStyles) {
          bool covered = false;
          foreach (var q in states) if (q.state == ms.state) { covered = true; break; }
          if (!covered) states.Add(ms);
        }
      if (states.Count == 0) {
        // the kit no longer forks its text ink — retire a stale component
        var stale = go.GetComponent<LabelStateInk>();
        if (stale != null) UnityEngine.Object.DestroyImmediate(stale, true);
        return false;
      }
      var ink = go.GetComponent<LabelStateInk>();
      if (ink == null) ink = go.AddComponent<LabelStateInk>();
      ink.shiftTarget = labelRoot.GetComponent<RectTransform>();
      ink.label = label;
      Color top, bot; bool grad;
      TargetInk(ty.style, out top, out bot, out grad);
      ink.restTop = top; ink.restBottom = bot; ink.restGradient = grad;
      ink.inkOn = false; ink.hoverOn = false; ink.pressedOn = false;
      ink.hoverShift = 0f; ink.pressedShift = 0f;
      foreach (var fork in states) {
        // an entry may carry ink colors, a face-riding shift, or both;
        // ink only drives a single dynamic text (baked stacks are painted)
        bool hasInk = label != null && !string.IsNullOrEmpty(fork.fillMode);
        if (hasInk) {
          var forkStyle = new PBStyle();
          forkStyle.fillMode = fork.fillMode; forkStyle.fill = fork.fill; forkStyle.fill2 = fork.fill2;
          TargetInk(forkStyle, out top, out bot, out grad);
        }
        if (fork.state == "hover") { ink.hoverShift = fork.dy; if (hasInk) { ink.inkOn = true; ink.hoverOn = true; ink.hoverTop = top; ink.hoverBottom = bot; ink.hoverGradient = grad; } }
        else if (fork.state == "pressed") { ink.pressedShift = fork.dy; if (hasInk) { ink.inkOn = true; ink.pressedOn = true; ink.pressedTop = top; ink.pressedBottom = bot; ink.pressedGradient = grad; } }
      }
      return true;
    }
    static void AddTmpLabel(GameObject parent, string text, TMP_FontAsset face, PBStyle s, float ls) {
      var go = new GameObject("Label", typeof(RectTransform), typeof(CanvasRenderer));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      var t = go.AddComponent<TextMeshProUGUI>();
      t.text = text;
      t.alignment = TextAlignmentOptions.Center;
      SizeLabel(t, ls);
      t.raycastTarget = false;
      if (face != null) t.font = face;
      StyleLabel(t, s);
    }
#endif
    /* Placed from the manifest's numbers rather than guessed: one SVG pixel
       is one prefab unit (the sprite rasterizes at pngScale and the prefab
       divides by it again), so left and size travel through untouched.
       Stretched anchors + a left margin keep it pinned to the field's left
       edge at any width, which is what a 9-sliced input actually does. */
    static void AddPlaceholder(GameObject parent, string root, PBManifest m, Font kitFont) {
      var ph = m != null ? m.placeholder : null;
      if (ph == null || string.IsNullOrEmpty(ph.text)) return;
      var go = new GameObject("Placeholder (delete or bind)", typeof(RectTransform), typeof(CanvasRenderer));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      /* the sprite is cropped tight to the geometry and the extrusion hangs
         BELOW the field, so the sprite's middle sits lower than the field's.
         The manifest measures down from the top edge; convert once we know
         the rect. */
      var prt = parent.GetComponent<RectTransform>();
      float mid = prt != null ? prt.rect.height * 0.5f : 0f;
      rt.anchoredPosition = new Vector2(0f, mid - ph.centerFromTop);
      Color col;
      if (string.IsNullOrEmpty(ph.color) || !ColorUtility.TryParseHtmlString(ph.color, out col)) col = Color.white;
      col.a = Mathf.Clamp01(ph.opacity / 100f);
#if UNITY_2023_2_OR_NEWER
      var face = EnsureTmpFace(root, m, kitFont);
      if (face != null) {
        var t = go.AddComponent<TextMeshProUGUI>();
        t.text = ph.text;
        t.font = face;
        t.enableAutoSizing = false;
        t.fontSize = ph.size;
        t.alignment = TextAlignmentOptions.Left;   // midline-left: centred vertically, pinned left
        t.margin = new Vector4(ph.left, 0f, ph.left, 0f);
        t.color = col;
        if (ph.italic) t.fontStyle = FontStyles.Italic;
        t.raycastTarget = false;
        return;
      }
#endif
      var u = go.AddComponent<Text>();
      u.text = ph.text;
      u.alignment = TextAnchor.MiddleLeft;
      u.fontSize = Mathf.RoundToInt(ph.size);
      u.color = col;
      u.raycastTarget = false;
      if (ph.italic) u.fontStyle = FontStyle.Italic;
      var f = kitFont != null ? kitFont : BuiltinFont();
      if (f != null) u.font = f;
      rt.offsetMin = new Vector2(ph.left, rt.offsetMin.y);
      rt.offsetMax = new Vector2(-ph.left, rt.offsetMax.y);
    }
    static void AddLabel(GameObject parent, string text, Font kitFont, string root, PBManifest m, string family) {
      var lrowA = LabelRow(m, family);
      float lsA = lrowA != null && lrowA.labelFs > 1f ? lrowA.labelFs : LabelSize(m, family);
#if UNITY_2023_2_OR_NEWER
      var face = EnsureTmpFace(root, m, kitFont);
      if (face != null) {
        AddTmpLabel(parent, text, face, m != null && m.typography != null ? m.typography.style : null, lsA);
        // seat on the CONTENT zone, not the sprite rect (see AddBakedLabel)
        var lr0 = FindOurLabelRoot(parent);
        if (lr0 != null) ShellSeatLabel(lr0, parent, family, m);
        return;
      }
#endif
      var go = new GameObject("Label", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
      go.transform.SetParent(parent.transform, false);
      var rt = go.GetComponent<RectTransform>();
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      ShellSeatLabel(go, parent, family, m);
      var t = go.GetComponent<Text>();
      t.text = text;
      t.alignment = TextAnchor.MiddleCenter;
      t.fontSize = Mathf.RoundToInt(lsA);
      t.color = Color.white;
      t.raycastTarget = false;
      // the kit's own face ships in fonts/ (license beside it) and wires
      // here automatically; the built-in face only covers a fetch-less
      // zip. For styled DYNAMIC text, build a TMP material preset from
      // kit-manifest.json > typography > style.
      var f = kitFont != null ? kitFont : BuiltinFont();
      if (f != null) t.font = f;
    }
    /* one prefab per component family (owner: "a ton of prefabs") — any
       family shipping a base sprite gets one; state variants wire a
       Button with the kit's own hover/pressed/disabled recipes. */
    static string NiceName(string family) {
      var sb = new System.Text.StringBuilder();
      bool up = true;
      foreach (var ch in family) {
        if (ch == '-') { up = true; continue; }
        sb.Append(up ? char.ToUpperInvariant(ch) : ch);
        up = false;
      }
      return sb.Length > 0 ? sb.ToString() : "Piece";
    }
    static bool FamilyPrefab(string dir, string root, PBAsset baseAsset, string goName, string label, int pngScale, Font kitFont, PBManifest m) {
      var basePath = root + "/" + baseAsset.file;
      var baseSp = S(basePath);
      if (baseSp == null) return false;
      var go = new GameObject(goName, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      var img = go.GetComponent<Image>();
      img.sprite = baseSp;
      bool sliced = baseAsset.nineSlice != null && (baseAsset.nineSlice.left + baseAsset.nineSlice.right + baseAsset.nineSlice.top + baseAsset.nineSlice.bottom) > 0;
      img.type = sliced ? Image.Type.Sliced : Image.Type.Simple;
      if (sliced && baseAsset.prefW > 4f && baseAsset.shell != null && baseAsset.shell.w > 4f && baseAsset.shell.h > 4f) {
        /* DEFAULT rect with the WORDS on: the sprite bakes labeless, so its
           natural rect squishes a fluid silhouette under overflowing text.
           Grow the rect so the SHELL matches the labeled footprint the app
           shows — the sliced middle carries the width, caps stay true. */
        float rw = baseSp.rect.width * baseAsset.prefW / baseAsset.shell.w;
        float rh = baseAsset.prefH > 4f ? baseSp.rect.height * baseAsset.prefH / baseAsset.shell.h : (pngScale > 0 ? baseSp.rect.height / pngScale : baseSp.rect.height);
        go.GetComponent<RectTransform>().sizeDelta = new Vector2(rw, rh);
      } else if (pngScale > 0)
        go.GetComponent<RectTransform>().sizeDelta = new Vector2(baseSp.rect.width / pngScale, baseSp.rect.height / pngScale);
      var famDir = Path.GetDirectoryName(basePath).Replace("\\\\", "/");
      var hover = State(famDir, "hover");
      var pressed = State(famDir, "pressed");
      var disabled = State(famDir, "disabled");
      if (hover != null || pressed != null || disabled != null) {
        var btn = go.AddComponent<Button>();
        // explicit target: play mode would self-resolve in Awake, but the
        // Inspector shows "None (Graphic)" until then and reads as unwired
        btn.targetGraphic = img;
        btn.transition = Selectable.Transition.SpriteSwap;
        var ss = new SpriteState();
        ss.highlightedSprite = hover;
        // selected stays the RESTING face — mirroring hover here left a
        // clicked button stuck in rollover after the pointer moved away
        ss.selectedSprite = null;
        ss.pressedSprite = pressed;
        ss.disabledSprite = disabled;
        btn.spriteState = ss;
        WireStateFx(go, root, m, baseAsset.component, basePath, pngScale);
      }
      // interactive or not, the piece's raycast stops at its drawn shell
      ShellRaycastPad(go, baseAsset.component, m);
      /* Idle motion (owner spec): the kit's own resting-state animations,
         wired only when the manifest says the kit turned them on. Both are
         removable components — delete them and the piece is exactly what
         it was. Edge shine skips sliced pieces: a stretched nine-slice no
         longer matches the authored outline. */
      int shineW = m != null && m.idle != null ? m.idle.wipe : 0;
      int shineE = m != null && m.idle != null ? m.idle.edge : 0;
      // per-piece forks (owner: shine on/off per component) — a fork's -1
      // follows the kit toggle; 0/1 pin this family off/on regardless
      if (m != null && m.idleForks != null)
        foreach (var fk in m.idleForks) if (fk.family == baseAsset.component) { if (fk.wipe >= 0) shineW = fk.wipe; if (fk.edge >= 0) shineE = fk.edge; }
      if (shineW == 1 && go.GetComponent<WipeShine>() == null) {
        var ws = go.AddComponent<WipeShine>();
        if (m.idle != null && m.idle.freq > 0.5f) ws.period = m.idle.freq;
      }
      if (shineE == 1 && baseAsset.outline != null && baseAsset.outline.Length >= 8 && baseAsset.nineSlice == null && go.GetComponent<EdgeShine>() == null) {
        var es = go.AddComponent<EdgeShine>();
        es.outline = baseAsset.outline;
        // Frequency travels; Blend stays app-side for now — UGUI needs
        // a dedicated shader for a true screen mix
        if (m.idle != null && m.idle.freq > 0.5f) es.period = m.idle.freq;
      }
      /* the gift box CELEBRATES its claim — the app's white-hot ignition
         + themed particle throw, wired to a click (owner: "supposed to
         have the claim explosion to white") */
      if (baseAsset.component == "gifticon") {
        var cb = go.AddComponent<ClaimBurst>();
        var cbGlow = S(root + "/assets/gifticon/gifticon-glow.png");
        cb.spark = cbGlow != null ? cbGlow : S(root + "/assets/fx/fx-glow.png");
        var inks = new List<Color>();
        Color inkC;
        if (m != null && m.palette != null) {
          if (!string.IsNullOrEmpty(m.palette.bevel) && ColorUtility.TryParseHtmlString(m.palette.bevel, out inkC)) inks.Add(inkC);
          if (!string.IsNullOrEmpty(m.palette.glow) && ColorUtility.TryParseHtmlString(m.palette.glow, out inkC)) inks.Add(inkC);
          if (!string.IsNullOrEmpty(m.palette.highlight) && ColorUtility.TryParseHtmlString(m.palette.highlight, out inkC)) inks.Add(inkC);
        }
        if (inks.Count == 0) inks.Add(Color.white);
        cb.inks = inks.ToArray();
      }
      /* the input's affordance, as a LAYER. It used to be painted into the
         surface, which looked right and could never be taken off (owner:
         "I didn't realize the text would be burned into the image"). One
         child named so its job is obvious — retype it, bind it to your
         field's placeholder slot, or select it and press Delete. */
      if (baseAsset.component == "input") AddPlaceholder(go, root, m, kitFont);
      /* the end-turn countdown ring, LIVE: Filled/Radial360 over the bare
         shell, tinted to the kit Glow, staged at 0.7 — drive fillAmount
         and it animates (owner: "the countdown numerics should be
         dynamic") */
      if (baseAsset.component == "endturn") {
        var arcSp = S(root + "/assets/endturn/endturn-arc.png");
        if (arcSp != null) {
          var arcGo = ImageObject("Arc", arcSp, pngScale);
          arcGo.transform.SetParent(go.transform, false);
          var ai = arcGo.GetComponent<Image>();
          ai.type = Image.Type.Filled;
          ai.fillMethod = Image.FillMethod.Radial360;
          ai.fillOrigin = (int)Image.Origin360.Top;
          ai.fillAmount = 0.7f;
          ai.raycastTarget = false;
          Color arcC;
          if (m != null && m.palette != null && !string.IsNullOrEmpty(m.palette.glow) && ColorUtility.TryParseHtmlString(m.palette.glow, out arcC)) ai.color = arcC;
          var art2 = arcGo.GetComponent<RectTransform>();
          // the ring hugs the SHELL, not the sprite rect (extrusion air)
          Vector2 shlA;
          var hostSz9 = ShellCenterAnchor(arcGo, go, baseAsset.component, m, out shlA) ? shlA : go.GetComponent<RectTransform>().sizeDelta;
          float ring = Mathf.Min(hostSz9.x, hostSz9.y) * 0.92f;
          art2.sizeDelta = new Vector2(ring, ring);
        }
      }
      /* the badge shell reads unfinished bare (owner: "shouldn't this
         have an icon or something?") — it carries the kit's star glyph as
         a swappable child, tinted like the app's mark: delete it, retint
         it, or drop your own art in its place */
      if (baseAsset.component == "badge") {
        var glyph = S(root + "/assets/icons/star.png");
        if (glyph == null) glyph = S(root + "/assets/icons/gem.png");
        if (glyph != null) {
          var gGo = ImageObject("Icon", glyph, pngScale);
          gGo.transform.SetParent(go.transform, false);
          var gi = gGo.GetComponent<Image>();
          gi.raycastTarget = false;
          string gTint = m != null && m.palette != null && !string.IsNullOrEmpty(m.palette.markInk) ? m.palette.markInk : (m != null && m.palette != null ? m.palette.glow : null);
          Color gc2;
          if (!string.IsNullOrEmpty(gTint) && ColorUtility.TryParseHtmlString(gTint, out gc2)) gi.color = gc2;
          var grt = gGo.GetComponent<RectTransform>();
          // shell-true proportions (the sprite rect over-measures with air)
          Vector2 shlB;
          var badgeSz = ShellCenterAnchor(gGo, go, baseAsset.component, m, out shlB) ? shlB : go.GetComponent<RectTransform>().sizeDelta;
          float side = Mathf.Min(badgeSz.x, badgeSz.y) * 0.44f;
          grt.sizeDelta = new Vector2(side, side);
          // optical center: the shield's point hangs low — sit the glyph
          // slightly above true center like the app does
          grt.anchoredPosition = new Vector2(0f, badgeSz.y * 0.06f);
        }
      }
      if (label != null) {
#if UNITY_2023_2_OR_NEWER
        // exact pixels first: the baked faces when the kit ships them and
        // the family needs no dynamic ink; the styled SDF otherwise
        var bakedLabelFace = BakedLabelFace(m, root, baseAsset.component);
        if (bakedLabelFace != null) AddBakedLabel(go, label, root, bakedLabelFace, m, baseAsset.component);
        else
#endif
        AddLabel(go, label, kitFont, root, m, baseAsset.component);
      }
#if UNITY_2023_2_OR_NEWER
      // the kit's designed state ink/shift follows the face swap (only
      // wired when the kit forks its states)
      var labelRoot = FindOurLabelRoot(go);
      if (labelRoot != null) WireLabelStates(go, labelRoot, m, baseAsset.component);
#endif
      // last child = drawn last: the streak crosses the label, like the app
      AddSpecular(go, root, baseAsset.component, m);
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/" + goName + ".prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the ENGINE-COMPOSED specular streak (owner: "translated very
       bluntly, needs more nuance") — the sliced base dropped the baked
       streak, and this overlays <fam>-specular.png anchored SHELL-TO-SHELL:
       the manifest records each sprite's shell box, so the child's anchors
       land its shell exactly on the root's shell no matter how either was
       cropped, and the streak scales WITH the piece instead of smearing
       through the nine-slice. */
    /* the SHELL is the shared reference frame for prefab CONTENT.
       Sprites are cropped with extrusion depth, glow slack and asymmetric
       margins in the pixels, so the sprite rect's center is NOT the
       face's center — a rect-centered label or icon reads low and off
       (owner: "the stacking is off… at the prefab level"). These helpers
       anchor children to the manifest's measured shell box instead, so
       content sits exactly where the app drew it, on every family, every
       kit, every future export. */
    static PBAsset ShellRowOf(GameObject host, string fam, PBManifest m) {
      if (m == null || m.assets == null) return null;
      var img = host.GetComponent<Image>();
      var sp2 = img != null ? img.sprite : null;
      if (sp2 == null) return null;
      PBAsset byBase = null;
      foreach (var a in m.assets) {
        if (a == null || a.component != fam || a.shell == null || a.shell.w < 2f) continue;
        if (a.file != null && a.file.EndsWith("/" + sp2.name + ".png")) return a;
        if (byBase == null && a.part == "base") byBase = a;
      }
      return byBase;
    }
    /* stretch a child over the shell box (labels, placeholders) */
    /* the family's BASE row — the one carrying the label metrics (labelFs
       et al live only there; variant rows a piece might wear do not) */
    static PBAsset LabelRow(PBManifest m, string fam) {
      if (m == null || m.assets == null) return null;
      foreach (var a in m.assets) if (a != null && a.component == fam && a.part == "base") return a;
      return null;
    }
    /* the label's anchor-shift off the shell box, in sprite-rect fractions —
       shared by the seat below and the redress probe, so they can never
       disagree and re-dress forever */
    static Vector2 LabelSeatShift(PBAsset row, Sprite sp, PBManifest m) {
      if (row == null || row.labelFs <= 1f || sp == null || sp.rect.width < 2f || sp.rect.height < 2f) return Vector2.zero;
      float ps = m != null && m.pngScale > 0 ? m.pngScale : 2;
      return new Vector2(row.labelDx * ps / sp.rect.width, -row.labelDy * ps / sp.rect.height);
    }
    /* ShellStretch, then slide the seat to the label's TRUE center — the
       app centers words in the CONTENT zone, not the shell (the flame's
       tail owns the left; owner: "we are always cheating right a bit...
       it's important to get this right"). Anchors, not anchoredPosition,
       so the seat scales with any resize and LabelStateInk's base stays
       untouched. */
    static void ShellSeatLabel(GameObject child, GameObject host, string fam, PBManifest m) {
      ShellStretch(child, host, fam, m);
      var img = host.GetComponent<Image>();
      var shift = LabelSeatShift(LabelRow(m, fam), img != null ? img.sprite : null, m);
      if (shift == Vector2.zero) return;
      var rt = child.GetComponent<RectTransform>();
      rt.anchorMin += shift; rt.anchorMax += shift;
    }
    static bool ShellStretch(GameObject child, GameObject host, string fam, PBManifest m) {
      var row = ShellRowOf(host, fam, m);
      var img = host.GetComponent<Image>();
      if (row == null || img == null || img.sprite == null) return false;
      float rw = img.sprite.rect.width, rh = img.sprite.rect.height;
      if (rw < 2f || rh < 2f) return false;
      var rt = child.GetComponent<RectTransform>();
      rt.anchorMin = new Vector2(row.shell.x / rw, 1f - (row.shell.y + row.shell.h) / rh);
      rt.anchorMax = new Vector2((row.shell.x + row.shell.w) / rw, 1f - row.shell.y / rh);
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
      return true;
    }
    /* pin a child to the shell's CENTER and report the shell's size in
       the host's rect units (icons, rings, counters, thumbs) */
    static bool ShellCenterAnchor(GameObject child, GameObject host, string fam, PBManifest m, out Vector2 shellSize) {
      shellSize = Vector2.zero;
      var row = ShellRowOf(host, fam, m);
      var img = host.GetComponent<Image>();
      if (row == null || img == null || img.sprite == null) return false;
      float rw = img.sprite.rect.width, rh = img.sprite.rect.height;
      if (rw < 2f || rh < 2f) return false;
      var hostRt = host.GetComponent<RectTransform>();
      shellSize = new Vector2(hostRt.sizeDelta.x * (row.shell.w / rw), hostRt.sizeDelta.y * (row.shell.h / rh));
      var rt = child.GetComponent<RectTransform>();
      var c = new Vector2((row.shell.x + row.shell.w / 2f) / rw, 1f - (row.shell.y + row.shell.h / 2f) / rh);
      rt.anchorMin = c; rt.anchorMax = c;
      rt.anchoredPosition = Vector2.zero;
      return true;
    }
    /* Clicks land on the DRAWN shell, not the padded crop: every sprite
       carries glow/shadow headroom, so a raw Button pressed from well
       outside its visible art — and one piece's invisible margin ate the
       clicks aimed at the piece beside it (owner: "the v.1.1.0 has a very
       large selection area"; the phantom press on the text above a
       banner). Sliced pieces take absolute insets — their caps carry the
       padding through any stretch — simple pieces take the fraction of
       their current rect. */
    static void ShellRaycastPad(GameObject host, string fam, PBManifest m) {
      var row = ShellRowOf(host, fam, m);
      var img = host.GetComponent<Image>();
      var rt = host.GetComponent<RectTransform>();
      if (row == null || img == null || img.sprite == null || rt == null) return;
      float rw = img.sprite.rect.width, rh = img.sprite.rect.height;
      if (rw < 4f || rh < 4f || row.shell.w < 4f || row.shell.h < 4f) return;
      float padL = row.shell.x, padT = row.shell.y;
      float padR = rw - row.shell.x - row.shell.w, padB = rh - row.shell.y - row.shell.h;
      if (padL < 0f || padT < 0f || padR < 0f || padB < 0f) return; // a shell outside its crop is a lie — leave the raycast alone
      if (img.type == Image.Type.Sliced) {
        float ps = m != null && m.pngScale > 0 ? m.pngScale : 2f;
        img.raycastPadding = new Vector4(padL / ps, padB / ps, padR / ps, padT / ps);
      } else if (rt.sizeDelta.x > 2f && rt.sizeDelta.y > 2f) {
        img.raycastPadding = new Vector4(
          padL / rw * rt.sizeDelta.x, padB / rh * rt.sizeDelta.y,
          padR / rw * rt.sizeDelta.x, padT / rh * rt.sizeDelta.y);
      }
    }
    static void AddSpecular(GameObject go, string root, string fam, PBManifest m) {
      if (m == null || m.assets == null) return;
      var sp = S(root + "/assets/" + fam + "/" + fam + "-specular.png");
      if (sp == null) return;
      var rootImg = go.GetComponent<Image>();
      var rootSp = rootImg != null ? rootImg.sprite : null;
      if (rootSp == null || rootSp.rect.width < 2f) return;
      PBAsset specRow = null, rootRow = null;
      foreach (var a in m.assets) {
        if (a == null || a.component != fam) continue;
        if (a.part == "specular" && a.shell != null) specRow = a;
        if (a.file != null && a.shell != null && a.file.EndsWith("/" + rootSp.name + ".png")) rootRow = a;
      }
      if (specRow == null || rootRow == null) return;
      var shR = rootRow.shell; var shS = specRow.shell;
      if (shR.w < 2f || shR.h < 2f || shS.w < 2f || shS.h < 2f) return;
      float rw = rootSp.rect.width, rh = rootSp.rect.height;
      float sw = sp.rect.width, sh = sp.rect.height;
      // child size as a fraction of the root rect, shell-to-shell
      float cw = (sw / shS.w) * (shR.w / rw);
      float ch = (sh / shS.h) * (shR.h / rh);
      // sprite space is y-down, anchors are y-up — flip the vertical
      float ax0 = shR.x / rw - (shS.x / sw) * cw;
      float ayTop = 1f - (shR.y / rh - (shS.y / sh) * ch);
      var sGo = new GameObject("Specular", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      sGo.transform.SetParent(go.transform, false);
      var im = sGo.GetComponent<Image>();
      im.sprite = sp;
      im.raycastTarget = false;
      var rtS = sGo.GetComponent<RectTransform>();
      rtS.anchorMin = new Vector2(ax0, ayTop - ch);
      rtS.anchorMax = new Vector2(ax0 + cw, ayTop);
      rtS.offsetMin = Vector2.zero; rtS.offsetMax = Vector2.zero;
    }
    /* A state sprite is nine-sliced on the stretchy families and plain on
       the round ones (an icon button or a radio has nothing to stretch), so
       both names have to be tried. Looking only for ".9.png" is why the
       icon button, checkbox and radio arrived with no Button at all —
       their states shipped, nothing ever read them. */
    static Sprite State(string famDir, string name) {
      /* FINDABLE-NAMES era first (button-primary-base-hover.9.png), the
         legacy short names second. Probing only the short names is why a
         renamed zip generated prefabs with NO states at all — hover,
         pressed and disabled shipped, nothing ever found them (field:
         "the button states aren't fully coming through"). */
      var famName = Path.GetFileName(famDir);
      var s = S(famDir + "/" + famName + "-base-" + name + ".9.png");
      if (s == null) s = S(famDir + "/" + famName + "-base-" + name + ".png");
      if (s == null) s = S(famDir + "/base-" + name + ".9.png");
      return s != null ? s : S(famDir + "/base-" + name + ".png");
    }
    /* the glow and the lift, wired from the kit's own state dials. Only
       goes on pieces that actually swap — a panel has no hover to announce. */
    static void WireStateFx(GameObject go, string root, PBManifest m, string family, string basePath, int pngScale) {
      if (m == null || m.stateFx == null || m.stateFx.Length == 0) return;
      if (go.GetComponent<StateFx>() != null) return;
      bool any = false;
      float rest = 0f, hover = 0f, press = 0f, dis = 0f, restL = 0f, hoverL = 0f, pressL = 0f;
      foreach (var f in m.stateFx) {
        if (f == null || f.family != family) continue;
        any = true;
        if (f.state == "default") { rest = f.glow; restL = f.lift; }
        else if (f.state == "hover") { hover = f.glow; hoverL = f.lift; }
        else if (f.state == "pressed") { press = f.glow; pressL = f.lift; }
        else if (f.state == "disabled") dis = f.glow;
      }
      if (!any) return;
      var fx = go.AddComponent<StateFx>();
      /* the piece's OWN aura — its silhouette, blurred the way the app
         blurs it. fx/glow.png is a generic radial blob and only stands in
         for a family that ships no aura (owner, on the blob: "looks pretty
         generic… very big and not as soft comparatively"). */
      var baseSp = S(basePath);
      // renamed name first, legacy second — the short-name-only probe sent
      // every renamed kit to the generic blob the owner already vetoed
      var glowDir = Path.GetDirectoryName(basePath).Replace("\\\\", "/");
      var glowSp = S(glowDir + "/" + Path.GetFileName(glowDir) + "-glow.png");
      if (glowSp == null) glowSp = S(glowDir + "/glow.png");
      fx.glowSprite = glowSp != null ? glowSp : S(root + "/assets/fx/fx-glow.png");
      if (glowSp != null && baseSp != null && pngScale > 0)
        fx.glowPad = new Vector2(
          (glowSp.rect.width - baseSp.rect.width) * 0.5f / pngScale,
          (glowSp.rect.height - baseSp.rect.height) * 0.5f / pngScale);
      Color gc;
      if (m.palette == null || string.IsNullOrEmpty(m.palette.glow) || !ColorUtility.TryParseHtmlString(m.palette.glow, out gc)) gc = Color.white;
      fx.glowColor = gc;
      // the manifest already ships lift RELATIVE to rest and Unity-side up
      fx.restGlow = rest; fx.hoverGlow = hover; fx.pressedGlow = press; fx.disabledGlow = dis;
      fx.restLift = restL; fx.hoverLift = hoverL; fx.pressedLift = pressL;
    }
    static bool HasStateFx(PBManifest m, string family) {
      if (m == null || m.stateFx == null) return false;
      foreach (var f in m.stateFx) if (f != null && f.family == family) return true;
      return false;
    }
    static string DefaultLabel(string family) {
      if (family == "chip") return "NEW";
      if (family == "tab") return "TAB";
      if (family == "tab-back") return "BACK";
      if (family == "endturn") return "END TURN";
      if (family == "keycap") return "E";
      if (family == "pricebtn") return "$4.99";
      if (family == "header-banner") return "SETTINGS";
      return "PLAY";
    }
    static bool ProgressPrefab(string dir, string root, int pngScale) {
      var track = S(root + "/assets/progress/progress-track.9.png");
      if (track == null) return false;
      var go = ImageObject("ProgressBar", track, pngScale);
      var fill = S(root + "/assets/progress/progress-fill.9.png");
      if (fill != null) {
        var f = ImageObject("Fill", fill, pngScale);
        f.transform.SetParent(go.transform, false);
        var rt = f.GetComponent<RectTransform>();
        rt.anchorMin = new Vector2(0f, 0.5f);
        rt.anchorMax = new Vector2(0f, 0.5f);
        rt.pivot = new Vector2(0f, 0.5f);
        rt.anchoredPosition = new Vector2(2f, 0f);
        // staged at 65% — drive Fill's width from your live value
        rt.sizeDelta = new Vector2((track.rect.width / pngScale) * 0.65f, fill.rect.height / pngScale);
      }
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/ProgressBar.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    static void StretchFull(RectTransform rt) {
      rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
      rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
    }
    /* the STRETCH-SAFE face: under (Sliced) masks a Tiled pattern, then
       over (Sliced) lays the gloss back on top. Stretch this to any width
       and the frame stretches, the pattern tiles at constant scale, and
       the gloss stays one sweep — what the app shows, at any size. */
    static bool TiledFacePrefab(string dir, string root, int pngScale, string fam, string label, Font kitFont, PBManifest m) {
      var under = S(root + "/assets/" + fam + "/" + fam + "-base-under.9.png");
      var over = S(root + "/assets/" + fam + "/" + fam + "-base-over.9.png");
      var tile = S(root + "/assets/fx/fx-face-tile.png");
      if (under == null || over == null || tile == null) return false;
      var goName = NiceName(fam) + " (tiled face)";
      var go = ImageObject(goName, under, pngScale);
      var ui = go.GetComponent<Image>();
      ui.type = Image.Type.Sliced;
      /* the stencil is its OWN hidden layer. Unity only alpha-clips a
         Mask when Show Mask Graphic is OFF — masking with the visible art
         gives a rectangular stencil, and the pattern spills past the
         silhouette (field report). */
      var maskSp = S(root + "/assets/" + fam + "/" + fam + "-base-mask.9.png");
      var maskGo = ImageObject("PatternMask", maskSp != null ? maskSp : under, pngScale);
      maskGo.transform.SetParent(go.transform, false);
      var mi = maskGo.GetComponent<Image>();
      mi.type = Image.Type.Sliced;
      mi.raycastTarget = false;
      StretchFull(maskGo.GetComponent<RectTransform>());
      var mask = maskGo.AddComponent<Mask>();
      mask.showMaskGraphic = false;
      var pat = ImageObject("Pattern", tile, pngScale);
      pat.transform.SetParent(maskGo.transform, false);
      var pi = pat.GetComponent<Image>();
      pi.type = Image.Type.Tiled;
      pi.raycastTarget = false;
      StretchFull(pat.GetComponent<RectTransform>());
      var ov = ImageObject("Over", over, pngScale);
      ov.transform.SetParent(go.transform, false);
      var oi = ov.GetComponent<Image>();
      oi.type = Image.Type.Sliced;
      oi.raycastTarget = false;
      StretchFull(ov.GetComponent<RectTransform>());
      /* the layered build is still a real control (field: "No text on the
         button primary"): same label and state dress as the plain prefab —
         but NO sprite swap. Swapping the under layer to the full-material
         state art would double the pattern and gloss; states ride the
         engine side instead (Button for the click, StateFx for the kit's
         glow and lift, label ink shifts via the same wiring). */
      var famDirT = root + "/assets/" + fam;
      if (State(famDirT, "hover") != null || State(famDirT, "pressed") != null || State(famDirT, "disabled") != null) {
        var btn = go.AddComponent<Button>();
        btn.targetGraphic = ui;
        btn.transition = Selectable.Transition.None;
        WireStateFx(go, root, m, fam, famDirT + "/" + fam + "-base.9.png", pngScale);
      }
      if (label != null) {
#if UNITY_2023_2_OR_NEWER
        var bakedFaceT = BakedLabelFace(m, root, fam);
        if (bakedFaceT != null) AddBakedLabel(go, label, root, bakedFaceT, m, fam);
        else
#endif
        AddLabel(go, label, kitFont, root, m, fam);
#if UNITY_2023_2_OR_NEWER
        var labelRootT = FindOurLabelRoot(go);
        if (labelRootT != null) WireLabelStates(go, labelRootT, m, fam);
#endif
      }
      /* the press must move the WHOLE piece, not just the words (field:
         "only the text goes down, not the entire button"): the plain
         prefab's face sinks inside its pressed SPRITE, but the layered
         build swaps nothing — so the sink rides StateFx as a lift, and
         the label's own shift zeroes (it moves WITH the piece now; both
         shifting doubled the ride) */
      float sinkT = ExpectedShift(m, fam, "pressed");
      if (sinkT != 0f && go.GetComponent<Selectable>() != null) {
        var fxT = go.GetComponent<StateFx>();
        if (fxT == null) fxT = go.AddComponent<StateFx>();
        if (Mathf.Approximately(fxT.pressedLift, 0f)) fxT.pressedLift = -sinkT;
        var inkT = go.GetComponent<LabelStateInk>();
        if (inkT != null) { inkT.pressedShift = 0f; inkT.hoverShift = 0f; }
      }
      // last child = drawn last: the streak crosses the label, like the app
      AddSpecular(go, root, fam, m);
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/" + goName + ".prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the count badge, LIVE: bare circle + real text digits — drive the
       number and it animates (owner: "the countdown numerics should be
       dynamic"). No Button: it is an indicator, not a control. */
    static bool CountBadgePrefab(string dir, string root, int pngScale, PBManifest m) {
      var bg = S(root + "/assets/countbadge/countbadge-base-plain.png");
      if (bg == null) return false;
      var go = ImageObject("CountBadge", bg, pngScale);
      go.GetComponent<Image>().raycastTarget = false;
#if UNITY_2023_2_OR_NEWER
      var tGo = new GameObject("Count", typeof(RectTransform), typeof(CanvasRenderer), typeof(TextMeshProUGUI));
      tGo.transform.SetParent(go.transform, false);
      var tm = tGo.GetComponent<TextMeshProUGUI>();
      tm.text = "3";
      tm.alignment = TextAlignmentOptions.Center;
      tm.fontStyle = FontStyles.Bold;
      tm.color = Color.white;
      tm.raycastTarget = false;
      // the digits center on the circle SHELL, not the padded sprite rect
      Vector2 shlC;
      var hostSz = ShellCenterAnchor(tGo, go, "countbadge", m, out shlC) ? shlC : go.GetComponent<RectTransform>().sizeDelta;
      var trt = tGo.GetComponent<RectTransform>();
      trt.sizeDelta = hostSz;
      tm.enableAutoSizing = true;
      tm.fontSizeMin = 8f;
      tm.fontSizeMax = hostSz.y * 0.6f;
#endif
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/CountBadge.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the touch stick, WIRED: base + thumb + PatternBreak.TouchStick —
       drop it on a Canvas, press Play, drag. Value is the direction. */
    static bool JoystickPrefab(string dir, string root, int pngScale, PBManifest m) {
      var baseSp = S(root + "/assets/joystick/joystick-base.png");
      var thumbSp = S(root + "/assets/joystick/joystick-thumb.png");
      if (baseSp == null || thumbSp == null) return false;
      var go = ImageObject("Joystick", baseSp, pngScale);
      var th = ImageObject("Thumb", thumbSp, pngScale);
      th.transform.SetParent(go.transform, false);
      th.GetComponent<Image>().raycastTarget = false;
      var stick = go.AddComponent<TouchStick>();
      stick.thumb = th.GetComponent<RectTransform>();
      /* the thumb RESTS ON THE WELL'S CENTER — the base sprite's rect
         center drifts off the well (padded canvas), and a rect-centered
         thumb read low-left (owner). Travel radius comes from the shell
         too, so the thumb never leaves the pad. */
      Vector2 shlJ;
      float half = ShellCenterAnchor(th, go, "joystick", m, out shlJ)
        ? Mathf.Min(shlJ.x, shlJ.y) * 0.5f
        : (baseSp.rect.width / pngScale) * 0.5f;
      float thumbHalf = (thumbSp.rect.width / pngScale) * 0.5f;
      stick.radius = Mathf.Max(20f, half - thumbHalf - 6f);
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/Joystick.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the MINI-MAP, ALIVE (owner: "can we get some movement on the radar?
       … loosely wired up for real world use") — the kit frame plus a
       RadarDemo: sweeping line, two drifting blips, everything it moves
       named "Demo …" so a dev deletes the demo in two keystrokes and
       drives their own icons through the same component. */
    static bool MinimapPrefab(string dir, string root, int pngScale, PBManifest m) {
      var sp = S(root + "/assets/extras/extras-minimap.png");
      if (sp == null) return false;
      var go = ImageObject("Minimap", sp, pngScale);
      go.GetComponent<Image>().type = Image.Type.Simple;
      var radar = go.AddComponent<RadarDemo>();
      Color tint = Color.white;
      if (m != null && m.palette != null && !string.IsNullOrEmpty(m.palette.glow)) ColorUtility.TryParseHtmlString(m.palette.glow, out tint);
      var sweep = new GameObject("Demo Sweep", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      sweep.transform.SetParent(go.transform, false);
      var swIm = sweep.GetComponent<Image>();
      swIm.raycastTarget = false;
      swIm.color = new Color(tint.r, tint.g, tint.b, 0.55f);
      Vector2 shlM;
      bool anchored = ShellCenterAnchor(sweep, go, "minimap", m, out shlM);
      float wellR = anchored ? Mathf.Min(shlM.x, shlM.y) * 0.38f : go.GetComponent<RectTransform>().sizeDelta.x * 0.3f;
      var swRt = sweep.GetComponent<RectTransform>();
      swRt.pivot = new Vector2(0f, 0.5f);
      swRt.sizeDelta = new Vector2(wellR, 2.5f);
      radar.sweep = swRt;
      var blipSp = S(root + "/assets/icons/dot.png");
      var blips = new RectTransform[2];
      for (int i = 0; i < 2; i++) {
        var bGo = new GameObject("Demo Blip " + (i + 1), typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        bGo.transform.SetParent(go.transform, false);
        var bIm = bGo.GetComponent<Image>();
        bIm.raycastTarget = false;
        bIm.color = tint;
        if (blipSp != null) bIm.sprite = blipSp;
        Vector2 shl2;
        ShellCenterAnchor(bGo, go, "minimap", m, out shl2);
        var bRt = bGo.GetComponent<RectTransform>();
        bRt.sizeDelta = new Vector2(9f, 9f);
        bRt.anchoredPosition = new Vector2(i == 0 ? -wellR * 0.35f : wellR * 0.3f, i == 0 ? wellR * 0.25f : -wellR * 0.4f);
        blips[i] = bRt;
      }
      radar.blips = blips;
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/Minimap.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the settings SLIDER, WIRED (owner: "let's get those settings screens
       working this round") — a real Unity Slider dressed in the
       component's own layers: shell+well track, silhouette-true mercury,
       candy knob. Drag it in Play mode and it IS the Board's piece. */
    static bool SliderPrefab(string dir, string root, int pngScale, PBManifest m) {
      var track = S(root + "/assets/slider/slider-track.9.png");
      var fill = S(root + "/assets/slider/slider-fill.9.png");
      var thumb = S(root + "/assets/slider/slider-thumb.png");
      if (track == null || fill == null || thumb == null) return false;
      var go = ImageObject("Slider", track, pngScale);
      var rt = go.GetComponent<RectTransform>();
      float trackW = rt.sizeDelta.x, trackH = rt.sizeDelta.y;
      float fillW = fill.rect.width / pngScale, fillH = fill.rect.height / pngScale;
      float thumbW = thumb.rect.width / pngScale, thumbH = thumb.rect.height / pngScale;
      /* the moving parts must ride the SHELL line, not the rect center —
         the track sprite's extrusion pads its bottom, so the rect center
         sits BELOW the visible bar and every rect-centered child landed
         ~8-10px south of the well (owner, with the exact number). The
         manifest's shell box says where the bar really is. */
      float upS = 0f;
      if (m != null && m.assets != null) {
        foreach (var aT in m.assets) {
          if (aT == null || aT.component != "slider" || aT.part != "track" || aT.shell == null) continue;
          if (aT.shell.h > 2f && track.rect.height > 1f)
            upS = (0.5f - (aT.shell.y + aT.shell.h / 2f) / track.rect.height) * trackH;
          break;
        }
      }
      // the mercury's inset inside the shell, straight from the sprites
      float inX = Mathf.Max(2f, (trackW - fillW) * 0.5f);
      float inY = Mathf.Max(2f, (trackH - fillH) * 0.5f);
      var area = new GameObject("Fill Area", typeof(RectTransform));
      area.transform.SetParent(go.transform, false);
      var art = area.GetComponent<RectTransform>();
      art.anchorMin = Vector2.zero; art.anchorMax = Vector2.one;
      art.offsetMin = new Vector2(inX, inY); art.offsetMax = new Vector2(-inX, -inY);
      art.anchoredPosition += new Vector2(0f, upS);
      var fillGo = ImageObject("Fill", fill, pngScale);
      fillGo.transform.SetParent(area.transform, false);
      var fImg = fillGo.GetComponent<Image>();
      fImg.raycastTarget = false;
      /* the app CLIPS the full-run mercury at the value line; Filled mode
         is that exact semantic (the Slider drives fillAmount and leaves
         the rect alone). Sliced-into-the-value-rect drew a different
         picture: caps intact, body squashed, gradient compressed. */
      fImg.type = Image.Type.Filled;
      fImg.fillMethod = Image.FillMethod.Horizontal;
      fImg.fillOrigin = (int)Image.OriginHorizontal.Left;
      fImg.fillAmount = 0.62f;
      var frt = fillGo.GetComponent<RectTransform>();
      frt.anchorMin = Vector2.zero; frt.anchorMax = Vector2.one;
      frt.offsetMin = Vector2.zero; frt.offsetMax = Vector2.zero;
      var slideArea = new GameObject("Handle Slide Area", typeof(RectTransform));
      slideArea.transform.SetParent(go.transform, false);
      var srt = slideArea.GetComponent<RectTransform>();
      srt.anchorMin = Vector2.zero; srt.anchorMax = Vector2.one;
      // endpoint clamp like the app: the knob stays inside the shell
      float lane = thumbW * 0.5f + 2f;
      srt.offsetMin = new Vector2(lane, 0f); srt.offsetMax = new Vector2(-lane, 0f);
      srt.anchoredPosition += new Vector2(0f, upS); // knob rides the bar, not the rect
      var handle = ImageObject("Handle", thumb, pngScale);
      handle.transform.SetParent(slideArea.transform, false);
      var hImg = handle.GetComponent<Image>();
      hImg.type = Image.Type.Simple;
      // belt and braces: whatever a layout pass does to the rect, the
      // knob stays round (field: "eggshaped handles")
      hImg.preserveAspect = true;
      var hrt = handle.GetComponent<RectTransform>();
      hrt.sizeDelta = new Vector2(thumbW, thumbH);
      var sl = go.AddComponent<Slider>();
      sl.fillRect = frt;
      sl.handleRect = hrt;
      sl.targetGraphic = handle.GetComponent<Image>();
      sl.value = 0.62f;
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/Slider.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the settings SWITCH, WIRED — Unity Toggle + SwitchGlide: the candy
       knob slides across the component's own track and swaps its ON/OFF
       dot, exactly like the piece on the Board. */
    static bool SwitchPrefab(string dir, string root, int pngScale, PBManifest m) {
      var track = S(root + "/assets/toggle/toggle-track.9.png");
      var knobOn = S(root + "/assets/toggle/toggle-thumb.png");
      var knobOff = S(root + "/assets/toggle/toggle-thumb-off.png");
      if (track == null || knobOn == null) return false;
      var go = ImageObject("Switch", track, pngScale);
      var knob = ImageObject("Knob", knobOn, pngScale);
      knob.transform.SetParent(go.transform, false);
      var ki = knob.GetComponent<Image>();
      ki.raycastTarget = false;
      ki.type = Image.Type.Simple;
      ki.preserveAspect = true; // the knob stays round under any layout
      var krt = knob.GetComponent<RectTransform>();
      krt.anchorMin = new Vector2(0.5f, 0.5f); krt.anchorMax = new Vector2(0.5f, 0.5f);
      /* the knob rides the SHELL line, not the rect center — the track
         sprite's extrusion pads its bottom, so a rect-centered knob sat
         ~8-10px south of the switch's well (owner, with the number) */
      if (m != null && m.assets != null) {
        foreach (var aT in m.assets) {
          if (aT == null || aT.component != "toggle" || aT.part != "track" || aT.shell == null) continue;
          if (aT.shell.h > 2f && track.rect.height > 1f)
            krt.anchoredPosition = new Vector2(0f, (0.5f - (aT.shell.y + aT.shell.h / 2f) / track.rect.height) * (track.rect.height / pngScale));
          break;
        }
      }
      var tog = go.AddComponent<Toggle>();
      tog.targetGraphic = go.GetComponent<Image>();
      tog.isOn = true;
      var glide = go.AddComponent<SwitchGlide>();
      glide.knob = krt;
      glide.onSprite = knobOn;
      glide.offSprite = knobOff != null ? knobOff : knobOn;
      glide.Snap();
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/Switch.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the FIRE BUTTON, WIRED (owner: "when you swipe left or right the
       center icon changes… is it possible to bring that wiring /
       animation into Unity") — bare dome + waiting chambers + live
       tintable glyphs + the FireButton swipe runtime. Geometry mirrors
       the app's carousel: chamber sprites ship at their true sizes and
       sit tangent to the dome at -90 / -135 / -180 degrees. */
    static bool FireButtonPrefab(string dir, string root, int pngScale, PBManifest m) {
      var dome = S(root + "/assets/firebutton/firebutton-dome.png");
      if (dome == null) return false;
      var pressed = S(root + "/assets/firebutton/firebutton-dome-pressed.png");
      var disabled = S(root + "/assets/firebutton/firebutton-dome-disabled.png");
      /* the arsenal, KIT-THEMED first (owner: "make the icons more
         on-brand… follow what is there in the boards"): the pre-themed
         glyph bakes carry the app's outline + lit fill + glow halo; the
         flat icons/ set is only the fallback for old zips, tinted. */
      string[] wNames = new string[] { "sword", "zap", "flask", "shield" };
      var weapons = new Sprite[4];
      bool themed = false;
      for (int wn = 0; wn < 4; wn++) {
        weapons[wn] = S(root + "/assets/firebutton/firebutton-glyph-" + wNames[wn] + ".png");
        if (weapons[wn] != null) themed = true;
        else weapons[wn] = S(root + "/assets/icons/" + wNames[wn] + ".png");
      }
      var go = ImageObject("Firebutton", dome, pngScale);
      go.GetComponent<Image>().type = Image.Type.Simple;
      var rt = go.GetComponent<RectTransform>();
      float domeW = rt.sizeDelta.x;
      // fallback ink for flat glyphs: the Glow role lifted toward white
      Color ink = Color.white;
      if (!themed && m != null && m.palette != null && !string.IsNullOrEmpty(m.palette.glow)) {
        Color g2; if (ColorUtility.TryParseHtmlString(m.palette.glow, out g2)) ink = Color.Lerp(g2, Color.white, 0.15f);
      }
      var fb = go.AddComponent<FireButton>();
      // the armed glyph, centered on the dome's SHELL
      var wGo = new GameObject("Weapon", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
      wGo.transform.SetParent(go.transform, false);
      var wIm = wGo.GetComponent<Image>();
      wIm.raycastTarget = false; wIm.preserveAspect = true; wIm.color = ink;
      Vector2 shlF;
      float domeShellW = ShellCenterAnchor(wGo, go, "firebutton", m, out shlF) ? Mathf.Min(shlF.x, shlF.y) : domeW;
      var wRt = wGo.GetComponent<RectTransform>();
      wRt.sizeDelta = new Vector2(domeShellW, domeShellW) * (themed ? 0.62f : 0.52f);
      // the app seats the armed glyph a touch BELOW the dome's center
      // (cy + kr·0.14) — the up-nudge read off-center (owner)
      wRt.anchoredPosition += new Vector2(0f, -domeShellW * 0.045f);
      fb.weapon = wIm;
      // waiting chambers, tangent to the dome's upper-left arc
      var chambers = new Image[3];
      float[] ang = new float[] { -90f, -135f, -180f };
      for (int i = 0; i < 3; i++) {
        var satSp = S(root + "/assets/firebutton/firebutton-sat" + (i + 1) + ".png");
        if (satSp == null) continue;
        var sGo = ImageObject("Chamber" + (i + 1), satSp, pngScale);
        sGo.transform.SetParent(go.transform, false);
        var sIm = sGo.GetComponent<Image>();
        sIm.raycastTarget = false; sIm.type = Image.Type.Simple;
        // chambers orbit the SHELL center, tangent to the dome's edge
        Vector2 shlS9;
        ShellCenterAnchor(sGo, go, "firebutton", m, out shlS9);
        var sRt = sGo.GetComponent<RectTransform>();
        float satW = sRt.sizeDelta.x;
        float orbit = domeShellW * 0.5f + satW * 0.5f - 3f;
        float a = ang[i] * Mathf.Deg2Rad;
        // app space is y-down: -90° = straight up, the arc walks left
        sRt.anchoredPosition = new Vector2(Mathf.Cos(a), -Mathf.Sin(a)) * orbit;
        var gGo = new GameObject("Glyph", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        gGo.transform.SetParent(sGo.transform, false);
        var gIm = gGo.GetComponent<Image>();
        gIm.raycastTarget = false; gIm.preserveAspect = true; gIm.color = ink;
        gGo.GetComponent<RectTransform>().sizeDelta = new Vector2(satW, satW) * 0.72f;
        chambers[i] = gIm;
      }
      fb.chambers = chambers;
      // the arsenal — a missing glyph just shortens the cycle
      int nW = 0; foreach (var wsp in weapons) if (wsp != null) nW++;
      var ws = new Sprite[nW]; int wi = 0;
      foreach (var wsp in weapons) if (wsp != null) ws[wi++] = wsp;
      fb.weapons = ws;
      // the glyph rides the kit's press sink so it travels with the face
      // (the dome's sink lives in its pressed sprite's pixels)
      if (m != null && m.stateFx != null)
        foreach (var f in m.stateFx)
          if (f != null && f.family == "firebutton" && f.state == "pressed") { fb.pressedLift = f.lift; break; }
      fb.DealNow(); // strike the armed pose so the prefab reads in edit mode
      // press/disabled ride Sprite Swap; the DOME's press sink is in the pixels
      var btn = go.AddComponent<Button>();
      btn.targetGraphic = go.GetComponent<Image>();
      if (pressed != null || disabled != null) {
        btn.transition = Selectable.Transition.SpriteSwap;
        var st2 = btn.spriteState;
        st2.pressedSprite = pressed;
        st2.disabledSprite = disabled;
        btn.spriteState = st2;
      }
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/Firebutton.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* REAL Unity Toggles from the plain wells (dev field report: "Unity
       has a Toggle component that is used for these kinds of binary state
       switches"; owner: both flavors ship). Background = the bare box,
       Checkmark = the kit's tintable glyph in the Glow role — Toggle shows
       and hides it natively. The designed ghost-mark prefabs stay too. */
    static bool TogglePrefabs(string dir, string root, int pngScale, PBManifest m) {
      bool any = false;
      // marks slightly inset + aspect-true (owner: the native toggles
      // "look terrible" — the stretched, edge-kissing marks were most of it)
      if (ToggleOne(dir, root, pngScale, m, "checkbox/checkbox-base-plain.png", "icons/check.png", "CheckboxToggle", 0.44f, m != null && m.palette != null ? m.palette.markInk : null)) any = true;
      if (ToggleOne(dir, root, pngScale, m, "radio/radio-base-plain.png", "icons/dot.png", "RadioToggle", 0.3f, m != null && m.palette != null ? m.palette.radioInk : null)) any = true;
      if (CountBadgePrefab(dir, root, pngScale, m)) any = true;
      return any;
    }
    static bool ToggleOne(string dir, string root, int pngScale, PBManifest m, string bgPath, string markPath, string name, float markScale, string ink) {
      var bg = S(root + "/assets/" + bgPath);
      var mark = S(root + "/assets/" + markPath);
      if (bg == null || mark == null) return false;
      var go = ImageObject(name, bg, pngScale);
      var markGo = ImageObject("Checkmark", mark, pngScale);
      markGo.transform.SetParent(go.transform, false);
      var mi = markGo.GetComponent<Image>();
      mi.raycastTarget = false;
      mi.preserveAspect = true; // a stretched mark reads broken instantly
      // the mark wears the kit's mark ink (the maker's Pressed-state icon
      // color when set), like the app's lit check — old manifests ship no
      // markInk and fall back to the Glow role, the tint they always had
      string tint = !string.IsNullOrEmpty(ink) ? ink : (m != null && m.palette != null ? m.palette.glow : null);
      if (!string.IsNullOrEmpty(tint)) {
        Color c;
        if (ColorUtility.TryParseHtmlString(tint, out c)) mi.color = c;
      }
      var bgRt = go.GetComponent<RectTransform>();
      var mrt = markGo.GetComponent<RectTransform>();
      mrt.anchorMin = new Vector2(0.5f, 0.5f); mrt.anchorMax = new Vector2(0.5f, 0.5f);
      mrt.anchoredPosition = Vector2.zero;
      mrt.sizeDelta = bgRt.sizeDelta * markScale; // the app's own mark proportion
      var tog = go.AddComponent<Toggle>();
      tog.targetGraphic = go.GetComponent<Image>();
      tog.graphic = mi;
      tog.isOn = true;
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/" + name + ".prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* a WIRED ScrollView (dev field report: scroll view assets missing and
       "prefabs for some of the more involved objects would be an awesome
       quality of life thing") — panel frame, RectMask2D viewport, empty
       Content ready for children, kit-dressed vertical scrollbar. */
    static bool ScrollViewPrefab(string dir, string root, int pngScale) {
      var frame = S(root + "/assets/panel/panel-base.9.png");
      var track = S(root + "/assets/scrollview/scrollview-track.9.png");
      var handle = S(root + "/assets/scrollview/scrollview-handle.9.png");
      if (frame == null || track == null || handle == null) return false;
      var go = ImageObject("ScrollView", frame, pngScale);
      go.GetComponent<Image>().type = Image.Type.Sliced;
      var rt = go.GetComponent<RectTransform>();
      rt.sizeDelta = new Vector2(Mathf.Max(380f, rt.sizeDelta.x * 0.75f), 460f);
      var sr = go.AddComponent<ScrollRect>();
      var vp = new GameObject("Viewport", typeof(RectTransform), typeof(RectMask2D));
      vp.transform.SetParent(go.transform, false);
      var vrt = vp.GetComponent<RectTransform>();
      vrt.anchorMin = Vector2.zero; vrt.anchorMax = Vector2.one;
      vrt.offsetMin = new Vector2(18f, 18f); vrt.offsetMax = new Vector2(-46f, -18f); // the right lane belongs to the scrollbar
      vrt.pivot = new Vector2(0f, 1f);
      var content = new GameObject("Content", typeof(RectTransform));
      content.transform.SetParent(vp.transform, false);
      var crt = content.GetComponent<RectTransform>();
      crt.anchorMin = new Vector2(0f, 1f); crt.anchorMax = new Vector2(1f, 1f);
      crt.pivot = new Vector2(0.5f, 1f);
      crt.sizeDelta = new Vector2(0f, 640f); // taller than the frame so it scrolls out of the box
      var sb = ImageObject("Scrollbar", track, pngScale);
      sb.transform.SetParent(go.transform, false);
      sb.GetComponent<Image>().type = Image.Type.Sliced;
      var sbrt = sb.GetComponent<RectTransform>();
      sbrt.anchorMin = new Vector2(1f, 0f); sbrt.anchorMax = new Vector2(1f, 1f);
      sbrt.pivot = new Vector2(1f, 0.5f);
      sbrt.sizeDelta = new Vector2(22f, -36f);
      sbrt.anchoredPosition = new Vector2(-10f, 0f);
      var bar = sb.AddComponent<Scrollbar>();
      var slide = new GameObject("Sliding Area", typeof(RectTransform));
      slide.transform.SetParent(sb.transform, false);
      var srt = slide.GetComponent<RectTransform>();
      srt.anchorMin = Vector2.zero; srt.anchorMax = Vector2.one;
      srt.offsetMin = new Vector2(3f, 7f); srt.offsetMax = new Vector2(-3f, -7f);
      var hd = ImageObject("Handle", handle, pngScale);
      hd.transform.SetParent(slide.transform, false);
      var hi = hd.GetComponent<Image>();
      hi.type = Image.Type.Sliced;
      var hrt = hd.GetComponent<RectTransform>();
      hrt.anchorMin = Vector2.zero; hrt.anchorMax = Vector2.one;
      hrt.offsetMin = Vector2.zero; hrt.offsetMax = Vector2.zero;
      bar.handleRect = hrt;
      bar.targetGraphic = hi;
      bar.direction = Scrollbar.Direction.BottomToTop;
      sr.viewport = vrt; sr.content = crt;
      sr.verticalScrollbar = bar;
      sr.horizontal = false;
      sr.verticalScrollbarVisibility = ScrollRect.ScrollbarVisibility.Permanent;
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/ScrollView.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
    /* the health globe, ALIVE: glass masks a Filled(Vertical) liquid —
       Image.fillAmount IS the health; the rim draws above. */
    static bool GlobePrefab(string dir, string root, int pngScale, PBManifest m) {
      var glass = S(root + "/assets/globe/globe-glass.png");
      var rim = S(root + "/assets/globe/globe-rim.png");
      var liquid = S(root + "/assets/globe/globe-liquid.png");
      if (glass == null || rim == null || liquid == null) return false;
      var go = ImageObject("HealthGlobe", glass, pngScale);
      /* the stencil is a HIDDEN copy of the glass: Unity only alpha-clips
         a Mask when its graphic is hidden, so masking with the visible
         glass would clip the liquid to a RECTANGLE (same gotcha the
         tiled face hit in the field) */
      var maskGo = ImageObject("LiquidMask", glass, pngScale);
      maskGo.transform.SetParent(go.transform, false);
      maskGo.GetComponent<Image>().raycastTarget = false;
      var mrt = maskGo.GetComponent<RectTransform>();
      mrt.anchorMin = Vector2.zero; mrt.anchorMax = Vector2.one;
      mrt.offsetMin = Vector2.zero; mrt.offsetMax = Vector2.zero;
      var mask = maskGo.AddComponent<Mask>();
      mask.showMaskGraphic = false;
      var lq = ImageObject("Liquid", liquid, pngScale);
      lq.transform.SetParent(maskGo.transform, false);
      var li = lq.GetComponent<Image>();
      li.type = Image.Type.Filled;
      li.fillMethod = Image.FillMethod.Vertical;
      li.fillOrigin = (int)Image.OriginVertical.Bottom;
      li.fillAmount = 0.72f; // drive this from your live health
      li.raycastTarget = false;
      var lrt = lq.GetComponent<RectTransform>();
      /* anchor the cropped liquid to the VISIBLE WELL (manifest fractions):
         fillAmount 0..1 becomes visually empty..full — a game gating on
         health == 1 fires at the brim, not at 87% (dev field report).
         Old zips without the measurement keep the full stretch. */
      var wl = m != null ? m.globeWell : null;
      bool measured = wl != null && (wl.x1 - wl.x0) > 0.01f && (wl.y1 - wl.y0) > 0.01f;
      lrt.anchorMin = measured ? new Vector2(wl.x0, wl.y0) : Vector2.zero;
      lrt.anchorMax = measured ? new Vector2(wl.x1, wl.y1) : Vector2.one;
      lrt.offsetMin = Vector2.zero; lrt.offsetMax = Vector2.zero;
      var rm = ImageObject("Rim", rim, pngScale);
      rm.transform.SetParent(go.transform, false);
      rm.GetComponent<Image>().raycastTarget = false;
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/HealthGlobe.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
#if UNITY_2023_2_OR_NEWER
    /* the season track: bare art + PatternBreak.SeasonTrack, which owns
       the CONTENT (lane names, level numbers, progress) as live text —
       its Inspector says so, prototypers edit there (owner). */
    static bool SeasonTrackPrefab(string dir, string root, int pngScale, PBManifest m) {
      var baseSp = S(root + "/assets/seasontrack/seasontrack-base.png");
      if (baseSp == null) return false;
      var go = ImageObject("SeasonTrack", baseSp, pngScale);
      var trackC = go.AddComponent<SeasonTrack>();
      Font kitFont = null;
      if (m != null && m.typography != null && !string.IsNullOrEmpty(m.typography.fontFile))
        kitFont = AssetDatabase.LoadAssetAtPath<Font>(root + "/" + m.typography.fontFile);
      trackC.face = EnsureTmpFace(root, m, kitFont);
      trackC.Rebuild();
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/SeasonTrack.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
#endif
    static bool RunPrefabBuilders(string dir, string root, PBManifest m) {
      var pngScale = m.pngScale > 0 ? m.pngScale : 2;
      bool any = false;
      // the kit's own face, shipped in fonts/ with its license — labels wire to it
      Font kitFont = null;
      if (m.typography != null && !string.IsNullOrEmpty(m.typography.fontFile))
        kitFont = AssetDatabase.LoadAssetAtPath<Font>(root + "/" + m.typography.fontFile);
      if (ProgressPrefab(dir, root, pngScale)) any = true;
      // the RIGS: working controls composed from their layer sprites
      if (JoystickPrefab(dir, root, pngScale, m)) any = true;
      if (GlobePrefab(dir, root, pngScale, m)) any = true;
      if (MinimapPrefab(dir, root, pngScale, m)) any = true;
      if (TogglePrefabs(dir, root, pngScale, m)) any = true;
      if (SliderPrefab(dir, root, pngScale, m)) any = true;
      if (SwitchPrefab(dir, root, pngScale, m)) any = true;
      if (FireButtonPrefab(dir, root, pngScale, m)) any = true;
      if (ScrollViewPrefab(dir, root, pngScale)) any = true;
      /* the stretch-safe variants live in their OWN folder (owner: "we
         need to draw a distinction between 9 slice elements and not…
         two different folders") — Prefabs/ stays the drag-in pieces,
         Prefabs/Tiled face/ is the pattern-true stretch flavor */
      var tiledDir = dir + "/Tiled face";
      bool hadTiledDir = AssetDatabase.IsValidFolder(tiledDir);
      if (!hadTiledDir) AssetDatabase.CreateFolder(dir, "Tiled face");
      bool anyTiled = false;
      foreach (var tf in new string[] { "panel", "header", "button-primary", "button-secondary", "list-row", "item-slot" }) {
        var tl = (tf == "button-primary" || tf == "button-secondary" || tf == "header-banner") ? DefaultLabel(tf) : null;
        if (TiledFacePrefab(tiledDir, root, pngScale, tf, tl, kitFont, m)) { any = true; anyTiled = true; }
      }
      // a kit with no pattern builds no tiled faces — leave no empty folder
      if (!anyTiled && !hadTiledDir) AssetDatabase.DeleteAsset(tiledDir);
#if UNITY_2023_2_OR_NEWER
      if (SeasonTrackPrefab(dir, root, pngScale, m)) any = true;
#endif
      /* every family with a "base" sprite becomes a prefab; the composed
         controls and pure parts opt out (they're layers, not pieces) */
      var labeled = new HashSet<string> { "button-primary", "button-secondary", "button-small", "chip", "tab", "tab-back", "endturn", "keycap", "pricebtn", "header-banner" };
      /* the data-heavy panels (lap times, leaderboard, telemetry) read as
         empty shells without their live content — their sprites still ship,
         but they don't make useful drag-in prefabs (owner) */
      /* firebutton joined the composed rigs: FireButtonPrefab builds the
         wired swipe carousel, so the generic base-sprite prefab bows out */
      var skip = new HashSet<string> { "progress", "slider", "toggle", "segbar", "fx", "icons", "dropdown", "rarityframe", "loottag", "speedo", "speedo2", "circuit", "startlights", "laptimes", "leaderboard", "telemetry", "joystick", "globe", "seasontrack", "extras", "firebutton" };
      foreach (var a in m.assets) {
        if (a == null || string.IsNullOrEmpty(a.component) || a.part != "base") continue;
        if (skip.Contains(a.component)) continue;
        skip.Add(a.component); // one per family
        var label = labeled.Contains(a.component) ? DefaultLabel(a.component) : null;
        if (FamilyPrefab(dir, root, a, NiceName(a.component), label, pngScale, kitFont, m)) any = true;
      }
#if UNITY_2023_2_OR_NEWER
      if (HeroLabelPrefab(dir, root)) any = true;
#endif
      return any;
    }
    static bool GeneratePrefabs(string root, PBManifest m) {
      bool createdHere = false;
      if (!AssetDatabase.IsValidFolder(root + "/Prefabs")) {
        var created = AssetDatabase.CreateFolder(root, "Prefabs");
        if (string.IsNullOrEmpty(created)) return false;
        createdHere = true;
      }
      var dir = root + "/Prefabs";
      bool any = RunPrefabBuilders(dir, root, m);
      // an EMPTY folder must not latch generation off forever — if nothing
      // landed (sprites missing on a manual run), clean up so the next
      // pass gets its first-import chance
      if (!any && createdHere) AssetDatabase.DeleteAsset(dir);
      return any;
    }
    /* MaintainExamplePrefabs' surgical sibling: a kit UPDATE can carry
       components this project has never had prefabs for (the "7 skipped,
       no prefab yet" board-scene report) — build exactly those, never
       touching an existing prefab (yours after first generation). The
       builders run into a staging folder; only names the project lacks
       move over, the rest is discarded. */
    static void GenerateMissingPrefabs(string root, PBManifest m) {
      var dir = root + "/Prefabs";
      if (!AssetDatabase.IsValidFolder(dir) || m == null) return;
      var have = new HashSet<string>();
      foreach (var g in AssetDatabase.FindAssets("t:Prefab", new string[] { dir }))
        have.Add(Path.GetFileName(AssetDatabase.GUIDToAssetPath(g)));
      var stage = root + "/PrefabsStaging";
      if (AssetDatabase.IsValidFolder(stage)) AssetDatabase.DeleteAsset(stage);
      if (string.IsNullOrEmpty(AssetDatabase.CreateFolder(root, "PrefabsStaging"))) return;
      int added = 0;
      try {
        RunPrefabBuilders(stage, root, m);
        foreach (var g in AssetDatabase.FindAssets("t:Prefab", new string[] { stage })) {
          var p = AssetDatabase.GUIDToAssetPath(g);
          var name = Path.GetFileName(p);
          if (have.Contains(name)) continue;
          /* the staged layout carries subfolders (Tiled face) — a missing
             prefab moves into the SAME subfolder, not the root */
          var rel = p.Substring(stage.Length + 1);
          var sub = Path.GetDirectoryName(rel).Replace("\\\\", "/");
          var targetDir = dir;
          if (!string.IsNullOrEmpty(sub)) {
            targetDir = dir + "/" + sub;
            if (!AssetDatabase.IsValidFolder(targetDir)) AssetDatabase.CreateFolder(dir, sub);
          }
          if (string.IsNullOrEmpty(AssetDatabase.MoveAsset(p, targetDir + "/" + name))) added++;
        }
      } finally {
        AssetDatabase.DeleteAsset(stage);
      }
      if (added > 0) Debug.Log("UI Kit Maker: " + added + " new prefab(s) added for this kit's newer pieces — existing prefabs untouched.");
    }
    /* Per-import maintenance for OUR example prefabs — the two things that
       must track the kit even though "your prefabs are yours" (owner field
       reports: dead buttons from pre-wiring kits; labels wearing the type
       style from the day they were generated — "legacy text"):
       1. WIRING: a prefab with NO Selectable of any kind whose family
          ships state sprites gets Button + SpriteSwap (one the user
          removed or replaced is a choice we honor).
       2. LABEL DRESS: the label WE generated (named "Label") is re-dressed
          in the kit's CURRENT type — ink, weight, italic, tracking, face.
          Words, size and alignment are the user's and never touched;
          renamed or added texts are skipped entirely.
       Both are surgical, idempotent (nothing saves unless something
       actually changed), and placed copies (the Playground included)
       inherit the result automatically. */
    static void MaintainExamplePrefabs(string root, PBManifest m) {
      var dir = root + "/Prefabs";
      if (!AssetDatabase.IsValidFolder(dir)) return;
      int wired = 0, redressed = 0, purgedGhosts = 0, unswapped = 0, resized = 0, speced = 0, clickFit = 0;
      float armedSink = 0f;
#if UNITY_2023_2_OR_NEWER
      var face = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace SDF.asset");
      var kitStyle = m != null && m.typography != null ? m.typography.style : null;
      // the shipped TTF, for labels rebuilt on the SDF path
      Font mkFont = null;
      if (m != null && m.typography != null && !string.IsNullOrEmpty(m.typography.fontFile))
        mkFont = AssetDatabase.LoadAssetAtPath<Font>(root + "/" + m.typography.fontFile);
#endif
      int healed = 0;
      foreach (var g in AssetDatabase.FindAssets("t:Prefab", new string[] { dir })) {
        var path = AssetDatabase.GUIDToAssetPath(g);
        var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (asset == null) continue;
        var rootImg = asset.GetComponent<Image>();
        if (rootImg == null || rootImg.sprite == null) {
#if UNITY_2023_2_OR_NEWER
          // the HeroLabel prefab (no root Image): a Play-mode or
          // essentials-race import can leave its layers with NO font —
          // re-attach each layer's own baked face, words untouched
          if (rootImg == null && asset.GetComponent<HeroLabel>() != null) HealHeroLabel(root, path, asset, ref healed);
#endif
          continue;
        }
        var spritePath = AssetDatabase.GetAssetPath(rootImg.sprite).Replace("\\\\", "/");
        if (!spritePath.StartsWith(root + "/assets/")) continue; // not this kit's sprite — not ours to touch
        var famDir = Path.GetDirectoryName(spritePath).Replace("\\\\", "/");
        var famName = Path.GetFileName(famDir);
        var hover = State(famDir, "hover");
        var pressed = State(famDir, "pressed");
        var disabled = State(famDir, "disabled");
        /* the tiled-face builds are LAYERED art (root = base-under with
           pattern + over children): a full-material sprite swap on them
           doubles the pattern and gloss on hover. Their states are wired
           at generation (Button, no swap; StateFx; label ink) — the
           maintenance pass must not "heal" them into the wrong transition */
        bool tiledBuild = spritePath.Contains("-base-under.") || spritePath.EndsWith("/base-under.9.png");
        bool wantWiring = !tiledBuild && asset.GetComponent<Selectable>() == null && (hover != null || pressed != null || disabled != null);
        /* click areas that stop at the drawn shell — prefabs from older
           importers raycast their whole padded crop (owner: "very large
           selection area"); pad any that still read zero */
        bool wantPad = rootImg.raycastPadding == Vector4.zero && ShellRowOf(asset, famName, m) != null;
        /* a prefab built by an older importer already has its Button, so the
           wiring branch never fires — it would have kept its quiet face swap
           forever without this (owner: "I'm not getting the glows on hover") */
        bool wantFx = !tiledBuild && (hover != null || pressed != null || disabled != null)
          && asset.GetComponent<StateFx>() == null && HasStateFx(m, famName);
        /* and where an earlier pass already swap-wired a tiled build, take
           the wrong transition OFF (our mistake, ours to clean) — the
           Button itself stays, clicks keep working */
        bool wantUnswap = false;
        if (tiledBuild) {
          var selNow = asset.GetComponent<Selectable>();
          wantUnswap = selNow != null && selNow.transition == Selectable.Transition.SpriteSwap;
        }
        /* the root rect tracks the CURRENT sprite: a prefab generated by an
           older importer keeps the sizeDelta of the sprite it was born
           with — crop and scale fixes since then never reach it, and every
           scene placement inherits the stale rect (field: 2x PLAY buttons
           beside a perfectly sized fresh joystick). Converging restores
           our own generation contract; words, wiring and user children
           are untouched. */
        bool wantResize = false;
        {
          float psR = m != null && m.pngScale > 0 ? m.pngScale : 2;
          var rrt = asset.GetComponent<RectTransform>();
          if (rrt != null) {
            var wantSz = new Vector2(rootImg.sprite.rect.width / psR, rootImg.sprite.rect.height / psR);
            if (Mathf.Abs(rrt.sizeDelta.x - wantSz.x) > 0.75f || Mathf.Abs(rrt.sizeDelta.y - wantSz.y) > 0.75f) wantResize = true;
          }
        }
        /* the ENGINE-COMPOSED specular converges too: a kit that ships
           <fam>-specular.png hands the overlay child to prefabs from
           older importers; a kit whose specular turned off (no manifest
           row anymore) takes the stale child back off */
        bool specShips = false;
        if (m != null && m.assets != null)
          foreach (var aS in m.assets) { if (aS != null && aS.component == famName && aS.part == "specular") { specShips = true; break; } }
        var specNow = asset.transform.Find("Specular");
        bool wantSpecAdd = specShips && specNow == null;
        bool wantSpecCut = false;
        if (!specShips && specNow != null) {
          var specImg = specNow.GetComponent<Image>();
          wantSpecCut = specImg != null && specImg.sprite != null
            && AssetDatabase.GetAssetPath(specImg.sprite).Replace("\\\\", "/").StartsWith(root + "/assets/");
        }
        bool wantDress = false;
#if UNITY_2023_2_OR_NEWER
        if (kitStyle != null) {
          var probeRoot = FindOurLabelRoot(asset);
          if (probeRoot != null) {
            /* the family's target label SHAPE: layered baked stack when the
               kit ships layer faces and needs no dynamic ink; solo baked
               next; styled SDF last — re-dress whenever the current shape
               isn't the target */
            var wantBaked = BakedLabelFace(m, root, famName);
            var probeTmp = probeRoot.GetComponent<TextMeshProUGUI>();
            bool stacked = probeRoot.GetComponent<HeroLabel>() != null;
            var wantMaster = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
            var wantStroke = InkMaterial(root, "Stroke");
            bool layersShip = wantMaster != null && wantStroke != null;
            if (wantBaked != null && layersShip) {
              wantDress = !stacked;
              /* any older stack shape re-dresses to the echo construction:
                 the mirror-era four-text build (more than one text under
                 the root), a text off the master font (deleted mirror
                 assets — field: "no Font Asset assigned"), or ink slots
                 the importer hasn't armed yet */
              if (!wantDress) {
                int texts = 0;
                foreach (var lt in probeRoot.GetComponentsInChildren<TextMeshProUGUI>(true)) {
                  texts++;
                  if (lt.font != wantMaster) wantDress = true;
                }
                var hlInk = probeRoot.GetComponent<HeroLabel>();
                if (texts != 1 || hlInk == null || hlInk.strokeInk != wantStroke) wantDress = true;
              }
            }
            else if (wantBaked != null) wantDress = stacked || probeTmp == null || probeTmp.font != wantBaked || probeTmp.enableVertexGradient || probeTmp.color != Color.white;
            else wantDress = stacked || probeTmp == null || !LabelCurrent(probeTmp, kitStyle, face);
            // the kit's Type Size dial drives the word size — converge
            // labels sized by an older importer (or an older dial).
            // STACKS are judged by the GROUP contract (HeroLabel owns the
            // size; auto-fit is forced OFF per layer — the old per-layer
            // demand would rebuild every healthy stack on every import)
            /* expected size mirrors the dresser exactly: labelFs (app-true)
               when the manifest ships it, LabelSize otherwise — probes and
               dresser disagreeing is an infinite re-dress every import */
            var probeRow = LabelRow(m, famName);
            float wantLs = probeRow != null && probeRow.labelFs > 1f ? probeRow.labelFs : LabelSize(m, famName);
            var hlSize = probeRoot.GetComponent<HeroLabel>();
            if (!wantDress && hlSize != null) {
              if (!Mathf.Approximately(hlSize.fontSize, wantLs)) wantDress = true;
            } else if (!wantDress) {
              var sizeTmp = probeRoot.GetComponentInChildren<TextMeshProUGUI>(true);
              if (sizeTmp != null && (!sizeTmp.enableAutoSizing || !Mathf.Approximately(sizeTmp.fontSizeMax, wantLs)))
                wantDress = true;
            }
            /* dead or stale state wiring re-converges: a script-identity
               break (delete-and-redrop mints a new script GUID) leaves a
               "Behaviour is missing" GHOST — GetComponent returns null,
               SpriteSwap keeps working, and the sink dies silently (field:
               "it still does not move with the button face") */
            /* v-scale arming: a stack built before authoredHeight existed
               can't scale with its button (field: "scaling still isn't
               working") — one rebuild arms it, words preserved */
            if (!wantDress) {
              var hlProbe = probeRoot.GetComponent<HeroLabel>();
              if (hlProbe != null && hlProbe.authoredHeight < 0.5f) wantDress = true;
            }
            /* SHELL-ANCHOR convergence: a label root still stretched over
               the sprite RECT (older importer) sits low — extrusion pulls
               the rect's center off the face (owner: "the stacking is
               off… at the prefab level"). Re-dress onto the shell box. */
            if (!wantDress) {
              var rowSA = ShellRowOf(asset, famName, m);
              var prtSA = probeRoot.GetComponent<RectTransform>();
              if (rowSA != null && prtSA != null && rootImg.sprite != null && rootImg.sprite.rect.width > 2f) {
                float rwSA = rootImg.sprite.rect.width, rhSA = rootImg.sprite.rect.height;
                // the label seat rides the shell box PLUS the content shift —
                // the probe must expect exactly what ShellSeatLabel writes
                var shiftSA = LabelSeatShift(probeRow, rootImg.sprite, m);
                var wantMinSA = new Vector2(rowSA.shell.x / rwSA, 1f - (rowSA.shell.y + rowSA.shell.h) / rhSA) + shiftSA;
                var wantMaxSA = new Vector2((rowSA.shell.x + rowSA.shell.w) / rwSA, 1f - rowSA.shell.y / rhSA) + shiftSA;
                if ((prtSA.anchorMin - wantMinSA).sqrMagnitude > 0.0004f || (prtSA.anchorMax - wantMaxSA).sqrMagnitude > 0.0004f) wantDress = true;
              }
            }
            if (!wantDress && HasStateInk(m, famName)) {
              var inkNow = asset.GetComponent<LabelStateInk>();
              if (inkNow == null
                  || !Mathf.Approximately(inkNow.pressedShift, ExpectedShift(m, famName, "pressed"))
                  || !Mathf.Approximately(inkNow.hoverShift, ExpectedShift(m, famName, "hover")))
                wantDress = true;
            }
          }
        }
#endif
        if (!wantWiring && !wantDress && !wantFx && !wantUnswap && !wantResize && !wantSpecAdd && !wantSpecCut && !wantPad) continue;
        var contents = PrefabUtility.LoadPrefabContents(path);
        try {
          bool changed = false;
          // sweep dead script references (a delete-and-redrop mints new
          // script GUIDs; the ghosts block nothing but confuse everything)
          foreach (var tr in contents.GetComponentsInChildren<Transform>(true))
            if (GameObjectUtility.RemoveMonoBehavioursWithMissingScript(tr.gameObject) > 0) { purgedGhosts++; changed = true; }
          if (wantWiring && contents.GetComponent<Selectable>() == null) {
            var btn = contents.AddComponent<Button>();
            btn.targetGraphic = contents.GetComponent<Image>();
            btn.transition = Selectable.Transition.SpriteSwap;
            var ss = new SpriteState();
            ss.highlightedSprite = hover;
            // selected stays the RESTING face — mirroring hover here made a
            // clicked button look stuck in rollover (field: "weird and
            // incorrect"); null falls back to the base sprite
            ss.selectedSprite = null;
            ss.pressedSprite = pressed;
            ss.disabledSprite = disabled;
            btn.spriteState = ss;
            WireStateFx(contents, root, m, famName, spritePath, m.pngScale);
            wired++; changed = true;
          }
          if (wantFx && contents.GetComponent<StateFx>() == null) {
            WireStateFx(contents, root, m, famName, spritePath, m.pngScale);
            if (contents.GetComponent<StateFx>() != null) { wired++; changed = true; }
          }
          if (wantPad) {
            ShellRaycastPad(contents, famName, m);
            var padImg = contents.GetComponent<Image>();
            if (padImg != null && padImg.raycastPadding != Vector4.zero) { clickFit++; changed = true; }
          }
          if (wantUnswap) {
            var selFix = contents.GetComponent<Selectable>();
            if (selFix != null && selFix.transition == Selectable.Transition.SpriteSwap) {
              selFix.transition = Selectable.Transition.None;
              selFix.spriteState = new SpriteState();
              // the layered build's states live engine-side — arm them now
              if (contents.GetComponent<StateFx>() == null && HasStateFx(m, famName))
                WireStateFx(contents, root, m, famName, famDir + "/" + famName + "-base.9.png", m.pngScale);
              unswapped++; changed = true;
            }
          }
          if (wantResize) {
            var rrtC = contents.GetComponent<RectTransform>();
            var imgC = contents.GetComponent<Image>();
            if (rrtC != null && imgC != null && imgC.sprite != null) {
              float psC = m != null && m.pngScale > 0 ? m.pngScale : 2;
              rrtC.sizeDelta = new Vector2(imgC.sprite.rect.width / psC, imgC.sprite.rect.height / psC);
              resized++; changed = true;
            }
          }
          if (wantSpecAdd && contents.transform.Find("Specular") == null) {
            AddSpecular(contents, root, famName, m);
            if (contents.transform.Find("Specular") != null) { speced++; changed = true; }
          }
          if (wantSpecCut) {
            var cutT = contents.transform.Find("Specular");
            if (cutT != null) { UnityEngine.Object.DestroyImmediate(cutT.gameObject); speced++; changed = true; }
          }
#if UNITY_2023_2_OR_NEWER
          if (wantDress) {
            var oldRoot = FindOurLabelRoot(contents);
            if (oldRoot != null) {
              /* rebuild the label in the target shape, WORDS PRESERVED —
                 per-field surgery across three possible shapes is where
                 stale dress bugs breed */
              var keepText = LabelText(oldRoot, DefaultLabel(famName));
              /* the AUTHORED height survives the rebuild — re-capturing it
                 from the owner's resized rect would silently re-baseline
                 the v-scale to 1 and snap their scaled type back */
              var oldHl = oldRoot.GetComponent<HeroLabel>();
              float keepAuthored = oldHl != null ? oldHl.authoredHeight : 0f;
              Vector2 keepNudge = oldHl != null ? oldHl.nudge : Vector2.zero;
              Vector4 keepMargins = oldHl != null ? oldHl.margins : Vector4.zero;
              // hand-tuned tracking and line height survive too (field:
              // a line height matched up by hand must never be re-lost)
              float keepSpacing = oldHl != null ? oldHl.spacing : 0f;
              float keepWordSpacing = oldHl != null ? oldHl.wordSpacing : 0f;
              float keepLineSpacing = oldHl != null ? oldHl.lineSpacing : 0f;
              UnityEngine.Object.DestroyImmediate(oldRoot);
              var wantBaked = BakedLabelFace(m, root, famName);
              if (wantBaked != null) AddBakedLabel(contents, keepText, root, wantBaked, m, famName);
              else AddLabel(contents, keepText, mkFont, root, m, famName);
              var newRoot = FindOurLabelRoot(contents);
              if (newRoot != null) {
                var newHl = newRoot.GetComponent<HeroLabel>();
                // the maker's own placement and spacing survive the rebuild
                if (newHl != null) {
                  if (keepAuthored >= 0.5f) newHl.authoredHeight = keepAuthored;
                  newHl.nudge = keepNudge; newHl.margins = keepMargins;
                  newHl.spacing = keepSpacing; newHl.wordSpacing = keepWordSpacing; newHl.lineSpacing = keepLineSpacing;
                  newHl.SetText(newHl.text);
                }
              }
              if (newRoot != null) WireLabelStates(contents, newRoot, m, famName);
              var armed = contents.GetComponent<LabelStateInk>();
              if (armed != null && armed.pressedShift != 0f) armedSink = armed.pressedShift;
              redressed++; changed = true;
            }
          }
#endif
          if (changed) PrefabUtility.SaveAsPrefabAsset(contents, path);
        } finally { PrefabUtility.UnloadPrefabContents(contents); }
      }
      if (wired > 0)
        Debug.Log("UI Kit Maker: wired hover/press/disabled states onto " + wired + " example prefab(s) from an earlier kit version — press Play and mouse over them. Copies already placed in scenes (the Playground included) picked the wiring up automatically.");
      if (redressed > 0)
        Debug.Log("UI Kit Maker: re-dressed the label on " + redressed + " example prefab(s) to the kit's current type style (words untouched) — the old dress was frozen at generation time."
          /* the armed sink IN THE RECEIPT: whether press-follow is wired is
             field-checkable from the Console alone (owner loop: "type still
             isn't following the face") */
          + (armedSink != 0f ? " Press sink armed: labels ride the face " + armedSink + "px down while pressed." : " No press sink in this kit's state recipe (labels stay put by design)."));
      if (healed > 0)
        Debug.Log("UI Kit Maker: rebuilt " + healed + " HeroLabel prefab(s) to the echo construction (one text, layer inks) — words preserved; placed copies healed with it.");
      if (purgedGhosts > 0)
        Debug.Log("UI Kit Maker: purged dead script reference(s) on " + purgedGhosts + " prefab(s) (a script identity change from a delete-and-redrop) — the state wiring was rebuilt fresh alongside.");
      if (unswapped > 0)
        Debug.Log("UI Kit Maker: corrected the state transition on " + unswapped + " tiled-face prefab(s) — a full-material sprite swap doubles the layered pattern, so their states now ride the engine glow/lift instead. Clicks unchanged.");
      if (resized > 0)
        Debug.Log("UI Kit Maker: converged the root rect on " + resized + " example prefab(s) to the current sprite size — prefabs generated by an older importer kept the sprite dimensions they were born with, and board scenes inherited the stale size.");
      if (speced > 0)
        Debug.Log("UI Kit Maker: converged the specular overlay on " + speced + " prefab(s) — the streak now rides as its own layer (scaling with the piece) instead of smearing through the nine-slice.");
    }
#if UNITY_2023_2_OR_NEWER
    static void HealHeroLabel(string root, string path, GameObject asset, ref int healed) {
      var master = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
      if (master == null) return;
      var strokeInk = InkMaterial(root, "Stroke");
      // the echo shape: exactly one text, on the master font, inks armed
      bool broken = false;
      int texts = 0;
      foreach (var lt in asset.GetComponentsInChildren<TextMeshProUGUI>(true)) {
        texts++;
        if (lt.font != master) broken = true;
      }
      var hl = asset.GetComponent<HeroLabel>();
      if (texts != 1 || hl == null || (strokeInk != null && hl.strokeInk != strokeInk)) broken = true;
      if (!broken) return;
      /* rebuild in place, word preserved — the echo construction is cheap
         and total, and per-field surgery across generations of stack
         shapes is where stale-dress bugs breed */
      var contents = PrefabUtility.LoadPrefabContents(path);
      try {
        var oldHl = contents.GetComponent<HeroLabel>();
        string keepText = oldHl != null && !string.IsNullOrEmpty(oldHl.text) ? oldHl.text : "PLAY";
        float keepSize = oldHl != null && oldHl.fontSize > 1f ? oldHl.fontSize : 150f;
        for (int i = contents.transform.childCount - 1; i >= 0; i--)
          UnityEngine.Object.DestroyImmediate(contents.transform.GetChild(i).gameObject);
        var lgo = new GameObject("Fill", typeof(RectTransform), typeof(CanvasRenderer));
        lgo.transform.SetParent(contents.transform, false);
        var lrt = lgo.GetComponent<RectTransform>();
        lrt.anchorMin = Vector2.zero; lrt.anchorMax = Vector2.one;
        lrt.offsetMin = Vector2.zero; lrt.offsetMax = Vector2.zero;
        var t = lgo.AddComponent<TextMeshProUGUI>();
        t.text = keepText;
        t.alignment = TextAlignmentOptions.Center;
        t.fontSize = keepSize;
        t.enableAutoSizing = false;
        t.raycastTarget = false;
        t.font = master;
        t.color = Color.white;
        var newHl = oldHl != null ? oldHl : contents.AddComponent<HeroLabel>();
        newHl.fontSize = keepSize;
        newHl.shadowInk = InkMaterial(root, "Shadow");
        newHl.strokeInk = strokeInk;
        newHl.glintsInk = InkMaterial(root, "Glints");
        newHl.SetText(keepText);
        PrefabUtility.SaveAsPrefabAsset(contents, path);
        healed++;
      } finally { PrefabUtility.UnloadPrefabContents(contents); }
    }
#endif
#if UNITY_2023_2_OR_NEWER
    /* ── HeroLabel: the app's paint order as a prefab. ONE text — the
       Fill — and its echoes: the soft shadow and every stroke merged into
       one silent band behind the whole word, glint sparks in front. The
       word is typed ONCE, on the text or on the root's Hero Label box;
       the echoes are redraws of the same mesh and cannot disagree. ── */
    static bool HeroLabelPrefab(string dir, string root) {
      var layersFa = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(root + "/fonts/KitFace Baked Layers.asset");
      var strokeInk = InkMaterial(root, "Stroke");
      if (layersFa == null || strokeInk == null) return false;
      var go = new GameObject("HeroLabel", typeof(RectTransform));
      go.GetComponent<RectTransform>().sizeDelta = new Vector2(900f, 220f);
      var hl = go.AddComponent<HeroLabel>();
      var lgo = new GameObject("Fill", typeof(RectTransform), typeof(CanvasRenderer));
      lgo.transform.SetParent(go.transform, false);
      var lrt = lgo.GetComponent<RectTransform>();
      lrt.anchorMin = Vector2.zero; lrt.anchorMax = Vector2.one;
      lrt.offsetMin = Vector2.zero; lrt.offsetMax = Vector2.zero;
      var t = lgo.AddComponent<TextMeshProUGUI>();
      t.text = "PLAY";
      t.alignment = TextAlignmentOptions.Center;
      t.fontSize = 150f;
      t.enableAutoSizing = false;
      t.raycastTarget = false;
      t.font = layersFa;
      t.color = Color.white;
      // shadow + glints are optional layers — an empty slot simply means
      // this kit designed no such ink
      hl.shadowInk = InkMaterial(root, "Shadow");
      hl.strokeInk = strokeInk;
      hl.glintsInk = InkMaterial(root, "Glints");
      PrefabUtility.SaveAsPrefabAsset(go, dir + "/HeroLabel.prefab");
      UnityEngine.Object.DestroyImmediate(go);
      return true;
    }
#endif
  }

  /* Applies manifest settings to kit textures AS THEY IMPORT — covers
     reimports and asset refreshes without anyone running the menu. */
#if UNITY_2023_2_OR_NEWER
  /* Tune a pair in the Glyph Adjustment Table, pause — the tweak is
     recorded to fonts/kerning-overrides.json by itself so re-imports
     re-apply it. The menu item stays as a manual re-run. */
  /* Saving is not the only moment a pair gets tuned — mostly it isn't the
     moment at all. Typing a number into the Glyph Adjustment Table marks the
     font asset dirty and nothing else, so the save hook below never fired and
     the tweak sat on ONE face: the stroke's Y slid and the fill's Y stayed
     put (owner: "also didn't survive the glyph adjustment"). Inspector edits
     go through Undo, so that is where to listen. Debounced through delayCall
     so a held-down arrow key syncs once, not per keystroke. */
  [InitializeOnLoad]
  static class KitKerningWatch {
    /* Waits for QUIET, not for the next tick. delayCall fires immediately,
       which meant the sync landed in the middle of the maker's interaction
       with the table — while a row was half-entered, or on the very click
       that added one. Every further edit pushes the deadline out, so
       typing a pair, tabbing across and correcting a digit all settle into
       one pass once the hands come off. */
    const double QUIET = 1.5;
    static double dueAt;
    static bool armed;
    static KitKerningWatch() { Undo.postprocessModifications += OnEdit; }
    static UndoPropertyModification[] OnEdit(UndoPropertyModification[] mods) {
      if (mods == null) return mods;
      foreach (var mod in mods) {
        var t = mod.currentValue != null ? mod.currentValue.target : null;
        if (t == null) continue;
#if UNITY_2023_2_OR_NEWER
        if (!(t is TMP_FontAsset)) continue;
        var path = AssetDatabase.GetAssetPath(t);
        if (string.IsNullOrEmpty(path) || !path.Replace("\\\\", "/").Contains("/fonts/KitFace Baked")) continue;
        dueAt = EditorApplication.timeSinceStartup + QUIET;
        if (!armed) { armed = true; EditorApplication.update += Tick; }
        break;
#endif
      }
      return mods;
    }
    static void Tick() {
      if (EditorApplication.timeSinceStartup < dueAt) return;
      EditorApplication.update -= Tick;
      armed = false;
      KitImporter.SyncKerningQuiet();
    }
  }
  class KitKerningAutoSync : UnityEditor.AssetModificationProcessor {
    static string[] OnWillSaveAssets(string[] paths) {
      if (paths == null) return paths;
      foreach (var p in paths) {
        if (p != null && p.EndsWith(".asset") && p.Replace("\\\\", "/").Contains("/fonts/KitFace Baked")) {
          // after the save lands, not during it
          EditorApplication.delayCall += KitImporter.SyncKerningQuiet;
          break;
        }
      }
      return paths;
    }
  }
#endif
  class KitTexturePostprocessor : AssetPostprocessor {
    static readonly Dictionary<string, PBManifest> cache = new Dictionary<string, PBManifest>();
    void OnPreprocessTexture() {
      var path = assetPath.Replace("\\\\", "/");
      /* the baked-face atlas is a TEXTURE with exact glyph rects — sprite
         packing, compression or NPOT rounding would all corrupt it */
      if (path.Contains("UIKitMaker/") && path.Contains("/fonts/kitface-baked") && path.EndsWith(".png")) {
        var bti = (TextureImporter)assetImporter;
        bti.textureType = TextureImporterType.Default;
        bti.mipmapEnabled = false;
        bti.alphaIsTransparency = true;
        bti.textureCompression = TextureImporterCompression.Uncompressed;
        bti.maxTextureSize = 4096;
        bti.npotScale = TextureImporterNPOTScale.None;
        return;
      }
      /* Board backdrops — the maker's own art, possibly 4K originals —
         arrive as single sprites so the board scenes' Background Image can
         hold them. Full quality, no mips, big ceiling. */
      if (path.Contains("UIKitMaker/") && (path.Contains("/backgrounds/") || path.Contains("/boardstamps/"))) {
        var gti = (TextureImporter)assetImporter;
        gti.textureType = TextureImporterType.Sprite;
        gti.spriteImportMode = SpriteImportMode.Single;
        gti.mipmapEnabled = false;
        gti.alphaIsTransparency = true;
        gti.maxTextureSize = 8192;
        return;
      }
      /* Type Stamps — baked styled phrases exported at 4x — land under the
         kit's stamps/ folder and arrive as ready sprites at design size */
      if (path.Contains("UIKitMaker/") && path.Contains("/stamps/")) {
        var sti = (TextureImporter)assetImporter;
        sti.textureType = TextureImporterType.Sprite;
        sti.spriteImportMode = SpriteImportMode.Single;
        sti.mipmapEnabled = false;
        sti.alphaIsTransparency = true;
        sti.textureCompression = TextureImporterCompression.Uncompressed; // hero text: never blocky
        sti.maxTextureSize = 4096;
        var sset = new TextureImporterSettings();
        sti.ReadTextureSettings(sset);
        sset.spritePixelsPerUnit = 400f; // stamps ship at 4x
        sti.SetTextureSettings(sset);
        return;
      }
      var i = path.LastIndexOf("/assets/");
      if (i < 0) return;
      var root = path.Substring(0, i);
      var mPath = root + "/kit-manifest.json";
      PBManifest manifest;
      if (!cache.TryGetValue(mPath, out manifest)) {
        // guarded like ImportKit's parse: a half-extracted or malformed
        // manifest must degrade to "no settings yet" (the delayCall pass
        // self-heals), not one red error per kit texture
        try { manifest = File.Exists(mPath) ? JsonUtility.FromJson<PBManifest>(File.ReadAllText(mPath)) : null; }
        catch (Exception) { manifest = null; }
        cache[mPath] = manifest;
      }
      if (manifest == null || manifest.assets == null) return;
      var rel = path.Substring(root.Length + 1);
      foreach (var a in manifest.assets) {
        if (a.file != rel) continue;
        KitImporter.Configure((TextureImporter)assetImporter, a);
        return;
      }
    }
    /* The manifest arriving (or changing) triggers a full pass — on a fresh
       drop the textures may import before the manifest, so the pass at the
       end of the batch is what makes the first import land configured.
       kit.lock.json is written by the pass itself and deliberately does
       NOT retrigger it. */
    static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom) {
      /* ── the update valet. macOS never merges folders: a re-drop lands as
         "UIKitMaker 1" (Finder AND Unity both suffix on collision) — a
         forked kit, plus a second copy of this very script that would kill
         the editor assembly (CS0101). Any kit manifest arriving under a
         non-canonical UIKitMaker root gets its files copied HOME (byte
         overwrite; the .meta files at home are untouched, so every GUID
         survives) and the duplicate tree removed before its script copy
         compiles. ── */
      bool valeted = false;
      foreach (var p in imported) {
        var norm = p.Replace("\\\\", "/");
        if (!norm.EndsWith("/kit-manifest.json")) continue;
        /* the manifest's GRANDPARENT is the dropped kit root (it holds
           <slug>/ and Editor/). Canonical is Assets/UIKitMaker — anything
           else named like the macOS/Unity suffix forks ("UIKitMaker 1"),
           a nested drop (Assets/UIKitMaker/UIKitMaker) or a zip-wrapper's
           inner UIKitMaker gets relocated. Deliberately RENAMED user
           copies ("UIKitMaker-backup") are left alone: destroying a
           backup is worse than the compile error it causes. */
        var slugDir = Path.GetDirectoryName(norm);
        if (string.IsNullOrEmpty(slugDir)) continue;
        var dupTop = Path.GetDirectoryName(slugDir);
        if (string.IsNullOrEmpty(dupTop)) continue;
        dupTop = dupTop.Replace("\\\\", "/");
        if (dupTop == "Assets/UIKitMaker") continue; // home already
        if (dupTop == "Assets" || !dupTop.StartsWith("Assets/")) continue; // never operate on roots
        if (!System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(dupTop), "^UIKitMaker( \\\\d+)?$")) continue;
        if (!Directory.Exists(dupTop)) continue; // a sibling manifest already valeted this tree
        int relocated = 0;
        try {
          foreach (var f in Directory.GetFiles(dupTop, "*", SearchOption.AllDirectories)) {
            var fp = f.Replace("\\\\", "/");
            if (fp.EndsWith(".meta")) continue;
            var rel = fp.Substring(dupTop.Length + 1);
            var dst = "Assets/UIKitMaker/" + rel;
            var dir = Path.GetDirectoryName(dst);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.Copy(fp, dst, true);
            relocated++;
          }
        } catch (Exception e) {
          Debug.LogWarning("UI Kit Maker: couldn't relocate '" + dupTop + "' automatically (" + e.Message + ") — move its contents into Assets/UIKitMaker by hand, then delete it.");
          continue;
        }
        /* the valet may have just replaced this importer itself — the domain
           reload that follows wipes any queued pass. A session flag survives
           the reload and tells the sweep to re-import EVERY kit; receipts
           stay on disk, so orphan history (I3) survives too (review catch:
           deleting locks silently destroyed deferred-orphan tracking). */
        SessionState.SetBool("PBKitValetPending", true);
        AssetDatabase.DeleteAsset(dupTop);
        // a zip-wrapper husk ("candy-arcade-engine-kit/") left holding nothing
        // gets swept too — but never the canonical folder or Assets itself
        var wrapper = Path.GetDirectoryName(dupTop);
        if (!string.IsNullOrEmpty(wrapper)) {
          wrapper = wrapper.Replace("\\\\", "/");
          try {
            if (wrapper != "Assets" && wrapper != "Assets/UIKitMaker" && Directory.Exists(wrapper)
                && Directory.GetFileSystemEntries(wrapper).Length == 0)
              AssetDatabase.DeleteAsset(wrapper);
          } catch (Exception) { }
        }
        valeted = true;
        Debug.Log("UI Kit Maker: that drop landed at '" + dupTop + "' (folders never merge on drop) — " + relocated + " files were moved home into Assets/UIKitMaker and the duplicate was removed. Drop updates anywhere UIKitMaker-shaped; the kit finds its way.");
      }
      if (valeted) {
        cache.Clear();
        EditorApplication.delayCall += () => { AssetDatabase.Refresh(); KitImporter.Apply(); };
        return;
      }
      foreach (var p in imported) {
        if (!p.EndsWith("kit-manifest.json")) continue;
        cache.Clear();
        EditorApplication.delayCall += KitImporter.Apply;
        return;
      }
    }
  }
}
`;

