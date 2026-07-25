/* POST /api/stripe-webhook — the ONLY place plan_id becomes 'pro'.

   Stripe signs every delivery; we verify that signature with Web Crypto
   before believing a word of it, then move the profile between free and pro
   as the subscription starts, renews, lapses or is cancelled. Writes go
   through the service-role key, which is what lets them past the RLS policy
   that pins client-side plan_id to 'free'. */

function ok(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "cache-control": "no-store" } });
}

const enc = new TextEncoder();

/** Stripe's scheme: header is `t=<unix>,v1=<hex hmac>`, signed payload is
    `<t>.<raw body>`, HMAC-SHA256 with the endpoint's signing secret. */
async function verify(raw: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = parts.t;
  const sent = parts.v1;
  if (!t || !sent) return false;

  // reject replays of anything older than five minutes
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;

  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`${t}.${raw}`));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // length-stable comparison
  if (expected.length !== sent.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sent.charCodeAt(i);
  return diff === 0;
}

type Sub = {
  id?: string;
  status?: string;
  customer?: string;
  current_period_end?: number;
  /* which price they actually bought — this is what separates a student
     from a pro. Without it both would land as the same plan and the
     student limits could never be enforced. */
  items?: { data?: { current_period_end?: number; price?: { id?: string } }[] };
  /* Stripe moved the period end onto the items in the 2025 API versions;
     new accounts default to those, older ones still send the top-level
     field. Read whichever one this account's version provides. */
  metadata?: Record<string, string>;
};

function renewalOf(sub: Sub): string | null {
  const secs = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return secs ? new Date(secs * 1000).toISOString() : null;
}

/** Student and pro are different plans with different export rights, so
    the plan follows the PRICE that was actually purchased. Anything we
    don't recognise is treated as pro — never silently downgrade someone
    who paid. */
function planOf(sub: Sub): "pro" | "student" {
  const edu = process.env.STRIPE_PRICE_STUDENT;
  if (!edu) return "pro";
  const bought = sub.items?.data?.map((d) => d.price?.id).filter(Boolean) ?? [];
  return bought.includes(edu) ? "student" : "pro";
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!secret || !supaUrl || !service) return ok("Billing isn't configured.", 503);

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  if (!(await verify(raw, sig, secret))) return ok("Bad signature.", 400);

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return ok("Bad payload.", 400);
  }
  const type = event.type ?? "";
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;

  const rest = (path: string, init?: RequestInit) =>
    fetch(`${supaUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: service,
        authorization: `Bearer ${service}`,
        "content-type": "application/json",
        prefer: "return=minimal",
        ...(init?.headers ?? {}),
      },
    });

  /** Find the profile this event belongs to: the id Stripe is carrying for
      us if present, otherwise the customer pointer we stored at checkout. */
  const uidFor = async (customer: string, meta?: Record<string, string>, ref?: string): Promise<string | null> => {
    const carried = meta?.supabase_uid || ref;
    if (carried) return carried;
    if (!customer) return null;
    const res = await fetch(`${supaUrl}/rest/v1/profiles?stripe_customer_id=eq.${customer}&select=id`, {
      headers: { apikey: service, authorization: `Bearer ${service}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { id?: string }[];
    return rows[0]?.id ?? null;
  };

  const setPlan = async (uid: string, patch: Record<string, unknown>) => {
    await rest(`profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify(patch) });
  };

  try {
    if (type === "checkout.session.completed") {
      const customer = String(obj.customer ?? "");
      const subId = String(obj.subscription ?? "");
      const uid = await uidFor(customer, obj.metadata as Record<string, string>, String(obj.client_reference_id ?? ""));
      if (!uid) return ok("No matching profile — ignored.");
      // the session tells us it's paid; read the subscription for the term end
      let renews: string | null = null;
      let plan: "pro" | "student" = "pro";
      if (subId && stripeKey) {
        const s = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
          headers: { authorization: `Bearer ${stripeKey}` },
        });
        if (s.ok) {
          const sub = (await s.json()) as Sub;
          renews = renewalOf(sub);
          plan = planOf(sub);
        }
      }
      await setPlan(uid, {
        plan_id: plan,
        plan_status: "active",
        stripe_customer_id: customer || null,
        stripe_subscription_id: subId || null,
        plan_renews_at: renews,
      });
      return ok("ok");
    }

    if (type.startsWith("customer.subscription.")) {
      const sub = obj as Sub;
      const customer = String(sub.customer ?? "");
      const uid = await uidFor(customer, sub.metadata);
      if (!uid) return ok("No matching profile — ignored.");
      const status = sub.status ?? "";
      // Stripe's own words for "this person is entitled right now"
      const entitled = status === "active" || status === "trialing" || status === "past_due";
      /* Comped accounts (plan_status 'comped', granted via /api/admin) are
         entitled by the OWNER, not by Stripe. If such an account still has
         an old subscription on file and that subscription dies, this event
         must not strip the comp — the grant outranks a lapsed sub. A comped
         user genuinely subscribing lands in the entitled path below, and
         Stripe's 'active' rightly replaces the comp. */
      if (!entitled || type === "customer.subscription.deleted") {
        const cur = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${uid}&select=plan_status`, {
          headers: { apikey: service, authorization: `Bearer ${service}` },
        });
        if (cur.ok) {
          const rows = (await cur.json()) as { plan_status?: string }[];
          if (rows[0]?.plan_status === "comped") return ok("Comped account — Stripe downgrade ignored.");
        }
      }
      await setPlan(uid, {
        plan_id: entitled && type !== "customer.subscription.deleted" ? planOf(sub) : "free",
        plan_status: type === "customer.subscription.deleted" ? "canceled" : status,
        stripe_subscription_id: sub.id ?? null,
        plan_renews_at: renewalOf(sub),
      });
      return ok("ok");
    }

    return ok("Ignored.");
  } catch {
    // 500 asks Stripe to retry — better than silently dropping an upgrade
    return ok("Handler error.", 500);
  }
}
