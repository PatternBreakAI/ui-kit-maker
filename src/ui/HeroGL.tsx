import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useGen } from "@/generator/store";
import { renderKit } from "@/generator/bevel";
import { STOCK_ICONS, applyKitTextFill, hexMix } from "@/generator/model";
import type { GenConfig } from "@/generator/model";

/* ── HeroGL — the exploded material diagram, live in WebGL ──────────────
   The stack IS the color map: every plate is named for the role that
   paints it (Highlight / Bevel / Inner Fill / Pattern / Type / Glow /
   Shadow) and tinted with exactly that role's current hex. Plates are
   toon-shaded with crisp rims; Glow and Shadow render as soft light, not
   slabs; the Pattern plane carries the real face pattern; satellites are
   rasterized from the SVG renderer and billboarded so they never skew.
   Everything reskins live from the config. Auto-animates, leans firmly
   into the pointer; prefers-reduced-motion renders a still frame. */

const LAYERS = [
  { key: "highlight", t: "Highlight", sub: "gloss & specular", y: 1.45 },
  { key: "bevel", t: "Bevel", sub: "shell & wall", y: 0.87 },
  { key: "pattern", t: "Pattern", sub: "face texture", y: 0.29 },
  { key: "fill", t: "Inner Fill", sub: "candy face", y: -0.29 },
  { key: "glow", t: "Glow", sub: "inner glow", y: -0.87 },
  { key: "shadow", t: "Shadow", sub: "grounding", y: -1.45 },
] as const;

const SATS = [
  { t: "ICON TOKEN", s1: "Extrude", s2: "Pad perfect", y: 1.75, h: 1.95 },
  { t: "PROGRESS BAR", s1: "72% · Fill", s2: "Live value", y: 0.1, h: 1.15 },
  { t: "PANEL / CARD", s1: "9-slice · Extrude", s2: "Tokenized material", y: -1.7, h: 2.1 },
] as const;

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Trim most of a render's glow reserve so the art fills its texture. */
function cropPad(svg: string, keep = 0.4): string {
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!vb) return svg;
  const pad = Math.max(0, -+vb[1]);
  if (pad < 4) return svg;
  const cut = pad * (1 - keep);
  const nw = +vb[3] - cut * 2, nh = +vb[4] - cut * 2;
  return svg
    .replace(vb[0], `viewBox="${(+vb[1] + cut).toFixed(1)} ${(+vb[2] + cut).toFixed(1)} ${nw.toFixed(1)} ${nh.toFixed(1)}"`)
    .replace(/width="([\d.]+)"/, `width="${nw.toFixed(1)}"`)
    .replace(/height="([\d.]+)"/, `height="${nh.toFixed(1)}"`);
}

/** Rasterize an SVG string into a THREE texture (async — image decode). */
function svgTex(svg: string, cb: (tex: THREE.Texture, w: number, h: number) => void) {
  const w = +(/width="([\d.]+)"/.exec(svg)?.[1] ?? 300);
  const h = +(/height="([\d.]+)"/.exec(svg)?.[1] ?? 150);
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * 2); cv.height = Math.round(h * 2);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    cb(tex, w, h);
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** The real face pattern, tiled inside a rounded plate silhouette. */
function patternSvg(c: GenConfig): string {
  const P0 = c.candy.pattern;
  const type = P0.type === "none" ? "stripes" : P0.type;
  const col = P0.color ?? hexMix(c.effects.Bevel ?? "#0E9CC9", "#04060B", 0.35);
  const op = Math.max(0.3, Math.min(1, (P0.opacity ?? 30) / 100 + 0.2));
  const ps = Math.max(14, 30 * ((P0.scale ?? 100) / 100));
  const star = `M${ps * 0.25} ${ps * 0.08} L${ps * 0.31} ${ps * 0.19} L${ps * 0.42} ${ps * 0.25} L${ps * 0.31} ${ps * 0.31} L${ps * 0.25} ${ps * 0.42} L${ps * 0.19} ${ps * 0.31} L${ps * 0.08} ${ps * 0.25} L${ps * 0.19} ${ps * 0.19} Z`;
  const cell = type === "dots" || type === "halftone"
    ? `<circle cx="${(ps / 2).toFixed(1)}" cy="${(ps / 2).toFixed(1)}" r="${(ps / 5).toFixed(1)}" fill="${col}"/>`
    : type === "checker"
      ? `<rect width="${(ps / 2).toFixed(1)}" height="${(ps / 2).toFixed(1)}" fill="${col}"/><rect x="${(ps / 2).toFixed(1)}" y="${(ps / 2).toFixed(1)}" width="${(ps / 2).toFixed(1)}" height="${(ps / 2).toFixed(1)}" fill="${col}"/>`
      : type === "stars"
        ? `<path d="${star}" fill="${col}"/>`
        : `<rect width="${(ps / 2).toFixed(1)}" height="${ps.toFixed(1)}" fill="${col}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="440"><defs><pattern id="p" width="${ps.toFixed(1)}" height="${ps.toFixed(1)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${P0.angle ?? 45})">${cell}</pattern></defs><rect x="6" y="6" width="908" height="428" rx="104" fill="url(#p)" opacity="${op.toFixed(2)}" stroke="${col}" stroke-opacity="0.4" stroke-width="2.5"/></svg>`;
}

/** Soft light blob — a heavily blurred rounded slab, for Glow and Shadow. */
function blobTex(color: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 288;
  const ctx = cv.getContext("2d")!;
  ctx.filter = "blur(36px)";
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(104, 88, 304, 112, 56);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  layerMeshes: THREE.Mesh[];
  glowMat: THREE.MeshBasicMaterial;
  shadowMat: THREE.MeshBasicMaterial;
  patternMat: THREE.MeshBasicMaterial;
  satGroup: THREE.Group;
  sats: THREE.Mesh[];
  keyLight: THREE.DirectionalLight;
  still: boolean;
  renderOnce: () => void;
  alignSats: () => void;
  disposables: { dispose(): void }[];
}

// The schematic's resting viewing angle (radians). It loads here and holds
// still — the reference exploded-diagram view — until the user drags it.
const BASE_YAW = 0.48;    // horizontal rotation (y) — a touch more face-on
const BASE_PITCH = 0.035; // vertical tilt (x) — flatter, matches the reference

export function HeroGL() {
  const { cfg } = useGen();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const satLabelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rig = useRef<Rig | null>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const [failed, setFailed] = useState(false);

  /* mount: build the whole scene once */
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current, overlay = svgRef.current;
    if (!wrap || !canvas || !overlay) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 2, 0.1, 100);
    camera.position.set(0, 4.0, 12.2);
    camera.lookAt(0, -0.15, 0);

    // toon lighting — a firm key over a soft floor gives the cel bands
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(2, 6, 5);
    scene.add(keyLight);

    const group = new THREE.Group();
    group.position.set(-1.12, 0.05, 0);
    group.rotation.set(BASE_PITCH, BASE_YAW, 0);
    scene.add(group);

    const disposables: { dispose(): void }[] = [];

    // stepped ramp for the toon shading — four hard bands
    const gradTex = new THREE.DataTexture(new Uint8Array([95, 160, 215, 255]), 4, 1, THREE.RedFormat);
    gradTex.minFilter = THREE.NearestFilter;
    gradTex.magFilter = THREE.NearestFilter;
    gradTex.needsUpdate = true;
    disposables.push(gradTex);

    const plateGeo = new THREE.ExtrudeGeometry(roundedRectShape(4.6, 2.2, 0.55), {
      depth: 0.13, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 24,
    });
    plateGeo.rotateX(-Math.PI / 2);
    disposables.push(plateGeo);
    const edgeGeo = new THREE.EdgesGeometry(plateGeo, 32);
    disposables.push(edgeGeo);
    const flatGeo = new THREE.PlaneGeometry(4.6, 2.2);
    flatGeo.rotateX(-Math.PI / 2);
    disposables.push(flatGeo);
    const blobGeo = new THREE.PlaneGeometry(6.4, 3.4);
    blobGeo.rotateX(-Math.PI / 2);
    disposables.push(blobGeo);

    const toon = (opacity: number) => {
      const m = new THREE.MeshToonMaterial({ color: "#0E9CC9", gradientMap: gradTex, transparent: true, opacity, side: THREE.DoubleSide });
      disposables.push(m);
      return m;
    };

    const layerMeshes: THREE.Mesh[] = [];
    let glowMat: THREE.MeshBasicMaterial = null!;
    let shadowMat: THREE.MeshBasicMaterial = null!;
    let patternMat: THREE.MeshBasicMaterial = null!;
    for (const L of LAYERS) {
      let mesh: THREE.Mesh;
      if (L.key === "glow") {
        glowMat = new THREE.MeshBasicMaterial({ map: blobTex("#8FF0FF"), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
        disposables.push(glowMat);
        mesh = new THREE.Mesh(blobGeo, glowMat);
      } else if (L.key === "shadow") {
        shadowMat = new THREE.MeshBasicMaterial({ map: blobTex("#05070d"), transparent: true, opacity: 0.9, depthWrite: false });
        disposables.push(shadowMat);
        mesh = new THREE.Mesh(blobGeo, shadowMat);
      } else if (L.key === "pattern") {
        patternMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
        disposables.push(patternMat);
        mesh = new THREE.Mesh(flatGeo, patternMat);
      } else {
        const opacity = L.key === "highlight" ? 0.34 : L.key === "bevel" ? 0.62 : L.key === "fill" ? 0.9 : 0.6;
        mesh = new THREE.Mesh(plateGeo, toon(opacity));
        const lm = new THREE.LineBasicMaterial({ color: "#7ADCFF", transparent: true, opacity: 0.65 });
        disposables.push(lm);
        mesh.add(new THREE.LineSegments(edgeGeo, lm));
        mesh.userData.rim = lm;
      }
      mesh.position.y = L.y;
      mesh.userData.baseY = L.y;
      mesh.userData.key = L.key;
      group.add(mesh);
      layerMeshes.push(mesh);
    }

    // satellite components — textured from the real SVG renderer, billboarded
    const satGroup = new THREE.Group();
    satGroup.position.set(3.05, 0, 0.4);
    scene.add(satGroup);
    const sats: THREE.Mesh[] = [];
    for (const S of SATS) {
      const g = new THREE.PlaneGeometry(1, 1);
      const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      disposables.push(g, m);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(0, S.y, 0);
      mesh.userData.baseY = S.y;
      mesh.userData.h = S.h;
      satGroup.add(mesh);
      sats.push(mesh);
    }

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    rig.current = {
      renderer, scene, camera, group, layerMeshes, glowMat, shadowMat, patternMat,
      satGroup, sats, keyLight, still, renderOnce: () => {}, alignSats: () => {}, disposables,
    };
    wrap.dataset.gl = "on";

    /* overlay furniture — leaders, dots, dimension rails, orbit ellipse */
    const NS = "http://www.w3.org/2000/svg";
    const mk = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      overlay.appendChild(el);
      return el;
    };
    const orbit = mk("ellipse", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "3 7", opacity: "0.28" });
    const leaders = LAYERS.map(() => mk("line", { stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 5", opacity: "0.55" }));
    const dots = LAYERS.map(() => mk("circle", { r: "3", fill: "currentColor", opacity: "0.8" }));
    const satLeaders = SATS.map(() => mk("line", { stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 5", opacity: "0.55" }));
    const satDots = SATS.map(() => mk("circle", { r: "3", fill: "currentColor", opacity: "0.8" }));
    const railTop = mk("line", { stroke: "currentColor", "stroke-width": "1", opacity: "0.5" });
    const railBot = mk("line", { stroke: "currentColor", "stroke-width": "1", opacity: "0.5" });
    const railTicks = [0, 1, 2, 3].map(() => mk("line", { stroke: "currentColor", "stroke-width": "1", opacity: "0.5" }));
    const railTopText = mk("text", { fill: "currentColor", "font-size": "12", "letter-spacing": "0.08em", "text-anchor": "middle", opacity: "0.75" });
    railTopText.textContent = "128.0";
    const railBotText = mk("text", { fill: "currentColor", "font-size": "12", "letter-spacing": "0.08em", "text-anchor": "middle", opacity: "0.75" });
    railBotText.textContent = "96.0";

    let W = 10, H = 10;
    const fit = () => {
      W = wrap.clientWidth; H = wrap.clientHeight;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      overlay.setAttribute("viewBox", `0 0 ${W} ${H}`);
    };
    fit();
    // below this width the right-side satellites (icon token / progress / panel)
    // clip against the edge — hide them so the diagram stays clean
    const SAT_MIN_W = 760;
    const updateSats = () => {
      const show = wrap.clientWidth >= SAT_MIN_W;
      satGroup.visible = show;
      satLabelRefs.current.forEach((lab) => { if (lab) lab.style.display = show ? "" : "none"; });
    };
    const ro = new ResizeObserver(() => { fit(); alignSats(); updateSats(); });
    ro.observe(wrap);
    updateSats();

    const v = new THREE.Vector3();
    const proj = (local: THREE.Vector3, host: THREE.Object3D) => {
      v.copy(local);
      host.localToWorld(v);
      v.project(camera);
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
    };
    const setLine = (el: SVGElement, x1: number, y1: number, x2: number, y2: number) => {
      el.setAttribute("x1", x1.toFixed(1)); el.setAttribute("y1", y1.toFixed(1));
      el.setAttribute("x2", x2.toFixed(1)); el.setAttribute("y2", y2.toFixed(1));
    };

    const alignSats = () => {
      scene.updateMatrixWorld(true);
      const pm = proj(v.set(sats[1].position.x, sats[1].position.y, 0), satGroup);
      for (const m2 of [sats[0], sats[2]]) {
        for (let it = 0; it < 2; it++) {
          const p0 = proj(v.set(m2.position.x, m2.position.y, 0), satGroup);
          const p1 = proj(v.set(m2.position.x + 0.1, m2.position.y, 0), satGroup);
          const perPx = 0.1 / Math.max(0.0001, p1.x - p0.x);
          m2.position.x += (pm.x - p0.x) * perPx;
        }
      }
      // deterministic packing: measure each art's projected height, stack
      // them with one even label gap, shrink if the column outgrows the
      // stage, and center the result — no cut-offs, no dead air
      const LABEL_PX = 56, M = 14;
      const perPyOf = (m2: THREE.Mesh) => {
        const p0 = proj(v.set(m2.position.x, m2.userData.baseY, 0), satGroup);
        const p1 = proj(v.set(m2.position.x, m2.userData.baseY - 0.1, 0), satGroup);
        return 0.1 / Math.max(0.0001, p1.y - p0.y);
      };
      const artH = (m2: THREE.Mesh) => {
        const top = proj(v.set(m2.position.x, m2.userData.baseY + (m2.scale.y || 1) / 2, 0), satGroup).y;
        const bot = proj(v.set(m2.position.x, m2.userData.baseY - (m2.scale.y || 1) / 2, 0), satGroup).y;
        return Math.max(12, bot - top);
      };
      // idempotent: always start from each satellite's natural size, then
      // shrink the ART portion alone until art + fixed label blocks fit
      for (const m2 of sats) {
        if (m2.userData.natH) m2.scale.set(m2.userData.natW, m2.userData.natH, 1);
      }
      scene.updateMatrixWorld(true);
      let hs = sats.map(artH);
      const FIXED = (LABEL_PX + M) * 3 - M;
      const artSum = () => hs.reduce((a, b3) => a + b3, 0);
      const need = () => artSum() + FIXED;
      const room = H - 40;
      if (need() > room) {
        const f = Math.max(0.45, (room - FIXED) / Math.max(1, artSum()));
        for (const m2 of sats) m2.scale.set(m2.scale.x * f, m2.scale.y * f, 1);
        scene.updateMatrixWorld(true);
        hs = sats.map(artH);
      }
      let cursor = Math.max(20, (H - Math.min(need(), room)) / 2);
      const colTop = cursor;
      sats.forEach((m2, i2) => {
        const topNow = proj(v.set(m2.position.x, m2.userData.baseY + (m2.scale.y || 1) / 2, 0), satGroup).y;
        m2.userData.baseY -= (cursor - topNow) * perPyOf(m2);
        m2.position.y = m2.userData.baseY;
        scene.updateMatrixWorld(true);
        cursor += hs[i2] + LABEL_PX + M;
      });
      // packing result, readable from the DOM for verification
      wrap.dataset.satfit = `${Math.round(colTop)}:${Math.round(cursor - M)}:${Math.round(H)}`;
    };

    const projectAll = () => {
      const placed: number[] = [];
      LAYERS.forEach((_L, i) => {
        const p = proj(v.set(-2.5, layerMeshes[i].position.y, 0.2), group);
        const lab = labelRefs.current[i];
        const lx = 2;
        // crowded anchors fade out — at extreme angles the stack compresses
        // and only the labels that still have room stay readable
        const minD = placed.length ? Math.min(...placed.map((py) => Math.abs(p.y - py))) : 99;
        const op = Math.max(0, Math.min(1, (minD - 14) / 18));
        if (op > 0.05) placed.push(p.y);
        if (lab) {
          lab.style.transform = `translate(${lx}px, ${(p.y - 15).toFixed(1)}px)`;
          lab.style.opacity = op.toFixed(2);
        }
        dots[i].setAttribute("cx", p.x.toFixed(1)); dots[i].setAttribute("cy", p.y.toFixed(1));
        dots[i].setAttribute("opacity", (0.8 * op).toFixed(2));
        leaders[i].setAttribute("opacity", (0.55 * op).toFixed(2));
        setLine(leaders[i], lx + 136, p.y, p.x - 8, p.y);
      });
      SATS.forEach((_S, i) => {
        const mesh = sats[i];
        const halfH = (mesh.scale.y || 1) / 2;
        const c2 = proj(v.set(mesh.position.x, mesh.position.y, 0), satGroup);
        const b2 = proj(v.set(mesh.position.x, mesh.position.y - halfH * 0.92, 0), satGroup);
        const lab = satLabelRefs.current[i];
        if (lab) { lab.style.transform = `translate(${(c2.x - 100).toFixed(1)}px, ${(b2.y + 12).toFixed(1)}px)`; }
        satDots[i].setAttribute("cx", c2.x.toFixed(1)); satDots[i].setAttribute("cy", (b2.y + 5).toFixed(1));
        setLine(satLeaders[i], c2.x, b2.y - 4, c2.x, b2.y + 3);
      });
      const t1 = proj(v.set(-2.3, 2.3, 0), group), t2 = proj(v.set(2.3, 2.3, 0), group);
      const b1 = proj(v.set(-2.3, -2.35, 0), group), b2 = proj(v.set(2.3, -2.35, 0), group);
      setLine(railTop, t1.x, t1.y, t2.x, t2.y);
      setLine(railBot, b1.x, b1.y, b2.x, b2.y);
      setLine(railTicks[0], t1.x, t1.y - 5, t1.x, t1.y + 5);
      setLine(railTicks[1], t2.x, t2.y - 5, t2.x, t2.y + 5);
      setLine(railTicks[2], b1.x, b1.y - 5, b1.x, b1.y + 5);
      setLine(railTicks[3], b2.x, b2.y - 5, b2.x, b2.y + 5);
      railTopText.setAttribute("x", ((t1.x + t2.x) / 2).toFixed(1));
      railTopText.setAttribute("y", (Math.min(t1.y, t2.y) - 8).toFixed(1));
      railBotText.setAttribute("x", ((b1.x + b2.x) / 2).toFixed(1));
      railBotText.setAttribute("y", (Math.max(b1.y, b2.y) + 18).toFixed(1));
      const c = proj(v.set(0, 0, 0), group);
      orbit.setAttribute("cx", c.x.toFixed(1)); orbit.setAttribute("cy", c.y.toFixed(1));
      orbit.setAttribute("rx", (H * 0.62).toFixed(0)); orbit.setAttribute("ry", (H * 0.44).toFixed(0));
    };

    /* grab the model and turn it — direct manipulation with a little
       inertia after release; the idle sway keeps breathing underneath */
    let dragging = false, lastX = 0, lastY = 0, velX = 0, velY = 0;
    let userYaw = 0, userPitch = 0;
    const clampP = (p2: number) => Math.max(-0.55, Math.min(0.7, p2));
    // the last angle you drag the schematic to persists as its default
    const ANGLE_KEY = "ui-generator-schematic-angle";
    let savedSig = "";
    try {
      const a = JSON.parse(localStorage.getItem(ANGLE_KEY) || "null");
      if (a && typeof a.yaw === "number" && typeof a.pitch === "number") {
        userYaw = a.yaw; userPitch = clampP(a.pitch);
        savedSig = userYaw.toFixed(3) + "," + userPitch.toFixed(3);
      }
    } catch { /* ignore */ }
    const onDown = (e: PointerEvent) => {
      /* claim the gesture outright: without this the browser ALSO runs a
         text-selection drag under the spin, and selection auto-scrolls the
         page (owner: "it scrolls the page up and down along with it") */
      e.preventDefault();
      dragging = true; lastX = e.clientX; lastY = e.clientY; velX = 0; velY = 0;
      wrap.classList.add("kp-gldrag");
      wrap.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      userYaw += dx * 0.0062;
      userPitch = clampP(userPitch + dy * 0.005);
      velX = dx * 0.0062; velY = dy * 0.005;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      wrap.classList.remove("kp-gldrag");
      wrap.releasePointerCapture?.(e.pointerId);
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);

    const billboard = () => { for (const m2 of sats) m2.quaternion.copy(camera.quaternion); };

    let raf = 0, t = 0;
    const frame = () => {
      t += 1 / 60;
      if (!dragging) {
        // inertia — the spin you threw keeps carrying, then settles
        userYaw += velX;
        userPitch = clampP(userPitch + velY);
        velX *= 0.94; velY *= 0.94;
        // once it settles, remember this angle as the new default
        if (Math.abs(velX) < 0.0002 && Math.abs(velY) < 0.0002) {
          const sig = userYaw.toFixed(3) + "," + userPitch.toFixed(3);
          if (sig !== savedSig) {
            savedSig = sig;
            try { localStorage.setItem(ANGLE_KEY, JSON.stringify({ yaw: userYaw, pitch: userPitch })); } catch { /* ignore */ }
          }
        }
      }
      // rests at a fixed viewing angle on load (no auto-wobble) — the schematic
      // loads square to the reference view; user drag still rotates it freely
      group.rotation.y = BASE_YAW + userYaw;
      group.rotation.x = BASE_PITCH + userPitch;
      layerMeshes.forEach((pl, i) => { pl.position.y = pl.userData.baseY * (1 + Math.sin(t * 0.5 + i * 0.9) * 0.045); });
      glowMat.opacity = 0.7 + Math.sin(t * 0.9) * 0.22;
      sats.forEach((m2, i) => { m2.position.y = m2.userData.baseY + Math.sin(t * 0.42 + i * 1.9) * 0.05; });
      billboard();
      renderer.render(scene, camera);
      projectAll();
      raf = requestAnimationFrame(frame);
    };
    const renderOnce = () => { billboard(); renderer.render(scene, camera); projectAll(); };
    rig.current.renderOnce = renderOnce;
    rig.current.alignSats = alignSats;
    if (still) {
      renderOnce();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      overlay.innerHTML = "";
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      rig.current = null;
    };
  }, []);

  /* reskin: every layer follows its own color role, live */
  useEffect(() => {
    if (!rig.current) return;
    const timer = window.setTimeout(() => {
      const R = rig.current;
      if (!R) return;
      const c = cfgRef.current;
      const bevel = c.effects.Bevel ?? "#0E9CC9";
      const fill = c.effects["Inner Fill"] ?? "#12B2E2";
      const glow = c.effects.Glow ?? "#8FF0FF";
      const hi = c.effects.Highlight ?? "#EAFBFF";
      const shadow = c.effects.Shadow ?? "#05070d";
      for (const pl of R.layerMeshes) {
        const key = pl.userData.key as string;
        const rim2 = pl.userData.rim as THREE.LineBasicMaterial | undefined;
        if (key === "highlight") { (pl.material as THREE.MeshToonMaterial).color.set(hi); rim2?.color.set(hexMix(hi, "#FFFFFF", 0.4)); }
        if (key === "bevel") { (pl.material as THREE.MeshToonMaterial).color.set(bevel); rim2?.color.set(hexMix(bevel, "#FFFFFF", 0.45)); }
        if (key === "fill") { (pl.material as THREE.MeshToonMaterial).color.set(fill); rim2?.color.set(hexMix(fill, "#FFFFFF", 0.5)); }
      }
      R.keyLight.position.set(Math.cos((c.lighting.angle * Math.PI) / 180) * 5, Math.sin((c.lighting.angle * Math.PI) / 180) * 5 + 2.5, 4.5);
      // soft light layers redraw in their role colors
      R.glowMat.map?.dispose();
      R.glowMat.map = blobTex(glow);
      R.shadowMat.map?.dispose();
      R.shadowMat.map = blobTex(hexMix(shadow, "#000000", 0.35));
      // the pattern plane carries the real face pattern
      svgTex(patternSvg(c), (tex) => {
        const R2 = rig.current;
        if (!R2) { tex.dispose(); return; }
        R2.patternMat.map?.dispose();
        R2.patternMat.map = tex;
        R2.patternMat.needsUpdate = true;
        if (R2.still) R2.renderOnce();
      });
      const kf = useGen.getState().kitTextFill;
      const svgs = [
        renderKit(applyKitTextFill(c, kf.iconbtn), "iconbtn", "l", "default", undefined, undefined, { icon: STOCK_ICONS.gem }),
        renderKit(applyKitTextFill(c, kf.progress), "progress", "m", "default", 0.72),
        renderKit(applyKitTextFill(c, kf.panel), "panel", "m"),
      ];
      svgs.forEach((svg, i) => {
        svgTex(cropPad(svg), (tex, w, h) => {
          const R2 = rig.current;
          if (!R2) { tex.dispose(); return; }
          const mesh = R2.sats[i];
          const m = mesh.material as THREE.MeshBasicMaterial;
          m.map?.dispose();
          m.map = tex; m.opacity = 1; m.needsUpdate = true;
          const wh = mesh.userData.h as number;
          mesh.userData.natW = (w / h) * wh;
          mesh.userData.natH = wh;
          mesh.scale.set(mesh.userData.natW, wh, 1);
          R2.alignSats();
          if (R2.still) R2.renderOnce();
        });
      });
      if (R.still) R.renderOnce();
    }, 140);
    return () => window.clearTimeout(timer);
  }, [cfg]);

  return (
    <div className="kp-glhero" ref={wrapRef} aria-label="Exploded material diagram — live WebGL">
      {failed ? (
        <div className="kp-glfallback">
          {LAYERS.map((L, i) => (
            <div key={L.key} className="kp-glfrow"><b>{String(i + 1).padStart(2, "0")}</b><span>{L.t}</span></div>
          ))}
          <p>WebGL isn't available here — the material still explodes into these seven layers, top to bottom.</p>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} className="kp-glcanvas" />
          <svg ref={svgRef} className="kp-glleads" aria-hidden="true" />
          {LAYERS.map((L, i) => (
            <div key={L.key} className="kp-gllabel" ref={(el) => { labelRefs.current[i] = el; }}>
              <b>{L.t}</b><span>{L.sub}</span>
            </div>
          ))}
          {SATS.map((S, i) => (
            <div key={S.t} className="kp-glsat" ref={(el) => { satLabelRefs.current[i] = el; }}>
              <b>{S.t}</b><span>{S.s1} · {S.s2}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
