/* Minimal hand-rolled hash router — no dependency, works on any static host
   with Vite's relative `base`. It intentionally understands only a handful of
   shapes and defaults everything else to the landing page:

   · #/app              → the editor
   · #/signin           → the sign-in page
   · #/account          → the account page (profile, plan, projects, data)
   · #/terms #/privacy  → legal pages
   · #/  ""  (default)  → the landing page

   Two legacy hashes predate routes and must keep working untouched — they are
   read by App.tsx's useSharedKit() and open the kit read-only:

   · #share=<blob>      → editor in viewer mode (self-contained shared kit)
   · #p=<slug>          → editor in viewer mode (published cloud project)

   Supabase auth redirects (#access_token=…&type=recovery, #error=…) also live
   in the hash. They never match a route, so they fall through to `landing`;
   the recovery UI is driven by cloud status, not by the URL, and the Supabase
   client strips those tokens from the hash on boot. */

import { useEffect, useState } from "react";

export type RouteName =
  | "landing" | "app" | "terms" | "privacy" | "signin" | "account" | "pricing";
export type Route = { name: RouteName; viewer: boolean };

export function parseHash(hash: string): Route {
  // Deep links → editor (viewer mode handled inside App.tsx).
  if (/^#(share|p)=/.test(hash)) {
    return { name: "app", viewer: true };
  }
  /* A route may carry its own query string — Stripe returns to
     `#/account?upgraded=1`, for instance. Match on the path alone, or
     that customer lands on the marketing page right after paying. */
  const raw = hash.replace(/^#/, "");
  const qi = raw.indexOf("?");
  const path = qi === -1 ? raw : raw.slice(0, qi);
  if (path === "/app") return { name: "app", viewer: false };
  if (path === "/terms") return { name: "terms", viewer: false };
  if (path === "/privacy") return { name: "privacy", viewer: false };
  if (path === "/signin") return { name: "signin", viewer: false };
  if (path === "/pricing") return { name: "pricing", viewer: false };
  if (path === "/account") return { name: "account", viewer: false };
  // "", "/", unknown routes, and Supabase auth hashes → landing.
  return { name: "landing", viewer: false };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

/** Navigate by setting the hash. A no-op set still fires listeners so callers
    can rely on it. Guards against pushing a redundant history entry. */
export function navigate(to: string) {
  const hash = to.startsWith("#") ? to : "#" + to;
  if (window.location.hash === hash) {
    // Force a re-parse even when the hash is unchanged (e.g. re-open signin).
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = hash;
}
