/* The export/board gate's tiny observable — same pub/sub shape as
   authOverlay.ts, and dependency-free for the same reason: TopBar, the
   Kit page and the Board all open ONE App-owned modal without threading
   props. The modal itself (ui/GateModal.tsx) reads the tier and speaks
   the right pitch; this module only carries "open, and why".

   Gate Round (owner mandate, 2026-08-17): a locked export used to hard-
   navigate to sign-in or #/pricing. The modal replaces the navigation —
   same handlers architecture, better landing — and for the free tier it
   also offers the thing that IS free: the stock Unity test kit. */

import { useEffect, useState } from "react";

/** What tripped the gate — the modal words itself around it.
    "export" · any export control; "board" · a guest's second board. */
export type GateReason = "export" | "board";

export type GateModalState = { open: boolean; reason: GateReason };

let state: GateModalState = { open: false, reason: "export" };
const listeners = new Set<(s: GateModalState) => void>();

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function openGate(reason: GateReason = "export") {
  state = { open: true, reason };
  emit();
}

export function closeGate() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

export function useGateModal(): GateModalState {
  const [s, setS] = useState<GateModalState>(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
