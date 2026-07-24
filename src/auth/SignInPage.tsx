/* #/signin — a normal, dedicated sign-in page. Same cloud.ts flows and the
   same approved dressing as the account overlay, on a clean page instead of
   a modal. Signed-in visitors are sent to their account. */
import { useEffect, useState } from "react";
import {
  LogIn, UserPlus, Mail, KeyRound, ArrowLeft,
} from "lucide-react";
import {
  cloudConfig, signIn, signUp, signInMagic, requestPasswordReset, setNewPassword,
} from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { navigate } from "@/shell/router";
import { engineApi, tightenSvg } from "@/marketing/engine";
import logoUrl from "../../pb-logo.png";

type Mode = "signin" | "signup" | "magic" | "reset";

export function SignInPage() {
  const status = useCloudStatus();
  const cfg = cloudConfig();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const signedIn = status.state === "synced" || status.state === "syncing" || status.state === "error";

  // Normal pages scroll; gen.css pins the body for the editor.
  useEffect(() => {
    const prev = { height: document.body.style.height, overflow: document.body.style.overflow };
    document.body.style.height = "auto";
    document.body.style.overflow = "visible";
    window.scrollTo(0, 0);
    return () => {
      document.body.style.height = prev.height;
      document.body.style.overflow = prev.overflow;
    };
  }, []);

  // Already signed in → this page's job is done.
  useEffect(() => {
    if (signedIn) navigate("#/account");
  }, [signedIn]);

  const [chipSvg] = useState(() => {
    try {
      const c = engineApi.applyPresetFull(engineApi.defaultConfig(), "grape-jelly");
      return tightenSvg(engineApi.renderShell(c, "default", 200, 54, { label: "PLAYER 1", fs: 16 }), 24);
    } catch { return ""; }
  });

  const run = async (fn: () => Promise<string | null>, okNote: string, cooldownOnOk = 0) => {
    setBusy(true); setNote(null); setErr(false);
    const e = await fn();
    setBusy(false);
    // Supabase rate-limits auth emails ("...after NN seconds"). Never show the
    // raw line — the first email almost certainly went out; count down instead.
    const wait = e ? /after (\d+) second/i.exec(e) : null;
    if (wait) {
      setCooldown(+wait[1] + 1);
      setErr(false);
      setNote("That email is probably already in your inbox — check spam too. Resend unlocks below in a moment.");
      return;
    }
    setErr(!!e);
    setNote(e ? e : okNote);
    if (!e && cooldownOnOk) setCooldown(cooldownOnOk);
  };

  const switchMode = (m: Mode) => { setMode(m); setNote(null); setErr(false); };

  // One-second tick for the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const title =
    status.state === "recovery" ? "Set a new password"
    : !cfg ? "Working locally"
    : mode === "signup" ? "Create your account"
    : mode === "magic" ? "Email sign-in link"
    : mode === "reset" ? "Reset your password"
    : "Sign in";

  return (
    <div className="fd-page">
      <header className="fd-page__bar">
        <a href="#/" onClick={(e) => { e.preventDefault(); navigate("#/"); }} className="fd-page__brand">
          <img src={logoUrl} alt="" width={24} height={24} /> UI Kit Maker
        </a>
        <nav className="fd-page__links">
          <a href="#/terms">Terms</a>
          <a href="#/privacy">Privacy</a>
        </nav>
      </header>

      <main className="fd-page__center">
        <div className="fd-modal fd-page__card" aria-label={title}>
          <div className="fd-modal__body">
            {cfg && status.state !== "recovery" && (
              <div className="fd-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: chipSvg }} />
            )}
            <h1 className="fd-page__title">{title}</h1>

            {/* ── recovery ───────────────────────────────────────── */}
            {status.state === "recovery" ? (
              <>
                <p className="fd-lead">Set a new password for <b>{status.email}</b>.</p>
                <input className="fd-input" type="password" placeholder="New password (8+ characters)"
                  value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
                <button className="fd-primary" disabled={busy || pw.length < 8}
                  onClick={() => void run(() => setNewPassword(pw), "Password updated — you're signed in.")}>
                  <KeyRound size={16} strokeWidth={1.9} /> Save new password
                </button>
                {note && <p className={`fd-note${err ? " fd-note--err" : ""}`}>{note}</p>}
              </>

            /* ── configured: the forms ───────────────────────────── */
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

                <input className="fd-input" type="email" placeholder="Email"
                  value={email} onChange={(e) => { setEmail(e.target.value); setCooldown(0); }} autoComplete="email" />

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
                  <button className="fd-primary" disabled={busy || !email || pw.length < 8 || !agree || cooldown > 0}
                    onClick={() => void run(() => signUp(email, pw), "Account created — check your email if confirmation is required.", 60)}>
                    <UserPlus size={16} strokeWidth={1.9} /> {cooldown > 0 ? `Sent — retry in ${cooldown}s` : "Create account"}
                  </button>
                )}
                {mode === "magic" && (
                  <button className="fd-primary" disabled={busy || !email || cooldown > 0}
                    onClick={() => void run(() => signInMagic(email), "Link sent — check your email.", 60)}>
                    <Mail size={16} strokeWidth={1.9} /> {cooldown > 0 ? `Resend in ${cooldown}s` : "Email me a sign-in link"}
                  </button>
                )}
                {mode === "reset" && (
                  <button className="fd-primary" disabled={busy || !email || cooldown > 0}
                    onClick={() => void run(() => requestPasswordReset(email), "Reset link sent — check your email.", 60)}>
                    <KeyRound size={16} strokeWidth={1.9} /> {cooldown > 0 ? `Resend in ${cooldown}s` : "Send reset link"}
                  </button>
                )}

                {note && <p className={`fd-note${err ? " fd-note--err" : ""}`}>{note}</p>}

                {mode === "signin" && (
                  <>
                    <div className="fd-or"><i /><span>or</span><i /></div>
                    <button className="fd-magic" disabled={busy} onClick={() => switchMode("magic")}>
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
              </>

            /* ── unconfigured: local-only build ───────────────────── */
            ) : (
              <>
                <p className="fd-lead">Everything you make saves to this browser — no account needed.</p>
                <p className="fd-fine">
                  Accounts aren't connected on this deployment yet. Once they are, sign-in
                  and cloud saves switch on here.
                </p>
                <button className="fd-primary" onClick={() => navigate("#/app")}>Open the generator</button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
