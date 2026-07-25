/* A tiny observable for the account/auth overlay — same pub/sub shape as
   cloud.ts's onCloudStatus. It lets the landing CTA, the #/signin route, and
   the editor's top-bar account button all open ONE Shell-owned overlay without
   threading props through the tree. Deliberately dependency-free so importing
   it never pulls the editor bundle into the landing chunk. */

import { useEffect, useState } from "react";

/** Which signed-out form to land on first. Ignored once signed in / in
    recovery / local-only, where the overlay picks the scene from cloud state.
    "projects" is a DESTINATION rather than a form: signed-in users land
    straight in My projects (the save-a-kit moment); signed-out users see
    the sign-in form first and reach their projects right after. */
export type AuthMode = "signin" | "signup" | "magic" | "reset" | "projects";

export type AuthOverlayState = { open: boolean; mode: AuthMode };

let state: AuthOverlayState = { open: false, mode: "signin" };
const listeners = new Set<(s: AuthOverlayState) => void>();

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function openAuth(mode: AuthMode = "signin") {
  state = { open: true, mode };
  emit();
}

export function closeAuth() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

export function useAuthOverlay(): AuthOverlayState {
  const [s, setS] = useState<AuthOverlayState>(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
