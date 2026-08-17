/* POST /api/test-kit — the registered tier's one download: the stock
   Unity evaluation kit.

   WHY THIS EXISTS (Gate Round, owner mandate 2026-08-17). Generated
   exports are paid. What a free account gets instead is ONE canned,
   pre-built stock Unity kit zip — the same fixed artifact for everyone,
   never the caller's own design — so a developer can prove the whole
   import pipeline (prefabs, scenes, gauges, words) in their engine
   before paying. It doubles as the kit published on the Unity Asset
   Store, so the artifact is admin-blessed, not generated here.

   THE MECHANISM, kit-agnostic by design: the blessed zip lives in the
   private `test-kit` storage bucket at a fixed object path. The admin
   swaps it from the #/admin desk (api/admin.ts testKitUpload) — no code
   change, no redeploy. This function checks only that the caller is a
   signed-in user (the download is the register incentive; guests get a
   401 the client turns into the sign-up pitch), then mints a
   short-lived signed download URL. The bytes go storage→browser
   directly; the bucket has no read policy, so this grant is the only
   door.

   No licence is stamped here — the artifact is fixed, and its
   evaluation-kit framing ships INSIDE the blessed zip (the admin
   exports it with the evaluation README before blessing it). */

const BUCKET = "test-kit";
const OBJECT = "unity-test-kit.zip";
const DOWNLOAD_AS = "uikm-unity-test-kit.zip";
const SIGN_TTL = 600; // seconds — long enough to click, short enough to not be a share link

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supaUrl || !service) return json({ error: "Downloads aren't configured on this deployment." }, 503);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "The Unity test kit comes with a free account — sign up and it's yours.", reason: "signin" }, 401);

  // identity comes from Supabase, never from the request body
  const who = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: service },
  });
  if (!who.ok) return json({ error: "Your session expired — sign in again.", reason: "signin" }, 401);
  const user = (await who.json()) as { id?: string };
  if (!user.id) return json({ error: "Your session expired — sign in again.", reason: "signin" }, 401);

  const svc = { apikey: service, authorization: `Bearer ${service}` };

  /* is the blessed zip stocked? A missing bucket and a missing object
     answer the same way — the admin hasn't blessed one yet. */
  const ls = await fetch(`${supaUrl}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...svc, "content-type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 100, offset: 0 }),
  });
  const objects = ls.ok ? ((await ls.json()) as { name?: string; updated_at?: string; metadata?: { size?: number } | null }[]) : [];
  const blessed = Array.isArray(objects) ? objects.find((o) => o.name === OBJECT) : undefined;
  if (!blessed) return json({ error: "The test kit isn't stocked on this deployment yet — check back shortly." }, 404);

  const sign = await fetch(`${supaUrl}/storage/v1/object/sign/${BUCKET}/${OBJECT}`, {
    method: "POST",
    headers: { ...svc, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: SIGN_TTL }),
  });
  if (!sign.ok) return json({ error: `Couldn't authorize the download (${sign.status}) — try again.` }, 502);
  const signed = (await sign.json()) as { signedURL?: string };
  if (!signed.signedURL) return json({ error: "Couldn't authorize the download — try again." }, 502);
  // the signed path is relative to /storage/v1; download= names the saved file
  const url = `${supaUrl}/storage/v1${signed.signedURL}${signed.signedURL.includes("?") ? "&" : "?"}download=${encodeURIComponent(DOWNLOAD_AS)}`;

  // best-effort ledger line — the admin pulse counts export_events
  await fetch(`${supaUrl}/rest/v1/export_events`, {
    method: "POST",
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ user_id: user.id, kind: "testkit" }),
  }).catch(() => { /* the download stands without the ledger line */ });

  return json({
    ok: true,
    url,
    filename: DOWNLOAD_AS,
    size: Number(blessed.metadata?.size ?? 0) || null,
    updatedAt: blessed.updated_at ?? null,
  });
}
