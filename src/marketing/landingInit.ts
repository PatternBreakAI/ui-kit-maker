// @ts-nocheck
/* Approved front-door behavior, generated from the design artifact.
   Runs against the REAL engine (deps.engine) and the app router/auth
   (deps.navigate / deps.openAuth). All document/window listeners bind
   through FD_ON with an AbortSignal so unmounting the landing cleans up. */
export interface LandingDeps {
  engine: unknown;
  assets: { strategy: string; tavern: string; fps: string };
  navigate: (to: string) => void;
  openAuth: () => void;
  signal: AbortSignal;
}
export function initLanding(deps: LandingDeps) {
  const FD_ON = (target, ev, fn, opts) =>
    target.addEventListener(ev, fn, { ...(typeof opts === "object" && opts ? opts : {}), signal: deps.signal });

      
      const root = document.documentElement;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // DARK is the product default (same fallback as shell/theme.ts) —
      // OS preference no longer overrides it; light is an explicit choice.
      let savedTheme = null;
      try { savedTheme = localStorage.getItem("ui-generator-theme"); } catch (_) {}
      root.dataset.theme = savedTheme === "light" ? "light" : "dark";

      const themeToggle = document.getElementById("themeToggle");
      const syncThemeLabel = () => themeToggle.setAttribute("aria-label",
        `Switch to ${root.dataset.theme === "dark" ? "light" : "dark"} theme`);
      syncThemeLabel();
      themeToggle.addEventListener("click", () => {
        root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
        try { localStorage.setItem("ui-generator-theme", root.dataset.theme); } catch (_) {}
        syncThemeLabel();
      });

      const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
      const hexToRgb = (hex) => {
        const c = hex.replace("#", "");
        const v = parseInt(c.length === 3 ? c.split("").map(x => x + x).join("") : c, 16);
        return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
      };
      const rgbToHex = ({ r, g, b }) => "#" + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
      const mix = (hex, target, amt) => {
        const a = hexToRgb(hex), b = hexToRgb(target);
        return rgbToHex({ r: a.r + (b.r - a.r) * amt, g: a.g + (b.g - a.g) * amt, b: a.b + (b.b - a.b) * amt });
      };

      /* ── design state ── */
      /* ═══ HERO PRESET LINEUP — the one place to recast the hero ═══
         Picker ids: retro-diner · hard-candy · royal-vault · citrus-pop ·
         comic-pop · deep-ocean · grape-jelly · glacier-tech · sakura-arcade ·
         toy-box · mint-cream · neon-versus · hero-chisel · forest-sprite ·
         obsidian-ember · bubble-pop
         Authored full designs: prefix with "auth:" (auth:grape-jelly,
         auth:neon-versus, auth:citrus-pop, auth:bubble-pop, auth:wager,
         auth:schweetheart, auth:oopsie, auth:nope-yep).
         Reel entries may append a
         label after "|", e.g. "hard-candy|PLAY". Chip colors and names
         derive from each preset automatically. Resolution and the
         label/font adoption rules live in ONE place — playDesign, below
         — and are documented in docs/front-door.md. */
      const HERO_SWATCHES = ["grape-jelly", "bubble-pop", "deep-ocean", "hard-candy", "forest-sprite", "citrus-pop", "hero-chisel", "glacier-tech"];
      const HERO_REEL = ["auth:grape-jelly", "hard-candy|PLAY", "auth:schweetheart", "auth:neon-versus", "auth:oopsie", "auth:citrus-pop", "auth:bubble-pop", "auth:nope-yep", "auth:wager"];
      /* Every face the reel/chips can ask for must be self-hosted in
         landing.css — scripts/check-landing-fonts.mjs fails the build
         on a missing or orphaned face. warmFont below is the runtime
         net for faces no build check can know (hero feed, a preset
         authored after the last freeze). */
      const FONT_CHIPS = ["Russo One", "Fredoka", "Lilita One", "Bungee"];

      const PAL = HERO_SWATCHES.map((pid) => {
        const pr = deps.engine.presetById(pid);
        return { name: pr.name, color: pr.effects["Inner Fill"] || "#A855F7", pid };
      });
      const PATTERNS = {
        None:    { css: "none", size: "12px 12px", svg: null },
        Stripes: { css: "repeating-linear-gradient(122deg, rgba(255,255,255,.5) 0 4px, transparent 4px 11px)", size: "auto",
                   svg: (id) => `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect width="4" height="12" fill="rgba(255,255,255,.5)"/></pattern>` },
        Dots:    { css: "radial-gradient(rgba(255,255,255,.55) 1.5px, transparent 2px)", size: "10px 10px",
                   svg: (id) => `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="rgba(255,255,255,.55)"/></pattern>` },
        Stars:   { css: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'><path d='m9 2.5 1.5 3.8 4 .3-3 2.5 1 3.9L9 10.9 5.5 13l1-3.9-3-2.5 4-.3z' fill='rgba(255,255,255,.5)'/></svg>")`, size: "18px 18px",
                   svg: (id) => `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse"><path d="m9 2.5 1.5 3.8 4 .3-3 2.5 1 3.9L9 10.9 5.5 13l1-3.9-3-2.5 4-.3z" fill="rgba(255,255,255,.5)"/></pattern>` },
        Checker: { css: "repeating-conic-gradient(rgba(255,255,255,.4) 0 25%, transparent 0 50%)", size: "14px 14px",
                   svg: (id) => `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="rgba(255,255,255,.4)"/><rect x="8" y="8" width="8" height="8" fill="rgba(255,255,255,.4)"/></pattern>` }
      };
      const PATTERN_NAMES = Object.keys(PATTERNS);

      /* ── THE REAL ENGINE — same renderer the app ships ── */
      const E = deps.engine;
      const deepMergeE = (base, over) => { for (const k of Object.keys(over)) {
        if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) && over[k] && typeof over[k] === "object" && !Array.isArray(over[k])) deepMergeE(base[k], over[k]);
        else base[k] = over[k]; } return base; };
      const authoredCfg = (id) => deepMergeE(E.defaultConfig(), JSON.parse(JSON.stringify(E.AUTHORED[id])));
      /* owner-designated community heroes (fetched after first paint) —
         full GenConfigs keyed "hero:<name>", applied like authored recipes */
      const HERO_CFGS = {};
      const heroCfg = (key) => deepMergeE(E.defaultConfig(), JSON.parse(JSON.stringify(HERO_CFGS[key])));
      /* Reads the face straight off each cfg — the next authored preset
         needs no change here. Self-hosted faces are already declared in
         landing.css, so those skip; anything else pulls through the
         editor's Google-Fonts loader (E.ensureFont, idempotent). */
      const warmFont = (name) => {
        if (!name || typeof name !== "string") return;
        for (const ff of document.fonts) if (ff.family.replace(/["']/g, "") === name) return;
        try { E.ensureFont && E.ensureFont(name); } catch (_) { /* a face that won't load just falls back */ }
      };
      /* crop the render's viewBox to its shell so buttons display LARGE */
      const tighten = (svg, pad = 34) => { const m = /data-shell="([-\d. ]+)"/.exec(svg); if (!m) return svg;
        const [sx, sy, sw, sh] = m[1].split(" ").map(Number);
        return svg.replace(/width="[^"]*"/, `width="${Math.round(sw + pad * 2)}"`)
                  .replace(/height="[^"]*"/, `height="${Math.round(sh + pad * 2)}"`)
                  .replace(/viewBox="[^"]*"/, `viewBox="${(sx - pad).toFixed(1)} ${(sy - pad).toFixed(1)} ${(sw + pad * 2).toFixed(1)} ${(sh + pad * 2).toFixed(1)}"`); };
      const PAT_MAP = { None: "none", Stripes: "stripes", Dots: "dots", Stars: "stars", Checker: "checker" };
      const PAT_BACK = { none: "None", stripes: "Stripes", dots: "Dots", stars: "Stars", checker: "Checker" };
      const SHAPE_STOPS = ["sharp", "chamfer", "round", "pill"];
      const stopShape = (r) => SHAPE_STOPS[Math.min(SHAPE_STOPS.length - 1, Math.floor(r / 25.001))];
      const shName = (id) => ((E.SHAPES.find((s) => s.id === id) || { name: id }).name.split(" ")[0] || id).toUpperCase();
      const engCfg = () => { const c = design.cfg;
        c.shape = design.shapeOv || stopShape(design.round);
        c.candy.gloss.on = design.shine > 3; c.candy.gloss.opacity = design.shine;
        if (design.pattern != null && PAT_MAP[design.pattern] !== undefined) c.candy.pattern.type = PAT_MAP[design.pattern];
        if (design.font) c.type.font = design.font;
        if (design.extr != null) c.candy.extrusion.depth = design.extr;
        if (design.tcol) { c.type.fillMode = "solid"; c.type.fill = design.tcol; }
        else if (design.tfill0) { c.type.fillMode = design.tfill0.mode; c.type.fill = design.tfill0.fill; c.type.fill2 = design.tfill0.fill2; }
        c.content.label = design.label || "PLAY";
        return c; };
      const drawMaster = (st) => { const c = engCfg(); masterSvg.innerHTML = E.addShine(tighten(E.renderShell(c, st || "default", 470, 128, { label: c.content.label }), 46)); };
      /* style-swap glitch: clone the outgoing render before the swap, then
         tear it away in RGB-split slices over the incoming one */
      let ghostSrc = null;
      const glitchPrep = () => {
        const sv = masterSvg.querySelector("svg");
        ghostSrc = sv && !reduceMotion ? sv.cloneNode(true) : null;
      };
      const glitchMaster = () => {
        if (!ghostSrc) return;
        masterSvg.querySelectorAll(".m-ghost").forEach((g) => g.remove());
        ["a", "b"].forEach((k) => {
          const g = document.createElement("div");
          g.className = "m-ghost m-ghost--" + k;
          g.appendChild(ghostSrc.cloneNode(true));
          g.addEventListener("animationend", () => g.remove(), { once: true });
          masterSvg.appendChild(g);
        });
        const sv = masterSvg.querySelector("svg");
        if (sv) { sv.classList.add("m-in"); setTimeout(() => sv.classList.remove("m-in"), 240); }
        setTimeout(() => masterSvg.querySelectorAll(".m-ghost").forEach((g) => g.remove()), 320);
        ghostSrc = null;
      };
      const renderRk = (el) => { const v = el.dataset.v;
        el.innerHTML = tighten(E.renderKit(engCfg(), el.dataset.kid, el.dataset.sz || "m", el.dataset.st || "default",
          v !== undefined && v !== "" ? +v : undefined), 22);
        if (el.dataset.auto) { const s2 = el.firstElementChild; if (s2) {
          const w2 = +s2.getAttribute("width") || 100, h2 = +s2.getAttribute("height") || 50, r2 = w2 / h2;
          el.style.width = (r2 > 4 ? 168 : r2 > 2.2 ? 140 : r2 > 1.2 ? 104 : 66) + "px"; } } };
      const wireStates = (s) => { if (!s) return;
        s.style.cursor = "pointer";
        s.addEventListener("pointerenter", () => { s.dataset.st = "hover"; renderRk(s); });
        s.addEventListener("pointerleave", () => { s.dataset.st = "default"; renderRk(s); });
        s.addEventListener("pointerdown", () => { s.dataset.st = "pressed"; renderRk(s); });
        s.addEventListener("pointerup", () => { s.dataset.st = "hover"; renderRk(s); }); };
      const wireFlip = (s) => { if (!s) return; s.style.cursor = "pointer";
        s.addEventListener("click", () => { s.dataset.v = s.dataset.v === "1" ? "0" : "1"; renderRk(s); }); };

      const design = { color: PAL[0].color, name: PAL[0].name, round: 42, shine: 58, pattern: "None", label: "LET’S GO", cfg: null, shapeOv: null };
      design.cfg = E.applyPresetFull(E.defaultConfig(), PAL[0].pid);
      design.pid = PAL[0].pid;
      const syncFromCfg = () => { const c = design.cfg;
        design.shapeOv = c.shape;
        design.shine = Math.round(c.candy.gloss.opacity);
        design.pattern = PAT_BACK[c.candy.pattern.type] || null;
        design.font = c.type.font;
        design.extr = Math.round(c.candy.extrusion.depth);
        design.tcol = null;
        design.tfill0 = { mode: c.type.fillMode, fill: c.type.fill, fill2: c.type.fill2 };
      };
      syncFromCfg();
      let userControlled = false, kitFilled = false, uid = 0, railState = "default";

      /* ── SVG silhouette: softened chamfer driven by roundness ── */
      const roundedPoly = (pts, q) => {
        let d = "";
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
          const v1 = { x: p1.x - p0.x, y: p1.y - p0.y }, v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
          const l1 = Math.hypot(v1.x, v1.y) || 1, l2 = Math.hypot(v2.x, v2.y) || 1;
          const t1 = Math.min(q, l1 / 2), t2 = Math.min(q, l2 / 2);
          const a = { x: p1.x - v1.x / l1 * t1, y: p1.y - v1.y / l1 * t1 };
          const b = { x: p1.x + v2.x / l2 * t2, y: p1.y + v2.y / l2 * t2 };
          d += (i === 0 ? `M${a.x.toFixed(1)} ${a.y.toFixed(1)}` : `L${a.x.toFixed(1)} ${a.y.toFixed(1)}`);
          d += `Q${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        }
        return d + "Z";
      };
      const chamferPath = (w, h, r01, inset = 0) => {
        const W = w - inset * 2, H = h - inset * 2, o = inset;
        const c = (0.34 - 0.26 * r01) * H;
        const q = 1.5 + Math.pow(r01, 1.6) * (H / 2 - c * 0.4);
        return roundedPoly([
          { x: o + c, y: o }, { x: o + W - c, y: o }, { x: o + W, y: o + c },
          { x: o + W, y: o + H - c }, { x: o + W - c, y: o + H }, { x: o + c, y: o + H },
          { x: o, y: o + H - c }, { x: o, y: o + c }
        ], q);
      };
      const componentSvg = (w, h, d) => {
        const id = "cx" + (uid++);
        const hi = mix(d.color, "#ffffff", .40 + (d.shine / 100) * .14);
        const hi2 = mix(d.color, "#ffffff", .16);
        const lo = mix(d.color, "#000000", .36);
        const ex = mix(d.color, "#000000", .58);
        const r01 = d.round / 100;
        const outer = chamferPath(w, h, r01);
        const inner = chamferPath(w, h, r01, Math.max(4, h * 0.075));
        // app kits carry pattern ids this map never learns (halftone, the
        // gothic tiles…) — unknown reads render solid instead of crashing
        // the whole page ("Something glitched", owner report 2026-08-06)
        const pat = PATTERNS[d.pattern] || PATTERNS.None;
        const patDef = pat.svg ? pat.svg(id + "p") : "";
        const exH = Math.max(4, h * 0.085);
        return `<svg width="${w}" height="${h + exH}" viewBox="0 0 ${w} ${h + exH}" aria-hidden="true">
          <defs>
            <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${d.color}"/><stop offset="1" stop-color="${lo}"/>
            </linearGradient>
            <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${hi2}"/><stop offset="1" stop-color="${mix(d.color, "#000000", .16)}"/>
            </linearGradient>
            <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="rgba(255,255,255,${(0.14 + d.shine / 100 * 0.62).toFixed(2)})"/>
              <stop offset="1" stop-color="rgba(255,255,255,0)"/>
            </linearGradient>
            <clipPath id="${id}c"><path d="${outer}"/></clipPath>
            <clipPath id="${id}ci"><path d="${inner}"/></clipPath>
            ${patDef}
          </defs>
          <path d="${outer}" transform="translate(0 ${exH})" fill="${ex}"/>
          <path d="${outer}" fill="url(#${id}s)"/>
          ${pat.svg ? `<rect width="${w}" height="${h}" clip-path="url(#${id}c)" fill="url(#${id}p)" opacity=".28"/>` : ""}
          <path d="${inner}" fill="url(#${id}f)" opacity=".92"/>
          ${pat.svg ? `<rect width="${w}" height="${h}" clip-path="url(#${id}ci)" fill="url(#${id}p)" opacity=".22"/>` : ""}
          <rect width="${w}" height="${h * 0.46}" clip-path="url(#${id}ci)" fill="url(#${id}g)"/>
          <path d="${inner}" fill="none" stroke="rgba(255,255,255,.30)" stroke-width="1"/>
          <path d="${outer}" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="1.2"/>
        </svg>`;
      };

      /* ── DOM ── */
      const $ = (id) => document.getElementById(id);
      const masterSvg = $("masterSvg"), masterLabelEl = $("masterLabelEl"), masterWrap = $("masterWrap");
      const stStatus = $("stStatus");
      const roundR = $("roundR"), shineR = $("shineR"), roundVal = $("roundVal"), shineVal = $("shineVal");
      const labelIn = $("labelIn"), kitScroll = $("kitScroll"), kitHint = $("kitHint");
      const pushBtn = $("pushBtn"), pushLabel = $("pushLabel"), kitReady = $("kitReady");
      const systemRound = $("systemRound"), systemRoundValue = $("systemRoundValue"), bigDial = $("bigDial");

      { const tpl = document.getElementById("randTpl"), row = document.getElementById("actRow");
        const rst = document.createElement("button");
        rst.type = "button"; rst.className = "rand-btn"; rst.id = "resetBtn";
        rst.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 10a8 8 0 1 1 2 6"/><path d="M4 16v-6h6"/></svg> RESET';
        row.appendChild(rst);
        row.appendChild(tpl.content.firstElementChild);
      }
      const palWrap = $("palette2");
      PAL.forEach((p, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "sw2";
        b.style.setProperty("--sw-hi", mix(p.color, "#ffffff", .35));
        b.style.setProperty("--sw-lo", mix(p.color, "#000000", .25));
        b.setAttribute("aria-label", p.name);
        b.setAttribute("aria-pressed", String(i === 0));
        /* Authored-first, like the gallery's galCfgFor: a preset with a
           full authored design plays that design, not the plain recipe. */
        b.addEventListener("click", () => { takeOver();
          playDesign({ pid: E.AUTHORED[p.pid] ? "auth:" + p.pid : p.pid, color: p.color, name: p.name }); });
        palWrap.appendChild(b);
      });
      const patWrap = $("patTiles");
      PATTERN_NAMES.forEach((n) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "pat-tile"; b.dataset.pat = n;
        b.setAttribute("aria-label", `Pattern: ${n}`);
        b.setAttribute("aria-pressed", String(n === design.pattern));
        const i = document.createElement("i");
        if (PATTERNS[n].css !== "none") {
          i.style.setProperty("--tile-pat", PATTERNS[n].css);
          i.style.setProperty("--tile-size", PATTERNS[n].size === "auto" ? "auto" : PATTERNS[n].size);
        }
        b.appendChild(i);
        b.insertAdjacentHTML("beforeend", `<b>${n.toUpperCase()}</b>`);
        b.addEventListener("click", () => { takeOver();
          design.cfg.candy.pattern.color = null;
          design.cfg.candy.pattern.opacity = Math.max(design.cfg.candy.pattern.opacity, 26);
          apply({ pattern: n }); });
        patWrap.appendChild(b);
      });

      /* ── kit (scrollable — everything they'll get) ── */
      /* step-1 kit strip retired — the full kit lands on step 2 */

      /* ── apply design everywhere ── */
      const apply = (patch = {}) => {
        Object.assign(design, patch);
        const hi = mix(design.color, "#ffffff", .42), lo = mix(design.color, "#000000", .34);
        const rgb = hexToRgb(design.color);
        root.style.setProperty("--candy", design.color);
        root.style.setProperty("--candy-hi", hi);
        root.style.setProperty("--candy-lo", lo);
        root.style.setProperty("--candy-glow", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .46)`);
        root.style.setProperty("--radius", `${4 + (design.round / 100) * 42}px`);
        root.style.setProperty("--shine", (design.shine / 100).toFixed(2));
        const pat = PATTERNS[design.pattern] || PATTERNS.None;
        root.style.setProperty("--pat", pat.css);
        root.style.setProperty("--pat-size", pat.size);

        warmFont(design.font || (design.cfg && design.cfg.type && design.cfg.type.font));
        drawMaster(masterWrap.classList.contains("is-pressed") ? "pressed" : "default");
        masterLabelEl.textContent = "";
        const sbEl = $("stateBig");
        if (sbEl) { const mc = engCfg(); sbEl.innerHTML = tighten(E.renderShell(mc, railState, 330, 92, { label: mc.content.label }), 46); }
        document.querySelectorAll(".kp-pill-l").forEach((el) => { el.textContent = (design.label || "PLAY").slice(0, 8); });
        if (typeof step !== "undefined") {
          if (step === 2) renderSheetSvgs();
          if (step === 3) renderBoard();
        }

        $("colorVal") && ($("colorVal").textContent = design.name);
        roundR.value = design.round; roundR.style.setProperty("--range", design.round + "%"); roundVal.textContent = shName(design.shapeOv || stopShape(design.round));
        shineR.value = design.shine; shineR.style.setProperty("--range", design.shine + "%"); shineVal.textContent = design.shine + "%";
        const exR = $("extrR");
        if (exR) { exR.value = design.extr; exR.style.setProperty("--range", (design.extr / 48 * 100).toFixed(0) + "%");
          $("extrVal").textContent = design.extr + "px"; }
        document.querySelectorAll("#fontChips .font-chip").forEach((c2) => c2.setAttribute("aria-pressed", String(c2.dataset.f === design.font)));
        document.querySelectorAll("#tcolChips .bg-chip").forEach((c2) => c2.setAttribute("aria-pressed", String((c2.dataset.tc || null) === (design.tcol || null))));
        if (document.activeElement !== labelIn) labelIn.value = design.label;
        palWrap.querySelectorAll(".sw2").forEach((b, i) => b.setAttribute("aria-pressed", String(PAL[i].color === design.color)));
        patWrap.querySelectorAll(".pat-tile").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pat === design.pattern)));
        if (systemRound) {
          systemRound.value = design.round; systemRound.style.setProperty("--range", design.round + "%");
          systemRoundValue.textContent = design.round;
          bigDial.style.setProperty("--dial-angle", design.round + "%");
          bigDial.style.setProperty("--dial-deg", `${-135 + design.round * 2.7}`);
        }
      };

      /* ── attract mode ── */
      const REEL = HERO_REEL.map((entry) => {
        const [id, label] = entry.split("|");
        if (id.startsWith("auth:")) {
          const a = id.slice(5);
          const eff = (E.AUTHORED[a] && E.AUTHORED[a].effects) || {};
          const name = a.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          return { auth: a, color: eff["Inner Fill"] || "#A855F7", name, label };
        }
        const pr = E.presetById(id);
        return { pid: id, color: pr.effects["Inner Fill"] || "#A855F7", name: pr.name, label };
      });
      /* Warm every face the lineup can ask for before the rotation
         reaches it (hero-feed cfgs warm as they join, below). */
      Object.keys(E.AUTHORED).forEach((a) => { const t2 = E.AUTHORED[a] && E.AUTHORED[a].type; warmFont(t2 && t2.font); });
      FONT_CHIPS.forEach(warmFont);
      warmFont(E.defaultConfig().type.font);
      /* ── the ONE path a design takes into the demo ──
         Reel stops, style chips, hero chips and reset all go through
         playDesign, so the resolution and adoption rules live once:
         · pid "auth:<id>" → the preset's full authored design;
           "hero:<key>" → an owner-designated community design;
           anything else → the plain recipe (applyPresetFull)
         · a FULL design (auth/hero) adopts its own label and face —
           its type.case governs presentation; the demo never edits it
         · an explicit label override (reel "|LABEL") shows as caps —
           plain reel entries should always carry one
         · a plain recipe keeps whatever label is already on the demo */
      const resolveCfg = (pid) => pid && pid.startsWith("hero:") && HERO_CFGS[pid] ? heroCfg(pid)
        : pid && pid.startsWith("auth:") ? authoredCfg(pid.slice(5))
        : E.applyPresetFull(E.defaultConfig(), pid || "grape-jelly");
      const playDesign = ({ pid, color, name, label }) => {
        glitchPrep();
        design.cfg = resolveCfg(pid);
        design.pid = pid;
        syncFromCfg();
        const full = !!pid && (pid.startsWith("auth:") || pid.startsWith("hero:"));
        const patch = { label: label ? label.toUpperCase() : full ? (design.cfg.content.label || design.label || "PLAY") : design.label };
        if (color) patch.color = color;
        if (name) patch.name = name;
        apply(patch);
        glitchMaster();
      };
      /* pre-transition shine: one pass of the engine's sweep band across
         the current stop, cued so it finishes just before the reel moves
         on. Attract-mode only — takeOver cancels it. */
      let shineTimer = null;
      const cancelShine = () => { clearTimeout(shineTimer); masterSvg.classList.remove("is-shining"); };
      const scheduleShine = () => {
        if (reduceMotion) return;
        cancelShine();
        shineTimer = setTimeout(() => masterSvg.classList.add("is-shining"), 1700);
      };
      masterSvg.addEventListener("animationend", (ev) => { if (ev.animationName === "fd-hero-shine") masterSvg.classList.remove("is-shining"); });
      const applyReelEntry = (e) => {
        playDesign({
          pid: e.hero ? e.hero : e.auth ? "auth:" + e.auth : e.pid,
          color: e.color, name: e.name, label: e.label,
        });
        scheduleShine();
      };
      let attractTimer = null, reelI = 0;
      const startAttract = () => {
        userControlled = false;
        stStatus.textContent = t("prev"); stStatus.classList.remove("is-user");
        clearInterval(attractTimer);
        attractTimer = setInterval(() => { reelI = (reelI + 1) % REEL.length; applyReelEntry(REEL[reelI]); }, reduceMotion ? 6000 : 2800);
      };
      const takeOver = () => {
        if (userControlled) return;
        userControlled = true;
        clearInterval(attractTimer);
        cancelShine();
        stStatus.textContent = t("yours"); stStatus.classList.add("is-user");
      };

      /* FONT — the four faces shipped with this page (all from the app's roster) */
      { const fw = $("fontChips");
        FONT_CHIPS.forEach((f) => {
          const b = document.createElement("button");
          b.type = "button"; b.className = "font-chip"; b.dataset.f = f;
          b.style.fontFamily = `'${f}', sans-serif`; b.textContent = f.replace(" One", "");
          b.setAttribute("aria-pressed", "false");
          b.addEventListener("click", () => { takeOver(); design.font = f; apply({}); });
          fw.appendChild(b);
        }); }
      /* FONT COLOR — solid label tint, AUTO returns to the preset's treatment */
      { const tw = $("tcolChips");
        [[null, "Auto"], ["#FFFFFF", "White"], ["#FFF3C4", "Cream"], ["#7ADCFF", "Ice"], ["#FF6FD8", "Magenta"],
         ["#B9F461", "Lime"], ["#FFC145", "Gold"], ["#1B1030", "Ink"]].forEach(([hex, nm]) => {
          const b = document.createElement("button");
          b.type = "button"; b.className = "bg-chip" + (hex ? "" : " tc-auto"); b.dataset.tc = hex || "";
          if (hex) b.style.background = hex;
          b.setAttribute("aria-label", "Label color: " + nm); b.setAttribute("aria-pressed", "false");
          b.addEventListener("click", () => { takeOver(); design.tcol = hex; apply({}); });
          tw.appendChild(b);
        }); }
      $("extrR").addEventListener("input", () => { takeOver(); design.extr = +$("extrR").value; apply({}); });
      $("resetBtn").addEventListener("click", () => { takeOver();
        playDesign({ pid: design.pid }); });
      document.querySelectorAll("#stateTabs button").forEach((b) => b.addEventListener("click", () => {
        document.querySelectorAll("#stateTabs button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on"); railState = b.dataset.state; apply({});
      }));
      roundR.addEventListener("input", () => { takeOver(); design.shapeOv = null; apply({ round: +roundR.value }); });
      shineR.addEventListener("input", () => { takeOver(); apply({ shine: +shineR.value }); });
      /* family filter on the free surface — the paid app removes it */
      const BAD = ["fuck", "shit", "cunt", "bitch", "nigger", "faggot",
        "putain", "merde", "salope", "puta", "mierda", "cazzo", "stronzo",
        "scheisse", "scheiße", "fotze", "くそ", "クソ", "まんこ", "傻逼", "他妈的"];
      const L33T = { "@": "a", "4": "a", "1": "i", "!": "i", "3": "e", "0": "o", "$": "s", "5": "s", "7": "t" };
      const cleanLabel = (raw) => {
        let out = raw, hit = false, guard = 0;
        for (;;) {
          if (++guard > 8) break;
          const norm = out.toLowerCase().replace(/[@41!30$57]/g, (ch) => L33T[ch]);
          const w = BAD.find((b2) => norm.includes(b2));
          if (!w) break;
          const i3 = norm.indexOf(w);
          out = out.slice(0, i3) + "★".repeat(w.length) + out.slice(i3 + w.length);
          hit = true;
        }
        return { out, hit };
      };
      labelIn.addEventListener("input", () => { takeOver();
        const { out, hit } = cleanLabel(labelIn.value);
        if (hit) { labelIn.value = out; flash(t("pg")); }
        apply({ label: out.trim().toUpperCase() || "PLAY" }); });
      $("randBtn").addEventListener("click", () => {
        takeOver();
        glitchPrep();
        design.cfg = E.randomizeConfig(design.cfg);
        syncFromCfg();
        const labels = ["PLAY", "CLAIM", "BOOST", "START", "GO", "EQUIP", "COLLECT", "WIN"];
        apply({ color: design.cfg.effects["Inner Fill"] || design.color, name: "Random roll",
          label: labels[Math.floor(Math.random() * labels.length)] });
        glitchMaster();
        if (!reduceMotion) masterWrap.animate(
          [{ transform: "translateY(0)" }, { transform: "translateY(-9px)", offset: .4 }, { transform: "translateY(0)" }],
          { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" });
      });
      $("masterHit").addEventListener("click", takeOver);
      $("masterHit").addEventListener("pointerdown", () => { masterWrap.classList.add("is-pressed"); drawMaster("pressed"); });
      FD_ON(window, "pointerup", () => {
        if (masterWrap.classList.contains("is-pressed")) { masterWrap.classList.remove("is-pressed"); drawMaster("default"); } });
      $("masterHit").addEventListener("pointerenter", () => { if (!masterWrap.classList.contains("is-pressed")) drawMaster("hover"); });
      $("masterHit").addEventListener("pointerleave", () => { if (!masterWrap.classList.contains("is-pressed")) drawMaster("default"); });
      if (systemRound) systemRound.addEventListener("input", () => { takeOver(); apply({ round: +systemRound.value }); });

      /* ── push to a kit: precision assembly ── */

      /* ── onboarding step machine: master → kit → board → export ── */
      const pvKit = $("pvKit"), pvBoard = $("pvBoard"), pvLabel = $("pvLabel"), pvSteps = $("pvSteps");
      const b2Stage = $("b2Stage"), b2Pieces = $("b2Pieces"), b2Lib = $("b2Lib"), b2Chip = $("b2Chip"), b2Veil = $("b2Veil");
      let step = 1, maxStep = 1, exported = false;

      /* the WHOLE catalog: every engine component at two sizes, plus the state trio */
      const FLIP_IDS = new Set(["toggle", "checkbox", "radio"]);
      const BUMP_IDS = new Set(["progress", "segbar", "vsbar", "emblembar"]);
      const PRESS_IDS = new Set(["primary", "secondary", "small", "ghost", "iconbtn", "chip", "badge", "tab", "segment", "header", "input", "dropdown", "resource", "slot", "bignum", "ammo"]);
      /* the sheet reads as a design system: grouped, headed, ordered */
      const KIT_SECS = [
        /* wide → regular → small inside each section, so rows pack tight
           without dense flow jumping pieces across section lines */
        ["ks1", ["primary", "secondary", "small", "ghost", "iconbtn", "padbtn", "keycap", "chip"]],
        ["ks3", ["input", "searchfield", "setrow", "dropdown", "slider", "checkbox", "radio", "toggle", "stepper"]],
        ["ks2", ["toast", "tooltip", "segment", "header", "steps", "tab", "pagedots", "spinner", "notifydot"]],
        ["ks4", ["progress", "loadbar", "segbar", "emblembar", "vsbar", "flipclock", "timerdigits", "ring", "stopwatch", "orb", "cooldown"]],
        ["ks5", ["hotbar", "datarow", "nameplate", "resource", "avatarframe", "bignum", "slot", "currency", "buffframe", "badge", "lives", "ammo", "reticle", "joystick"]],
        ["ks6", ["dialog", "panel", "listmenu", "scrollbar", "minimap", "leaderboard", "laptimes", "telemetry", "circuit", "speedo", "speedo2", "tacho", "cardback", "pack"]],
      ];
      /* footprint tiers: small pieces pack tight, bars span wide, big pieces breathe */
      const S_IDS = new Set(["iconbtn", "padbtn", "keycap", "checkbox", "radio", "toggle", "stepper", "pagedots",
        "spinner", "notifydot", "badge", "slot", "orb", "cooldown", "reticle", "joystick", "lives", "ammo",
        "currency", "buffframe",
        "crosshair", "hitmarker", "waypoint", "capturemeter", "dmgarc"]);
      const W_IDS = new Set(["input", "searchfield", "setrow", "dropdown", "slider", "progress", "loadbar",
        "segbar", "emblembar", "vsbar", "hotbar", "header", "segment", "toast", "tooltip", "datarow",
        "nameplate", "timerdigits", "flipclock", "steps",
        "xpbar", "manarails", "compass", "killfeed", "magazine", "streakmeter", "heartmeter",
        "energymeter", "loottag", "equipselector",
        "popmeter", "scorebug", "friendrow", "achievetoast"]);
      const B_IDS = new Set(["dialog", "panel", "listmenu", "scrollbar", "minimap", "leaderboard", "laptimes",
        "telemetry", "circuit", "speedo", "speedo2", "tacho", "cardback", "pack",
        "questpanel", "dialoguebox", "choicelist", "invgrid", "partyframe", "respawn",
        "weaponwheel", "spinwheel",
        "buildqueue", "unitplate", "techcard", "chatbubble", "emotewheel", "seasontrack"]);
      const SHEET = (() => {
        /* every engine component exactly once — no size duplicates, no state repeats */
        const byId = new Map(E.KIT_COMPONENTS.map((k) => [k.id, k]));
        const seen = new Set();
        const items = [];
        const pushIt = (k, sec) => items.push({ cap: k.name.toUpperCase(), kid: k.id, sz: "l", sec,
          cls: S_IDS.has(k.id) ? "s" : W_IDS.has(k.id) ? "w" : B_IDS.has(k.id) ? "b" : "",
          v: FLIP_IDS.has(k.id) ? 1 : k.id === "slider" ? 64 : BUMP_IDS.has(k.id) ? 72 : undefined });
        for (const [secKey, ids] of KIT_SECS) {
          let first = true;
          for (const id of ids) {
            const k = byId.get(id); if (!k) continue;
            seen.add(id); pushIt(k, first ? secKey : undefined); first = false;
          }
        }
        // components the engine grows later append at the bottom under one
        // header, packed big -> wide -> regular -> small like every section
        const tail = E.KIT_COMPONENTS.filter((k) => !seen.has(k.id));
        const rank = (k) => B_IDS.has(k.id) ? 0 : W_IDS.has(k.id) ? 1 : S_IDS.has(k.id) ? 3 : 2;
        tail.sort((a, b3) => rank(a) - rank(b3));
        tail.forEach((k, i3) => pushIt(k, i3 === 0 ? "ks7" : undefined));
        return items;
      })();
      const SHEET_N = SHEET.length;
      const buildSheet = () => {
        pvKit.innerHTML = `<div class="kit-headline"><span><b id="khN">0</b> ${t("comp")}</span><i>×</i><span><b>4</b> ${t("states")}</span><i>—</i><span class="kh-dl">${t("ready")}</span></div>`;
        SHEET.forEach((it) => {
          if (it.sec) {
            const d = document.createElement("div");
            d.className = "kit-sec";
            d.innerHTML = `<span data-k="${it.sec}">${t(it.sec)}</span><i></i>`;
            pvKit.appendChild(d);
          }
          const cell = document.createElement("div");
          cell.className = "kcell pre" + (it.cls ? " kcell--" + it.cls : "");
          const dv = it.v !== undefined ? ` data-v="${it.v}"` : "";
          const dst = it.st ? ` data-st="${it.st}"` : "";
          const dsz = it.sz ? ` data-sz="${it.sz}"` : "";
          cell.innerHTML = `<span class="rk" data-kid="${it.kid}"${dv}${dst}${dsz} data-auto="1"></span><span class="kcap2">${it.cap}</span>`;
          const s = cell.querySelector(".rk");
          if (PRESS_IDS.has(it.kid) && !it.st) wireStates(s);
          if (FLIP_IDS.has(it.kid)) wireFlip(s);
          if (it.kid === "slider") { s.style.cursor = "pointer"; s.addEventListener("click", (ev) => {
            const r = s.getBoundingClientRect();
            s.dataset.v = Math.max(0, Math.min(100, Math.round(100 * (ev.clientX - r.left) / r.width))); renderRk(s); }); }
          if (BUMP_IDS.has(it.kid)) { s.style.cursor = "pointer"; s.addEventListener("click", () => {
            s.dataset.v = s.dataset.v === "34" ? "86" : "34"; renderRk(s); }); }
          pvKit.appendChild(cell);
        });
        renderSheetSvgs();
      };
      let sheetTimer = 0;
      const renderSheetSvgs = () => { clearTimeout(sheetTimer);
        sheetTimer = setTimeout(() => pvKit.querySelectorAll(".rk").forEach(renderRk), 90); };
      const renderBoard = () => { document.querySelectorAll("#pvBoard .rk").forEach(renderRk); };

      /* board pieces: id → builder (all inherit live design vars + pattern) */
      const B2 = {
        btn:    { cap: "BUTTON", make: () => `<span class="rk" data-kid="primary" style="width:118px"></span>` },
        badge:  { cap: "BADGE", make: () => `<span class="rk" data-kid="badge" style="width:54px"></span>` },
        xp:     { cap: "XP BAR", make: () => `<span class="rk" data-kid="progress" data-v="72" style="width:112px"></span>` },
        hotbar: { cap: "HOTBAR", make: () => `<span class="rk" data-kid="hotbar" style="width:130px"></span>` },
        hearts: { cap: "HEARTS", make: () => `<span class="rk" data-kid="lives" style="width:92px"></span>` },
        map:    { cap: "MINIMAP", make: () => `<span class="rk" data-kid="minimap" style="width:64px"></span>` }
      };
      let boardBuilt = false, boardIntroDone = false, curBoard = 0;
      const BOARDS = [{ v: "", html: "", bg: "valley" }, { v: "v2", html: "", bg: "tavern" }];
      /* backdrop options — the user's own scenes; "valley" reuses the embedded stage image */
      const B2BG = {
        valley: null,
        strategy: deps.assets.strategy,
        tavern: deps.assets.tavern,
        fps: deps.assets.fps
      };
      const bgImgEl = document.querySelector("img.b2-bg");
      if (bgImgEl) B2BG.valley = bgImgEl.src;
      const applyBg = (key) => {
        if (!bgImgEl || !B2BG[key]) return;
        bgImgEl.src = B2BG[key];
        BOARDS[curBoard].bg = key;
        document.querySelectorAll(".b2-bgthumb").forEach((th) => th.setAttribute("aria-pressed", String(th.dataset.bg === key)));
      };
      const placePiece = (key, x, y) => {
        const el = document.createElement("div");
        el.className = "b2-piece";
        el.style.left = x + "%"; el.style.top = y + "%";
        el.innerHTML = B2[key].make();
        el.setAttribute("aria-label", B2[key].cap + " — draggable");
        b2Pieces.appendChild(el);
        return el;
      };
      const renderTabs = () => {
        const set = document.getElementById("b2TabSet");
        set.innerHTML = "";
        BOARDS.forEach((b, i) => {
          const bt = document.createElement("button");
          bt.type = "button"; bt.className = "b2-tab" + (i === curBoard ? " on" : "");
          bt.textContent = `${t("boardW")} ${i + 1}`;
          bt.addEventListener("click", () => switchBoard(i));
          set.appendChild(bt);
        });
      };
      const switchBoard = (i) => {
        if (i === curBoard) return;
        BOARDS[curBoard].html = b2Pieces.innerHTML;
        curBoard = i;
        b2Stage.classList.remove("v2", "v3");
        if (BOARDS[i].v) b2Stage.classList.add(BOARDS[i].v);
        b2Pieces.innerHTML = BOARDS[i].html;
        applyBg(BOARDS[i].bg || "valley");
        renderBoard(); renderTabs();
      };
      const buildBoard = () => {
        if (boardBuilt) return;
        boardBuilt = true;
        renderTabs();
        document.getElementById("b2Add").addEventListener("click", () => {
          if (BOARDS.length >= 4) { notify(t("maxB")); return; }
          BOARDS.push({ v: "", html: "", bg: ["strategy", "fps", "tavern"][BOARDS.length % 3] });
          renderTabs(); switchBoard(BOARDS.length - 1);
        });
        document.getElementById("b2Png").addEventListener("click", () => notify(t("pngMsg")));
        document.getElementById("b2Share").addEventListener("click", () => notify(t("shareMsg")));
        const upB0 = document.getElementById("b2Up");
        if (upB0) upB0.addEventListener("click", () => notify(t("upMsg")));
        const dimR = document.getElementById("dimR"), dimEl = document.getElementById("b2Dim");
        dimR.addEventListener("input", () => {
          dimEl.style.opacity = dimR.value / 100;
          dimR.style.setProperty("--fill", (dimR.value / 75 * 100) + "%");
        });
        const bgRow = document.createElement("div");
        bgRow.className = "b2-bgrow";
        bgRow.innerHTML = `<div class="b2-cap2" id="bgsCap">BACKDROPS</div>`;
        const bgGrid = document.createElement("div");
        bgGrid.className = "b2-bggrid";
        [["valley", "VALLEY"], ["strategy", "STRATEGY"], ["tavern", "TAVERN"], ["fps", "FPS"]].forEach(([key, nm]) => {
          const th = document.createElement("button");
          th.type = "button"; th.className = "b2-bgthumb"; th.dataset.bg = key;
          th.setAttribute("aria-label", "Backdrop: " + nm);
          th.setAttribute("aria-pressed", String(key === "valley"));
          th.innerHTML = `<img src="${B2BG[key]}" alt="" loading="lazy">`;
          th.addEventListener("click", () => { takeOver(); applyBg(key); });
          bgGrid.appendChild(th);
        });
        bgRow.appendChild(bgGrid);
        b2Lib.appendChild(bgRow);
        Object.keys(B2).forEach((key) => {
          const it = document.createElement("button");
          it.type = "button"; it.className = "b2-item"; it.dataset.key = key;
          it.innerHTML = `<span class="b2-thumb">${B2[key].make()}</span><b>${B2[key].cap}</b>`;
          b2Lib.appendChild(it);
        });
        placePiece("btn", 34, 62);
        placePiece("hearts", 4, 6);
        placePiece("map", 84, 6);
        renderBoard();
      };

      /* drag & drop — pointer-based, library → stage, stage pieces re-draggable */
      let dragEl = null, dragOff = { x: 0, y: 0 };
      const beginDrag = (el, e) => { dragEl = el; const r = el.getBoundingClientRect(); dragOff = { x: e.clientX - r.left, y: e.clientY - r.top }; el.classList.add("dragging"); };
      b2Lib.addEventListener("pointerdown", (e) => {
        const it = e.target.closest(".b2-item"); if (!it) return;
        e.preventDefault();
        const sr = b2Stage.getBoundingClientRect();
        const el = placePiece(it.dataset.key, 0, 0);
        renderBoard();
        el.style.left = Math.max(0, e.clientX - sr.left - 20) + "px";
        el.style.top = Math.max(0, e.clientY - sr.top - 12) + "px";
        beginDrag(el, e);
      });
      const ensureCtl = (p) => {
        if (!p.querySelector(".b2-del")) p.insertAdjacentHTML("beforeend",
          '<button class="b2-del" type="button" aria-label="Delete piece">×</button><span class="b2-rsz" aria-hidden="true"></span>');
      };
      let rszPiece = null, rszX0 = 0, rszW0 = 0;
      b2Pieces.addEventListener("pointerdown", (e) => {
        const p = e.target.closest(".b2-piece"); if (!p) return;
        e.preventDefault();
        if (e.target.closest(".b2-del")) { p.remove(); return; }
        b2Pieces.querySelectorAll(".b2-piece.sel").forEach((x) => x.classList.remove("sel"));
        p.classList.add("sel");
        ensureCtl(p);
        if (e.target.closest(".b2-rsz")) {
          const art = p.querySelector(".rk") || p.firstElementChild;
          rszPiece = art; rszX0 = e.clientX; rszW0 = art.offsetWidth;
          return;
        }
        beginDrag(p, e);
      });
      FD_ON(window, "pointermove", (e) => {
        if (!rszPiece) return;
        rszPiece.style.width = clamp(rszW0 + (e.clientX - rszX0), 36, 340) + "px";
      });
      FD_ON(window, "pointerup", () => { rszPiece = null; });
      FD_ON(document, "keydown", (e) => {
        if (e.key !== "Delete" && e.key !== "Backspace") return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const sel = b2Pieces.querySelector(".b2-piece.sel");
        if (sel && !pvBoard.hidden) { e.preventDefault(); sel.remove(); }
      });
      b2Stage.addEventListener("pointerdown", (e) => {
        if (!e.target.closest(".b2-piece")) b2Pieces.querySelectorAll(".b2-piece.sel").forEach((x) => x.classList.remove("sel"));
      });
      FD_ON(window, "pointermove", (e) => {
        if (!dragEl) return;
        const sr = b2Stage.getBoundingClientRect();
        const x = clamp(e.clientX - sr.left - dragOff.x, 0, sr.width - dragEl.offsetWidth);
        const y = clamp(e.clientY - sr.top - dragOff.y, 0, sr.height - dragEl.offsetHeight);
        dragEl.style.left = x + "px"; dragEl.style.top = y + "px";
      }, { passive: true });
      FD_ON(window, "pointerup", () => { if (dragEl) { dragEl.classList.remove("dragging"); dragEl = null; } });

      const boardIntro = () => {
        if (boardIntroDone) { return; }
        boardIntroDone = true;
        buildBoard();
        if (reduceMotion) { b2Veil.style.opacity = "0"; return; }
        b2Chip.hidden = false;
        b2Chip.textContent = t("up1");
        b2Veil.style.opacity = "1";
        setTimeout(() => { b2Chip.textContent = t("up2"); b2Veil.style.opacity = "0"; }, 850);
        setTimeout(() => { b2Chip.hidden = true; }, 2300);
        [...b2Pieces.children].forEach((p, i) => p.animate(
          [{ transform: "translateY(10px) scale(.7)", opacity: 0 }, { transform: "none", opacity: 1 }],
          { duration: 420, delay: 950 + i * 120, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" }));
      };

      const STEP_META = {
        1: { label: "MASTER / 01", push: "CREATE YOUR KIT" },
        2: { label: "KIT / 02", push: "PUSH TO A BOARD" },
        3: { label: "BOARD / 03", push: "EXPORT" }
      };
      const showStep = (nStep) => {
        step = nStep; maxStep = Math.max(maxStep, nStep);
        const shipEl = document.getElementById("pvShip");
        if (shipEl) shipEl.hidden = true;
        masterWrap.parentElement.querySelectorAll(".pv-axis").forEach((a) => a.style.opacity = nStep === 1 ? "" : "0");
        masterWrap.style.display = nStep === 1 ? "" : "none";
        pvKit.hidden = nStep !== 2;
        pvBoard.hidden = nStep !== 3;
        pvLabel.textContent = STEP_META[nStep].label;
        pvSteps.querySelectorAll("button").forEach((b) => {
          const bs = +b.dataset.step;
          b.classList.toggle("on", bs === nStep);
          b.classList.toggle("done", bs < nStep);
          b.disabled = bs > maxStep;
        });
        const st2 = document.getElementById("studio2");
        st2.classList.toggle("step3", nStep === 3);
        st2.classList.toggle("step2", nStep === 2);
        if (nStep !== 2) st2.classList.remove("show-ctl");
        if (nStep === 2) renderSheetSvgs();
        if (nStep === 3) { buildBoard(); renderBoard(); }
        if (typeof refreshStepUi === "function") refreshStepUi();
      };
      pvSteps.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        const bs = +b.dataset.step;
        if (bs <= maxStep && bs !== step) { takeOver(); showStep(bs); }
      }));

      const flash = (msg) => {
        kitReady.textContent = msg;
        kitReady.classList.add("show");
        stStatus.textContent = msg;
        setTimeout(() => { kitReady.classList.remove("show"); stStatus.textContent = t("yours"); }, 1700);
      };


      const toKit = () => {
        takeOver();
        const stEl = document.getElementById("studio2");
        if (!stEl.dataset.hLock) { stEl.style.height = Math.min(stEl.offsetHeight, window.innerHeight * 0.92) + "px"; stEl.dataset.hLock = "1"; }
        if (!reduceMotion) masterWrap.animate(
          [{ transform: "scale(1)" }, { transform: "scale(.965, .93)", offset: .35 }, { transform: "scale(1)" }],
          { duration: 300, easing: "cubic-bezier(.3,.7,.3,1)" });
        const srcRect = masterWrap.getBoundingClientRect();
        buildSheet();
        const go = () => {
          showStep(2);
          try {
            if (!localStorage.getItem("ui-generator-push-hint")) {
              localStorage.setItem("ui-generator-push-hint", "1");
              const ph = document.getElementById("pushHint");
              if (ph) { ph.hidden = false;
                setTimeout(() => ph.classList.add("hide"), 9000);
                setTimeout(() => { ph.hidden = true; }, 9800); }
            }
          } catch (_) {}
          const cells = [...pvKit.querySelectorAll(".kcell")];
          cells.forEach((cell, i) => {
            if (reduceMotion) { cell.classList.remove("pre"); return; }
            if (i >= 18) { setTimeout(() => cell.classList.remove("pre"), 700 + (i - 18) * 14); return; }
            const delay = 60 + i * 52;
            requestAnimationFrame(() => {
              const r = cell.getBoundingClientRect();
              const ghost = document.createElement("div");
              ghost.className = "fly-ghost";
              ghost.innerHTML = tighten(E.renderShell(engCfg(), "default", 56, 18, { label: design.label || "PLAY" }), 8);
              document.body.appendChild(ghost);
              const x0 = srcRect.left + srcRect.width / 2 - 28, y0 = srcRect.top + srcRect.height / 2 - 9;
              const x1 = r.left + r.width / 2 - 28, y1 = r.top + r.height / 2 - 9;
              const rot = (i % 2 ? 1 : -1) * 4;
              const anim = ghost.animate([
                { transform: `translate(${x0}px, ${y0}px) scale(.4) rotate(0deg)`, opacity: 0, filter: "blur(3px)" },
                { opacity: 1, offset: .25 },
                { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - 18}px) scale(.85) rotate(${rot}deg)`, offset: .55, filter: "blur(1px)" },
                { transform: `translate(${x1}px, ${y1}px) scale(1) rotate(0deg)`, opacity: 1, filter: "blur(0)" }
              ], { duration: 560, delay, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" });
              anim.finished.then(() => { ghost.remove(); cell.classList.remove("pre"); }).catch(() => ghost.remove());
            });
          });
          const khN = document.getElementById("khN");
          if (reduceMotion) { khN.textContent = String(SHEET_N); }
          else {
            const t0 = performance.now();
            const tick = (now) => {
              const p = Math.min(1, (now - t0) / 900);
              khN.textContent = Math.round(SHEET_N * (1 - Math.pow(1 - p, 3)));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
          setTimeout(() => flash(t("fKit")), reduceMotion ? 60 : 1400);
        };
        reduceMotion ? go() : setTimeout(go, 180);
      };

      let boardCalloutDone = false;
      const toBoard = () => {
        takeOver();
        showStep(3);
        boardIntro();
        if (!boardCalloutDone) {
          boardCalloutDone = true;
          const bc = document.getElementById("bdCall");
          if (bc) setTimeout(() => {
            bc.hidden = false; bc.classList.add("run");
            setTimeout(() => { bc.hidden = true; bc.classList.remove("run"); }, 3100);
          }, reduceMotion ? 200 : 1100);
        } else {
          setTimeout(() => flash(t("fBoard")), reduceMotion ? 60 : 1500);
        }
      };

      const doExport = () => {
        takeOver();
        if (!exported) {
          exported = true;
          const ship = document.getElementById("pvShip");
          if (ship) {
            ship.hidden = false;
            const end0 = document.getElementById("shipEnd");
            if (end0) end0.hidden = true;
            ship.classList.remove("play");
            void ship.offsetWidth;
            ship.classList.add("play");
            try {
              ship.querySelectorAll(".exp-file").forEach((n) => n.remove());
              const files = ["unity.prefab.json", "unreal.uasset.json", "kit.css", "kit.html", "board-1.png", "LICENSE.txt"];
              const exts = ["default.svg", "hover.svg", "pressed.svg", "disabled.svg"];
              E.KIT_COMPONENTS.forEach((k) => {
                exts.forEach((x) => files.push(k.id + "-" + x));
                files.push(k.id + "@1x.png", k.id + "@2x.png");
              });
              for (let i = files.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1)); const tmp = files[i]; files[i] = files[j]; files[j] = tmp;
              }
              const W2 = ship.clientWidth || 700, H2 = ship.clientHeight || 420;
              files.slice(0, 36).forEach((nm, i) => {
                const chip = document.createElement("i");
                chip.className = "exp-file"; chip.textContent = nm;
                ship.appendChild(chip);
                const ang = Math.random() * Math.PI * 2;
                const spread = 0.3 + Math.random() * 0.62;
                const tx = Math.cos(ang) * spread * W2 * 0.5, ty = Math.sin(ang) * spread * H2 * 0.5;
                const rot = (Math.random() * 22 - 11).toFixed(1);
                if (reduceMotion) {
                  chip.style.transform = "translate(-50%,-50%) translate(" + tx + "px," + ty + "px) rotate(" + rot + "deg)";
                  chip.style.opacity = ".3"; return;
                }
                chip.animate([
                  { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
                  { transform: "translate(-50%,-50%) translate(" + tx * 0.92 + "px," + ty * 0.92 + "px) rotate(" + rot + "deg) scale(1)", opacity: .95, offset: .55 },
                  { transform: "translate(-50%,-50%) translate(" + tx + "px," + ty + "px) rotate(" + rot + "deg) scale(1)", opacity: .3 }
                ], { duration: 1150, delay: 120 + i * 34, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
              });
            } catch (_) {}
            try {
              const listEl = document.getElementById("shipList"), cntEl = document.getElementById("shipCount");
              if (listEl && cntEl) {
                listEl.innerHTML = "";
                const cells = Array.from(document.querySelectorAll("#pvKit .kcell"));
                const total = cells.length; let done = 0;
                cntEl.textContent = "0 / " + total;
                if (!cells.length) listEl.parentElement.style.display = "none";
                const addRow = (cell) => {
                  const row = document.createElement("div"); row.className = "ship-li";
                  const art = document.createElement("span"); art.className = "a";
                  const svg = cell.querySelector(".rk svg");
                  if (svg) art.appendChild(svg.cloneNode(true));
                  const nm = document.createElement("span");
                  const capEl = cell.querySelector(".kcap2");
                  nm.textContent = (capEl ? capEl.textContent : "").toLowerCase();
                  const tick = document.createElement("em"); tick.textContent = "✓";
                  row.appendChild(art); row.appendChild(nm); row.appendChild(tick);
                  listEl.appendChild(row);
                  done += 1; cntEl.textContent = done + " / " + total;
                  listEl.scrollTop = listEl.scrollHeight;
                };
                if (reduceMotion) cells.forEach(addRow);
                else cells.forEach((cell2, i2) => setTimeout(() => { if (!ship.hidden) addRow(cell2); }, 200 + i2 * 60));
              }
            } catch (_) {}
          }
          narr.innerHTML = t("n4");
          pushLabel.textContent = t("pushOpen");
          try {
            const endEl = document.getElementById("shipEnd");
            if (endEl) {
              const seO = document.getElementById("seOpen");
              if (seO) seO.innerHTML = tighten(E.renderShell(engCfg(), "default", 620, 100, { label: t("pushOpen"), fs: 23 }), 40);
              setTimeout(() => { const sh2 = document.getElementById("pvShip");
                if (sh2 && !sh2.hidden) endEl.hidden = false; }, reduceMotion ? 700 : 4600);
            }
          } catch (_) {}
        } else {
          document.dispatchEvent(new CustomEvent("ui-generator:cta", { detail: { hook: "open-generator" } }));
        }
      };

      { const shipEl = document.getElementById("pvShip");
        if (shipEl) shipEl.addEventListener("click", () => { shipEl.hidden = true; }); }
      { const closeEnd = () => { const e2 = document.getElementById("shipEnd"), s2 = document.getElementById("pvShip");
          if (e2) e2.hidden = true; if (s2) s2.hidden = true; };
        const seA = document.getElementById("seAgain"), seT = document.getElementById("seTour"), seO = document.getElementById("seOpen");
        if (seA) seA.addEventListener("click", (ev) => { ev.stopPropagation(); closeEnd();
          exported = false; showStep(1); try { narr.innerHTML = t("n1"); } catch (_) {} });
        if (seT) seT.addEventListener("click", (ev) => { ev.stopPropagation(); closeEnd();
          const nx = document.querySelector(".stats-band"); if (nx) nx.scrollIntoView({ behavior: "smooth" }); });
        if (seO) { const goApp = (ev) => { ev.stopPropagation();
            document.dispatchEvent(new CustomEvent("ui-generator:cta", { detail: { hook: "open-generator" } })); };
          seO.addEventListener("click", goApp);
          seO.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); goApp(ev); } }); } }
      pushBtn.addEventListener("click", () => {
        if (step === 1) toKit();
        else if (step === 2) toBoard();
        else doExport();
      });

      /* ── live X/Y readout ── */
      const xy = document.getElementById("xyReadout");
      if (xy && window.matchMedia("(pointer:fine)").matches) {
        let raf = 0;
        FD_ON(window, "pointermove", (e) => {
          if (raf) return;
          raf = requestAnimationFrame(() => { raf = 0; xy.innerHTML = `X: ${Math.round(e.clientX)}&nbsp;&nbsp;Y: ${Math.round(e.clientY)}`; });
        }, { passive: true });
      }
      const wh = document.getElementById("whReadout");
      const syncWh = () => { if (wh) wh.innerHTML = `W: ${innerWidth}&nbsp;&nbsp;H: ${innerHeight}`; };
      syncWh(); FD_ON(window, "resize", syncWh, { passive: true });

      /* ── below-the-fold behaviors ── */
      const header = document.getElementById("siteHeader");
      const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 20);
      onScroll();
      FD_ON(window, "scroll", onScroll, { passive: true });

      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { entry.target.classList.add("is-visible"); revealObserver.unobserve(entry.target); }
        });
      }, { threshold: .12, rootMargin: "0px 0px -8%" });
      document.querySelectorAll(".reveal").forEach((el, i) => {
        el.style.transitionDelay = `${Math.min((i % 5) * 70, 280)}ms`;
        revealObserver.observe(el);
      });

      const countObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target, target = Number(el.dataset.count), format = el.dataset.format;
          if (reduceMotion) { el.textContent = format === "comma" ? target.toLocaleString() : target; }
          else {
            const start = performance.now(), duration = target > 1000 ? 1500 : 900;
            const tick = (now) => {
              const p = clamp((now - start) / duration, 0, 1);
              const v = Math.round(target * (1 - Math.pow(1 - p, 4)));
              el.textContent = format === "comma" ? v.toLocaleString() : v;
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
          countObserver.unobserve(el);
        });
      }, { threshold: .6 });
      document.querySelectorAll("[data-count]").forEach((el) => countObserver.observe(el));

      if (window.matchMedia("(pointer:fine)").matches && !reduceMotion) {
        document.querySelectorAll(".audience-card").forEach((card) => {
          card.addEventListener("pointermove", (event) => {
            const r = card.getBoundingClientRect();
            card.style.setProperty("--card-x", (((event.clientX - r.left) / r.width - .5) * 4).toFixed(2));
            card.style.setProperty("--card-y", (((event.clientY - r.top) / r.height - .5) * 4).toFixed(2));
          });
          card.addEventListener("pointerleave", () => { card.style.setProperty("--card-x", 0); card.style.setProperty("--card-y", 0); });
        });
      }

      /* The toast serves two masters: notify() hints in EVERY context
         (board cap, PNG/Share/upload notes, export-lab ZIP note) and the
         mirror-only "Design preview" CTA copy. The element and its
         teardown exist unconditionally; only the CTA listener is gated. */
      const toastEl = document.createElement("div");
      toastEl.id = "toast"; document.body.appendChild(toastEl);
      let toastTimer = null;
      const notify = (m) => {
        toastEl.textContent = m; toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toastEl.classList.remove("show"); toastEl.textContent = ""; }, 2800);
      };
      /* "Design preview" copy is written for the static mirror, where
         CTAs can't open the real editor.

         On the live SPA this event must actually route. The wiring at the
         bottom of init only binds elements that carry [data-cta] (plus the
         nav and hero buttons) — but the funnel's own two exits don't: the
         candy button inside the ship-end overlay (#seOpen, a div) and the
         push bar once the kit is exported both DISPATCH this event instead.
         With no listener on the live host they clicked into nothing, which
         is exactly how a visitor who finished the demo hit a dead end. */
      if (/(^|\.)github\.io$/i.test(location.hostname)) {
        FD_ON(document, "ui-generator:cta", () =>
          notify("Design preview — on the live site this opens the real editor. The studio and kit are fully interactive."));
      } else {
        FD_ON(document, "ui-generator:cta", (ev) => {
          if (!ev || !ev.detail || ev.detail.hook !== "open-generator") return;
          deps.navigate("#/app");
        });
      }
      /* the DOM node lives on document.body, outside the landing root —
         it needs the same teardown the FD_ON listeners get */
      deps.signal.addEventListener("abort", () => { clearTimeout(toastTimer); toastEl.remove(); }, { once: true });
      document.querySelectorAll("[data-cta]").forEach((el) => el.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("ui-generator:cta", { detail: { hook: el.dataset.cta } }));
      }));

      /* export lab: what you get, per format */
      const EXPORTS = {
        gamekit: { tree: `<b>game-kit.zip</b>
├─ <b>unity/</b>
│  ├─ Sprites/ <em>9-slice PNGs, per state</em>
│  ├─ ui-atlas.png · ui-atlas.json
│  └─ borders.json <em>slice insets</em>
├─ <b>unreal/</b>
│  ├─ Textures/ <em>T_Btn_Primary_Default…</em>
│  └─ brushes.json <em>Slate margins</em>
├─ <b>atomic/</b> <em>every layer, separated</em>
└─ manifest.json`,
          note: "<b>Drop-in for engines.</b> Unity sprite-atlas + 9-slice borders; Unreal texture naming and UMG/Slate brush margins, ready to import.", sheet: true },
        svg: { tree: `<b>kit-export-svg/</b>
├─ <b>buttons/</b>
│  ├─ primary-default.svg
│  ├─ primary-hover.svg
│  ├─ primary-pressed.svg
│  └─ primary-disabled.svg
├─ <b>components/</b> <em>badge · toggle · bars…</em>
├─ sprite-sheet.svg <em>all-in-one</em>
└─ manifest.json`,
          note: "<b>Layered vectors — fonts named and linked, free to install.</b> Verified in Illustrator; SVG-native in Penpot; opens straight in the browser.", sheet: true },
        png: { tree: `<b>kit-export-png/</b>
├─ <b>@2x/</b>
│  ├─ primary-default@2x.png
│  ├─ primary-hover@2x.png
│  └─ …every component + state
├─ spritesheet@2x.png
└─ manifest.json`,
          note: "<b>Crisp raster, transparent backgrounds.</b> Retina-ready for any engine, tool, or storefront.", sheet: true },
        html: { tree: `<b>play-button.html</b> <em>single file</em>`,
          note: "<b>Semantic HTML + CSS. Zero dependencies.</b> A real <code>&lt;button&gt;</code> with all four states — paste it into any web project.",
          code: `<b>&lt;button</b> <i>class</i>=<em>"pb-btn"</em><b>&gt;</b>PLAY<b>&lt;/button&gt;</b>
<b>&lt;style&gt;</b>
  .pb-btn { <i>background</i>: <em>linear-gradient(…)</em>; }
  .pb-btn:hover { <i>filter</i>: <em>brightness(1.08)</em>; }
<b>&lt;/style&gt;</b>` },
        copy: { tree: `<em>→ clipboard</em>`,
          note: "<b>The exact vector, on your clipboard.</b> Paste into code, Figma, or a README.",
          code: `<b>&lt;svg</b> <i>viewBox</i>=<em>"0 0 240 64"</em><b>&gt;</b>
  <b>&lt;path</b> <i>d</i>=<em>"M18 0h204q18 0 18 18v28…"</em>
        <i>fill</i>=<em>"url(#shell)"</em><b>/&gt;</b>
  …
<b>&lt;/svg&gt;</b>` },
        settings: { tree: `<b>my-look.settings.json</b>`,
          note: "<b>Your whole look as one file.</b> Every dial you touched — re-import it anywhere, hand it to a teammate, or version it in git.",
          code: `{
  <i>"preset"</i>: <em>"grape-jelly"</em>,
  <i>"candy"</i>: { <i>"bevel"</i>: <em>14</em>, <i>"gloss"</i>: <em>0.82</em>, <i>"extrude"</i>: <em>9</em> },
  <i>"pattern"</i>: <em>"stripes"</em>,
  <i>"type"</i>: { <i>"weight"</i>: <em>800</em>, <i>"tracking"</i>: <em>2</em> }
}` }
      };
      const expView = document.getElementById("expView");
      const expMenu = document.getElementById("expMenu");
      const showExport = (key) => {
        const x = EXPORTS[key];
        expMenu.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.x === key));
        expView.dataset.x = key;
        let noteHtml = x.note;
        try { noteHtml = t("exn_" + key) || x.note; } catch (_) {} /* t is declared later; init render falls back to EN */
        expView.innerHTML = `<div class="exp-tree">${x.tree}</div>
          <div class="exp-side"><p class="exp-note">${noteHtml}</p>
          ${x.code ? `<div class="exp-code">${x.code}</div>` : ""}
          ${x.sheet ? `<div class="exp-sheet" data-sheet></div>` : ""}</div>`;
        const sheet = expView.querySelector("[data-sheet]");
        if (sheet) {
          [["#d946ef", 90, "Stripes", 86, 26], ["#d946ef", 90, "Stripes", 70, 22], ["#22d3ee", 30, "None", 70, 22],
           ["#f59e0b", 60, "Stars", 56, 20], ["#22c55e", 100, "Dots", 56, 20], ["#8b5cf6", 20, "Checker", 70, 22]]
            .forEach(([c, r, p, w, h]) => {
              const d = document.createElement("span");
              d.innerHTML = componentSvg(w, h, { color: c, round: r, shine: 78, pattern: p, label: "" });
              sheet.appendChild(d);
            });
        }
        if (!reduceMotion) expView.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 180 });
      };
      expMenu.querySelectorAll("button").forEach((b) => {
        b.addEventListener("mouseenter", () => showExport(b.dataset.x));
        b.addEventListener("focus", () => showExport(b.dataset.x));
        b.addEventListener("click", () => showExport(b.dataset.x));
      });
      showExport("gamekit");

      document.querySelectorAll(".shot-svg").forEach((el) => {
        el.innerHTML = componentSvg(+el.dataset.w, +el.dataset.h,
          { color: el.dataset.c, round: +el.dataset.r, shine: 78, pattern: el.dataset.p, label: "" });
      });

      /* gallery: REAL engine renders (renderBevel output, verbatim) */
      /* live renders straight from the embedded engine (cached per pid+state) */
      const galCfgFor = (pid) => E.AUTHORED[pid] ? authoredCfg(pid) : E.applyPresetFull(E.defaultConfig(), pid);
      const REAL = (() => { const cache = {};
        return { get: (pid, st) => (cache[pid + st] ||= tighten(E.renderBevel(galCfgFor(pid), st), 56)) }; })();
      const realHero = document.getElementById("realHero");
      const realHeroWrap = document.querySelector(".af-hero");
      if (realHero) {
        let curPid = "grape-jelly", curState = "default";
        let galCfg = galCfgFor(curPid);
        /* the app's per-state dials: brightness -30..30 · saturation -100..100 · glow 0..100 */
        const DIALS = [
          { key: "brightness", min: -30, max: 30 },
          { key: "saturation", min: -100, max: 100 },
          { key: "glow", min: 0, max: 100 }
        ];
        const galCap = document.querySelector(".af-cap");
        const setHero = () => {
          realHeroWrap.classList.remove("fx-hover", "fx-pressed", "fx-disabled");
          realHero.innerHTML = tighten(E.renderBevel(galCfg, curState), 56);
        };
        const syncDials = () => {
          if (galCap) galCap.textContent = "GLOBAL · " + curState.toUpperCase();
          document.querySelectorAll(".af-sl").forEach((row, i) => {
            const d = DIALS[i]; if (!d) return;
            const v = galCfg.states[curState][d.key];
            row.querySelector("i").style.setProperty("--f", (((v - d.min) / (d.max - d.min)) * 100).toFixed(1) + "%");
            row.querySelector("b").textContent = Math.round(v);
          });
        };
        document.querySelectorAll(".af-sl").forEach((row, i) => {
          const d = DIALS[i]; if (!d) return;
          const track = row.querySelector("i");
          row.style.cursor = "pointer";
          const seek = (ev) => {
            const r = track.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
            galCfg.states[curState][d.key] = Math.round(d.min + pct * (d.max - d.min));
            syncDials(); setHero();
          };
          row.addEventListener("pointerdown", (ev) => {
            seek(ev);
            const move = (e2) => seek(e2);
            const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
            FD_ON(window, "pointermove", move); FD_ON(window, "pointerup", up);
          });
        });
        document.querySelectorAll(".af-preset").forEach((b) => {
          b.querySelector(".rt").innerHTML = REAL.get(b.dataset.pid, "default");
          b.addEventListener("click", () => {
            document.querySelectorAll(".af-preset").forEach((x) => x.classList.remove("on"));
            b.classList.add("on");
            curPid = b.dataset.pid;
            galCfg = galCfgFor(curPid);
            syncDials(); setHero();
          });
        });
        document.querySelectorAll(".af-st").forEach((st) => {
          st.addEventListener("click", () => {
            document.querySelectorAll(".af-st").forEach((x) => x.classList.remove("on"));
            st.classList.add("on");
            curState = st.textContent.trim().split(" ")[0].toLowerCase();
            syncDials(); setHero();
          });
        });
        syncDials(); setHero();
        const exi = document.querySelector(".af-export");
        if (exi) exi.addEventListener("click", () =>
          notify("Engine kit ZIP — Unity & Unreal folders, atomic layers, manifests."));
        document.querySelectorAll(".hud-bar span").forEach((sl2) => sl2.addEventListener("click", () => {
          document.querySelectorAll(".hud-bar span").forEach((x) => x.classList.remove("on"));
          sl2.classList.add("on");
        }));
        const ammoWrap = document.querySelector(".hud-ammo");
        if (ammoWrap) ammoWrap.addEventListener("click", () => {
          const b = ammoWrap.querySelector("b");
          const v = parseInt(b.textContent, 10);
          b.textContent = v > 0 ? v - 1 : 24;
        });
        document.querySelectorAll(".hud-hearts i").forEach((h) => h.addEventListener("click", () => h.classList.toggle("on")));
      }

      /* notify() lives with the toast element now — see the toast block. */
      /* ── i18n: en · zh · fr · es · it · ja ─────────────────────── */
      const L = {
en:{l1:"Design a",l2:"UI kit in",l3:"seconds!",eyebrow:"BROWSER-BASED GAME UI TOOL",
sub:'Tweak a real button right here — color, shape, shine — then push it into a whole production-ready kit. Every pixel comes from a <em class="hl hl-w">deterministic</em> engine, <em class="hl">not AI</em>, so what you make is <em class="hl hl-w">yours</em> to ship in any game or product you sell.*',
open:"Open the generator →",signin:"Sign in",micro:"This button is live — go on, mess it up.",
t1:"Deterministic Engine",t1s:"One design language across every asset — consistency AI can\u2019t deliver.",t2:"Yours to Own",t2s:"Export, edit, and ship it in anything you sell.*",t3:"Built for Creators",t3s:"Made for game devs, designers, and studios.",
n1:"<b>Step 1 · The Master.</b> Set the DNA — color, shape, shine, pattern. Everything that follows inherits it.",
n2:"<b>Step 2 · Your Kit.</b> One press built all of this — every piece inherits your master, states included.",
n3:"<b>Step 3 · The Board.</b> <b>Upload your own image</b> — any screen or concept — drag pieces onto it, dim the backdrop, and make as many boards as you need. Export or share each one.",
n4:"<b>Exported!</b> That’s the whole loop — master → kit → board → files. Now do it for real.",
cmLbl:"PLAYER-MADE",cmTitle:"Built by players. <em>Yours to remix.</em>",cmSub:"Open any kit, remix everything — every card is drawn live in your browser from the kit's real settings, by the same engine you just played with.",cmCta:"Browse the Community Gallery →",cmRemix:"REMIX",seFlash:"GG — KIT SHIPPED.",seSub:"Master, kit, board, out the door — now make one that's really yours.",seAgain:"MAKE ANOTHER",seTour:"EXPLORE THE SITE ↓",pushHint:"Don't love something? Tweak the master and push again.",fpFaq:"FAQ",cust:"CUSTOMIZE",pushKit:"CREATE YOUR KIT",pushBoard:"PUSH TO A BOARD",pushExport:"EXPORT",pushOpen:"OPEN THE GENERATOR",shipDone:"EXPORT COMPLETE",shipLine:"Yours to ship — in any game or product you sell.*",compatLbl:"Plays nice with your stack",compatTitle:"Lands in the tools you already use.",c_rest:"Roll over a logo — here's how your kit lands there.",c_svg:"Clean SVG vectors import as fully editable paths — every component and state, named and grouped.",c_png:"Crisp transparent PNGs at 1× and 2×, cut per component and state.",c_html:"A live kit.html + kit.css — open it, inspect it, or lift the styles wholesale.",c_json:"An engine-ready JSON manifest that maps every piece, state, and size.",c_fold:"A tidy, predictable folder structure that drops straight into your project.",c_soon:"NATIVE EXPORT ON THE ROADMAP",c_unity: "Drop the zip in and the kit builds itself: nine-sliced sprites, prefabs already wired — hover and press states connected, labels dressed in your kit's exact display type — plus a press-Play playground scene. Re-exports converge in place; text stays live engine text.",c_unreal:"Box-draw margins worked out for you — native size, pixel insets and the 0–1 conversion all in the kit, with step-by-step UMG recipes.",c_godot:"Godot 4 imports SVG directly (the static SVG 1.1 profile, rendered by ThorVG) — drop the vectors in and they stay sharp at any scale, with PNG fallbacks included.",c_gm:"GameMaker takes sprites, not vectors — your kit arrives as clean transparent PNGs up to 4×, cut per component and state, ready for sprite slots and nine-slices.",c_c3:"Use the SVG Picture object (static SVG 1.1) for infinite-resolution UI, or the per-state PNGs for classic sprites — both are in the box.",c_rblx:"Roblox UI is PNG territory — transparent per-state slices sized for ImageLabels and ImageButtons, with nine-slice margins in the manifest that convert straight to SliceCenter.",c_rpgm:"Skins and sheets, ready to drop in — the kit exports PNG pieces you can compose straight into window skins and system sheets.",c_ase:"Open the 1× PNGs and retouch them pixel by pixel — every component and state imports on its own canvas.",c_figma:"Imports as structure, not a screenshot — real paths, named layers, live text. Every piece you need to augment a component or build the one the kit doesn't have, fast.",c_penpot:"Penpot is SVG-native — our vectors don't get converted, they just become your file. Every path, gradient, and group stays exactly as exported, filter effects included.",c_sketch:"Sketch imports SVG 1.1, and that's exactly what we write — named groups, real paths, live gradients in every file.",c_aff:"Affinity opens SVG 1.1, and that's exactly what we write — real curves in named groups, with per-state PNGs alongside for quick placement.",c_ps:"Photoshop rasterizes SVG on import — so place it as a Smart Object and scale it freely, or take the transparent PNGs at up to 4×, cut per component and state.",c_ai:"Verified in Illustrator — opens as a named layer tree: real paths, real gradients, live editable type, effects intact.",c_ae:"AE takes the per-state PNGs straight into motion; for true shape layers, route the SVGs through Illustrator and they convert cleanly.",c_blender:"Blender imports SVG 1.1 as curve objects — extrude your UI into diegetic 3D panels, or texture with the crisp PNGs.",c_krita:"Krita opens SVG 1.1 on vector layers — edit paths in place, or paint over the PNG exports.",c_web:"The web is home turf — inline SVG plus one self-contained HTML file with a live, clickable component you can open, inspect, or lift the CSS out of.",ks1:"BUTTONS",ks2:"INTERFACE",ks3:"CONTROLS",ks4:"METERS & TIMERS",ks5:"HUD & PLAYER",ks6:"BIG PIECES",ks7:"NEW FROM THE ENGINE",fpCommunity:"Community",fpTag:"Game-ready UI kits from one master component — drawn by a deterministic engine, never scraped.",fpCopy:"© 2026 PatternBreak. All rights reserved.",fpProdH:"PRODUCT",fpOpen:"Open the generator",fpPricing:"Pricing",fpHow:"How it works",fpLegalH:"LEGAL",fpTerms:"Terms of Use",fpPrivacy:"Privacy Policy",fpLicense:"Licensing in one line",fpNewsH:"STAY IN THE LOOP",fpNewsP:"New components, presets, and features — a short email now and then. No spam, unsubscribe anytime.",fpPh:"you@studio.com",fpGo:"SIGN ME UP",fpOk:"You're on the list — welcome aboard.",fpErr:"Hmm, that didn't go through. Mind trying again in a bit?",fpBad:"That email doesn't look quite right.",ownR1:"Every kit ships with its own recipe — every colour, token, and type setting written out, plus a settings file that loads straight back into the app.",ownR2:"Every typeface the kit uses is named, linked, and free for commercial use.",
fKit:"KIT READY",fBoard:"BOARD READY",bdCall1:"TEST YOUR DESIGNS",bdCall2:"See it in context — your kit, over real screens.",fExp:"EXPORTED",comp:"COMPONENTS",states:"STATES",ready:"READY TO DOWNLOAD",
lib:"LIBRARY",drag:"drag onto<br>the stage",color:"STYLE",round:"ROUNDNESS",shine:"SHINE",pattern:"PATTERN",label:"LABEL",rand:"RANDOMIZE",
live:"LIVE STUDIO",prev:"LIVE PREVIEW",yours:"YOUR DESIGN",up1:"⭱ yourworld.png — uploading…",up2:"✓ yourworld.png — background set",
upBtn:"⭱ UPLOAD YOUR IMAGE",dim:"VIGNETTE",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ SHARE",maxB:"Four boards in the demo — the app is unlimited.",
upMsg:"In the real app: drop in any PNG or JPG — your concept art, your screenshot, your world.",
pngMsg:"Each board exports as a full-resolution PNG artboard.",shareMsg:"Every board gets a read-only share link teammates can open.",
sb1t:"1 MASTER COMPONENT",sb1s:"Infinite variations.",sb2t:"90+ COMPONENTS",sb2s:"Every essential.",sb3t:"4 STATES",sb3s:"Always in sync.",sb4t:"EXPORT ANYWHERE",sb4s:"Engines, web, PNG, SVG.",galL:"Straight from the app",galT:"The real thing, three screens deep.",
audT:"Built for anyone who ships",ownT:"No AI. No templates. <em>No gray areas.</em>",ownB:"Yours, for real",
stepsT:"How it works.",finalT:'Start building —<br><span class="f2-grad">nothing to install.</span>',scroll:"Scroll to multiply",
hint1:"push to fill · scroll for more",hint2:"scroll for more",kitPrev:"KIT PREVIEW (INHERITED)",stLive:"STATES (LIVE PREVIEW)",stDef:"DEFAULT",stHov:"HOVER",stPre:"PRESSED",
audL:"From side quest to shipped",audSub:"No gatekeeping, no install, no waiting for a specialist to free up. Just a real design system you can play.",
aud1t:"GAME DEVS",aud1p:"Ship polished UI that levels up your game.",aud2t:"INDIE &amp; SMALL STUDIOS",aud2p:"Punch above your weight with a cohesive UI system.",aud3t:"HOBBYISTS &amp; MAKERS",aud3p:"Make the side project look shipped, not sketched.",aud4t:"STUDENTS",aud4p:"Learn design systems by building with a real one.",aud5t:"UI ARTISTS",aud5p:"Super-charge your workflow. Design faster. Explore more.",aud6t:"PROTOTYPERS &amp; NO-CODE",aud6p:"Drop beautiful, exportable UI into any tool or engine.",
ownP:"Every kit is drawn by a deterministic design engine — not a model trained on other people\u2019s work. Nothing is scraped, nothing is \u201cin the style of\u201d someone else. What you make is unique to your settings — use it in anything you ship or sell. One line the license draws: the kits and assets themselves can\u2019t be resold or redistributed as assets.",
sealSm:"PatternBreak / provenance certificate",sealYours:"YOURS.",sealSig:"Deterministic by design",
stepsL:"Three moves. One complete system.",s1t:"Design the master",s1p:"Tune one component — silhouette, material, type, and its four states.",s2t:"Generate the kit",s2p:"One model fans out to every component and size, live on the canvas.",s3t:"Export or share",s3p:"Download an engine kit, HTML, SVG, or PNG — or publish a live link.",
finalP:'The editor runs entirely in your browser. Start with <b class="f2-hl">Free Explorer</b>, then upgrade when you\u2019re ready for the full production toolkit.',finalBtn:"START BUILDING",footTerms:"Terms",footPriv:"Privacy",
galC1:'<b>The Editor.</b> Every dial from the hero — and a hundred more. States live on the right, presets one click away.',
galC2:'<b>The Kit.</b> Your design becomes a living guideline sheet — layers, roles, and every component documented.',
galC3:'<b>The Board — the big payoff.</b> Stage your kit over real screens, tune the backdrop, export artboards.',
galC4:'<b>Shipped.</b> One master design → a complete HUD: hearts, minimap, hotbar, ammo. Every piece from the same DNA.',
galC5:'<b>Yours, in every format — roll over each one.</b> Engine-ready structure for Unity and Unreal, layered vectors for design tools, clean HTML for the web.',
exm_gamekit:"Export game kit",exm_svg:"Export SVG",exm_png:"Export PNG 2×",exm_html:"Download HTML",exm_copy:"Copy SVG code",exm_settings:"Export settings",
exn_gamekit:'<b>Drop-in for engines.</b> Unity sprite-atlas + 9-slice borders; Unreal texture naming and UMG/Slate brush margins, ready to import.',
exn_svg:'<b>Layered vectors \u2014 fonts named and linked, free to install.</b> Verified in Illustrator; SVG-native in Penpot; opens straight in the browser.',
exn_png:'<b>Crisp raster, transparent backgrounds.</b> Retina-ready for any engine, tool, or storefront.',
exn_html:'<b>Semantic HTML + CSS. Zero dependencies.</b> A real <code>&lt;button&gt;</code> with all four states — paste it into any web project.',
exn_copy:'<b>The exact vector, on your clipboard.</b> Paste into code, Figma, or a README.',
exn_settings:'<b>Your whole look as one file.</b> Every dial you touched — re-import it anywhere, hand it to a teammate, or version it in git.',
iterP:"And it never locks: pop back to the master, turn a dial, and the whole system re-flows — kit, boards, exports. Iterate toward what\u2019s best for the whole. (Also, it\u2019s just fun to keep playing.)",
fontL:"FONT",bgL:"BACKGROUND",extrL:"EXTRUSION",dsgnL:"DESIGN",resetL:"RESET",
pg:"Family filter is on out here — the full app takes it off.",
tcolL:"FONT COLOR",stDis:"DISABLED",licN:"* Licensing, in one line: ship your kits inside any game or product — commercial included. The kit and its asset files may not be resold or redistributed as assets, templates, or asset packs. See the Terms of Use.",
fin1t:"BROWSER-BASED",fin1s:"No installs",fin2t:"DETERMINISTIC",fin2s:"Not AI",fin3t:"GAME-READY",fin3s:"Export anywhere",fin4t:"YOURS TO SHIP",fin4s:"Sell &amp; own*",finFree:"Selected kits and limited PNG exports included free.",
auT1:"Welcome back",auT2:"Create your account",auIn:"SIGN IN",auUp:"CREATE ACCOUNT",auEmail:"EMAIL",auPass:"PASSWORD",auFgt:"Forgot password?",auGo1:"SIGN IN",auGo2:"CREATE ACCOUNT",auOr:"or",auMagic:"✉ EMAIL ME A SIGN-IN LINK",auFreeL:"Free Explorer — no card needed.",auTerms:"I agree to the Terms — and the license: ship anything, just don\u2019t resell the assets.",auHi:"PLAYER 1",auOkT:"Signed in",auOkP:"Opening your studio for",auDoneT:"Account created",auDoneP:"Welcome aboard — opening the editor for",auSentT2:"Check your inbox",auSentP2:"We sent a sign-in link to",auRstT:"Reset link sent",auRstP:"Password reset instructions are on their way to",auBackL:"Back",bgsL:"BACKDROPS"},
zh:{l1:"几秒钟，",l2:"做出一整套",l3:"游戏 UI！",eyebrow:"浏览器端游戏 UI 工具",
sub:'就在这里调一个真实按钮——颜色、形状、光泽——然后一键生成一整套可直接上线的组件库。每个像素都来自<em class="hl hl-w">确定性</em>引擎，<em class="hl">不是 AI</em>，你做出的一切都可以用在任何你发售的游戏或产品中。*',
open:"打开生成器 →",signin:"登录",micro:"这个按钮是活的——来，随便玩。",
t1:"确定性引擎",t1s:"所有素材共享同一套设计语言——这是 AI 无法保证的一致性。",t2:"完全归你",t2s:"导出、编辑，用在任何你销售的产品里。*",t3:"为创作者而生",t3s:"面向游戏开发者、设计师与工作室。",
n1:"<b>第 1 步 · 母版。</b>设定 DNA——颜色、形状、光泽、图案。之后的一切都会继承它。",
n2:"<b>第 2 步 · 你的组件库。</b>一次点击生成全部——每个组件都继承母版，包含所有状态。",
n3:"<b>第 3 步 · 画板。</b><b>上传你自己的图片</b>——任意画面或概念图——拖入组件、调暗背景，画板想建几块就建几块，每块都能导出或分享。",
n4:"<b>已导出！</b>完整流程走完了——母版 → 组件库 → 画板 → 文件。去正式版试试吧。",
cmLbl:"玩家出品",cmTitle:"玩家打造。<em>任你重混。</em>",cmSub:"打开任何套件,重混一切——每张卡片都由同一个引擎,根据套件的真实设置在你的浏览器中实时绘制。",cmCta:"浏览社区画廊 →",cmRemix:"重混",seFlash:"GG——套件已出厂。",seSub:"母版、套件、画板、出厂——现在做一个真正属于你的。",seAgain:"再做一个",seTour:"逛逛网站 ↓",pushHint:"还不满意?回到母版调整,再创建一次。",fpFaq:"常见问题",cust:"自定义",pushKit:"创建你的组件库",pushBoard:"进入画板",pushExport:"导出",pushOpen:"打开生成器",shipDone:"导出完成",shipLine:"归你所有 — 可用于任何你销售的游戏或产品。*",compatLbl:"兼容你的工作流",compatTitle:"直接落地到你常用的工具。",c_rest:"将鼠标悬停在图标上,查看套件如何进入该工具。",c_svg:"干净的 SVG 矢量可直接导入并完全编辑 — 每个组件和状态都已命名分组。",c_png:"清晰的透明 PNG(1× 与 2×),按组件和状态切分。",c_html:"附带可运行的 kit.html 与 kit.css — 可直接打开、检查或整体套用样式。",c_json:"引擎可用的 JSON 清单,映射每个组件、状态和尺寸。",c_fold:"整洁可预期的文件夹结构,可直接放入项目。",c_soon:"原生导出即将推出",c_unity: "拖入压缩包，套件自动搭建：九宫格已切好的精灵、连线完毕的预制体——悬停和按下状态已接好，标签用的正是套件的显示字体——还附一个按 Play 即玩的演练场景。重复导出原地收敛；文本始终是引擎实时文本。",c_unreal:"Box 绘制边距已为你算好——原生尺寸、像素内边距和 0–1 换算都在套件里,并附分步 UMG 教程。",c_godot:"Godot 4 可直接导入 SVG(静态 SVG 1.1,由 ThorVG 渲染)——矢量放入后任意缩放都清晰,并附 PNG 备用。",c_gm:"GameMaker 用的是精灵而非矢量——套件以干净的透明 PNG(最高 4×)到达,按组件和状态切分,可直接用于精灵槽位和九宫格。",c_c3:"用 SVG Picture 对象(静态 SVG 1.1)获得无限分辨率的 UI,或用按状态切分的 PNG 做经典精灵——两者都在包里。",c_rblx:"Roblox 的 UI 是 PNG 的领域——透明的按状态切片,适配 ImageLabel 和 ImageButton,清单中的九宫格边距可直接换算为 SliceCenter。",c_rpgm:"即放即用的皮肤与素材表——套件导出的 PNG 可直接拼进窗口皮肤和系统素材表。",c_ase:"打开 1× PNG 逐像素修饰——每个组件和状态都在独立画布上导入。",c_figma:"导入的是结构,而不是截图——真实路径、命名图层、可编辑文本。增强某个组件、或搭建套件中还没有的那个组件,所需的一切都在,而且快。",c_penpot:"Penpot 以 SVG 为原生格式——我们的矢量无需转换,直接成为你的文件。每条路径、渐变和分组都保持原样,滤镜效果也包括在内。",c_sketch:"Sketch 导入 SVG 1.1,而这正是我们输出的格式——每个文件都是命名分组、真实路径与实时渐变。",c_aff:"Affinity 打开 SVG 1.1,而这正是我们输出的格式——命名分组中的真实曲线,另附按状态的 PNG 便于快速摆放。",c_ps:"Photoshop 导入 SVG 时会栅格化——可作为智能对象置入并自由缩放,或直接使用最高 4× 的透明 PNG,按组件和状态切分。",c_ai:"已在 Illustrator 实测——以命名图层树打开:真实路径、真实渐变、可编辑的实时文字,效果完整保留。",c_ae:"AE 可直接用按状态的 PNG 做动效;需要真正的形状图层时,经 Illustrator 转换 SVG 即可。",c_blender:"Blender 将 SVG 1.1 导入为曲线对象——把 UI 挤出成 3D 面板,或用清晰的 PNG 作贴图。",c_krita:"Krita 在矢量图层上打开 SVG 1.1——就地编辑路径,或在 PNG 导出上作画。",c_web:"Web 是主场——内联 SVG,加上一个自包含的 HTML 文件,内含可点击的实时组件,可打开、检查或直接取用其 CSS。",ks1:"按钮",ks2:"界面",ks3:"控件",ks4:"仪表与计时",ks5:"HUD与玩家",ks6:"大型组件",ks7:"引擎新组件",fpCommunity:"社区",fpTag:"从一个母版组件生成游戏级 UI 套件——由确定性引擎绘制,绝不抓取他人作品。",fpCopy:"© 2026 PatternBreak。保留所有权利。",fpProdH:"产品",fpOpen:"打开生成器",fpPricing:"价格",fpHow:"工作原理",fpLegalH:"法律",fpTerms:"使用条款",fpPrivacy:"隐私政策",fpLicense:"授权一句话",fpNewsH:"保持联系",fpNewsP:"新组件、新预设、新功能——偶尔一封简短邮件。不发垃圾邮件,随时退订。",fpPh:"you@studio.com",fpGo:"订阅",fpOk:"已加入列表——欢迎!",fpErr:"好像没发送成功,稍后再试一次?",fpBad:"这个邮箱看起来不太对。",ownR1:"每个套件都附带自己的配方——每个颜色、令牌和排版设置全部写明,外加一个可直接载回应用的设置文件。",ownR2:"套件使用的每款字体都已注明名称、附上链接,并可免费商用。",
fKit:"组件库就绪",fBoard:"画板就绪",bdCall1:"检验你的设计",bdCall2:"在真实画面中查看你的套件效果。",fExp:"已导出",comp:"个组件",states:"种状态",ready:"随时可下载",
lib:"素材库",drag:"拖到<br>舞台上",color:"风格",round:"圆角",shine:"光泽",pattern:"图案",label:"文字",rand:"随机",
live:"实时工作室",prev:"实时预览",yours:"你的设计",up1:"⭱ yourworld.png — 上传中…",up2:"✓ yourworld.png — 背景已设置",
upBtn:"⭱ 上传你的图片",dim:"暗角",boardW:"画板",addB:"+ 画板",pngB:"⭳ PNG",shareB:"⤴ 分享",maxB:"演示最多四块画板——正式版不限。",
upMsg:"正式应用中：拖入任意 PNG/JPG——你的概念图、截图、你的世界。",
pngMsg:"每块画板都可导出为全分辨率 PNG。",shareMsg:"每块画板都有只读分享链接，队友可直接打开。",
sb1t:"1 个母版组件",sb1s:"无限变化。",sb2t:"90+ 个组件",sb2s:"应有尽有。",sb3t:"4 种状态",sb3s:"永远同步。",sb4t:"随处导出",sb4s:"引擎、Web、PNG、SVG。",galL:"来自真实应用",galT:"真实产品，三个界面。",
audT:"为每一个想发布作品的人而生",ownT:"没有 AI。没有模板。<em>没有灰色地带。</em>",ownB:"真正属于你",
stepsT:"如何运作",finalT:'开始创作——<br><span class="f2-grad">无需安装。</span>',scroll:"下滑查看更多",
hint1:"点击填充 · 滚动查看更多",hint2:"滚动查看更多",kitPrev:"组件库预览（继承）",stLive:"状态（实时预览）",stDef:"默认",stHov:"悬停",stPre:"按下",
audL:"从业余项目到正式发布",audSub:"没有门槛，无需安装，不用等专家有空。一个真正能上手玩的设计系统。",
aud1t:"游戏开发者",aud1p:"交付精致的 UI，让你的游戏更上一层楼。",aud2t:"独立与小型工作室",aud2p:"用一套统一的 UI 系统，打出超越体量的水准。",aud3t:"业余爱好者与创客",aud3p:"让副业项目看起来像正式发布，而不是草稿。",aud4t:"学生",aud4p:"通过真实的设计系统边做边学。",aud5t:"UI 设计师",aud5p:"给工作流提速。设计更快，探索更多。",aud6t:"原型与无代码",aud6p:"把精美、可导出的 UI 放进任何工具或引擎。",
ownP:"每套组件都由确定性设计引擎绘制——不是用他人作品训练出来的模型。没有任何抓取，也不是模仿谁的风格。你做出的东西由你的参数唯一决定，可以用在任何你发布或销售的产品中。许可证只有一条界线：组件和素材本身不得作为素材转售或再分发。",
sealSm:"PatternBreak / 来源证书",sealYours:"归你。",sealSig:"以确定性为本",
stepsL:"三步，一套完整系统。",s1t:"设计母版",s1p:"调好一个组件——轮廓、材质、文字，以及四种状态。",s2t:"生成组件库",s2p:"一个母版扩展到所有组件与尺寸，画布上实时呈现。",s3t:"导出或分享",s3p:"下载引擎套件、HTML、SVG 或 PNG——或发布一个在线链接。",
finalP:'编辑器完全在浏览器中运行。从 <b class="f2-hl">Free Explorer</b> 开始，准备好后再升级到完整的生产工具箱。',finalBtn:"开始创作",footTerms:"条款",footPriv:"隐私",
galC1:'<b>编辑器。</b>主页上的每个旋钮——还有上百个。状态在右侧实时显示，预设一键切换。',
galC2:'<b>组件库。</b>你的设计变成一份活的规范表——图层、角色、每个组件都有记录。',
galC3:'<b>画板——最大的惊喜。</b>把组件铺在真实画面上，调节背景，导出画板。',
galC4:'<b>发布。</b>一个母版设计 → 一整套 HUD：血量、迷你地图、快捷栏、弹药。每一件都来自同一 DNA。',
galC5:'<b>任何格式都归你——逐个悬停看看。</b>Unity 和 Unreal 的引擎级结构、设计工具的分层矢量、Web 的干净 HTML。',
exm_gamekit:"导出游戏套件",exm_svg:"导出 SVG",exm_png:"导出 PNG 2×",exm_html:"下载 HTML",exm_copy:"复制 SVG 代码",exm_settings:"导出设置",
exn_gamekit:'<b>引擎即插即用。</b>Unity 精灵图集 + 九宫格切片；Unreal 纹理命名与 UMG/Slate 笔刷边距，导入即用。',
exn_svg:'<b>分层矢量,字体注明并附链接、可免费安装。</b>已在 Illustrator 实测;Penpot 原生支持;浏览器直接打开。',
exn_png:'<b>清晰位图，透明背景。</b>Retina 级质量，适用于任何引擎、工具或商店。',
exn_html:'<b>语义化 HTML + CSS，零依赖。</b>一个真正的 <code>&lt;button&gt;</code>，带全部四种状态——粘进任何 Web 项目。',
exn_copy:'<b>精确的矢量，直接进剪贴板。</b>粘到代码、Figma 或 README 里。',
exn_settings:'<b>整套外观，一个文件。</b>你调过的每个参数——随处重新导入、交给队友或用 git 管理版本。',
iterP:"而且它永远不会锁死：随时回到母版，转一个旋钮，整个系统随之更新——组件库、画板、导出。朝着整体最优不断迭代。（而且，一直玩下去真的很有趣。）",
fontL:"字体",bgL:"背景",extrL:"立体挤出",dsgnL:"设计",resetL:"重置",
pg:"主页开启了文明用语过滤——正式版可关闭。",
tcolL:"文字颜色",stDis:"禁用",licN:"* 许可证一句话:可将组件用于任何产品(包括商业产品)——但不得将组件或素材本身作为素材、模板或素材包转售或再分发。详见《使用条款》。",
fin1t:"浏览器直达",fin1s:"无需安装",fin2t:"确定性引擎",fin2s:"不是 AI",fin3t:"游戏就绪",fin3s:"随处导出",fin4t:"归你所有",fin4s:"可售可发布*",finFree:"精选组件库与有限 PNG 导出免费提供。",
auT1:"欢迎回来",auT2:"创建你的账户",auIn:"登录",auUp:"注册",auEmail:"邮箱",auPass:"密码",auFgt:"忘记密码？",auGo1:"登录",auGo2:"创建账户",auOr:"或",auMagic:"✉ 给我发送登录链接",auFreeL:"Free Explorer——无需绑卡。",auTerms:"我同意条款与许可证：可用于任何产品，但不得转售素材本身。",auHi:"玩家 1",auOkT:"已登录",auOkP:"正在为以下账号打开工作室：",auDoneT:"账户已创建",auDoneP:"欢迎加入——正在为以下账号打开编辑器：",auSentT2:"请查收邮箱",auSentP2:"登录链接已发送至",auRstT:"重置链接已发送",auRstP:"密码重置说明已发送至",auBackL:"返回",bgsL:"背景"},
fr:{l1:"Créez un",l2:"kit UI en",l3:"secondes !",eyebrow:"OUTIL D’UI DE JEU DANS LE NAVIGATEUR",
sub:'Réglez un vrai bouton ici — couleur, forme, brillance — puis transformez-le en kit complet, prêt pour la production. Chaque pixel vient d\u2019un moteur <em class="hl hl-w">déterministe</em>, <em class="hl">pas d\u2019IA</em> : ce que vous créez peut partir dans n\u2019importe quel jeu ou produit que vous vendez.*',
open:"Ouvrir le générateur →",signin:"Connexion",micro:"Ce bouton est vivant — allez-y, amusez-vous.",
t1:"Moteur déterministe",t1s:"Un même langage de design sur chaque asset — une cohérence que l\u2019IA ne peut pas garantir.",t2:"Vraiment à vous",t2s:"Exportez, éditez, intégrez-le à tout ce que vous vendez.*",t3:"Pensé pour les créateurs",t3s:"Pour devs de jeux, designers et studios.",
n1:"<b>Étape 1 · Le master.</b> Définissez l’ADN — couleur, forme, brillance, motif. Tout le reste en hérite.",
n2:"<b>Étape 2 · Votre kit.</b> Un clic a tout construit — chaque pièce hérite du master, états compris.",
n3:"<b>Étape 3 · Le board.</b> <b>Importez votre propre image</b> — écran ou concept — glissez vos pièces, tamisez le fond, créez autant de boards que voulu. Exportez ou partagez chacun.",
n4:"<b>Exporté !</b> La boucle est bouclée — master → kit → board → fichiers. À vous de jouer.",
cmLbl:"CRÉÉ PAR LES JOUEURS",cmTitle:"Fait par des joueurs. <em>À vous de remixer.</em>",cmSub:"Ouvrez n'importe quel kit, remixez tout — chaque carte est dessinée en direct dans votre navigateur à partir des vrais réglages du kit.",cmCta:"Parcourir la galerie communautaire →",cmRemix:"REMIX",seFlash:"GG — KIT LIVRÉ.",seSub:"Master, kit, board, expédié — à vous d'en faire un vrai.",seAgain:"EN FAIRE UN AUTRE",seTour:"EXPLORER LE SITE ↓",pushHint:"Un détail qui cloche ? Retouchez le master et recréez le kit.",fpFaq:"FAQ",cust:"PERSONNALISER",pushKit:"CRÉEZ VOTRE KIT",pushBoard:"VERS LE BOARD",pushExport:"EXPORTER",pushOpen:"OUVRIR LE GÉNÉRATEUR",shipDone:"EXPORT TERMINÉ",shipLine:"À vous — dans tout jeu ou produit que vous vendez.*",compatLbl:"Compatible avec vos outils",compatTitle:"Atterrit dans les outils que vous utilisez déjà.",c_rest:"Survolez un logo — voici comment votre kit y atterrit.",c_svg:"Des vecteurs SVG propres, entièrement éditables — chaque composant et état, nommé et groupé.",c_png:"Des PNG transparents et nets en 1× et 2×, découpés par composant et par état.",c_html:"Un kit.html + kit.css vivants — à ouvrir, inspecter ou réutiliser tels quels.",c_json:"Un manifeste JSON prêt pour le moteur, qui répertorie chaque pièce, état et taille.",c_fold:"Une arborescence propre et prévisible, à glisser directement dans votre projet.",c_soon:"EXPORT NATIF SUR LA ROADMAP",c_unity: "Déposez le zip et le kit se construit tout seul : sprites nine-slice découpés, prefabs déjà câblés — états hover et pressed connectés, labels dans la typo exacte du kit — plus une scène playground prête à jouer. Les ré-exports convergent sur place ; le texte reste du texte moteur vivant.",c_unreal:"Les marges Box-draw calculées pour vous — taille native, insets en pixels et conversion 0–1, le tout dans le kit, avec des recettes UMG pas à pas.",c_godot:"Godot 4 importe le SVG directement (profil statique SVG 1.1, rendu par ThorVG) — vos vecteurs restent nets à toute échelle, PNG de secours inclus.",c_gm:"GameMaker veut des sprites, pas des vecteurs — le kit arrive en PNG transparents propres jusqu'en 4×, découpés par composant et état, prêts pour les slots de sprites et le nine-slice.",c_c3:"Utilisez l'objet SVG Picture (SVG 1.1 statique) pour une UI en résolution infinie, ou les PNG par état pour des sprites classiques — les deux sont fournis.",c_rblx:"L'UI Roblox, c'est du PNG — des découpes transparentes par état, dimensionnées pour ImageLabel et ImageButton, avec des marges nine-slice dans le manifeste qui se convertissent directement en SliceCenter.",c_rpgm:"Skins et planches prêtes à poser — le kit exporte des pièces PNG à composer directement en window skins et planches système.",c_ase:"Ouvrez les PNG 1× et retouchez pixel par pixel — chaque composant et état s'importe sur son propre canevas.",c_figma:"S'importe comme structure, pas comme capture d'écran — vrais tracés, calques nommés, texte éditable. Tout ce qu'il faut pour augmenter un composant ou construire celui qui manque au kit, vite.",c_penpot:"Penpot est SVG natif — nos vecteurs ne sont pas convertis, ils deviennent votre fichier. Chaque tracé, dégradé et groupe reste exactement tel quel, effets de filtre compris.",c_sketch:"Sketch importe le SVG 1.1, et c'est exactement ce que nous écrivons — groupes nommés, vrais tracés, dégradés vivants dans chaque fichier.",c_aff:"Affinity ouvre le SVG 1.1, et c'est exactement ce que nous écrivons — de vraies courbes en groupes nommés, plus des PNG par état pour la mise en place rapide.",c_ps:"Photoshop rastérise le SVG à l'import — placez-le en objet dynamique et changez d'échelle librement, ou prenez les PNG transparents jusqu'en 4×, découpés par composant et par état.",c_ai:"Vérifié dans Illustrator — s'ouvre en arborescence de calques nommés : vrais tracés, vrais dégradés, texte éditable en direct, effets intacts.",c_ae:"AE anime directement les PNG par état ; pour de vrais calques de forme, passez les SVG par Illustrator, la conversion est propre.",c_blender:"Blender importe le SVG 1.1 en courbes — extrudez votre UI en panneaux 3D diégétiques, ou texturez avec les PNG nets.",c_krita:"Krita ouvre le SVG 1.1 sur des calques vectoriels — éditez les tracés sur place, ou peignez par-dessus les exports PNG.",c_web:"Le web, c'est la maison — SVG inline plus un fichier HTML autonome avec un composant vivant et cliquable, à ouvrir, inspecter ou dont on extrait le CSS.",ks1:"BOUTONS",ks2:"INTERFACE",ks3:"CONTRÔLES",ks4:"JAUGES & CHRONOS",ks5:"HUD & JOUEUR",ks6:"GRANDES PIÈCES",ks7:"NOUVEAUTÉS DU MOTEUR",fpCommunity:"Communauté",fpTag:"Des kits UI prêts pour le jeu à partir d'un seul composant maître — dessinés par un moteur déterministe, jamais scrapés.",fpCopy:"© 2026 PatternBreak. Tous droits réservés.",fpProdH:"PRODUIT",fpOpen:"Ouvrir le générateur",fpPricing:"Tarifs",fpHow:"Comment ça marche",fpLegalH:"LÉGAL",fpTerms:"Conditions d'utilisation",fpPrivacy:"Politique de confidentialité",fpLicense:"La licence en une ligne",fpNewsH:"RESTONS EN CONTACT",fpNewsP:"Nouveaux composants, presets et fonctionnalités — un court e-mail de temps en temps. Pas de spam, désinscription à tout moment.",fpPh:"vous@studio.com",fpGo:"JE M'INSCRIS",fpOk:"Vous êtes sur la liste — bienvenue à bord.",fpErr:"Hmm, ça n'est pas passé. On réessaie dans un instant ?",fpBad:"Cet e-mail ne semble pas valide.",ownR1:"Chaque kit part avec sa recette — chaque couleur, token et réglage typo écrit noir sur blanc, plus un fichier de réglages qui se recharge directement dans l’app.",ownR2:"Chaque police utilisée par le kit est nommée, liée et libre pour un usage commercial.",
fKit:"KIT PRÊT",fBoard:"BOARD PRÊT",bdCall1:"TESTEZ VOS DESIGNS",bdCall2:"Voyez-le en contexte — votre kit sur de vrais écrans.",fExp:"EXPORTÉ",comp:"COMPOSANTS",states:"ÉTATS",ready:"PRÊTS À TÉLÉCHARGER",
lib:"BIBLIOTHÈQUE",drag:"glissez sur<br>la scène",color:"STYLE",round:"ARRONDI",shine:"BRILLANCE",pattern:"MOTIF",label:"TEXTE",rand:"ALÉATOIRE",
live:"STUDIO LIVE",prev:"APERÇU LIVE",yours:"VOTRE DESIGN",up1:"⭱ yourworld.png — envoi…",up2:"✓ yourworld.png — fond appliqué",
upBtn:"⭱ IMPORTEZ VOTRE IMAGE",dim:"VIGNETTE",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ PARTAGER",maxB:"Quatre boards dans la démo — illimité dans l’app.",
upMsg:"Dans l’app : déposez n’importe quel PNG/JPG — concept art, capture, votre monde.",
pngMsg:"Chaque board s’exporte en PNG pleine résolution.",shareMsg:"Chaque board a un lien de partage en lecture seule.",
sb1t:"1 COMPOSANT MASTER",sb1s:"Variations infinies.",sb2t:"90+ COMPOSANTS",sb2s:"Tous les essentiels.",sb3t:"4 ÉTATS",sb3s:"Toujours synchronisés.",sb4t:"EXPORT PARTOUT",sb4s:"Moteurs, web, PNG, SVG.",galL:"Tout droit de l’app",galT:"Le vrai produit, trois écrans.",
audT:"Pour tous ceux qui publient",ownT:"Pas d’IA. Pas de templates. <em>Pas de zones grises.</em>",ownB:"À vous, vraiment",
stepsT:"Comment ça marche",finalT:'Commencez à créer —<br><span class="f2-grad">rien à installer.</span>',scroll:"Défilez pour multiplier",
hint1:"cliquez pour remplir · faites défiler",hint2:"faites défiler",kitPrev:"APERÇU DU KIT (HÉRITÉ)",stLive:"ÉTATS (APERÇU LIVE)",stDef:"DÉFAUT",stHov:"SURVOL",stPre:"PRESSÉ",
audL:"Du projet perso au produit livré",audSub:"Pas de barrières, rien à installer, pas d\u2019attente. Juste un vrai design system avec lequel jouer.",
aud1t:"DÉVELOPPEURS DE JEUX",aud1p:"Livrez une UI soignée qui élève votre jeu.",aud2t:"INDÉS &amp; PETITS STUDIOS",aud2p:"Jouez dans la cour des grands avec un système d\u2019UI cohérent.",aud3t:"AMATEURS &amp; MAKERS",aud3p:"Donnez au projet perso l\u2019air d\u2019un produit fini, pas d\u2019une esquisse.",aud4t:"ÉTUDIANTS",aud4p:"Apprenez les design systems en construisant avec un vrai.",aud5t:"UI ARTISTS",aud5p:"Boostez votre workflow. Concevez plus vite. Explorez plus.",aud6t:"PROTOTYPEURS &amp; NO-CODE",aud6p:"Déposez une UI superbe et exportable dans n\u2019importe quel outil ou moteur.",
ownP:"Chaque kit est dessiné par un moteur de design déterministe — pas un modèle entraîné sur le travail des autres. Rien n\u2019est aspiré, rien n\u2019est « à la manière de ». Ce que vous créez est unique à vos réglages — utilisez-le dans tout ce que vous publiez ou vendez. Une seule limite dans la licence : les kits et assets eux-mêmes ne peuvent pas être revendus ni redistribués en tant qu\u2019assets.",
sealSm:"PatternBreak / certificat de provenance",sealYours:"À VOUS.",sealSig:"Déterministe par conception",
stepsL:"Trois gestes. Un système complet.",s1t:"Concevez le master",s1p:"Réglez un composant — silhouette, matière, typo et ses quatre états.",s2t:"Générez le kit",s2p:"Un modèle se déploie sur chaque composant et chaque taille, en direct sur le canvas.",s3t:"Exportez ou partagez",s3p:"Téléchargez un kit moteur, HTML, SVG ou PNG — ou publiez un lien live.",
finalP:'L\u2019éditeur tourne entièrement dans votre navigateur. Commencez avec <b class="f2-hl">Free Explorer</b>, puis passez au niveau supérieur pour la boîte à outils complète.',finalBtn:"COMMENCER",footTerms:"Conditions",footPriv:"Confidentialité",
galC1:'<b>L\u2019éditeur.</b> Chaque réglage du hero — et une centaine d\u2019autres. Les états vivent à droite, les presets à un clic.',
galC2:'<b>Le kit.</b> Votre design devient une planche de référence vivante — calques, rôles, chaque composant documenté.',
galC3:'<b>Le board — la grande récompense.</b> Mettez votre kit en scène sur de vrais écrans, réglez le fond, exportez des planches.',
galC4:'<b>Livré.</b> Un master → un HUD complet : c\u0153urs, minimap, hotbar, munitions. Chaque pièce du même ADN.',
galC5:'<b>À vous, dans tous les formats — survolez-les.</b> Structure prête pour Unity et Unreal, vecteurs en calques pour les outils de design, HTML propre pour le web.',
exm_gamekit:"Exporter le kit jeu",exm_svg:"Exporter en SVG",exm_png:"Exporter en PNG 2×",exm_html:"Télécharger le HTML",exm_copy:"Copier le code SVG",exm_settings:"Réglages d\u2019export",
exn_gamekit:'<b>Prêt pour les moteurs.</b> Atlas de sprites Unity + bordures 9-slice ; nommage des textures Unreal et marges UMG/Slate, prêts à importer.',
exn_svg:'<b>Vecteurs en calques \u2014 polices nommées et liées, libres à installer.</b> Vérifié dans Illustrator ; natif dans Penpot ; s\u2019ouvre direct dans le navigateur.',
exn_png:'<b>Raster net, fonds transparents.</b> Qualité Retina pour tout moteur, outil ou boutique.',
exn_html:'<b>HTML + CSS sémantique. Zéro dépendance.</b> Un vrai <code>&lt;button&gt;</code> avec ses quatre états — à coller dans n\u2019importe quel projet web.',
exn_copy:'<b>Le vecteur exact, dans votre presse-papiers.</b> Collez-le dans du code, Figma ou un README.',
exn_settings:'<b>Tout votre look en un fichier.</b> Chaque réglage touché — réimportez-le partout, passez-le à un coéquipier ou versionnez-le dans git.',
iterP:"Et rien n\u2019est figé : revenez au master, tournez un réglage, et tout le système se met à jour — kit, boards, exports. Itérez vers ce qui sert le mieux l\u2019ensemble. (Et puis, continuer à jouer, c\u2019est un vrai plaisir.)",
fontL:"POLICE",bgL:"FOND",extrL:"EXTRUSION",dsgnL:"DESIGN",resetL:"RÉTABLIR",
pg:"Filtre familial sur la page d\u2019accueil — l\u2019app complète le désactive.",
tcolL:"COULEUR TEXTE",stDis:"DÉSACTIVÉ",licN:"* La licence en une ligne : intégrez vos kits à tout produit, commercial compris — mais le kit et ses assets ne peuvent pas être revendus ni redistribués comme assets, templates ou packs. Voir les Conditions d'utilisation.",
fin1t:"DANS LE NAVIGATEUR",fin1s:"Zéro installation",fin2t:"DÉTERMINISTE",fin2s:"Pas d\u2019IA",fin3t:"PRÊT POUR LE JEU",fin3s:"Export partout",fin4t:"À VOUS",fin4s:"Vendez et publiez*",finFree:"Kits sélectionnés et exports PNG limités inclus gratuitement.",
auT1:"Bon retour",auT2:"Créez votre compte",auIn:"CONNEXION",auUp:"CRÉER UN COMPTE",auEmail:"E-MAIL",auPass:"MOT DE PASSE",auFgt:"Mot de passe oublié ?",auGo1:"SE CONNECTER",auGo2:"CRÉER LE COMPTE",auOr:"ou",auMagic:"✉ RECEVOIR UN LIEN DE CONNEXION",auFreeL:"Free Explorer — sans carte bancaire.",auTerms:"J\u2019accepte les Conditions — et la licence : publiez tout, ne revendez pas les assets.",auHi:"JOUEUR 1",auOkT:"Connecté",auOkP:"Ouverture de votre studio pour",auDoneT:"Compte créé",auDoneP:"Bienvenue — ouverture de l\u2019éditeur pour",auSentT2:"Vérifiez votre boîte mail",auSentP2:"Nous avons envoyé un lien de connexion à",auRstT:"Lien de réinitialisation envoyé",auRstP:"Les instructions de réinitialisation arrivent à",auBackL:"Retour",bgsL:"FONDS"},
es:{l1:"Crea un",l2:"kit de UI en",l3:"¡segundos!",eyebrow:"HERRAMIENTA DE UI DE JUEGOS EN EL NAVEGADOR",
sub:'Ajusta un botón real aquí mismo — color, forma, brillo — y conviértelo en un kit completo listo para producción. Cada píxel sale de un motor <em class="hl hl-w">determinista</em>, <em class="hl">no de IA</em>: lo que hagas puede ir en cualquier juego o producto que vendas.*',
open:"Abrir el generador →",signin:"Iniciar sesión",micro:"Este botón está vivo — dale, juega con él.",
t1:"Motor determinista",t1s:"Un mismo lenguaje de diseño en cada asset — una consistencia que la IA no puede garantizar.",t2:"Tuyo de verdad",t2s:"Exporta, edita e intégralo en todo lo que vendas.*",t3:"Para creadores",t3s:"Para devs de juegos, diseñadores y estudios.",
n1:"<b>Paso 1 · El master.</b> Define el ADN — color, forma, brillo, patrón. Todo lo demás lo hereda.",
n2:"<b>Paso 2 · Tu kit.</b> Un clic lo construyó todo — cada pieza hereda tu master, estados incluidos.",
n3:"<b>Paso 3 · El board.</b> <b>Sube tu propia imagen</b> — pantalla o concept — arrastra piezas, atenúa el fondo y crea todos los boards que quieras. Exporta o comparte cada uno.",
n4:"<b>¡Exportado!</b> El ciclo completo — master → kit → board → archivos. Ahora hazlo de verdad.",
cmLbl:"HECHO POR JUGADORES",cmTitle:"Hecho por jugadores. <em>Tuyo para remezclar.</em>",cmSub:"Abre cualquier kit y remezcla todo — cada tarjeta se dibuja en vivo en tu navegador desde los ajustes reales del kit.",cmCta:"Explorar la galería de la comunidad →",cmRemix:"REMEZCLAR",seFlash:"GG — KIT ENVIADO.",seSub:"Máster, kit, board, a la calle — ahora haz uno de verdad.",seAgain:"HACER OTRO",seTour:"EXPLORAR EL SITIO ↓",pushHint:"¿Algo no te cuadra? Retoca el máster y vuelve a crear el kit.",fpFaq:"FAQ",cust:"PERSONALIZAR",pushKit:"CREA TU KIT",pushBoard:"AL BOARD",pushExport:"EXPORTAR",pushOpen:"ABRIR EL GENERADOR",shipDone:"EXPORTACIÓN COMPLETA",shipLine:"Tuyo — en cualquier juego o producto que vendas.*",compatLbl:"Compatible con tus herramientas",compatTitle:"Aterriza en las herramientas que ya usas.",c_rest:"Pasa el cursor por un logo — así llega tu kit.",c_svg:"Vectores SVG limpios y totalmente editables — cada componente y estado, nombrado y agrupado.",c_png:"PNG transparentes y nítidos en 1× y 2×, cortados por componente y estado.",c_html:"Un kit.html + kit.css vivos — ábrelo, inspecciónalo o reutiliza los estilos.",c_json:"Un manifiesto JSON listo para el motor que mapea cada pieza, estado y tamaño.",c_fold:"Una estructura de carpetas limpia y predecible que entra directa en tu proyecto.",c_soon:"EXPORTACIÓN NATIVA EN CAMINO",c_unity: "Suelta el zip y el kit se construye solo: sprites nine-slice cortados, prefabs ya cableados — estados hover y pressed conectados, etiquetas con la tipografía exacta del kit — más una escena playground lista para jugar. Las re-exportaciones convergen en su sitio; el texto sigue siendo texto vivo del motor.",c_unreal:"Los márgenes de Box-draw ya calculados — tamaño nativo, insets en píxeles y la conversión 0–1, todo en el kit, con recetas UMG paso a paso.",c_godot:"Godot 4 importa SVG directamente (perfil estático SVG 1.1, renderizado por ThorVG) — tus vectores se ven nítidos a cualquier escala, con PNG de respaldo incluidos.",c_gm:"GameMaker usa sprites, no vectores — el kit llega en PNG transparentes limpios hasta 4×, cortados por componente y estado, listos para slots de sprites y nine-slice.",c_c3:"Usa el objeto SVG Picture (SVG 1.1 estático) para UI de resolución infinita, o los PNG por estado para sprites clásicos — ambos vienen en la caja.",c_rblx:"La UI de Roblox es territorio PNG — recortes transparentes por estado, a medida de ImageLabel e ImageButton, con márgenes nine-slice en el manifiesto que se convierten directo a SliceCenter.",c_rpgm:"Skins y hojas listas para colocar — el kit exporta piezas PNG que puedes componer directamente en window skins y hojas de sistema.",c_ase:"Abre los PNG a 1× y retócalos píxel a píxel — cada componente y estado se importa en su propio lienzo.",c_figma:"Se importa como estructura, no como captura — trazados reales, capas con nombre, texto editable. Todo lo que necesitas para ampliar un componente o construir el que al kit le falta, rápido.",c_penpot:"Penpot es SVG nativo — nuestros vectores no se convierten: se vuelven tu archivo. Cada trazado, degradado y grupo queda exactamente igual, efectos de filtro incluidos.",c_sketch:"Sketch importa SVG 1.1, y eso es exactamente lo que escribimos — grupos con nombre, trazados reales y degradados vivos en cada archivo.",c_aff:"Affinity abre SVG 1.1, y eso es exactamente lo que escribimos — curvas reales en grupos con nombre, más PNG por estado para colocar rápido.",c_ps:"Photoshop rasteriza el SVG al importarlo — colócalo como objeto inteligente y escálalo sin límite, o usa los PNG transparentes hasta 4×, cortados por componente y estado.",c_ai:"Verificado en Illustrator — se abre como un árbol de capas con nombre: trazados reales, degradados reales, texto vivo editable, efectos intactos.",c_ae:"AE lleva los PNG por estado directo a la animación; para capas de forma reales, pasa los SVG por Illustrator y la conversión sale limpia.",c_blender:"Blender importa SVG 1.1 como curvas — extruye tu UI en paneles 3D diegéticos, o texturiza con los PNG nítidos.",c_krita:"Krita abre SVG 1.1 en capas vectoriales — edita los trazados ahí mismo, o pinta sobre los PNG exportados.",c_web:"La web es casa — SVG inline más un único archivo HTML autónomo con un componente vivo y clicable que puedes abrir, inspeccionar o del que extraer el CSS.",ks1:"BOTONES",ks2:"INTERFAZ",ks3:"CONTROLES",ks4:"MEDIDORES Y TIEMPO",ks5:"HUD Y JUGADOR",ks6:"PIEZAS GRANDES",ks7:"NUEVO DEL MOTOR",fpCommunity:"Comunidad",fpTag:"Kits de UI listos para juego desde un componente maestro — dibujados por un motor determinista, nunca raspados.",fpCopy:"© 2026 PatternBreak. Todos los derechos reservados.",fpProdH:"PRODUCTO",fpOpen:"Abrir el generador",fpPricing:"Precios",fpHow:"Cómo funciona",fpLegalH:"LEGAL",fpTerms:"Términos de uso",fpPrivacy:"Política de privacidad",fpLicense:"La licencia en una línea",fpNewsH:"SIGAMOS EN CONTACTO",fpNewsP:"Nuevos componentes, presets y funciones — un correo breve de vez en cuando. Sin spam, date de baja cuando quieras.",fpPh:"tu@estudio.com",fpGo:"APÚNTAME",fpOk:"Ya estás en la lista — ¡bienvenido a bordo!",fpErr:"Hmm, no se envió. ¿Lo intentas de nuevo en un momento?",fpBad:"Ese correo no parece válido.",ownR1:"Cada kit sale con su receta — cada color, token y ajuste tipográfico por escrito, más un archivo de ajustes que se carga de vuelta en la app.",ownR2:"Cada tipografía que usa el kit está nombrada, enlazada y es gratuita para uso comercial.",
fKit:"KIT LISTO",fBoard:"BOARD LISTO",bdCall1:"PRUEBA TUS DISEÑOS",bdCall2:"Míralo en contexto — tu kit sobre pantallas reales.",fExp:"EXPORTADO",comp:"COMPONENTES",states:"ESTADOS",ready:"LISTOS PARA DESCARGAR",
lib:"BIBLIOTECA",drag:"arrastra al<br>escenario",color:"ESTILO",round:"REDONDEO",shine:"BRILLO",pattern:"PATRÓN",label:"TEXTO",rand:"ALEATORIO",
live:"ESTUDIO EN VIVO",prev:"VISTA EN VIVO",yours:"TU DISEÑO",up1:"⭱ yourworld.png — subiendo…",up2:"✓ yourworld.png — fondo listo",
upBtn:"⭱ SUBE TU IMAGEN",dim:"VIÑETA",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ COMPARTIR",maxB:"Cuatro boards en la demo — la app es ilimitada.",
upMsg:"En la app: suelta cualquier PNG/JPG — tu concept art, tu captura, tu mundo.",
pngMsg:"Cada board se exporta como PNG a resolución completa.",shareMsg:"Cada board tiene un enlace de solo lectura para compartir.",
sb1t:"1 COMPONENTE MASTER",sb1s:"Variaciones infinitas.",sb2t:"90+ COMPONENTES",sb2s:"Todo lo esencial.",sb3t:"4 ESTADOS",sb3s:"Siempre en sincronía.",sb4t:"EXPORTA DONDE SEA",sb4s:"Motores, web, PNG, SVG.",galL:"Directo de la app",galT:"El producto real, tres pantallas.",
audT:"Para cualquiera que publique",ownT:"Sin IA. Sin plantillas. <em>Sin zonas grises.</em>",ownB:"Tuyo, de verdad",
stepsT:"Cómo funciona",finalT:'Empieza a crear —<br><span class="f2-grad">nada que instalar.</span>',scroll:"Desplázate para multiplicar",
hint1:"pulsa para llenar · desplázate para ver más",hint2:"desplázate para ver más",kitPrev:"VISTA DEL KIT (HEREDADA)",stLive:"ESTADOS (VISTA EN VIVO)",stDef:"NORMAL",stHov:"HOVER",stPre:"PULSADO",
audL:"Del proyecto paralelo al lanzamiento",audSub:"Sin barreras, sin instalar nada, sin esperar a que se libere un especialista. Un design system real con el que jugar.",
aud1t:"DESARROLLADORES DE JUEGOS",aud1p:"Entrega una UI pulida que sube de nivel tu juego.",aud2t:"INDIES Y ESTUDIOS PEQUEÑOS",aud2p:"Compite por encima de tu tamaño con un sistema de UI coherente.",aud3t:"AFICIONADOS Y MAKERS",aud3p:"Haz que el proyecto paralelo parezca lanzado, no un boceto.",aud4t:"ESTUDIANTES",aud4p:"Aprende design systems construyendo con uno de verdad.",aud5t:"ARTISTAS DE UI",aud5p:"Acelera tu flujo de trabajo. Diseña más rápido. Explora más.",aud6t:"PROTOTIPADO Y NO-CODE",aud6p:"Lleva una UI preciosa y exportable a cualquier herramienta o motor.",
ownP:"Cada kit lo dibuja un motor de diseño determinista — no un modelo entrenado con el trabajo de otros. Nada se extrae, nada es \u201cal estilo de\u201d nadie. Lo que haces es único de tus ajustes — úsalo en cualquier cosa que publiques o vendas. La única línea de la licencia: los kits y assets en sí no pueden revenderse ni redistribuirse como assets.",
sealSm:"PatternBreak / certificado de procedencia",sealYours:"TUYO.",sealSig:"Determinista por diseño",
stepsL:"Tres pasos. Un sistema completo.",s1t:"Diseña el master",s1p:"Ajusta un componente — silueta, material, tipografía y sus cuatro estados.",s2t:"Genera el kit",s2p:"Un modelo se despliega a cada componente y tamaño, en vivo sobre el lienzo.",s3t:"Exporta o comparte",s3p:"Descarga un kit para motores, HTML, SVG o PNG — o publica un enlace en vivo.",
finalP:'El editor corre por completo en tu navegador. Empieza con <b class="f2-hl">Free Explorer</b> y mejora cuando estés listo para el kit de producción completo.',finalBtn:"EMPIEZA A CREAR",footTerms:"Términos",footPriv:"Privacidad",
galC1:'<b>El editor.</b> Cada control del hero — y cien más. Los estados viven a la derecha, los presets a un clic.',
galC2:'<b>El kit.</b> Tu diseño se convierte en una lámina de guía viva — capas, roles y cada componente documentado.',
galC3:'<b>El board — la gran recompensa.</b> Monta tu kit sobre pantallas reales, ajusta el fondo, exporta artboards.',
galC4:'<b>Lanzado.</b> Un master → un HUD completo: corazones, minimapa, hotbar, munición. Cada pieza del mismo ADN.',
galC5:'<b>Tuyo, en todos los formatos — pasa el cursor por cada uno.</b> Estructura lista para Unity y Unreal, vectores por capas para herramientas de diseño, HTML limpio para la web.',
exm_gamekit:"Exportar kit de juego",exm_svg:"Exportar SVG",exm_png:"Exportar PNG 2×",exm_html:"Descargar HTML",exm_copy:"Copiar código SVG",exm_settings:"Ajustes de exportación",
exn_gamekit:'<b>Directo a los motores.</b> Atlas de sprites de Unity + bordes 9-slice; nombres de texturas de Unreal y márgenes UMG/Slate, listos para importar.',
exn_svg:'<b>Vectores por capas \u2014 fuentes nombradas y enlazadas, gratis de instalar.</b> Verificado en Illustrator; nativo en Penpot; se abre directo en el navegador.',
exn_png:'<b>Raster nítido, fondos transparentes.</b> Calidad Retina para cualquier motor, herramienta o tienda.',
exn_html:'<b>HTML + CSS semántico. Cero dependencias.</b> Un <code>&lt;button&gt;</code> real con sus cuatro estados — pégalo en cualquier proyecto web.',
exn_copy:'<b>El vector exacto, en tu portapapeles.</b> Pégalo en código, Figma o un README.',
exn_settings:'<b>Todo tu look en un archivo.</b> Cada ajuste que tocaste — reimpórtalo donde sea, pásaselo a un compañero o versiónalo en git.',
iterP:"Y nunca se bloquea: vuelve al master, gira un control y todo el sistema se actualiza — kit, boards, exportaciones. Itera hacia lo mejor para el conjunto. (Además, seguir jugando es un gustazo.)",
fontL:"FUENTE",bgL:"FONDO",extrL:"EXTRUSIÓN",dsgnL:"DISEÑO",resetL:"REINICIAR",
pg:"Filtro familiar en la portada — la app completa lo desactiva.",
tcolL:"COLOR DE TEXTO",stDis:"DESACTIVADO",licN:"* La licencia en una línea: usa tus kits en cualquier producto, comercial incluido — pero el kit y sus assets no pueden revenderse ni redistribuirse como assets, plantillas o packs. Consulta los Términos de Uso.",
fin1t:"EN EL NAVEGADOR",fin1s:"Sin instalaciones",fin2t:"DETERMINISTA",fin2s:"No es IA",fin3t:"LISTO PARA JUEGOS",fin3s:"Exporta donde sea",fin4t:"TUYO PARA PUBLICAR",fin4s:"Vende y lanza*",finFree:"Kits seleccionados y exportaciones PNG limitadas incluidas gratis.",
auT1:"Bienvenido de nuevo",auT2:"Crea tu cuenta",auIn:"ENTRAR",auUp:"CREAR CUENTA",auEmail:"CORREO",auPass:"CONTRASEÑA",auFgt:"¿Olvidaste la contraseña?",auGo1:"ENTRAR",auGo2:"CREAR CUENTA",auOr:"o",auMagic:"✉ ENVIARME UN ENLACE DE ACCESO",auFreeL:"Free Explorer — sin tarjeta.",auTerms:"Acepto los Términos — y la licencia: publica lo que sea, pero no revendas los assets.",auHi:"JUGADOR 1",auOkT:"Sesión iniciada",auOkP:"Abriendo tu estudio para",auDoneT:"Cuenta creada",auDoneP:"Bienvenido — abriendo el editor para",auSentT2:"Revisa tu bandeja",auSentP2:"Enviamos un enlace de acceso a",auRstT:"Enlace de restablecimiento enviado",auRstP:"Las instrucciones van de camino a",auBackL:"Volver",bgsL:"FONDOS"},
it:{l1:"Crea un",l2:"kit UI in",l3:"secondi!",eyebrow:"STRUMENTO DI UI PER GIOCHI NEL BROWSER",
sub:'Regola un bottone vero proprio qui — colore, forma, lucentezza — poi trasformalo in un kit completo pronto per la produzione. Ogni pixel esce da un motore <em class="hl hl-w">deterministico</em>, <em class="hl">non da IA</em>: ciò che crei può finire in qualsiasi gioco o prodotto che vendi.*',
open:"Apri il generatore →",signin:"Accedi",micro:"Questo bottone è vivo — dai, gioca pure.",
t1:"Motore deterministico",t1s:"Un unico linguaggio di design su ogni asset — una coerenza che l\u2019IA non può garantire.",t2:"Davvero tuo",t2s:"Esporta, modifica e usalo in tutto ciò che vendi.*",t3:"Per i creator",t3s:"Per game dev, designer e studi.",
n1:"<b>Passo 1 · Il master.</b> Definisci il DNA — colore, forma, lucentezza, pattern. Tutto il resto lo eredita.",
n2:"<b>Passo 2 · Il tuo kit.</b> Un clic ha costruito tutto — ogni pezzo eredita il master, stati compresi.",
n3:"<b>Passo 3 · La board.</b> <b>Carica la tua immagine</b> — schermata o concept — trascina i pezzi, attenua lo sfondo e crea quante board vuoi. Esporta o condividi ognuna.",
n4:"<b>Esportato!</b> Il giro completo — master → kit → board → file. Ora fallo davvero.",
cmLbl:"FATTO DAI PLAYER",cmTitle:"Fatto dai player. <em>Tuo da remixare.</em>",cmSub:"Apri qualsiasi kit e remixa tutto — ogni card è disegnata dal vivo nel tuo browser dai veri settaggi del kit.",cmCta:"Sfoglia la galleria della community →",cmRemix:"REMIX",seFlash:"GG — KIT SPEDITO.",seSub:"Master, kit, board, fuori — ora fanne uno davvero tuo.",seAgain:"FANNE UN ALTRO",seTour:"ESPLORA IL SITO ↓",pushHint:"Qualcosa non ti torna? Ritocca il master e ricrea il kit.",fpFaq:"FAQ",cust:"PERSONALIZZA",pushKit:"CREA IL TUO KIT",pushBoard:"ALLA BOARD",pushExport:"ESPORTA",pushOpen:"APRI IL GENERATORE",shipDone:"EXPORT COMPLETATO",shipLine:"Tuo — in qualsiasi gioco o prodotto che vendi.*",compatLbl:"Compatibile con i tuoi strumenti",compatTitle:"Arriva negli strumenti che già usi.",c_rest:"Passa su un logo — ecco come arriva il tuo kit.",c_svg:"Vettori SVG puliti e completamente modificabili — ogni componente e stato, nominato e raggruppato.",c_png:"PNG trasparenti e nitidi in 1× e 2×, tagliati per componente e stato.",c_html:"Un kit.html + kit.css dal vivo — aprilo, ispezionalo o riusa gli stili.",c_json:"Un manifest JSON pronto per l'engine che mappa ogni pezzo, stato e dimensione.",c_fold:"Una struttura di cartelle ordinata e prevedibile, pronta per il tuo progetto.",c_soon:"EXPORT NATIVO IN ARRIVO",c_unity: "Trascina lo zip e il kit si costruisce da solo: sprite nine-slice già tagliati, prefab già cablati — stati hover e pressed collegati, etichette nella tipografia esatta del kit — più una scena playground pronta al Play. I re-export convergono sul posto; il testo resta testo vivo del motore.",c_unreal:"Margini box-draw già calcolati — dimensione nativa, inset in pixel e conversione 0–1, tutto nel kit, con ricette UMG passo passo.",c_godot:"Godot 4 importa SVG direttamente (profilo statico SVG 1.1, reso da ThorVG) — i vettori restano nitidi a ogni scala, con PNG di riserva inclusi.",c_gm:"GameMaker vuole sprite, non vettori — il kit arriva in PNG trasparenti puliti fino a 4×, tagliati per componente e stato, pronti per slot sprite e nine-slice.",c_c3:"Usa l'oggetto SVG Picture (SVG 1.1 statico) per UI a risoluzione infinita, o i PNG per stato per gli sprite classici — entrambi inclusi.",c_rblx:"La UI di Roblox è territorio PNG — ritagli trasparenti per stato, su misura per ImageLabel e ImageButton, con margini nine-slice nel manifest che si convertono dritti in SliceCenter.",c_rpgm:"Skin e sheet pronti da posare — il kit esporta pezzi PNG da comporre direttamente in window skin e sheet di sistema.",c_ase:"Apri i PNG a 1× e ritoccali pixel per pixel — ogni componente e stato si importa sul proprio canvas.",c_figma:"Si importa come struttura, non come screenshot — tracciati veri, livelli nominati, testo modificabile. Tutto ciò che serve per ampliare un componente o costruire quello che al kit manca, in fretta.",c_penpot:"Penpot è SVG nativo — i nostri vettori non vengono convertiti: diventano il tuo file. Ogni tracciato, gradiente e gruppo resta esattamente com'è, effetti filtro compresi.",c_sketch:"Sketch importa SVG 1.1, ed è esattamente ciò che scriviamo — gruppi nominati, tracciati veri, gradienti vivi in ogni file.",c_aff:"Affinity apre SVG 1.1, ed è esattamente ciò che scriviamo — curve vere in gruppi nominati, più PNG per stato per posizionare al volo.",c_ps:"Photoshop rasterizza l'SVG all'importazione — inseriscilo come oggetto avanzato e scalalo liberamente, oppure usa i PNG trasparenti fino a 4×, tagliati per componente e stato.",c_ai:"Verificato in Illustrator — si apre come albero di livelli nominati: tracciati veri, gradienti veri, testo vivo e modificabile, effetti intatti.",c_ae:"AE porta i PNG per stato dritti in animazione; per veri shape layer, passa gli SVG da Illustrator: la conversione è pulita.",c_blender:"Blender importa SVG 1.1 come curve — estrudi la tua UI in pannelli 3D diegetici, o texturizza con i PNG nitidi.",c_krita:"Krita apre SVG 1.1 su livelli vettoriali — modifica i tracciati sul posto, o dipingi sopra gli export PNG.",c_web:"Il web è casa — SVG inline più un unico file HTML autonomo con un componente vivo e cliccabile da aprire, ispezionare o da cui estrarre il CSS.",ks1:"PULSANTI",ks2:"INTERFACCIA",ks3:"CONTROLLI",ks4:"INDICATORI E TIMER",ks5:"HUD E GIOCATORE",ks6:"PEZZI GRANDI",ks7:"NOVITÀ DAL MOTORE",fpCommunity:"Community",fpTag:"Kit UI pronti per il gioco da un solo componente master — disegnati da un engine deterministico, mai raschiati.",fpCopy:"© 2026 PatternBreak. Tutti i diritti riservati.",fpProdH:"PRODOTTO",fpOpen:"Apri il generatore",fpPricing:"Prezzi",fpHow:"Come funziona",fpLegalH:"LEGALE",fpTerms:"Termini d'uso",fpPrivacy:"Informativa privacy",fpLicense:"La licenza in una riga",fpNewsH:"RESTIAMO IN CONTATTO",fpNewsP:"Nuovi componenti, preset e funzioni — una breve email ogni tanto. Niente spam, disiscrizione quando vuoi.",fpPh:"tu@studio.com",fpGo:"ISCRIVIMI",fpOk:"Sei in lista — benvenuto a bordo!",fpErr:"Hmm, non è andata. Riprovi tra un attimo?",fpBad:"Questa email non sembra valida.",ownR1:"Ogni kit parte con la sua ricetta — ogni colore, token e impostazione tipografica scritti per esteso, più un file di impostazioni che si ricarica dritto nell’app.",ownR2:"Ogni font usato dal kit è nominato, linkato e gratuito per uso commerciale.",
fKit:"KIT PRONTO",fBoard:"BOARD PRONTA",bdCall1:"TESTA I TUOI DESIGN",bdCall2:"Guardalo nel contesto — il tuo kit su schermi reali.",fExp:"ESPORTATO",comp:"COMPONENTI",states:"STATI",ready:"PRONTI DA SCARICARE",
lib:"LIBRERIA",drag:"trascina sul<br>palco",color:"STILE",round:"ARROTONDA",shine:"LUCE",pattern:"PATTERN",label:"TESTO",rand:"CASUALE",
live:"STUDIO LIVE",prev:"ANTEPRIMA LIVE",yours:"IL TUO DESIGN",up1:"⭱ yourworld.png — caricamento…",up2:"✓ yourworld.png — sfondo impostato",
upBtn:"⭱ CARICA LA TUA IMMAGINE",dim:"VIGNETTATURA",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ CONDIVIDI",maxB:"Quattro board nella demo — l’app è senza limiti.",
upMsg:"Nell’app: trascina qualsiasi PNG/JPG — il tuo concept, il tuo screenshot, il tuo mondo.",
pngMsg:"Ogni board si esporta come PNG a piena risoluzione.",shareMsg:"Ogni board ha un link di condivisione in sola lettura.",
sb1t:"1 COMPONENTE MASTER",sb1s:"Variazioni infinite.",sb2t:"90+ COMPONENTI",sb2s:"Tutto l’essenziale.",sb3t:"4 STATI",sb3s:"Sempre in sincronia.",sb4t:"ESPORTA OVUNQUE",sb4s:"Engine, web, PNG, SVG.",galL:"Direttamente dall’app",galT:"Il prodotto vero, tre schermate.",
audT:"Per chiunque pubblichi",ownT:"Niente IA. Niente template. <em>Niente zone grigie.</em>",ownB:"Tuo, davvero",
stepsT:"Come funziona",finalT:'Inizia a creare —<br><span class="f2-grad">niente da installare.</span>',scroll:"Scorri per moltiplicare",
hint1:"premi per riempire · scorri per vedere di più",hint2:"scorri per vedere di più",kitPrev:"ANTEPRIMA KIT (EREDITATA)",stLive:"STATI (ANTEPRIMA LIVE)",stDef:"PREDEFINITO",stHov:"HOVER",stPre:"PREMUTO",
audL:"Dal progetto secondario alla pubblicazione",audSub:"Niente barriere, niente da installare, nessuna attesa. Solo un vero design system con cui giocare.",
aud1t:"SVILUPPATORI DI GIOCHI",aud1p:"Consegna una UI curata che fa salire di livello il tuo gioco.",aud2t:"INDIE E PICCOLI STUDI",aud2p:"Gioca sopra la tua categoria con un sistema di UI coerente.",aud3t:"HOBBISTI E MAKER",aud3p:"Fai sembrare il progetto secondario pubblicato, non abbozzato.",aud4t:"STUDENTI",aud4p:"Impara i design system costruendo con uno vero.",aud5t:"UI ARTIST",aud5p:"Potenzia il tuo flusso di lavoro. Progetta più veloce. Esplora di più.",aud6t:"PROTOTIPATORI E NO-CODE",aud6p:"Porta una UI bellissima ed esportabile in qualsiasi strumento o engine.",
ownP:"Ogni kit è disegnato da un motore di design deterministico — non un modello addestrato sul lavoro altrui. Niente viene raschiato, niente è \u201cnello stile di\u201d qualcun altro. Ciò che crei è unico dei tuoi parametri — usalo in qualsiasi cosa pubblichi o venda. Un solo confine nella licenza: i kit e gli asset in sé non possono essere rivenduti né ridistribuiti come asset.",
sealSm:"PatternBreak / certificato di provenienza",sealYours:"TUO.",sealSig:"Deterministico by design",
stepsL:"Tre mosse. Un sistema completo.",s1t:"Progetta il master",s1p:"Regola un componente — silhouette, materiale, tipografia e i suoi quattro stati.",s2t:"Genera il kit",s2p:"Un modello si propaga a ogni componente e dimensione, dal vivo sul canvas.",s3t:"Esporta o condividi",s3p:"Scarica un kit per engine, HTML, SVG o PNG — o pubblica un link live.",
finalP:'L\u2019editor gira interamente nel browser. Parti con <b class="f2-hl">Free Explorer</b>, poi fai l\u2019upgrade quando sei pronto per il toolkit completo.',finalBtn:"INIZIA A CREARE",footTerms:"Termini",footPriv:"Privacy",
galC1:'<b>L\u2019editor.</b> Ogni manopola del hero — e altre cento. Gli stati vivono a destra, i preset a un clic.',
galC2:'<b>Il kit.</b> Il tuo design diventa una tavola guida viva — livelli, ruoli e ogni componente documentato.',
galC3:'<b>Il board — la grande ricompensa.</b> Metti in scena il kit su schermate reali, regola lo sfondo, esporta artboard.',
galC4:'<b>Pubblicato.</b> Un master → un HUD completo: cuori, minimappa, hotbar, munizioni. Ogni pezzo dallo stesso DNA.',
galC5:'<b>Tuo, in ogni formato — passa il cursore su ciascuno.</b> Struttura pronta per Unity e Unreal, vettori a livelli per gli strumenti di design, HTML pulito per il web.',
exm_gamekit:"Esporta kit di gioco",exm_svg:"Esporta SVG",exm_png:"Esporta PNG 2×",exm_html:"Scarica HTML",exm_copy:"Copia codice SVG",exm_settings:"Impostazioni di export",
exn_gamekit:'<b>Pronto per gli engine.</b> Atlas di sprite Unity + bordi 9-slice; naming delle texture Unreal e margini UMG/Slate, pronti da importare.',
exn_svg:'<b>Vettori a livelli \u2014 font nominati e linkati, gratis da installare.</b> Verificato in Illustrator; nativo in Penpot; si apre dritto nel browser.',
exn_png:'<b>Raster nitido, sfondi trasparenti.</b> Qualità Retina per qualsiasi engine, strumento o store.',
exn_html:'<b>HTML + CSS semantico. Zero dipendenze.</b> Un vero <code>&lt;button&gt;</code> con tutti e quattro gli stati — incollalo in qualsiasi progetto web.',
exn_copy:'<b>Il vettore esatto, negli appunti.</b> Incollalo nel codice, in Figma o in un README.',
exn_settings:'<b>Tutto il tuo look in un file.</b> Ogni parametro che hai toccato — reimportalo ovunque, passalo a un collega o versionalo in git.',
iterP:"E non si blocca mai: torna al master, gira una manopola e l\u2019intero sistema si aggiorna — kit, board, export. Itera verso ciò che è meglio per l\u2019insieme. (E poi, continuare a giocare è divertente.)",
fontL:"FONT",bgL:"SFONDO",extrL:"ESTRUSIONE",dsgnL:"DESIGN",resetL:"RIPRISTINA",
pg:"Filtro famiglia sulla homepage — l\u2019app completa lo disattiva.",
tcolL:"COLORE TESTO",stDis:"DISATTIVATO",licN:"* La licenza in una riga: usa i tuoi kit in qualsiasi prodotto, anche commerciale — ma il kit e i suoi asset non possono essere rivenduti né ridistribuiti come asset, template o pacchetti. Vedi i Termini d'Uso.",
fin1t:"NEL BROWSER",fin1s:"Niente installazioni",fin2t:"DETERMINISTICO",fin2s:"Non IA",fin3t:"PRONTO PER I GIOCHI",fin3s:"Esporta ovunque",fin4t:"TUO DA PUBBLICARE",fin4s:"Vendi e lancia*",finFree:"Kit selezionati ed export PNG limitati inclusi gratis.",
auT1:"Bentornato",auT2:"Crea il tuo account",auIn:"ACCEDI",auUp:"CREA ACCOUNT",auEmail:"EMAIL",auPass:"PASSWORD",auFgt:"Password dimenticata?",auGo1:"ACCEDI",auGo2:"CREA ACCOUNT",auOr:"oppure",auMagic:"✉ INVIAMI UN LINK DI ACCESSO",auFreeL:"Free Explorer — nessuna carta richiesta.",auTerms:"Accetto i Termini — e la licenza: pubblica tutto, ma non rivendere gli asset.",auHi:"GIOCATORE 1",auOkT:"Accesso effettuato",auOkP:"Apertura del tuo studio per",auDoneT:"Account creato",auDoneP:"Benvenuto — apertura dell\u2019editor per",auSentT2:"Controlla la posta",auSentP2:"Abbiamo inviato un link di accesso a",auRstT:"Link di reset inviato",auRstP:"Le istruzioni di reset sono in arrivo a",auBackL:"Indietro",bgsL:"SFONDI"},
de:{l1:"Ein UI-Kit",l2:"in Sekunden",l3:"designen!",eyebrow:"GAME-UI-TOOL IM BROWSER",
sub:'Stell hier einen echten Button ein — Farbe, Form, Glanz — und mach daraus ein komplettes, produktionsreifes Kit. Jeder Pixel stammt aus einer <em class="hl hl-w">deterministischen</em> Engine, <em class="hl">nicht von KI</em> — was du baust, darf in jedes Spiel und Produkt, das du verkaufst.*',
open:"Generator öffnen →",signin:"Anmelden",micro:"Dieser Button ist live — na los, spiel damit.",
t1:"Deterministische Engine",t1s:"Eine Designsprache über jedes Asset hinweg — Konsistenz, die KI nicht liefern kann.",t2:"Gehört dir",t2s:"Exportieren, bearbeiten, in allem verwenden, was du verkaufst.*",t3:"Für Creator gebaut",t3s:"Für Game-Devs, Designer und Studios.",
n1:"<b>Schritt 1 · Der Master.</b> Leg die DNA fest — Farbe, Form, Glanz, Muster. Alles Weitere erbt sie.",
n2:"<b>Schritt 2 · Dein Kit.</b> Ein Klick hat all das gebaut — jedes Teil erbt deinen Master, Zustände inklusive.",
n3:"<b>Schritt 3 · Das Board.</b> <b>Lade dein eigenes Bild hoch</b> — Screenshot oder Konzept — zieh Teile darauf, dimme den Hintergrund und leg so viele Boards an, wie du brauchst. Jedes lässt sich exportieren oder teilen.",
n4:"<b>Exportiert!</b> Das war der ganze Loop — Master → Kit → Board → Dateien. Jetzt mach es richtig.",
cmLbl:"VON SPIELERN GEBAUT",cmTitle:"Von Spielern gebaut. <em>Deins zum Remixen.</em>",cmSub:"Öffne jedes Kit, remixe alles — jede Karte wird live in deinem Browser aus den echten Einstellungen des Kits gezeichnet.",cmCta:"Community-Galerie durchstöbern →",cmRemix:"REMIX",seFlash:"GG — KIT AUSGELIEFERT.",seSub:"Master, Kit, Board, raus damit — jetzt bau eins, das wirklich deins ist.",seAgain:"NOCH EINS BAUEN",seTour:"SEITE ERKUNDEN ↓",pushHint:"Noch nicht perfekt? Master anpassen, Kit neu erstellen.",fpFaq:"FAQ",cust:"ANPASSEN",pushKit:"ERSTELLE DEIN KIT",pushBoard:"AUFS BOARD",pushExport:"EXPORTIEREN",pushOpen:"GENERATOR ÖFFNEN",shipDone:"EXPORT ABGESCHLOSSEN",shipLine:"Gehört dir — in jedem Spiel oder Produkt, das du verkaufst.*",compatLbl:"Spielt mit deinem Stack",compatTitle:"Landet in den Tools, die du schon nutzt.",c_rest:"Fahre über ein Logo — so landet dein Kit dort.",c_svg:"Saubere SVG-Vektoren, voll editierbar — jede Komponente und jeder State, benannt und gruppiert.",c_png:"Gestochen scharfe transparente PNGs in 1× und 2×, geschnitten pro Komponente und State.",c_html:"Ein lebendes kit.html + kit.css — öffnen, inspizieren oder Styles direkt übernehmen.",c_json:"Ein engine-fertiges JSON-Manifest, das jedes Teil, jeden State und jede Größe abbildet.",c_fold:"Eine aufgeräumte, vorhersehbare Ordnerstruktur, die direkt ins Projekt fällt.",c_soon:"NATIVER EXPORT GEPLANT",c_unity: "Zip reinziehen und das Kit baut sich selbst: Nine-Slice-Sprites fertig geschnitten, Prefabs fertig verdrahtet — Hover- und Pressed-States verbunden, Labels in der exakten Display-Type des Kits — plus eine Play-fertige Playground-Szene. Re-Exports konvergieren an Ort und Stelle; Text bleibt lebendiger Engine-Text.",c_unreal:"Box-Draw-Ränder fertig ausgerechnet — native Größe, Pixel-Insets und die 0–1-Umrechnung alle im Kit, mit Schritt-für-Schritt-UMG-Rezepten.",c_godot:"Godot 4 importiert SVG direkt (statisches SVG-1.1-Profil, gerendert von ThorVG) — Vektoren bleiben in jeder Skalierung scharf, PNG-Fallbacks inklusive.",c_gm:"GameMaker will Sprites, keine Vektoren — das Kit kommt als saubere transparente PNGs bis 4×, geschnitten pro Komponente und State, bereit für Sprite-Slots und Nine-Slice.",c_c3:"Nutz das SVG-Picture-Objekt (statisches SVG 1.1) für UI in unendlicher Auflösung, oder die PNGs pro State für klassische Sprites — beides liegt bei.",c_rblx:"Roblox-UI ist PNG-Gebiet — transparente Schnitte pro State, passend für ImageLabel und ImageButton, mit Nine-Slice-Rändern im Manifest, die sich direkt in SliceCenter umrechnen lassen.",c_rpgm:"Skins und Sheets zum Direkteinsetzen — das Kit exportiert PNG-Teile, die du direkt zu Window Skins und System-Sheets zusammensetzt.",c_ase:"Öffne die 1×-PNGs und arbeite Pixel für Pixel — jede Komponente und jeder State importiert auf eigener Leinwand.",c_figma:"Importiert als Struktur, nicht als Screenshot — echte Pfade, benannte Ebenen, editierbarer Text. Alles, was du brauchst, um eine Komponente zu erweitern oder die zu bauen, die dem Kit fehlt — schnell.",c_penpot:"Penpot ist SVG-nativ — unsere Vektoren werden nicht konvertiert, sie werden deine Datei. Jeder Pfad, Verlauf und jede Gruppe bleibt exakt erhalten, Filtereffekte inklusive.",c_sketch:"Sketch importiert SVG 1.1, und genau das schreiben wir — benannte Gruppen, echte Pfade, lebendige Verläufe in jeder Datei.",c_aff:"Affinity öffnet SVG 1.1, und genau das schreiben wir — echte Kurven in benannten Gruppen, plus PNGs pro State fürs schnelle Platzieren.",c_ps:"Photoshop rastert SVG beim Import — platziere es als Smartobjekt und skaliere frei, oder nimm die transparenten PNGs bis 4×, geschnitten pro Komponente und State.",c_ai:"In Illustrator verifiziert — öffnet als benannter Ebenenbaum: echte Pfade, echte Verläufe, live editierbarer Text, Effekte intakt.",c_ae:"AE nimmt die PNGs pro State direkt in die Animation; für echte Shape-Layer schickst du die SVGs durch Illustrator — die Umwandlung ist sauber.",c_blender:"Blender importiert SVG 1.1 als Kurven — extrudiere deine UI zu diegetischen 3D-Panels, oder texturiere mit den scharfen PNGs.",c_krita:"Krita öffnet SVG 1.1 auf Vektorebenen — bearbeite Pfade direkt, oder mal über die PNG-Exporte.",c_web:"Das Web ist Heimspiel — Inline-SVG plus eine eigenständige HTML-Datei mit lebender, klickbarer Komponente zum Öffnen, Inspizieren oder CSS-Übernehmen.",ks1:"BUTTONS",ks2:"INTERFACE",ks3:"STEUERUNG",ks4:"ANZEIGEN & TIMER",ks5:"HUD & SPIELER",ks6:"GROSSE TEILE",ks7:"NEU AUS DER ENGINE",fpCommunity:"Community",fpTag:"Game-ready UI-Kits aus einer einzigen Master-Komponente — gezeichnet von einer deterministischen Engine, nie gescraped.",fpCopy:"© 2026 PatternBreak. Alle Rechte vorbehalten.",fpProdH:"PRODUKT",fpOpen:"Generator öffnen",fpPricing:"Preise",fpHow:"So funktioniert's",fpLegalH:"RECHTLICHES",fpTerms:"Nutzungsbedingungen",fpPrivacy:"Datenschutzerklärung",fpLicense:"Die Lizenz in einer Zeile",fpNewsH:"BLEIB AUF DEM LAUFENDEN",fpNewsP:"Neue Komponenten, Presets und Features — ab und zu eine kurze Mail. Kein Spam, jederzeit abbestellbar.",fpPh:"du@studio.com",fpGo:"EINTRAGEN",fpOk:"Du stehst auf der Liste — willkommen an Bord!",fpErr:"Hmm, das ging nicht durch. Magst du es gleich noch einmal versuchen?",fpBad:"Diese E-Mail sieht nicht richtig aus.",ownR1:"Jedes Kit kommt mit seinem eigenen Rezept — jede Farbe, jeder Token, jede Typo-Einstellung ausgeschrieben, plus eine Settings-Datei, die direkt zurück in die App lädt.",ownR2:"Jede Schrift im Kit ist benannt, verlinkt und frei für kommerzielle Nutzung.",
fKit:"KIT BEREIT",fBoard:"BOARD BEREIT",bdCall1:"TESTE DEINE DESIGNS",bdCall2:"Sieh es im Kontext — dein Kit auf echten Screens.",fExp:"EXPORTIERT",comp:"KOMPONENTEN",states:"ZUSTÄNDE",ready:"BEREIT ZUM DOWNLOAD",
lib:"BIBLIOTHEK",drag:"auf die Bühne<br>ziehen",color:"STIL",round:"RUNDUNG",shine:"GLANZ",pattern:"MUSTER",label:"TEXT",rand:"ZUFALL",
live:"LIVE-STUDIO",prev:"LIVE-VORSCHAU",yours:"DEIN DESIGN",up1:"⭱ yourworld.png — wird hochgeladen…",up2:"✓ yourworld.png — Hintergrund gesetzt",
upBtn:"⭱ EIGENES BILD HOCHLADEN",dim:"VIGNETTE",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ TEILEN",maxB:"Vier Boards in der Demo — die App ist unbegrenzt.",
upMsg:"In der echten App: Zieh ein beliebiges PNG oder JPG hinein — dein Concept-Art, dein Screenshot, deine Welt.",
pngMsg:"Jedes Board exportiert als PNG in voller Auflösung.",shareMsg:"Jedes Board bekommt einen Read-only-Link fürs Team.",
sb1t:"1 MASTER-KOMPONENTE",sb1s:"Unendliche Varianten.",sb2t:"90+ KOMPONENTEN",sb2s:"Alles Wesentliche.",sb3t:"4 ZUSTÄNDE",sb3s:"Immer synchron.",sb4t:"ÜBERALLHIN EXPORTIEREN",sb4s:"Engines, Web, PNG, SVG.",galL:"Direkt aus der App",galT:"Das echte Produkt, drei Screens tief.",
audT:"Für alle, die veröffentlichen",ownT:"Keine KI. Keine Templates. <em>Keine Grauzonen.</em>",ownB:"Wirklich deins",
stepsT:"So funktioniert’s",finalT:'Leg los —<br><span class="f2-grad">nichts zu installieren.</span>',scroll:"Scrollen und multiplizieren",
hint1:"klicken zum Füllen · scrollen für mehr",hint2:"scrollen für mehr",kitPrev:"KIT-VORSCHAU (GEERBT)",stLive:"ZUSTÄNDE (LIVE-VORSCHAU)",stDef:"STANDARD",stHov:"HOVER",stPre:"GEDRÜCKT",
audL:"Vom Nebenprojekt zum Release",audSub:"Keine Hürden, nichts zu installieren, kein Warten auf Spezialisten. Einfach ein echtes Design-System zum Ausprobieren.",
aud1t:"GAME-DEVS",aud1p:"Liefere polierte UI, die dein Spiel auflevelt.",aud2t:"INDIES &amp; KLEINE STUDIOS",aud2p:"Spiel über deiner Gewichtsklasse — mit einem stimmigen UI-System.",aud3t:"HOBBYISTEN &amp; MAKER",aud3p:"Lass das Nebenprojekt fertig aussehen, nicht skizziert.",aud4t:"STUDIERENDE",aud4p:"Lerne Design-Systeme, indem du mit einem echten baust.",aud5t:"UI-ARTISTS",aud5p:"Beschleunige deinen Workflow. Schneller designen. Mehr erkunden.",aud6t:"PROTOTYPER &amp; NO-CODE",aud6p:"Bring schöne, exportierbare UI in jedes Tool und jede Engine.",
ownP:"Jedes Kit zeichnet eine deterministische Design-Engine — kein Modell, das mit fremder Arbeit trainiert wurde. Nichts wird abgegriffen, nichts ist „im Stil von“ jemand anderem. Was du baust, ist einzigartig für deine Einstellungen — nutze es in allem, was du veröffentlichst oder verkaufst. Die eine Grenze der Lizenz: Die Kits und Assets selbst dürfen nicht als Assets weiterverkauft oder weiterverteilt werden.",
sealSm:"PatternBreak / Herkunftszertifikat",sealYours:"DEINS.",sealSig:"Deterministisch by Design",
stepsL:"Drei Schritte. Ein komplettes System.",s1t:"Master designen",s1p:"Stimme eine Komponente ab — Silhouette, Material, Typo und ihre vier Zustände.",s2t:"Kit generieren",s2p:"Ein Modell fächert sich auf jede Komponente und Größe auf — live auf der Canvas.",s3t:"Exportieren oder teilen",s3p:"Lade ein Engine-Kit, HTML, SVG oder PNG herunter — oder veröffentliche einen Live-Link.",
finalP:'Der Editor läuft komplett im Browser. Starte mit dem <b class="f2-hl">Free Explorer</b> und upgrade, wenn du bereit für das volle Produktions-Toolkit bist.',finalBtn:"LOSLEGEN",footTerms:"AGB",footPriv:"Datenschutz",
galC1:'<b>Der Editor.</b> Jeder Regler aus dem Hero — und hundert mehr. Zustände live rechts, Presets einen Klick entfernt.',
galC2:'<b>Das Kit.</b> Dein Design wird zur lebenden Guideline — Ebenen, Rollen, jede Komponente dokumentiert.',
galC3:'<b>Das Board — der große Moment.</b> Inszeniere dein Kit auf echten Screens, dimme den Hintergrund, exportiere Artboards.',
galC4:'<b>Veröffentlicht.</b> Ein Master → ein komplettes HUD: Herzen, Minimap, Hotbar, Munition. Jedes Teil aus derselben DNA.',
galC5:'<b>Deins, in jedem Format — fahr mit der Maus darüber.</b> Engine-fertige Struktur für Unity und Unreal, Ebenen-Vektoren für Design-Tools, sauberes HTML fürs Web.',
exm_gamekit:"Game-Kit exportieren",exm_svg:"SVG exportieren",exm_png:"PNG 2× exportieren",exm_html:"HTML herunterladen",exm_copy:"SVG-Code kopieren",exm_settings:"Export-Einstellungen",
exn_gamekit:'<b>Direkt in die Engine.</b> Unity-Sprite-Atlas + 9-Slice-Ränder; Unreal-Texturbenennung und UMG/Slate-Brush-Margins, importfertig.',
exn_svg:'<b>Ebenen-Vektoren \u2014 Schriften benannt und verlinkt, frei zu installieren.</b> In Illustrator verifiziert; SVG-nativ in Penpot; öffnet direkt im Browser.',
exn_png:'<b>Scharfes Raster, transparente Hintergründe.</b> Retina-fertig für jede Engine, jedes Tool, jeden Store.',
exn_html:'<b>Semantisches HTML + CSS. Null Abhängigkeiten.</b> Ein echter <code>&lt;button&gt;</code> mit allen vier Zuständen — in jedes Web-Projekt einfügbar.',
exn_copy:'<b>Der exakte Vektor, in deiner Zwischenablage.</b> Füge ihn in Code, Figma oder ein README ein.',
exn_settings:'<b>Dein ganzer Look als eine Datei.</b> Jeder Regler, den du berührt hast — überall re-importieren, ans Team geben oder in git versionieren.',
iterP:"Und nichts ist festgeschrieben: zurück zum Master, einen Regler drehen, und das ganze System zieht nach — Kit, Boards, Exporte. Iteriere auf das hin, was dem Ganzen guttut. (Außerdem macht Weiterspielen einfach Spaß.)",
fontL:"SCHRIFT",bgL:"HINTERGRUND",extrL:"EXTRUSION",dsgnL:"DESIGN",resetL:"ZURÜCKSETZEN",
pg:"Jugendfreier Filter auf der Startseite — die Vollversion schaltet ihn ab.",
tcolL:"SCHRIFTFARBE",stDis:"DEAKTIVIERT",licN:"* Die Lizenz in einem Satz: Nutze deine Kits in jedem Produkt, auch kommerziell — aber das Kit und seine Assets dürfen nicht als Assets, Templates oder Packs weiterverkauft oder weiterverbreitet werden. Siehe Nutzungsbedingungen.",
fin1t:"IM BROWSER",fin1s:"Keine Installation",fin2t:"DETERMINISTISCH",fin2s:"Keine KI",fin3t:"GAME-READY",fin3s:"Überallhin exportieren",fin4t:"DEINS ZUM SHIPPEN",fin4s:"Verkaufen &amp; veröffentlichen*",finFree:"Ausgewählte Kits und begrenzte PNG-Exporte kostenlos enthalten.",
auT1:"Willkommen zurück",auT2:"Konto erstellen",auIn:"ANMELDEN",auUp:"KONTO ERSTELLEN",auEmail:"E-MAIL",auPass:"PASSWORT",auFgt:"Passwort vergessen?",auGo1:"ANMELDEN",auGo2:"KONTO ERSTELLEN",auOr:"oder",auMagic:"✉ ANMELDELINK PER E-MAIL",auFreeL:"Free Explorer — keine Karte nötig.",auTerms:"Ich akzeptiere die AGB — und die Lizenz: shippe alles, verkaufe die Assets nur nicht weiter.",auHi:"SPIELER 1",auOkT:"Angemeldet",auOkP:"Dein Studio öffnet sich für",auDoneT:"Konto erstellt",auDoneP:"Willkommen an Bord — der Editor öffnet sich für",auSentT2:"Prüfe dein Postfach",auSentP2:"Wir haben einen Anmeldelink geschickt an",auRstT:"Reset-Link verschickt",auRstP:"Die Anleitung zum Zurücksetzen ist unterwegs an",auBackL:"Zurück",bgsL:"HINTERGRÜNDE"},
ja:{l1:"数秒で",l2:"ゲームUIキットを",l3:"デザイン！",eyebrow:"ブラウザで動くゲームUIツール",
sub:'ここで本物のボタンを調整——色、形、光沢——そのまま本番投入できるキット一式に展開。すべてのピクセルは<em class="hl hl-w">決定論的</em>エンジンから生まれ、<em class="hl">AIではありません</em>。作ったものは、あなたが販売するどんなゲームや製品にも使えます。*',
open:"ジェネレーターを開く →",signin:"ログイン",micro:"このボタンは本物 — 触ってみて。",
t1:"決定論的エンジン",t1s:"すべての素材にひとつのデザイン言語——AIには約束できない一貫性。",t2:"完全にあなたのもの",t2s:"書き出して、編集して、販売するあらゆる製品に。*",t3:"クリエイターのために",t3s:"ゲーム開発者・デザイナー・スタジオ向け。",
n1:"<b>ステップ1 · マスター。</b>DNAを設定 — 色・形・ツヤ・パターン。以降すべてがこれを継承します。",
n2:"<b>ステップ2 · あなたのキット。</b>ワンクリックで全部完成 — 各パーツがマスターを継承、ステートも込み。",
n3:"<b>ステップ3 · ボード。</b><b>自分の画像をアップロード</b> — 画面でもコンセプトでも — パーツをドラッグし、背景を調光。ボードは何枚でも作れて、それぞれ書き出し・共有できます。",
n4:"<b>書き出し完了！</b>これで一巡 — マスター → キット → ボード → ファイル。次は本番でどうぞ。",
cmLbl:"プレイヤーメイド",cmTitle:"プレイヤーがつくった。<em>リミックスはあなたの番。</em>",cmSub:"どのキットも開いて、すべてリミックス — 各カードはキットの実際の設定から、同じエンジンがブラウザ内でライブ描画しています。",cmCta:"コミュニティギャラリーを見る →",cmRemix:"リミックス",seFlash:"GG — キット完成。",seSub:"マスター、キット、ボード、出荷まで——次は本物を。",seAgain:"もうひとつ作る",seTour:"サイトを見る ↓",pushHint:"気に入らないところは?マスターに戻って調整し、もう一度作成。",fpFaq:"よくある質問",cust:"カスタマイズ",pushKit:"キットを作成",pushBoard:"ボードへ",pushExport:"書き出す",pushOpen:"ジェネレーターを開く",shipDone:"エクスポート完了",shipLine:"あなたのもの — 販売するあらゆるゲームや製品に。*",compatLbl:"あなたのツールと連携",compatTitle:"いつものツールに、そのまま届く。",c_rest:"ロゴにカーソルを合わせると、キットの取り込み方法が表示されます。",c_svg:"クリーンな SVG ベクターを完全編集可能なまま読み込み — 全コンポーネント・全ステートが命名済み。",c_png:"透過 PNG を 1×/2× で書き出し。コンポーネント・ステートごとに分割済み。",c_html:"動く kit.html + kit.css 付き。開いて確認、そのままスタイルの流用も。",c_json:"全パーツ・ステート・サイズを網羅したエンジン対応 JSON マニフェスト。",c_fold:"整理されたフォルダ構造で、プロジェクトへそのまま投入可能。",c_soon:"ネイティブ書き出しは今後対応",c_unity: "ZIP をドロップするだけでキットが自動で組み上がります：9 スライス済みスプライト、配線済みプレハブ——ホバーと押下ステートは接続済み、ラベルはキットの表示書体そのもの——さらに Play するだけのプレイグラウンドシーン付き。再エクスポートはその場に収束し、テキストはエンジンのライブテキストのままです。",c_unreal:"Box 描画のマージンは計算済み — ネイティブサイズ、ピクセルインセット、0–1 への換算まですべてキットに。ステップごとの UMG レシピ付き。",c_godot:"Godot 4 は SVG を直接インポート(静的 SVG 1.1 プロファイル、ThorVG レンダリング)— どのスケールでもシャープ。PNG の予備も同梱。",c_gm:"GameMaker はベクターではなくスプライト — キットは最大 4× のクリーンな透過 PNG で届き、コンポーネント・ステートごとに分割済み。スプライトスロットと 9 スライスにそのまま。",c_c3:"SVG Picture オブジェクト(静的 SVG 1.1)で無限解像度の UI に、またはステートごとの PNG でクラシックなスプライトに — 両方入っています。",c_rblx:"Roblox の UI は PNG の世界 — ImageLabel / ImageButton 向けサイズの透過スライスに、SliceCenter へそのまま換算できる 9 スライスのマージンをマニフェストで同梱。",c_rpgm:"置くだけのスキンとシート — キットは PNG パーツを書き出し、ウィンドウスキンやシステムシートにそのまま組み込めます。",c_ase:"1× の PNG を開いてピクセル単位でリタッチ — 各コンポーネント・ステートが独立したキャンバスで届きます。",c_figma:"スクリーンショットではなく構造としてインポート — 本物のパス、命名済みレイヤー、編集できるテキスト。コンポーネントの拡張も、キットにない一点の構築も、素早く。",c_penpot:"Penpot は SVG ネイティブ — ベクターは変換されず、そのままあなたのファイルに。パス・グラデーション・グループはすべて元のまま、フィルター効果も含めて。",c_sketch:"Sketch は SVG 1.1 をインポートします。私たちが書き出すのはまさにその形式 — どのファイルも命名済みグループ、本物のパス、ライブなグラデーション。",c_aff:"Affinity は SVG 1.1 を開きます。私たちが書き出すのはまさにその形式 — 命名済みグループの本物のカーブに、配置用のステートごと PNG も。",c_ps:"Photoshop は SVG を読み込み時にラスタライズ — スマートオブジェクトとして配置すれば自由に拡大でき、最大 4× の透過 PNG もコンポーネント・ステートごとに用意。",c_ai:"Illustrator で実証済み — 命名済みレイヤーツリーとして開きます:本物のパス、本物のグラデーション、編集できるライブテキスト、エフェクトもそのまま。",c_ae:"AE はステートごとの PNG をそのままモーションへ。本物のシェイプレイヤーが必要なら、SVG を Illustrator 経由で変換すればきれいに移行できます。",c_blender:"Blender は SVG 1.1 をカーブとしてインポート — UI を押し出して 3D パネルに、または鮮明な PNG をテクスチャに。",c_krita:"Krita は SVG 1.1 をベクターレイヤーで開きます — パスをその場で編集、または PNG 書き出しの上にペイント。",c_web:"Web はホームグラウンド — インライン SVG に、クリックできる実物のコンポーネントを収めた自己完結型 HTML ファイル 1 つ。開いて、調べて、CSS の流用も。",ks1:"ボタン",ks2:"インターフェース",ks3:"コントロール",ks4:"メーターとタイマー",ks5:"HUDとプレイヤー",ks6:"ラージピース",ks7:"エンジンの新パーツ",fpCommunity:"コミュニティ",fpTag:"ひとつのマスターコンポーネントからゲーム対応の UI キットを — 決定論的エンジンが描画。スクレイピングは一切なし。",fpCopy:"© 2026 PatternBreak. All rights reserved.",fpProdH:"プロダクト",fpOpen:"ジェネレーターを開く",fpPricing:"料金",fpHow:"仕組み",fpLegalH:"法的情報",fpTerms:"利用規約",fpPrivacy:"プライバシーポリシー",fpLicense:"ライセンスを一行で",fpNewsH:"最新情報を受け取る",fpNewsP:"新コンポーネント・プリセット・機能のお知らせを、ときどき短いメールで。スパムなし、いつでも解除できます。",fpPh:"you@studio.com",fpGo:"登録する",fpOk:"リストに追加しました — ようこそ!",fpErr:"送信できなかったようです。少し後にもう一度お試しください。",fpBad:"メールアドレスの形式が正しくないようです。",ownR1:"どのキットにも自分のレシピが付属 — すべての色・トークン・タイポ設定を書き出し、アプリへそのまま読み戻せる設定ファイル付き。",ownR2:"キットが使うフォントはすべて名前とリンクを明記、商用利用も無料。",
fKit:"キット完成",fBoard:"ボード完成",bdCall1:"デザインをテスト",bdCall2:"実際の画面の上でキットを確認 — 文脈の中で見る。",fExp:"書き出し済み",comp:"コンポーネント",states:"ステート",ready:"すぐダウンロード可能",
lib:"ライブラリ",drag:"ステージへ<br>ドラッグ",color:"スタイル",round:"丸み",shine:"ツヤ",pattern:"パターン",label:"ラベル",rand:"ランダム",
live:"ライブスタジオ",prev:"ライブプレビュー",yours:"あなたのデザイン",up1:"⭱ yourworld.png — アップロード中…",up2:"✓ yourworld.png — 背景を設定",
upBtn:"⭱ 画像をアップロード",dim:"ビネット",boardW:"ボード",addB:"+ ボード",pngB:"⭳ PNG",shareB:"⤴ 共有",maxB:"デモでは4枚まで — アプリは無制限。",
upMsg:"本番アプリでは任意のPNG/JPGをドロップ — コンセプトアートもスクショも。",
pngMsg:"各ボードはフル解像度PNGとして書き出せます。",shareMsg:"各ボードに読み取り専用の共有リンクが付きます。",
sb1t:"マスターコンポーネント×1",sb1s:"無限のバリエーション。",sb2t:"90+コンポーネント",sb2s:"必須がすべて。",sb3t:"4ステート",sb3s:"常に同期。",sb4t:"どこへでも書き出し",sb4s:"エンジン・Web・PNG・SVG。",galL:"実際のアプリから",galT:"本物のプロダクト、3つの画面。",
audT:"作品を世に出す、すべての人へ",ownT:"AIなし。テンプレなし。<em>グレーゾーンなし。</em>",ownB:"本当にあなたのもの",
stepsT:"使い方",finalT:'さあ、作ろう——<br><span class="f2-grad">インストール不要。</span>',scroll:"スクロールで増殖",
hint1:"押して生成 · スクロールでもっと見る",hint2:"スクロールでもっと見る",kitPrev:"キットプレビュー（継承）",stLive:"ステート（ライブプレビュー）",stDef:"デフォルト",stHov:"ホバー",stPre:"押下",
audL:"サイドプロジェクトからリリースへ",audSub:"ゲートキーパーなし、インストール不要、専門家の空き待ちもなし。すぐ触れる本物のデザインシステム。",
aud1t:"ゲーム開発者",aud1p:"ゲームの格を上げる、磨き込まれたUIを。",aud2t:"インディー＆小規模スタジオ",aud2p:"統一されたUIシステムで、規模以上の仕上がりを。",aud3t:"ホビイスト＆メイカー",aud3p:"サイドプロジェクトを、スケッチではなく製品に見せる。",aud4t:"学生",aud4p:"本物のデザインシステムを組みながら学ぶ。",aud5t:"UIアーティスト",aud5p:"ワークフローを加速。より速くデザインし、より多く探索。",aud6t:"プロトタイパー＆ノーコード",aud6p:"美しくエクスポート可能なUIを、どんなツールやエンジンにも。",
ownP:"すべてのキットは決定論的デザインエンジンが描画します——他人の作品で訓練されたモデルではありません。スクレイピングも「〜風」もなし。あなたの設定だけが生む一点もので、公開・販売するどんな製品にも使えます。ライセンスの一線はただひとつ：キットや素材そのものを素材として転売・再配布することはできません。",
sealSm:"PatternBreak / 来歴証明書",sealYours:"あなたのもの。",sealSig:"設計から決定論的",
stepsL:"3ステップ、完全なシステム。",s1t:"マスターをデザイン",s1p:"1つのコンポーネントを調整——シルエット、マテリアル、文字、4つのステート。",s2t:"キットを生成",s2p:"1つのモデルが全コンポーネント・全サイズへ展開、キャンバス上でライブに。",s3t:"エクスポートまたは共有",s3p:"エンジンキット、HTML、SVG、PNGをダウンロード——またはライブリンクを公開。",
finalP:'エディタはすべてブラウザ内で動作。まずは<b class="f2-hl">Free Explorer</b>で始めて、フル制作ツールキットが必要になったらアップグレード。',finalBtn:"作りはじめる",footTerms:"利用規約",footPriv:"プライバシー",
galC1:'<b>エディタ。</b>ヒーローのダイヤルすべて——さらに百以上。ステートは右側にライブ表示、プリセットはワンクリック。',
galC2:'<b>キット。</b>デザインが生きたガイドラインシートに——レイヤー、ロール、全コンポーネントを記録。',
galC3:'<b>ボード——最大の見せ場。</b>実画面の上にキットを配置し、背景を調整、アートボードを書き出し。',
galC4:'<b>リリース。</b>1つのマスター → 完全なHUD：ハート、ミニマップ、ホットバー、弾薬。すべて同じDNAから。',
galC5:'<b>どのフォーマットでもあなたのもの——各項目にホバー。</b>UnityとUnreal向けのエンジン対応構造、デザインツール向けレイヤーベクター、Web向けクリーンHTML。',
exm_gamekit:"ゲームキットを書き出す",exm_svg:"SVGを書き出す",exm_png:"PNG 2×を書き出す",exm_html:"HTMLをダウンロード",exm_copy:"SVGコードをコピー",exm_settings:"書き出し設定",
exn_gamekit:'<b>エンジンにそのまま。</b>Unityスプライトアトラス + 9スライス境界；Unrealのテクスチャ命名とUMG/Slateブラシマージン、即インポート可能。',
exn_svg:'<b>レイヤーベクター。フォントは名前とリンクを明記、無料でインストール可。</b>Illustrator で実証済み、Penpot は SVG ネイティブ、ブラウザでもそのまま。',
exn_png:'<b>くっきりラスター、透過背景。</b>あらゆるエンジン・ツール・ストアにRetina対応。',
exn_html:'<b>セマンティックHTML + CSS。依存ゼロ。</b>4ステート揃った本物の<code>&lt;button&gt;</code>——どのWebプロジェクトにも貼り付け可能。',
exn_copy:'<b>正確なベクターをクリップボードへ。</b>コード、Figma、READMEに貼り付け。',
exn_settings:'<b>あなたのルック全体を1ファイルに。</b>触ったダイヤルすべて——どこでも再インポート、チームメイトに渡す、gitで管理。',
iterP:"しかも固定されません：マスターに戻ってダイヤルを回せば、システム全体が再構成——キット、ボード、書き出しまで。全体にとって最良の形へ反復していけます。（それに、いじり続けるのは純粋に楽しい。）",
fontL:"フォント",bgL:"背景",extrL:"押し出し",dsgnL:"デザイン",resetL:"リセット",
pg:"ホームではワードフィルターが有効です——製品版では解除できます。",
tcolL:"文字色",stDis:"無効",licN:"* ライセンスを一行で:キットはどんな製品にも(商用含め)使えます——ただしキットや素材そのものを素材・テンプレート・素材パックとして転売・再配布することはできません。詳細は利用規約へ。",
fin1t:"ブラウザベース",fin1s:"インストール不要",fin2t:"決定論的",fin2s:"AIではない",fin3t:"ゲームレディ",fin3s:"どこへでも書き出し",fin4t:"あなたのもの",fin4s:"販売も公開も*",finFree:"選定キットと限定PNG書き出しは無料。",
auT1:"おかえりなさい",auT2:"アカウントを作成",auIn:"サインイン",auUp:"アカウント作成",auEmail:"メール",auPass:"パスワード",auFgt:"パスワードをお忘れですか？",auGo1:"サインイン",auGo2:"アカウントを作成",auOr:"または",auMagic:"✉ サインインリンクを送る",auFreeL:"Free Explorer——カード不要。",auTerms:"利用規約とライセンスに同意します：どんな製品にも使えますが、素材の転売は不可。",auHi:"プレイヤー1",auOkT:"サインインしました",auOkP:"スタジオを開いています：",auDoneT:"アカウントを作成しました",auDoneP:"ようこそ——エディタを開いています：",auSentT2:"受信トレイをご確認ください",auSentP2:"サインインリンクを送信しました：",auRstT:"リセットリンクを送信しました",auRstP:"パスワード再設定の案内を送信しました：",auBackL:"戻る",bgsL:"背景"}
      };
      let lang = "en";
      let langStored = null;
      try { langStored = localStorage.getItem("ui-generator-lang"); } catch (_) {}
      lang = langStored || "en";
      let langChosen = !!langStored;
      if (!L[lang]) lang = "en";
      const t = (k) => (L[lang] && L[lang][k]) || L.en[k] || k;
      const q = (sel) => document.querySelector(sel);
      const narr = document.getElementById("narrTxt");
      const custBtn = document.getElementById("custBtn");
      const refreshStepUi = () => {
        stStatus.textContent = userControlled ? t("yours") : t("prev");
        narr.innerHTML = exported ? t("n4") : t("n" + step);
        custBtn.hidden = step !== 2;
        pushLabel.textContent = exported && step === 3 ? t("pushOpen")
          : step === 1 ? t("pushKit") : step === 2 ? t("pushBoard") : t("pushExport");
        document.querySelectorAll(".kit-sec span").forEach((el2) => { el2.textContent = t(el2.dataset.k); });
        const cl2 = document.getElementById("compatLabel"); if (cl2) cl2.textContent = t("compatLbl");
        const ct2 = document.getElementById("compatTitle"); if (ct2) ct2.textContent = t("compatTitle");
        const ch2 = document.getElementById("compatHint"); if (ch2) ch2.textContent = t("c_rest");
        const fe2 = document.getElementById("fpEmail"); if (fe2) fe2.placeholder = t("fpPh");
        const cmT2 = document.getElementById("cmTitle"); if (cmT2) cmT2.innerHTML = t("cmTitle");
        const ph2 = document.getElementById("pushHintTxt"); if (ph2) ph2.textContent = t("pushHint");
        const seO2 = document.getElementById("seOpen");
        if (seO2 && seO2.firstChild) { try { seO2.innerHTML = tighten(E.renderShell(engCfg(), "default", 620, 100, { label: t("pushOpen"), fs: 23 }), 40); } catch (_) {} }
        [["cmLbl", "cmLbl"], ["cmSub", "cmSub"], ["cmCta", "cmCta"], ["seFlash", "seFlash"], ["seSub", "seSub"], ["seAgain", "seAgain"], ["seTour", "seTour"]].forEach(([id2, k2]) => {
          const el2 = document.getElementById(id2); if (el2) el2.textContent = t(k2);
        });
        document.querySelectorAll(".cm-remix").forEach((el2) => { el2.textContent = t("cmRemix"); });
        const kh = document.querySelector(".kit-headline");
        if (kh) kh.innerHTML = `<span><b id="khN">${SHEET_N}</b> ${t("comp")}</span><i>×</i><span><b>4</b> ${t("states")}</span><i>—</i><span class="kh-dl">${t("ready")}</span>`;
        const upB = document.getElementById("b2Up"); if (upB) upB.textContent = t("upBtn");
        const dl = document.getElementById("dimLbl"); if (dl) dl.textContent = t("dim");
        const ad = document.getElementById("b2Add"); if (ad) ad.textContent = t("addB");
        const pg = document.getElementById("b2Png"); if (pg) pg.textContent = t("pngB");
        const sh = document.getElementById("b2Share"); if (sh) sh.textContent = t("shareB");
        if (boardBuilt) renderTabs();
      };
      const setLang = (l) => {
        lang = L[l] ? l : "en";
        try { localStorage.setItem("ui-generator-lang", lang); } catch (_) {}
        document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
        if (langChosen) {
          // An explicit choice is the page's real language — stop Chrome/Safari
          // from offering to machine-translate over our own translations.
          document.documentElement.setAttribute("translate", "no");
          document.documentElement.classList.add("notranslate");
        }
        q("#langSel").value = lang;
        q(".hero2-copy .eyebrow").textContent = t("eyebrow");
        q(".h1b").innerHTML = `${t("l1")} <br>${t("l2")} <br><span class="seconds-grad">${t("l3")}</span>`;
        q(".hero2-sub").innerHTML = t("sub");
        q(".hero2-actions .cta.primary").textContent = t("open");
        q(".hero2-actions .cta:not(.primary)").textContent = t("signin");
        q(".nav-btn.primary").textContent = t("open");
        q(".nav-btn.sign-in").textContent = t("signin");
        [["t1","t1s"],["t2","t2s"],["t3","t3s"]].forEach(([a,b],i)=>{
          const it = document.querySelectorAll(".trust2-item")[i];
          it.querySelector("b").textContent = t(a); it.querySelector("i").textContent = t(b);
        });
        q("#custTxt").textContent = t("cust");
        q(".b2-cap").textContent = t("lib");
        q(".b2-hint").innerHTML = t("drag");
        [["roundR","round"],["shineR","shine"],["labelIn","label"]].forEach(([id,key])=>{
          const el = document.querySelector(`label[for="${id}"] span:first-child`);
          if (el) el.textContent = t(key);
        });
        q(".c-color-row .c-cap").textContent = t("color");
        const patCap = document.querySelector(".c-split--pl .c-group .c-label span");
        if (patCap) patCap.textContent = t("pattern");
        const rb = q("#randBtn"); rb.lastChild.textContent = " " + t("rand");
        ["sb1t","sb1s","sb2t","sb2s","sb3t","sb3s","sb4t","sb4s"].forEach((k) => {
          const el = document.getElementById(k); if (el) el.textContent = t(k);
        });
        const sl = document.querySelector(".app-gallery .section-label"); if (sl) sl.textContent = t("galL");
        const gt = document.getElementById("galleryTitle"); if (gt) gt.textContent = t("galT");
        const at = document.getElementById("audienceTitle"); if (at) at.textContent = t("audT");
        const ot = document.getElementById("ownershipTitle"); if (ot) ot.innerHTML = t("ownT");
        const ob = document.querySelector(".ownership-badge"); if (ob) ob.textContent = t("ownB");
        const st = document.getElementById("stepsTitle"); if (st) st.textContent = t("stepsT");
        const ft = document.getElementById("finalTitle"); if (ft) ft.innerHTML = t("finalT");
        const fe2 = document.getElementById("f2Eyebrow"); if (fe2) fe2.textContent = t("stepsL").toUpperCase();
        const sc = document.querySelector(".scroll-cue"); if (sc) sc.textContent = t("scroll");
        /* body copy — audience, ownership, steps, final, footer, gallery */
        const ah = document.querySelector(".audience-head");
        if (ah) { ah.querySelector(".section-label").textContent = t("audL");
          const ap = ah.querySelector(":scope > p") || ah.parentElement.querySelector(".audience-head ~ p") || ah.querySelector("p:last-child");
          const sub = ah.querySelectorAll("p"); sub[sub.length - 1].textContent = t("audSub"); }
        document.querySelectorAll(".ppl-card").forEach((c, i) => {
          const b = c.querySelector(".ppl-head b"), p2 = c.querySelector("p");
          if (b) b.innerHTML = t("aud" + (i + 1) + "t");
          if (p2) p2.textContent = t("aud" + (i + 1) + "p");
        });
        const op = document.querySelector(".ownership-copy p"); if (op) op.textContent = t("ownP");
        const ss = document.querySelector(".seal-card small"); if (ss) ss.textContent = t("sealSm");
        const sy = document.querySelector(".seal-card strong span"); if (sy) sy.textContent = t("sealYours");
        const sg = document.querySelector(".seal-signature b"); if (sg) sg.textContent = t("sealSig");
        const sl2 = document.querySelector(".steps-head .section-label"); if (sl2) sl2.textContent = t("stepsL");
        document.querySelectorAll(".step-card").forEach((c, i) => {
          c.querySelector("h3").textContent = t("s" + (i + 1) + "t");
          c.querySelector("p").textContent = t("s" + (i + 1) + "p");
        });
        const fp = document.getElementById("finalSub"); if (fp) fp.innerHTML = t("finalP");
        const fb = document.getElementById("f2CtaTxt"); if (fb) fb.textContent = t("finalBtn");
        ["fin1t", "fin1s", "fin2t", "fin2s", "fin3t", "fin3s", "fin4t", "fin4s"].forEach((k) => {
          const el2 = document.getElementById(k); if (el2) el2.innerHTML = t(k);
        });
        const ff = document.getElementById("f2Free"); if (ff) ff.textContent = t("finFree");
        const bgc = document.getElementById("bgsCap"); if (bgc) bgc.textContent = t("bgsL");
        [["auTabIn", "auIn"], ["auTabUp", "auUp"], ["auEmailCap", "auEmail"], ["auPassCap", "auPass"],
         ["auForgot", "auFgt"], ["auOr", "auOr"], ["auMagic", "auMagic"], ["auFree", "auFreeL"],
         ["auConsentTxt", "auTerms"], ["auBackTxt", "auBackL"],
         ["shipDoneTxt", "shipDone"], ["shipLineTxt", "shipLine"],
         ["bdCall1", "bdCall1"], ["bdCall2", "bdCall2"]].forEach(([id, k]) => {
          const el2 = document.getElementById(id); if (el2) el2.textContent = t(k);
        });
        const ovEl = document.getElementById("authOv");
        if (ovEl && !ovEl.hidden) { const tt = document.getElementById("auTitle"); if (tt) tt.textContent = t("auT1"); }
        const fls = document.querySelectorAll(".footer-links a");
        if (fls.length >= 2) { fls[0].textContent = t("footTerms"); fls[1].textContent = t("footPriv"); }
        document.querySelectorAll(".app-gallery .gal-grid > figure > figcaption, .app-gallery figure > figcaption").forEach((fc, i) => {
          if (i < 5) fc.innerHTML = t("galC" + (i + 1));
        });
        document.querySelectorAll("#expMenu button").forEach((b) => {
          const ic = b.querySelector("i");
          b.innerHTML = (ic ? ic.outerHTML : "") + " " + t("exm_" + b.dataset.x);
        });
        if (expView && expView.dataset.x) { const nEl = expView.querySelector(".exp-note"); if (nEl) nEl.innerHTML = t("exn_" + expView.dataset.x); }
        const kpv = kitHint && kitHint.parentElement.firstElementChild; if (kpv) kpv.textContent = t("kitPrev");
        if (kitHint) kitHint.textContent = kitFilled ? t("hint2") : t("hint1");
        const stl = document.querySelector(".c-bottom .c-label span, .c-states .c-label span");
        document.querySelectorAll(".c-label > span").forEach((s2) => { if (/^STATES \(|^ÉTATS|^ESTADOS|^STATI|^ZUSTÄNDE|^状态|^ステート/.test(s2.textContent.trim())) s2.textContent = t("stLive"); });
        const ip = document.getElementById("stepsIter"); if (ip) ip.textContent = t("iterP");
        [["fontCap", "fontL"], ["tcolCap", "tcolL"], ["extrCap", "extrL"], ["dsgnCap", "dsgnL"], ["ownR1", "ownR1"], ["ownR2", "ownR2"],
         ["fpTag", "fpTag"], ["fpCopy", "fpCopy"], ["fpProdH", "fpProdH"], ["fpOpen", "fpOpen"], ["fpPricing", "fpPricing"],
         ["navCommunity", "fpCommunity"], ["navPricing", "fpPricing"], ["fpCommunity", "fpCommunity"],
         ["fpSignin", "signin"], ["fpFaq", "fpFaq"], ["fpHow", "fpHow"], ["fpLegalH", "fpLegalH"], ["fpTerms", "fpTerms"], ["fpPrivacy", "fpPrivacy"],
         ["fpLicense", "fpLicense"], ["fpNewsH", "fpNewsH"], ["fpNewsP", "fpNewsP"], ["fpGo", "fpGo"],
         ["ownLic", "licN"], ["footLic", "licN"]].forEach(([id, k]) => {
          const el = document.getElementById(id); if (el) el.textContent = t(k);
        });
        const rz = document.getElementById("resetBtn"); if (rz) rz.lastChild.textContent = " " + t("resetL");
        const railKeys = { default: "stDef", hover: "stHov", pressed: "stPre", disabled: "stDis" };
        document.querySelectorAll("#stateTabs button, #svTabs button").forEach((b2) => {
          const k2 = railKeys[b2.dataset.state || b2.dataset.st]; if (k2) b2.textContent = t(k2);
        });
        refreshStepUi();
      };
      custBtn.addEventListener("click", () => {
        const on = document.getElementById("studio2").classList.toggle("show-ctl");
        custBtn.classList.toggle("on", on);
      });
      document.getElementById("langSel").addEventListener("change", (e) => { langChosen = true; setLang(e.target.value); });

      applyReelEntry(REEL[0]);
      /* ── community hero lineup: owner-designated kits join the carousel ──
         GET /api/hero-lineup, fetched after first paint and appended when it
         lands. The endpoint is fail-soft and so is this: an empty, failed, or
         odd payload leaves the built-in lineup exactly as it is, each entry
         applies inside its own try/catch, and names already in the lineup are
         skipped. */
      setTimeout(() => {
        fetch("/api/hero-lineup")
          .then((r) => (r.ok ? r.json() : { heroes: [] }))
          .then((data) => {
            const heroes = Array.isArray(data && data.heroes) ? data.heroes.slice(0, 8) : [];
            const seen = new Set(PAL.map((p) => p.name.toLowerCase()).concat(REEL.map((e2) => e2.name.toLowerCase())));
            heroes.forEach((h) => {
              try {
                if (!h || typeof h.name !== "string" || !h.name.trim() || !h.cfg || typeof h.cfg !== "object") return;
                if (seen.has(h.name.toLowerCase())) return;
                warmFont(h.cfg.type && h.cfg.type.font);
                const key = "hero:" + h.name;
                HERO_CFGS[key] = h.cfg;
                // dry-run through the real renderer: a cfg the engine chokes on
                // never joins, so the attract loop can apply entries unguarded
                tighten(E.renderShell(heroCfg(key), "default", 470, 128, { label: "OK" }), 46);
                const color = (h.cfg.effects && h.cfg.effects["Inner Fill"]) || "#A855F7";
                const b = document.createElement("button");
                b.type = "button"; b.className = "sw2";
                b.style.setProperty("--sw-hi", mix(color, "#ffffff", .35));
                b.style.setProperty("--sw-lo", mix(color, "#000000", .25));
                b.setAttribute("aria-label", h.name);
                b.setAttribute("aria-pressed", "false");
                b.addEventListener("click", () => { takeOver();
                  playDesign({ pid: key, color, name: h.name }); });
                palWrap.appendChild(b);
                PAL.push({ name: h.name, color, pid: key }); // keeps the pressed-state zip aligned
                REEL.push({ hero: key, color, name: h.name });
                seen.add(h.name.toLowerCase());
              } catch (_) { /* one odd cfg stays out; the lineup stands */ }
            });
          })
          .catch(() => { /* fail-soft: the built-ins stand alone */ });
      }, 600);
      /* How-it-Works panels: fixed authored look, straight from the engine */
      try {
        const stepCfg = authoredCfg("grape-jelly");
        stepCfg.content.label = "LET’S GO";
        const heroHold = document.querySelector('.sv-hero[data-eng="hero"]');
        if (heroHold) heroHold.innerHTML = tighten(E.renderShell(stepCfg, "default", 340, 98, { label: "LET’S GO" }), 46);
        const varHold = document.getElementById("svVariant");
        const drawStep = (st) => { if (varHold) varHold.innerHTML = tighten(E.renderShell(stepCfg, st, 210, 60, { label: "LET’S GO", fs: 19 }), 40); };
        drawStep("default");
        document.querySelectorAll("#svTabs button").forEach((b) => b.addEventListener("click", () => {
          document.querySelectorAll("#svTabs button").forEach((x) => x.classList.remove("on"));
          b.classList.add("on"); drawStep(b.dataset.st);
        }));
        const flatCfg = JSON.parse(JSON.stringify(stepCfg)); flatCfg.shadow.opacity = 0;
        const node = document.querySelector('.sv-node[data-eng="node"]');
        if (node) node.innerHTML = tighten(E.renderKit(flatCfg, "iconbtn", "m", "default"), 14);
        document.querySelectorAll(".sv-art").forEach((h) => {
          const v = h.dataset.v;
          h.innerHTML = tighten(E.renderKit(flatCfg, h.dataset.kid, "m", "default",
            v !== undefined && v !== "" ? +v : undefined), 10);
        });
      } catch (err) { console.warn("step art", err); }
      /* Shipped card: hyperspace starfield. Stars live in a unit cube and fly
         past the camera; streak length falls out of the projection, so a high
         speed IS hyperspace and the decay to cruise is the ramp-down. */
      try {
        const cv = document.getElementById("hudStars");
        const cx2d = cv && cv.getContext ? cv.getContext("2d") : null;
        if (cv && cx2d) {
          const rnd = (a, b) => a + Math.random() * (b - a);
          const stars = [];
          for (let i = 0; i < 110; i++) stars.push({ x: rnd(-1, 1), y: rnd(-1, 1), z: rnd(0.08, 1) });
          const CRUISE = 0.0035, JUMP = 0.09, WARP = 0.17;
          let speed = JUMP, held = false, retX = 0.5, retY = 0.46;
          /* the reticle is the helm: drag to steer the field, hold for warp */
          const ret = document.querySelector(".hud-ret");
          const shotEl = document.querySelector(".hud-shot");
          if (ret && shotEl) {
            ret.style.pointerEvents = "auto";
            ret.style.touchAction = "none";
            ret.addEventListener("pointerdown", (ev) => {
              ev.preventDefault();
              held = true;
              ret.classList.add("is-held");
              try { ret.setPointerCapture(ev.pointerId); } catch (_) {}
            });
            ret.addEventListener("pointermove", (ev) => {
              if (!held) return;
              const r = shotEl.getBoundingClientRect();
              retX = Math.min(.92, Math.max(.08, (ev.clientX - r.left) / r.width));
              retY = Math.min(.86, Math.max(.12, (ev.clientY - r.top) / r.height));
              ret.style.left = (retX * 100) + "%";
              ret.style.top = (retY * 100) + "%";
            });
            const drop = () => { held = false; ret.classList.remove("is-held"); };
            ret.addEventListener("pointerup", drop);
            ret.addEventListener("pointercancel", drop);
          }
          /* the corner stick is the trigger — press to fire, hold for autofire */
          const bolts = [], impacts = [];
          let hitT = 0;
          const stick = document.querySelector(".hud-stick");
          const ammoB = document.querySelector(".hud-ammo b");
          if (stick) {
            const fireOnce = () => {
              if (ammoB && (parseInt(ammoB.textContent, 10) || 0) <= 0) return;
              const w = cv.offsetWidth, h = cv.offsetHeight;
              if (w && !reduceMotion) {
                const tx = w * retX, ty = h * retY;
                bolts.push({ sx: w * 0.14, sy: h + 8, tx, ty, t: 0 });
                bolts.push({ sx: w * 0.86, sy: h + 8, tx, ty, t: 0 });
              } else if (ret) {
                ret.classList.add("is-hit");
                clearTimeout(hitT); hitT = setTimeout(() => ret.classList.remove("is-hit"), 150);
              }
              if (ammoB) {
                const v2 = parseInt(ammoB.textContent, 10) || 0;
                ammoB.textContent = Math.max(0, v2 - 1);
                if (v2 <= 1) {
                  const wrap = ammoB.parentElement;
                  wrap.classList.add("is-dry");
                  setTimeout(() => { wrap.classList.remove("is-dry"); ammoB.textContent = "24"; }, 700);
                }
              }
            };
            let fireTimer = 0;
            stick.addEventListener("pointerdown", (ev) => {
              ev.preventDefault();
              stick.classList.add("is-fire");
              try { stick.setPointerCapture(ev.pointerId); } catch (_) {}
              fireOnce();
              clearInterval(fireTimer);
              fireTimer = setInterval(fireOnce, 150);
            });
            const holdFire = () => { stick.classList.remove("is-fire"); clearInterval(fireTimer); };
            stick.addEventListener("pointerup", holdFire);
            stick.addEventListener("pointercancel", holdFire);
          }
          const fit = () => { const w = cv.offsetWidth, h = cv.offsetHeight;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            if (w && cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
            cx2d.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
            return [w, h]; };
          if (reduceMotion) {
            setTimeout(() => { const [w, h] = fit(); if (!w) return;
              stars.forEach((st) => { const x = w * .5 + st.x * w * .5, y = h * .46 + st.y * h * .5;
                cx2d.fillStyle = "rgba(232,216,255,.45)"; cx2d.beginPath();
                cx2d.arc(x, y, (1 - st.z) * 1.4 + .3, 0, 7); cx2d.fill(); });
            }, 80);
          } else {
            const io = new IntersectionObserver((es) => {
              es.forEach((e) => { if (e.isIntersecting) speed = JUMP; });
            }, { threshold: 0.35 });
            io.observe(cv);
            const step2 = () => {
              if (!cv.isConnected) { io.disconnect(); return; }
              const [w, h] = fit();
              if (!w) { requestAnimationFrame(step2); return; }
              cx2d.clearRect(0, 0, w, h);
              const cx = w * retX, cy = h * retY, f = Math.min(w, h) * .9;
              speed += ((held ? WARP : CRUISE) - speed) * (held ? 0.1 : 0.012);
              cx2d.lineCap = "round";
              for (const st of stars) {
                const pz = st.z;
                st.z -= speed * st.z;
                if (st.z < 0.03) { st.x = rnd(-1, 1); st.y = rnd(-1, 1); st.z = 1; continue; }
                const x2 = cx + (st.x / st.z) * f, y2 = cy + (st.y / st.z) * f;
                if (x2 < -40 || x2 > w + 40 || y2 < -40 || y2 > h + 40) { st.x = rnd(-1, 1); st.y = rnd(-1, 1); st.z = 1; continue; }
                const x1 = cx + (st.x / pz) * f, y1 = cy + (st.y / pz) * f;
                cx2d.strokeStyle = "rgba(232, 216, 255, " + Math.min(.85, (1 - st.z) * .9 + .08).toFixed(2) + ")";
                cx2d.lineWidth = Math.min(2.4, (1 - st.z) * 2 + .5);
                cx2d.beginPath(); cx2d.moveTo(x1, y1); cx2d.lineTo(x2, y2); cx2d.stroke();
              }
              for (let i3 = bolts.length - 1; i3 >= 0; i3--) {
                const b3 = bolts[i3];
                b3.t += 0.09;
                if (b3.t >= 1) {
                  impacts.push({ x: b3.tx, y: b3.ty, t: 0 });
                  if (ret) { ret.classList.add("is-hit");
                    clearTimeout(hitT); hitT = setTimeout(() => ret.classList.remove("is-hit"), 140); }
                  bolts.splice(i3, 1); continue;
                }
                const bx2 = b3.sx + (b3.tx - b3.sx) * b3.t, by2 = b3.sy + (b3.ty - b3.sy) * b3.t;
                const t0 = Math.max(0, b3.t - .16);
                const bx1 = b3.sx + (b3.tx - b3.sx) * t0, by1 = b3.sy + (b3.ty - b3.sy) * t0;
                cx2d.strokeStyle = "rgba(240, 171, 252, .35)"; cx2d.lineWidth = 7;
                cx2d.beginPath(); cx2d.moveTo(bx1, by1); cx2d.lineTo(bx2, by2); cx2d.stroke();
                cx2d.strokeStyle = "rgba(232, 121, 249, .9)"; cx2d.lineWidth = 3.5;
                cx2d.beginPath(); cx2d.moveTo(bx1, by1); cx2d.lineTo(bx2, by2); cx2d.stroke();
                cx2d.strokeStyle = "rgba(255, 255, 255, .95)"; cx2d.lineWidth = 1.6;
                cx2d.beginPath(); cx2d.moveTo(bx1, by1); cx2d.lineTo(bx2, by2); cx2d.stroke();
                if (b3.t < .18) { cx2d.fillStyle = "rgba(240, 171, 252, .55)";
                  cx2d.beginPath(); cx2d.arc(b3.sx, b3.sy, 7, 0, 7); cx2d.fill(); }
              }
              for (let i3 = impacts.length - 1; i3 >= 0; i3--) {
                const im = impacts[i3];
                im.t += 0.08;
                if (im.t >= 1) { impacts.splice(i3, 1); continue; }
                const a2 = 1 - im.t;
                cx2d.strokeStyle = "rgba(240, 171, 252, " + (a2 * .8).toFixed(2) + ")";
                cx2d.lineWidth = 2 * a2 + .5;
                cx2d.beginPath(); cx2d.arc(im.x, im.y, 5 + im.t * 30, 0, 7); cx2d.stroke();
                if (im.t < .3) { cx2d.fillStyle = "rgba(255, 255, 255, " + ((0.3 - im.t) * 2.4).toFixed(2) + ")";
                  cx2d.beginPath(); cx2d.arc(im.x, im.y, 4, 0, 7); cx2d.fill(); }
              }
              requestAnimationFrame(step2);
            };
            requestAnimationFrame(step2);
          }
        }
      } catch (err) { console.warn("starfield", err); }
      /* compat garden: brand-colored wordmark tiles; hover pauses + explains */
      try {
        const CP = {
          unity: "m12.9288 4.2939 3.7997 2.1929c.1366.077.1415.2905 0 .3675l-4.515 2.6076a.4192.4192 0 0 1-.4246 0L7.274 6.8543c-.139-.0745-.1415-.293 0-.3675l3.7972-2.193V0L1.3758 5.5977V16.793l3.7177-2.1456v-4.3858c-.0025-.1565.1813-.2682.318-.1838l4.5148 2.6076a.4252.4252 0 0 1 .2136.3676v5.2127c.0025.1565-.1813.2682-.3179.1838l-3.7996-2.1929-3.7178 2.1457L12 24l9.6954-5.5977-3.7178-2.1457-3.7996 2.1929c-.1341.082-.3229-.0248-.3179-.1838V13.053c0-.1565.087-.2956.2136-.3676l4.5149-2.6076c.134-.082.3228.0224.3179.1838v4.3858l3.7177 2.1456V5.5977L12.9288 0Z",
          unrealengine: "M12 0a12 12 0 1012 12A12 12 0 0012 0zm0 23.52A11.52 11.52 0 1123.52 12 11.52 11.52 0 0112 23.52zm7.13-9.791c-.206.997-1.126 3.557-4.06 4.942l-1.179-1.325-1.988 2a7.338 7.338 0 01-5.804-2.978 2.859 2.859 0 00.65.123c.326.006.678-.114.678-.66v-5.394a.89.89 0 00-1.116-.89c-.92.212-1.656 2.509-1.656 2.509a7.304 7.304 0 012.528-5.597 7.408 7.408 0 013.73-1.721c-1.006.573-1.57 1.507-1.57 2.29 0 1.262.76 1.109.984.923v7.28a1.157 1.157 0 00.148.256 1.075 1.075 0 00.88.445c.76 0 1.747-.868 1.747-.868V9.172c0-.6-.452-1.324-.905-1.572 0 0 .838-.149 1.484.346a5.537 5.537 0 01.387-.425c1.508-1.48 2.929-1.902 4.112-2.112 0 0-2.151 1.69-2.151 3.96 0 1.687.043 5.801.043 5.801.799.771 1.986-.342 3.059-1.441Z",
          godotengine: "M9.5598.683c-1.096.244-2.1812.5831-3.1983 1.0951.023.8981.081 1.7582.199 2.6323-.395.253-.81.47-1.178.766-.375.288-.7581.564-1.0971.9011-.6781-.448-1.3962-.869-2.1352-1.2411C1.3532 5.6934.608 6.6186 0 7.6546c.458.7411.936 1.4352 1.4521 2.0942h.014v6.3565c.012 0 .023 0 .035.003l3.8963.376c.204.02.364.184.378.3891l.12 1.7201 3.3994.242.234-1.587c.03-.206.207-.358.415-.358h4.1114c.208 0 .385.152.415.358l.234 1.587 3.3993-.242.12-1.72a.4196.4196 0 01.378-.3891l3.8954-.376c.012 0 .023-.003.035-.003v-.5071h.002V9.7498h.014c.516-.659.994-1.3531 1.4521-2.0942-.608-1.036-1.3541-1.9611-2.1512-2.8192-.739.372-1.4571.793-2.1352 1.2411-.339-.337-.721-.613-1.096-.901-.369-.296-.7841-.5131-1.1781-.7661.117-.8741.175-1.7342.199-2.6323-1.0171-.512-2.1012-.851-3.1983-1.095-.438.736-.838 1.533-1.1871 2.3121-.414-.069-.829-.094-1.2461-.099h-.016c-.417.005-.832.03-1.2461.099-.349-.779-.749-1.576-1.1881-2.3121l.001-.001zM6.4765 9.9889c1.2971 0 2.3492 1.0511 2.3492 2.3482s-1.052 2.3482-2.3492 2.3482c-1.296 0-2.3482-1.051-2.3482-2.3482 0-1.297 1.0511-2.3482 2.3482-2.3482zm11.049 0c1.296 0 2.3482 1.0511 2.3482 2.3482s-1.0511 2.3482-2.3482 2.3482-2.3492-1.051-2.3492-2.3482c0-1.297 1.051-2.3482 2.3492-2.3482zm-10.824.9301c-.861 0-1.559.698-1.559 1.5591s.698 1.5582 1.559 1.5582c.8611 0 1.5592-.698 1.5592-1.5582 0-.86-.697-1.559-1.5591-1.559zm10.598 0c-.8611 0-1.5582.698-1.5582 1.5591s.697 1.5582 1.5581 1.5582c.8611 0 1.5592-.698 1.5592-1.5582 0-.86-.697-1.559-1.5592-1.559zm-5.2985.453c.417 0 .757.308.757.6871v2.1622c0 .379-.339.687-.757.687s-.756-.308-.756-.687V12.059c0-.379.339-.687.756-.687zM1.4601 16.9464c.002.377.006.789.006.871 0 3.7014 4.6944 5.4795 10.5269 5.5005h.014c5.8325-.02 10.5259-1.7991 10.5259-5.5004 0-.084.005-.495.007-.871l-3.5023.338-.121 1.729a.421.421 0 01-.389.3901l-4.1814.296a.4203.4203 0 01-.415-.358l-.238-1.6141h-3.3863l-.238 1.6141a.4192.4192 0 01-.4451.357l-4.1513-.296c-.208-.015-.375-.181-.389-.389l-.12-1.7292-3.5044-.337z",
          gamemaker: "M.012 11.994 12.006 0l11.982 12.006h-6.831l-5.163-5.151-5.151 5.151 5.163 5.151v-5.151h5.151v6.903L12.006 24z",
          construct3: "M12.392 0c-6.752 0-12 5.498-12 12 0 6.574 5.313 12 12 12 4.283 0 8.087-2.254 10.217-5.704a.571.571 0 0 0-.2-.795l-5.55-3.204a.572.572 0 0 0-.76.177 4.453 4.453 0 0 1-3.707 1.983c-2.458 0-4.458-2-4.458-4.457 0-2.458 2-4.457 4.458-4.457 1.491 0 2.877.741 3.707 1.983a.571.571 0 0 0 .76.177l5.55-3.204a.571.571 0 0 0 .2-.795A11.998 11.998 0 0 0 12.392 0zm0 3.527c3.048 0 5.72 1.61 7.213 4.026l-2.99 1.726c-.037.021-.085.013-.108-.026a4.942 4.942 0 0 0-4.115-2.2A4.953 4.953 0 0 0 7.445 12c0 .9.241 1.745.663 2.473l-2.342 1.353a.327.327 0 0 0-.112.458 7.977 7.977 0 0 0 6.738 3.7 7.978 7.978 0 0 0 6.789-3.781l2.983 1.722a.08.08 0 0 1 .028.113 11.447 11.447 0 0 1-9.8 5.472C6.045 23.51.882 18.346.882 12c0-2.095.562-4.06 1.544-5.754l2.35 1.356c.15.088.345.04.439-.11a8.467 8.467 0 0 1 7.177-3.966zM22.965 8.95a.666.666 0 0 0-.336.088l-4.149 2.395a.654.654 0 0 0 0 1.131l4.149 2.396c.434.25.98-.064.98-.566v-4.79a.655.655 0 0 0-.644-.654zm-.663 1.785v2.528L20.112 12z",
          robloxstudio: "M 13.936 15.356 L 1.826 12.112 L 0 18.93 L 18.928 24 L 21.608 14.01 L 14.79 12.18 L 13.936 15.356 Z M 5.072 0 L 2.394 9.992 L 9.21 11.822 L 10.064 8.644 L 22.174 11.89 L 24 5.072 L 5.072 0 Z",
          aseprite: "M4.006 0v1.6h15.988V0zm15.988 1.6v1.6h1.6V1.6zm1.6 1.6v14.4h-1.6v1.6H4.006v-1.6h-1.6V3.2H.809v17.6h1.599v1.6h1.599V24h15.988v-1.6h1.6v-1.6h1.598V3.2zm-19.187 0h1.599V1.6h-1.6zm4.796 3.2v6.4h1.6V6.4zm7.995 0v6.4h1.599V6.4z",
          figma: "M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z",
          penpot: "M7.654 0 5.13 3.554v2.01L2.934 6.608l-.02-.009v13.109l8.563 4.045L12 24l.523-.247 8.563-4.045V6.6l-.017.008-2.196-1.045V3.555l-.077-.108L16.349.001l-2.524 3.554v.004L11.989.973l-1.823 2.566-.065-.091zm.447 2.065.976 1.374H6.232l.964-1.358zm8.694 0 .976 1.374h-2.845l.965-1.358zm-4.36.971.976 1.375h-2.845l.965-1.359zM5.962 4.132h1.35v4.544l-1.35-.638Zm2.042 0h1.343v5.506l-1.343-.635zm6.652 0h1.35V9l-1.35.637V4.132zm2.042 0h1.343v3.905l-1.343.634zm-6.402.972h1.35v5.62l-1.35-.638zm2.042 0h1.343v4.993l-1.343.634zm6.534 1.493 1.188.486-1.188.561zM5.13 6.6v1.047l-1.187-.561ZM3.96 8.251l7.517 3.55v10.795l-7.516-3.55zm16.08 0v10.794l-7.517 3.55V11.802z",
          sketch: "M12 1.25l6.75 6.637V2L12 1.25zm0 0l-6.05 7h12.1l-6.05-7zm0 0L5.25 2v5.887L12 1.25zM5.25 2L0 9l4.416-.68L5.25 2zM0 9l11.959 13.703.008-.014L4.443 9H0zm18.75-7l.834 6.32L24 9l-5.25-7zM24 9h-4.506l-7.523 13.69.029.06L24 9zM12 22.75l-.031-.057-.008.012.039.045zM5.436 9l6.533 13.686L18.564 9H5.436Z",
          blender: "M12.51 13.214c.046-.8.438-1.506 1.03-2.006a3.424 3.424 0 0 1 2.212-.79c.85 0 1.631.3 2.211.79.592.5.983 1.206 1.028 2.005.045.823-.285 1.586-.865 2.153a3.389 3.389 0 0 1-2.374.938 3.393 3.393 0 0 1-2.376-.938c-.58-.567-.91-1.33-.865-2.152M7.35 14.831c.006.314.106.922.256 1.398a7.372 7.372 0 0 0 1.593 2.757 8.227 8.227 0 0 0 2.787 2.001 8.947 8.947 0 0 0 3.66.76 8.964 8.964 0 0 0 3.657-.772 8.285 8.285 0 0 0 2.785-2.01 7.428 7.428 0 0 0 1.592-2.762 6.964 6.964 0 0 0 .25-3.074 7.123 7.123 0 0 0-1.016-2.779 7.764 7.764 0 0 0-1.852-2.043h.002L13.566 2.55l-.02-.015c-.492-.378-1.319-.376-1.86.002-.547.382-.609 1.015-.123 1.415l-.001.001 3.126 2.543-9.53.01h-.013c-.788.001-1.545.518-1.695 1.172-.154.665.38 1.217 1.2 1.22V8.9l4.83-.01-8.62 6.617-.034.025c-.813.622-1.075 1.658-.563 2.313.52.667 1.625.668 2.447.004L7.414 14s-.069.52-.063.831zm12.09 1.741c-.97.988-2.326 1.548-3.795 1.55-1.47.004-2.827-.552-3.797-1.538a4.51 4.51 0 0 1-1.036-1.622 4.282 4.282 0 0 1 .282-3.519 4.702 4.702 0 0 1 1.153-1.371c.942-.768 2.141-1.183 3.396-1.185 1.256-.002 2.455.41 3.398 1.175.48.391.87.854 1.152 1.367a4.28 4.28 0 0 1 .522 1.706 4.236 4.236 0 0 1-.239 1.811 4.54 4.54 0 0 1-1.035 1.626",
          krita: "M.652.76a.625.625 0 00-.5.246c-.352.448-.035.898.362 1.262.206.189 1.77 1.794 3.428 3.527a11.054 11.054 0 011.815-1.983C3.667 2.515 1.694 1.266 1.461 1.1 1.201.914.917.762.652.76zm5.105 3.052c1.848 1.148 3.786 2.332 4.693 2.84 1.469.821 3.758 2.684 4.092 4.434.535.466 2.182 1.916 2.596 2.413.698-.211 1.518.133 2.06 1.12.866 1.583.227 3.747-1.968 4.988a5.42 5.42 0 01-.296.267l.296-.267c1.14-1.468-.714-2.44-1.175-3.864a2.06 2.06 0 01-.11-.78c-.533-.282-2.11-1.452-2.795-1.965-1.801.16-4.207-1.773-5.35-3.08-.7-.802-2.32-2.517-3.858-4.123a11.052 11.052 0 00-2.046 6.393A11.052 11.052 0 1012.948 1.136c-2.64.004-5.19.954-7.19 2.676zm8.71 7.552c-.515.126-.968.831-1.118 1.306-.038.115-.04.303.066.342.802.592 1.556 1.168 2.4 1.7.162-.393.746-.963 1.096-1.2zm-11.53 1.639c.812 1.898 5.798 7.17 12.06 2.695a2.07 2.07 0 00.114.715c.46 1.42 2.36 2.427 1.238 3.89-2.135 1.364-5 1.201-6.989.528-3.558-1.204-5.914-4.332-6.424-7.828zm13.782.7a.771.771 0 00-.065.049c-.004.003-.008.008-.011.008.003-.003.007-.008.01-.008.024-.015.044-.034.066-.048z",
          html5: "M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z",
        };
        /* [name, accent, icon, fragments, roadmap] — icon is ["p", path, color|"mono"]
           for a real mark (Simple Icons set, CC0; marks stay their owners' trademarks,
           shown nominatively) or ["b", letters, bg, ink] for brands not in the set */
        const CTOOLS = [
          ["Unity", "#9aa3c7", ["p", CP.unity, "mono"], "c_unity", 0],
          ["Unreal Engine", "#8798c8", ["p", CP.unrealengine, "mono"], "c_unreal", 1],
          ["Godot", "#478cbf", ["p", CP.godotengine, "#478cbf"], "c_godot", 1],
          ["GameMaker", "#8bc53f", ["p", CP.gamemaker, "#8bc53f"], "c_gm", 0],
          ["Construct 3", "#00c3a5", ["p", CP.construct3, "#00c3a5"], "c_c3", 0],
          ["Roblox Studio", "#00a2ff", ["p", CP.robloxstudio, "#00a2ff"], "c_rblx", 0],
          ["RPG Maker", "#8f6bd6", ["b", "RM", "#42287c", "#e9dcff"], "c_rpgm", 0],
          ["Aseprite", "#ff5277", ["p", CP.aseprite, "#7d929e"], "c_ase", 0],
          ["Figma", "#a259ff", ["p", CP.figma, "#f24e1e"], "c_figma", 0],
          ["Penpot", "#31efb8", ["p", CP.penpot, "mono"], "c_penpot", 0],
          ["Sketch", "#fdb300", ["p", CP.sketch, "#f7b500"], "c_sketch", 0],
          ["Affinity", "#2f9ff3", ["b", "A", "#143c57", "#7cc4ff"], "c_aff", 0],
          ["Photoshop", "#31a8ff", ["b", "Ps", "#001e36", "#31a8ff"], "c_ps", 0],
          ["Illustrator", "#ff9a00", ["b", "Ai", "#330000", "#ff9a00"], "c_ai", 0],
          ["After Effects", "#9999ff", ["b", "Ae", "#00005b", "#9999ff"], "c_ae", 0],
          ["Blender", "#e87d0d", ["p", CP.blender, "#e87d0d"], "c_blender", 0],
          ["Krita", "#3babff", ["p", CP.krita, "#3babff"], "c_krita", 0],
          ["HTML / CSS", "#e34f26", ["p", CP.html5, "#e34f26"], "c_web", 0],
        ];
        const cTrack = document.getElementById("compatTrack");
        const head = document.getElementById("compatHead"), spot = document.getElementById("compatSpot");
        const csIco = document.getElementById("csIco"), csName = document.getElementById("csName");
        const csHow = document.getElementById("csHow"), csSoon = document.getElementById("csSoon");
        if (cTrack && head && spot && csIco && csName && csHow && csSoon) {
          let hideT = 0;
          const NS = "http://www.w3.org/2000/svg";
          const mkIco = (ic) => {
            if (ic[0] === "b") {
              const sp = document.createElement("span");
              sp.className = "compat-badge"; sp.textContent = ic[1];
              sp.style.background = ic[2]; sp.style.color = ic[3];
              return sp;
            }
            const sv = document.createElementNS(NS, "svg");
            sv.setAttribute("viewBox", "0 0 24 24");
            const pa = document.createElementNS(NS, "path");
            pa.setAttribute("d", ic[1]);
            if (ic[2] !== "mono") pa.setAttribute("fill", ic[2]);
            sv.appendChild(pa);
            return sv;
          };
          const mkTile = (tool, ghost) => {
            const nm = tool[0], ac = tool[1], ic = tool[2], how = tool[3], soon = tool[4];
            const b2 = document.createElement("button");
            b2.type = "button";
            b2.className = "compat-tile" + (ic[0] === "p" && ic[2] === "mono" ? " compat-tile--mono" : "");
            b2.style.setProperty("--ac", ac);
            b2.appendChild(mkIco(ic));
            b2.appendChild(document.createTextNode(nm));
            if (ghost) { b2.tabIndex = -1; b2.setAttribute("aria-hidden", "true"); }
            const show = () => {
              clearTimeout(hideT);
              csName.textContent = nm;
              csHow.textContent = t(how);
              csSoon.hidden = !soon;
              csSoon.textContent = t("c_soon");
              spot.style.setProperty("--ac", ac);
              csIco.classList.toggle("cs-ico--mono", ic[0] === "p" && ic[2] === "mono");
              csIco.textContent = "";
              csIco.appendChild(mkIco(ic));
              head.classList.add("is-spot");
            };
            const hide = () => {
              clearTimeout(hideT);
              hideT = setTimeout(() => head.classList.remove("is-spot"), 350);
            };
            b2.addEventListener("pointerenter", show);
            b2.addEventListener("focus", show);
            b2.addEventListener("click", show);
            b2.addEventListener("pointerleave", hide);
            b2.addEventListener("blur", hide);
            return b2;
          };
          CTOOLS.forEach((t2) => cTrack.appendChild(mkTile(t2, false)));
          CTOOLS.forEach((t2) => cTrack.appendChild(mkTile(t2, true)));
        }
      } catch (err) { console.warn("compat", err); }
      /* footer: newsletter sign-up posts to /api/subscribe; scroll links */
      try {
        const fpForm = document.getElementById("fpForm");
        if (fpForm) {
          const em = document.getElementById("fpEmail"), go = document.getElementById("fpGo"), fnote = document.getElementById("fpNote");
          const hp = document.getElementById("fpHp");
          fpForm.addEventListener("submit", (ev) => {
            ev.preventDefault();
            const v = (em.value || "").trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
              fnote.hidden = false; fnote.dataset.err = "1"; fnote.textContent = t("fpBad"); return;
            }
            go.disabled = true;
            fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: v, source: "footer",
                locale: document.documentElement.lang || "en", website: hp ? hp.value : "" }) })
              .then((r) => {
                if (!r.ok && r.status !== 409) throw 0;
                fpForm.hidden = true; delete fnote.dataset.err;
                fnote.hidden = false; fnote.textContent = t("fpOk");
              })
              .catch(() => { fnote.hidden = false; fnote.dataset.err = "1"; fnote.textContent = t("fpErr"); })
              .finally(() => { go.disabled = false; });
          });
        }
        const fpHow = document.getElementById("fpHow");
        if (fpHow) fpHow.addEventListener("click", (ev) => { ev.preventDefault();
          const sc = document.querySelector(".step-card");
          if (sc && sc.closest("section")) sc.closest("section").scrollIntoView({ behavior: "smooth" }); });
        const fpLic = document.getElementById("fpLicense");
        if (fpLic) fpLic.addEventListener("click", (ev) => { ev.preventDefault();
          const ol = document.getElementById("ownLic");
          if (ol) ol.scrollIntoView({ behavior: "smooth", block: "center" }); });
      } catch (err) { console.warn("footer", err); }
      /* community: three demo cards, drawn live from authored presets —
         the real gallery does the same trick with makers' saved settings */
      try {
        const CM_KITS = [
          ["grape-jelly", "Grape Arcade", "@pixelpunch", 218, "#a855f7"],
          ["deep-ocean", "Abyss Console", "@reefbuilder", 154, "#0e7490"],
          ["hero-chisel", "Forge Standard", "@anvilworks", 131, "#b45309"],
        ];
        /* placeholder portrait — swapped for real maker photos later */
        const mkAva = (bg) => "data:image/svg+xml," + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
          '<rect width="64" height="64" fill="' + bg + '"/>' +
          '<circle cx="32" cy="24" r="11" fill="rgba(255,255,255,.92)"/>' +
          '<path d="M10 64c2-14 10-21 22-21s20 7 22 21z" fill="rgba(255,255,255,.92)"/></svg>');
        const cmWrap = document.getElementById("cmCards");
        if (cmWrap) CM_KITS.forEach(([pid, nm, by, likes, ac]) => {
          const card = document.createElement("a");
          card.className = "cm-card";
          card.href = "#/community";
          let big = "", bits = "", frame = "";
          try {
            let c2 = null;
            try { c2 = authoredCfg(pid); } catch (_) {}
            if (!c2) c2 = E.applyPresetFull(E.defaultConfig(), pid);
            big = tighten(E.renderShell(c2, "default", 420, 116, { label: nm.split(" ")[0].toUpperCase() }), 40);
            bits = [["badge", undefined], ["toggle", 1], ["progress", 64]].map(([kid, v]) =>
              '<span class="cm-bit">' + tighten(E.renderKit(c2, kid, "m", "default", v), 12) + "</span>").join("");
            frame = tighten(E.renderKit(c2, "avatarframe", "m", "default"), 22)
              .replace(/<defs><radialGradient id="kn[\s\S]*?<\/text>/, "");
          } catch (_) {}
          card.innerHTML = '<div class="cm-head"><span class="cm-ava"><img src="' + mkAva(ac) + '" alt="">' + frame + '</span>'
            + '<div class="cm-id"><b>' + nm + '</b><span>' + by + '</span></div></div>'
            + '<div class="cm-big">' + big + '</div><div class="cm-bits">' + bits + '</div>'
            + '<div class="cm-foot"><span class="cm-likes">\u2665 ' + likes + '</span><i class="cm-remix">' + t("cmRemix") + '</i></div>';
          cmWrap.appendChild(card);
        });
      } catch (err) { console.warn("community", err); }
      /* final section: floating HUD chips drawn by the engine, photos reused from the strip */
      try {
        const mkHud = (pid, id, v, opts) => { const c2 = E.applyPresetFull(E.defaultConfig(), pid);
          return tighten(E.renderKit(c2, id, "m", "default", v, undefined, opts || {}), 12); };
        [["f2HudHealth", () => mkHud("bubble-pop", "lives", undefined, { label: "4", max: "5" })],
         ["f2HudXp", () => mkHud("grape-jelly", "progress", 49)],
         ["f2HudShield", () => mkHud("deep-ocean", "toggle", 1)],
         ["f2HudCoins", () => mkHud("hero-chisel", "resource", undefined, { label: "1,250" })],
         ["f2HudProg", () => mkHud("glacier-tech", "progress", 72)]
        ].forEach(([id, fn]) => { const el2 = document.getElementById(id);
          if (el2) { try { el2.innerHTML = fn(); } catch (_) {} } });
        /* the CTA arcs like a flux capacitor on rollover */
        const cta2 = document.querySelector(".f2-cta");
        if (cta2 && !reduceMotion) {
          cta2.addEventListener("pointerenter", () => {
            if (cta2.querySelectorAll(".f2-spark").length > 18) return;
            for (let i2 = 0; i2 < 12; i2++) {
              const sp = document.createElement("i");
              sp.className = "f2-spark";
              const top = Math.random() < .5;
              sp.style.left = (6 + Math.random() * 88) + "%";
              sp.style.top = top ? "-2px" : "calc(100% + 2px)";
              cta2.appendChild(sp);
              const dx = (Math.random() * 2 - 1) * 80;
              const dy = (top ? -1 : 1) * (26 + Math.random() * 50);
              const rot = Math.random() * 260 - 130;
              sp.animate([
                { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
                { transform: "translate(" + dx + "px, " + dy * 1.25 + "px) rotate(" + rot + "deg) scale(.35)", opacity: 0 }
              ], { duration: 380 + Math.random() * 240, easing: "cubic-bezier(.2, .7, .3, 1)",
                   delay: Math.random() * 80, fill: "forwards" })
                .finished.then(() => sp.remove()).catch(() => sp.remove());
            }
          });
        }
        const pplImgs = document.querySelectorAll(".ppl-photo img");
        [["f2P1", 1], ["f2P2", 5], ["f2P3", 0]].forEach(([id, idx]) => {
          const el2 = document.getElementById(id); if (el2 && pplImgs[idx]) el2.src = pplImgs[idx].src; });
      } catch (err) { console.warn("final art", err); }
      startAttract();
      setLang(lang);
      /* real app wiring: sign-in opens the cloud auth overlay; every
         open-generator CTA routes into the editor */
      document.querySelectorAll('.nav-btn.sign-in, .hero2-actions .cta:not(.primary)').forEach((b) =>
        b.addEventListener("click", (ev) => { ev.preventDefault(); deps.openAuth(); }));
      document.querySelectorAll('[data-cta="open-generator"], .nav-btn.primary, .hero2-actions .cta.primary').forEach((b) =>
        b.addEventListener("click", (ev) => { ev.preventDefault(); deps.navigate("#/app"); }));
      window.UI_GENERATOR_HOOKS = { getDesign: () => ({ ...design }), setLang };
    
}
