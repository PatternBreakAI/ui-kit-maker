/* POST /api/checkout — open a Stripe Checkout Session for UI Kit Maker Pro.
   The browser sends its Supabase access token; we verify it against Supabase
   (never trusting a client-supplied user id), find or create the matching
   Stripe customer, and hand back a Checkout URL. Nothing here grants Pro —
   only the webhook does that, after Stripe confirms payment. */

const PRO_ANNUAL_CONSENT =
  "You will be charged $29.99 today, plus applicable tax. This membership renews automatically every 12 months at the then-current annual price unless you cancel. Cancel anytime in Account › Plan & billing — cancelling stops the next charge and your Pro access continues to the end of the term.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Only our own origins may be used as Checkout return URLs — an unchecked
    Origin header is an open-redirect waiting to happen. */
function safeOrigin(req: Request): string {
  const o = req.headers.get("origin") ?? "";
  const ok = /^https:\/\/([a-z0-9-]+\.)*uikitmaker\.com$/i.test(o)
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o)
    || /^http:\/\/localhost:\d+$/i.test(o);
  return ok ? o : "https://uikitmaker.com";
}

/** Stripe REST — form-encoded, no SDK. */
async function stripe(path: string, key: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `Stripe ${path} failed (${res.status})`);
  }
  return body;
}

export async function POST(req: Request): Promise<Response> {
  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_PRO;
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key || !price || !supaUrl || !service) {
    return json({ error: "Billing isn't switched on for this deployment yet." }, 503);
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sign in before upgrading." }, 401);

  // Verify the session with Supabase itself — the token is the only identity
  // we accept, and Supabase is the one that says whose it is.
  const who = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: service },
  });
  if (!who.ok) return json({ error: "Your session expired — sign in again." }, 401);
  const user = (await who.json()) as { id?: string; email?: string };
  if (!user.id) return json({ error: "Your session expired — sign in again." }, 401);

  const rest = (path: string, init?: RequestInit) =>
    fetch(`${supaUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: service,
        authorization: `Bearer ${service}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  try {
    // reuse the customer we already made for this account, if any
    const pr = await rest(`profiles?id=eq.${user.id}&select=stripe_customer_id,plan_id`);
    const rows = pr.ok ? ((await pr.json()) as { stripe_customer_id?: string; plan_id?: string }[]) : [];
    const profile = rows[0];
    if (profile?.plan_id && profile.plan_id !== "free") {
      return json({ error: "You're already on Pro — manage it from Account.", alreadyPro: true }, 409);
    }

    let customer = profile?.stripe_customer_id ?? "";
    if (!customer) {
      const made = await stripe("customers", key, {
        ...(user.email ? { email: user.email } : {}),
        "metadata[supabase_uid]": user.id,
      });
      customer = String(made.id ?? "");
      await rest(`profiles?id=eq.${user.id}`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ stripe_customer_id: customer }),
      });
    }

    const origin = safeOrigin(req);
    const session = await stripe("checkout/sessions", key, {
      mode: "subscription",
      customer,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      "subscription_data[metadata][supabase_uid]": user.id,
      "metadata[supabase_uid]": user.id,
      allow_promotion_codes: "true",
      billing_address_collection: "auto",
      // the annual-renewal disclosure our checkout copy requires, shown
      // directly above the pay button
      "custom_text[submit][message]": PRO_ANNUAL_CONSENT,
      success_url: `${origin}/#/account?upgraded=1`,
      cancel_url: `${origin}/#/pricing`,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Checkout could not start." }, 502);
  }
}
