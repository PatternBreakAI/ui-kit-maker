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
       pass decides the carousel wants more.
       `hidden` and `order` ride along: the admin's homepage curation
       (app_settings.hidden_landing_kits + landing_kit_order, world-
       readable by RLS) — the landing has no Supabase client, so this
       feed is its one channel. Both are arrays of the same lowercase
       match keys; `order` says who shows first. */
    const headers = { apikey: service, authorization: `Bearer ${service}` };
    const [res, setRes] = await Promise.all([
      /* limit 16 — the reel's stated ceiling. The rack orders every
         designated hero explicitly now, so the old newest-8 window is
         gone; the cap only guards against unbounded designation lists. */
      fetch(
        `${supaUrl}/rest/v1/kit_designations?placement=eq.hero&select=preset_name,created_at,cfg:snapshot->cfg&order=created_at.desc&limit=16`,
        { headers },
      ),
      fetch(`${supaUrl}/rest/v1/app_settings?key=in.(hidden_landing_kits,landing_kit_order)&select=key,value`, { headers })
        .catch(() => null),
    ]);
    let hidden: string[] = [];
    let order: string[] = [];
    if (setRes?.ok) {
      const srows = (await setRes.json()) as { key: string; value: unknown }[];
      const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 64) : []);
      hidden = strings(srows.find((r) => r.key === "hidden_landing_kits")?.value);
      order = strings(srows.find((r) => r.key === "landing_kit_order")?.value);
    }
    if (!res.ok) return json({ heroes: [], hidden, order });
    const rows = (await res.json()) as { preset_name: string; created_at: string; cfg: unknown }[];
    return json({
      heroes: rows
        .filter((r) => r.cfg && typeof r.cfg === "object")
        .map((r) => ({ name: r.preset_name, cfg: r.cfg, frozenAt: r.created_at })),
      hidden,
      order,
    }, true);
  } catch {
    return json({ heroes: [] });
  }
}
