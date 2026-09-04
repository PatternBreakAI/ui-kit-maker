/* ── Durable backdrop assets ──────────────────────────────────────────
   Owner mandate (2026-08-16): "when I or a user uploads an image we need
   to know it's gonna be there when we return." Until now an uploaded
   backdrop lived only in this browser's IndexedDB vault — clear the
   cache, lose the art.

   The shape of the fix:
   - On import the ship copy (bgvault.normalizeShipCopy, ≤1920) is
     content-hashed and cached in the LOCAL vault under `asset://<hash>`
     — the same key every browser derives from the same bytes, so the
     vault becomes a cache of a durable truth instead of the only copy.
   - Signed in, the bytes also go UP once: /api/assets checks the
     account's tier quota (free 50 MB, paid 1 GB) and mints a signed
     upload URL into the private `bg-assets` bucket at <uid>/<hash>.
     Content addressing means re-importing the same file stores nothing
     twice and a duplicate board shares its sibling's bytes.
   - Every consumer resolves through resolveBgAsset(): vault first
     (instant), then the account's cloud copy (any signed-in browser) —
     verified against its own hash before it is trusted or cached, so a
     fabricated ref can never paint foreign bytes.
   - Guests keep today's local-only vault path byte-for-byte; the board
     panel shows the quiet "sign in to keep your images safe" note.

   WHY UPLOADS GO THROUGH /api/assets AND NOT STRAIGHT TO STORAGE: the
   quota is server truth. A storage INSERT policy for authenticated
   users would let any client mint its own signed upload URLs and skip
   the meter entirely — so the bucket has no insert policy at all, and
   the broker (service role) is the only door in. Reads and deletes stay
   client-direct behind owner-folder RLS, exactly like avatars.

   Deliberately NOT here (phase 2): deleting cloud copies (a saved
   project doc may still name a hash the workspace dropped — GC must
   read every doc first), and back-filling pre-existing local-only vault
   entries into the cloud. */

import { getClient, cloudConfig, accessToken, myProfileTier, readGateSnapshot } from "./cloud";
import { getBgOriginal, putBgOriginal, putBgAt } from "./bgvault";

const BUCKET = "bg-assets";
const REF_PREFIX = "asset://";
/* sha-256 prefix, 40 hex chars = 160 bits — far beyond accidental
   collision, comfortably shorter in every doc that carries it */
const HASH_LEN = 40;
const REF_RE = /^asset:\/\/[0-9a-f]{40,64}$/;

export const QUOTA_FREE = 50 * 1024 * 1024;
export const QUOTA_PAID = 1024 * 1024 * 1024;

export function isAssetRef(id: string | null | undefined): id is string {
  return typeof id === "string" && REF_RE.test(id);
}
const hashOf = (ref: string) => ref.slice(REF_PREFIX.length);

async function sha256Hex(blob: Blob): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; } // no SubtleCrypto (http on a LAN ip) — legacy path
}

/** The signed-in uid straight from the auth client — NOT cloud.ts's
 *  reconcile-gated session, so the resolver works the moment the parked
 *  session restores at boot, before the first workspace pull lands. */
async function uid(): Promise<string | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user.id ?? null;
  } catch { return null; }
}

/* ── activity pub/sub (the meter under the import control listens) ──── */

const listeners = new Set<() => void>();
export function onAssetActivity(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() { listeners.forEach((f) => { try { f(); } catch { /* listener's problem */ } }); }

/* ── the cloud ledger: which hashes this account has up, and how big ──
   One folder listing answers both "may this doc carry a ref instead of
   pixels?" and "what does the meter say?". Cached briefly; uploads and
   downloads patch it in place so the meter moves without a refetch. */

let ledger: Set<string> | null = null;
let ledgerUsed = 0;
let ledgerAt = 0;
let ledgerP: Promise<Set<string> | null> | null = null;

async function cloudLedger(maxAgeMs = 30_000): Promise<Set<string> | null> {
  const u = await uid();
  if (!u) return null;
  if (ledger && Date.now() - ledgerAt < maxAgeMs) return ledger;
  if (!ledgerP) {
    ledgerP = (async () => {
      const client = await getClient();
      if (!client) return null;
      const { data, error } = await client.storage.from(BUCKET).list(u, { limit: 1000 });
      if (error || !data) return null; // read failed — callers keep embedding pixels
      const s = new Set<string>();
      let used = 0;
      for (const o of data) {
        if (/^[0-9a-f]{40,64}$/.test(o.name)) s.add(o.name);
        used += Number((o.metadata as { size?: number } | null)?.size ?? 0) || 0;
      }
      ledger = s; ledgerUsed = used; ledgerAt = Date.now();
      return s;
    })().finally(() => { ledgerP = null; });
  }
  return ledgerP;
}

/** True only when this exact asset is VERIFIED present in the caller's
 *  cloud folder — the gate that lets a saved doc carry a ref instead of
 *  embedded pixels. Anything unverified embeds, so nothing ever saves a
 *  doc whose backdrop exists nowhere. */
export async function assetCloudBacked(id: string): Promise<boolean> {
  if (!isAssetRef(id)) return false;
  const set = await cloudLedger();
  return !!set?.has(hashOf(id));
}

/* ── upload (fire-and-forget after import; the vault copy stands alone
      until it lands, and the save path embeds pixels until verified) ── */

let notice: string | null = null; // last quota refusal, for the meter line

type Grant = { ok?: boolean; already?: boolean; path?: string; token?: string; used?: number; quota?: number; error?: string };

async function uploadToCloud(hash: string, blob: Blob): Promise<boolean> {
  const cfg = cloudConfig();
  const token = await accessToken();
  if (!cfg || !token) return false;
  try {
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "grant", hash, size: blob.size, type: blob.type || "application/octet-stream" }),
    });
    const g = (await res.json().catch(() => ({}))) as Grant;
    if (!res.ok) {
      if (res.status === 413 && g.error) { notice = g.error; notify(); }
      return false;
    }
    if (g.already) {
      notice = null;
      if (ledger) ledger.add(hash);
      notify();
      return true;
    }
    if (!g.path || !g.token) return false;
    /* the bytes go STRAIGHT to storage with the broker's one-time token —
       no function body limits, no service key anywhere near the client */
    const put = await fetch(
      `${cfg.url}/storage/v1/object/upload/sign/${BUCKET}/${g.path}?token=${encodeURIComponent(g.token)}`,
      { method: "PUT", headers: { "content-type": blob.type || "application/octet-stream", "x-upsert": "true" }, body: blob },
    );
    if (!put.ok) return false;
    notice = null;
    if (ledger) { ledger.add(hash); ledgerUsed += blob.size; }
    notify();
    return true;
  } catch { return false; }
}

/* ── the import door: every uploaded backdrop enters here ───────────── */

/** Vault the ship copy and (signed in) send it up. Returns the id to pin
 *  on the board: an `asset://<hash>` ref when the account can own a
 *  durable copy, or today's local vault id for guests — the exact
 *  pre-cloud behavior, unchanged. */
export async function importBgAsset(ship: Blob, name?: string): Promise<string | null> {
  const u = await uid();
  const hash = u ? (await sha256Hex(ship))?.slice(0, HASH_LEN) : null;
  if (!u || !hash) return putBgOriginal(ship, name);
  const ref = REF_PREFIX + hash;
  await putBgAt(ref, ship, name); // write-through cache; a refusal only costs a later re-download
  void uploadToCloud(hash, ship);
  notify();
  return ref;
}

/* ── the resolver: ref → vault → cloud, verified ────────────────────── */

const inflight = new Map<string, Promise<{ blob: Blob; name: string; type: string } | null>>();

/** Every bgAssetId consumer reads through here. Legacy `bg…` vault ids
 *  behave exactly as before (vault or nothing); `asset://` refs fall
 *  through to the account's cloud copy and re-seed the vault, which is
 *  how a backdrop follows its owner to a new browser. */
export async function resolveBgAsset(id: string): Promise<{ blob: Blob; name: string; type: string } | null> {
  const local = await getBgOriginal(id);
  if (local) return local;
  if (!isAssetRef(id)) return null;
  const running = inflight.get(id);
  if (running) return running;
  const p = (async () => {
    const client = await getClient();
    const u = await uid();
    if (!client || !u) return null;
    const hash = hashOf(id);
    const { data, error } = await client.storage.from(BUCKET).download(`${u}/${hash}`);
    if (error || !data) return null;
    /* trust nothing that doesn't hash to its own name — this is what
       makes a foreign ref harmless: it can only ever alias identical bytes */
    const got = await sha256Hex(data);
    if (!got || got.slice(0, hash.length) !== hash) return null;
    const rec = { blob: data, name: "backdrop", type: data.type || "image/png" };
    await putBgAt(id, data, rec.name); // re-seed the cache
    if (ledger) ledger.add(hash);
    notify();
    return rec;
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/* ── stable display URLs ──────────────────────────────────────────────
   One object URL per asset id, for the page's lifetime. The display URL
   is IDENTITY: every re-mint swaps the CSS background url and the
   browser re-decodes the image — on live that read as the backdrop
   flickering in time with sync activity (owner report, 2026-08-16). So
   re-resolving a backdrop must hand back the SAME url it handed before.
   URLs are reclaimed by the page unload; at backdrops-per-workspace
   scale that is a handful of entries, never a leak that matters. */

const displayUrls = new Map<string, string>();

/** A BUNDLED art path — `/kit-art/…`, the same road `/backdrops/…` rides
 *  in a board's bgImage. A shipped kit's own art travels in the repo, so
 *  it needs no vault and no account: the path IS the display url, and it
 *  paints for a signed-out stranger on first visit.
 *
 *  Strict on purpose. This string lands in an `<img src>` (and, on the
 *  backdrop road, in CSS url()), and payload strings arrive from share
 *  links and cloud docs — so nothing but a same-origin path to a shipped
 *  raster gets through: absolute, no scheme, no `//` host, no `..`, one
 *  of three image extensions. */
const BUNDLED_ART_RE = /^\/[A-Za-z0-9][A-Za-z0-9._\-/]*\.(?:png|jpe?g|webp)$/;
export function isBundledArt(s: string | null | undefined): s is string {
  return typeof s === "string" && BUNDLED_ART_RE.test(s) && !s.includes("..") && !s.startsWith("//");
}

/** The url a board should PAINT for a vaulted/cloud backdrop — resolved
 *  once per asset id and cached. Consumers that need the bytes (export,
 *  embedding) keep using resolveBgAsset directly. */
export async function bgAssetDisplayUrl(id: string): Promise<string | null> {
  if (isBundledArt(id)) return id; // shipped art: the path is the url
  const hit = displayUrls.get(id);
  if (hit) return hit;
  const rec = await resolveBgAsset(id);
  if (!rec) return null;
  const raced = displayUrls.get(id); // a concurrent caller may have minted it
  if (raced) return raced;
  const url = URL.createObjectURL(rec.blob);
  displayUrls.set(id, url);
  return url;
}

/* ── the quiet line under the import control ────────────────────────── */

function fmtBytes(n: number): string {
  if (n >= 999.5 * 1048576) { const g = n / 1073741824; return `${g >= 10 || Number.isInteger(g) ? Math.round(g) : g.toFixed(1)} GB`; }
  const m = n / 1048576;
  return `${m > 0 && m < 10 ? Math.max(0.1, Math.round(m * 10) / 10) : Math.round(m)} MB`;
}

function quotaForPlan(plan: string | null): number {
  return plan && plan !== "free" && plan !== "guest" ? QUOTA_PAID : QUOTA_FREE;
}

/** The keep-safe line: null (cloud off — nothing to promise), the
 *  sign-in nudge for guests, or the meter for account holders. The
 *  DISPLAY quota comes from the profile tier; the ENFORCED quota lives
 *  in /api/assets and never believes the client. */
export async function bgAssetStatusLine(): Promise<string | null> {
  if (!cloudConfig()) return null;
  const u = await uid();
  if (!u) return "Sign in to keep your images safe — for now this upload lives only in this browser.";
  const set = await cloudLedger(10_000);
  if (!set) return notice; // listing failed — stay quiet rather than guess
  const prof = await myProfileTier();
  const plan = prof.plan ?? (prof.undecided ? readGateSnapshot()?.tier ?? null : null);
  const line = `${fmtBytes(ledgerUsed)} of ${fmtBytes(quotaForPlan(plan))} · backdrops save to your account`;
  return notice ? `${line} — ${notice}` : line;
}
