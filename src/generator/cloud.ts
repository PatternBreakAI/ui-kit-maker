/* Cloud accounts + cloud saves — Phase 1 of the commercial architecture
   (docs/commercial-architecture.md). Supabase provides managed auth and
   Postgres; this module is the app's single client-side account boundary.

   Design rules, from the business plan and Appendix A:
   - No custom auth, no passwords stored here — Supabase Auth only.
   - Zero footprint when unconfigured: every entry point no-ops and the app
     behaves exactly as the local-only build.
   - Everything the app persists lives under localStorage "ui-generator-*";
     the cloud document is that keyspace, whole-doc, last-write-wins.

   Sync-safety invariants (each one exists because an adversarial review
   found the failure it prevents):
   1. No push before a successful pull (`reconciled` gate) — a failed first
      pull must never let a near-empty local doc clobber the cloud copy.
   2. Edits stamp forge-cloud-lastedit at WRITE time (storage hook), signed
      in or not — never only at poll time, so closing the tab right after
      an edit cannot silently lose it to a stale server copy.
   3. applyDoc verifies what landed; the server-wins reload only happens
      when the pulled doc verifiably applied, and a per-tab counter caps
      reloads so a quota failure can never loop the page.
   4. The local keyspace remembers which account it belongs to
      (forge-cloud-owner); a different user signing in on the same browser
      NEVER uploads the previous user's work.
   5. Pushes are serialized, retried with backoff, and rebase first when
      another device has written since our last pull.
   6. The one local snapshot taken when the server wins (prevlocal) is
      restorable from the account menu and never silently overwritten. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const TERMS_VERSION = "v1-2026-07-23";

const SYNC_PREFIX = "ui-generator";
const K_URL = "forge-cloud-url";        // owner override: Supabase project URL
const K_ANON = "forge-cloud-anon";      // owner override: anon (public) key
const K_LASTEDIT = "forge-cloud-lastedit";
const K_OWNER = "forge-cloud-owner";    // which account this device's doc belongs to
const K_PREVLOCAL = "forge-cloud-prevlocal"; // snapshot kept when the server copy wins
const K_CONSENT_PENDING = "forge-cloud-consent";
const K_RELOADS = "forge-cloud-reloads"; // sessionStorage: pull-reload loop guard
const K_GATES = "forge-cloud-gates";    // last authoritative visibility gates (admin/tier/releases)

/* ── configuration ─────────────────────────────────────────────────── */

export type CloudConfig = { url: string; anonKey: string; fromOverride: boolean };

export function cloudConfig(): CloudConfig | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  let url = env.VITE_SUPABASE_URL ?? "";
  let anonKey = env.VITE_SUPABASE_ANON_KEY ?? "";
  let fromOverride = false;
  if (!url || !anonKey) {
    try {
      const u = localStorage.getItem(K_URL) ?? "";
      const a = localStorage.getItem(K_ANON) ?? "";
      if (u && a) { url = u; anonKey = a; fromOverride = true; }
    } catch { /* storage unavailable */ }
  }
  return url && anonKey ? { url, anonKey, fromOverride } : null;
}

/** Owner convenience: connect a Supabase project at runtime (per browser),
    so the live static deploy can be tested before build-time env vars exist.
    The anon key is public by design — safety comes from RLS, not secrecy. */
export function setCloudOverride(url: string, anonKey: string) {
  try {
    localStorage.setItem(K_URL, url.trim().replace(/\/+$/, ""));
    localStorage.setItem(K_ANON, anonKey.trim());
  } catch { /* ignore */ }
}
export function clearCloudOverride() {
  try { localStorage.removeItem(K_URL); localStorage.removeItem(K_ANON); } catch { /* ignore */ }
}

/* ── client ────────────────────────────────────────────────────────── */

let clientP: Promise<SupabaseClient | null> | null = null;

export function getClient(): Promise<SupabaseClient | null> {
  if (!clientP) {
    const cfg = cloudConfig();
    clientP = !cfg
      ? Promise.resolve(null)
      : import("@supabase/supabase-js").then(({ createClient }) =>
          createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } }));
  }
  return clientP;
}

/* ── the cloud document: the whole ui-generator-* keyspace ─────────── */

let applying = false; // suspends the write hook while a pull writes keys

export function collectDoc(): Record<string, string> {
  const doc: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SYNC_PREFIX)) doc[k] = localStorage.getItem(k) ?? "";
    }
  } catch { /* storage unavailable */ }
  return doc;
}

/** Replace-all semantics: the doc IS the keyspace, so keys absent from it
    are removed (a factory reset on one device must reset the others).
    Returns true only when the applied keyspace verifiably matches `doc` —
    a quota abort mid-apply returns false so callers never reload into a
    half-written state. */
export function applyDoc(doc: Record<string, string>): boolean {
  applying = true;
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(SYNC_PREFIX) && !(k in doc))
      .forEach((k) => localStorage.removeItem(k));
    for (const [k, v] of Object.entries(doc)) {
      if (k.startsWith(SYNC_PREFIX)) localStorage.setItem(k, v);
    }
  } catch { /* quota — verification below reports the truth */ }
  finally { applying = false; }
  return docSignature(collectDoc()) === docSignature(doc);
}

/** FNV-1a over sorted keys+values — full-content signature, order-proof. */
export function docSignature(doc: Record<string, string>): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= 0xff; h = Math.imul(h, 0x01000193);
  };
  const keys = Object.keys(doc).sort();
  for (const k of keys) { mix(k); mix(doc[k]); }
  return (h >>> 0).toString(36) + ":" + keys.length;
}

/* ── status pub/sub (TopBar chip + account menu subscribe here) ────── */

export type CloudState = "off" | "signedout" | "syncing" | "synced" | "error" | "recovery";
export type CloudStatus = { state: CloudState; email?: string; syncedAt?: number; detail?: string };

let status: CloudStatus = { state: "off" };
const listeners = new Set<(s: CloudStatus) => void>();

function setStatus(next: CloudStatus) {
  status = next;
  listeners.forEach((fn) => fn(status));
}
export function cloudStatus() { return status; }
export function onCloudStatus(fn: (s: CloudStatus) => void): () => void {
  listeners.add(fn); fn(status);
  return () => listeners.delete(fn);
}

/* ── sync engine state ─────────────────────────────────────────────── */

let session: Session | null = null;
/** The live session, read-only — community.ts needs the uid for likes. */
export function currentSession(): Session | null { return session; }
let reconciled = false;       // invariant 1: no push until a pull decided
let recoveryHold = false;     // password-recovery pauses normal session start
let pollT: ReturnType<typeof setInterval> | null = null;
let pushT: ReturnType<typeof setTimeout> | null = null;
let retryT: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let pushQueued = false;
let pushAttempts = 0;
let lastSig = "";
let pushedSig = "";
let lastSeenServerAt = 0;     // server updated_at at our last pull/push
let started = false;
let hookInstalled = false;
/* invariant 6: a wholesale local replace (opening a project, loading a
   share) always beats an in-flight pull. Each replace bumps the
   generation; a pull only applies if the generation it started under is
   still current — otherwise the user's explicit choice would be stomped
   by an older working doc arriving late ("I saw it for a second but then
   the [old] version took over", owner). */
let docGen = 0;

const email = () => session?.user.email ?? undefined;

function stampEdit() {
  try { localStorage.setItem(K_LASTEDIT, String(Date.now())); } catch { /* ignore */ }
}

/* invariant 2: stamp at write time, signed in or not. Patch the storage
   prototype once; `applying` suspends it during pulls so a pull is never
   mistaken for a local edit. */
function installWriteHook() {
  if (hookInstalled) return;
  hookInstalled = true;
  try {
    const proto = Object.getPrototypeOf(window.localStorage) as Storage;
    const origSet = proto.setItem, origRemove = proto.removeItem, origClear = proto.clear;
    const touched = () => {
      if (applying) return;
      stampEdit();
      if (session && reconciled) {
        setStatus({ state: "syncing", email: email() });
        schedulePush();
      }
    };
    proto.setItem = function (k: string, v: string) {
      origSet.call(this, k, v);
      if (this === window.localStorage && typeof k === "string" && k.startsWith(SYNC_PREFIX)) touched();
    };
    proto.removeItem = function (k: string) {
      origRemove.call(this, k);
      if (this === window.localStorage && typeof k === "string" && k.startsWith(SYNC_PREFIX)) touched();
    };
    proto.clear = function () {
      origClear.call(this);
      if (this === window.localStorage) touched();
    };
  } catch { /* exotic environment — the 3s poll still covers changes */ }
}

/* ── push (invariant 5: serialized, retried, rebases when stale) ───── */

async function doPush(): Promise<void> {
  const client = await getClient();
  if (!client || !session || !reconciled) return;
  if (pushing) { pushQueued = true; return; }
  pushing = true;
  try {
    // rebase check: has another device written since our last pull/push?
    const { data: cur, error: curErr } = await client.from("workspaces")
      .select("updated_at").eq("user_id", session.user.id).maybeSingle();
    if (!curErr && cur && Date.parse(cur.updated_at as string) > lastSeenServerAt) {
      const s = session;
      reconciled = false;
      pushing = false;
      await reconcile(client, s);
      return;
    }
    const doc = collectDoc();
    const sig = docSignature(doc);
    if (sig === pushedSig) {
      setStatus({ state: "synced", email: email(), syncedAt: Date.now() });
      return;
    }
    setStatus({ state: "syncing", email: email() });
    const { data, error } = await client.from("workspaces")
      .upsert({ user_id: session.user.id, doc }, { onConflict: "user_id" })
      .select("updated_at").maybeSingle();
    if (error) {
      pushAttempts++;
      setStatus({ state: "error", email: email(), detail: error.message });
      schedulePush(Math.min(60_000, 5_000 * 2 ** Math.min(pushAttempts, 4)));
    } else {
      pushAttempts = 0;
      pushedSig = sig;
      if (data?.updated_at) lastSeenServerAt = Date.parse(data.updated_at as string) || lastSeenServerAt;
      setStatus({ state: "synced", email: email(), syncedAt: Date.now() });
    }
  } finally {
    pushing = false;
    if (pushQueued) { pushQueued = false; schedulePush(80); }
  }
}

function schedulePush(ms = 1200) {
  if (pushT) clearTimeout(pushT);
  pushT = setTimeout(() => { pushT = null; void doPush(); }, ms);
}

/** A wholesale local replace (opening a project, loading a share into the
    editor) — the user's explicit choice becomes the local truth. Bumps the
    doc generation so any in-flight pull aborts instead of stomping it, and
    pushes the new doc when the session is settled. */
export function noteLocalDocReplaced() {
  docGen++;
  stampEdit();
  if (session && reconciled) {
    setStatus({ state: "syncing", email: email() });
    schedulePush();
  }
}

/** Force a push right now (Sync now button, tab going hidden). */
export function syncNow() {
  if (pushT) { clearTimeout(pushT); pushT = null; }
  void doPush();
}

function startWatch() {
  if (pollT) clearInterval(pollT);
  lastSig = docSignature(collectDoc());
  // safety net behind the write hook — catches anything the hook missed
  pollT = setInterval(() => {
    if (!session || !reconciled) return;
    const sig = docSignature(collectDoc());
    if (sig !== lastSig) { lastSig = sig; stampEdit(); schedulePush(); }
  }, 3000);
}

function stopWatch() {
  if (pollT) { clearInterval(pollT); pollT = null; }
  if (pushT) { clearTimeout(pushT); pushT = null; }
  if (retryT) { clearTimeout(retryT); retryT = null; }
}

/* ── consent records (bound to the identity that accepted) ─────────── */

type PendingConsent = { email: string; version: string; locale: string | null; acceptedAt: string };

function setPendingConsent(forEmail: string) {
  const p: PendingConsent = {
    email: forEmail.toLowerCase(), version: TERMS_VERSION,
    locale: typeof navigator !== "undefined" ? navigator.language : null,
    acceptedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(K_CONSENT_PENDING, JSON.stringify(p)); } catch { /* ignore */ }
}
function clearPendingConsent() {
  try { localStorage.removeItem(K_CONSENT_PENDING); } catch { /* ignore */ }
}

async function recordPendingConsent(client: SupabaseClient) {
  if (!session) return;
  let pending: PendingConsent | null = null;
  try { pending = JSON.parse(localStorage.getItem(K_CONSENT_PENDING) ?? "null"); } catch { clearPendingConsent(); }
  if (!pending || typeof pending !== "object" || !pending.version) return;
  // only attribute the record to the account that actually accepted;
  // a different user signing in on this browser leaves the marker alone
  if ((session.user.email ?? "").toLowerCase() !== pending.email) return;
  const { error } = await client.from("terms_acceptances").insert({
    user_id: session.user.id, version: pending.version,
    locale: pending.locale, age_13_plus: true, accepted_at: pending.acceptedAt,
  });
  if (!error) clearPendingConsent();
}

/* ── reconcile: the only path that may start pushes ────────────────── */

function reloadCount(): number {
  try { return Number(sessionStorage.getItem(K_RELOADS) ?? 0); } catch { return 99; }
}
function reloadGuarded(): boolean {
  // invariant 3: a per-tab cap so pull-reloads can never loop
  const n = reloadCount();
  if (n >= 2) {
    setStatus({ state: "error", email: email(), detail: "Repeated reloads while loading the cloud copy — staying on the local copy." });
    return false;
  }
  try { sessionStorage.setItem(K_RELOADS, String(n + 1)); } catch { /* ignore */ }
  window.location.reload();
  return true;
}
function clearReloadGuard() {
  try { sessionStorage.removeItem(K_RELOADS); } catch { /* ignore */ }
}

function snapshotLocalOnce(localDoc: Record<string, string>) {
  // invariant 6: never overwrite an unrestored snapshot
  try {
    if (!localStorage.getItem(K_PREVLOCAL)) localStorage.setItem(K_PREVLOCAL, JSON.stringify(localDoc));
  } catch { /* too big — proceed without a snapshot */ }
}

export function hasLocalSnapshot(): boolean {
  try { return localStorage.getItem(K_PREVLOCAL) != null; } catch { return false; }
}

/** Bring back the device's pre-sign-in work (the snapshot taken when the
    server copy won). Applies it locally and lets LWW push it up. */
export function restoreLocalSnapshot(): boolean {
  let doc: Record<string, string> | null = null;
  try { doc = JSON.parse(localStorage.getItem(K_PREVLOCAL) ?? "null"); } catch { /* corrupt */ }
  if (!doc) return false;
  const ok = applyDoc(doc);
  if (!ok) return false;
  try { localStorage.removeItem(K_PREVLOCAL); } catch { /* ignore */ }
  stampEdit(); // restored copy is now the newest — LWW pushes it after reload
  clearReloadGuard();
  window.location.reload();
  return true;
}

async function reconcile(client: SupabaseClient, s: Session): Promise<void> {
  session = s;
  const gen0 = docGen;
  setStatus({ state: "syncing", email: email() });
  await recordPendingConsent(client);

  const { data, error } = await client.from("workspaces")
    .select("doc, updated_at").eq("user_id", s.user.id).maybeSingle();
  if (error) {
    // invariant 1: no watch, no pushes — retry the pull with backoff
    setStatus({ state: "error", email: email(), detail: error.message });
    if (retryT) clearTimeout(retryT);
    pushAttempts++;
    retryT = setTimeout(() => { void reconcile(client, s); }, Math.min(60_000, 5_000 * 2 ** Math.min(pushAttempts, 4)));
    return;
  }
  pushAttempts = 0;

  const localDoc = collectDoc();
  const localSig = docSignature(localDoc);
  let prevOwner: string | null = null;
  try { prevOwner = localStorage.getItem(K_OWNER); } catch { /* ignore */ }
  // invariant 4: a doc produced under another account is never pushable
  const foreignLocal = prevOwner !== null && prevOwner !== s.user.id;
  const setOwner = () => { try { localStorage.setItem(K_OWNER, s.user.id); } catch { /* ignore */ } };

  const serverDoc = (data?.doc ?? null) as Record<string, string> | null;
  const serverAt = data ? (Date.parse(data.updated_at as string) || 0) : 0;
  const serverSig = serverDoc ? docSignature(serverDoc) : "";

  const finishInSync = () => {
    reconciled = true;
    lastSeenServerAt = serverAt;
    pushedSig = serverSig;
    setOwner();
    clearReloadGuard();
    setStatus({ state: "synced", email: email(), syncedAt: Date.now() });
    startWatch();
  };
  const finishPushLocal = async () => {
    reconciled = true;
    lastSeenServerAt = serverAt;
    setOwner();
    clearReloadGuard();
    startWatch();
    await doPush();
  };
  const finishPullServer = (doc: Record<string, string>) => {
    if (docGen !== gen0) {
      // the user replaced the doc while this pull was in flight (opened a
      // project) — their choice is the new local truth; re-decide against it
      void reconcile(client, s);
      return;
    }
    snapshotLocalOnce(localDoc);
    const ok = applyDoc(doc);
    if (!ok) {
      applyDoc(localDoc); // best-effort restore; reconciled stays false
      setStatus({ state: "error", email: email(), detail: "Couldn't load the cloud copy on this device (storage full?) — working locally, cloud sync paused." });
      return;
    }
    setOwner();
    if (!reloadGuarded()) {
      // reload cap hit: stay put; the local keyspace now equals the server
      reconciled = true;
      lastSeenServerAt = serverAt;
      pushedSig = docSignature(doc);
      setStatus({ state: "synced", email: email(), syncedAt: Date.now() });
      startWatch();
    }
  };

  if (!serverDoc) {
    if (foreignLocal) {
      // brand-new account on a browser holding someone else's work:
      // start the account empty; the other person's work stays in their cloud
      finishPullServer({});
    } else {
      await finishPushLocal();
    }
    return;
  }
  if (serverSig === localSig) { finishInSync(); return; }
  if (foreignLocal) { finishPullServer(serverDoc); return; }

  let lastEdit = 0;
  try { lastEdit = Number(localStorage.getItem(K_LASTEDIT) ?? 0); } catch { /* ignore */ }
  if (lastEdit > serverAt) { await finishPushLocal(); }
  else { finishPullServer(serverDoc); }
}

function endSession() {
  session = null;
  reconciled = false;
  stopWatch();
  pushedSig = "";
  lastSeenServerAt = 0;
  // K_OWNER intentionally survives sign-out: it is how the next sign-in
  // detects an account boundary on a shared browser (invariant 4)
  setStatus(cloudConfig() ? { state: "signedout" } : { state: "off" });
}

/** Boot the cloud layer. Safe to call unconditionally: without config this
    resolves immediately and the app remains the local-only build. */
export async function startCloud() {
  if (started) return;
  started = true;
  // SAFE BOOT: a factory-fresh session must neither pull the cloud doc
  // (it could reintroduce the very state being diagnosed) nor push its
  // pristine defaults over the user's real workspace
  const { SAFE_BOOT } = await import("./store");
  if (SAFE_BOOT) { setStatus({ state: "off" }); return; }
  const cfg = cloudConfig();
  if (!cfg) { setStatus({ state: "off" }); return; }
  installWriteHook();
  const client = await getClient();
  if (!client) { setStatus({ state: "off" }); return; }
  setStatus({ state: "signedout" });

  client.auth.onAuthStateChange((event, s) => {
    if (event === "PASSWORD_RECOVERY" && s) {
      recoveryHold = true;
      session = s;
      setStatus({ state: "recovery", email: s.user.email ?? undefined });
      return;
    }
    if (event === "SIGNED_OUT") { recoveryHold = false; endSession(); return; }
    if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && s && !recoveryHold && !reconciled && !session) {
      void reconcile(client, s);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!session || !reconciled) return;
    if (document.visibilityState === "hidden") {
      // flush whenever the doc is actually ahead of the cloud, not only
      // when a debounce happens to be pending
      if (docSignature(collectDoc()) !== pushedSig) syncNow();
    } else {
      // returning to a long-lived tab: rebase if another device wrote
      void (async () => {
        const c = await getClient();
        if (!c || !session) return;
        const { data } = await c.from("workspaces")
          .select("updated_at").eq("user_id", session.user.id).maybeSingle();
        if (data && Date.parse(data.updated_at as string) > lastSeenServerAt) {
          const s = session;
          reconciled = false;
          stopWatch();
          void reconcile(c, s);
        }
      })();
    }
  });
}

/* ── auth actions (thin wrappers; return an error string or null) ──── */

function appUrl() {
  return window.location.origin + window.location.pathname;
}

export async function signUp(email0: string, password: string): Promise<string | null> {
  const client = await getClient();
  if (!client) return "Cloud is not configured on this deployment.";
  setPendingConsent(email0);
  const { error } = await client.auth.signUp({ email: email0, password, options: { emailRedirectTo: appUrl() } });
  if (error) { clearPendingConsent(); return error.message; }
  return null;
}

export async function signIn(email0: string, password: string): Promise<string | null> {
  const client = await getClient();
  if (!client) return "Cloud is not configured on this deployment.";
  const { error } = await client.auth.signInWithPassword({ email: email0, password });
  return error ? error.message : null;
}

/** Magic links are sign-in only (shouldCreateUser: false): account creation
    stays on the consent-gated Create-account path, so no account can exist
    without a 13+/terms record. */
export async function signInMagic(email0: string): Promise<string | null> {
  const client = await getClient();
  if (!client) return "Cloud is not configured on this deployment.";
  const { error } = await client.auth.signInWithOtp({
    email: email0,
    options: { emailRedirectTo: appUrl(), shouldCreateUser: false },
  });
  if (error) {
    return /not.*(found|allowed|exist)|signup/i.test(error.message)
      ? "No account with this email yet — use Create account first."
      : error.message;
  }
  return null;
}

export async function requestPasswordReset(email0: string): Promise<string | null> {
  const client = await getClient();
  if (!client) return "Cloud is not configured on this deployment.";
  const { error } = await client.auth.resetPasswordForEmail(email0, { redirectTo: appUrl() });
  return error ? error.message : null;
}

export async function setNewPassword(password: string): Promise<string | null> {
  const client = await getClient();
  if (!client) return "Cloud is not configured on this deployment.";
  const { error } = await client.auth.updateUser({ password });
  if (error) return error.message;
  // recovery is done — run the real session start so sync actually begins
  recoveryHold = false;
  const { data } = await client.auth.getSession();
  const s = data.session ?? session;
  session = null;
  reconciled = false;
  if (s) void reconcile(client, s);
  return null;
}

export async function signOutCloud(): Promise<void> {
  const client = await getClient();
  if (client && session && reconciled && docSignature(collectDoc()) !== pushedSig) {
    await doPush(); // don't strand the last edits
  }
  await client?.auth.signOut();
  endSession();
}

/* ── named projects (v76): the projects table goes live ──────────────
   A project is a portable, named snapshot of the KIT — the same curated
   payload the share link carries (store.kitPayload) — stored one row per
   project in public.projects. It is distinct from the auto-synced
   workspace: the workspace is "your current desk", projects are "saved
   files" you keep a library of, open, and (opt-in) publish behind a short
   #p=<slug> link. RLS keeps every row owner-only unless is_public — the
   anon key can read a public project by slug, nothing more. */

export type CloudProject = {
  id: string; name: string; is_public: boolean;
  share_slug: string | null; updated_at: string; created_at: string;
};

const PROJECT_COLS = "id, name, is_public, share_slug, updated_at, created_at";

/** Short, unguessable, human-safe slug (no 0/o/1/l ambiguity). */
function makeSlug(): string {
  const alpha = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 symbols
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += alpha[b & 31];
  return s;
}

/** True only once signed in and reconciled — the account menu gates the
    Projects UI on this so calls always carry a session. */
export function projectsReady(): boolean {
  return !!session;
}

export async function listProjects(): Promise<{ projects: CloudProject[]; error: string | null }> {
  const client = await getClient();
  if (!client || !session) return { projects: [], error: session ? "Cloud unavailable." : null };
  const { data, error } = await client.from("projects")
    .select(PROJECT_COLS).eq("user_id", session.user.id).order("updated_at", { ascending: false });
  if (error) return { projects: [], error: error.message };
  return { projects: (data ?? []) as CloudProject[], error: null };
}

/** Save a named kit. Visibility is decided by the CALLER from the tier —
    free and student kits are public by default (the community launch,
    owner call 2026-07-25), Pro defaults private with its toggle. RLS
    enforces the same rule server-side, so a tampered client changes
    nothing. */
export async function saveProject(name: string, doc: unknown, isPublic: boolean): Promise<{ project: CloudProject | null; error: string | null }> {
  const client = await getClient();
  if (!client || !session) return { project: null, error: "Sign in to save projects." };
  const clean = name.trim().slice(0, 120) || "Untitled kit";
  /* a public save mints its share link immediately — community cards need
     the slug for "Use this kit", and a public kit without a link is a
     stage door that doesn't open. Retry the (unlikely) slug collision. */
  for (let attempt = 0; attempt < 4; attempt++) {
    const row: Record<string, unknown> = { user_id: session.user.id, name: clean, doc, is_public: isPublic };
    if (isPublic) row.share_slug = makeSlug();
    const { data, error } = await client.from("projects")
      .insert(row).select(PROJECT_COLS).maybeSingle();
    if (!error) return { project: data as CloudProject, error: null };
    if (!(isPublic && /duplicate|unique|23505/i.test(error.message))) return { project: null, error: error.message };
  }
  return { project: null, error: "Couldn't allocate a share link — try again." };
}

/** Overwrite an existing project with a new kit snapshot ("save changes"). */
export async function updateProjectDoc(id: string, doc: unknown): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in to save projects.";
  const { error } = await client.from("projects")
    .update({ doc, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", session.user.id);
  return error?.message ?? null;
}

export async function renameProject(id: string, name: string): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in to rename projects.";
  const clean = name.trim().slice(0, 120);
  if (!clean) return "Give the project a name.";
  const { error } = await client.from("projects")
    .update({ name: clean, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", session.user.id);
  return error?.message ?? null;
}

export async function deleteProject(id: string): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in to delete projects.";
  const { error } = await client.from("projects").delete().eq("id", id).eq("user_id", session.user.id);
  return error?.message ?? null;
}

/** Publish or unpublish. Publishing mints a stable share_slug (once) and
    retries on the unlikely slug collision; unpublishing keeps the slug so
    the same link re-activates if the owner republishes. */
export async function setProjectPublic(id: string, isPublic: boolean): Promise<{ share_slug: string | null; error: string | null }> {
  const client = await getClient();
  if (!client || !session) return { share_slug: null, error: "Sign in to share projects." };
  if (!isPublic) {
    const { error } = await client.from("projects")
      .update({ is_public: false, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", session.user.id);
    return { share_slug: null, error: error?.message ?? null };
  }
  const { data: cur, error: readErr } = await client.from("projects")
    .select("share_slug").eq("id", id).eq("user_id", session.user.id).maybeSingle();
  if (readErr) return { share_slug: null, error: readErr.message };
  const existing = (cur?.share_slug as string | null) ?? null;
  if (existing) {
    const { error } = await client.from("projects")
      .update({ is_public: true, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", session.user.id);
    return { share_slug: existing, error: error?.message ?? null };
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = makeSlug();
    const { error } = await client.from("projects")
      .update({ is_public: true, share_slug: slug, updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", session.user.id);
    if (!error) return { share_slug: slug, error: null };
    if (!/duplicate|unique|23505/i.test(error.message)) return { share_slug: null, error: error.message };
  }
  return { share_slug: null, error: "Couldn't allocate a share link — try again." };
}

/** The owner's own project payload (for opening into the editor). */
export async function loadProjectDoc(id: string): Promise<{ doc: unknown | null; error: string | null }> {
  const client = await getClient();
  if (!client || !session) return { doc: null, error: "Sign in to open projects." };
  const { data, error } = await client.from("projects")
    .select("doc").eq("id", id).eq("user_id", session.user.id).maybeSingle();
  if (error) return { doc: null, error: error.message };
  return { doc: data?.doc ?? null, error: null };
}

/** A public project by slug — readable by anyone (even signed-out) via the
    is_public RLS path. Returns null when unconfigured or not found, so a
    #p= link simply no-ops on a deployment without cloud. */
export async function loadPublicProject(slug: string): Promise<unknown | null> {
  const client = await getClient();
  if (!client) return null;
  const { data, error } = await client.from("projects")
    .select("doc").eq("share_slug", slug).eq("is_public", true).maybeSingle();
  if (error || !data) return null;
  return data.doc ?? null;
}

export function publicProjectUrl(slug: string): string {
  return `${window.location.origin}${window.location.pathname}#p=${slug}`;
}

/* ── admin + shared presets ──────────────────────────────────────────
   Shared presets are an admin-curated style library that shows in the
   Presets panel for every user. is_admin lives on the profile and is set
   out-of-band (SQL); RLS enforces that only admins may write presets — the
   client's admin check below is UI gating only, never the security boundary. */

export type CloudPreset = {
  id: string; name: string; cfg: unknown; thumb: string | null; sort: number; created_at: string;
  /** When this pack goes live. null = live now; a future date = held back,
      and RLS hides the row from everyone but an admin until it passes. */
  publish_at: string | null;
};

/** Is the signed-in user an admin? Reads their own profile row (RLS-scoped). */
export async function amIAdmin(): Promise<boolean> {
  const client = await getClient();
  if (!client || !session) return false;
  const { data, error } = await client.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
  return !error && !!data?.is_admin;
}

/* ── visibility-gate snapshot ───────────────────────────────────────
   The admin flag, tier and release ledger drive what RENDERS (staged
   pieces, the kit's clone chapter, pro chrome) — but they only exist
   after async cloud reads. They used to boot as guest/false/{} and STAY
   there for the whole session whenever one read flaked, which blinked
   the owner's own components out of the kit ("your kit elements only
   appear in the kit sometimes"). The last AUTHORITATIVE answer persists
   here (outside the synced keyspace) so the next boot paints right
   away; every privileged ACTION still verifies server-side (RLS, export
   grants) — this snapshot only decides what shows while the truth is in
   flight. */
export type GateSnapshot = { admin: boolean; tier: string; releases: Record<string, ReleaseStatus> };
export function readGateSnapshot(): GateSnapshot | null {
  try {
    const v = JSON.parse(localStorage.getItem(K_GATES) ?? "null") as GateSnapshot | null;
    return v && typeof v === "object" && typeof v.admin === "boolean" && typeof v.tier === "string" &&
      !!v.releases && typeof v.releases === "object" && !Array.isArray(v.releases) ? v : null;
  } catch { return null; }
}
export function writeGateSnapshot(g: GateSnapshot) {
  try { localStorage.setItem(K_GATES, JSON.stringify(g)); } catch { /* ignore */ }
}
/** A Supabase session is parked in storage and will restore moments after
 *  boot — the window where "no session yet" must not read as "signed out". */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token/.test(k)) return true;
    }
  } catch { /* storage unavailable */ }
  return false;
}

/** The signed-in user's plan + admin flag in one read — feeds the tier.
    plan_id is server-truth: RLS pins any client write to 'free' and only the
    Stripe webhook (service role) grants pro, so a client can't self-upgrade.
    `undecided` marks a NON-answer — the profile query failed, or the parked
    session hasn't restored yet — so callers keep their previous answer
    instead of silently de-tiering the session. A real signed-out state
    (no session, nothing parked) stays authoritative. */
export async function myProfileTier(): Promise<{ plan: string | null; admin: boolean; undecided?: boolean }> {
  const client = await getClient();
  if (!client) return { plan: null, admin: false };
  if (!session) return hasStoredSession() ? { plan: null, admin: false, undecided: true } : { plan: null, admin: false };
  const { data, error } = await client.from("profiles").select("plan_id, is_admin").eq("id", session.user.id).maybeSingle();
  if (error) return { plan: null, admin: false, undecided: true };
  if (!data) return { plan: null, admin: false };
  return { plan: (data.plan_id as string) ?? "free", admin: !!data.is_admin };
}

/** Billing detail for the account page — what plan, in what state, until
    when. Reads the same RLS-scoped profile row; every field is written by
    the webhook, never by this client. */
export async function myBilling(): Promise<{ plan: string; status: string | null; renewsAt: string | null; hasCustomer: boolean } | null> {
  const client = await getClient();
  if (!client || !session) return null;
  const { data, error } = await client.from("profiles")
    .select("plan_id, plan_status, plan_renews_at, stripe_customer_id").eq("id", session.user.id).maybeSingle();
  if (error || !data) return null;
  return {
    plan: (data.plan_id as string) ?? "free",
    status: (data.plan_status as string) ?? null,
    renewsAt: (data.plan_renews_at as string) ?? null,
    hasCustomer: !!data.stripe_customer_id,
  };
}

/** The current access token — the only identity the billing functions accept.
    They re-verify it with Supabase, so a stale or forged token buys nothing. */
export async function accessToken(): Promise<string | null> {
  const client = await getClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Every shared preset — readable by anyone (even signed-out) when cloud is
    configured. Returns [] when unconfigured, so the local build is unaffected. */
export async function listCloudPresets(): Promise<CloudPreset[]> {
  const client = await getClient();
  if (!client) return [];
  /* No publish_at filter here on purpose — the read policy already drops
     unreleased rows for everyone but an admin, and an admin WANTS to see
     the backlog to manage it. Filtering here too would only hide the
     schedule from the one person who needs it. */
  const { data, error } = await client.from("presets")
    .select("id, name, cfg, thumb, sort, created_at, publish_at")
    .order("sort", { ascending: true }).order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as CloudPreset[];
}

/** Publish a config as a shared preset (admin only — RLS enforces). */
/** Publish a pack. `publishAt` null means live immediately; an ISO date in
    the future holds it until then. */
export async function publishCloudPreset(name: string, cfg: unknown, thumb: string | null, publishAt: string | null = null): Promise<{ preset: CloudPreset | null; error: string | null }> {
  const client = await getClient();
  if (!client || !session) return { preset: null, error: "Sign in as an admin to publish presets." };
  const { data, error } = await client.from("presets")
    .insert({ name: name.trim().slice(0, 80) || "Preset", cfg, thumb, created_by: session.user.id, publish_at: publishAt })
    .select("id, name, cfg, thumb, sort, created_at, publish_at").maybeSingle();
  if (error) return { preset: null, error: error.message };
  return { preset: data as CloudPreset, error: null };
}

/** Move a pack's release date, or clear it to go live now. Admin-only by
    RLS; the client check here is only to fail with a sentence. */
export async function setCloudPresetSchedule(id: string, publishAt: string | null): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in as an admin to schedule packs.";
  const { error } = await client.from("presets")
    .update({ publish_at: publishAt, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? error.message : null;
}

/** Overwrite a shared preset's look in place (admin only — RLS enforces).
    The name stays; only the recipe and thumbnail move. */
export async function updateCloudPreset(id: string, cfg: unknown, thumb: string | null): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in as an admin to edit presets.";
  const { error } = await client.from("presets")
    .update({ cfg, thumb, updated_at: new Date().toISOString() }).eq("id", id);
  return error?.message ?? null;
}

export async function renameCloudPreset(id: string, name: string): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in to edit presets.";
  const clean = name.trim().slice(0, 80);
  if (!clean) return "Give the preset a name.";
  const { error } = await client.from("presets").update({ name: clean, updated_at: new Date().toISOString() }).eq("id", id);
  return error?.message ?? null;
}

export async function deleteCloudPreset(id: string): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in to delete presets.";
  const { error } = await client.from("presets").delete().eq("id", id);
  return error?.message ?? null;
}

/* Starter presets ship in the bundle, but an admin can retire them for every
   visitor: the retired ids live in app_settings (world-readable, admin-
   writable — same RLS shape as presets). Cloud off → empty list → all show. */
const HIDDEN_STARTERS_KEY = "hidden_starter_presets";

export async function listHiddenStarters(): Promise<string[]> {
  const client = await getClient();
  if (!client) return [];
  const { data, error } = await client.from("app_settings")
    .select("value").eq("key", HIDDEN_STARTERS_KEY).maybeSingle();
  if (error || !Array.isArray(data?.value)) return [];
  return (data.value as unknown[]).filter((x): x is string => typeof x === "string");
}

export async function setHiddenStarters(ids: string[]): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in as an admin to curate starter presets.";
  const { error } = await client.from("app_settings")
    .upsert({ key: HIDDEN_STARTERS_KEY, value: ids, updated_at: new Date().toISOString() });
  return error?.message ?? null;
}

/* The HOMEPAGE's hardcoded kits (hero reel seeds, swatch chips, community
   cards) get the same treatment: an admin can retire any of them for every
   visitor without a deploy. The landing has no Supabase client, so the list
   travels to it through /api/hero-lineup (and a localStorage echo for the
   first paint). Entries are lowercase match keys — preset ids AND display
   names both work. */
const HIDDEN_LANDING_KEY = "hidden_landing_kits";

export async function listHiddenLandingKits(): Promise<string[]> {
  const client = await getClient();
  if (!client) return [];
  const { data, error } = await client.from("app_settings")
    .select("value").eq("key", HIDDEN_LANDING_KEY).maybeSingle();
  if (error || !Array.isArray(data?.value)) return [];
  return (data.value as unknown[]).filter((x): x is string => typeof x === "string");
}

export async function setHiddenLandingKits(keys: string[]): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in as an admin to curate the homepage.";
  const { error } = await client.from("app_settings")
    .upsert({ key: HIDDEN_LANDING_KEY, value: keys, updated_at: new Date().toISOString() });
  return error?.message ?? null;
}

/* The homepage's DISPLAY ORDER rides the same channel as the hidden list:
   an array of the SAME lowercase match keys, first-listed shows first.
   Names the list doesn't know keep their hardcoded relative order behind
   the listed ones; an empty or unreadable list changes nothing — the
   landing's sort is fail-soft by the same contract as its hidden filter. */
const LANDING_ORDER_KEY = "landing_kit_order";

export async function listLandingKitOrder(): Promise<string[]> {
  const client = await getClient();
  if (!client) return [];
  const { data, error } = await client.from("app_settings")
    .select("value").eq("key", LANDING_ORDER_KEY).maybeSingle();
  if (error || !Array.isArray(data?.value)) return [];
  return (data.value as unknown[]).filter((x): x is string => typeof x === "string");
}

export async function setLandingKitOrder(keys: string[]): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in as an admin to curate the homepage.";
  const { error } = await client.from("app_settings")
    .upsert({ key: LANDING_ORDER_KEY, value: keys, updated_at: new Date().toISOString() });
  return error?.message ?? null;
}

/* Stock silhouettes ship in the bundle too, and the same curation applies:
   an admin can retire one for every visitor without a deploy. Retiring hides
   it from the PICKER only — a design already built on that shape keeps
   rendering, exactly like a retired starter preset keeps working. */
const HIDDEN_SILHOUETTES_KEY = "hidden_silhouettes";

export async function listHiddenSilhouettes(): Promise<string[]> {
  const client = await getClient();
  if (!client) return [];
  const { data, error } = await client.from("app_settings")
    .select("value").eq("key", HIDDEN_SILHOUETTES_KEY).maybeSingle();
  if (error || !Array.isArray(data?.value)) return [];
  return (data.value as unknown[]).filter((x): x is string => typeof x === "string");
}

export async function setHiddenSilhouettes(ids: string[]): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in as an admin to curate silhouettes.";
  const { error } = await client.from("app_settings")
    .upsert({ key: HIDDEN_SILHOUETTES_KEY, value: ids, updated_at: new Date().toISOString() });
  return error?.message ?? null;
}

/* The staging bay's ledger: which STAGED components the admin has released
   to everyone (or rejected). Components ship in the bundle marked staged;
   this key is what flips one public without a deploy. Same app_settings
   RLS as the starters — world-readable, admin-writable. */
const COMPONENT_RELEASES_KEY = "component_releases";
export type ReleaseStatus = "released" | "rejected";

/** null = the read FAILED (keep whatever you had); {} = authoritatively
 *  empty. The two used to collapse into {}, so one flaked read hid every
 *  released staged piece — and the clones filed under them — all session. */
export async function listComponentReleases(): Promise<Record<string, ReleaseStatus> | null> {
  const client = await getClient();
  if (!client) return {};
  const { data, error } = await client.from("app_settings")
    .select("value").eq("key", COMPONENT_RELEASES_KEY).maybeSingle();
  if (error) return null;
  const v = data?.value;
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: Record<string, ReleaseStatus> = {};
  for (const [id, st] of Object.entries(v as Record<string, unknown>)) {
    if (st === "released" || st === "rejected") out[id] = st;
  }
  return out;
}

export async function saveComponentReleases(map: Record<string, ReleaseStatus>): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in as an admin to release components.";
  const { error } = await client.from("app_settings")
    .upsert({ key: COMPONENT_RELEASES_KEY, value: map, updated_at: new Date().toISOString() });
  return error?.message ?? null;
}

/** Everything the account owns in one file — the parachute offered
    before deletion (and a fine backup any other day): profile, the
    synced studio doc, and every saved kit with its full design. */
export async function downloadAccountBackup(): Promise<string | null> {
  const client = await getClient();
  if (!client || !session) return "Sign in first.";
  const { data: prof } = await client.from("profiles")
    .select("email, handle, display_name, plan_id, created_at").eq("id", session.user.id).maybeSingle();
  const { data: projs, error } = await client.from("projects")
    .select("name, doc, is_public, share_slug, created_at, updated_at")
    .eq("user_id", session.user.id).order("created_at", { ascending: true });
  if (error) return error.message;
  const backup = {
    exportedAt: new Date().toISOString(),
    profile: prof ?? null,
    studio: collectDoc(),
    kits: projs ?? [],
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ui-kit-maker-account-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return null;
}

/** The door api/account.ts guards (live subscription and admin accounts
    are refused server-side). On success the account no longer exists —
    the schema cascades kits, hearts, profile, studio, avatar, all of it. */
export async function deleteMyAccount(): Promise<string | null> {
  const token = await accessToken();
  if (!token) return "Sign in first.";
  try {
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return data.error ?? `Deletion failed (${res.status}). Nothing was removed.`;
  } catch {
    return "Couldn't reach the account service — check your connection.";
  }
  // the user is gone server-side; clear this browser's session quietly
  await signOutCloud().catch(() => { /* session already invalid */ });
  return null;
}

/** Data rights: hand the user their complete saved document as JSON. */
export function downloadMyData() {
  const blob = new Blob([JSON.stringify(collectDoc(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ui-generator-my-data.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
