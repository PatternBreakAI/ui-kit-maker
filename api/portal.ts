/* POST /api/portal — a Stripe billing-portal link for the signed-in
   customer, so cancelling, updating a card or pulling invoices happens on
   Stripe's own hosted pages. We never see card details, and the portal is
   the "cancel anytime online" path our subscription terms promise. */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function safeOrigin(req: Request): string {
  const o = req.headers.get("origin") ?? "";
  const ok = /^https:\/\/([a-z0-9-]+\.)*uikitmaker\.com$/i.test(o)
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o)
    || /^http:\/\/localhost:\d+$/i.test(o);
  return ok ? o : "https://uikitmaker.com";
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const key = process.env.STRIPE_SECRET_KEY;
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key || !supaUrl || !service) {
    return json({ error: "Billing isn't switched on for this deployment yet." }, 503);
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sign in first." }, 401);

  const who = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: service },
  });
  if (!who.ok) return json({ error: "Your session expired — sign in again." }, 401);
  const user = (await who.json()) as { id?: string };
  if (!user.id) return json({ error: "Your session expired — sign in again." }, 401);

  const pr = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${user.id}&select=stripe_customer_id`, {
    headers: { apikey: service, authorization: `Bearer ${service}` },
  });
  const rows = pr.ok ? ((await pr.json()) as { stripe_customer_id?: string }[]) : [];
  const customer = rows[0]?.stripe_customer_id;
  if (!customer) return json({ error: "No billing account yet — nothing to manage." }, 404);

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ customer, return_url: `${safeOrigin(req)}/#/account` }).toString(),
  });
  const body = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok) return json({ error: body.error?.message ?? "Could not open the billing portal." }, 502);
  return json({ url: body.url });
}
