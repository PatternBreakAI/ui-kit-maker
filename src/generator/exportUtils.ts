import type { GenConfig, GenStateName, KitComponentId, KitDesign, KitSize, Shape } from "./model";
import { fontByName, STATE_NAMES, KIT_COMPONENTS, KIT_SLICEABLE, applyKitDesign, applyKitTextFill, effKitSize, kitVisible, resolveKitIcon } from "./model";
import { renderBevel, renderKit, glowPadOf } from "./bevel";
import { glyphAttribution } from "./glyphLibrary";

// Export utilities — every artifact derives from the same renderer string.

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function downloadSvg(svg: string, name: string) {
  download(name, new Blob([svg], { type: "image/svg+xml" }));
}

/* ── the REAL identity of a font blob (Unity field round, strike three on
   font weights): what a TTF claims in its filename or a manifest field is
   worthless — TextMeshPro renders the DEFAULT INSTANCE of whatever bytes
   arrive, so the only truth is in the tables. `variable` = an fvar table
   is aboard (TMP ignores its axes); `weight` = the weight that default
   instance actually renders at — fvar's wght default when variable, OS/2
   usWeightClass otherwise; null = not parseable as an sfnt. Every export
   road runs its bytes through here before trusting them. */
export function probeSfntWeight(bytes: Uint8Array): { variable: boolean; weight: number | null } {
  try {
    if (!bytes || bytes.length < 12) return { variable: false, weight: null };
    const be32 = (o: number) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
    const be16 = (o: number) => (bytes[o] << 8) | bytes[o + 1];
    const ver = be32(0);
    if (ver !== 0x00010000 && ver !== 0x4f54544f && ver !== 0x74727565) return { variable: false, weight: null };
    const n = be16(4);
    let os2 = -1, fvar = -1;
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      if (o + 16 > bytes.length) return { variable: false, weight: null };
      const tag = be32(o);
      if (tag === 0x4f532f32) os2 = be32(o + 8);
      else if (tag === 0x66766172) fvar = be32(o + 8);
    }
    if (fvar >= 0 && fvar + 16 <= bytes.length) {
      const axesOff = fvar + be16(fvar + 4);
      const axisCount = be16(fvar + 8);
      const axisSize = be16(fvar + 10);
      for (let a = 0; a < axisCount; a++) {
        const ao = axesOff + a * axisSize;
        if (ao + 20 > bytes.length) break;
        if (be32(ao) === 0x77676874) return { variable: true, weight: be32(ao + 8) >> 16 }; // 'wght' default, Fixed 16.16
      }
      return { variable: true, weight: os2 >= 0 && os2 + 6 <= bytes.length ? be16(os2 + 4) : null };
    }
    return { variable: false, weight: os2 >= 0 && os2 + 6 <= bytes.length ? be16(os2 + 4) : null };
  } catch {
    return { variable: false, weight: null };
  }
}

/* ── Google's own static-instance TTFs, addressed directly ─────────────
   fonts.gstatic.com answers CORS with * and serves anyone; only the CSS
   lookup that NAMES these files is UA-gated (a browser is handed woff2,
   and a page cannot change its UA — Chromium drops the override and the
   css2 preflight allows no headers). So the lookup is done ONCE, at bake
   time, by a client that can wear the legacy UA (node), and the results
   ship as data. The export still probes the bytes it receives — a stale
   entry falls through to the live roads instead of shipping a lie. */
export const GSTATIC_ORIGIN = "https://fonts.gstatic.com/";
/* BAKED-FONT-STATICS-BEGIN (generated 2026-08-27 by scripts/bake-font-statics.mjs — do not hand-edit) */
export const FONT_STATIC_TTF: Record<string, Record<number, string>> = {
 "Inter": {
  100: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyeMZg.ttf",
  200: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuDyfMZg.ttf",
  300: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuOKfMZg.ttf",
  400: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
  500: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
  600: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf",
  700: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf",
  800: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuDyYMZg.ttf",
  900: "s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuBWYMZg.ttf"
 },
 "Bangers": {
  400: "s/bangers/v25/FeVQS0BTqb0h60ACL5k.ttf"
 },
 "Luckiest Guy": {
  400: "s/luckiestguy/v25/_gP_1RrxsjcxVyin9l9n_j2RSg.ttf"
 },
 "Press Start 2P": {
  400: "s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK0nS.ttf"
 },
 "Bungee": {
  400: "s/bungee/v17/N0bU2SZBIuF2PU_ECg.ttf"
 },
 "Exo 2": {
  100: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8jvvOcPg.ttf",
  200: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8jPvKcPg.ttf",
  300: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8j4PKcPg.ttf",
  400: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8jvvKcPg.ttf",
  500: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8jjPKcPg.ttf",
  600: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8jYPWcPg.ttf",
  700: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8jWfWcPg.ttf",
  800: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8jPvWcPg.ttf",
  900: "s/exo2/v26/7cH1v4okm5zmbvwkAx_sfcEuiD8jF_WcPg.ttf"
 },
 "Saira": {
  100: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA71rDosg.ttf",
  200: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA79rCosg.ttf",
  300: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA7wTCosg.ttf",
  400: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA71rCosg.ttf",
  500: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA72jCosg.ttf",
  600: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA74TFosg.ttf",
  700: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA773Fosg.ttf",
  800: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA79rFosg.ttf",
  900: "s/saira/v23/memWYa2wxmKQyPMrZX79wwYZQMhsyuShhKMjjbU9uXuA7_PFosg.ttf"
 },
 "Righteous": {
  400: "s/righteous/v18/1cXxaUPXBpj2rGoU7C9mjw.ttf"
 },
 "Russo One": {
  400: "s/russoone/v18/Z9XUDmZRWg6M1LvRYsH-yA.ttf"
 },
 "Black Ops One": {
  400: "s/blackopsone/v21/qWcsB6-ypo7xBdr6Xshe96H3WDw.ttf"
 },
 "Fascinate": {
  400: "s/fascinate/v23/z7NWdRrufC8XJK0IIEli1A.ttf"
 },
 "Orbitron": {
  400: "s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyGy6xpg.ttf",
  500: "s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyKS6xpg.ttf",
  600: "s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyxSmxpg.ttf",
  700: "s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1ny_Cmxpg.ttf",
  800: "s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nymymxpg.ttf",
  900: "s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nysimxpg.ttf"
 },
 "Cinzel": {
  400: "s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnTYo.ttf",
  500: "s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-uTnTYo.ttf",
  600: "s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-gjgTYo.ttf",
  700: "s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-jHgTYo.ttf",
  800: "s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-lbgTYo.ttf",
  900: "s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-n_gTYo.ttf"
 },
 "Creepster": {
  400: "s/creepster/v13/AlZy_zVUqJz4yMrniH4hdQ.ttf"
 },
 "Titan One": {
  400: "s/titanone/v17/mFTzWbsGxbbS_J5cQcjykw.ttf"
 },
 "Lilita One": {
  400: "s/lilitaone/v17/i7dPIFZ9Zz-WBtRtedDbUEY.ttf"
 },
 "Chewy": {
  400: "s/chewy/v18/uK_94ruUb-k-wk5x.ttf"
 },
 "Baloo 2": {
  400: "s/baloo2/v23/wXK0E3kTposypRydzVT08TS3JnAmtdgazapv.ttf",
  500: "s/baloo2/v23/wXK0E3kTposypRydzVT08TS3JnAmtdgozapv.ttf",
  600: "s/baloo2/v23/wXK0E3kTposypRydzVT08TS3JnAmtdjEyqpv.ttf",
  700: "s/baloo2/v23/wXK0E3kTposypRydzVT08TS3JnAmtdj9yqpv.ttf",
  800: "s/baloo2/v23/wXK0E3kTposypRydzVT08TS3JnAmtdiayqpv.ttf"
 },
 "Fredoka": {
  300: "s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OryLMFg.ttf",
  400: "s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3O8SLMFg.ttf",
  500: "s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OwyLMFg.ttf",
  600: "s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OLyXMFg.ttf",
  700: "s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OFiXMFg.ttf"
 },
 "Passion One": {
  400: "s/passionone/v20/PbynFmL8HhTPqbjUzux3JHuW.ttf",
  700: "s/passionone/v20/Pby6FmL8HhTPqbjUzux3JEMq037o.ttf",
  900: "s/passionone/v20/Pby6FmL8HhTPqbjUzux3JEMS0X7o.ttf"
 },
 "Sigmar One": {
  400: "s/sigmarone/v20/co3DmWZ8kjZuErj9Ta3dk6M.ttf"
 },
 "Rubik Mono One": {
  400: "s/rubikmonoone/v20/UqyJK8kPP3hjw6ANTdfRk9YSN-8w.ttf"
 },
 "Audiowide": {
  400: "s/audiowide/v22/l7gdbjpo0cum0ckerWCtkQ.ttf"
 },
 "Silkscreen": {
  400: "s/silkscreen/v6/m8JXjfVPf62XiF7kO-i9ULQ.ttf",
  700: "s/silkscreen/v6/m8JUjfVPf62XiF7kO-i9aAhATms.ttf"
 },
 "Pixelify Sans": {
  400: "s/pixelifysans/v3/CHy2V-3HFUT7aC4iv1TxGDR9DHEserHN25py2TTp0H1Y.ttf",
  500: "s/pixelifysans/v3/CHy2V-3HFUT7aC4iv1TxGDR9DHEserHN25py2TTb0H1Y.ttf",
  600: "s/pixelifysans/v3/CHy2V-3HFUT7aC4iv1TxGDR9DHEserHN25py2TQ3131Y.ttf",
  700: "s/pixelifysans/v3/CHy2V-3HFUT7aC4iv1TxGDR9DHEserHN25py2TQO131Y.ttf"
 },
 "Shrikhand": {
  400: "s/shrikhand/v17/a8IbNovtLWfR7T7bMJwbBA.ttf"
 },
 "Concert One": {
  400: "s/concertone/v24/VEM1Ro9xs5PjtzCu-srDqRTl.ttf"
 },
 "Paytone One": {
  400: "s/paytoneone/v25/0nksC9P7MfYHj2oFtYm2CiTq.ttf"
 },
 "Alfa Slab One": {
  400: "s/alfaslabone/v21/6NUQ8FmMKwSEKjnm5-4v-4Jh6dU.ttf"
 },
 "Bowlby One SC": {
  400: "s/bowlbyonesc/v27/DtVlJxerQqQm37tzN3wMug9Pzgg.ttf"
 },
 "Modak": {
  400: "s/modak/v21/EJRYQgs1XtIEsnMH.ttf"
 },
 "Chango": {
  400: "s/chango/v29/2V0cKI0OB5U7WaJyzw.ttf"
 },
 "Boogaloo": {
  400: "s/boogaloo/v25/kmK-Zq45GAvOdnaW6x1F.ttf"
 },
 "Staatliches": {
  400: "s/staatliches/v15/HI_OiY8KO6hCsQSoAPmtMbec.ttf"
 },
 "Grandstander": {
  100: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQD1-_D3g.ttf",
  200: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQD9--D3g.ttf",
  300: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQDwG-D3g.ttf",
  400: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQD1--D3g.ttf",
  500: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQD22-D3g.ttf",
  600: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQD4G5D3g.ttf",
  700: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQD7i5D3g.ttf",
  800: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQD9-5D3g.ttf",
  900: "s/grandstander/v20/ga6fawtA-GpSsTWrnNHPCSIMZhhKpFjyNZIQD_a5D3g.ttf"
 },
 "New Rocker": {
  400: "s/newrocker/v17/MwQzbhjp3-HImzcCU_cJkGM.ttf"
 },
 "Grenze": {
  400: "s/grenze/v18/O4ZOFGb7hR12Bxqt9ErXQpCpkHScyovU2HA.ttf",
  700: "s/grenze/v18/O4ZOFGb7hR12Bxqt9ErXQpCpkHScymzT2HA.ttf"
 },
 "Pirata One": {
  400: "s/pirataone/v23/I_urMpiDvgLdLh0fAtoftig.ttf"
 },
 "Germania One": {
  400: "s/germaniaone/v21/Fh4yPjrqIyv2ucM2qzBjeS3ezA.ttf"
 },
 "Freckle Face": {
  400: "s/freckleface/v16/AMOWz4SXrmKHCvXTohxY-YI0Uw.ttf"
 },
 "Slackey": {
  400: "s/slackey/v29/N0bV2SdQO-5yM0-dKlQ.ttf"
 },
 "Hanalei Fill": {
  400: "s/hanaleifill/v23/fC1mPYtObGbfyQznIaQzPQiMVw.ttf"
 },
 "Monoton": {
  400: "s/monoton/v22/5h1aiZUrOngCibe4fkY.ttf"
 },
 "Michroma": {
  400: "s/michroma/v21/PN_zRfy9qWD8fEagAMg6.ttf"
 },
 "Bruno Ace": {
  400: "s/brunoace/v7/WwkcxPa2E06x4trkOj_kMA.ttf"
 },
 "Bakbak One": {
  400: "s/bakbakone/v11/zOL54pXAl6RI-p_ardnuycQ.ttf"
 },
 "ZCOOL QingKe HuangYou": {
  400: "s/zcoolqingkehuangyou/v16/2Eb5L_R5IXJEWhD3AOhSvFC554MOOahI4mRIiw.ttf"
 },
 "ZCOOL KuaiLe": {
  400: "s/zcoolkuaile/v22/tssqApdaRQokwFjFJjvM6h2Wpg.ttf"
 },
 "Ma Shan Zheng": {
  400: "s/mashanzheng/v18/NaPecZTRCLxvwo41b4gvzkXaRMQ.ttf"
 },
 "Zhi Mang Xing": {
  400: "s/zhimangxing/v19/f0Xw0ey79sErYFtWQ9a2rq-g0ac.ttf"
 },
 "Liu Jian Mao Cao": {
  400: "s/liujianmaocao/v24/845DNN84HJrccNonurqXILGpvCOofeo.ttf"
 },
 "Noto Sans SC": {
  400: "s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYw.ttf",
  500: "s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG-3FnYw.ttf",
  600: "s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaGwHCnYw.ttf",
  700: "s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaGzjCnYw.ttf",
  800: "s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG1_CnYw.ttf",
  900: "s/notosanssc/v40/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG3bCnYw.ttf"
 }
};
/* BAKED-FONT-STATICS-END */

/* ── minimal ZIP writer (STORE method, no compression, no dependency) ──
   Enough for asset packs: predictable folder paths, UTF-8 names, correct
   CRC-32 so Figma, Finder and Illustrator all open the archive cleanly. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files: { path: string; data: string | Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255]);
  const cat = (...parts: Uint8Array[]) => {
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  // real export time in DOS format — zeroed fields decode as Nov 30 1979,
  // which reads as a broken download in every file manager (owner report)
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = (Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.path);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name));
    chunks.push(local);
    offset += local.length;
  }
  const centralBlob = cat(...central);
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBlob.length), u32(offset), u16(0));
  return new Blob([...chunks, centralBlob, end].map((u) => u.buffer as ArrayBuffer), { type: "application/zip" });
}
export function downloadZip(name: string, files: { path: string; data: string | Uint8Array }[]) {
  download(name, makeZip(files));
}

/** The reader half of makeZip — parses a zip whose entries are STORED
    (method 0), which is exactly what makeZip writes. Exists for the
    admin desk's test-kit blessing (Gate Round): the owner's own engine
    export is opened, its LICENCE.txt swapped for the free-kit licence,
    and the whole thing re-packed with makeZip. Returns null for any zip
    with compressed entries — an honest refusal beats a silent
    corruption, and every zip this app writes parses clean. */
export function readStoredZip(bytes: Uint8Array): { path: string; data: Uint8Array }[] | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // end-of-central-directory: scan back over the (empty-comment) tail
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true);
  let at = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: { path: string; data: Uint8Array }[] = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || dv.getUint32(at, true) !== 0x02014b50) return null;
    const method = dv.getUint16(at + 10, true);
    const size = dv.getUint32(at + 20, true);
    const usize = dv.getUint32(at + 24, true);
    const nameLen = dv.getUint16(at + 28, true);
    const extraLen = dv.getUint16(at + 30, true);
    const commentLen = dv.getUint16(at + 32, true);
    const localAt = dv.getUint32(at + 42, true);
    if (method !== 0 || size !== usize) return null;
    const path = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    // the data offset comes from the LOCAL header's own name/extra lengths
    if (localAt + 30 > bytes.length || dv.getUint32(localAt, true) !== 0x04034b50) return null;
    const lName = dv.getUint16(localAt + 26, true);
    const lExtra = dv.getUint16(localAt + 28, true);
    const start = localAt + 30 + lName + lExtra;
    if (start + size > bytes.length) return null;
    out.push({ path, data: bytes.subarray(start, start + size) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* Fonts inside a rasterized SVG: an SVG loaded through an <img> is a SEALED
   document — it cannot see the page's loaded fonts, so any <text> silently
   falls back to a system face at raster time (field: the baked alphabet
   shipped skinny system glyphs wearing the full kit treatment; stamps carry
   the same risk). Register the kit's font bytes around an export and every
   rasterization embeds them as an inline @font-face. */
let embedFont: { family: string; b64: string } | null = null;
export function setEmbedFont(family: string, bytes: Uint8Array | null) {
  if (!bytes) { embedFont = null; return; }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  embedFont = { family, b64: btoa(bin) };
}

/* ── the WHITE-FRINGE cure at the bake end (Unity field round, 2026-08-26:
   the Shop scene's navy chips wore white specks on their edges). A canvas
   keeps its backing store PREMULTIPLIED, so toBlob writes RGB(0,0,0) under
   every alpha-0 pixel — and any engine that bilinear-samples or mip-averages
   across the edge blends toward that black (or toward whatever its own
   dilation guessed). The robust half of the cure is baked color truth:
   every fully-transparent pixel inherits the RGB of its NEAREST inked pixel
   (a two-pass chamfer nearest-feature transform — O(n), whole canvas), so
   edge filtering at ANY mip depth blends into the art's own color. Alpha
   never changes; pixels with any ink (alpha>0) never change — verified
   byte-exact against Chrome's own encoder by the slice-1 probe. Because
   toBlob would re-zero the dilated RGB, the PNG is encoded here, straight
   RGBA (Paeth + CompressionStream zlib); no CompressionStream → fall back
   to the browser encoder, undilated, and the export still ships. */
/** Flood the RGB of every fully-transparent pixel with its nearest inked
 *  pixel's RGB (chamfer 3-4 forward/backward passes). Alpha untouched;
 *  inked pixels untouched. Returns false when the image has no ink at all
 *  (nothing to inherit — left as-is). */
export function dilateTransparentRGB(d: Uint8ClampedArray, w: number, h: number): boolean {
  const n = w * h;
  const INF = 0x3fffffff;
  const dist = new Int32Array(n).fill(INF);
  const src = new Int32Array(n).fill(-1);
  let anyInk = false;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] > 0) { dist[i] = 0; src[i] = i; anyInk = true; }
  if (!anyInk) return false;
  // forward: left, up-left, up, up-right
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (dist[i] === 0) continue;
      let bd = dist[i], bs = src[i];
      if (x > 0 && dist[i - 1] + 3 < bd) { bd = dist[i - 1] + 3; bs = src[i - 1]; }
      if (y > 0) {
        const up = i - w;
        if (dist[up] + 3 < bd) { bd = dist[up] + 3; bs = src[up]; }
        if (x > 0 && dist[up - 1] + 4 < bd) { bd = dist[up - 1] + 4; bs = src[up - 1]; }
        if (x < w - 1 && dist[up + 1] + 4 < bd) { bd = dist[up + 1] + 4; bs = src[up + 1]; }
      }
      dist[i] = bd; src[i] = bs;
    }
  }
  // backward: right, down-right, down, down-left
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    for (let x = w - 1; x >= 0; x--) {
      const i = row + x;
      if (dist[i] === 0) continue;
      let bd = dist[i], bs = src[i];
      if (x < w - 1 && dist[i + 1] + 3 < bd) { bd = dist[i + 1] + 3; bs = src[i + 1]; }
      if (y < h - 1) {
        const dn = i + w;
        if (dist[dn] + 3 < bd) { bd = dist[dn] + 3; bs = src[dn]; }
        if (x < w - 1 && dist[dn + 1] + 4 < bd) { bd = dist[dn + 1] + 4; bs = src[dn + 1]; }
        if (x > 0 && dist[dn - 1] + 4 < bd) { bd = dist[dn - 1] + 4; bs = src[dn - 1]; }
      }
      dist[i] = bd; src[i] = bs;
    }
  }
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3] !== 0) continue; // only FULLY transparent pixels may change
    const s = src[i];
    if (s < 0 || s === i) continue;
    d[i * 4] = d[s * 4]; d[i * 4 + 1] = d[s * 4 + 1]; d[i * 4 + 2] = d[s * 4 + 2];
  }
  return true;
}

const deflateZlib = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** Encode straight (non-premultiplied) RGBA to PNG — the only road that
 *  keeps RGB under alpha-0, which toBlob's premultiplied backing zeroes. */
export async function encodePngStraight(d: Uint8ClampedArray, w: number, h: number): Promise<Uint8Array> {
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const ro = y * (stride + 1);
    raw[ro] = 4; // Paeth — the general-purpose filter, one pass
    const row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? d[row + x - 4] : 0;
      const b = y > 0 ? d[prev + x] : 0;
      const c = y > 0 && x >= 4 ? d[prev + x - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      raw[ro + 1 + x] = d[row + x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    }
  }
  const idat = await deflateZlib(raw);
  const be32 = (v: number) => new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
  const chunk = (tag: string, data: Uint8Array): Uint8Array[] => {
    const td = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) td[i] = tag.charCodeAt(i);
    td.set(data, 4);
    // crc32 is makeZip's own table — PNG and ZIP share the polynomial
    return [be32(data.length), td.subarray(0, 4), data, be32(crc32(td))];
  };
  const ihdr = new Uint8Array(13);
  ihdr.set(be32(w), 0); ihdr.set(be32(h), 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA; compression/filter/interlace 0
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunk("IHDR", ihdr), ...chunk("IDAT", idat), ...chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** A canvas' PNG bytes with the transparent-RGB dilation applied — the
 *  encoder every zip-bound raster road ends in. */
export async function canvasToPngBytesDilated(cv: HTMLCanvasElement): Promise<Uint8Array> {
  try {
    if (typeof CompressionStream === "undefined") throw new Error("no CompressionStream");
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    dilateTransparentRGB(id.data, cv.width, cv.height);
    return await encodePngStraight(id.data, cv.width, cv.height);
  } catch {
    /* the fringe cure must never kill an export — the browser's own encoder
       (undilated, today's exact bytes) is the fallback */
    return await new Promise<Uint8Array>((resolve, reject) => {
      cv.toBlob(async (b) => {
        if (!b) { reject(new Error("raster failed")); return; }
        resolve(new Uint8Array(await b.arrayBuffer()));
      }, "image/png");
    });
  }
}

/** Rasterize an SVG string to transparent PNG bytes at the given scale. */
export function svgToPngBytes(svg: string, scale = 2): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  if (embedFont && svg.includes("<text"))
    svg = svg.replace(/(<svg[^>]*>)/, `$1<style>@font-face{font-family:"${embedFont.family.replace(/"/g, "")}";src:url(data:font/ttf;base64,${embedFont.b64}) format("truetype");}</style>`);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.width * scale));
      cv.height = Math.max(1, Math.round(img.height * scale));
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      canvasToPngBytesDilated(cv)
        .then((bytes) => resolve({ bytes, w: cv.width, h: cv.height }))
        .catch(() => reject(new Error("raster failed")));
    };
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  });
}

/** The crop rectangle a tight raster kept, in pre-crop frame coordinates —
 *  the bridge between "where a border sits in the shipped sprite" and
 *  "where it sits in the SVG frame". */
export type CropBox = { x0: number; y0: number; x1: number; y1: number };

/** Rasterize an SVG string to PNG bytes cropped to the art's alpha bounding
 *  box (+margin). Nine-slice sprites must hug their geometry: transparent
 *  canvas padding inside a sliced sprite becomes stretched dead air in every
 *  engine, and borders wide enough to span the pad can exceed the component's
 *  own size — Unity then draws caps of pure padding and no center at all. */
export async function svgToPngBytesTight(svg: string, scale = 2, margin = 4): Promise<{ bytes: Uint8Array; w: number; h: number; box?: CropBox }> {
  const full = await svgToPngBytes(svg, scale);
  const img = await createImageBitmap(new Blob([full.bytes.buffer as ArrayBuffer], { type: "image/png" }));
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let yy = 0; yy < cv.height; yy++) {
    for (let xx = 0; xx < cv.width; xx++) {
      if (px[(yy * cv.width + xx) * 4 + 3] > 8) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy;
        if (yy > y1) y1 = yy;
      }
    }
  }
  if (x1 < 0) return full; // nothing opaque — keep the full canvas
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin);
  x1 = Math.min(cv.width - 1, x1 + margin); y1 = Math.min(cv.height - 1, y1 + margin);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = document.createElement("canvas");
  out.width = cw; out.height = ch;
  out.getContext("2d")!.drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
  // the crop re-drew through the premultiplied backing — re-dilate on encode
  const bytes = await canvasToPngBytesDilated(out);
  return { bytes, w: cw, h: ch, box: { x0, y0, x1, y1 } };
}

/** The alpha bounding box of an SVG's raster, in frame coordinates —
 *  no crop, no margin. Threshold matches the slicing workbench's (>40),
 *  so a caller can locate the workbench's editing frame inside a bigger
 *  export crop and translate hand-set borders between the two. */
export async function svgAlphaBox(svg: string, scale = 2, threshold = 40): Promise<CropBox | null> {
  const full = await svgToPngBytes(svg, scale);
  const img = await createImageBitmap(new Blob([full.bytes.buffer as ArrayBuffer], { type: "image/png" }));
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let yy = 0; yy < cv.height; yy++)
    for (let xx = 0; xx < cv.width; xx++)
      if (px[(yy * cv.width + xx) * 4 + 3] > threshold) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy;
        if (yy > y1) y1 = yy;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Rasterize several SVGs sharing ONE canvas geometry (a component's rest +
 *  hover/pressed/disabled renders) and crop them all to the UNION of their
 *  alpha boxes (+margin). Sprite-swap variants must agree on coordinates:
 *  cropped each to its own ink, a pressed state that sinks (shorter art)
 *  loses its empty sky and the engine stretches it back over the same rect,
 *  cancelling the sink — and any per-state ink difference becomes a visible
 *  jump on swap. */
export async function svgsToPngBytesTightUnion(svgs: string[], scale = 2, margin = 4): Promise<{ bytes: Uint8Array; w: number; h: number; box?: CropBox }[]> {
  const canvases: HTMLCanvasElement[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const svg of svgs) {
    const full = await svgToPngBytes(svg, scale);
    const img = await createImageBitmap(new Blob([full.bytes.buffer as ArrayBuffer], { type: "image/png" }));
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    canvases.push(cv);
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    for (let yy = 0; yy < cv.height; yy++)
      for (let xx = 0; xx < cv.width; xx++)
        if (px[(yy * cv.width + xx) * 4 + 3] > 8) {
          if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
          if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
        }
  }
  const encode = async (cv: HTMLCanvasElement, sx: number, sy: number, cw: number, ch: number): Promise<{ bytes: Uint8Array; w: number; h: number; box?: CropBox }> => {
    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    out.getContext("2d")!.drawImage(cv, sx, sy, cw, ch, 0, 0, cw, ch);
    const bytes = await canvasToPngBytesDilated(out);
    return { bytes, w: cw, h: ch, box: { x0: sx, y0: sy, x1: sx + cw - 1, y1: sy + ch - 1 } };
  };
  if (x1 < 0) return Promise.all(canvases.map((cv) => encode(cv, 0, 0, cv.width, cv.height)));
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin);
  // raster rounding can vary canvas sizes by a pixel — clamp per canvas
  return Promise.all(canvases.map((cv) => {
    const X1 = Math.min(cv.width - 1, x1 + margin), Y1 = Math.min(cv.height - 1, y1 + margin);
    return encode(cv, x0, y0, X1 - x0 + 1, Y1 - y0 + 1);
  }));
}

/** Rasterize an SVG string to a transparent PNG at the given scale. */
export function downloadPng(svg: string, name: string, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.width * scale; cv.height = img.height * scale;
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => { if (b) { download(name, b); resolve(); } else reject(new Error("raster failed")); }, "image/png");
    };
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  });
}

/** Self-contained HTML page: the button in every visible state, rendered by
 *  the exact same engine as the canvas. Opens locally with a double-click. */
/* ── labeled PNG sprite sheet ─────────────────────────────────────
   Every asset rasterized at 2x onto one transparent canvas, name labels
   beneath, kit title on top. The display face is embedded into each SVG
   as a data-URI @font-face so sprite text rasterizes true. */

const FONT_CACHE = new Map<string, string | null>();

/** Trim most of a render's glow reserve so sprites pack tight. */
function cropSheetPad(svg: string, keep = 0.3): string {
  // CSS drop-shadow style filters mis-rasterize in image context (solid
  // blocks) — sheet sprites ship without them
  svg = svg.replace(/ style="filter:[^"]*"/g, "");
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

/** Resolve a Google face to a base64 woff2 data URI (cached; null on failure). */
/** Fetch with a deadline. An export must never wait on the network
    forever — a stalled request used to leave the button reading
    "Working…" with no way back except a reload. */
function fetchDeadline(url: string, ms = 8000): Promise<Response> {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return fetch(url, { signal: (AbortSignal as { timeout(n: number): AbortSignal }).timeout(ms) });
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
}

/** Inline the kit's display face into a text-bearing SVG string. Rasterized
 *  SVGs are sealed documents and downloaded singles open outside the app —
 *  both silently fall back to a system face without this (owner report: the
 *  top-bar PNG export baked EQUIP in a fallback font). Caller-supplied TTF
 *  bytes win (the engine pipeline's google/fonts fetch); otherwise the
 *  Google woff2 route the sprite sheet uses; a miss returns the SVG
 *  untouched so the export never blocks on the network. */
export async function inlineKitFace(svg: string, family: string, cssQuery: string | null, ttfBytes?: Uint8Array | null): Promise<string> {
  if (!family || !svg.includes("<text")) return svg;
  let src: string | null = null;
  if (ttfBytes && ttfBytes.length) {
    let bin = "";
    for (let i = 0; i < ttfBytes.length; i += 0x8000)
      bin += String.fromCharCode(...ttfBytes.subarray(i, Math.min(i + 0x8000, ttfBytes.length)));
    src = `url(data:font/ttf;base64,${btoa(bin)}) format("truetype")`;
  } else {
    const uri = await fontDataUri(family, cssQuery);
    if (uri) src = `url(${uri}) format("woff2")`;
  }
  if (!src) return svg;
  return svg.replace(/(<svg[^>]*>)/, `$1<style>@font-face{font-family:"${family.replace(/"/g, "")}";src:${src};}</style>`);
}

export async function fontDataUri(family: string, cssQuery: string | null): Promise<string | null> {
  if (FONT_CACHE.has(family)) return FONT_CACHE.get(family) ?? null;
  let uri: string | null = null;
  try {
    if (cssQuery) {
      const css = await (await fetchDeadline(`https://fonts.googleapis.com/css2?family=${cssQuery}&display=swap`)).text();
      /* css2 emits one @font-face per script subset, and only the latin
         block (unicode-range opening at U+0000) is guaranteed to carry A-Z.
         Grabbing the FIRST woff2 was a per-family lottery: Grandstander and
         Grenze lead with vietnamese, Pixelify Sans with cyrillic — an embed
         of those files loads fine and then renders NOTHING, so every glyph
         silently falls back to a system face (owner: warped stamps "still
         not rendering the correct font" while Bruno Ace kits passed). */
      const blocks = css.split("@font-face").slice(1);
      const latin = blocks.find((b) => /unicode-range:[^;}]*U\+0000/i.test(b)) ?? blocks[0] ?? "";
      const m = /url\((https:[^)]+\.woff2)\)/.exec(latin) ?? /url\((https:[^)]+\.woff2)\)/.exec(css);
      if (m) {
        const buf = await (await fetchDeadline(m[1])).arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        uri = `data:font/woff2;base64,${btoa(bin)}`;
      }
    }
  } catch { uri = null; }
  /* cache hits and structural misses (no css to fetch) — but never a FAILED
     fetch: one flaky request must not pin a family to the fallback face for
     the whole session */
  if (uri || !cssQuery) FONT_CACHE.set(family, uri);
  return uri;
}

export async function buildSpriteSheetBytes(
  entries: { name: string; svg: string }[],
  title: string,
  fontFamily: string,
  fontCss: string | null,
  onStep?: (done: number, total: number) => void,
): Promise<Uint8Array | null> {
  const fontUri = await fontDataUri(fontFamily, fontCss);
  const faceCss = fontUri ? `<defs><style>@font-face{font-family:'${fontFamily}';src:url(${fontUri}) format('woff2');}</style></defs>` : "";
  /* the catalogue is the export's silent long pole (dev field report: "it
     hung mostly during Packing the visual catalogue") — every finished
     entry reports, so the bar keeps moving through the whole pack */
  let stepped = 0;
  const step = () => onStep?.(++stepped, entries.length);
  const imgs = await Promise.all(entries.map((e) => new Promise<{ name: string; img: HTMLImageElement; w: number; h: number } | null>((resolve) => {
    const cropped = cropSheetPad(e.svg);
    const svg = faceCss ? cropped.replace(/(<svg[^>]*>)/, `$1${faceCss}`) : cropped;
    const w = +(/width="([\d.]+)"/.exec(svg)?.[1] ?? 200);
    const h = +(/height="([\d.]+)"/.exec(svg)?.[1] ?? 100);
    const img = new Image();
    img.onload = () => { step(); resolve({ name: e.name, img, w, h }); };
    img.onerror = () => { step(); resolve(null); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  })));
  const ok = imgs.filter((x): x is NonNullable<typeof x> => !!x);
  /* pack rows into a 2560-wide sheet — up to 2x, capped so no sprite
     dominates a row and the sheet stays a sane length */
  const SHEET_W = 2560, PAD = 28, LABEL = 44, HEADER = 96;
  type Placed = { name: string; img: HTMLImageElement; x: number; y: number; w: number; h: number };
  const placed: Placed[] = [];
  let x = PAD, y = HEADER, rowH = 0;
  for (const it of ok) {
    const S = Math.min(2, 430 / it.h, 1400 / it.w);
    const w = Math.round(it.w * S), h = Math.round(it.h * S);
    if (x + w + PAD > SHEET_W && x > PAD) { x = PAD; y += rowH + LABEL + PAD; rowH = 0; }
    placed.push({ name: it.name, img: it.img, x, y, w, h });
    rowH = Math.max(rowH, h);
    x += w + PAD;
  }
  const SHEET_H = y + rowH + LABEL + PAD;
  const cv = document.createElement("canvas");
  cv.width = SHEET_W; cv.height = SHEET_H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8b93a3";
  ctx.font = "700 34px Inter, sans-serif";
  ctx.fillText(title, PAD, 54);
  ctx.font = "500 20px Inter, sans-serif";
  ctx.fillText(`${ok.length} assets · rendered live from the kit · @2x`, PAD, 82);
  ctx.textAlign = "center";
  for (const pl of placed) {
    ctx.drawImage(pl.img, pl.x, pl.y, pl.w, pl.h);
    ctx.fillStyle = "#8b93a3";
    ctx.font = "600 19px Inter, sans-serif";
    ctx.fillText(pl.name.toUpperCase(), pl.x + pl.w / 2, pl.y + pl.h + 30, pl.w + PAD);
  }
  // the catalog ships in the zip (atlas/catalog.png) — same dilated road
  return await canvasToPngBytesDilated(cv).catch(() => null);
}

/** The packed sheet stays available as a VISUAL CATALOG download. */
export async function downloadSpriteSheet(
  entries: { name: string; svg: string }[],
  title: string,
  fontFamily: string,
  fontCss: string | null,
): Promise<void> {
  const bytes = await buildSpriteSheetBytes(entries, title, fontFamily, fontCss);
  if (bytes) download("kit-sprite-sheet.png", new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" }));
}

export function buildHtml(cfg: GenConfig): string {
  const font = fontByName(cfg.type.font);
  const fontLink = font.css
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.css}&display=swap">`
    : "";
  const states = STATE_NAMES.filter(
    (s) => s === "default" || cfg.visible[s as Exclude<GenStateName, "default">]
  );
  const cap: Record<GenStateName, string> = { default: "Default", hover: "Hover", pressed: "Pressed", disabled: "Disabled" };
  const dark = cfg.canvas === "#1C1D22" || cfg.canvas === "#000000";
  const ink = dark ? "rgba(235,238,255,0.6)" : "rgba(28,32,44,0.55)";
  const cards = states.map((s) =>
    `<figure><div class="art">${renderBevel(cfg, s)}</div><figcaption>${cap[s]}</figcaption></figure>`
  ).join("\n");
  const label = (cfg.content.label || "component").replace(/[<>&"]/g, "");

  // live, playable button — CSS swaps the pre-rendered state art
  const hasHover = cfg.visible.hover, hasPressed = cfg.visible.pressed;
  const live = `<div class="live" role="button" tabindex="0" aria-label="${label}">
  <span class="s s-default">${renderBevel(cfg, "default")}</span>
  ${hasHover ? `<span class="s s-hover">${renderBevel(cfg, "hover")}</span>` : ""}
  ${hasPressed ? `<span class="s s-pressed">${renderBevel(cfg, "pressed")}</span>` : ""}
</div>`;
  const liveCss = `
  .live { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .live .s { display: none; }
  .live .s-default { display: block; }
  ${hasHover ? `.live:hover .s-default { display: none; } .live:hover .s-hover { display: block; }` : ""}
  ${hasPressed ? `.live:active .s-default, .live:active .s-hover { display: none; } .live:active .s-pressed { display: block; }` : ""}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label} — UI Kit Maker</title>
${fontLink}
<style>
  * { margin: 0; box-sizing: border-box; }
  body { min-height: 100vh; background: ${cfg.canvas}; font-family: system-ui, sans-serif;
         display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; padding: 48px 24px; }
  .row { display: flex; flex-wrap: wrap; gap: 30px; align-items: flex-end; justify-content: center; }
  figure { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  figcaption { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: ${ink}; }
  .art svg, .live svg { display: block; }
  .try { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: ${ink}; }
  footer { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${ink}; opacity: 0.7; }
${liveCss}
</style>
</head>
<body>
${live}
<div class="try">↑ try me — hover &amp; press</div>
<div class="row">
${cards}
</div>
<footer>Made with UI Kit Maker · PatternBreak</footer>
</body>
</html>`;
}

export function downloadHtml(cfg: GenConfig, name: string) {
  download(name, new Blob([buildHtml(cfg)], { type: "text/html" }));
}

/* ── the WEB KIT — the whole kit as a drop-in zip ──────────────────────
   The single-file HTML export was one button and a promise; this is the
   artifact the front door describes: every released piece of the kit as
   baked 2x PNG assets, a kit.css of ready classes (state swaps on
   :hover/:active/[disabled], and true nine-slice border-image "--fluid"
   variants for the stretchable families), and an index.html showcase.
   BAKED OUTPUT ONLY — pixels, styles and a licence; the generator stays
   home. Fonts are inlined before rastering, so the zip needs no network
   and no font files. */
export interface WebKitState {
  cfg: GenConfig;
  kitDesigns?: Partial<Record<KitComponentId, KitDesign>>;
  kitTextFill?: Partial<Record<KitComponentId, string | null>>;
  kitShapes?: Partial<Record<KitComponentId, Shape>>;
  kitSizes?: Partial<Record<KitComponentId, KitSize | null>>;
  kitLabels?: Partial<Record<KitComponentId, string | null>>;
  /** Text-less flag — maps to label:"" here so the pack can't resurrect
      stock words on a piece the maker made wordless. */
  kitNoText?: Partial<Record<KitComponentId, boolean>>;
  kitIcons?: Partial<Record<KitComponentId, unknown>>;
  kitVals?: Partial<Record<KitComponentId, number>>;
  releases?: Record<string, string>;
  kitName?: string | null;
}

export async function downloadWebKit(
  st: WebKitState,
  licence?: string,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<void> {
  const { cfg } = st;
  const kitName = (st.kitName || "UI Kit").trim() || "UI Kit";
  const stripLoops = (svg: string) => svg
    .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, "")
    .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, "");
  const pieces = KIT_COMPONENTS.filter((c) => kitVisible(c.id, (st.releases ?? {}) as never, false));
  const files: { path: string; data: string | Uint8Array }[] = [];
  const cssRules: string[] = [];
  const cards: string[] = [];
  const fluidCards: string[] = [];
  const stamp = new Date().toISOString().slice(0, 10);
  const header = (comment: [string, string]) =>
    `${comment[0]} ${kitName} — made with UI Kit Maker · uikitmaker.com · ${stamp}\n` +
    `${comment[0]} Licensed to the exporting account — see LICENCE.txt ${comment[1]}\n`;

  const total = pieces.length;
  let done = 0;
  const shippedIds: string[] = []; // pieces whose art actually landed in the zip
  for (const pc of pieces) {
    const id = pc.id;
    onProgress?.(done++, total, pc.name);
    const cfgP = applyKitTextFill(applyKitDesign(cfg, st.kitDesigns?.[id]), st.kitTextFill?.[id]);
    const states: GenStateName[] = (["default", "hover", "pressed", "disabled"] as GenStateName[])
      .filter((s) => s === "default" || cfgP.visible[s as Exclude<GenStateName, "default">]);
    let w0 = 0, h0 = 0;
    let defaultBytes: Uint8Array | null = null;
    let ok = true;
    for (const state of states) {
      try {
        const svg = stripLoops(renderKit(
          cfgP, id, effKitSize(st.kitSizes?.[id] ?? undefined), state, st.kitVals?.[id], st.kitShapes?.[id],
          { label: st.kitNoText?.[id] ? "" : (st.kitLabels?.[id] ?? undefined), icon: resolveKitIcon(st.kitIcons?.[id] as never, undefined) },
        ));
        const fd = fontByName(cfgP.type.font);
        const svgK = await inlineKitFace(svg, cfgP.type.font, fd.name === cfgP.type.font ? fd.css ?? null : null);
        const { bytes, w, h } = await svgToPngBytes(svgK, 2);
        files.push({ path: `assets/${id}-${state}.png`, data: bytes });
        if (state === "default") { w0 = w; h0 = h; defaultBytes = bytes; }
      } catch {
        // a piece that fails to render must not sink the zip — skip it
        // loudly in the README count instead
        ok = false;
        break;
      }
    }
    if (!ok || !w0) continue;
    shippedIds.push(id);
    const dw = Math.round(w0 / 2), dh = Math.round(h0 / 2);
    const has = (s: GenStateName) => states.includes(s);
    cssRules.push(
      `.uik-${id} { display: inline-block; border: 0; padding: 0; width: ${dw}px; height: ${dh}px;` +
      ` background: url(assets/${id}-default.png) center / contain no-repeat; cursor: pointer; -webkit-tap-highlight-color: transparent; }` +
      (has("hover") ? `\n.uik-${id}:hover { background-image: url(assets/${id}-hover.png); }` : "") +
      (has("pressed") ? `\n.uik-${id}:active { background-image: url(assets/${id}-pressed.png); }` : "") +
      (has("disabled") ? `\n.uik-${id}[disabled], .uik-${id}.is-disabled { background-image: url(assets/${id}-disabled.png); cursor: default; }` : ""));
    cards.push(`<figure><button class="uik-${id}" aria-label="${pc.name}"></button><figcaption>${pc.name}</figcaption></figure>`);

    /* the stretchable families additionally ship a --fluid class: true
       nine-slice via border-image, measured from the baked pixels — the
       same caps-stay-crisp behavior the engine export gives Unity */
    if (KIT_SLICEABLE[id] && defaultBytes) {
      try {
        const bmp = await createImageBitmap(new Blob([defaultBytes.buffer as ArrayBuffer], { type: "image/png" }));
        const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w0, h0) : Object.assign(document.createElement("canvas"), { width: w0, height: h0 });
        const cx = cv.getContext("2d") as CanvasRenderingContext2D;
        cx.drawImage(bmp, 0, 0);
        const sl = measureSliceRGBA(cx.getImageData(0, 0, w0, h0).data, w0, h0, 2);
        if (sl) {
          const bw = `${Math.round(sl.top / 2)}px ${Math.round(sl.right / 2)}px ${Math.round(sl.bottom / 2)}px ${Math.round(sl.left / 2)}px`;
          const slice = `${Math.round(sl.top)} ${Math.round(sl.right)} ${Math.round(sl.bottom)} ${Math.round(sl.left)}`;
          cssRules.push(
            `.uik-${id}--fluid { display: inline-block; border-style: solid; border-width: ${bw};` +
            ` border-image: url(assets/${id}-default.png) ${slice} fill stretch; background: none; padding: 0;` +
            ` width: ${dw + 90}px; height: ${dh}px; cursor: pointer; }` +
            (has("hover") ? `\n.uik-${id}--fluid:hover { border-image-source: url(assets/${id}-hover.png); }` : "") +
            (has("pressed") ? `\n.uik-${id}--fluid:active { border-image-source: url(assets/${id}-pressed.png); }` : "") +
            (has("disabled") ? `\n.uik-${id}--fluid[disabled] { border-image-source: url(assets/${id}-disabled.png); cursor: default; }` : ""));
          fluidCards.push(`<figure><button class="uik-${id}--fluid" aria-label="${pc.name} (fluid)"></button><figcaption>${pc.name} · stretched</figcaption></figure>`);
        }
      } catch { /* fluid variant is a bonus — the fixed class already shipped */ }
    }
  }
  onProgress?.(total, total, "writing the zip");

  const dark = isDarkBgHex(cfg.canvas);
  const ink = dark ? "rgba(235,238,255,0.62)" : "rgba(28,32,44,0.6)";
  files.push({ path: "kit.css", data: header(["/*", "*/"]) + cssRules.join("\n") + "\n" });
  files.push({
    path: "index.html",
    data: `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
      header(["<!--", "-->"]) +
      `<title>${kitName} — web kit</title>\n<link rel="stylesheet" href="kit.css">\n<style>\n` +
      `  * { margin: 0; box-sizing: border-box; }\n` +
      `  body { min-height: 100vh; background: ${cfg.canvas}; font-family: system-ui, sans-serif; padding: 44px 28px 64px; }\n` +
      `  h1 { font-size: 19px; color: ${dark ? "#EBEEFF" : "#1C202C"}; margin-bottom: 4px; }\n` +
      `  .hint { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: ${ink}; margin-bottom: 30px; }\n` +
      `  h2 { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: ${ink}; margin: 34px 0 16px; }\n` +
      `  .grid { display: flex; flex-wrap: wrap; gap: 26px; align-items: flex-end; }\n` +
      `  figure { display: flex; flex-direction: column; align-items: center; gap: 7px; max-width: 100%; }\n` +
      `  figure > * { max-width: 100%; }\n` +
      `  figcaption { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: ${ink}; }\n` +
      `  footer { margin-top: 44px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: ${ink}; opacity: .75; }\n` +
      `</style>\n</head>\n<body>\n<h1>${kitName}</h1>\n<div class="hint">every piece is live — hover and press · classes in kit.css · assets are 2× PNG</div>\n` +
      `<div class="grid">\n${cards.join("\n")}\n</div>\n` +
      (fluidCards.length ? `<h2>Fluid — nine-slice border-image, stretch to any width</h2>\n<div class="grid">\n${fluidCards.join("\n")}\n</div>\n` : "") +
      `<footer>Made with UI Kit Maker · PatternBreak · see LICENCE.txt</footer>\n</body>\n</html>\n`,
  });
  files.push({
    path: "LICENCE.txt",
    /* CC BY attribution travels with the art: when the zip actually ships
       glyph pieces built on game-icons.net outlines, their credit block
       rides the licence file — absent otherwise (compliance, per-export). */
    data: (licence ?? `${kitName} — exported from UI Kit Maker (uikitmaker.com) on ${stamp}.\nLicensed to the exporting account for use in its projects.\n`)
      + glyphAttribution(shippedIds),
  });
  files.push({
    path: "README.md",
    data: `# ${kitName} — web kit\n\nDrop \`kit.css\` and \`assets/\` into your project and use the classes:\n\n` +
      "```html\n<link rel=\"stylesheet\" href=\"kit.css\">\n<button class=\"uik-primary\" aria-label=\"Play\"></button>\n```\n\n" +
      `Every class swaps its baked art on hover / press / disabled. The \`--fluid\` variants use nine-slice border-image — set any width and the caps stay crisp.\n` +
      `Assets are 2× PNG with the piece's glow padding included; the words are baked into the art (re-export from uikitmaker.com to change them).\n` +
      `${pieces.length} pieces shipped. Open \`index.html\` to see everything live.\n`,
  });
  download(`${kitName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ui-kit"}-web.zip`, makeZip(files));
}

// two hexes were the old hardcode; parse the luma instead so any canvas
// gets readable captions
function isDarkBgHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** Full settings as a portable JSON file — re-importable, and shareable as a
 *  new default. */
export function downloadSettings(cfg: GenConfig, workspace?: Record<string, unknown>) {
  /* the settings file is the COMPLETE document now: the master cfg at the
     top level (so older builds still import it), plus the workspace — piece
     forks, shapes, icon swaps, labels, nudges — under __workspace. Without
     it, a "settings" file silently dropped every focused-piece edit. */
  const doc = workspace ? { ...cfg, __workspace: workspace } : cfg;
  download("ui-generator-settings.json", new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
}

/* ── GROUND-TRUTH SLICE MEASUREMENT ──────────────────────────────────
   Walk each edge's silhouette profile to where it flattens against its
   extreme — that is where curvature ends — and pad. Works on raw RGBA;
   shape-, extrusion- and kit-agnostic. Shared by the engine zip AND the
   gamekit sheet so no export path guesses borders (Jimi's field notes,
   then his actual export: the formula's uniform caps landed in the
   transparent padding, leaving the pill's rounded caps inside the
   stretchable bands). Returns null when there's too little silhouette
   to trust — callers keep their formula as the fallback. */
export function measureSliceRGBA(
  d: Uint8ClampedArray, w: number, h: number, scale: number,
): { left: number; right: number; top: number; bottom: number } | null {
  try {
    const pad = Math.round(3 * scale);
    const solid = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 40;
    const topAt = new Int32Array(w).fill(-1), botAt = new Int32Array(w).fill(-1);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) if (solid(x, y)) { topAt[x] = y; break; }
      for (let y = h - 1; y >= 0; y--) if (solid(x, y)) { botAt[x] = y; break; }
    }
    const cols: number[] = [];
    for (let x = 0; x < w; x++) if (topAt[x] >= 0) cols.push(x);
    if (cols.length < 8) return null;
    const cx0 = cols[0], cx1 = cols[cols.length - 1];
    let yTop = h, yBot = -1;
    for (const x of cols) { if (topAt[x] < yTop) yTop = topAt[x]; if (botAt[x] > yBot) yBot = botAt[x]; }
    const leftAt = new Int32Array(h).fill(-1), rightAt = new Int32Array(h).fill(-1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (solid(x, y)) { leftAt[y] = x; break; }
      for (let x = w - 1; x >= 0; x--) if (solid(x, y)) { rightAt[y] = x; break; }
    }
    const rows: number[] = [];
    for (let y = 0; y < h; y++) if (leftAt[y] >= 0) rows.push(y);
    if (rows.length < 8) return null;
    const ry0 = rows[0], ry1 = rows[rows.length - 1];
    const T = 2 * scale; // close enough to the extreme = flat
    let tl = cx0; while (tl <= cx1 && (topAt[tl] < 0 || topAt[tl] > yTop + T)) tl++;
    let tr = cx1; while (tr >= cx0 && (topAt[tr] < 0 || topAt[tr] > yTop + T)) tr--;
    let bl = cx0; while (bl <= cx1 && (botAt[bl] < 0 || botAt[bl] < yBot - T)) bl++;
    let br = cx1; while (br >= cx0 && (botAt[br] < 0 || botAt[br] < yBot - T)) br--;
    let lt = ry0; while (lt <= ry1 && (leftAt[lt] < 0 || leftAt[lt] > cx0 + T)) lt++;
    let lb = ry1; while (lb >= ry0 && (leftAt[lb] < 0 || leftAt[lb] > cx0 + T)) lb--;
    let rt2 = ry0; while (rt2 <= ry1 && (rightAt[rt2] < 0 || rightAt[rt2] < cx1 - T)) rt2++;
    let rb = ry1; while (rb >= ry0 && (rightAt[rb] < 0 || rightAt[rb] < cx1 - T)) rb--;
    /* EDGE GEOMETRY the corner walk cannot see: a notch, tail or taper cut
       INTO an edge (the header's swallowtail) leaves the NEIGHBORING edges
       perfectly flat to the very corner — left/right measured ~0 while the
       notch sat mid-stretch and tore into a ghost outline the moment the
       sprite stretched (owner, tiled-face banner in Unity). When the walk
       saw almost none of an edge's real depth (under a third), its number
       is degenerate — trust the edge profile's own deepest inset instead,
       so the whole cut lands inside a cap. Shapes the walk already
       measures honestly (pills, rounded rects, panels, pointer tabs) sit
       far from the factor-3 line and keep their numbers byte-identical. */
    let lIn = 0, rIn = 0;
    for (const y of rows) {
      if (leftAt[y] - cx0 > lIn) lIn = leftAt[y] - cx0;
      if (cx1 - rightAt[y] > rIn) rIn = cx1 - rightAt[y];
    }
    let tIn = 0, bIn = 0;
    for (const x of cols) {
      if (topAt[x] - yTop > tIn) tIn = topAt[x] - yTop;
      if (yBot - botAt[x] > bIn) bIn = yBot - botAt[x];
    }
    const degenerate = (corner: number, inset: number) => inset > corner * 3 + 6 * scale;
    let left = Math.max(tl, bl);
    if (degenerate(left, cx0 + lIn)) left = cx0 + lIn;
    let right = w - 1 - Math.min(tr, br);
    if (degenerate(right, w - 1 - cx1 + rIn)) right = w - 1 - cx1 + rIn;
    let top = Math.max(lt, rt2);
    if (degenerate(top, yTop + tIn)) top = yTop + tIn;
    let bottom = h - 1 - Math.min(lb, rb);
    if (degenerate(bottom, h - 1 - yBot + bIn)) bottom = h - 1 - yBot + bIn;
    return {
      left: left + pad,
      right: right + pad,
      top: top + pad,
      bottom: bottom + pad,
    };
  } catch { return null; }
}

/** The clamp the measurement always rides with: caps never eat more than a
 *  quarter of the width / 30% of the height per side, and a real center
 *  strip always survives — engines render nothing without one. */
export function clampSlice(
  s: { left: number; right: number; top: number; bottom: number }, w: number, h: number,
): void {
  const maxLR = Math.floor(w * 0.25), maxTB = Math.floor(h * 0.3);
  if (s.left > maxLR) s.left = maxLR;
  if (s.right > maxLR) s.right = maxLR;
  if (s.top > maxTB) s.top = maxTB;
  if (s.bottom > maxTB) s.bottom = maxTB;
  const fx = (w - 12) / (s.left + s.right), fy = (h - 12) / (s.top + s.bottom);
  if (fx < 1) { s.left = Math.max(1, Math.floor(s.left * fx)); s.right = Math.max(1, Math.floor(s.right * fx)); }
  if (fy < 1) { s.top = Math.max(1, Math.floor(s.top * fy)); s.bottom = Math.max(1, Math.floor(s.bottom * fy)); }
}

/** Game-engine kit: one sprite sheet PNG @2x (states stacked vertically) plus
 *  a JSON manifest with per-state rects and suggested 9-slice insets — the
 *  shape Unity's Sprite Editor and Unreal's UMG box-draw both ingest. */
/** The licence block is issued by /api/export and travels with the kit —
    it names the account the files belong to, so a leaked bundle is
    traceable. Call sites reach this through guardedExport, never directly. */
export async function downloadGameKit(cfg: GenConfig, licence?: string): Promise<void> {
  const scale = 2;
  const states = STATE_NAMES.filter(
    (s) => s === "default" || cfg.visible[s as Exclude<GenStateName, "default">]
  );
  const loaded = await Promise.all(states.map((s) => new Promise<{ s: GenStateName; img: HTMLImageElement }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ s, img });
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(renderBevel(cfg, s))));
  })));
  const w = Math.max(...loaded.map((l) => l.img.width)) * scale;
  const heights = loaded.map((l) => l.img.height * scale);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = heights.reduce((a, b) => a + b, 0);
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const rects: { name: GenStateName; x: number; y: number; width: number; height: number }[] = [];
  let yy = 0;
  loaded.forEach((l, i) => {
    const sw = l.img.width * scale, sh = heights[i];
    ctx.drawImage(l.img, Math.round((w - sw) / 2), yy, sw, sh);
    rects.push({ name: l.s, x: Math.round((w - sw) / 2), y: yy, width: sw, height: sh });
    yy += sh;
  });
  /* borders come from the PIXELS, not a formula: Jimi's real export showed
     the old cap estimate (wall + rim + sweep + glow pad) landing entirely
     in the transparent padding — Unity then stretched the pill's rounded
     caps. Measure the default state's silhouette; the formula survives
     only as the fallback for silhouettes too sparse to walk. */
  const cap = Math.round((cfg.bevel.width + cfg.candy.rim.width + 34 + glowPadOf(cfg)) * scale);
  const slice = { left: cap, right: cap, top: cap, bottom: cap };
  try {
    const r0 = rects[0];
    const m = measureSliceRGBA(ctx.getImageData(r0.x, r0.y, r0.width, r0.height).data, r0.width, r0.height, scale);
    if (m) { slice.left = m.left; slice.right = m.right; slice.top = m.top; slice.bottom = m.bottom; }
  } catch { /* same-origin data URIs never taint; keep the formula if anything else fails */ }
  clampSlice(slice, rects[0].width, rects[0].height);
  const manifest = {
    generator: "UI Kit Maker (PatternBreak)",
    sheet: `ui-${cfg.presetId}-sheet@${scale}x.png`,
    scale,
    label: cfg.content.label,
    states: rects,
    nineSlice: { ...slice,
      note: "Suggested border insets in sheet pixels. Unity: Sprite Editor > Border. Unreal: Brush > Margin (divide by width/height for 0–1 values)." },
    engines: {
      unity: "Import sheet as Sprite (2D and UI), Sprite Mode: Multiple, slice with the state rects, set Border for 9-slice, use on UI Image (Sliced).",
      unreal: "Import sheet as Texture2D, make one Material or use DrawAs: Box in a Widget Brush per state rect, set Margin from nineSlice.",
    },
  };
  await new Promise<void>((resolve, reject) => {
    cv.toBlob((b) => { if (b) { download(manifest.sheet, b); resolve(); } else reject(new Error("raster failed")); }, "image/png");
  });
  download(`ui-${cfg.presetId}-kit.json`, new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }));
  if (licence) download("LICENCE.txt", new Blob([licence], { type: "text/plain" }));
}

/** The kit's own aura, as a tintable sprite: the piece's SILHOUETTE blurred,
 *  painted white so the engine can tint it to the Glow role.
 *
 *  Unity was compositing a generic radial blob stretched over the piece's box
 *  — a soft ellipse behind a shaped button, which reads exactly as what it is
 *  (owner: "these glows look very big and not as soft comparatively… what is
 *  different about these than what we have in the app"). What the app draws
 *  is the outer path blurred TWICE — stdDeviation 14 at full strength and 30
 *  at 0.6 — so the halo hugs the shape. Same two passes here, over the
 *  rendered sprite's own alpha, at the same sigmas scaled to device pixels.
 *
 *  The runtime multiplies the whole thing by the state's glow dial, so the
 *  two passes carry only their RELATIVE weights. */
export async function glowFromPng(
  bytes: Uint8Array, scale = 2,
): Promise<{ bytes: Uint8Array; w: number; h: number; pad: number }> {
  const img = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" }));
  const s1 = 14 * scale, s2 = 30 * scale;
  const pad = Math.ceil(s2 * 3); // a Gaussian is spent by ~3 sigma
  const w = img.width + pad * 2, h = img.height + pad * 2;

  // 1 — the silhouette in white: draw the art, then keep only its alpha
  const sil = document.createElement("canvas");
  sil.width = w; sil.height = h;
  const sctx = sil.getContext("2d")!;
  sctx.drawImage(img, pad, pad);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = "#FFFFFF";
  sctx.fillRect(0, 0, w, h);

  // 2 — the app's two passes, wide one first so the tight core sits on top
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const octx = out.getContext("2d")!;
  octx.globalAlpha = 0.44; // 0.6 / 1.35 — the app's second pass, relative
  octx.filter = `blur(${s2}px)`;
  octx.drawImage(sil, 0, 0);
  octx.globalAlpha = 1;
  octx.filter = `blur(${s1}px)`;
  octx.drawImage(sil, 0, 0);

  // the aura is WHITE ink over transparency — undilated black RGB under its
  // soft edge is exactly the fringe this slice cures, so it encodes dilated
  const glowBytes = await canvasToPngBytesDilated(out);
  return { bytes: glowBytes, w, h, pad };
}
