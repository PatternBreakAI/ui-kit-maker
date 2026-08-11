import React from "react";
import { createRoot } from "react-dom/client";
// Self-hosted Inter Variable via Fontsource — weights 400–700 in one variable file.
import "@fontsource-variable/inter";
import "./styles/gen.css";
import "./styles/frontdoor.css";
import { Analytics } from "@vercel/analytics/react";
import { Shell } from "./shell/Shell";
import { initTheme } from "./shell/theme";
import { startCloud, onCloudStatus } from "./generator/cloud";
import { startFlightRecorder, recordChange } from "./generator/flightRecorder";

// Apply the persisted theme before the first paint so every route — the
// landing included — renders in the right theme with no flash.
initTheme();

// The freeze hunt's black box: breadcrumbs + a 1s beat into localStorage
// (outside the sync prefix), readable later from SAFE MODE diagnostics.
// Records nothing in safe mode — that is the reading session.
startFlightRecorder();

// Cloud accounts + saves — a no-op until a Supabase project is configured.
void startCloud();
onCloudStatus((s) => recordChange("cloud", s.state + (s.detail ? ` ${s.detail.slice(0, 30)}` : "")));

// The Shell is a minimal hash router: it paints the marketing landing at #/,
// lazy-loads the editor at #/app (and for #share=/#p= deep links), and mounts
// the dev-only silhouette lab at ?lab=silhouettes.
/* Vercel Web Analytics — pageviews, referrers, countries, devices, and no
   cookies (so no consent banner). It answers "who arrived and from where";
   the admin desk's pulse answers "what did they do once here". The script
   only loads on the Vercel deployment: the GitHub Pages mirror and local
   dev serve a route that isn't there, so `mode` keeps dev quiet and a 404
   on the mirror is harmless — the page never depends on it. Hash routes
   report as distinct paths because the SPA pushes them through history. */
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Shell />
    <Analytics mode={import.meta.env.PROD ? "production" : "development"} />
  </React.StrictMode>,
);
