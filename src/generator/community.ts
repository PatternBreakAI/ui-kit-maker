/* Community-lite — the browser's half of the gallery.

   The operating principle (owner, 2026-07-25): everything happens in your
   browser. One fetch per page view; every card renders LIVE from the
   kit's saved settings with the same engine that draws the editor; likes
   flip optimistically and sync underneath; counts refresh when the page
   does. No realtime, no server rendering.

   Reads ride RLS: the projects select policy already shows public rows
   to everyone, `listed` is the admin's curation flag (column-revoked from
   owners), and public_profiles is the view that exposes exactly the
   public face of a profile and nothing else. */

import { getClient, currentSession, cloudConfig } from "./cloud";

export type CommunityCard = {
  id: string; name: string; share_slug: string | null; user_id: string;
  updated_at: string; listed: boolean;
  likes: number;
  /** the visitor's own like, for the optimistic heart */
  liked: boolean;
  handle: string | null; display_name: string | null; avatar_path: string | null;
};

/** The gallery feed: curated (listed) public kits, newest first. Admins
    also receive the UNLISTED public kits — their curation queue — marked
    by `listed:false`. One fetch, no doc payloads (cards lazy-load those). */
export async function listCommunity(opts?: { includeQueue?: boolean }): Promise<{ cards: CommunityCard[]; error: string | null }> {
  const client = await getClient();
  if (!client) return { cards: [], error: "Community isn't available on this deployment." };
  let q = client.from("projects")
    .select("id, name, share_slug, user_id, updated_at, listed, likes(count)")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(48);
  if (!opts?.includeQueue) q = q.eq("listed", true);
  const { data, error } = await q;
  if (error) return { cards: [], error: error.message };
  const rows = (data ?? []) as unknown as { id: string; name: string; share_slug: string | null; user_id: string; updated_at: string; listed: boolean; likes: { count: number }[] }[];

  // the makers' public faces — separate query (no FK path for an embed)
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const profs = new Map<string, { handle: string | null; display_name: string | null; avatar_path: string | null }>();
  if (ids.length) {
    const { data: ps, error: perr } = await client.from("public_profiles")
      .select("id, handle, display_name, avatar_path").in("id", ids);
    // absent view (schema drift) leaves every byline as "a maker" — say why
    if (perr) console.warn("[community] profiles fetch failed:", perr.message);
    for (const p of (ps ?? []) as { id: string; handle: string | null; display_name: string | null; avatar_path: string | null }[]) {
      profs.set(p.id, p);
    }
  }

  // the visitor's own likes, for the hearts
  const mine = new Set<string>();
  const session = currentSession();
  if (session) {
    const { data: ls } = await client.from("likes")
      .select("project_id").eq("user_id", session.user.id).in("project_id", rows.map((r) => r.id));
    for (const l of (ls ?? []) as { project_id: string }[]) mine.add(l.project_id);
  }

  return {
    /* fields copied EXPLICITLY — the profile row carries its own `id`
       (the maker's uuid), and spreading it over the card overwrote the
       PROJECT id with the USER id. Every doc fetch, like and curation
       then targeted a project that doesn't exist: the whole wall dashed
       the moment the first maker profile appeared (owner report,
       2026-07-26). Never spread a row that carries an id. */
    cards: rows.map((r) => {
      const p = profs.get(r.user_id);
      return {
        id: r.id, name: r.name, share_slug: r.share_slug, user_id: r.user_id,
        updated_at: r.updated_at, listed: r.listed,
        likes: r.likes?.[0]?.count ?? 0,
        liked: mine.has(r.id),
        handle: p?.handle ?? null,
        display_name: p?.display_name ?? null,
        avatar_path: p?.avatar_path ?? null,
      };
    }),
    error: null,
  };
}

/** Optimistic like/unlike. The caller flips the heart first; this syncs.
    Errors return quietly — the true count arrives on the next refresh,
    which is the community-lite contract. */
export async function setLike(projectId: string, on: boolean): Promise<string | null> {
  const client = await getClient();
  const session = currentSession();
  if (!client || !session) return "Sign in to like kits.";
  const r = on
    ? await client.from("likes").insert({ project_id: projectId, user_id: session.user.id })
    : await client.from("likes").delete().eq("project_id", projectId).eq("user_id", session.user.id);
  // a duplicate like (double-click) is not an error worth surfacing
  if (r.error && !/duplicate/i.test(r.error.message)) return r.error.message;
  return null;
}

/** Admin curation: put a public kit on (or off) the gallery. RLS admits
    only admins to the `listed` column — everyone else gets an error. */
export async function curateProject(id: string, listed: boolean): Promise<string | null> {
  const client = await getClient();
  const session = currentSession();
  if (!client || !session) return "Sign in as an admin.";
  const { error } = await client.from("projects").update({ listed }).eq("id", id);
  return error ? error.message : null;
}

/** The signed-in user's public face, for the studio page editors. */
export async function myPublicProfile(): Promise<{ handle: string | null; display_name: string | null; avatar_path: string | null } | null> {
  const client = await getClient();
  const session = currentSession();
  if (!client || !session) return null;
  const { data } = await client.from("public_profiles")
    .select("handle, display_name, avatar_path").eq("id", session.user.id).maybeSingle();
  return (data as { handle: string | null; display_name: string | null; avatar_path: string | null } | null) ?? null;
}

/** Claim or change the public face. The handle is the profile URL, so it
    is validated here AND by the table's check constraint. */
export async function setMyPublicProfile(patch: { handle?: string | null; display_name?: string | null }): Promise<string | null> {
  const client = await getClient();
  const session = currentSession();
  if (!client || !session) return "Sign in first.";
  if (patch.handle != null && patch.handle !== "" && !/^[a-z0-9_]{3,20}$/.test(patch.handle)) {
    return "Handles are 3–20 characters: lowercase letters, numbers, underscore.";
  }
  const row: Record<string, unknown> = {};
  if (patch.handle !== undefined) row.handle = patch.handle === "" ? null : patch.handle;
  if (patch.display_name !== undefined) row.display_name = (patch.display_name ?? "").trim().slice(0, 40) || null;
  const { error } = await client.from("profiles").update(row).eq("id", session.user.id);
  if (error) return /duplicate|unique/i.test(error.message) ? "That handle is taken." : error.message;
  return null;
}

/** A public profile by handle, with their curated kits. */
export async function publicProfile(handle: string): Promise<{
  profile: { id: string; handle: string | null; display_name: string | null; avatar_path: string | null } | null;
  cards: CommunityCard[]; error: string | null;
}> {
  const client = await getClient();
  if (!client) return { profile: null, cards: [], error: "Community isn't available on this deployment." };
  const { data: p, error } = await client.from("public_profiles")
    .select("id, handle, display_name, avatar_path").eq("handle", handle).maybeSingle();
  if (error) return { profile: null, cards: [], error: error.message };
  if (!p) return { profile: null, cards: [], error: null };
  const prof = p as { id: string; handle: string | null; display_name: string | null; avatar_path: string | null };
  const { data: rows } = await client.from("projects")
    .select("id, name, share_slug, user_id, updated_at, listed, likes(count)")
    .eq("user_id", prof.id).eq("is_public", true).eq("listed", true)
    .order("updated_at", { ascending: false }).limit(48);
  const rs = (rows ?? []) as unknown as { id: string; name: string; share_slug: string | null; user_id: string; updated_at: string; listed: boolean; likes: { count: number }[] }[];
  // the visitor's own hearts, same as the gallery feed
  const mine = new Set<string>();
  const session = currentSession();
  if (session && rs.length) {
    const { data: ls } = await client.from("likes")
      .select("project_id").eq("user_id", session.user.id).in("project_id", rs.map((r) => r.id));
    for (const l of (ls ?? []) as { project_id: string }[]) mine.add(l.project_id);
  }
  return {
    profile: prof,
    cards: rs.map((r) => ({
      id: r.id, name: r.name, share_slug: r.share_slug, user_id: r.user_id,
      updated_at: r.updated_at, listed: r.listed, likes: r.likes?.[0]?.count ?? 0, liked: mine.has(r.id),
      handle: prof.handle, display_name: prof.display_name, avatar_path: prof.avatar_path,
    })),
    error: null,
  };
}

/** Community-side detail on the signed-in user's own kits: curation flag
    and heart counts. Best-effort by design — if the community migration
    isn't applied yet this returns empty and the studio still works. */
export async function myWork(): Promise<Map<string, { listed: boolean; likes: number }>> {
  const out = new Map<string, { listed: boolean; likes: number }>();
  const client = await getClient();
  const session = currentSession();
  if (!client || !session) return out;
  const { data, error } = await client.from("projects")
    .select("id, listed, likes(count)").eq("user_id", session.user.id);
  if (error) return out;
  for (const r of (data ?? []) as unknown as { id: string; listed: boolean; likes: { count: number }[] }[]) {
    out.set(r.id, { listed: !!r.listed, likes: r.likes?.[0]?.count ?? 0 });
  }
  return out;
}

/** Public URL for an avatar path — the bucket is public by design (they
    render on community cards), so this is plain string assembly. */
export function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  const cfg = cloudConfig();
  if (!cfg) return null;
  return `${cfg.url}/storage/v1/object/public/avatars/${path}`;
}

/** Upload a profile picture: crop-to-square, shrink to 256px, store under
    the owner's folder with a fresh name (so caches never show the old
    face), point the profile at it, then sweep the previous file. */
export async function uploadAvatar(file: File): Promise<string | null> {
  const client = await getClient();
  const session = currentSession();
  if (!client || !session) return "Sign in first.";
  if (!/^image\//.test(file.type)) return "That isn't an image file.";
  if (file.size > 8 * 1024 * 1024) return "Pick an image under 8 MB.";

  // decode → cover-crop to a 256×256 canvas
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = document.createElement("img");
      i.onload = () => res(i); i.onerror = () => rej(new Error("decode"));
      i.src = url;
    });
  } catch {
    URL.revokeObjectURL(url);
    return "Couldn't read that image — try a PNG or JPEG.";
  }
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) { URL.revokeObjectURL(url); return "This browser can't process images."; }
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
  URL.revokeObjectURL(url);
  // webp where the encoder exists, png everywhere else (Safari's canvas
  // webp support is not a given)
  let blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.9));
  let ext = "webp";
  if (!blob) {
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    ext = "png";
  }
  if (!blob) return "This browser can't process images.";

  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const stamp = [...bytes].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b & 31]).join("");
  const path = `${session.user.id}/avatar-${stamp}.${ext}`;

  const old = await myPublicProfile();
  const up = await client.storage.from("avatars").upload(path, blob, { contentType: blob.type });
  if (up.error) return up.error.message;
  const { error } = await client.from("profiles").update({ avatar_path: path }).eq("id", session.user.id);
  if (error) return error.message;
  if (old?.avatar_path && old.avatar_path !== path) {
    // best-effort sweep — a stale file in the owner's folder harms nothing
    void client.storage.from("avatars").remove([old.avatar_path]);
  }
  return null;
}

/** A public kit's settings, for the live card render. Same RLS door the
    share links use — public rows only, unless it's yours. */
export async function fetchCardDoc(id: string): Promise<Record<string, unknown> | null> {
  const client = await getClient();
  if (!client) return null;
  const { data, error } = await client.from("projects").select("doc").eq("id", id).maybeSingle();
  // a schema/RLS miss here renders every card as "—" with no trace; say why
  if (error) console.warn("[community] doc fetch failed:", error.message);
  return ((data as { doc?: Record<string, unknown> } | null)?.doc) ?? null;
}
