/* ── `#/kit/<slug>` — the public page of a kit we SHIP ────────────────
   The short, permanent address (see generator/namedKits for why it is a
   route and not a share link). Everything a visitor needs is already in
   the bundle: this mounts the kit's committed definition into the store
   as a read-only document and hands the normal app its Kit page, so a
   SIGNED-OUT stranger gets the real kit on first paint — no sign-in, no
   cloud round-trip, no gate.

   The payload loads in viewer mode, which is what keeps it polite: the
   visitor's own saved workspace is never written over, and their boards
   are left exactly where they were (loadKitPayload only imports boards
   for an OWNED open). The demo screens on the page come from the
   shipped definition itself, not from the workspace. */
import { lazy, Suspense, useLayoutEffect, useMemo, useState } from "react";
import { namedKitFromHash } from "@/generator/namedKits";
import { useGen } from "@/generator/store";
import { navigate } from "@/shell/router";

/* The editor chunk is the app's heavy one; the kit page lives inside it.
   Lazy here too, so the route's own module can resolve the slug (and
   bounce an unknown one) without pulling the engine down first. */
const App = lazy(() => import("../App").then((m) => ({ default: m.App })));

export function KitViewer({ slug }: { slug: string }) {
  /* Resolved from the HASH, not the slug alone — namedKitFromHash is the
     one door, so route and page can never disagree about which kit this
     is (the Kit page asks the same question when it decides whether to
     draw the demo screens and the promo block). Keyed on the slug so a
     hop from one shipped kit's page to another re-resolves instead of
     leaving the previous kit standing: this component keeps its instance
     across such a hop, since the route name doesn't change. */
  const kit = useMemo(() => namedKitFromHash(window.location.hash), [slug]);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (!kit) {
      // an address we don't ship: the landing page, never an empty editor
      navigate("#/");
      return;
    }
    /* hydrate BEFORE the editor mounts — a paint of the default kit
       followed by a flip to the real one is exactly the flicker a store
       reviewer would screenshot. phase "kit" lands them on the sheet. */
    useGen.getState().loadKitPayload(kit.payload, { viewer: true, phase: "kit" });
    setReady(true);
  }, [kit, slug]);
  /* This route is a PUBLIC page, not the workspace — a stamp on <html>
     says so, and the narrow-screen rules in gen.css hang off it. Nothing
     else in the app is scoped by it, and it goes when the route does. */
  useLayoutEffect(() => {
    if (!kit) return;
    document.documentElement.dataset.kitpublic = kit.slug;
    return () => { delete document.documentElement.dataset.kitpublic; };
  }, [kit]);
  if (!kit || !ready) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <span className="route-spinner" aria-hidden="true" />
        <span className="route-loading__label">Loading the kit…</span>
      </div>
    );
  }
  return (
    <Suspense fallback={
      <div className="route-loading" role="status" aria-live="polite">
        <span className="route-spinner" aria-hidden="true" />
        <span className="route-loading__label">Loading the kit…</span>
      </div>
    }>
      <App />
    </Suspense>
  );
}
