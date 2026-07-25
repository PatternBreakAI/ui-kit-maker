/* One door for every paid export.

   Each Pro artifact runs through `guardedExport`, which asks the server
   for a grant BEFORE any assembly happens and hands the licence block to
   the builder. Call sites never decide entitlement themselves — that
   used to be a client-side boolean anyone could flip; now the answer
   comes from plan_id in the database.

   The refusals are routed to the thing the person actually needs: signed
   out → sign in, free → the pricing page, too fast → a plain "slow down"
   note. A locked button still looks locked before you press it (the
   client caps still drive the UI), so this path is what catches the
   tampered case, not the everyday one. */

import { requestExportGrant, isGrant, type ExportKind, type ExportGrant } from "./billing";
import { cloudConfig } from "./cloud";

export interface GateHandlers {
  /** Send them to sign-in (guest). */
  onSignIn: () => void;
  /** Send them to the pricing page (free). */
  onUpgrade: () => void;
  /** Everything else — show the message as-is. */
  onMessage: (msg: string) => void;
}

/** Runs `build` only if the server issues a grant. Returns true when the
    artifact was produced. `build` receives the licence text to embed. */
export async function guardedExport(
  kind: ExportKind,
  handlers: GateHandlers,
  build: (grant: ExportGrant) => void | Promise<void>,
): Promise<boolean> {
  // Local / cloud-off builds have no account system at all: the whole
  // paid layer is inert there and development stays unimpeded.
  if (!cloudConfig()) {
    await build({
      kind,
      reference: "local",
      issuedAt: new Date().toISOString(),
      licensedTo: "local build",
      licence: "UI Kit Maker — local development build. No licence issued.\n",
    });
    return true;
  }

  const grant = await requestExportGrant(kind);
  if (!isGrant(grant)) {
    if (grant.reason === "signin") handlers.onSignIn();
    else if (grant.reason === "upgrade") handlers.onUpgrade();
    else handlers.onMessage(grant.error);
    return false;
  }
  await build(grant);
  return true;
}
