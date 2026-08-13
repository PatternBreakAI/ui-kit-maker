/* ── Racing HUD — one responsive 16:9 SVG ──────────────────────────
   v57: the HUD wears the KIT'S OWN colors (bevel/glow roles drive every
   panel, stroke and gradient), sits on a pure gradient backdrop (no
   rendered game scene), and breathes — RPM tips, the player row, the map
   marker, the ERS bolt and the background washes all animate quietly.
   Content is scaled to 91% so the big screen keeps real air. Exact panel
   coordinates follow the layout spec; data lives in arrays; no canvas,
   no WebGL, no raster. */
import { useGen } from "@/generator/store";
import { darken, hexMix, hexRgba, lighten } from "@/generator/model";
import { usePageScroll } from "@/shell/usePageScroll";

const LEADERBOARD = [
  { position: 1, driver: "NOR", gap: "01:21.548", selected: false },
  { position: 2, driver: "VER", gap: "+0.842", selected: false },
  { position: 3, driver: "YOU", gap: "+2.156", selected: true },
  { position: 4, driver: "LEC", gap: "+3.271", selected: false },
  { position: 5, driver: "PIA", gap: "+4.712", selected: false },
];

const SECTORS = [
  { id: "S1", time: "00:28.432", positive: true, tabX: 558, valX: 628 },
  { id: "S2", time: "00:27.891", positive: true, tabX: 822, valX: 892 },
  { id: "S3", time: "00:28.335", positive: false, tabX: 1092, valX: 1162 },
];

const TIRES = [
  { id: "FL", temperature: "93°C", wear: "92%", x: 1364, y: 798 },
  { id: "RL", temperature: "89°C", wear: "93%", x: 1364, y: 910 },
  { id: "FR", temperature: "95°C", wear: "90%", x: 1692, y: 798 },
  { id: "RR", temperature: "91°C", wear: "91%", x: 1692, y: 910 },
];

const OPPONENTS: [number, number][] = [
  [104, 404], [148, 344], [188, 374], [196, 452], [252, 476],
  [310, 432], [368, 326], [404, 376], [352, 470], [222, 560],
];

const GREEN = "#44FF69";
const RED = "#FF477F";
const INK = "#F1F3FA";
const INK2 = "#C3C9D8";
const INK3 = "#848B9C";

function Label({ x, y, size = 16, fill = INK2, weight = 700, anchor, spacing = 1.5, children }: {
  x: number; y: number; size?: number; fill?: string; weight?: number; anchor?: "middle" | "end"; spacing?: number; children: React.ReactNode;
}) {
  return <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} letterSpacing={spacing} textAnchor={anchor}>{children}</text>;
}
function Big({ x, y, size, fill = INK, anchor, italic, glow, cls, children }: {
  x: number; y: number; size: number; fill?: string; anchor?: "middle" | "end"; italic?: boolean; glow?: boolean; cls?: string; children: React.ReactNode;
}) {
  return <text x={x} y={y} className={cls} fontSize={size} fontWeight={700} fill={fill} letterSpacing={-1} textAnchor={anchor}
    fontStyle={italic ? "italic" : undefined} filter={glow ? "url(#rhActiveGlow)" : undefined}>{children}</text>;
}

/** The shared panel system: gradient body, inner outline, top highlight,
 *  one corner accent. Every rectangular panel reuses this. */
function Panel({ x, y, w, h, stroke, strokeLight }: { x: number; y: number; w: number; h: number; stroke: string; strokeLight: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx={22} fill="url(#rhPanel)" stroke={stroke} strokeWidth={1.5} filter="url(#rhPanelGlow)" />
      <rect x={4} y={4} width={w - 8} height={h - 8} rx={18} fill="none" stroke={strokeLight} strokeOpacity={0.22} strokeWidth={1} />
      <rect x={26} y={7} width={Math.min(w * 0.44, 260)} height={2} rx={1} fill="url(#rhTopHi)" />
      <polygon points="0,16 16,0 42,0 18,25" fill="url(#rhCorner)" transform="translate(18 12)" />
    </g>
  );
}

/* RPM arc — 18 trapezoid segments, 205°→335°, generated not hand-drawn */
function rpmSegments(bevel: string, glow: string) {
  const cx = 910, cy = 778, rOut = 296, rIn = 258;
  const startAngle = 205, endAngle = 335, segmentCount = 18, gapDeg = 1.6;
  const active = 13;
  const segs = [];
  const step = (endAngle - startAngle) / segmentCount;
  const dir = (deg: number, r: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  for (let i = 0; i < segmentCount; i++) {
    const a0 = startAngle + i * step + gapDeg / 2;
    const a1 = startAngle + (i + 1) * step - gapDeg / 2;
    const [x1, y1] = dir(a0, rOut); const [x2, y2] = dir(a1, rOut);
    const [x3, y3] = dir(a1, rIn); const [x4, y4] = dir(a0, rIn);
    const color = i < 15 ? hexMix(bevel, glow, i / 15) : RED;
    const on = i < active;
    segs.push(
      <polygon key={i} points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
        fill={color} opacity={on ? 1 : 0.22}
        className={on && i >= 11 ? "rh-soft" : undefined}
        filter={on && i >= 11 ? "url(#rhActiveGlow)" : undefined} />
    );
  }
  const ticks = [];
  for (let v = 0; v <= 16; v += 2) {
    const a = startAngle + (v / 16) * (endAngle - startAngle);
    const [tx, ty] = dir(a, rOut + 20);
    ticks.push(<text key={v} x={tx} y={ty + 5} fontSize={14} fontWeight={600} fill={INK3} textAnchor="middle">{v}</text>);
  }
  return <>{segs}{ticks}</>;
}

/* pedal bars — 6 slightly-skewed segments, throttle green / brake red */
function pedalBar(x: number, active: number, color: string, lean: number, dim: string) {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const y = 828 + i * 20;
    const on = 5 - i < active;
    const top = 5 - i === active - 1; // the working edge breathes
    rows.push(
      <polygon key={i} className={top ? "rh-soft" : undefined}
        points={`${x + i * lean},${y} ${x + 84 + i * lean},${y - 3} ${x + 84 + i * lean},${y + 10} ${x + i * lean},${y + 13}`}
        fill={on ? color : dim} opacity={on ? 0.95 : 0.5} />
    );
  }
  return rows;
}

/* tyre tile — 3 concentric circles + 6 ticks, label, temp, wear */
function TireTile({ t, line, well }: { t: (typeof TIRES)[number]; line: string; well: string }) {
  const cx = t.x + 40, cy = t.y + 47;
  return (
    <g>
      <rect x={t.x} y={t.y} width={160} height={94} rx={14} fill={well} stroke={line} strokeOpacity={0.5} strokeWidth={1.2} />
      {[27, 19, 10].map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={line} strokeOpacity={r === 27 ? 0.9 : 0.45} strokeWidth={r === 27 ? 2.6 : 1.4} />)}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return <line key={i} x1={cx + Math.cos(a) * 12} y1={cy + Math.sin(a) * 12} x2={cx + Math.cos(a) * 17} y2={cy + Math.sin(a) * 17} stroke={line} strokeOpacity={0.6} strokeWidth={1.8} />;
      })}
      <Label x={t.x + 86} y={t.y + 32} size={14}>{t.id}</Label>
      <text x={t.x + 86} y={t.y + 56} fontSize={17} fontWeight={700} fill={INK}>{t.temperature}</text>
      <text x={t.x + 86} y={t.y + 78} fontSize={16} fontWeight={700} fill={GREEN}>{t.wear}</text>
    </g>
  );
}

export function RacingHud() {
  usePageScroll(); // gen.css pins <body> for the editor — unpin, or the page can't scroll (owner report)
  const cfg = useGen((s) => s.cfg);
  const bevel = cfg.effects.Bevel ?? "#0E9CC9";
  const glow = cfg.effects.Glow ?? "#8FF0FF";
  const stroke = hexRgba(lighten(bevel, 0.18), 0.85);
  const strokeLight = lighten(bevel, 0.55);
  const well = hexRgba(hexMix(bevel, "#080A12", 0.88), 0.9);
  const trackLine = lighten(bevel, 0.3);
  const trackTop = hexMix(glow, "#FFFFFF", 0.35);
  const selMid = hexMix(bevel, glow, 0.3);
  const selEnd = darken(bevel, 0.35);
  return (
    <div className="rh-shell">
      <svg className="rh" viewBox="0 0 1920 1080" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg" fontFamily="Inter, Arial, sans-serif" role="img"
        aria-label="Racing HUD — Kazuri Ring at night" data-screen="racing-hud">
        <defs>
          <linearGradient id="rhBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hexMix(bevel, "#0A0C15", 0.88)} />
            <stop offset="55%" stopColor={hexMix(bevel, "#07080F", 0.93)} />
            <stop offset="100%" stopColor="#06070D" />
          </linearGradient>
          <radialGradient id="rhWashA">
            <stop offset="0%" stopColor={glow} stopOpacity="0.14" />
            <stop offset="100%" stopColor={glow} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rhWashB">
            <stop offset="0%" stopColor={bevel} stopOpacity="0.2" />
            <stop offset="100%" stopColor={bevel} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rhVignette" cx="0.5" cy="0.46" r="0.85">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="78%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.38" />
          </radialGradient>
          <linearGradient id="rhPanel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hexMix(bevel, "#0A0B14", 0.78)} stopOpacity="0.95" />
            <stop offset="45%" stopColor={hexMix(bevel, "#0A0B14", 0.92)} stopOpacity="0.92" />
            <stop offset="100%" stopColor={hexMix(bevel, "#07080F", 0.95)} stopOpacity="0.96" />
          </linearGradient>
          <linearGradient id="rhTopHi" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
            <stop offset="30%" stopColor={strokeLight} stopOpacity="0.5" />
            <stop offset="100%" stopColor={bevel} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="rhSelRow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={selEnd} />
            <stop offset="48%" stopColor={selMid} />
            <stop offset="100%" stopColor={selEnd} />
          </linearGradient>
          <linearGradient id="rhCorner" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="30%" stopColor={strokeLight} stopOpacity="0.8" />
            <stop offset="100%" stopColor={bevel} stopOpacity="0" />
          </linearGradient>
          <filter id="rhPanelGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feFlood floodColor={bevel} floodOpacity="0.22" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="rhActiveGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feFlood floodColor={glow} floodOpacity="0.5" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* backdrop — gradients only, like every other stage */}
        <g id="rh-background">
          <rect width="1920" height="1080" fill="url(#rhBase)" />
          <ellipse className="rh-wash" cx="420" cy="140" rx="700" ry="380" fill="url(#rhWashA)" />
          <ellipse className="rh-wash rh-wash2" cx="1600" cy="960" rx="820" ry="420" fill="url(#rhWashB)" />
          <rect width="1920" height="1080" fill="url(#rhVignette)" />
        </g>

        {/* the whole HUD sits at 91% — a big screen keeps real air */}
        <g transform="translate(86.4 48.6) scale(0.91)">
          <g id="rh-panels">
            <Panel x={32} y={32} w={450} h={180} stroke={stroke} strokeLight={strokeLight} />
            <Panel x={520} y={32} w={850} h={190} stroke={stroke} strokeLight={strokeLight} />
            <Panel x={1406} y={32} w={482} h={286} stroke={stroke} strokeLight={strokeLight} />
            <Panel x={32} y={244} w={430} h={430} stroke={stroke} strokeLight={strokeLight} />
            <Panel x={1330} y={454} w={558} h={248} stroke={stroke} strokeLight={strokeLight} />
            <Panel x={1330} y={726} w={558} h={300} stroke={stroke} strokeLight={strokeLight} />
            {/* speed cluster — shaped cockpit display, not a plain rect */}
            <path d="M 570 572 H 1250 C 1286 572, 1304 598, 1312 632 L 1336 748 C 1344 788, 1332 842, 1308 886 L 1262 970 C 1246 1002, 1212 1020, 1174 1020 H 646 C 608 1020, 574 1002, 558 970 L 512 886 C 488 842, 476 788, 484 748 L 508 632 C 516 598, 534 572, 570 572 Z"
              fill="url(#rhPanel)" stroke={stroke} strokeWidth={2} filter="url(#rhPanelGlow)" />
            <polygon points="0,16 16,0 42,0 18,25" fill="url(#rhCorner)" transform="translate(586 588)" />
          </g>

          <g id="rh-content">
            {/* A · position & lap */}
            <Label x={66} y={76} size={17}>POSITION</Label>
            <Big x={66} y={150} size={70} italic glow>P3</Big>
            <text x={186} y={150} fontSize={28} fontWeight={600} fill={INK3}>/20</text>
            <line x1={260} y1={58} x2={260} y2={186} stroke={stroke} strokeOpacity={0.45} strokeWidth={1.2} />
            <Label x={302} y={76} size={17}>LAP</Label>
            <Big x={302} y={150} size={70} italic>12</Big>
            <text x={406} y={150} fontSize={28} fontWeight={600} fill={INK3}>/20</text>

            {/* B · timing */}
            <Label x={675} y={74} anchor="middle" size={15}>CURRENT LAP</Label>
            <Big x={675} y={126} size={32} anchor="middle">01:24.658</Big>
            <line x1={806} y1={58} x2={806} y2={156} stroke={stroke} strokeOpacity={0.45} strokeWidth={1.2} />
            <Label x={945} y={74} anchor="middle" size={15}>BEST LAP</Label>
            <Big x={945} y={126} size={32} anchor="middle" fill={glow}>01:22.934</Big>
            <line x1={1084} y1={58} x2={1084} y2={156} stroke={stroke} strokeOpacity={0.45} strokeWidth={1.2} />
            <Label x={1215} y={74} anchor="middle" size={15}>DELTA</Label>
            <Big x={1215} y={126} size={34} anchor="middle" fill={GREEN} glow cls="rh-soft">-0.724</Big>
            <line x1={520} y1={154} x2={1370} y2={154} stroke={stroke} strokeOpacity={0.35} strokeWidth={1} />
            {SECTORS.map((s) => (
              <g key={s.id}>
                <rect x={s.tabX} y={169} width={56} height={30} rx={10} fill={well} stroke={stroke} strokeOpacity={0.6} strokeWidth={1.2} />
                <text x={s.tabX + 28} y={189} fontSize={14} fontWeight={700} fill={strokeLight} textAnchor="middle" letterSpacing={1}>{s.id}</text>
                <text x={s.valX} y={191} fontSize={18} fontWeight={600} fill={s.positive ? GREEN : INK2}>{s.time}</text>
              </g>
            ))}

            {/* C · leaderboard */}
            <Label x={1444} y={72} size={17} fill={INK}>TOP 5</Label>
            {LEADERBOARD.map((r, i) => {
              const y = 92 + i * 44;
              return (
                <g key={r.position}>
                  {r.selected && <rect className="rh-soft" x={1426} y={y - 4} width={442} height={44} rx={8} fill="url(#rhSelRow)" filter="url(#rhActiveGlow)" />}
                  <text x={1462} y={y + 24} fontSize={18} fontWeight={700} fill={r.selected ? "#FFFFFF" : INK3}>{r.position}</text>
                  <text x={1530} y={y + 24} fontSize={18} fontWeight={700} fill={r.selected ? "#FFFFFF" : INK} letterSpacing={1.5}>{r.driver}</text>
                  <text x={1840} y={y + 24} fontSize={17} fontWeight={600} fill={r.selected ? "#FFFFFF" : INK2} textAnchor="end">{r.gap}</text>
                </g>
              );
            })}

            {/* D · track map — Kazuri Ring */}
            <Label x={70} y={282} size={17} fill={INK}>TRACK MAP</Label>
            <Label x={424} y={282} size={12} fill={INK3} anchor="end" spacing={2}>KAZURI RING</Label>
            <path d="M 104 404 C 118 336, 172 336, 188 374 C 200 406, 170 430, 194 454 C 224 484, 282 470, 310 432 C 342 390, 350 328, 392 318 C 426 310, 424 348, 404 380 C 382 420, 354 470, 326 518 C 300 560, 260 586, 216 562 C 176 540, 150 494, 104 470 C 74 452, 78 424, 104 404"
              fill="none" stroke={trackLine} strokeWidth={17} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
            <path d="M 104 404 C 118 336, 172 336, 188 374 C 200 406, 170 430, 194 454 C 224 484, 282 470, 310 432 C 342 390, 350 328, 392 318 C 426 310, 424 348, 404 380 C 382 420, 354 470, 326 518 C 300 560, 260 586, 216 562 C 176 540, 150 494, 104 470 C 74 452, 78 424, 104 404"
              fill="none" stroke={trackTop} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
            {OPPONENTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5} fill="#F9F2FF" />)}
            <g className="rh-mark" filter="url(#rhActiveGlow)">
              <circle cx={294} cy={526} r={18} fill="url(#rhSelRow)" stroke={strokeLight} strokeWidth={2} />
              <polygon points="294,516 288,528 300,528" fill="#FFFFFF" />
            </g>
            <line x1={54} y1={566} x2={440} y2={566} stroke={stroke} strokeOpacity={0.45} strokeWidth={1.2} />
            <Label x={70} y={596} size={13}>NEXT TURN</Label>
            <text x={70} y={640} fontSize={26} fontWeight={700} fill={INK} letterSpacing={1}>RIGHT 5</text>
            <path d="M 214 630 h 26 v -14 l 22 20 -22 20 v -14 h -34 v -12 Z" fill={strokeLight} opacity={0.9} />
            <text x={278} y={640} fontSize={22} fontWeight={600} fill={INK2}>98m</text>

            {/* E · power & energy */}
            <Label x={1374} y={494} size={17} fill={INK}>POWER &amp; ENERGY</Label>
            <line x1={1518} y1={516} x2={1518} y2={674} stroke={stroke} strokeOpacity={0.45} strokeWidth={1.2} />
            <line x1={1692} y1={516} x2={1692} y2={674} stroke={stroke} strokeOpacity={0.45} strokeWidth={1.2} />
            <Label x={1418} y={540} size={15}>FUEL</Label>
            <Big x={1418} y={592} size={32}>23.4 L</Big>
            <Label x={1418} y={636} size={13} fill={INK3}>LAPS LEFT</Label>
            <text x={1418} y={674} fontSize={26} fontWeight={700} fill={INK2}>8.7</text>
            <Label x={1604} y={540} size={15}>ERS</Label>
            <polygon className="rh-bolt" points="1578,558 1560,584 1572,584 1568,602 1588,574 1575,574 1582,558" fill={GREEN} filter="url(#rhActiveGlow)" />
            <Big x={1634} y={592} size={32} fill={GREEN}>4 / 4</Big>
            <Label x={1604} y={654} size={15} anchor="middle" fill={strokeLight}>OVERTAKE MODE</Label>
            <Label x={1768} y={540} size={15}>BATTERY</Label>
            <Big x={1782} y={592} size={32}>78%</Big>
            <Label x={1744} y={636} size={13} fill={INK3}>TEMP</Label>
            <text x={1838} y={636} fontSize={15} fontWeight={600} fill={INK2} textAnchor="end">52°C</text>
            <rect x={1732} y={658} width={112} height={8} rx={4} fill={well} />
            <rect x={1732} y={658} width={87} height={8} rx={4} fill={GREEN} opacity={0.9} />

            {/* F · tyre status */}
            <Label x={1374} y={766} size={17} fill={INK}>TYRE STATUS</Label>
            <g stroke={trackLine} strokeOpacity={0.85} strokeWidth={2.2} fill={well}>
              <rect x={1583} y={800} width={50} height={140} rx={22} />
              {[[1565, 806], [1618, 806], [1565, 902], [1618, 902]].map(([x, y]) => (
                <rect key={`${x}${y}`} x={x} y={y} width={14} height={32} rx={5} fill={hexMix(bevel, "#0A0B14", 0.8)} />
              ))}
              <ellipse cx={1608} cy={856} rx={13} ry={22} fill={hexMix(bevel, "#07080F", 0.92)} />
            </g>
            {TIRES.map((t) => <TireTile key={t.id} t={t} line={trackLine} well={well} />)}

            {/* G · speed cluster */}
            {rpmSegments(bevel, glow)}
            <Label x={910} y={708} size={14} anchor="middle" fill={INK3} spacing={2}>RPM x1000</Label>
            <Big x={910} y={828} size={92} anchor="middle" italic glow>6</Big>
            <Big x={910} y={928} size={72} anchor="middle" italic>248</Big>
            <text x={1016} y={928} fontSize={21} fontWeight={600} fill={INK2} letterSpacing={2}>KPH</text>
            <Label x={548} y={806} size={15}>THROTTLE</Label>
            {pedalBar(548, 4, GREEN, 3, hexMix(bevel, "#0A0B14", 0.72))}
            <text x={590} y={968} fontSize={24} fontWeight={700} fill={GREEN} textAnchor="middle">62%</text>
            <Label x={1228} y={806} size={15}>BRAKE</Label>
            {pedalBar(1190, 1, RED, -3, hexMix(bevel, "#0A0B14", 0.72))}
            <text x={1230} y={968} fontSize={24} fontWeight={700} fill={RED} textAnchor="middle">8%</text>
          </g>
        </g>
      </svg>
    </div>
  );
}
