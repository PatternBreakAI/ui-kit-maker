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
