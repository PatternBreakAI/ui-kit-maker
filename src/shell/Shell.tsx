import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useRoute } from "./router";
import { useAuthOverlay, openAuth } from "./authOverlay";
import { useCloudStatus } from "./useCloudStatus";
import { Landing } from "@/marketing/Landing";
import { LegalPage } from "@/marketing/LegalPage";
import { MobileGate } from "./MobileGate";

/* The editor is the heavy chunk (engine + roughjs + three + icon libs). It is
   lazy so the landing route paints without pulling any of it. The dev-only
   silhouette lab, the auth overlay, and the auth pages are split off for the
   same reason. */
const App = lazy(() => import("../App").then((m) => ({ default: m.App })));
const SilhouetteLab = lazy(() =>
  import("../ui/SilhouetteLab").then((m) => ({ default: m.SilhouetteLab })),
);
const PatternLab = lazy(() =>
  import("../ui/PatternLab").then((m) => ({ default: m.PatternLab })),
);
const AuthOverlay = lazy(() =>
  import("../auth/AuthOverlay").then((m) => ({ default: m.AuthOverlay })),
);
const SignInPage = lazy(() =>
  import("../auth/SignInPage").then((m) => ({ default: m.SignInPage })),
);
const AccountPage = lazy(() =>
  import("../auth/AccountPage").then((m) => ({ default: m.AccountPage })),
);
const PricingPage = lazy(() =>
  import("../marketing/PricingPage").then((m) => ({ default: m.PricingPage })),
);
const StudentPage = lazy(() =>
  import("@/marketing/StudentPage").then((m) => ({ default: m.StudentPage })),
);
const ReviewPage = lazy(() =>
  import("@/marketing/ReviewPage").then((m) => ({ default: m.ReviewPage })),
);
const CommunityPage = lazy(() =>
  import("@/ui/CommunityPage").then((m) => ({ default: m.CommunityPage })),
);
const TypeProofPage = lazy(() =>
  import("@/ui/TypeProofPage").then((m) => ({ default: m.TypeProofPage })),
);
const ItalicProbePage = lazy(() =>
  import("@/ui/ItalicProbePage").then((m) => ({ default: m.ItalicProbePage })),
);
// in-place Safari instrumentation — mounts on ANY route when the URL
// carries `slantlab` (e.g. /#/app?slantlab); see src/ui/SlantLab.tsx
const SlantLab = lazy(() =>
  import("@/ui/SlantLab").then((m) => ({ default: m.SlantLab })),
);
const StudioPage = lazy(() =>
  import("@/ui/StudioPage").then((m) => ({ default: m.StudioPage })),
);
const UserPage = lazy(() =>
  import("@/ui/UserPage").then((m) => ({ default: m.UserPage })),
);
const AdminPage = lazy(() =>
  import("../auth/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const FaqPage = lazy(() =>
  import("@/marketing/FaqPage").then((m) => ({ default: m.FaqPage })),
);
const ReleasesPage = lazy(() =>
  import("@/marketing/ReleasesPage").then((m) => ({ default: m.ReleasesPage })),
);
const HowPage = lazy(() =>
  import("@/marketing/HowPage").then((m) => ({ default: m.HowPage })),
);
const UnityPage = lazy(() =>
  import("@/marketing/UnityPage").then((m) => ({ default: m.UnityPage })),
);

// `?lab=silhouettes` is a boot-time dev harness, decided once and never at
// runtime — it bypasses routing entirely, exactly as main.tsx did before.
// `?lab=patterns` is the pattern wave's comparison harness, same contract.
const IS_LAB =
  new URLSearchParams(window.location.search).get("lab") === "silhouettes";
const IS_PATTERN_LAB =
  new URLSearchParams(window.location.search).get("lab") === "patterns";

// The editor is desktop-only for now: small screens and small touch devices
// get a polite gate instead. The rest of the site stays fully mobile.
const isMobile = () =>
  window.matchMedia("(max-width: 767px)").matches ||
  (window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 900px)").matches);

/* A redeploy invalidates the content-hashed chunks an already-open tab knows
   about; the first navigation after that fails its dynamic import and, with no
   boundary, React blanks the page. This boundary auto-reloads once to pick up
   the fresh build, and shows a reload card instead of white if that fails. */
/* GitHub Pages serves index.html with max-age=600, so a plain reload can
   re-fetch the SAME stale chunk map for up to ten minutes and land right
   back on the card. A throwaway query param makes the URL new to the CDN,
   which busts that cache; the hash route survives untouched. */
const freshReload = () => {
  const { pathname, hash } = window.location;
  window.location.replace(`${pathname}?r=${Date.now()}${hash}`);
};

/* The crash cards in the visitor's own language (ui-generator-lang — the
   same key the landing header and MarketingFooter selectors write). Two
   voices: STALE for a failed chunk fetch after a redeploy (a reload truly
   fixes it), GLITCH for everything else — for months every crash wore the
   "fresh version" costume, so a data bug read as deploy trouble and the
   screenshots that reached us carried no cause. The glitch card says what
   broke and offers the store's safe mode (`?safe` boots factory-fresh
   without touching the saved document). */
const STALE_MSG: Record<string, [string, string, string]> = {
  en: ["A fresh version just shipped — ", "reload", " to pick it up."],
  zh: ["新版本刚刚上线——点击", "刷新", "即可使用。"],
  fr: ["Une nouvelle version vient d'arriver — ", "rechargez", " pour en profiter."],
  es: ["Acaba de salir una versión nueva — ", "recarga", " para usarla."],
  it: ["È appena uscita una nuova versione — ", "ricarica", " per usarla."],
  de: ["Eine neue Version ist gerade live gegangen — ", "neu laden", ", und sie ist da."],
  ja: ["新しいバージョンが公開されました——", "再読み込み", "してご利用ください。"],
};
const GLITCH_MSG: Record<string, [string, string, string]> = {
  en: ["Something glitched — ", "reload", " to try again."],
  zh: ["出了点小问题——点击", "刷新", "重试。"],
  fr: ["Un pépin est survenu — ", "rechargez", " pour réessayer."],
  es: ["Algo falló — ", "recarga", " para intentarlo de nuevo."],
  it: ["Qualcosa è andato storto — ", "ricarica", " per riprovare."],
  de: ["Etwas ist schiefgelaufen — ", "neu laden", " und erneut versuchen."],
  ja: ["問題が発生しました——", "再読み込み", "でやり直せます。"],
};
const SAFE_MSG: Record<string, [string, string, string]> = {
  en: ["Still stuck? ", "Open in safe mode", " — it starts fresh and leaves your saved work untouched."],
  zh: ["还是不行？", "以安全模式打开", "——不会改动您保存的作品。"],
  fr: ["Toujours bloqué ? ", "Ouvrez en mode sans échec", " — vos créations enregistrées restent intactes."],
  es: ["¿Sigue igual? ", "Abre en modo seguro", " — tu trabajo guardado queda intacto."],
  it: ["Ancora bloccato? ", "Apri in modalità sicura", " — il tuo lavoro salvato resta intatto."],
  de: ["Klemmt es weiter? ", "Im abgesicherten Modus öffnen", " — deine gespeicherte Arbeit bleibt unberührt."],
  ja: ["それでも直らない場合は", "セーフモードで開く", "——保存済みの作品はそのまま残ります。"],
};
const cardMsg = (map: Record<string, [string, string, string]>): [string, string, string] => {
  let l = "en";
  try { l = localStorage.getItem("ui-generator-lang") || "en"; } catch { /* private mode */ }
  return map[l] ?? map.en;
};

const isChunkErr = (msg: string) =>
  /dynamically imported module|Loading chunk|module script failed|Failed to fetch/i.test(msg);

const safeBoot = () => {
  const { pathname, hash } = window.location;
  window.location.replace(`${pathname}?safe${hash}`);
};

class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean; msg: string }> {
  state = { failed: false, msg: "" };
  static getDerivedStateFromError(err: unknown) {
    return { failed: true, msg: String((err as Error)?.message ?? err) };
  }
  componentDidCatch(err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    /* A time window, not a one-shot: with several deploys close together a
       tab can hit stale chunks more than once, and the old boolean guard
       left it stranded on the reload card. freshReload busts the CDN's
       index.html cache; the 20s window still prevents a loop. */
    let last = 0;
    try { last = Number(sessionStorage.getItem("fd-chunk-reload") ?? 0) || 0; } catch { /* private mode */ }
    if (isChunkErr(msg) && Date.now() - last > 20_000) {
      try { sessionStorage.setItem("fd-chunk-reload", String(Date.now())); } catch { /* private mode */ }
      freshReload();
    }
  }
  render() {
    if (this.state.failed) {
      const stale = isChunkErr(this.state.msg);
      const m = cardMsg(stale ? STALE_MSG : GLITCH_MSG);
      const s = cardMsg(SAFE_MSG);
      return (
        <div className="route-loading" role="alert">
          <span className="route-loading__label">
            {m[0]}
            <button className="fd-linkbtn" onClick={freshReload}>{m[1]}</button>
            {m[2]}
          </span>
          {!stale && (
            <>
              <span className="route-loading__label" style={{ display: "block", marginTop: 10 }}>
                {s[0]}
                <button className="fd-linkbtn" onClick={safeBoot}>{s[1]}</button>
                {s[2]}
              </span>
              {/* the cause, small — this line is what turns a user's
                  screenshot into a diagnosis */}
              <span style={{ display: "block", marginTop: 14, fontSize: 11.5, opacity: 0.55, fontFamily: "ui-monospace, monospace" }}>
                {this.state.msg.slice(0, 160)}
              </span>
            </>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-spinner" aria-hidden="true" />
      <span className="route-loading__label">Loading the generator…</span>
    </div>
  );
}

export function Shell() {
  const route = useRoute();
  const overlay = useAuthOverlay();
  const cloud = useCloudStatus();
  const [mobile, setMobile] = useState(isMobile);

  useEffect(() => {
    const onResize = () => setMobile(isMobile());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Surviving a few seconds means the last chunk-recovery reload worked —
  // re-arm the one-shot so a future redeploy gets its own auto-recovery.
  useEffect(() => {
    const t = setTimeout(() => { try { sessionStorage.removeItem("fd-chunk-reload"); } catch { /* private mode */ } }, 5000);
    return () => clearTimeout(t);
  }, []);

  // Warm the editor chunk while the visitor reads the landing: the first
  // "Open the generator" is instant, and the chunk is fetched while its
  // hashed URL is still guaranteed fresh.
  useEffect(() => {
    if (mobile) return;
    const t = setTimeout(() => { void import("../App").catch(() => {}); }, 4000);
    return () => clearTimeout(t);
  }, [mobile]);

  // Entering the editor from a scrolled marketing page: start at the top.
  useEffect(() => {
    if (route.name === "app") window.scrollTo(0, 0);
  }, [route.name]);

  // Landing here from a password-reset email: cloud.ts flips to "recovery".
  // Surface the overlay so the user can set a new password from any route —
  // except the sign-in page, which renders its own recovery form.
  useEffect(() => {
    if (cloud.state === "recovery" && route.name !== "signin") openAuth("signin");
  }, [cloud.state, route.name]);

  if (IS_LAB) {
    return (
      <Suspense fallback={<RouteLoading />}>
        <SilhouetteLab />
      </Suspense>
    );
  }
  if (IS_PATTERN_LAB) {
    return (
      <Suspense fallback={<RouteLoading />}>
        <PatternLab />
      </Suspense>
    );
  }

  return (
    <RouteBoundary>
      {route.name === "app" ? (
        mobile ? (
          <MobileGate viewer={route.viewer} />
        ) : (
          <Suspense fallback={<RouteLoading />}>
            <App />
          </Suspense>
        )
      ) : route.name === "terms" || route.name === "privacy" ? (
        <LegalPage doc={route.name} />
      ) : route.name === "signin" ? (
        <Suspense fallback={<RouteLoading />}>
          <SignInPage />
        </Suspense>
      ) : route.name === "account" ? (
        <Suspense fallback={<RouteLoading />}>
          <AccountPage />
        </Suspense>
      ) : route.name === "pricing" ? (
        <Suspense fallback={<RouteLoading />}>
          <PricingPage />
        </Suspense>
      ) : route.name === "student" ? (
        <Suspense fallback={<RouteLoading />}>
          <StudentPage />
        </Suspense>
      ) : route.name === "review" ? (
        <Suspense fallback={<RouteLoading />}>
          <ReviewPage />
        </Suspense>
      ) : route.name === "community" ? (
        <Suspense fallback={<RouteLoading />}>
          <CommunityPage />
        </Suspense>
      ) : route.name === "studio" ? (
        <Suspense fallback={<RouteLoading />}>
          <StudioPage />
        </Suspense>
      ) : route.name === "user" && route.param ? (
        <Suspense fallback={<RouteLoading />}>
          <UserPage handle={route.param} />
        </Suspense>
      ) : route.name === "admin" ? (
        <Suspense fallback={<RouteLoading />}>
          <AdminPage />
        </Suspense>
      ) : route.name === "faq" ? (
        <Suspense fallback={<RouteLoading />}>
          <FaqPage />
        </Suspense>
      ) : route.name === "releases" ? (
        <Suspense fallback={<RouteLoading />}>
          <ReleasesPage />
        </Suspense>
      ) : route.name === "how" ? (
        <Suspense fallback={<RouteLoading />}>
          <HowPage />
        </Suspense>
      ) : route.name === "unity" ? (
        <Suspense fallback={<RouteLoading />}>
          <UnityPage />
        </Suspense>
      ) : route.name === "typeproof" ? (
        <Suspense fallback={<RouteLoading />}>
          <TypeProofPage />
        </Suspense>
      ) : route.name === "italicprobe" ? (
        <Suspense fallback={<RouteLoading />}>
          <ItalicProbePage />
        </Suspense>
      ) : (
        <Landing />
      )}
      {overlay.open && (
        <Suspense fallback={null}>
          <AuthOverlay />
        </Suspense>
      )}
      {/slantlab/.test(window.location.search + window.location.hash) && (
        <Suspense fallback={null}>
          <SlantLab />
        </Suspense>
      )}
    </RouteBoundary>
  );
}
