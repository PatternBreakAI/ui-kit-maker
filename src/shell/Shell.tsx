import { lazy, Suspense, useEffect } from "react";
import { useRoute } from "./router";
import { useAuthOverlay, openAuth } from "./authOverlay";
import { useCloudStatus } from "./useCloudStatus";
import { Landing } from "@/marketing/Landing";
import { LegalPage } from "@/marketing/LegalPage";

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

// `?lab=silhouettes` is a boot-time dev harness, decided once and never at
// runtime — it bypasses routing entirely, exactly as main.tsx did before.
const IS_LAB =
  new URLSearchParams(window.location.search).get("lab") === "silhouettes";

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
    <>
      {route.name === "app" ? (
        <Suspense fallback={<RouteLoading />}>
          <App />
        </Suspense>
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
      ) : (
        <Landing />
      )}
      {overlay.open && (
        <Suspense fallback={null}>
          <AuthOverlay />
        </Suspense>
      )}
    </>
  );
}
