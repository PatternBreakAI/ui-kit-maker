/* ── Imported silhouette registry — Silhouette Feasibility Lab ─────────────
   Eight hand-authored silhouettes supplied as raw SVG path data (source box
   0 0 200 100, single closed Bézier outline each). They are NOT part of the
   production silhouette picker: the engine only reaches them through the
   `lab:` Shape prefix, which nothing outside the lab page emits. Geometry
   flows through the exact same shapePath → transformPath pipeline as every
   user-imported shape; there is no per-shape rendering code anywhere.

   `content` follows the SilhouetteMeta convention: safe-area insets as
   fractions of component HEIGHT. The supplied source-space safe band is
   x = 60..140 → left/right = 0.60 × h. Top/bottom clear each silhouette's
   deepest cap intrusion over that band.

   `capSrc` is the rigid end-cap width in SOURCE UNITS (from each end) for
   the vector three-slice experiment — the span outside it is the only
   geometry that may stretch non-uniformly. */

export interface ImportedSilhouette {
  id: string;
  name: string;
  viewBox: [number, number, number, number];
  path: string;
  category: "Buttons" | "Rails & HUD" | "Banners & Labels" | "Plaques & Frames";
  capScale: number;   // rigid cap width as a fraction of height (capSrc / vbH)
  capSrc: number;     // rigid cap width in source units
  content: { top: number; right: number; bottom: number; left: number };
  minWidth: number;
  minHeight: number;
  /** Largest bevel (face inset) as a fraction of height that keeps the inset
   *  face clean — measured in the lab, not guessed. Applied generically in
   *  build(): effectiveBevel = min(requested, h × maxBevelRatio). */
  maxBevelRatio?: number;
  /** Scales the face inset relative to the effective bevel (1 = same). */
  faceInsetScale?: number;
  /** First-pass wave: 1 = the four shapes under test, 2 = registered but
   *  hidden until the wave-1 findings are approved. */
  wave: 1 | 2;
  /** Lab test label (from the brief's safe-band label set). */
  label: string;
}

export const IMPORTED_SHAPES: Record<string, ImportedSilhouette> = {
  twinGrip: {
    id: "twinGrip", name: "Twin Grip Command Bar", viewBox: [0, 0, 200, 100],
    path: "M0.0,50.0 C0.0,34.0 8.0,24.0 20.0,20.0 C18.0,8.0 26.0,0.0 38.0,0.0 C50.0,0.0 56.0,8.0 58.0,18.0 C62.0,12.0 68.0,8.0 76.0,8.0 L124.0,8.0 C132.0,8.0 138.0,12.0 142.0,18.0 C144.0,8.0 150.0,0.0 162.0,0.0 C174.0,0.0 182.0,8.0 180.0,20.0 C192.0,24.0 200.0,34.0 200.0,50.0 C200.0,66.0 192.0,76.0 180.0,80.0 C182.0,92.0 174.0,100.0 162.0,100.0 C150.0,100.0 144.0,92.0 142.0,82.0 C138.0,88.0 132.0,92.0 124.0,92.0 L76.0,92.0 C68.0,92.0 62.0,88.0 58.0,82.0 C56.0,92.0 50.0,100.0 38.0,100.0 C26.0,100.0 18.0,92.0 20.0,80.0 C8.0,76.0 0.0,66.0 0.0,50.0 Z",
    category: "Rails & HUD", capSrc: 76, capScale: 0.76,
    content: { top: 0.22, right: 0.6, bottom: 0.22, left: 0.6 }, minWidth: 142, minHeight: 56,
    wave: 1, label: "PLAY",
  },
  bossCrown: {
    id: "bossCrown", name: "Boss Crown Clamp", viewBox: [0, 0, 200, 100],
    path: "M0.0,50.0 C0.0,36.0 10.0,28.0 22.0,28.0 L14.0,18.0 Q10.0,10.0 20.0,6.0 L34.0,10.0 L38.0,0.0 L52.0,0.0 L56.0,14.0 Q58.0,22.0 66.0,22.0 Q70.0,12.0 80.0,12.0 L120.0,12.0 Q130.0,12.0 134.0,22.0 Q142.0,22.0 144.0,14.0 L148.0,0.0 L162.0,0.0 L166.0,10.0 L180.0,6.0 Q190.0,10.0 186.0,18.0 L178.0,28.0 C190.0,28.0 200.0,36.0 200.0,50.0 C200.0,64.0 190.0,72.0 178.0,72.0 L186.0,82.0 Q190.0,90.0 180.0,94.0 L166.0,90.0 L162.0,100.0 L148.0,100.0 L144.0,86.0 Q142.0,78.0 134.0,78.0 Q130.0,88.0 120.0,88.0 L80.0,88.0 Q70.0,88.0 66.0,78.0 Q58.0,78.0 56.0,86.0 L52.0,100.0 L38.0,100.0 L34.0,90.0 L20.0,94.0 Q10.0,90.0 14.0,82.0 L22.0,72.0 C10.0,72.0 0.0,64.0 0.0,50.0 Z",
    category: "Plaques & Frames", capSrc: 80, capScale: 0.8,
    content: { top: 0.26, right: 0.6, bottom: 0.26, left: 0.6 }, minWidth: 150, minHeight: 60,
    maxBevelRatio: 0.05, // measured: crown-peak crevices stay clean to ≈5u of face inset
    wave: 2, label: "BOSS",
  },
  slimeSurge: {
    id: "slimeSurge", name: "Slime Surge Panel", viewBox: [0, 0, 200, 100],
    path: "M0.0,44.0 C0.0,30.0 10.0,20.0 24.0,22.0 C18.0,12.0 24.0,2.0 36.0,4.0 C40.0,0.0 46.0,0.0 52.0,0.0 C60.0,0.0 64.0,8.0 62.0,18.0 C66.0,12.0 72.0,10.0 80.0,10.0 L120.0,10.0 C128.0,10.0 134.0,14.0 138.0,22.0 C144.0,12.0 152.0,8.0 162.0,10.0 C168.0,2.0 176.0,0.0 184.0,0.0 C194.0,2.0 198.0,12.0 192.0,22.0 C198.0,28.0 200.0,34.0 200.0,44.0 L200.0,56.0 C200.0,66.0 198.0,72.0 192.0,78.0 C198.0,88.0 194.0,98.0 184.0,100.0 C176.0,100.0 168.0,98.0 162.0,90.0 C152.0,92.0 144.0,88.0 138.0,78.0 C134.0,86.0 128.0,90.0 120.0,90.0 L80.0,90.0 C72.0,90.0 66.0,88.0 62.0,82.0 C64.0,92.0 60.0,100.0 52.0,100.0 C46.0,100.0 40.0,100.0 36.0,96.0 C24.0,98.0 18.0,88.0 24.0,78.0 C10.0,80.0 0.0,70.0 0.0,56.0 Z",
    category: "Buttons", capSrc: 80, capScale: 0.8,
    content: { top: 0.24, right: 0.6, bottom: 0.24, left: 0.6 }, minWidth: 142, minHeight: 56,
    wave: 1, label: "BOOST",
  },
  cogLock: {
    id: "cogLock", name: "Cog-Lock Reward Plate", viewBox: [0, 0, 200, 100],
    path: "M0.0,38.0 Q0.0,28.0 10.0,28.0 L20.0,28.0 L16.0,16.0 Q14.0,8.0 22.0,4.0 L30.0,0.0 L46.0,0.0 L52.0,10.0 L60.0,16.0 L68.0,16.0 Q72.0,10.0 80.0,10.0 L120.0,10.0 Q128.0,10.0 132.0,16.0 L140.0,16.0 L148.0,10.0 L154.0,0.0 L170.0,0.0 L178.0,4.0 Q186.0,8.0 184.0,16.0 L180.0,28.0 L190.0,28.0 Q200.0,28.0 200.0,38.0 L200.0,62.0 Q200.0,72.0 190.0,72.0 L180.0,72.0 L184.0,84.0 Q186.0,92.0 178.0,96.0 L170.0,100.0 L154.0,100.0 L148.0,90.0 L140.0,84.0 L132.0,84.0 Q128.0,90.0 120.0,90.0 L80.0,90.0 Q72.0,90.0 68.0,84.0 L60.0,84.0 L52.0,90.0 L46.0,100.0 L30.0,100.0 L22.0,96.0 Q14.0,92.0 16.0,84.0 L20.0,72.0 L10.0,72.0 Q0.0,72.0 0.0,62.0 Z",
    category: "Plaques & Frames", capSrc: 80, capScale: 0.8,
    content: { top: 0.24, right: 0.6, bottom: 0.24, left: 0.6 }, minWidth: 150, minHeight: 60,
    wave: 1, label: "CRAFT",
  },
  prizeBow: {
    id: "prizeBow", name: "Prize Bow Power Bar", viewBox: [0, 0, 200, 100],
    path: "M0.0,50.0 C0.0,36.0 12.0,28.0 24.0,30.0 L14.0,18.0 Q10.0,10.0 20.0,6.0 L34.0,0.0 Q44.0,0.0 48.0,10.0 L56.0,24.0 Q60.0,14.0 70.0,12.0 L130.0,12.0 Q140.0,14.0 144.0,24.0 L152.0,10.0 Q156.0,0.0 166.0,0.0 L180.0,6.0 Q190.0,10.0 186.0,18.0 L176.0,30.0 C188.0,28.0 200.0,36.0 200.0,50.0 C200.0,64.0 188.0,72.0 176.0,70.0 L186.0,82.0 Q190.0,90.0 180.0,94.0 L166.0,100.0 Q156.0,100.0 152.0,90.0 L144.0,76.0 Q140.0,86.0 130.0,88.0 L70.0,88.0 Q60.0,86.0 56.0,76.0 L48.0,90.0 Q44.0,100.0 34.0,100.0 L20.0,94.0 Q10.0,90.0 14.0,82.0 L24.0,70.0 C12.0,72.0 0.0,64.0 0.0,50.0 Z",
    category: "Banners & Labels", capSrc: 70, capScale: 0.7,
    content: { top: 0.26, right: 0.6, bottom: 0.26, left: 0.6 }, minWidth: 150, minHeight: 60,
    wave: 2, label: "CLAIM",
  },
  monsterBite: {
    id: "monsterBite", name: "Monster Bite Status Bar", viewBox: [0, 0, 200, 100],
    path: "M0.0,36.0 C0.0,26.0 8.0,20.0 18.0,20.0 L18.0,8.0 Q18.0,0.0 28.0,0.0 L42.0,0.0 Q50.0,0.0 50.0,8.0 L50.0,16.0 Q50.0,24.0 58.0,24.0 Q66.0,24.0 66.0,16.0 L66.0,12.0 Q66.0,8.0 74.0,8.0 L126.0,8.0 Q134.0,8.0 134.0,12.0 L134.0,16.0 Q134.0,24.0 142.0,24.0 Q150.0,24.0 150.0,16.0 L150.0,8.0 Q150.0,0.0 158.0,0.0 L172.0,0.0 Q182.0,0.0 182.0,8.0 L182.0,20.0 C192.0,20.0 200.0,26.0 200.0,36.0 L200.0,64.0 C200.0,74.0 192.0,80.0 182.0,80.0 L182.0,92.0 Q182.0,100.0 172.0,100.0 L158.0,100.0 Q150.0,100.0 150.0,92.0 L150.0,84.0 Q150.0,76.0 142.0,76.0 Q134.0,76.0 134.0,84.0 L134.0,88.0 Q134.0,92.0 126.0,92.0 L74.0,92.0 Q66.0,92.0 66.0,88.0 L66.0,84.0 Q66.0,76.0 58.0,76.0 Q50.0,76.0 50.0,84.0 L50.0,92.0 Q50.0,100.0 42.0,100.0 L28.0,100.0 Q18.0,100.0 18.0,92.0 L18.0,80.0 C8.0,80.0 0.0,74.0 0.0,64.0 Z",
    category: "Rails & HUD", capSrc: 74, capScale: 0.74,
    content: { top: 0.28, right: 0.6, bottom: 0.28, left: 0.6 }, minWidth: 150, minHeight: 60,
    wave: 1, label: "DANGER",
  },
  turboWing: {
    id: "turboWing", name: "Turbo Wing Action Plate", viewBox: [0, 0, 200, 100],
    path: "M0.0,40.0 L18.0,28.0 L8.0,16.0 L20.0,14.0 L30.0,18.0 L40.0,26.0 L42.0,0.0 L56.0,0.0 L60.0,12.0 L140.0,12.0 L144.0,0.0 L158.0,0.0 L160.0,26.0 L170.0,18.0 L180.0,14.0 L192.0,16.0 L182.0,28.0 L200.0,40.0 L200.0,60.0 L182.0,72.0 L192.0,84.0 L180.0,86.0 L170.0,82.0 L160.0,74.0 L158.0,100.0 L144.0,100.0 L140.0,88.0 L60.0,88.0 L56.0,100.0 L42.0,100.0 L40.0,74.0 L30.0,82.0 L20.0,86.0 L8.0,84.0 L18.0,72.0 L0.0,60.0 Z",
    category: "Rails & HUD", capSrc: 60, capScale: 0.6,
    content: { top: 0.24, right: 0.6, bottom: 0.24, left: 0.6 }, minWidth: 150, minHeight: 60,
    maxBevelRatio: 0.09, // measured: wing fins stay clean to ≈9u of face inset
    wave: 2, label: "RACE",
  },
  gemCluster: {
    id: "gemCluster", name: "Gem Cluster Loot Bar", viewBox: [0, 0, 200, 100],
    path: "M0.0,42.0 L10.0,30.0 L4.0,18.0 L20.0,18.0 L26.0,8.0 L36.0,0.0 L48.0,0.0 L56.0,8.0 L60.0,14.0 L140.0,14.0 L144.0,8.0 L152.0,0.0 L164.0,0.0 L174.0,8.0 L180.0,18.0 L196.0,18.0 L190.0,30.0 L200.0,42.0 L200.0,58.0 L190.0,70.0 L196.0,82.0 L180.0,82.0 L174.0,92.0 L164.0,100.0 L152.0,100.0 L144.0,92.0 L140.0,86.0 L60.0,86.0 L56.0,92.0 L48.0,100.0 L36.0,100.0 L26.0,92.0 L20.0,82.0 L4.0,82.0 L10.0,70.0 L0.0,58.0 Z",
    category: "Banners & Labels", capSrc: 60, capScale: 0.6,
    content: { top: 0.26, right: 0.6, bottom: 0.26, left: 0.6 }, minWidth: 150, minHeight: 60,
    wave: 2, label: "LOOT",
  },
};

/** Resolve a `lab:` Shape string (optionally suffixed `:caps` for the
 *  three-slice experiment) to its registry entry. Anything else → undefined,
 *  so the production shape pipeline never sees these. */
export function importedShape(shape: string): ImportedSilhouette | undefined {
  if (!shape.startsWith("lab:")) return undefined;
  return IMPORTED_SHAPES[shape.slice(4).replace(/:caps$/, "")];
}

/* ── Phase 14 · import validation ──────────────────────────────────────────
   Structural checks on the raw path data — run before rendering, results
   shown in the lab. Pure string/geometry work; no DOM, no rendering. */

export interface ImportValidation {
  ok: boolean;
  checks: { name: string; pass: boolean; note?: string }[];
}

const TOKEN_RE = /[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

export function validateImported(s: ImportedSilhouette): ImportValidation {
  const checks: ImportValidation["checks"] = [];
  const toks = s.path.match(TOKEN_RE) ?? [];
  const cmds = toks.filter((t) => /^[a-z]$/i.test(t)).map((t) => t.toUpperCase());
  const nums = toks.filter((t) => !/^[a-z]$/i.test(t)).map(Number);
  const subpaths = cmds.filter((c) => c === "M").length;
  checks.push({ name: "single subpath", pass: subpaths === 1, note: `${subpaths} M command${subpaths === 1 ? "" : "s"}` });
  checks.push({ name: "closed with Z", pass: cmds[cmds.length - 1] === "Z" });
  const unsupported = cmds.filter((c) => !"MLHVCSQTZ".includes(c));
  checks.push({ name: "no arcs / unsupported commands", pass: unsupported.length === 0, note: unsupported.length ? unsupported.join(" ") : "M L H V C S Q T Z only" });
  checks.push({ name: "finite coordinates", pass: nums.every(Number.isFinite) });
  const vbOk = s.viewBox[0] === 0 && s.viewBox[1] === 0 && s.viewBox[2] === 200 && s.viewBox[3] === 100;
  checks.push({ name: "source viewBox 0 0 200 100", pass: vbOk });
  const pts = flattenPath(s.path).flat();
  const bx = bounds(pts);
  const touch = (v: number, t: number) => Math.abs(v - t) <= 0.6;
  checks.push({
    name: "bounds touch all four edges",
    pass: touch(bx.minX, 0) && touch(bx.maxX, 200) && touch(bx.minY, 0) && touch(bx.maxY, 100),
    note: `x ${bx.minX.toFixed(1)}..${bx.maxX.toFixed(1)}, y ${bx.minY.toFixed(1)}..${bx.maxY.toFixed(1)}`,
  });
  const selfX = selfIntersections(flattenPath(s.path)[0] ?? []);
  checks.push({ name: "no self-intersections", pass: selfX === 0, note: selfX ? `${selfX} crossing${selfX === 1 ? "" : "s"}` : undefined });
  return { ok: checks.every((c) => c.pass), checks };
}

/* ── Pure path geometry — flattening + inset diagnostics ───────────────────
   These take path STRINGS (any source), so they can audit the exact `d`
   the engine produced — the analysis can never drift from the render. */

export interface Pt { x: number; y: number }

/** Flatten a path into sampled polygons (one per subpath). Handles
 *  M L H V C S Q T A Z, absolute and relative; curves and arcs sample at
 *  `k` steps — arcs go through the spec's endpoint→center conversion, so a
 *  pill's round end flattens as a true curve, not a straight chord (the
 *  chord shortcut hollowed out extrusion walls under rounded ends). */
export function flattenPath(d: string, k = 12): Pt[][] {
  const toks = d.match(TOKEN_RE) ?? [];
  const polys: Pt[][] = [];
  let poly: Pt[] = [];
  let i = 0, cmd = "";
  let cx = 0, cy = 0, sx = 0, sy = 0;   // current + subpath start
  let pcx = 0, pcy = 0, pQx = 0, pQy = 0; // previous cubic / quad control
  let lastC = "";
  const num = () => parseFloat(toks[i++]);
  const emit = (x: number, y: number) => { poly.push({ x, y }); };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    for (let t = 1; t <= k; t++) {
      const u = t / k, v = 1 - u;
      emit(v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
        v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3);
    }
    pcx = x2; pcy = y2; cx = x3; cy = y3;
  };
  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    for (let t = 1; t <= k; t++) {
      const u = t / k, v = 1 - u;
      emit(v * v * cx + 2 * v * u * x1 + u * u * x2, v * v * cy + 2 * v * u * y1 + u * u * y2);
    }
    pQx = x1; pQy = y1; cx = x2; cy = y2;
  };
  while (i < toks.length) {
    if (/^[a-z]$/i.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase() && cmd.toUpperCase() !== "Z";
    const C = cmd.toUpperCase();
    const rx = (v: number) => (rel ? cx + v : v);
    const ry = (v: number) => (rel ? cy + v : v);
    if (C === "Z") { if (poly.length) { polys.push(poly); poly = []; } cx = sx; cy = sy; lastC = "Z"; continue; }
    if (C === "M") { cx = rx(num()); cy = ry(num()); sx = cx; sy = cy; if (poly.length) { polys.push(poly); poly = []; } emit(cx, cy); lastC = "M"; cmd = rel ? "l" : "L"; continue; }
    if (C === "L") { cx = rx(num()); cy = ry(num()); emit(cx, cy); lastC = "L"; continue; }
    if (C === "H") { cx = rx(num()); emit(cx, cy); lastC = "L"; continue; }
    if (C === "V") { cy = ry(num()); emit(cx, cy); lastC = "L"; continue; }
    if (C === "C") { const a = rx(num()), b = ry(num()), c = rx(num()), d2 = ry(num()), e = rx(num()), f = ry(num()); cubic(a, b, c, d2, e, f); lastC = "C"; continue; }
    if (C === "S") { const c1x = lastC === "C" ? 2 * cx - pcx : cx, c1y = lastC === "C" ? 2 * cy - pcy : cy; const c = rx(num()), d2 = ry(num()), e = rx(num()), f = ry(num()); cubic(c1x, c1y, c, d2, e, f); lastC = "C"; continue; }
    if (C === "Q") { const a = rx(num()), b = ry(num()), c = rx(num()), d2 = ry(num()); quad(a, b, c, d2); lastC = "Q"; continue; }
    if (C === "T") { const c1x = lastC === "Q" ? 2 * cx - pQx : cx, c1y = lastC === "Q" ? 2 * cy - pQy : cy; const c = rx(num()), d2 = ry(num()); quad(c1x, c1y, c, d2); lastC = "Q"; continue; }
    if (C === "A") {
      let arx = Math.abs(num()), ary = Math.abs(num());
      const phi = (num() * Math.PI) / 180, fa = num() !== 0, fsw = num() !== 0;
      const ex2 = rx(num()), ey2 = ry(num());
      if (arx < 1e-6 || ary < 1e-6 || (ex2 === cx && ey2 === cy)) { cx = ex2; cy = ey2; emit(cx, cy); lastC = "L"; continue; }
      // SVG spec F.6: endpoint parameterization → center, then sample
      const cosP = Math.cos(phi), sinP = Math.sin(phi);
      const hdx = (cx - ex2) / 2, hdy = (cy - ey2) / 2;
      const x1p = cosP * hdx + sinP * hdy, y1p = -sinP * hdx + cosP * hdy;
      const lam = (x1p * x1p) / (arx * arx) + (y1p * y1p) / (ary * ary);
      if (lam > 1) { const s = Math.sqrt(lam); arx *= s; ary *= s; }
      const den = arx * arx * y1p * y1p + ary * ary * x1p * x1p;
      let co = den ? Math.sqrt(Math.max(0, (arx * arx * ary * ary - den) / den)) : 0;
      if (fa === fsw) co = -co;
      const cxp = (co * arx * y1p) / ary, cyp = (-co * ary * x1p) / arx;
      const ccx = cosP * cxp - sinP * cyp + (cx + ex2) / 2;
      const ccy = sinP * cxp + cosP * cyp + (cy + ey2) / 2;
      const ang = (ux: number, uy: number, vx: number, vy: number) => {
        const dd2 = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1e-9;
        let a2 = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / dd2)));
        if (ux * vy - uy * vx < 0) a2 = -a2;
        return a2;
      };
      const th1 = ang(1, 0, (x1p - cxp) / arx, (y1p - cyp) / ary);
      let dth = ang((x1p - cxp) / arx, (y1p - cyp) / ary, (-x1p - cxp) / arx, (-y1p - cyp) / ary);
      if (!fsw && dth > 0) dth -= 2 * Math.PI;
      else if (fsw && dth < 0) dth += 2 * Math.PI;
      for (let t = 1; t <= k; t++) {
        const th = th1 + (dth * t) / k;
        emit(ccx + arx * Math.cos(th) * cosP - ary * Math.sin(th) * sinP,
          ccy + arx * Math.cos(th) * sinP + ary * Math.sin(th) * cosP);
      }
      cx = ex2; cy = ey2; lastC = "L"; continue;
    }
    i++; // unknown token — skip defensively
  }
  if (poly.length) polys.push(poly);
  return polys;
}

export function bounds(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  return { minX, minY, maxX, maxY };
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Count crossings between non-adjacent edges of a closed sampled polygon. */
export function selfIntersections(poly: Pt[]): number {
  const n = poly.length;
  if (n < 4) return 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // shared vertex with the closing edge
      const c = poly[j], d = poly[(j + 1) % n];
      if (segsCross(a, b, c, d)) count++;
    }
  }
  return count;
}

function distPtSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Narrowest local feature of a closed outline: min distance from each
 *  vertex to every non-neighboring edge (window ±skip suppresses the
 *  trivially-near adjacent samples). Approximates lobe/notch thickness. */
export function minFeatureWidth(poly: Pt[], skip = 16): number {
  const n = poly.length;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dGap = Math.min(Math.abs(i - j), n - Math.abs(i - j));
      if (dGap <= skip) continue;
      const d = distPtSeg(poly[i], poly[j], poly[(j + 1) % n]);
      if (d < min) min = d;
    }
  }
  return min;
}

/* ── Inset audit — the honest core of the lab ──────────────────────────────
   Runs entirely in SOURCE SPACE (0 0 200 100) so thresholds are the brief's
   "logical units". The caller supplies a makePath callback that goes through
   the REAL shapePath pipeline, so what we audit is what the engine draws. */

export interface InsetAudit {
  warnings: string[];
  /** Largest inset (source units) with a clean face; -1 if even 2u fails. */
  maxCleanInset: number;
  faceSelfX: number;
  /** Deepest excursion of the face outside the outer path, source units.
   *  Bounding-box scaling is not a geometric offset — concave crevices are
   *  where the difference shows, and this measures exactly how much. */
  maxEscape: number;
  minFeature: number;
}

function escapeDepth(p: Pt, poly: Pt[]): number {
  if (pointInPoly(p, poly)) return 0;
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = distPtSeg(p, poly[i], poly[(i + 1) % poly.length]);
    if (d < min) min = d;
  }
  return min;
}

export function auditInset(makePath: (inset: number) => string, insetNow: number): InsetAudit {
  const outerPoly = flattenPath(makePath(0))[0] ?? [];
  const probe = (inset: number): { selfX: number; escape: number; feat: number } => {
    const facePoly = flattenPath(makePath(inset))[0] ?? [];
    const selfX = selfIntersections(facePoly);
    let escape = 0;
    for (let i = 0; i < facePoly.length; i += 2) {
      const d = escapeDepth(facePoly[i], outerPoly);
      if (d > escape) escape = d;
    }
    return { selfX, escape, feat: minFeatureWidth(facePoly) };
  };
  // A sub-unit excursion is a boundary kiss, invisible under the rim stroke;
  // beyond ~1u the face visibly overrides the bevel wall.
  const ESC = 1;
  let maxCleanInset = -1;
  for (let b = 2; b <= 26; b += 1) {
    const r = probe(b);
    if (r.selfX === 0 && r.escape <= ESC && r.feat >= 6) maxCleanInset = b; else break;
  }
  const now = probe(insetNow);
  const warnings: string[] = [];
  if (now.escape > ESC) warnings.push(`face inset (${insetNow.toFixed(1)}u) escapes the outer silhouette by ≈${now.escape.toFixed(1)}u in concave crevices`);
  if (now.selfX > 0) warnings.push(`face path self-intersects at the current inset (${now.selfX} crossing${now.selfX === 1 ? "" : "s"})`);
  if (now.feat < 8 && now.selfX === 0) warnings.push(`narrowest face feature ≈ ${now.feat.toFixed(1)}u (< 8u — lobe or notch near collapse)`);
  return { warnings, maxCleanInset, faceSelfX: now.selfX, maxEscape: now.escape, minFeature: now.feat };
}
