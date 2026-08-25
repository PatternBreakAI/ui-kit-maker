/* POST /api/export — the paid artifacts' entitlement check.

   WHY THIS SHAPE. The renderer has to live in the browser (it draws the
   canvas the user is editing), and the engine kit and game kit ship
   rasterized PNGs that only a real browser renders faithfully — our SVG
   leans on gaussian blur, turbulence and colour-matrix filters that
   server-side rasterizers support only partially. Rasterizing on the
   server would quietly degrade what customers paid for, which is a worse
   outcome than piracy.

   So the split is: the SERVER decides whether an export may happen and
   stamps it; the BROWSER does the drawing. This function reads plan_id
   from the database — never from anything the client says — and returns
   a short-lived grant carrying the licence block that every Pro artifact
   must embed. No grant, no artifact: flipping a flag in devtools now
   yields a 403 instead of a kit.

   It also logs every issue, which powers a quiet per-account rate limit.
   That is aimed at scripted harvesting and wholesale account sharing; a
   real person exporting all day never reaches it. */

const RATE_PER_HOUR = 60;

/** What a caller may ask for. Anything else is refused outright. */
const KINDS = new Set(["engine", "gamekit", "html", "svg", "sheet"]);

/* Which artifacts each plan may take. This mirrors EXPORT_KINDS in
   src/generator/entitlements.ts — the client copy shapes the UI, this one
   decides. Kept as a literal rather than an import because serverless
   functions bundle separately from the app.

   Student and Pro are deliberately identical. The education price buys the
   whole tool; what it does not buy is the right to SELL what you build with
   it, and that difference is carried by the licence block below rather than
   by withholding formats. See entitlements.ts for the reasoning. */
const ALLOWED: Record<string, Set<string>> = {
  /* Gate Round (owner mandate, 2026-08-17): every generated export is paid.
     The free tier keeps the project/settings JSON (client-side, workflow not
     deliverable), community publishing, and the stock Unity TEST KIT served
     by /api/test-kit — a fixed evaluation artifact, never their own design.
     The old three-piece starter grant (Unity bridge round) is retired. */
  free: new Set<string>(),
  student: new Set(["engine", "gamekit", "html", "svg", "sheet"]),
  pro: new Set(["engine", "gamekit", "html", "svg", "sheet"]),
};

/* The use grant, per plan. Mirrors LICENCE_GRANT in
   src/generator/entitlements.ts and Terms §5.6 — change all three
   together or the file will disagree with the page that sold it.
   No free entry: the free plan is never granted here (Gate Round). */
const GRANT: Record<string, string> = {
  student: `  Coursework, portfolio, personal projects and non-commercial
  releases — on any number of them, with no attribution required.

  Selling a product built with these assets, or shipping them in
  anything that earns revenue, needs a Pro licence. Upgrade any time
  at uikitmaker.com/#/pricing and re-export; the new licence replaces
  this one.`,
  pro: `  Ship these assets in any product you make, commercial included, on any
  number of projects, with no attribution required and no seat limit.`,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The licence block embedded in every paid artifact. It names the account
    the export belongs to, which makes a leaked kit traceable — the honest
    deterrent against redistribution, and a provenance record for the
    customer who actually bought it. */
function licenceText(email: string, uid: string, kind: string, whenISO: string, nonce: string, plan: string): string {
  // only paid plans reach this point (ALLOWED refuses free before any issue)
  return `UI Kit Maker — export licence
============================

Artifact      : ${kind}
Plan          : ${plan === "student" ? "Student / Educator (education licence)" : "Pro (commercial licence)"}
Licensed to   : ${email}
Account       : ${uid}
Issued        : ${whenISO}
Reference     : ${nonce}

WHAT YOU MAY DO
${GRANT[plan] ?? GRANT.pro}

WHAT YOU MAY NOT DO
  Resell or redistribute the assets themselves — as a kit, an asset pack,
  a template, or any other bundle whose value is these files.

  Images you uploaded to your account (your logo, for instance) remain
  entirely yours; nothing in this licence limits your rights to your
  own content.

This export was issued to the account above. Please don't share the file
itself; share the link and let people make their own.

uikitmaker.com
`;
}

export async function POST(req: Request): Promise<Response> {
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supaUrl || !service) return json({ error: "Exports aren't configured on this deployment." }, 503);

  let kind = "";
  try {
    kind = String(((await req.json()) as { kind?: string }).kind ?? "");
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  if (!KINDS.has(kind)) return json({ error: "Unknown export kind." }, 400);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sign in to export.", reason: "signin" }, 401);

  // identity comes from Supabase, never from the request body
  const who = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: service },
  });
  if (!who.ok) return json({ error: "Your session expired — sign in again.", reason: "signin" }, 401);
  const user = (await who.json()) as { id?: string; email?: string };
  if (!user.id) return json({ error: "Your session expired — sign in again.", reason: "signin" }, 401);

  const svc = { apikey: service, authorization: `Bearer ${service}` };

  // entitlement: read the plan from the row the client cannot write
  const pr = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${user.id}&select=plan_id,is_admin`, { headers: svc });
  if (!pr.ok) return json({ error: "Couldn't check your plan — try again." }, 502);
  const rows = (await pr.json()) as { plan_id?: string; is_admin?: boolean }[];
  const profile = rows[0];
  // admins carry pro rights; everyone else gets exactly what their plan buys
  const plan = !profile ? "free"
    : profile.is_admin === true ? "pro"
    : profile.plan_id === "student" ? "student"
    : (profile.plan_id && profile.plan_id !== "free") ? "pro"
    : "free";

  if (!ALLOWED[plan]?.has(kind)) {
    return json({
      error: plan === "free"
        ? "Exports are part of Pro. Your account keeps the project file — and the free Unity test kit, if you want to prove the import pipeline first."
        : "That export isn't part of your plan.",
      reason: "upgrade",
    }, 403);
  }

  // quiet rate limit — invisible to anyone exporting by hand
  const since = new Date(Date.now() - 3600_000).toISOString();
  const cnt = await fetch(
    `${supaUrl}/rest/v1/export_events?user_id=eq.${user.id}&created_at=gte.${since}&select=id`,
    { headers: { ...svc, prefer: "count=exact", range: "0-0" } },
  );
  const total = Number((cnt.headers.get("content-range") ?? "").split("/")[1] ?? "0");
  if (Number.isFinite(total) && total >= RATE_PER_HOUR) {
    return json({
      error: "That's a lot of exports in one hour — give it a few minutes and try again.",
      reason: "rate",
    }, 429);
  }

  const whenISO = new Date().toISOString();
  const nonce = crypto.randomUUID();

  await fetch(`${supaUrl}/rest/v1/export_events`, {
    method: "POST",
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ user_id: user.id, kind }),
  });

  return json({
    granted: true,
    kind,
    reference: nonce,
    issuedAt: whenISO,
    licensedTo: user.email ?? user.id,
    // the payload scope is a SERVER decision from plan_id — the builder
    // keys off this, so a client-side tier flip cannot widen the payload.
    // Only paid plans get grants now, so every grant is full scope; the
    // field stays so the builder's contract doesn't move.
    scope: "full",
    licence: licenceText(user.email ?? "(no email on file)", user.id, kind, whenISO, nonce, plan),
  });
}
