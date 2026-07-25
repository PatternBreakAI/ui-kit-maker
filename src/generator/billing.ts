/* Billing — the browser's half of the Stripe flow.

   Deliberately thin: this module can ask to start a checkout or open the
   billing portal, and that is all it can do. It cannot grant Pro. The
   serverless functions in /api hold the only credentials that can write
   plan_id, and they re-verify the caller's session with Supabase before
   doing anything. Appendix A in one sentence: the client asks, the server
   decides. */

import { accessToken } from "./cloud";

async function post(route: "checkout" | "portal"): Promise<{ url?: string; error?: string }> {
  const token = await accessToken();
  if (!token) return { error: "Sign in first." };
  let res: Response;
  try {
    res = await fetch(`/api/${route}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    return { error: "Couldn't reach the billing service — check your connection." };
  }
  let body: { url?: string; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* non-JSON (a platform error page) — fall through to the status text */
  }
  if (!res.ok) return { error: body.error ?? `Billing service returned ${res.status}.` };
  if (!body.url) return { error: "The billing service didn't return a checkout link." };
  return { url: body.url };
}

/** Send the customer to Stripe Checkout. Resolves with an error string when
    the hand-off fails; on success the page navigates away. */
export async function startCheckout(): Promise<string | null> {
  const { url, error } = await post("checkout");
  if (error || !url) return error ?? "Checkout could not start.";
  window.location.href = url;
  return null;
}

/** Open Stripe's hosted portal — the "cancel anytime online" path. */
export async function openBillingPortal(): Promise<string | null> {
  const { url, error } = await post("portal");
  if (error || !url) return error ?? "The billing portal could not open.";
  window.location.href = url;
  return null;
}

/** True right after a successful Checkout return (#/account?upgraded=1).
    Stripe redirects before its webhook necessarily lands, so the account
    page uses this to poll for the plan flip instead of claiming failure. */
export function justUpgraded(): boolean {
  return /[?&]upgraded=1/.test(window.location.hash);
}

/* ── export grants ─────────────────────────────────────────────────
   Paid artifacts are gated by the SERVER, not by this bundle. Before a
   Pro export runs, the browser asks /api/export, which reads plan_id
   from the database and either refuses or returns a licence block to
   embed. The rendering still happens here (only a browser rasterizes our
   filters faithfully), but nothing paid is produced without a grant, so
   editing a flag in devtools yields a 403 rather than a kit. */

export type ExportKind = "engine" | "gamekit" | "html" | "svg" | "sheet";

export interface ExportGrant {
  kind: ExportKind;
  reference: string;
  issuedAt: string;
  licensedTo: string;
  /** LICENCE.txt — every paid artifact carries it. */
  licence: string;
}

export interface GrantRefusal {
  error: string;
  /** "signin" → send them to sign-in · "upgrade" → send them to pricing
      · "rate" → they're fine, just too fast · "offline" → network */
  reason: "signin" | "upgrade" | "rate" | "offline" | "error";
}

export async function requestExportGrant(kind: ExportKind): Promise<ExportGrant | GrantRefusal> {
  const token = await accessToken();
  if (!token) return { error: "Sign in to export.", reason: "signin" };
  let res: Response;
  try {
    // hard deadline: a stalled request must surface, never spin forever
    const sig = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? (AbortSignal as { timeout(n: number): AbortSignal }).timeout(15000)
      : undefined;
    res = await fetch("/api/export", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ kind }),
      ...(sig ? { signal: sig } : {}),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return {
      error: timedOut
        ? "The export service didn't answer in time. Try again in a moment."
        : "Couldn't reach the export service — check your connection.",
      reason: "offline",
    };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch { /* fall through to status handling */ }
  if (!res.ok || !body.granted) {
    return {
      error: String(body.error ?? `Export service returned ${res.status}.`),
      reason: (body.reason as GrantRefusal["reason"]) ?? "error",
    };
  }
  return {
    kind,
    reference: String(body.reference ?? ""),
    issuedAt: String(body.issuedAt ?? ""),
    licensedTo: String(body.licensedTo ?? ""),
    licence: String(body.licence ?? ""),
  };
}

export function isGrant(g: ExportGrant | GrantRefusal): g is ExportGrant {
  return (g as ExportGrant).licence !== undefined;
}
