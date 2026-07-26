/* GET /api/hero-lineup — the homepage carousel's public feed.

   The Release desk (api/admin.ts "designate", placement 'hero') freezes
   kits into kit_designations — an ADMIN-ONLY table, because it also
   holds deal notes and unreleased work. The landing page is public, so
   it can never read that table directly. This endpoint is the bridge:
   it serves ONLY what a hero placement means to publish — the release
   name and the design recipe — and nothing else. No deal notes, no
   maker emails, no source ids, no full snapshots.

   Fail-soft by contract: the homepage must never break because this
   feed hiccuped. Any trouble returns an empty lineup with a 200, and
   the landing keeps its built-in presets.

   Cached at the CDN (s-maxage) so a hero designation reaches the
   homepage within ~5 minutes without hammering the database. */

function json(body: unknown, cache = false): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": cache
        ? "public, s-maxage=300, stale-while-revalidate=3600"
        : "no-store",
    },
  });
}

export async function GET(): Promise<Response> {
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supaUrl || !service) return json({ heroes: [] });

  try {
    /* snapshot->cfg only — the design recipe is the entire public
       surface of a hero designation; the rest of the snapshot (labels,
       backdrop, per-component work) stays in the vault until a wiring
       pass decides the carousel wants more. */
    const res = await fetch(
      `${supaUrl}/rest/v1/kit_designations?placement=eq.hero&select=preset_name,created_at,cfg:snapshot->cfg&order=created_at.desc&limit=8`,
      { headers: { apikey: service, authorization: `Bearer ${service}` } },
    );
    if (!res.ok) return json({ heroes: [] });
    const rows = (await res.json()) as { preset_name: string; created_at: string; cfg: unknown }[];
    return json({
      heroes: rows
        .filter((r) => r.cfg && typeof r.cfg === "object")
        .map((r) => ({ name: r.preset_name, cfg: r.cfg, frozenAt: r.created_at })),
    }, true);
  } catch {
    return json({ heroes: [] });
  }
}
