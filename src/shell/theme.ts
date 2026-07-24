/* Shell-level theme — the ONE source of truth both the front door and the
   editor read. The editor's store already persists the choice under the
   dedicated key "ui-generator-theme" (store.ts), so the shell reads/writes
   that exact key: toggling on the landing page and toggling in the editor
   stay in lock-step, and the choice rides along in the cloud doc keyspace.

   initTheme() runs in main.tsx BEFORE React mounts, so every route paints in
   the right theme with no flash — the landing included. */

import { useEffect, useState } from "react";

const KEY = "ui-generator-theme";
export type Theme = "light" | "dark";

export function readTheme(): Theme {
  // DARK is the product default — light is the explicit opt-in. Every
  // reader (shell, editor store, landing) must agree on this fallback or
  // the trays and canvas split themes on first visit.
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
}

/** Call once at boot, before the first paint. */
export function initTheme(): Theme {
  const t = readTheme();
  apply(t);
  return t;
}

const listeners = new Set<(t: Theme) => void>();

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable — still apply for this session */
  }
  apply(t);
  listeners.forEach((fn) => fn(t));
}

export function toggleTheme() {
  setTheme(readTheme() === "dark" ? "light" : "dark");
}

/** Reactive theme for shell/marketing/auth surfaces. Initialises from the
    live <html> attribute so it is always current when a route mounts (the
    editor may have changed it while the landing was unmounted). */
export function useTheme(): Theme {
  const [t, setT] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || readTheme(),
  );
  useEffect(() => {
    setT((document.documentElement.dataset.theme as Theme) || readTheme());
    listeners.add(setT);
    return () => {
      listeners.delete(setT);
    };
  }, []);
  return t;
}
