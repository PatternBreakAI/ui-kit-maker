import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GenConfig, GenStateName, IconDef, KitComponentId, KitSize, Shape } from "@/generator/model";
import { addShine, renderBevel, renderKit, padSvg } from "@/generator/bevel";

/** What a piece of live art is: the master button (no kit), or one kit
 *  component with optional per-instance overrides. */
export interface LiveKit {
  id: KitComponentId;
  size?: KitSize;
  shape?: Shape;
  label?: string;
  /** Chosen slot values (unit choices etc) — see KIT_SLOTS. */
  slots?: Record<string, string>;
  segments?: string[];
  icon?: IconDef | null;
  /** A maker's own uploaded picture for this piece (round 73) — already
   *  resolved to a url by kitPicOf; absent means draw the icon. */
  pic?: { href: string; w: number; h: number } | null;
  /** Starting value — toggle on/off (1/0), slider/progress fill, segment index. */
  value?: number;
  /** Horizontal 9-slice stretch for the bar family — see KitOpts.stretch. */
  stretch?: number;
  /** Vertical 9-slice stretch — blank panels; see KitOpts.stretchY. */
  stretchY?: number;
  /** Resting state when idle — e.g. an awarded badge or an open dropdown. */
  baseState?: GenStateName;
  /** Per-component vertical text adjustment (explicit; 0 is valid). */
  textOy?: number;
  textOx?: number;
  dock?: { icon?: IconDef | null; side?: "left" | "right" } | null;
  bar?: { segments?: number; gap?: number; snap?: boolean };
  /** Mobile-game piece slots: secondary label, /max value, add button,
   *  stackable status overlay. */
  sub?: string;
  max?: string;
  addBtn?: boolean;
  overlay?: string;
  /** Slot icon emphasis — >1 makes the icon the star of the tile. */
  iconScale?: number;
  /** Explicit type theming exists for this piece (fork or text color) —
   *  plain-ink instrument readouts switch to the full type treatment. */
  themedText?: boolean;
  /** Data-row content model (see KitOpts.row). */
  row?: import("@/generator/store").RowCfg;
  /** Container variant for panels (circle / oval / dialogue strip). */
  kind?: "circle" | "oval" | "strip";
  /** Alt tone — muted material; the piece ignores hover and press. */
  tone?: "alt";
  /** The ground this instance is standing on, when it is NOT the artboard
   *  (see KitOpts.onDark). Hosts that place pieces on the user's artboard —
   *  the editor canvas, the Board's stage — leave it alone and the renderer
   *  reads cfg.canvas as it always has. The kit SHEET is app furniture and
   *  passes its own theme, so the marks a piece draws outside its shell
   *  answer the page they sit on rather than the kit's stage colour. */
  onDark?: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* How long a timer's drain runs, and how long its end state holds before
   the piece returns to its documented pose. Time is linear either way, so
   the number that changes is the DURATION, and each instrument gets the
   one its own fiction asks for rather than a shared constant:
     · the service ticket counts SECONDS, and its last quarter is the
       alarm — a tense, brisk gesture, held a moment on overdue;
     · the match clock is a clock, so it keeps the family's steady tick;
     · the chest compresses HOURS and has a real payoff at zero (OPEN!,
       with the aura and the radiating ticks), so it runs the longest and
       holds that payoff long enough to read.
   Anything not listed keeps the 3.2s the family has always used. */
const DRAIN_DEFAULT = { ms: 3200, hold: 420 };
const DRAIN_SPAN: Record<string, { ms: number; hold: number }> = {
  orderticket: { ms: 2600, hold: 560 },
  scorebug: { ms: 3600, hold: 420 },
  chest: { ms: 4600, hold: 1000 },
};

/* ── the stillness rule (owner: "most things should be user initiated") ──
   The engine bakes SMIL loops into ~30 components (damage floats, radar
   pulses, carets, liquid waves…). Left alone they run EVERYWHERE, all the
   time — dozens of idle timelines ticking behind a design surface. So:
   every host freezes its SMIL clocks unless the surface is actually in
   Play. Frozen clocks park at a settled beat — 1.2s in — because loops
   that fade in from nothing (the damage number) are blank at t=0. */
export function stillSmil(root: ParentNode | null, still: boolean) {
  if (!root) return;
  for (const el of root.querySelectorAll("svg")) {
    const s = el as SVGSVGElement;
    if (!s.querySelector("animate, animateTransform, animateMotion")) continue;
    try {
      if (still) { s.pauseAnimations(); s.setCurrentTime(1.2); }
      else if (s.animationsPaused()) s.unpauseAnimations();
    } catch { /* engines without SMIL control: the loop just runs */ }
  }
}

/** PNG rasterization can't be left to SMIL timing — Chrome snapshots
 *  whatever instant the internal clock is at, and a fade-in loop's t=0 is
 *  nothing at all. Exports strip the loops and keep the resting pose
 *  (every template's base attributes ARE the settled look). */
export const stripSmil = (svg: string): string =>
  svg.replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, "")
    .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, "");

/* The glow pad is part of the CANVAS, not the component — pointer honesty
   demands the interactive zone hug the SHELL ("the hit area is way too
   big", owner). data-shell (viewBox units) maps through the on-screen
   scale; pieces without a stamp (custom chrome roots) stay whole-box.
   The slop keeps targets kind to touch without feeling haunted. */
export function shellHit(svgEl: SVGSVGElement | null | undefined, clientX: number, clientY: number, slop = 14): boolean {
  if (!svgEl) return true;
  const stamp = svgEl.getAttribute("data-shell")?.split(" ").map(Number);
  if (!stamp || stamp.length !== 4 || !stamp.every(Number.isFinite)) return true;
  return shellRectHit(svgEl, stamp, clientX, clientY, slop);
}

/** shellHit for RASTER art — a warped stamp or big-glyph <img> whose
 *  data-shell is stamped in the img's own width/height units. Same
 *  contract: no usable stamp answers true (whole-box). */
export function imgShellHit(imgEl: HTMLImageElement | null | undefined, clientX: number, clientY: number, slop = 14): boolean {
  if (!imgEl) return true;
  const stamp = imgEl.getAttribute("data-shell")?.split(" ").map(Number);
  const iw = parseFloat(imgEl.getAttribute("width") ?? "0");
  if (!stamp || stamp.length !== 4 || !stamp.every(Number.isFinite) || !iw) return true;
  const r = imgEl.getBoundingClientRect();
  if (!r.width) return true;
  const k = r.width / iw;
  const x0 = r.left + stamp[0] * k - slop;
  const y0 = r.top + stamp[1] * k - slop;
  return clientX >= x0 && clientX <= x0 + stamp[2] * k + slop * 2 &&
         clientY >= y0 && clientY <= y0 + stamp[3] * k + slop * 2;
}

/** The mapping half of shellHit, for an EXPLICIT shell rect (viewBox
 *  units) — so a caller can test a REMEMBERED shell against the current
 *  render instead of the one stamped on it. */
export function shellRectHit(svgEl: SVGSVGElement | null | undefined, stamp: number[], clientX: number, clientY: number, slop = 14): boolean {
  if (!svgEl) return true;
  const vb = svgEl.viewBox?.baseVal;
  const r = svgEl.getBoundingClientRect();
  if (!vb?.width || !r.width) return true;
  const k = r.width / vb.width;
  const x0 = r.left + (stamp[0] - vb.x) * k - slop;
  const y0 = r.top + (stamp[1] - vb.y) * k - slop;
  return clientX >= x0 && clientX <= x0 + stamp[2] * k + slop * 2 &&
         clientY >= y0 && clientY <= y0 + stamp[3] * k + slop * 2;
}

/** Detach every node that would pollute an art getBBox — the play helpers
 *  appended at the svg root (hit pad, focus ring) and the shine/idle-wipe
 *  band addShine injects INSIDE the lift group. The band's rect is drawn a
 *  full viewBox above/below the canvas and one band-width left of it,
 *  hidden only by a clip-path — and getBBox ignores clip paths (Chromium
 *  also honors the band's parked CSS sweep transform), so a hug measured
 *  with the band present read the off-canvas band as art and turned every
 *  reclaim into huge positive margins (the enormous-empty-Fields bug).
 *  Returns a restore that puts each node back in its EXACT spot: the band
 *  lives inside the lift group, so a naive appendChild would re-parent it
 *  to the root and break the lift stacking. Restore replays in REVERSE
 *  document order — adjacent detached siblings re-chain cleanly (the
 *  earlier one's remembered next-sibling IS the later one). */
export function detachBBoxNoise(el: SVGSVGElement): () => void {
  const noise = [...el.querySelectorAll(":scope > rect[data-hitpad], :scope > g[data-focusring], rect.kit-shine")]
    .map((node) => ({ node, parent: node.parentNode, next: node.nextSibling }));
  for (const s of noise) s.node.remove();
  return () => {
    for (let i = noise.length - 1; i >= 0; i--) noise[i].parent?.insertBefore(noise[i].node, noise[i].next);
  };
}

/** One living piece of art. Design mode: a plain render (click = edit when the
 *  host wires it). Play mode: hover/press states, toggles flip, sliders drag,
 *  segments switch, progress animates, dropdowns open, badges award — every
 *  interaction the component implies, all through the same pure renderer. */
export function LiveArt({ cfg, kit, playing, scale, anchorContent, trim, tight, snug, hug, ambient, shine, className, style, title, onDesignClick, stablePad, stillLoops, onArt }: {
  cfg: GenConfig;
  kit?: LiveKit;
  playing: boolean;
  /** Display scale — 1 renders at the SVG's natural pixel size. */
  scale?: number;
  /** Reserve the full glow pad even while glow is 0 (padSvg) — the editor
   *  hero passes this so Design ↔ Play keep an identical box. */
  stablePad?: boolean;
  /** Anchor the shell, not the glow pad: pulls the art up-left by the pad so
   *  top-left-positioned hosts (the board) keep their saved layouts. */
  anchorContent?: boolean;
  /** Dense-grid trim: reclaim the FULL fixed insets, not the conservative
   *  share — gem boards want tiles nearly touching. */
  tight?: boolean;
  /** trim to the SHELL's exact box (read from data-shell0) — for flat
      board tiles that butt edge-to-edge; the depth/shadow allowance
      below the shell is empty on a flat render and the static insets
      left rows floating apart */
  snug?: boolean;
  /** Measured hug, both axes — reference specimens (the kit page's Fields
   *  section): the canvas reserves the SLIDERS' full travel below the
   *  shell (extrusion cap + four-sigma shadow room), so a specimen box
   *  can run hundreds of px past its painted art and captions float away
   *  ("dead space", owner). Hug MEASURES the rendered art (getBBox — the
   *  type-specimen crop discipline: measure, re-measure when fonts land)
   *  and reclaims the difference with margins. The crop PINS per content
   *  key so state re-renders never resize the box (the hitbox-jitter
   *  precedent), and art drawn PAST the canvas (the open dropdown's menu
   *  on a shadow-free kit) GROWS the box instead of colliding with
   *  captions — the old fixed 86px reservation under-measured that menu
   *  at size L and over-measured it whenever the shadow reserve already
   *  contained it. Glows are allowed past the crop: overflow stays
   *  visible and light overlaps like it would on a real screen. */
  hug?: boolean;
  /** Screen-composition mode: reclaim the invisible canvas around the shell
   *  (glow pad + fixed insets) with computed negative margins, so pieces
   *  stack at believable interface rhythm at any display scale. The glow
   *  still draws — it just overlaps neighbours like it would on a real
   *  screen instead of reserving blank layout space. */
  trim?: boolean;
  /** Progress bars quietly re-fill on their own — the page breathes. */
  ambient?: boolean;
  /** Specular shine band sweeping across the component face on a loop —
   *  the motion-asset treatment. CSS drives (and reduced-motion stops) it. */
  shine?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  onDesignClick?: () => void;
  /** Reference surfaces (the kit page): the piece stays hover-playable,
   *  but its SMIL loops park while the pointer is elsewhere — motion is
   *  user-initiated, never ambient. */
  stillLoops?: boolean;
  /** The rendered art's intrinsic geometry — width/height and the
   *  data-shell stamp — parsed from the svg STRING in a layout effect
   *  the moment the memoized svg changes. Hosts that draw measured
   *  overlays (the Board's selection box) key off this instead of
   *  observing the DOM: same numbers, no observer race, no stale
   *  window between a render and the next animation frame. shell is
   *  null when the art carries no data-shell stamp (shell-free pieces)
   *  — the host keeps its own fallback for those. */
  onArt?: (art: { w: number; h: number; shell: [number, number, number, number] | null }) => void;
}) {
  const id = kit?.id;
  const [live, setLive] = useState<GenStateName>("default");
  const [on, setOn] = useState((kit?.value ?? 1) > 0.5);            // toggle
  // dialog rests on CLAIM (left capsule) unless the host says otherwise
  const [val, setVal] = useState(clamp01(kit?.value ?? (kit?.id === "dialog" ? 0 : 0.62))); // slider / tracked pieces
  const [pval, setPval] = useState(clamp01(kit?.value ?? 0.62));    // progress
  const [sel, setSel] = useState(Math.round(kit?.value ?? 1));      // segment
  const [typed, setTyped] = useState<string | null>(null);          // input
  const [editing, setEditing] = useState(false);                    // input focus
  const [open, setOpen] = useState(kit?.baseState === "pressed");   // dropdown / badge award
  const [stick, setStick] = useState<[number, number]>([0, 0]);  // joystick
  const stickDrag = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const sliding = useRef(false);
  const raf = useRef(0);
  /* Countdown IN FLIGHT. The progress family pins pval at mount, which a
     resting sweep instrument must not inherit: off the clock the cooldown
     and the buff frame keep reading their configured value, so the Value
     dial still steers them live and their resting art is exactly what it
     has always been. */
  const [ticking, setTicking] = useState(false);
  const expire = useRef(0);
  const drain = (id && DRAIN_SPAN[id]) || DRAIN_DEFAULT;
  const pvalRef = useRef(pval);
  pvalRef.current = pval;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => () => { cancelAnimationFrame(raf.current); window.clearTimeout(expire.current); }, []);

  // a piece resting in "disabled" is inert — it never reacts or changes.
  // alt-tone pieces (muted titles) render live but ignore hover and press.
  const disabled = kit?.baseState === "disabled";
  const inert = disabled || kit?.tone === "alt";
  const value = id === "toggle" || id === "checkbox" || id === "radio" || id === "orb" ? (playing && !disabled ? (on ? 1 : 0) : kit?.value)
    // stamped-geometry value pipe: sliders and the settings row drag, the
    // scrollbar thumb drags, menu rows and the dialog's capsules track the
    // pointer, the selector cycles, the wheel follows the pointer's ANGLE
    : id === "slider" || id === "setrow" || id === "scrollbar" || id === "listmenu" || id === "choicelist" || id === "dialog" || id === "equipselector" || id === "weaponwheel" || id === "spinwheel" || id === "emotewheel" ? (playing && !disabled ? val : kit?.value)
    : id === "progress" || id === "segbar" || id === "emblembar" || id === "vsbar" || id === "hotbar" || id === "ring" || id === "starrating" || id === "flipclock" || id === "stopwatch" || id === "timerdigits" || id === "respawn" || id === "speedo" || id === "speedo2" || id === "tacho" || id === "compass" ? (playing && !disabled ? pval : kit?.value)
    // the sweep instruments and the readout clocks run off the clock only
    // WHILE the clock runs — at rest they are the piece the page has always
    // documented, and their Value dial still steers them live
    : id === "cooldown" || id === "buffframe" || id === "orderticket" || id === "chest" || id === "scorebug"
      ? (playing && !disabled && ticking ? pval : kit?.value)
    : id === "segment" ? (playing && !disabled ? sel : kit?.value)
    : kit?.value;

  // dropdown-open and badge-awarded override the pointer state; a piece's
  // authored baseState is its RESTING state even while the page is alive
  const held = (id === "dropdown" || id === "badge") && (playing ? open : kit?.baseState === "pressed");
  const state: GenStateName = disabled ? "disabled"
    : held ? "pressed"
    : id === "input" && editing ? "hover" // focused input shows the caret
    // switches light up when flipped, they never grow — hover/press stays off
    // checkboxes, toggles and radios so the value change IS the feedback
    : id === "checkbox" || id === "toggle" || id === "radio" || id === "orb" ? (kit?.baseState ?? "default")
    /* while alive, the open flag is the SOLE authority for a badge/dropdown
       resting pose — falling back to an authored baseState of "pressed"
       after a click-off left rest=star while rollover drew the count face
       (the owner's "ghost rollover": hover swapped faces, not styling) */
    : (id === "dropdown" || id === "badge") && playing ? (live === "default" ? "default" : live)
    : playing ? (live === "default" ? (kit?.baseState ?? "default") : live)
    : (kit?.baseState ?? "default");

  // hosts pass fresh kit literals every render — key on the fields, not the
  // object, so the (string-building) renderer only runs when something changed.
  // label undefined (stock words) and label "" (deliberately wordless — the
  // kitNoText flag) are DIFFERENT renders: the sentinel keeps their keys apart
  // or flipping "No text" on an unworded piece would never re-render.
  const kitKey = kit
    ? `${kit.id}|${kit.size ?? "m"}|${kit.shape ?? ""}|${kit.label ?? "\u0000"}|${(kit.segments ?? []).join(",")}|${kit.icon ? kit.icon.lib + ":" + kit.icon.name : kit.icon === null ? "none" : ""}|${kit.textOy ?? ""}|${kit.textOx ?? ""}|${kit.dock ? (kit.dock.side ?? "left") + ":" + (kit.dock.icon ? kit.dock.icon.name : kit.dock.icon === null ? "none" : "clock") : ""}|${kit.bar ? JSON.stringify(kit.bar) : ""}|${kit.sub ?? ""}|${kit.max ?? ""}|${kit.addBtn ? 1 : 0}|${kit.overlay ?? ""}|${kit.iconScale ?? ""}|${kit.row ? JSON.stringify(kit.row) : ""}|${kit.kind ?? ""}|${kit.tone ?? ""}|${kit.themedText ? 1 : 0}|${kit.stretch ?? ""}|${kit.stretchY ?? ""}|${kit.slots ? JSON.stringify(kit.slots) : ""}|${kit.onDark === undefined ? "" : kit.onDark ? 1 : 0}`
    : "";
  const svg = useMemo(
    () => {
      const raw = kit
        ? renderKit(cfg, kit.id, kit.size ?? "m", state, value, kit.shape, { label: id === "input" ? (typed ?? kit.label) : kit.label, segments: kit.segments, slots: kit.slots, icon: kit.icon, pic: kit.pic, textOy: kit.textOy, textOx: kit.textOx, dock: kit.dock, bar: kit.bar, sub: kit.sub, max: kit.max, addBtn: kit.addBtn, overlay: kit.overlay, iconScale: kit.iconScale, row: kit.row, kind: kit.kind, tone: kit.tone, themedText: kit.themedText, onDark: kit.onDark, stretch: kit.stretch, stretchY: kit.stretchY, stick: id === "joystick" && playing ? stick : undefined })
        : renderBevel(cfg, state);
      const out = stablePad ? padSvg(raw) : raw;
      // the document's own idle wipe joins the host-driven shine — same
      // clipped, staggered glint either way; the edge line already rides
      // inside the render (the renderer draws it beside the face layers)
      return shine || cfg.idle?.wipe ? addShine(out, cfg.idle?.wipe ? { dur: cfg.idle?.freq, sweep: cfg.idle?.wipeDur, width: cfg.idle?.wipeWidth, armed: cfg.idle?.trigger === "hover", blend: cfg.idle?.blend } : undefined) : out;
    },
    [cfg, kitKey, state, value, shine, stablePad, id === "joystick" ? stick : null, id === "input" ? typed : null] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // natural width × scale — uniform physical scale across every piece, so a
  // chip and a header sit in true proportion on the guideline page
  const width = useMemo(() => {
    if (scale === undefined) return undefined;
    const m = svg.match(/width="([\d.]+)"/);
    return m ? +m[1] * scale : undefined;
  }, [svg, scale]);

  /* the onArt report — string-parsed from the same memoized svg the DOM is
     about to show, in a LAYOUT effect so the host's overlay state lands in
     the same paint as the art it measures. The ref keeps a fresh callback
     without re-reporting on every parent render. */
  const onArtRef = useRef(onArt);
  onArtRef.current = onArt;
  useLayoutEffect(() => {
    const cb = onArtRef.current;
    if (!cb) return;
    const w = parseFloat(svg.match(/width="([\d.]+)"/)?.[1] ?? "0");
    const h = parseFloat(svg.match(/height="([\d.]+)"/)?.[1] ?? "0");
    const raw = svg.match(/data-shell="([-\d.eE ]+)"/)?.[1]?.split(" ").map(Number);
    const shell = raw && raw.length === 4 && raw.every(Number.isFinite)
      ? (raw as [number, number, number, number]) : null;
    if (w && h) cb({ w, h, shell });
  }, [svg]);

  // the glow pad the renderer added — read back from the viewBox origin
  const pad = useMemo(() => {
    if (!anchorContent && !trim) return 0;
    const m = svg.match(/viewBox="(-?[\d.]+)/);
    return m ? -+m[1] : 0;
  }, [svg, anchorContent, trim]);

  /* Screen-composition trim: the renderer's canvas = glow pad + x/y margins
     + depth-and-shadow allowance below the shell. Reclaim the pad exactly
     plus a conservative share of the fixed insets (top ~14, sides ~12,
     bottom ~22 viewBox units — the bottom keeps room for extrusion depth
     and the cast shadow), all at display scale. Shells then stack at real
     UI rhythm while glows draw freely over the gaps. */
  // shell-free pieces (reticles, hearts, big numbers, the overlay stick)
  // render edge-to-edge on their own canvas — no pad exists to reclaim,
  // and trimming them collides art with neighbours and captions
  const shellFree = !!kit && (kit.id === "reticle" || kit.id === "lives" || kit.id === "bignum" ||
    (kit.id === "joystick" && kit.overlay === "ghost"));
  const trimStyle = useMemo(() => {
    if (!trim || scale === undefined || shellFree) return undefined;
    const s = scale;
    if (snug) {
      const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
      const sh0 = /data-shell0="([-\d. ]+)"/.exec(svg);
      if (vb && sh0) {
        const [bx, by, bw2, bh] = sh0[1].split(" ").map(Number);
        const contentW = +vb[3] - pad * 2, contentH = +vb[4] - pad * 2;
        return {
          marginTop: -Math.round((pad + by) * s),
          marginRight: -Math.round((pad + (contentW - bx - bw2)) * s),
          marginBottom: -Math.round((pad + (contentH - by - bh)) * s),
          marginLeft: -Math.round((pad + bx) * s),
        };
      }
    }
    const ins = tight ? { t: 27, x: 33, b: 58 } : { t: 14, x: 12, b: 22 };
    return {
      marginTop: -Math.round((pad + ins.t) * s),
      marginRight: -Math.round((pad + ins.x) * s),
      marginBottom: -Math.round((pad + ins.b) * s),
      marginLeft: -Math.round((pad + ins.x) * s),
    };
  }, [trim, scale, pad, shellFree, tight, snug, svg]);

  /* measured hug — see the prop note. The margins come from the RESTING
     render (the first render for a content key IS the resting pose) and
     pin there: a hover lift or a click-toggled menu must never resize the
     layout box mid-interaction. Fonts can settle after the first measure
     (the Art crop precedent), so loadingdone forces one honest re-run. */
  const [hugStyle, setHugStyle] = useState<React.CSSProperties | undefined>(undefined);
  const hugKey = useRef<string | null>(null);
  const hugSvg = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!hug || trim || scale === undefined) return;
    const key = `${kitKey}|${scale}`;
    const el = ref.current?.querySelector("svg") as SVGSVGElement | null;
    if (!el) return;
    const measure = (force = false) => {
      if (!force && hugKey.current === key) return;
      /* a FORCED re-run (fonts landing) is honest only for the pose the
         pin was computed from — re-pinning off a transient pose (the open
         dropdown clicked closed mid-session) left a stale crop when the
         resting pose returned, and the menu ate the caption below */
      if (force && hugKey.current === key && hugSvg.current !== svg) return;
      try {
        const vb = el.viewBox.baseVal;
        if (!vb?.width || !vb.height) return;
        // measure the ART alone — the injected hit/focus helpers pad past
        // the shell and would loosen the crop (and unevenly: inert pieces
        // carry no hitpad), and the shine/wipe band parks off-canvas under
        // a clip that getBBox ignores (see detachBBoxNoise)
        const restore = detachBBoxNoise(el);
        let bb: DOMRect;
        try { bb = el.getBBox(); } finally { restore(); }
        if (!bb.height) return;
        /* breathing room in viewBox units: the shadow's blur tail below,
           a whisper on the other sides. getBBox reads geometry, not
           filter spread, so the bottom allowance covers the cast
           shadow's blur reach. Each side is measured on its own — art
           drawn PAST the canvas (an open menu, a wide overhang) turns
           that side's reclaim into growth, so captions and neighbours
           always clear the real render. */
        const aT = 12, aB = 20, aX = 12;
        const m = (v: number) => -Math.round(v * scale);
        setHugStyle({
          marginTop: m(bb.y - vb.y - aT),
          marginBottom: m(vb.y + vb.height - (bb.y + bb.height) - aB),
          marginLeft: m(bb.x - vb.x - aX),
          marginRight: m(vb.x + vb.width - (bb.x + bb.width) - aX),
          /* the horizontal reclaim narrows the FLEX CELL, and the class
             max-width:100% would then re-resolve against that narrower
             cell and shrink the art itself — a feedback loop that scaled
             pieces down instead of cropping air. Hug crops AIR only: the
             art keeps its true size and its glow margin overlaps
             neighbours, exactly like the trim modes. */
          maxWidth: "none",
        });
        hugKey.current = key;
        hugSvg.current = svg;
      } catch { /* not laid out yet */ }
    };
    measure();
    const fonts = document.fonts;
    const onDone = () => measure(true);
    fonts?.addEventListener?.("loadingdone", onDone);
    const late = window.setTimeout(() => measure(true), 800);
    return () => { fonts?.removeEventListener?.("loadingdone", onDone); window.clearTimeout(late); };
  }, [hug, trim, scale, kitKey, svg]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Map a pointer to the control's track using the exact geometry the renderer
     stamped on the svg (viewBox units) — precise at any scale or glow pad. */
  const trackCoord = (e: React.PointerEvent): { u: number; thirds: number } | null => {
    const el = ref.current?.querySelector("svg") as SVGSVGElement | null;
    const track = el?.getAttribute("data-track")?.split(" ").map(Number);
    // round 44: bar stamps may carry a vertical band (x w y h) for the
    // export rig — the pointer math keeps reading the horizontal pair
    if (!el || !track || track.length < 2 || !track[1]) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    const vb = el.viewBox.baseVal;
    const cx = vb.x + ((e.clientX - r.left) / r.width) * vb.width;
    const t = (cx - track[0]) / track[1];
    return { u: clamp01(t), thirds: Math.max(0, Math.min(2, Math.floor(t * 3))) };
  };

  /* Same mapping on the VERTICAL axis — scrollbars drag their thumb, list
     menus track the row under the pointer, all from stamped geometry. */
  const vtrackCoord = (e: React.PointerEvent): number | null => {
    const el = ref.current?.querySelector("svg") as SVGSVGElement | null;
    const track = el?.getAttribute("data-vtrack")?.split(" ").map(Number);
    if (!el || !track || track.length !== 2 || !track[1]) return null;
    const r = el.getBoundingClientRect();
    if (!r.height) return null;
    const vb = el.viewBox.baseVal;
    const cy = vb.y + ((e.clientY - r.top) / r.height) * vb.height;
    return clamp01((cy - track[0]) / track[1]);
  };
  // rows highlight under a resting pointer; the scrollbar needs a real drag
  const vtracked = id === "scrollbar" || id === "listmenu" || id === "choicelist";

  /* Weapon wheel: the pointer's ANGLE around the stamped hub, as a
     fraction of a turn measured clockwise from the TOP (the hammer). */
  const wheelCoord = (e: React.PointerEvent): number | null => {
    const el = ref.current?.querySelector("svg") as SVGSVGElement | null;
    const hub = el?.getAttribute("data-wheel")?.split(" ").map(Number);
    if (!el || !hub || hub.length !== 2) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    const vb = el.viewBox.baseVal;
    const px = vb.x + ((e.clientX - r.left) / r.width) * vb.width;
    const py = vb.y + ((e.clientY - r.top) / r.height) * vb.height;
    const a = Math.atan2(py - hub[1], px - hub[0]); // -PI..PI, 0 = east
    return ((a + Math.PI / 2) / (Math.PI * 2) + 1) % 1;
  };

  /* Value tween — the motion engine behind the revolver spin and the
     carousel glide. Targets may run outside 0..1 (shortest modular path);
     every frame lands normalized. */
  const valRef = useRef(val);
  valRef.current = val;
  const tweenVal = (target: number, dur: number, mode: "out" | "inout" | "western") => {
    cancelAnimationFrame(raf.current);
    const from = valRef.current;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVal(((target % 1) + 1) % 1);
      return;
    }
    const t0 = performance.now();
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / dur);
      // "western": a heavy cylinder — slow wind-up, weighty travel, a small
      // overshoot clunk as it seats (easeOutBack)
      const c1 = 1.70158;
      const e2 = mode === "out" ? 1 - (1 - u) ** 3
        : mode === "western" ? 1 + (c1 + 1) * (u - 1) ** 3 + c1 * (u - 1) ** 2
        : (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
      setVal((((from + (target - from) * e2) % 1) + 1) % 1);
      if (u < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  /* Progress demo playback — resets to 0, then fills to the component's own
     configured value over ~1.2s. Clicking mid-animation restarts cleanly;
     reduced-motion users jump straight to the target. */
  const target = clamp01(kit?.value ?? 0.62);
  const playProgress = () => {
    cancelAnimationFrame(raf.current);
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPval(target);
      return;
    }
    if (id === "tacho") {
      // v67: the rev meter REDLINES — slam past the red threshold, hold with
      // a violent needle oscillation, then fall back to the resting value
      const redT = Math.max(target, 0.94);
      const t0r = performance.now();
      const stepR = (t: number) => {
        const dt = t - t0r;
        if (dt < 850) { const u = dt / 850; setPval(redT * (1 - (1 - u) ** 3)); raf.current = requestAnimationFrame(stepR); }
        else if (dt < 2700) { setPval(clamp01(redT - 0.02 + Math.sin(dt * 0.09) * 0.028 + (Math.random() - 0.5) * 0.05)); raf.current = requestAnimationFrame(stepR); }
        else if (dt < 3300) { const u = (dt - 2700) / 600; setPval(redT + (target - redT) * (1 - (1 - u) ** 2)); raf.current = requestAnimationFrame(stepR); }
        else setPval(target);
      };
      setPval(0);
      raf.current = requestAnimationFrame(stepR);
      return;
    }
    setPval(0);
    const t0 = performance.now();
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / 1200);
      const e = 1 - (1 - u) ** 3;
      setPval(target * e);
      if (u < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  /* Timer demo playback — refills to the target, then drains LINEARLY to
     zero (time is linear) over the piece's own span; the renderer derives
     the readout from the value, so the clock visibly ticks down. */
  const playTimer = () => {
    cancelAnimationFrame(raf.current);
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPval(target);
      return;
    }
    setTicking(true);
    setPval(target);
    const t0 = performance.now();
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / drain.ms);
      setPval(target * (1 - u));
      if (u < 1) raf.current = requestAnimationFrame(step);
      // a beat at empty so the end state reads — "expired", or the chest's
      // OPEN! — then the piece hands the clock back to its configured pose
      // (playCompass's return-to-rest)
      else expire.current = window.setTimeout(() => setTicking(false), drain.hold);
    };
    raf.current = requestAnimationFrame(step);
  };
  const isTimer = id === "flipclock" || id === "stopwatch" || id === "timerdigits" || id === "respawn"
    /* the two SWEEP instruments join the timer family (owner: "the buff
       frame and the cooldown radial should animate when clicked in the
       kit"). Both already derive their whole time story from `value` —
       the radial's spent sector and lit tick crown, the buff's clockwise
       sweep, and both seconds readouts — so the family's existing
       click→drain playback is the whole behavior: no new timeline, no
       loop, and nothing the exporter can see (pval is app-only state; the
       SVG download and every export path read the STORE's value). */
    || id === "cooldown" || id === "buffframe"
    /* …and the three READOUT clocks (owner: "do the three timers too").
       Same story again: value already IS the time on each of them — the
       ticket's countdown bar and its 72s, the chest's 6h 24m plate, the
       score bug's match clock — so they inherit the family's playback
       rather than growing timelines of their own. (buildqueue is NOT
       here: its "0:42" is a fixed string the renderer never derives from
       value, so it would need renderer work before a clock could drive
       it.) */
    || id === "orderticket" || id === "chest" || id === "scorebug";
  const isGauge = id === "speedo" || id === "speedo2" || id === "tacho"; // clicking revs / replays it

  /* Compass demo playback — the needle swings off its heading and settles
     back the way a real compass does: a damped wobble, never a refill. */
  const playCompass = () => {
    cancelAnimationFrame(raf.current);
    const rest = clamp01(kit?.value ?? 0.08);
    const wrap = (x: number) => ((x % 1) + 1) % 1;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPval(rest);
      return;
    }
    const amp = 0.06 + Math.random() * 0.09;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const t0 = performance.now();
    const step = (t: number) => {
      const u = (t - t0) / 2800;
      if (u >= 1) { setPval(rest); return; }
      const e = Math.exp(-3.1 * u);
      setPval(wrap(rest + dir * amp * Math.sin(u * Math.PI * 3.2) * e));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  // Ambient pieces only breathe while actually on screen. Every animation
  // frame re-renders the piece and regenerates its full SVG — dozens of
  // offscreen demos beating at once turned the whole kit page into a
  // permanent ~10 commits/sec churn, idle or scrolling ("insane amount of
  // re-rendering", outside profiling report).
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ambient progress: bars, rings, timers and gauges quietly replay on their own beat
  const beat = useRef(4600 + Math.random() * 2400);
  useEffect(() => {
    if (!ambient || (id !== "progress" && id !== "segbar" && id !== "vsbar" && id !== "hotbar" && id !== "ring" && id !== "compass" && !isTimer && !isGauge) || !playing || !inView) return;
    // first beat lands FAST — gallery cards must move as they appear, not a
    // leisurely beat later. Staggered so a wall of cards wakes as a wave,
    // not a drill team.
    const play = isTimer ? playTimer : id === "compass" ? playCompass : playProgress;
    const kick = window.setTimeout(play, 350 + Math.random() * 900);
    const t = window.setInterval(play, beat.current);
    return () => { window.clearTimeout(kick); window.clearInterval(t); cancelAnimationFrame(raf.current); };
  }, [ambient, id, playing, inView]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Activation runs on pointerup, NOT on click. State changes swap the svg's
     innerHTML between pointerdown and pointerup, which detaches the browser's
     click target — a native `click` never fires. The wrapper div is stable,
     so pointerup on it is the reliable activation signal. */
  const pressedHere = useRef(false);
  const [burst, setBurst] = useState(0);
  /* claim celebration: white-hot ignition then a themed particle burst —
     colors come from the kit's own effect wells, never stock confetti */
  const burstHtml = burst ? `<span class="fx-burstwrap" aria-hidden="true">` + Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.31;
    const dist = 58 + ((i * 37) % 92);
    const c = [cfg.effects.Bevel ?? "#59A7C9", cfg.effects.Glow ?? "#8FF0FF", cfg.effects.Highlight ?? "#FFFFFF"][i % 3];
    const s = 5 + ((i * 13) % 8);
    return `<i style="--dx:${(Math.cos(a) * dist).toFixed(0)}px;--dy:${(Math.sin(a) * dist).toFixed(0)}px;width:${s}px;height:${s}px;background:${c}"></i>`;
  }).join("") + `</span>` : "";
  const fireBurst = () => {
    setBurst(Date.now());
    window.setTimeout(() => setBurst(0), 1200);
  };
  const activate = (e: React.PointerEvent) => {
    // the gift box IS a claim — opening it earns the ignition (owner:
    // "supposed to have the claim explosion to white"). The check reads the
    // EFFECTIVE label — per-instance word, else the kit-wide one the renderer
    // actually draws — so a flame button whose visible words say CLAIM
    // celebrates however the label was set; the Claim button piece always does.
    if ((kit?.label ?? cfg.content.label ?? "").toUpperCase().includes("CLAIM") || id === "pack" || id === "gifticon" || id === "claimbtn") fireBurst();
    // the combo numeral EXPLODES on click (owner ask): the claim burst's
    // particles plus a punchy scale pop on the art itself
    if (id === "combo") fireBurst();
    if (id === "input") { setEditing(true); if (typed === null) setTyped(kit?.label ?? ""); (e.currentTarget as HTMLElement).focus?.(); }
    else if (id === "toggle" || id === "checkbox" || id === "radio" || id === "orb") setOn((v) => !v);
    else if (id === "dropdown" || id === "badge") setOpen((v) => !v);
    else if (id === "progress" || id === "segbar" || id === "emblembar" || id === "vsbar" || id === "hotbar" || id === "ring" || id === "starrating" || isGauge) playProgress();
    else if (isTimer) playTimer();
    else if (id === "segment") {
      const c = trackCoord(e);
      if (c) setSel(c.thirds);
    }
    else if (id === "emotewheel") {
      // emotes are FAST: click selects the sector under the pointer, no spin
      const p = wheelCoord(e);
      if (p !== null) setVal((Math.floor(p * 6) + 0.5) / 6);
    }
    else if (id === "spinwheel") {
      // the fortune throw: 2-3 turns, long decelerating settle
      tweenVal(valRef.current + 2 + (Math.floor(Math.random() * 8) + 0.5) / 8, 2600, "out");
    }
    else if (id === "weaponwheel") {
      // the revolver spins on CLICK: the clicked chamber rides the cylinder
      // around (the slow way) and seats at the 2 o'clock hammer
      const p = wheelCoord(e);
      if (p !== null) {
        const n = 6, v = valRef.current;
        const chamber = ((Math.round((p - v) * n) % n) + n) % n;
        const t0 = ((1 / n - chamber / n) % 1 + 1) % 1;
        const cand = [t0 - 1, t0, t0 + 1].reduce((a2, b2) => (Math.abs(b2 - v) < Math.abs(a2 - v) ? b2 : a2));
        tweenVal(cand, 780, "western");
      }
    }
    else if (id === "equipselector") {
      // carousel: click left of the armed socket → previous, right → next —
      // and the items GLIDE there (hardware-picker motion)
      const c = trackCoord(e);
      const dir = c && c.u < 0.42 ? -1 : 1;
      const settled = Math.round(valRef.current * 3) / 3;
      tweenVal(settled + dir / 3, 420, "inout");
    }
  };
  /* The hit test the handlers share: the shell, not the glow-padded
     canvas — and a STABLE shell. Each state renders its own svg, and the
     hover state's lift moves the drawn shell up: hit-testing only the
     current stamp let the hitbox slide out from under a cursor parked
     near an edge, which un-hovered, dropped the art back, re-hovered —
     jitter (dev field report: "the hitbox shifts when hovering, moving
     out from under the mouse"). The default state's shell is remembered
     and unioned in, so the region that granted a state never stops
     granting it — the browser twin of the Unity raycast pads. */
  const defShell = useRef<number[] | null>(null);
  useEffect(() => {
    if (live !== "default") return;
    const stamp = ref.current?.querySelector("svg")?.getAttribute("data-shell")?.split(" ").map(Number);
    if (stamp?.length === 4 && stamp.every(Number.isFinite)) defShell.current = stamp;
  });
  const hit = (e: { clientX: number; clientY: number }) => {
    const svg = ref.current?.querySelector("svg");
    return shellHit(svg, e.clientX, e.clientY) ||
      (live !== "default" && !!defShell.current && shellRectHit(svg, defShell.current, e.clientX, e.clientY));
  };
  const playHandlers = inert ? {} : {
    onPointerEnter: (e: React.PointerEvent) => { if (hit(e)) setLive(e.buttons === 1 ? "pressed" : "hover"); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.buttons !== 1) { setLive("default"); sliding.current = false; } pressedHere.current = false; },
    onPointerDown: (e: React.PointerEvent) => {
      if (!hit(e)) return; // the pad isn't pressable
      pressedHere.current = true;
      setLive("pressed");
      if (id === "joystick") {
        sliding.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        stickDrag.current = { x: e.clientX, y: e.clientY, sx: stick[0], sy: stick[1] };
      }
      if (id === "slider" || id === "setrow") {
        sliding.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const c = trackCoord(e);
        if (c) setVal(c.u);
      }
      if (id === "scrollbar") {
        sliding.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const u = vtrackCoord(e);
        if (u !== null) setVal(u);
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      /* entering through the pad and gliding onto the shell (or off it)
         never re-fires pointerenter — track hover here, but never fight an
         active press or drag */
      if (!sliding.current && !pressedHere.current) {
        const inside = hit(e);
        setLive((l) => (inside ? (l === "default" ? "hover" : l) : (l === "hover" ? "default" : l)));
      }
      if ((id === "slider" || id === "setrow") && sliding.current) {
        const c = trackCoord(e);
        if (c) setVal(c.u);
      }
      // the dialog's capsules arm under the pointer — left CLAIM, right LATER
      if (id === "dialog" && !sliding.current && hit(e)) {
        const c = trackCoord(e);
        if (c) setVal(c.u);
      }
      if (id === "scrollbar" && sliding.current) {
        const u = vtrackCoord(e);
        if (u !== null) setVal(u);
      }
      // menus track the pointer with no press — every row is rollover-able
      if ((id === "listmenu" || id === "choicelist") && !sliding.current && hit(e)) {
        const u = vtrackCoord(e);
        if (u !== null) setVal(u);
      }
      if (id === "joystick" && sliding.current && stickDrag.current) {
        // relative drag mapped through the stamped travel radius — exact at
        // any display scale, no absolute geometry needed
        const el = ref.current?.querySelector("svg") as SVGSVGElement | null;
        const stamp = el?.getAttribute("data-stick")?.split(" ").map(Number);
        const r = el?.getBoundingClientRect();
        if (!el || !stamp || !r?.width) return;
        const pxPerUnit = r.width / el.viewBox.baseVal.width;
        const maxPx = stamp[2] * pxPerUnit;
        if (!maxPx) return;
        const d = stickDrag.current;
        const nx = d.sx + (e.clientX - d.x) / maxPx;
        const ny = d.sy + (e.clientY - d.y) / maxPx;
        const mag = Math.hypot(nx, ny), f = mag > 1 ? 1 / mag : 1;
        setStick([nx * f, ny * f]);
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      setLive("hover");
      const wasDrag = sliding.current;
      sliding.current = false;
      if (id === "joystick") { stickDrag.current = null; setStick([0, 0]); }
      if (pressedHere.current && !wasDrag) activate(e);
      pressedHere.current = false;
    },
    onPointerCancel: () => { setLive("default"); sliding.current = false; pressedHere.current = false; if (id === "joystick") { stickDrag.current = null; setStick([0, 0]); } },
    // focusing on mousedown can scroll a partially-visible element into view —
    // suppress it; keyboard users still reach pieces through tab order
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    // keyboard operation for the stateful pieces
    ...(id === "input" ? {
      role: "textbox" as const,
      tabIndex: 0,
      "aria-label": "Type into the input",
      onFocus: () => setEditing(true),
      onBlur: () => setEditing(false),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (!editing && e.key.length === 1) { setEditing(true); if (typed === null) setTyped(kit?.label ?? ""); }
        if (e.key === "Backspace") { e.preventDefault(); setTyped((t) => (t ?? kit?.label ?? "").slice(0, -1)); }
        else if (e.key === "Escape" || e.key === "Enter") { (e.currentTarget as HTMLElement).blur(); }
        else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          // the renderer stamps how many characters fit the text-safe zone
          const cap = Number(ref.current?.querySelector("svg")?.getAttribute("data-maxchars")) || 24;
          setTyped((t) => ((t ?? kit?.label ?? "") + e.key).slice(0, Math.min(cap, 40)));
        }
      },
    } : id === "toggle" ? {
      role: "switch" as const,
      "aria-checked": on,
      tabIndex: 0,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOn((v) => !v); }
      },
    } : id === "progress" || id === "segbar" || id === "ring" || isTimer ? {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": isTimer ? "Restart the timer" : "Play progress demo",
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (isTimer ? playTimer : playProgress)(); }
      },
    } : {}),
  };

  // the stillness rule: this piece's SMIL clocks run only while the host
  // surface is in Play — a design surface holds a settled frame. On
  // stillLoops surfaces the pointer is the switch: loops wake under it.
  useEffect(() => {
    stillSmil(ref.current, !playing || disabled || (!!stillLoops && live === "default"));
  }, [svg, playing, disabled, stillLoops, live]);

  useEffect(() => {
    if (id !== "input") return;
    const root = ref.current?.querySelector("svg");
    const caret = root?.querySelector("[data-caret]");
    const val = root?.querySelector("[data-value]") as SVGGraphicsElement | null;
    if (!root || !caret || !val) return;
    try {
      const b = val.getBBox();
      if (b.width > 0) caret.setAttribute("x", (b.x + b.width + 6).toFixed(1));
    } catch { /* not laid out yet */ }
  }, [svg, id]);

  /* Pointer honesty while ALIVE (field notes #3: pieces "invisibly block
     clicks on others" / "the hitbox shifts when hovering"): the padded
     canvas must never be the hit surface. When the render carries a shell
     stamp, the root and svg go pointer-transparent and a PAINT-FREE hit
     rect — the current shell UNIONED with the remembered default shell,
     plus the touch slop — is injected into the svg with pointer-events
     re-enabled on itself alone. Inside the union the browser targets this
     subtree (handlers fire by bubbling, capture still owns drags); outside
     it, events fall through to whatever really sits beneath — no relays,
     the browser's own hit-testing does the work. An OPEN dropdown/badge
     draws its menu outside the shell, so those keep the whole canvas hot
     while open, exactly as before; pieces without a stamp keep the old
     whole-box behavior. */
  const passThrough = playing && !inert && /data-shell="/.test(svg)
    && !((id === "dropdown" || id === "badge") && open);
  useLayoutEffect(() => {
    if (!playing) return;
    const svgEl = ref.current?.querySelector("svg");
    if (!svgEl) return;
    svgEl.querySelector(":scope > rect[data-hitpad]")?.remove();
    const stamp = svgEl.getAttribute("data-shell")?.split(" ").map(Number);
    if (!passThrough || !stamp || stamp.length !== 4 || !stamp.every(Number.isFinite)) {
      svgEl.style.pointerEvents = "";
      return;
    }
    const d = defShell.current;
    const x0 = d ? Math.min(stamp[0], d[0]) : stamp[0];
    const y0 = d ? Math.min(stamp[1], d[1]) : stamp[1];
    const x1 = d ? Math.max(stamp[0] + stamp[2], d[0] + d[2]) : stamp[0] + stamp[2];
    const y1 = d ? Math.max(stamp[1] + stamp[3], d[1] + d[3]) : stamp[1] + stamp[3];
    const vb = svgEl.viewBox?.baseVal;
    const r = svgEl.getBoundingClientRect();
    const slop = vb?.width && r.width ? 14 * (vb.width / r.width) : 14;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("data-hitpad", "1");
    rect.setAttribute("x", (x0 - slop).toFixed(1));
    rect.setAttribute("y", (y0 - slop).toFixed(1));
    rect.setAttribute("width", (x1 - x0 + slop * 2).toFixed(1));
    rect.setAttribute("height", (y1 - y0 + slop * 2).toFixed(1));
    rect.setAttribute("fill", "none");
    rect.setAttribute("pointer-events", "fill");
    svgEl.appendChild(rect);
    svgEl.style.pointerEvents = "none";
  }, [svg, playing, passThrough, live]);

  /* Focus honesty (owner: the HOVER/FOCUS input specimen grew "a hard
     rectangular outline running through the cell"): the focusable pieces
     (input, toggle, progress) take the UA focus-visible ring on the
     WRAPPER — the canvas box, whose invisible full-travel reserves run far
     past the painted art, so the ring reads as a broken frame crossing
     neighbouring cells. The ring must hug the ART: when the render
     carries a shell stamp, the UA outline is suppressed and a rounded
     double-stroke ring (dark halo under a light line — legible on any
     face or stage) is injected at the shell union, the same stable
     geometry the hitpad trusts. Pieces without a stamp keep the UA ring:
     a wrong box beats no indicator. */
  const [focusV, setFocusV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      let v = false;
      try { v = el.matches(":focus-visible"); } catch { v = document.activeElement === el; }
      setFocusV(v);
    };
    const off = () => setFocusV(false);
    el.addEventListener("focusin", read);
    el.addEventListener("focusout", off);
    return () => { el.removeEventListener("focusin", read); el.removeEventListener("focusout", off); };
  }, []);
  const shellStamped = /data-shell="/.test(svg);
  useLayoutEffect(() => {
    const svgEl = ref.current?.querySelector("svg");
    if (!svgEl) return;
    svgEl.querySelector(":scope > g[data-focusring]")?.remove();
    if (!focusV || !shellStamped) return;
    const stamp = svgEl.getAttribute("data-shell")?.split(" ").map(Number);
    if (!stamp || stamp.length !== 4 || !stamp.every(Number.isFinite)) return;
    // union with the remembered default shell — the ring never hops when a
    // state's lift moves the drawn shell (the hitbox-jitter precedent)
    const d = defShell.current;
    const x0 = d ? Math.min(stamp[0], d[0]) : stamp[0];
    const y0 = d ? Math.min(stamp[1], d[1]) : stamp[1];
    const x1 = d ? Math.max(stamp[0] + stamp[2], d[0] + d[2]) : stamp[0] + stamp[2];
    const y1 = d ? Math.max(stamp[1] + stamp[3], d[1] + d[3]) : stamp[1] + stamp[3];
    const vb = svgEl.viewBox?.baseVal;
    const r = svgEl.getBoundingClientRect();
    const uz = vb?.width && r.width ? vb.width / r.width : 1; // px → viewBox units
    const padU = 8 * uz;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("data-focusring", "1");
    g.setAttribute("pointer-events", "none");
    for (const [stroke, w2, op] of [["#10121C", 4 * uz, "0.55"], ["#FFFFFF", 2 * uz, "0.95"]] as const) {
      const rc = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rc.setAttribute("x", (x0 - padU).toFixed(1));
      rc.setAttribute("y", (y0 - padU).toFixed(1));
      rc.setAttribute("width", (x1 - x0 + padU * 2).toFixed(1));
      rc.setAttribute("height", (y1 - y0 + padU * 2).toFixed(1));
      rc.setAttribute("rx", (12 * uz + padU).toFixed(1));
      rc.setAttribute("fill", "none");
      rc.setAttribute("stroke", stroke);
      rc.setAttribute("stroke-width", w2.toFixed(1));
      rc.setAttribute("opacity", op);
      g.appendChild(rc);
    }
    svgEl.appendChild(g);
  }, [svg, focusV, shellStamped]);
  const anchorStyle = trimStyle ?? hugStyle ?? (anchorContent && pad > 0 ? { marginLeft: -pad, marginTop: -pad } : undefined);
  // choice controls render pinned to their resting pose — the hover answer
  // is a light-up on the wrapper (brightness), never a re-render that grows
  const choice = id === "checkbox" || id === "radio" || id === "toggle" || id === "orb";
  const choiceHover = playing && !inert && choice
    ? { transition: "filter .16s ease", filter: live !== "default" ? "brightness(1.14) saturate(1.05)" : "none" }
    : undefined;
  // draggable pieces own their gestures — a slider drag must never pan the page
  const gestureStyle = id === "slider" || id === "setrow" || id === "segment" || id === "joystick" || id === "weaponwheel" || vtracked ? { touchAction: "none" as const } : undefined;
  return (
    <div ref={ref} className={`${shellFree ? `${className ?? ""} kp-shellfree` : className ?? ""}${burst ? " fx-igniting" : ""}${burst && id === "combo" ? " fx-combopop" : ""}`} title={title}
      style={{ ...style, ...(width !== undefined ? { width } : {}), ...anchorStyle, ...gestureStyle, ...choiceHover,
        /* explicit both ways: "none" hands the canvas to the hit rect,
           "auto" reclaims the box even under a pointer-transparent host
           (the Board's play stage) */
        ...(playing && !inert ? { pointerEvents: passThrough ? ("none" as const) : ("auto" as const) } : {}),
        // the injected shell ring replaces the UA box ring (see above)
        ...(focusV && shellStamped ? { outline: "none" } : {}) }}
      {...(playing ? playHandlers
        : onDesignClick ? {
            onClick: onDesignClick, role: "button", tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDesignClick(); } },
          } : {})}
      dangerouslySetInnerHTML={{ __html: svg + burstHtml }} />
  );
}
