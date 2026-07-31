import { useEffect, useMemo, useRef, useState } from "react";
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
  /** Starting value — toggle on/off (1/0), slider/progress fill, segment index. */
  value?: number;
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
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* The glow pad is part of the CANVAS, not the component — pointer honesty
   demands the interactive zone hug the SHELL ("the hit area is way too
   big", owner). data-shell (viewBox units) maps through the on-screen
   scale; pieces without a stamp (custom chrome roots) stay whole-box.
   The slop keeps targets kind to touch without feeling haunted. */
export function shellHit(svgEl: SVGSVGElement | null | undefined, clientX: number, clientY: number, slop = 14): boolean {
  if (!svgEl) return true;
  const stamp = svgEl.getAttribute("data-shell")?.split(" ").map(Number);
  const vb = svgEl.viewBox?.baseVal;
  const r = svgEl.getBoundingClientRect();
  if (!stamp || stamp.length !== 4 || !stamp.every(Number.isFinite) || !vb?.width || !r.width) return true;
  const k = r.width / vb.width;
  const x0 = r.left + (stamp[0] - vb.x) * k - slop;
  const y0 = r.top + (stamp[1] - vb.y) * k - slop;
  return clientX >= x0 && clientX <= x0 + stamp[2] * k + slop * 2 &&
         clientY >= y0 && clientY <= y0 + stamp[3] * k + slop * 2;
}

/** One living piece of art. Design mode: a plain render (click = edit when the
 *  host wires it). Play mode: hover/press states, toggles flip, sliders drag,
 *  segments switch, progress animates, dropdowns open, badges award — every
 *  interaction the component implies, all through the same pure renderer. */
export function LiveArt({ cfg, kit, playing, scale, anchorContent, trim, tight, ambient, shine, className, style, title, onDesignClick, stablePad }: {
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
  const pvalRef = useRef(pval);
  pvalRef.current = pval;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // a piece resting in "disabled" is inert — it never reacts or changes.
  // alt-tone pieces (muted titles) render live but ignore hover and press.
  const disabled = kit?.baseState === "disabled";
  const inert = disabled || kit?.tone === "alt";
  const value = id === "toggle" || id === "checkbox" || id === "radio" || id === "orb" ? (playing && !disabled ? (on ? 1 : 0) : kit?.value)
    // stamped-geometry value pipe: sliders and the settings row drag, the
    // scrollbar thumb drags, menu rows and the dialog's capsules track the
    // pointer, the selector cycles, the wheel follows the pointer's ANGLE
    : id === "slider" || id === "setrow" || id === "scrollbar" || id === "listmenu" || id === "choicelist" || id === "dialog" || id === "equipselector" || id === "weaponwheel" || id === "spinwheel" || id === "emotewheel" ? (playing && !disabled ? val : kit?.value)
    : id === "progress" || id === "segbar" || id === "emblembar" || id === "vsbar" || id === "hotbar" || id === "ring" || id === "starrating" || id === "flipclock" || id === "stopwatch" || id === "timerdigits" || id === "respawn" || id === "speedo" || id === "speedo2" || id === "tacho" ? (playing && !disabled ? pval : kit?.value)
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
    : playing ? (live === "default" ? (kit?.baseState ?? "default") : live)
    : (kit?.baseState ?? "default");

  // hosts pass fresh kit literals every render — key on the fields, not the
  // object, so the (string-building) renderer only runs when something changed
  const kitKey = kit
    ? `${kit.id}|${kit.size ?? "m"}|${kit.shape ?? ""}|${kit.label ?? ""}|${(kit.segments ?? []).join(",")}|${kit.icon ? kit.icon.lib + ":" + kit.icon.name : kit.icon === null ? "none" : ""}|${kit.textOy ?? ""}|${kit.textOx ?? ""}|${kit.dock ? (kit.dock.side ?? "left") + ":" + (kit.dock.icon ? kit.dock.icon.name : kit.dock.icon === null ? "none" : "clock") : ""}|${kit.bar ? JSON.stringify(kit.bar) : ""}|${kit.sub ?? ""}|${kit.max ?? ""}|${kit.addBtn ? 1 : 0}|${kit.overlay ?? ""}|${kit.iconScale ?? ""}|${kit.row ? JSON.stringify(kit.row) : ""}|${kit.kind ?? ""}|${kit.tone ?? ""}|${kit.themedText ? 1 : 0}`
    : "";
  const svg = useMemo(
    () => {
      const raw = kit
        ? renderKit(cfg, kit.id, kit.size ?? "m", state, value, kit.shape, { label: id === "input" ? (typed ?? kit.label) : kit.label, segments: kit.segments, slots: kit.slots, icon: kit.icon, textOy: kit.textOy, textOx: kit.textOx, dock: kit.dock, bar: kit.bar, sub: kit.sub, max: kit.max, addBtn: kit.addBtn, overlay: kit.overlay, iconScale: kit.iconScale, row: kit.row, kind: kit.kind, tone: kit.tone, themedText: kit.themedText, stick: id === "joystick" && playing ? stick : undefined })
        : renderBevel(cfg, state);
      const out = stablePad ? padSvg(raw) : raw;
      return shine ? addShine(out) : out;
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
    const ins = tight ? { t: 27, x: 33, b: 58 } : { t: 14, x: 12, b: 22 };
    return {
      marginTop: -Math.round((pad + ins.t) * s),
      marginRight: -Math.round((pad + ins.x) * s),
      marginBottom: -Math.round((pad + ins.b) * s),
      marginLeft: -Math.round((pad + ins.x) * s),
    };
  }, [trim, scale, pad, shellFree, tight]);

  /* Map a pointer to the control's track using the exact geometry the renderer
     stamped on the svg (viewBox units) — precise at any scale or glow pad. */
  const trackCoord = (e: React.PointerEvent): { u: number; thirds: number } | null => {
    const el = ref.current?.querySelector("svg") as SVGSVGElement | null;
    const track = el?.getAttribute("data-track")?.split(" ").map(Number);
    if (!el || !track || track.length !== 2 || !track[1]) return null;
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
     zero (time is linear) over ~3.2s; the renderer derives the mm:ss
     readout from the value, so the clock visibly ticks down. */
  const playTimer = () => {
    cancelAnimationFrame(raf.current);
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPval(target);
      return;
    }
    setPval(target);
    const t0 = performance.now();
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / 3200);
      setPval(target * (1 - u));
      if (u < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  const isTimer = id === "flipclock" || id === "stopwatch" || id === "timerdigits" || id === "respawn";
  const isGauge = id === "speedo" || id === "speedo2" || id === "tacho"; // clicking revs / replays it

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
    if (!ambient || (id !== "progress" && id !== "segbar" && id !== "vsbar" && id !== "hotbar" && id !== "ring" && !isTimer && !isGauge) || !playing || !inView) return;
    // first beat lands FAST — gallery cards must move as they appear, not a
    // leisurely beat later. Staggered so a wall of cards wakes as a wave,
    // not a drill team.
    const kick = window.setTimeout(isTimer ? playTimer : playProgress, 350 + Math.random() * 900);
    const t = window.setInterval(isTimer ? playTimer : playProgress, beat.current);
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
    if ((kit?.label ?? "").toUpperCase().includes("CLAIM") || id === "pack") fireBurst();
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
  // the hit test the handlers share: the shell, not the glow-padded canvas
  const hit = (e: { clientX: number; clientY: number }) => shellHit(ref.current?.querySelector("svg"), e.clientX, e.clientY);
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

  const anchorStyle = trimStyle ?? (anchorContent && pad > 0 ? { marginLeft: -pad, marginTop: -pad } : undefined);
  // choice controls render pinned to their resting pose — the hover answer
  // is a light-up on the wrapper (brightness), never a re-render that grows
  const choice = id === "checkbox" || id === "radio" || id === "toggle" || id === "orb";
  const choiceHover = playing && !inert && choice
    ? { transition: "filter .16s ease", filter: live !== "default" ? "brightness(1.14) saturate(1.05)" : "none" }
    : undefined;
  // draggable pieces own their gestures — a slider drag must never pan the page
  const gestureStyle = id === "slider" || id === "setrow" || id === "segment" || id === "joystick" || id === "weaponwheel" || vtracked ? { touchAction: "none" as const } : undefined;
  return (
    <div ref={ref} className={`${shellFree ? `${className ?? ""} kp-shellfree` : className ?? ""}${burst ? " fx-igniting" : ""}`} title={title}
      style={{ ...style, ...(width !== undefined ? { width } : {}), ...anchorStyle, ...gestureStyle, ...choiceHover }}
      {...(playing ? playHandlers
        : onDesignClick ? {
            onClick: onDesignClick, role: "button", tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDesignClick(); } },
          } : {})}
      dangerouslySetInnerHTML={{ __html: svg + burstHtml }} />
  );
}
