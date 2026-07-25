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

// `?lab=silhouettes` is a boot-time dev harness, decided once and never at
// runtime — it bypasses routing entirely, exactly as main.tsx did before.
const IS_LAB =
  new URLSearchParams(window.location.search).get("lab") === "silhouettes";

// The editor is desktop-only for now: small screens and small touch devices
// get a polite gate instead. The rest of the site stays fully mobile.
const isMobile = () =>
  window.matchMedia("(max-width: 767px)").matches ||
  (window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 900px)").matches);

/* A redeploy invalidates the content-hashed chunks an already-open tab knows
   about; the first navigation after that fails its dynamic import and, with no
   boundary, React blanks the page. This boundary auto-reloads once to pick up
   the fresh build, and shows a reload card instead of white if that fails. */
class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) {
    const msg = String((err as Error)?.message ?? err);
    const chunkErr = /dynamically imported module|Loading chunk|module script failed|Failed to fetch/i.test(msg);
    let reloaded = false;
    try { reloaded = sessionStorage.getItem("fd-chunk-reload") === "1"; } catch { /* private mode */ }
    if (chunkErr && !reloaded) {
      try { sessionStorage.setItem("fd-chunk-reload", "1"); } catch { /* private mode */ }
      window.location.reload();
    }
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="route-loading" role="alert">
          <span className="route-loading__label">
            A fresh version just shipped —{" "}
            <button className="fd-linkbtn" onClick={() => window.location.reload()}>reload</button>{" "}
            to pick it up.
          </span>
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
      ) : (
        <Landing />
      )}
      {overlay.open && (
        <Suspense fallback={null}>
          <AuthOverlay />
        </Suspense>
      )}
    </RouteBoundary>
  );
}
