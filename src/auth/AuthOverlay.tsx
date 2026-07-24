import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  LogIn, UserPlus, Mail, KeyRound, RefreshCw, FileDown, Cable, History,
  FolderOpen, LogOut, X, CheckCircle2, CloudOff, CloudUpload, ArrowLeft,
  Wand2, UserRound,
} from "lucide-react";
import {
  cloudConfig, setCloudOverride, clearCloudOverride,
  signIn, signUp, signInMagic, requestPasswordReset, setNewPassword, signOutCloud,
  syncNow, downloadMyData, hasLocalSnapshot, restoreLocalSnapshot,
} from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { useAuthOverlay, closeAuth } from "@/shell/authOverlay";
import { navigate, parseHash } from "@/shell/router";
import { engineApi, tightenSvg } from "@/marketing/engine";
import logoUrl from "../../pb-logo.png";

// My Projects pulls the editor store — lazy so opening the overlay from the
// landing never drags the editor chunk in. Only fetched when a signed-in user
// actually opens their project library.
const ProjectsPanel = lazy(() =>
  import("@/ui/ProjectsPanel").then((m) => ({ default: m.ProjectsPanel })),
);

type Mode = "signin" | "signup" | "magic" | "reset";

/* The account overlay — one elegant surface over the existing cloud.ts calls,
   with a scene for every cloud state:
     · recovery              → set a new password
     · signed in             → account dashboard (+ My Projects)
     · configured, signed out→ sign in / create / magic link / reset
     · unconfigured          → local-only + owner "connect Supabase"
   No sync/security logic changes here — this is a reskin of the flows. */
export function AuthOverlay() {
  const status = useCloudStatus();
  const overlay = useAuthOverlay();
  const cfg = cloudConfig();

  const [mode, setMode] = useState<Mode>(overlay.mode);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [connUrl, setConnUrl] = useState("");
  const [connKey, setConnKey] = useState("");

  const modalRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<Element | null>(null);

  // Follow the requested entry mode whenever the overlay is (re)opened.
  useEffect(() => { setMode(overlay.mode); setNote(null); setErr(false); }, [overlay.mode]);

  // Escape closes; remember + restore focus for keyboard users.
  useEffect(() => {
    restoreFocus.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAuth(); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      (restoreFocus.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const run = async (fn: () => Promise<string | null>, okNote: string) => {
    setBusy(true); setNote(null); setErr(false);
    const e = await fn();
    setBusy(false);
    setErr(!!e);
    setNote(e ? e : okNote);
  };

  const switchMode = (m: Mode) => { setMode(m); setNote(null); setErr(false); };

  const signedIn = status.state === "synced" || status.state === "syncing" || status.state === "error";
  // Where the overlay sits changes what "open" means: in the editor the
  // generator is already behind the modal, elsewhere it's a navigation.
  const onApp = parseHash(window.location.hash).name === "app";

  // A real engine render greets sign-in — the product is present even here.
  const [chipSvg] = useState(() => {
    try {
      const c = engineApi.applyPresetFull(engineApi.defaultConfig(), "grape-jelly");
      return tightenSvg(engineApi.renderShell(c, "default", 200, 54, { label: "PLAYER 1", fs: 16 }), 24);
    } catch { return ""; }
  });
  const [advOpen, setAdvOpen] = useState(false);

  let title = "Sign in";
  if (status.state === "recovery") title = "Set a new password";
  else if (signedIn) title = "Your account";
  else if (!cfg) title = "Working locally";
  else if (mode === "signup") title = "Create your account";
  else if (mode === "magic") title = "Email sign-in link";
  else if (mode === "reset") title = "Reset your password";

  return (
    <div className="fd-backdrop" onMouseDown={closeAuth}>
      <div
        className="fd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-modal-title"
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fd-modal__head">
          <div className="fd-modal__brand">
            <img className="logo" src={logoUrl} alt="" width={26} height={26} />
            <span id="fd-modal-title" className="fd-modal__title">{title}</span>
          </div>
          <button className="fd-modal__close" onClick={closeAuth} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="fd-modal__body">
          {!signedIn && status.state !== "recovery" && cfg && (
            <div className="fd-chip" aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: chipSvg }} />
          )}
          {/* ── recovery ───────────────────────────────────────── */}
          {status.state === "recovery" ? (
            <>
              <p className="fd-lead">Set a new password for <b>{status.email}</b>.</p>
              <input ref={firstFieldRef} className="fd-input" type="password"
                placeholder="New password (8+ characters)" value={pw}
                onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <button className="fd-primary" disabled={busy || pw.length < 8}
                onClick={() => void run(() => setNewPassword(pw), "Password updated — you're signed in.")}>
                <KeyRound size={16} strokeWidth={1.9} /> Save new password
              </button>
              {note && <p className={`fd-note${err ? " fd-note--err" : ""}`}>{note}</p>}
            </>

          /* ── signed in: account dashboard ─────────────────────── */
          ) : signedIn ? (
            showProjects ? (
              <Suspense fallback={<p className="fd-lead">Loading your projects…</p>}>
                <div className="fd-projects">
                  <ProjectsPanel
                    onBack={() => setShowProjects(false)}
                    onClose={closeAuth}
                    confirmReplace={onApp}
                    onOpened={() => { if (!onApp) navigate("#/app"); }}
                  />
                </div>
              </Suspense>
            ) : (
              <>
                <div className="fd-account">
                  <div className="fd-account__email">{status.email}</div>
                  <div className={`fd-account__status fd-account__status--${status.state}`}>
                    {status.state === "synced" && (
                      <><CheckCircle2 size={15} strokeWidth={2} />
                        Saved to your account{status.syncedAt ? ` · ${new Date(status.syncedAt).toLocaleTimeString()}` : ""}</>
                    )}
                    {status.state === "syncing" && (<><CloudUpload size={15} strokeWidth={2} /> Syncing…</>)}
                    {status.state === "error" && (
                      <><CloudOff size={15} strokeWidth={2} /> Cloud paused — your work is safe locally.{status.detail ? ` ${status.detail}` : ""}</>
                    )}
                  </div>
                </div>
                {!onApp && (
                  <button className="fd-primary" onClick={() => { closeAuth(); navigate("#/app"); }}>
                    <Wand2 size={16} strokeWidth={1.9} /> Open the generator
                  </button>
                )}
                <div className="fd-actions">
                  <button className="fd-ghost" onClick={() => setShowProjects(true)}>
                    <FolderOpen size={15} strokeWidth={1.8} /> My projects
                  </button>
                  <button className="fd-ghost" onClick={() => { closeAuth(); navigate("#/account"); }}>
                    <UserRound size={15} strokeWidth={1.8} /> Account
                  </button>
                </div>
                <button className="fd-ghost fd-ghost--wide" onClick={() => { void signOutCloud(); closeAuth(); }}>
                  <LogOut size={15} strokeWidth={1.8} /> Sign out
                </button>
                <p className="fd-fine">Your work syncs automatically and stays on this device when you sign out.</p>
                <button className="fd-linkbtn fd-linkbtn--muted" onClick={() => setAdvOpen(!advOpen)}>
                  {advOpen ? "Hide advanced" : "Advanced"}
                </button>
                {advOpen && (
                  <div className="fd-actions fd-actions--adv">
                    <button className="fd-ghost" onClick={() => syncNow()}>
                      <RefreshCw size={15} strokeWidth={1.8} /> Sync now
                    </button>
                    <button className="fd-ghost" onClick={() => downloadMyData()}>
                      <FileDown size={15} strokeWidth={1.8} /> Download my data
                    </button>
                    {hasLocalSnapshot() && (
                      <button className="fd-ghost fd-ghost--wide" onClick={() => {
                        if (window.confirm("Bring back the work this device had before your cloud copy loaded? Your account will sync to the restored version.")) restoreLocalSnapshot();
                      }}>
                        <History size={15} strokeWidth={1.8} /> Restore this device's earlier work
                      </button>
                    )}
                    {cfg?.fromOverride && (
                      <button className="fd-linkbtn" onClick={() => { clearCloudOverride(); window.location.reload(); }}>
                        Disconnect this browser's cloud project
                      </button>
                    )}
                  </div>
                )}
              </>
            )

          /* ── configured, signed out: auth forms ───────────────── */
          ) : cfg ? (
            <>
              {(mode === "signin" || mode === "signup") && (
                <div className="fd-tabs" role="tablist">
                  <button role="tab" aria-selected={mode === "signin"}
                    className={`fd-tab${mode === "signin" ? " is-on" : ""}`}
                    onClick={() => switchMode("signin")}>Sign in</button>
                  <button role="tab" aria-selected={mode === "signup"}
                    className={`fd-tab${mode === "signup" ? " is-on" : ""}`}
                    onClick={() => switchMode("signup")}>Create account</button>
                </div>
              )}

              <p className="fd-lead">
                {mode === "signup" ? "Your kits and boards will save to your account and follow you to any device."
                  : mode === "magic" ? "We'll email a one-time sign-in link (existing accounts only)."
                  : mode === "reset" ? "We'll email you a link to reset your password."
                  : "Your saved work follows you to any device."}
              </p>

              <input ref={firstFieldRef} className="fd-input" type="email" placeholder="Email"
                value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

              {(mode === "signin" || mode === "signup") && (
                <input className="fd-input" type="password"
                  placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
                  value={pw} onChange={(e) => setPw(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              )}

              {mode === "signup" && (
                <>
                  <label className="fd-consent">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    <span>
                      I agree to the{" "}
                      <a href="#/terms" target="_blank" rel="noreferrer">Terms of Use</a> and acknowledge the{" "}
                      <a href="#/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
                    </span>
                  </label>
                  <p className="fd-legal-note">
                    Accounts are for users age 13 and older. If you have not reached the age of
                    majority where you live, a parent or legal guardian must agree to the Terms on
                    your behalf.
                  </p>
                  <p className="fd-legal-note">
                    PatternBreak collects your email, account identifiers, device and security data,
                    and any projects you choose to save in order to create and secure your account,
                    provide cloud saves and plan entitlements, support you, and improve the product.
                    Local-only projects remain in your browser unless you choose to save or publish
                    them. We do not sell personal information or share it for cross-context
                    behavioral advertising. Learn more in the{" "}
                    <a href="#/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
                  </p>
                </>
              )}

              {mode === "signin" && (
                <button className="fd-primary" disabled={busy || !email || !pw}
                  onClick={() => void run(() => signIn(email, pw), "Signed in.")}>
                  <LogIn size={16} strokeWidth={1.9} /> Sign in
                </button>
              )}
              {mode === "signup" && (
                <button className="fd-primary" disabled={busy || !email || pw.length < 8 || !agree}
                  onClick={() => void run(() => signUp(email, pw), "Account created — check your email if confirmation is required.")}>
                  <UserPlus size={16} strokeWidth={1.9} /> Create account
                </button>
              )}
              {mode === "magic" && (
                <button className="fd-primary" disabled={busy || !email}
                  onClick={() => void run(() => signInMagic(email), "Link sent — check your email.")}>
                  <Mail size={16} strokeWidth={1.9} /> Email me a sign-in link
                </button>
              )}
              {mode === "reset" && (
                <button className="fd-primary" disabled={busy || !email}
                  onClick={() => void run(() => requestPasswordReset(email), "Reset link sent — check your email.")}>
                  <KeyRound size={16} strokeWidth={1.9} /> Send reset link
                </button>
              )}

              {note && <p className={`fd-note${err ? " fd-note--err" : ""}`}>{note}</p>}

              {mode === "signin" && (
                <>
                  <div className="fd-or"><i /><span>or</span><i /></div>
                  <button className="fd-magic" disabled={busy}
                    onClick={() => switchMode("magic")}>
                    <Mail size={15} strokeWidth={1.8} /> Email me a sign-in link
                  </button>
                </>
              )}
              {(mode === "signin" || mode === "signup") && (
                <p className="fd-free"><span className="fd-free__check">✓</span> Free Explorer — no card needed.</p>
              )}
              <div className="fd-altlinks">
                {(mode === "magic" || mode === "reset") && (
                  <button className="fd-linkbtn" onClick={() => switchMode("signin")}>
                    <ArrowLeft size={13} strokeWidth={2} /> Back to sign in
                  </button>
                )}
                {mode === "signin" && (
                  <button className="fd-linkbtn" onClick={() => switchMode("reset")}>Forgot password?</button>
                )}
              </div>

              {hasLocalSnapshot() && (
                <button className="fd-linkbtn fd-linkbtn--muted" onClick={() => {
                  if (window.confirm("Bring back the work this device had before a cloud copy loaded?")) restoreLocalSnapshot();
                }}>Restore this device's earlier work</button>
              )}
            </>

          /* ── unconfigured: local-only build ───────────────────── */
          ) : (
            <>
              <p className="fd-lead">Everything you make saves to this browser — no account needed.</p>
              <p className="fd-fine">
                Accounts aren't connected on this deployment yet. Once a Supabase project
                is linked (see <code>docs/CLOUD-SETUP.md</code>), sign-in and cloud saves
                switch on here.
              </p>
              <button className="fd-ghost fd-ghost--wide" onClick={() => setConnOpen(!connOpen)}>
                <Cable size={15} strokeWidth={1.8} /> Connect a Supabase project…
              </button>
              {connOpen && (
                <div className="fd-connect">
                  <input ref={firstFieldRef} className="fd-input" type="url"
                    placeholder="https://YOUR-PROJECT.supabase.co"
                    value={connUrl} onChange={(e) => setConnUrl(e.target.value)} />
                  <input className="fd-input" type="text" placeholder="anon public key (eyJ…)"
                    value={connKey} onChange={(e) => setConnKey(e.target.value)} />
                  <button className="fd-primary"
                    disabled={!/^https:\/\/.+supabase\.co$/.test(connUrl.trim().replace(/\/+$/, "")) || connKey.trim().length < 20}
                    onClick={() => { setCloudOverride(connUrl, connKey); window.location.reload(); }}>
                    Connect (this browser only)
                  </button>
                  <p className="fd-fine">
                    The anon key is public by design — access is protected by row-level
                    security, not by hiding the key.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
