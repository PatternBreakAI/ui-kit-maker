/* The New kit sheet's tiny observable — same pub/sub shape as
   authOverlay.ts / gateModal.ts. TopBar (in the editor) and the projects
   home both invoke ONE flow without threading props; the component and
   the store-aware logic live in ui/NewKitSheet.tsx so this shell module
   stays dependency-free. */

import { useEffect, useState } from "react";

export type NewKitSheetState = { open: boolean };

let state: NewKitSheetState = { open: false };
const listeners = new Set<(s: NewKitSheetState) => void>();

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function openNewKitSheet() {
  state = { open: true };
  emit();
}

export function closeNewKitSheet() {
  if (!state.open) return;
  state = { open: false };
  emit();
}

export function useNewKitSheet(): NewKitSheetState {
  const [s, setS] = useState<NewKitSheetState>(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
