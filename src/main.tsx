import React from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
// Self-hosted Inter Variable via Fontsource — weights 400–700 in one variable file.
import "@fontsource-variable/inter";
import "./styles/gen.css";
import "./styles/frontdoor.css";
import { Shell } from "./shell/Shell";
import { initTheme } from "./shell/theme";
import { startCloud } from "./generator/cloud";

// Apply the persisted theme before the first paint so every route — the
// landing included — renders in the right theme with no flash.
initTheme();

// Cloud accounts + saves — a no-op until a Supabase project is configured.
void startCloud();

// The Shell is a minimal hash router: it paints the marketing landing at #/,
// lazy-loads the editor at #/app (and for #share=/#p= deep links), and mounts
// the dev-only silhouette lab at ?lab=silhouettes.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Shell />
    <Analytics />
  </React.StrictMode>,
);
