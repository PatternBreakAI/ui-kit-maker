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
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)");
      let savedTheme = null;
      try { savedTheme = localStorage.getItem("ui-generator-theme"); } catch (_) {}
      root.dataset.theme = savedTheme || (prefersLight.matches ? "light" : "dark");

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
         auth:neon-versus, auth:bubble-pop). Reel entries may append a
         label after "|", e.g. "citrus-pop|CLAIM". Chip colors and names
         derive from each preset automatically. */
      const HERO_SWATCHES = ["grape-jelly", "bubble-pop", "deep-ocean", "hard-candy", "forest-sprite", "citrus-pop", "hero-chisel", "glacier-tech"];
      const HERO_REEL = ["auth:grape-jelly", "hard-candy|PLAY", "auth:neon-versus", "citrus-pop|CLAIM", "auth:bubble-pop", "royal-vault|EQUIP"];

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
      const drawMaster = (st) => { const c = engCfg(); masterSvg.innerHTML = tighten(E.renderShell(c, st || "default", 470, 128, { label: c.content.label }), 46); };
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
        const pat = PATTERNS[d.pattern];
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
      const stStatus = $("stStatus"), playCtl = $("playCtl"), pauseCtl = $("pauseCtl");
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
        b.addEventListener("click", () => { takeOver();
          design.cfg = E.applyPresetFull(E.defaultConfig(), p.pid);
          design.pid = p.pid;
          syncFromCfg();
          apply({ color: p.color, name: p.name }); });
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
        const pat = PATTERNS[design.pattern];
        root.style.setProperty("--pat", pat.css);
        root.style.setProperty("--pat-size", pat.size);

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
      const applyReelEntry = (e) => {
        design.cfg = e.auth ? authoredCfg(e.auth) : E.applyPresetFull(E.defaultConfig(), e.pid);
        design.pid = e.auth ? "auth:" + e.auth : e.pid;
        syncFromCfg();
        apply({ color: e.color, name: e.name, label: (e.label || design.cfg.content.label || "PLAY").toUpperCase() });
      };
      let attractTimer = null, reelI = 0;
      const startAttract = () => {
        userControlled = false;
        stStatus.textContent = t("prev"); stStatus.classList.remove("is-user");
        playCtl.classList.add("is-on"); pauseCtl.classList.remove("is-on");
        clearInterval(attractTimer);
        attractTimer = setInterval(() => { reelI = (reelI + 1) % REEL.length; applyReelEntry(REEL[reelI]); }, reduceMotion ? 6000 : 2800);
      };
      const takeOver = () => {
        if (userControlled) return;
        userControlled = true;
        clearInterval(attractTimer);
        stStatus.textContent = t("yours"); stStatus.classList.add("is-user");
        playCtl.classList.remove("is-on"); pauseCtl.classList.add("is-on");
      };
      playCtl.addEventListener("click", startAttract);
      pauseCtl.addEventListener("click", takeOver);

      /* FONT — the four faces shipped with this page (all from the app's roster) */
      { const fw = $("fontChips");
        ["Russo One", "Fredoka", "Lilita One", "Bungee"].forEach((f) => {
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
        design.cfg = design.pid && design.pid.startsWith("auth:") ? authoredCfg(design.pid.slice(5))
          : E.applyPresetFull(E.defaultConfig(), design.pid || "grape-jelly");
        syncFromCfg(); apply({}); });
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
        design.cfg = E.randomizeConfig(design.cfg);
        syncFromCfg();
        const labels = ["PLAY", "CLAIM", "BOOST", "START", "GO", "EQUIP", "COLLECT", "WIN"];
        apply({ color: design.cfg.effects["Inner Fill"] || design.color, name: "Random roll",
          label: labels[Math.floor(Math.random() * labels.length)] });
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
      const SHEET = (() => {
        /* every engine component exactly once — no size duplicates, no state repeats */
        const items = [];
        for (const k of E.KIT_COMPONENTS)
          items.push({ cap: k.name.toUpperCase(), kid: k.id, sz: "l",
            v: FLIP_IDS.has(k.id) ? 1 : k.id === "slider" ? 64 : BUMP_IDS.has(k.id) ? 72 : undefined });
        return items;
      })();
      const SHEET_N = SHEET.length;
      const buildSheet = () => {
        pvKit.innerHTML = `<div class="kit-headline"><span><b id="khN">0</b> ${t("comp")}</span><i>×</i><span><b>4</b> ${t("states")}</span><i>—</i><span class="kh-dl">${t("ready")}</span></div>`;
        SHEET.forEach((it) => {
          const cell = document.createElement("div");
          cell.className = "kcell pre";
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
        1: { label: "MASTER / 01", push: "PUSH TO A KIT" },
        2: { label: "KIT / 02", push: "PUSH TO A BOARD" },
        3: { label: "BOARD / 03", push: "EXPORT" }
      };
      const showStep = (nStep) => {
        step = nStep; maxStep = Math.max(maxStep, nStep);
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

      const toBoard = () => {
        takeOver();
        showStep(3);
        boardIntro();
        setTimeout(() => flash(t("fBoard")), reduceMotion ? 60 : 1500);
      };

      const doExport = () => {
        takeOver();
        if (!exported) {
          exported = true;
          const r = b2Stage.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          [".png", ".svg", ".html", ".json"].forEach((ext, i) => {
            const chip = document.createElement("div");
            chip.className = "exp-chip"; chip.textContent = "design" + ext;
            chip.style.left = "0"; chip.style.top = "0";
            document.body.appendChild(chip);
            const dx = (i - 1.5) * 96, dy = -70 - (i % 2) * 26;
            if (reduceMotion) { setTimeout(() => chip.remove(), 900); chip.style.transform = `translate(${cx + dx}px, ${cy + dy}px)`; return; }
            chip.animate([
              { transform: `translate(${cx - 30}px, ${cy}px) scale(.5)`, opacity: 0 },
              { transform: `translate(${cx - 30 + dx}px, ${cy + dy}px) scale(1)`, opacity: 1, offset: .55 },
              { transform: `translate(${cx - 30 + dx}px, ${cy + dy - 16}px) scale(1)`, opacity: 0 }
            ], { duration: 1250, delay: i * 90, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" })
              .finished.then(() => chip.remove()).catch(() => chip.remove());
          });
          flash(t("fExp"));
          narr.innerHTML = t("n4");
          pushLabel.textContent = t("pushOpen");
        } else {
          document.dispatchEvent(new CustomEvent("ui-generator:cta", { detail: { hook: "open-generator" } }));
        }
      };

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

      const toastEl = document.createElement("div");
      toastEl.id = "toast"; document.body.appendChild(toastEl);
      let toastTimer = null;
      FD_ON(document, "ui-generator:cta", () => {
        toastEl.textContent = "Design preview — on the live site this opens the real editor. The studio and kit are fully interactive.";
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
      });
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
          note: "<b>Layered vectors, fonts embedded.</b> Opens clean in Figma, Illustrator, or straight in the browser.", sheet: true },
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

      const notify = (m) => {
        toastEl.textContent = m; toastEl.classList.add("show");
        clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
      };
      /* ── i18n: en · zh · fr · es · it · ja ─────────────────────── */
      const L = {
en:{l1:"Design a",l2:"UI kit in",l3:"seconds!",eyebrow:"BROWSER-BASED GAME UI TOOL",
sub:'Tweak a real button right here — color, shape, shine — then push it into a whole production-ready kit. Every pixel comes from a <em class="hl hl-w">deterministic</em> engine, <em class="hl">not AI</em>, so what you make is <em class="hl hl-w">yours</em> to ship in any game or product you sell.',
open:"Open the generator →",signin:"Sign in",micro:"This button is live — go on, mess it up.",
t1:"Deterministic Engine",t1s:"One design language across every asset — consistency AI can\u2019t deliver.",t2:"Yours to Own",t2s:"Export, edit, and ship it in anything you sell.",t3:"Built for Creators",t3s:"Made for game devs, designers, and studios.",
n1:"<b>Step 1 · The Master.</b> Set the DNA — color, shape, shine, pattern. Everything that follows inherits it.",
n2:"<b>Step 2 · Your Kit.</b> One press built all of this — every piece inherits your master, states included.",
n3:"<b>Step 3 · The Board.</b> <b>Upload your own image</b> — any screen or concept — drag pieces onto it, dim the backdrop, and make as many boards as you need. Export or share each one.",
n4:"<b>Exported!</b> That’s the whole loop — master → kit → board → files. Now do it for real.",
cust:"CUSTOMIZE",pushKit:"PUSH TO A KIT",pushBoard:"PUSH TO A BOARD",pushExport:"EXPORT",pushOpen:"OPEN THE GENERATOR",
fKit:"KIT READY",fBoard:"BOARD READY",fExp:"EXPORTED",comp:"COMPONENTS",states:"STATES",ready:"READY TO DOWNLOAD",
lib:"LIBRARY",drag:"drag onto<br>the stage",color:"STYLE",round:"ROUNDNESS",shine:"SHINE",pattern:"PATTERN",label:"LABEL",rand:"RANDOMIZE",
live:"LIVE STUDIO",prev:"LIVE PREVIEW",yours:"YOUR DESIGN",up1:"⭱ yourworld.png — uploading…",up2:"✓ yourworld.png — background set",
upBtn:"⭱ UPLOAD YOUR IMAGE",dim:"DIM",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ SHARE",maxB:"Four boards in the demo — the app is unlimited.",
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
exn_svg:'<b>Layered vectors, fonts embedded.</b> Opens clean in Figma, Illustrator, or straight in the browser.',
exn_png:'<b>Crisp raster, transparent backgrounds.</b> Retina-ready for any engine, tool, or storefront.',
exn_html:'<b>Semantic HTML + CSS. Zero dependencies.</b> A real <code>&lt;button&gt;</code> with all four states — paste it into any web project.',
exn_copy:'<b>The exact vector, on your clipboard.</b> Paste into code, Figma, or a README.',
exn_settings:'<b>Your whole look as one file.</b> Every dial you touched — re-import it anywhere, hand it to a teammate, or version it in git.',
iterP:"And it never locks: pop back to the master, turn a dial, and the whole system re-flows — kit, boards, exports. Iterate toward what\u2019s best for the whole. (Also, it\u2019s just fun to keep playing.)",
fontL:"FONT",bgL:"BACKGROUND",extrL:"EXTRUSION",dsgnL:"DESIGN",resetL:"RESET",
pg:"Family filter is on out here — the full app takes it off.",
tcolL:"FONT COLOR",stDis:"DISABLED",licN:"License in one line: ship your kits in any product, commercial included — just don\u2019t resell or redistribute the assets themselves.",
fin1t:"BROWSER-BASED",fin1s:"No installs",fin2t:"DETERMINISTIC",fin2s:"Not AI",fin3t:"GAME-READY",fin3s:"Export anywhere",fin4t:"YOURS TO SHIP",fin4s:"Sell &amp; own",finFree:"Selected kits and limited PNG exports included free.",
auT1:"Welcome back",auT2:"Create your account",auIn:"SIGN IN",auUp:"CREATE ACCOUNT",auEmail:"EMAIL",auPass:"PASSWORD",auFgt:"Forgot password?",auGo1:"SIGN IN",auGo2:"CREATE ACCOUNT",auOr:"or",auMagic:"✉ EMAIL ME A SIGN-IN LINK",auFreeL:"Free Explorer — no card needed.",auTerms:"I agree to the Terms — and the license: ship anything, just don\u2019t resell the assets.",auHi:"PLAYER 1",auOkT:"Signed in",auOkP:"Opening your studio for",auDoneT:"Account created",auDoneP:"Welcome aboard — opening the editor for",auSentT2:"Check your inbox",auSentP2:"We sent a sign-in link to",auRstT:"Reset link sent",auRstP:"Password reset instructions are on their way to",auBackL:"Back",bgsL:"BACKDROPS"},
zh:{l1:"几秒钟，",l2:"做出一整套",l3:"游戏 UI！",eyebrow:"浏览器端游戏 UI 工具",
sub:'就在这里调一个真实按钮——颜色、形状、光泽——然后一键生成一整套可直接上线的组件库。每个像素都来自<em class="hl hl-w">确定性</em>引擎，<em class="hl">不是 AI</em>，你做出的一切都可以用在任何你发售的游戏或产品中。',
open:"打开生成器 →",signin:"登录",micro:"这个按钮是活的——来，随便玩。",
t1:"确定性引擎",t1s:"所有素材共享同一套设计语言——这是 AI 无法保证的一致性。",t2:"完全归你",t2s:"导出、编辑，用在任何你销售的产品里。",t3:"为创作者而生",t3s:"面向游戏开发者、设计师与工作室。",
n1:"<b>第 1 步 · 母版。</b>设定 DNA——颜色、形状、光泽、图案。之后的一切都会继承它。",
n2:"<b>第 2 步 · 你的组件库。</b>一次点击生成全部——每个组件都继承母版，包含所有状态。",
n3:"<b>第 3 步 · 画板。</b><b>上传你自己的图片</b>——任意画面或概念图——拖入组件、调暗背景，画板想建几块就建几块，每块都能导出或分享。",
n4:"<b>已导出！</b>完整流程走完了——母版 → 组件库 → 画板 → 文件。去正式版试试吧。",
cust:"自定义",pushKit:"生成组件库",pushBoard:"进入画板",pushExport:"导出",pushOpen:"打开生成器",
fKit:"组件库就绪",fBoard:"画板就绪",fExp:"已导出",comp:"个组件",states:"种状态",ready:"随时可下载",
lib:"素材库",drag:"拖到<br>舞台上",color:"风格",round:"圆角",shine:"光泽",pattern:"图案",label:"文字",rand:"随机",
live:"实时工作室",prev:"实时预览",yours:"你的设计",up1:"⭱ yourworld.png — 上传中…",up2:"✓ yourworld.png — 背景已设置",
upBtn:"⭱ 上传你的图片",dim:"调暗",boardW:"画板",addB:"+ 画板",pngB:"⭳ PNG",shareB:"⤴ 分享",maxB:"演示最多四块画板——正式版不限。",
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
exn_svg:'<b>分层矢量，内嵌字体。</b>在 Figma、Illustrator 或浏览器中都能干净打开。',
exn_png:'<b>清晰位图，透明背景。</b>Retina 级质量，适用于任何引擎、工具或商店。',
exn_html:'<b>语义化 HTML + CSS，零依赖。</b>一个真正的 <code>&lt;button&gt;</code>，带全部四种状态——粘进任何 Web 项目。',
exn_copy:'<b>精确的矢量，直接进剪贴板。</b>粘到代码、Figma 或 README 里。',
exn_settings:'<b>整套外观，一个文件。</b>你调过的每个参数——随处重新导入、交给队友或用 git 管理版本。',
iterP:"而且它永远不会锁死：随时回到母版，转一个旋钮，整个系统随之更新——组件库、画板、导出。朝着整体最优不断迭代。（而且，一直玩下去真的很有趣。）",
fontL:"字体",bgL:"背景",extrL:"立体挤出",dsgnL:"设计",resetL:"重置",
pg:"主页开启了文明用语过滤——正式版可关闭。",
tcolL:"文字颜色",stDis:"禁用",licN:"许可证一句话：可将组件用于任何产品（包括商业产品）——但不得转售或再分发素材本身。",
fin1t:"浏览器直达",fin1s:"无需安装",fin2t:"确定性引擎",fin2s:"不是 AI",fin3t:"游戏就绪",fin3s:"随处导出",fin4t:"归你所有",fin4s:"可售可发布",finFree:"精选组件库与有限 PNG 导出免费提供。",
auT1:"欢迎回来",auT2:"创建你的账户",auIn:"登录",auUp:"注册",auEmail:"邮箱",auPass:"密码",auFgt:"忘记密码？",auGo1:"登录",auGo2:"创建账户",auOr:"或",auMagic:"✉ 给我发送登录链接",auFreeL:"Free Explorer——无需绑卡。",auTerms:"我同意条款与许可证：可用于任何产品，但不得转售素材本身。",auHi:"玩家 1",auOkT:"已登录",auOkP:"正在为以下账号打开工作室：",auDoneT:"账户已创建",auDoneP:"欢迎加入——正在为以下账号打开编辑器：",auSentT2:"请查收邮箱",auSentP2:"登录链接已发送至",auRstT:"重置链接已发送",auRstP:"密码重置说明已发送至",auBackL:"返回",bgsL:"背景"},
fr:{l1:"Créez un",l2:"kit UI en",l3:"secondes !",eyebrow:"OUTIL D’UI DE JEU DANS LE NAVIGATEUR",
sub:'Réglez un vrai bouton ici — couleur, forme, brillance — puis transformez-le en kit complet, prêt pour la production. Chaque pixel vient d\u2019un moteur <em class="hl hl-w">déterministe</em>, <em class="hl">pas d\u2019IA</em> : ce que vous créez peut partir dans n\u2019importe quel jeu ou produit que vous vendez.',
open:"Ouvrir le générateur →",signin:"Connexion",micro:"Ce bouton est vivant — allez-y, amusez-vous.",
t1:"Moteur déterministe",t1s:"Un même langage de design sur chaque asset — une cohérence que l\u2019IA ne peut pas garantir.",t2:"Vraiment à vous",t2s:"Exportez, éditez, intégrez-le à tout ce que vous vendez.",t3:"Pensé pour les créateurs",t3s:"Pour devs de jeux, designers et studios.",
n1:"<b>Étape 1 · Le master.</b> Définissez l’ADN — couleur, forme, brillance, motif. Tout le reste en hérite.",
n2:"<b>Étape 2 · Votre kit.</b> Un clic a tout construit — chaque pièce hérite du master, états compris.",
n3:"<b>Étape 3 · Le board.</b> <b>Importez votre propre image</b> — écran ou concept — glissez vos pièces, tamisez le fond, créez autant de boards que voulu. Exportez ou partagez chacun.",
n4:"<b>Exporté !</b> La boucle est bouclée — master → kit → board → fichiers. À vous de jouer.",
cust:"PERSONNALISER",pushKit:"GÉNÉRER LE KIT",pushBoard:"VERS LE BOARD",pushExport:"EXPORTER",pushOpen:"OUVRIR LE GÉNÉRATEUR",
fKit:"KIT PRÊT",fBoard:"BOARD PRÊT",fExp:"EXPORTÉ",comp:"COMPOSANTS",states:"ÉTATS",ready:"PRÊTS À TÉLÉCHARGER",
lib:"BIBLIOTHÈQUE",drag:"glissez sur<br>la scène",color:"STYLE",round:"ARRONDI",shine:"BRILLANCE",pattern:"MOTIF",label:"TEXTE",rand:"ALÉATOIRE",
live:"STUDIO LIVE",prev:"APERÇU LIVE",yours:"VOTRE DESIGN",up1:"⭱ yourworld.png — envoi…",up2:"✓ yourworld.png — fond appliqué",
upBtn:"⭱ IMPORTEZ VOTRE IMAGE",dim:"FONDU",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ PARTAGER",maxB:"Quatre boards dans la démo — illimité dans l’app.",
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
exn_svg:'<b>Vecteurs en calques, polices intégrées.</b> S\u2019ouvre proprement dans Figma, Illustrator ou le navigateur.',
exn_png:'<b>Raster net, fonds transparents.</b> Qualité Retina pour tout moteur, outil ou boutique.',
exn_html:'<b>HTML + CSS sémantique. Zéro dépendance.</b> Un vrai <code>&lt;button&gt;</code> avec ses quatre états — à coller dans n\u2019importe quel projet web.',
exn_copy:'<b>Le vecteur exact, dans votre presse-papiers.</b> Collez-le dans du code, Figma ou un README.',
exn_settings:'<b>Tout votre look en un fichier.</b> Chaque réglage touché — réimportez-le partout, passez-le à un coéquipier ou versionnez-le dans git.',
iterP:"Et rien n\u2019est figé : revenez au master, tournez un réglage, et tout le système se met à jour — kit, boards, exports. Itérez vers ce qui sert le mieux l\u2019ensemble. (Et puis, continuer à jouer, c\u2019est un vrai plaisir.)",
fontL:"POLICE",bgL:"FOND",extrL:"EXTRUSION",dsgnL:"DESIGN",resetL:"RÉTABLIR",
pg:"Filtre familial sur la page d\u2019accueil — l\u2019app complète le désactive.",
tcolL:"COULEUR TEXTE",stDis:"DÉSACTIVÉ",licN:"La licence en une ligne : intégrez vos kits à tout produit, commercial compris — mais ne revendez pas et ne redistribuez pas les assets eux-mêmes.",
fin1t:"DANS LE NAVIGATEUR",fin1s:"Zéro installation",fin2t:"DÉTERMINISTE",fin2s:"Pas d\u2019IA",fin3t:"PRÊT POUR LE JEU",fin3s:"Export partout",fin4t:"À VOUS",fin4s:"Vendez et publiez",finFree:"Kits sélectionnés et exports PNG limités inclus gratuitement.",
auT1:"Bon retour",auT2:"Créez votre compte",auIn:"CONNEXION",auUp:"CRÉER UN COMPTE",auEmail:"E-MAIL",auPass:"MOT DE PASSE",auFgt:"Mot de passe oublié ?",auGo1:"SE CONNECTER",auGo2:"CRÉER LE COMPTE",auOr:"ou",auMagic:"✉ RECEVOIR UN LIEN DE CONNEXION",auFreeL:"Free Explorer — sans carte bancaire.",auTerms:"J\u2019accepte les Conditions — et la licence : publiez tout, ne revendez pas les assets.",auHi:"JOUEUR 1",auOkT:"Connecté",auOkP:"Ouverture de votre studio pour",auDoneT:"Compte créé",auDoneP:"Bienvenue — ouverture de l\u2019éditeur pour",auSentT2:"Vérifiez votre boîte mail",auSentP2:"Nous avons envoyé un lien de connexion à",auRstT:"Lien de réinitialisation envoyé",auRstP:"Les instructions de réinitialisation arrivent à",auBackL:"Retour",bgsL:"FONDS"},
es:{l1:"Crea un",l2:"kit de UI en",l3:"¡segundos!",eyebrow:"HERRAMIENTA DE UI DE JUEGOS EN EL NAVEGADOR",
sub:'Ajusta un botón real aquí mismo — color, forma, brillo — y conviértelo en un kit completo listo para producción. Cada píxel sale de un motor <em class="hl hl-w">determinista</em>, <em class="hl">no de IA</em>: lo que hagas puede ir en cualquier juego o producto que vendas.',
open:"Abrir el generador →",signin:"Iniciar sesión",micro:"Este botón está vivo — dale, juega con él.",
t1:"Motor determinista",t1s:"Un mismo lenguaje de diseño en cada asset — una consistencia que la IA no puede garantizar.",t2:"Tuyo de verdad",t2s:"Exporta, edita e intégralo en todo lo que vendas.",t3:"Para creadores",t3s:"Para devs de juegos, diseñadores y estudios.",
n1:"<b>Paso 1 · El master.</b> Define el ADN — color, forma, brillo, patrón. Todo lo demás lo hereda.",
n2:"<b>Paso 2 · Tu kit.</b> Un clic lo construyó todo — cada pieza hereda tu master, estados incluidos.",
n3:"<b>Paso 3 · El board.</b> <b>Sube tu propia imagen</b> — pantalla o concept — arrastra piezas, atenúa el fondo y crea todos los boards que quieras. Exporta o comparte cada uno.",
n4:"<b>¡Exportado!</b> El ciclo completo — master → kit → board → archivos. Ahora hazlo de verdad.",
cust:"PERSONALIZAR",pushKit:"CREAR EL KIT",pushBoard:"AL BOARD",pushExport:"EXPORTAR",pushOpen:"ABRIR EL GENERADOR",
fKit:"KIT LISTO",fBoard:"BOARD LISTO",fExp:"EXPORTADO",comp:"COMPONENTES",states:"ESTADOS",ready:"LISTOS PARA DESCARGAR",
lib:"BIBLIOTECA",drag:"arrastra al<br>escenario",color:"ESTILO",round:"REDONDEO",shine:"BRILLO",pattern:"PATRÓN",label:"TEXTO",rand:"ALEATORIO",
live:"ESTUDIO EN VIVO",prev:"VISTA EN VIVO",yours:"TU DISEÑO",up1:"⭱ yourworld.png — subiendo…",up2:"✓ yourworld.png — fondo listo",
upBtn:"⭱ SUBE TU IMAGEN",dim:"ATENUAR",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ COMPARTIR",maxB:"Cuatro boards en la demo — la app es ilimitada.",
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
exn_svg:'<b>Vectores por capas, fuentes incrustadas.</b> Se abre limpio en Figma, Illustrator o directamente en el navegador.',
exn_png:'<b>Raster nítido, fondos transparentes.</b> Calidad Retina para cualquier motor, herramienta o tienda.',
exn_html:'<b>HTML + CSS semántico. Cero dependencias.</b> Un <code>&lt;button&gt;</code> real con sus cuatro estados — pégalo en cualquier proyecto web.',
exn_copy:'<b>El vector exacto, en tu portapapeles.</b> Pégalo en código, Figma o un README.',
exn_settings:'<b>Todo tu look en un archivo.</b> Cada ajuste que tocaste — reimpórtalo donde sea, pásaselo a un compañero o versiónalo en git.',
iterP:"Y nunca se bloquea: vuelve al master, gira un control y todo el sistema se actualiza — kit, boards, exportaciones. Itera hacia lo mejor para el conjunto. (Además, seguir jugando es un gustazo.)",
fontL:"FUENTE",bgL:"FONDO",extrL:"EXTRUSIÓN",dsgnL:"DISEÑO",resetL:"REINICIAR",
pg:"Filtro familiar en la portada — la app completa lo desactiva.",
tcolL:"COLOR DE TEXTO",stDis:"DESACTIVADO",licN:"La licencia en una línea: usa tus kits en cualquier producto, comercial incluido — pero no revendas ni redistribuyas los assets en sí.",
fin1t:"EN EL NAVEGADOR",fin1s:"Sin instalaciones",fin2t:"DETERMINISTA",fin2s:"No es IA",fin3t:"LISTO PARA JUEGOS",fin3s:"Exporta donde sea",fin4t:"TUYO PARA PUBLICAR",fin4s:"Vende y lanza",finFree:"Kits seleccionados y exportaciones PNG limitadas incluidas gratis.",
auT1:"Bienvenido de nuevo",auT2:"Crea tu cuenta",auIn:"ENTRAR",auUp:"CREAR CUENTA",auEmail:"CORREO",auPass:"CONTRASEÑA",auFgt:"¿Olvidaste la contraseña?",auGo1:"ENTRAR",auGo2:"CREAR CUENTA",auOr:"o",auMagic:"✉ ENVIARME UN ENLACE DE ACCESO",auFreeL:"Free Explorer — sin tarjeta.",auTerms:"Acepto los Términos — y la licencia: publica lo que sea, pero no revendas los assets.",auHi:"JUGADOR 1",auOkT:"Sesión iniciada",auOkP:"Abriendo tu estudio para",auDoneT:"Cuenta creada",auDoneP:"Bienvenido — abriendo el editor para",auSentT2:"Revisa tu bandeja",auSentP2:"Enviamos un enlace de acceso a",auRstT:"Enlace de restablecimiento enviado",auRstP:"Las instrucciones van de camino a",auBackL:"Volver",bgsL:"FONDOS"},
it:{l1:"Crea un",l2:"kit UI in",l3:"secondi!",eyebrow:"STRUMENTO DI UI PER GIOCHI NEL BROWSER",
sub:'Regola un bottone vero proprio qui — colore, forma, lucentezza — poi trasformalo in un kit completo pronto per la produzione. Ogni pixel esce da un motore <em class="hl hl-w">deterministico</em>, <em class="hl">non da IA</em>: ciò che crei può finire in qualsiasi gioco o prodotto che vendi.',
open:"Apri il generatore →",signin:"Accedi",micro:"Questo bottone è vivo — dai, gioca pure.",
t1:"Motore deterministico",t1s:"Un unico linguaggio di design su ogni asset — una coerenza che l\u2019IA non può garantire.",t2:"Davvero tuo",t2s:"Esporta, modifica e usalo in tutto ciò che vendi.",t3:"Per i creator",t3s:"Per game dev, designer e studi.",
n1:"<b>Passo 1 · Il master.</b> Definisci il DNA — colore, forma, lucentezza, pattern. Tutto il resto lo eredita.",
n2:"<b>Passo 2 · Il tuo kit.</b> Un clic ha costruito tutto — ogni pezzo eredita il master, stati compresi.",
n3:"<b>Passo 3 · La board.</b> <b>Carica la tua immagine</b> — schermata o concept — trascina i pezzi, attenua lo sfondo e crea quante board vuoi. Esporta o condividi ognuna.",
n4:"<b>Esportato!</b> Il giro completo — master → kit → board → file. Ora fallo davvero.",
cust:"PERSONALIZZA",pushKit:"CREA IL KIT",pushBoard:"ALLA BOARD",pushExport:"ESPORTA",pushOpen:"APRI IL GENERATORE",
fKit:"KIT PRONTO",fBoard:"BOARD PRONTA",fExp:"ESPORTATO",comp:"COMPONENTI",states:"STATI",ready:"PRONTI DA SCARICARE",
lib:"LIBRERIA",drag:"trascina sul<br>palco",color:"STILE",round:"ARROTONDA",shine:"LUCE",pattern:"PATTERN",label:"TESTO",rand:"CASUALE",
live:"STUDIO LIVE",prev:"ANTEPRIMA LIVE",yours:"IL TUO DESIGN",up1:"⭱ yourworld.png — caricamento…",up2:"✓ yourworld.png — sfondo impostato",
upBtn:"⭱ CARICA LA TUA IMMAGINE",dim:"DIM",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ CONDIVIDI",maxB:"Quattro board nella demo — l’app è senza limiti.",
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
exn_svg:'<b>Vettori a livelli, font incorporati.</b> Si apre pulito in Figma, Illustrator o direttamente nel browser.',
exn_png:'<b>Raster nitido, sfondi trasparenti.</b> Qualità Retina per qualsiasi engine, strumento o store.',
exn_html:'<b>HTML + CSS semantico. Zero dipendenze.</b> Un vero <code>&lt;button&gt;</code> con tutti e quattro gli stati — incollalo in qualsiasi progetto web.',
exn_copy:'<b>Il vettore esatto, negli appunti.</b> Incollalo nel codice, in Figma o in un README.',
exn_settings:'<b>Tutto il tuo look in un file.</b> Ogni parametro che hai toccato — reimportalo ovunque, passalo a un collega o versionalo in git.',
iterP:"E non si blocca mai: torna al master, gira una manopola e l\u2019intero sistema si aggiorna — kit, board, export. Itera verso ciò che è meglio per l\u2019insieme. (E poi, continuare a giocare è divertente.)",
fontL:"FONT",bgL:"SFONDO",extrL:"ESTRUSIONE",dsgnL:"DESIGN",resetL:"RIPRISTINA",
pg:"Filtro famiglia sulla homepage — l\u2019app completa lo disattiva.",
tcolL:"COLORE TESTO",stDis:"DISATTIVATO",licN:"La licenza in una riga: usa i tuoi kit in qualsiasi prodotto, anche commerciale — ma non rivendere né ridistribuire gli asset in sé.",
fin1t:"NEL BROWSER",fin1s:"Niente installazioni",fin2t:"DETERMINISTICO",fin2s:"Non IA",fin3t:"PRONTO PER I GIOCHI",fin3s:"Esporta ovunque",fin4t:"TUO DA PUBBLICARE",fin4s:"Vendi e lancia",finFree:"Kit selezionati ed export PNG limitati inclusi gratis.",
auT1:"Bentornato",auT2:"Crea il tuo account",auIn:"ACCEDI",auUp:"CREA ACCOUNT",auEmail:"EMAIL",auPass:"PASSWORD",auFgt:"Password dimenticata?",auGo1:"ACCEDI",auGo2:"CREA ACCOUNT",auOr:"oppure",auMagic:"✉ INVIAMI UN LINK DI ACCESSO",auFreeL:"Free Explorer — nessuna carta richiesta.",auTerms:"Accetto i Termini — e la licenza: pubblica tutto, ma non rivendere gli asset.",auHi:"GIOCATORE 1",auOkT:"Accesso effettuato",auOkP:"Apertura del tuo studio per",auDoneT:"Account creato",auDoneP:"Benvenuto — apertura dell\u2019editor per",auSentT2:"Controlla la posta",auSentP2:"Abbiamo inviato un link di accesso a",auRstT:"Link di reset inviato",auRstP:"Le istruzioni di reset sono in arrivo a",auBackL:"Indietro",bgsL:"SFONDI"},
de:{l1:"Ein UI-Kit",l2:"in Sekunden",l3:"designen!",eyebrow:"GAME-UI-TOOL IM BROWSER",
sub:'Stell hier einen echten Button ein — Farbe, Form, Glanz — und mach daraus ein komplettes, produktionsreifes Kit. Jeder Pixel stammt aus einer <em class="hl hl-w">deterministischen</em> Engine, <em class="hl">nicht von KI</em> — was du baust, darf in jedes Spiel und Produkt, das du verkaufst.',
open:"Generator öffnen →",signin:"Anmelden",micro:"Dieser Button ist live — na los, spiel damit.",
t1:"Deterministische Engine",t1s:"Eine Designsprache über jedes Asset hinweg — Konsistenz, die KI nicht liefern kann.",t2:"Gehört dir",t2s:"Exportieren, bearbeiten, in allem verwenden, was du verkaufst.",t3:"Für Creator gebaut",t3s:"Für Game-Devs, Designer und Studios.",
n1:"<b>Schritt 1 · Der Master.</b> Leg die DNA fest — Farbe, Form, Glanz, Muster. Alles Weitere erbt sie.",
n2:"<b>Schritt 2 · Dein Kit.</b> Ein Klick hat all das gebaut — jedes Teil erbt deinen Master, Zustände inklusive.",
n3:"<b>Schritt 3 · Das Board.</b> <b>Lade dein eigenes Bild hoch</b> — Screenshot oder Konzept — zieh Teile darauf, dimme den Hintergrund und leg so viele Boards an, wie du brauchst. Jedes lässt sich exportieren oder teilen.",
n4:"<b>Exportiert!</b> Das war der ganze Loop — Master → Kit → Board → Dateien. Jetzt mach es richtig.",
cust:"ANPASSEN",pushKit:"ZUM KIT MACHEN",pushBoard:"AUFS BOARD",pushExport:"EXPORTIEREN",pushOpen:"GENERATOR ÖFFNEN",
fKit:"KIT BEREIT",fBoard:"BOARD BEREIT",fExp:"EXPORTIERT",comp:"KOMPONENTEN",states:"ZUSTÄNDE",ready:"BEREIT ZUM DOWNLOAD",
lib:"BIBLIOTHEK",drag:"auf die Bühne<br>ziehen",color:"STIL",round:"RUNDUNG",shine:"GLANZ",pattern:"MUSTER",label:"TEXT",rand:"ZUFALL",
live:"LIVE-STUDIO",prev:"LIVE-VORSCHAU",yours:"DEIN DESIGN",up1:"⭱ yourworld.png — wird hochgeladen…",up2:"✓ yourworld.png — Hintergrund gesetzt",
upBtn:"⭱ EIGENES BILD HOCHLADEN",dim:"DIMMEN",boardW:"BOARD",addB:"+ BOARD",pngB:"⭳ PNG",shareB:"⤴ TEILEN",maxB:"Vier Boards in der Demo — die App ist unbegrenzt.",
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
exn_svg:'<b>Ebenen-Vektoren, Schriften eingebettet.</b> Öffnet sauber in Figma, Illustrator oder direkt im Browser.',
exn_png:'<b>Scharfes Raster, transparente Hintergründe.</b> Retina-fertig für jede Engine, jedes Tool, jeden Store.',
exn_html:'<b>Semantisches HTML + CSS. Null Abhängigkeiten.</b> Ein echter <code>&lt;button&gt;</code> mit allen vier Zuständen — in jedes Web-Projekt einfügbar.',
exn_copy:'<b>Der exakte Vektor, in deiner Zwischenablage.</b> Füge ihn in Code, Figma oder ein README ein.',
exn_settings:'<b>Dein ganzer Look als eine Datei.</b> Jeder Regler, den du berührt hast — überall re-importieren, ans Team geben oder in git versionieren.',
iterP:"Und nichts ist festgeschrieben: zurück zum Master, einen Regler drehen, und das ganze System zieht nach — Kit, Boards, Exporte. Iteriere auf das hin, was dem Ganzen guttut. (Außerdem macht Weiterspielen einfach Spaß.)",
fontL:"SCHRIFT",bgL:"HINTERGRUND",extrL:"EXTRUSION",dsgnL:"DESIGN",resetL:"ZURÜCKSETZEN",
pg:"Jugendfreier Filter auf der Startseite — die Vollversion schaltet ihn ab.",
tcolL:"SCHRIFTFARBE",stDis:"DEAKTIVIERT",licN:"Die Lizenz in einem Satz: Nutze deine Kits in jedem Produkt, auch kommerziell — aber verkaufe oder verteile die Assets selbst nicht weiter.",
fin1t:"IM BROWSER",fin1s:"Keine Installation",fin2t:"DETERMINISTISCH",fin2s:"Keine KI",fin3t:"GAME-READY",fin3s:"Überallhin exportieren",fin4t:"DEINS ZUM SHIPPEN",fin4s:"Verkaufen &amp; veröffentlichen",finFree:"Ausgewählte Kits und begrenzte PNG-Exporte kostenlos enthalten.",
auT1:"Willkommen zurück",auT2:"Konto erstellen",auIn:"ANMELDEN",auUp:"KONTO ERSTELLEN",auEmail:"E-MAIL",auPass:"PASSWORT",auFgt:"Passwort vergessen?",auGo1:"ANMELDEN",auGo2:"KONTO ERSTELLEN",auOr:"oder",auMagic:"✉ ANMELDELINK PER E-MAIL",auFreeL:"Free Explorer — keine Karte nötig.",auTerms:"Ich akzeptiere die AGB — und die Lizenz: shippe alles, verkaufe die Assets nur nicht weiter.",auHi:"SPIELER 1",auOkT:"Angemeldet",auOkP:"Dein Studio öffnet sich für",auDoneT:"Konto erstellt",auDoneP:"Willkommen an Bord — der Editor öffnet sich für",auSentT2:"Prüfe dein Postfach",auSentP2:"Wir haben einen Anmeldelink geschickt an",auRstT:"Reset-Link verschickt",auRstP:"Die Anleitung zum Zurücksetzen ist unterwegs an",auBackL:"Zurück",bgsL:"HINTERGRÜNDE"},
ja:{l1:"数秒で",l2:"ゲームUIキットを",l3:"デザイン！",eyebrow:"ブラウザで動くゲームUIツール",
sub:'ここで本物のボタンを調整——色、形、光沢——そのまま本番投入できるキット一式に展開。すべてのピクセルは<em class="hl hl-w">決定論的</em>エンジンから生まれ、<em class="hl">AIではありません</em>。作ったものは、あなたが販売するどんなゲームや製品にも使えます。',
open:"ジェネレーターを開く →",signin:"ログイン",micro:"このボタンは本物 — 触ってみて。",
t1:"決定論的エンジン",t1s:"すべての素材にひとつのデザイン言語——AIには約束できない一貫性。",t2:"完全にあなたのもの",t2s:"書き出して、編集して、販売するあらゆる製品に。",t3:"クリエイターのために",t3s:"ゲーム開発者・デザイナー・スタジオ向け。",
n1:"<b>ステップ1 · マスター。</b>DNAを設定 — 色・形・ツヤ・パターン。以降すべてがこれを継承します。",
n2:"<b>ステップ2 · あなたのキット。</b>ワンクリックで全部完成 — 各パーツがマスターを継承、ステートも込み。",
n3:"<b>ステップ3 · ボード。</b><b>自分の画像をアップロード</b> — 画面でもコンセプトでも — パーツをドラッグし、背景を調光。ボードは何枚でも作れて、それぞれ書き出し・共有できます。",
n4:"<b>書き出し完了！</b>これで一巡 — マスター → キット → ボード → ファイル。次は本番でどうぞ。",
cust:"カスタマイズ",pushKit:"キットを生成",pushBoard:"ボードへ",pushExport:"書き出す",pushOpen:"ジェネレーターを開く",
fKit:"キット完成",fBoard:"ボード完成",fExp:"書き出し済み",comp:"コンポーネント",states:"ステート",ready:"すぐダウンロード可能",
lib:"ライブラリ",drag:"ステージへ<br>ドラッグ",color:"スタイル",round:"丸み",shine:"ツヤ",pattern:"パターン",label:"ラベル",rand:"ランダム",
live:"ライブスタジオ",prev:"ライブプレビュー",yours:"あなたのデザイン",up1:"⭱ yourworld.png — アップロード中…",up2:"✓ yourworld.png — 背景を設定",
upBtn:"⭱ 画像をアップロード",dim:"調光",boardW:"ボード",addB:"+ ボード",pngB:"⭳ PNG",shareB:"⤴ 共有",maxB:"デモでは4枚まで — アプリは無制限。",
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
exn_svg:'<b>レイヤーベクター、フォント埋め込み。</b>Figma、Illustrator、ブラウザでそのままきれいに開けます。',
exn_png:'<b>くっきりラスター、透過背景。</b>あらゆるエンジン・ツール・ストアにRetina対応。',
exn_html:'<b>セマンティックHTML + CSS。依存ゼロ。</b>4ステート揃った本物の<code>&lt;button&gt;</code>——どのWebプロジェクトにも貼り付け可能。',
exn_copy:'<b>正確なベクターをクリップボードへ。</b>コード、Figma、READMEに貼り付け。',
exn_settings:'<b>あなたのルック全体を1ファイルに。</b>触ったダイヤルすべて——どこでも再インポート、チームメイトに渡す、gitで管理。',
iterP:"しかも固定されません：マスターに戻ってダイヤルを回せば、システム全体が再構成——キット、ボード、書き出しまで。全体にとって最良の形へ反復していけます。（それに、いじり続けるのは純粋に楽しい。）",
fontL:"フォント",bgL:"背景",extrL:"押し出し",dsgnL:"デザイン",resetL:"リセット",
pg:"ホームではワードフィルターが有効です——製品版では解除できます。",
tcolL:"文字色",stDis:"無効",licN:"ライセンスを一行で：キットはどんな製品にも（商用含め）使えます——ただし素材そのものの転売・再配布は不可。",
fin1t:"ブラウザベース",fin1s:"インストール不要",fin2t:"決定論的",fin2s:"AIではない",fin3t:"ゲームレディ",fin3s:"どこへでも書き出し",fin4t:"あなたのもの",fin4s:"販売も公開も",finFree:"選定キットと限定PNG書き出しは無料。",
auT1:"おかえりなさい",auT2:"アカウントを作成",auIn:"サインイン",auUp:"アカウント作成",auEmail:"メール",auPass:"パスワード",auFgt:"パスワードをお忘れですか？",auGo1:"サインイン",auGo2:"アカウントを作成",auOr:"または",auMagic:"✉ サインインリンクを送る",auFreeL:"Free Explorer——カード不要。",auTerms:"利用規約とライセンスに同意します：どんな製品にも使えますが、素材の転売は不可。",auHi:"プレイヤー1",auOkT:"サインインしました",auOkP:"スタジオを開いています：",auDoneT:"アカウントを作成しました",auDoneP:"ようこそ——エディタを開いています：",auSentT2:"受信トレイをご確認ください",auSentP2:"サインインリンクを送信しました：",auRstT:"リセットリンクを送信しました",auRstP:"パスワード再設定の案内を送信しました：",auBackL:"戻る",bgsL:"背景"}
      };
      let lang = "en";
      try { lang = localStorage.getItem("ui-generator-lang") || "en"; } catch (_) {}
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
         ["auConsentTxt", "auTerms"], ["auBackTxt", "auBackL"]].forEach(([id, k]) => {
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
        [["fontCap", "fontL"], ["tcolCap", "tcolL"], ["extrCap", "extrL"], ["dsgnCap", "dsgnL"], ["ownLic", "licN"], ["footLic", "licN"]].forEach(([id, k]) => {
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
      document.getElementById("langSel").addEventListener("change", (e) => setLang(e.target.value));

      applyReelEntry(REEL[0]);
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
