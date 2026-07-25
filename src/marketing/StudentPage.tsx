import { useEffect, useState } from "react";
import { GraduationCap, ShieldCheck, Upload, CheckCircle2, Loader2, Clock, ChevronRight } from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { openAuth } from "@/shell/authOverlay";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { submitStudentVerification, myStudentStatus, type StudentStatus } from "@/generator/student";
import { startCheckout } from "@/generator/billing";

/* #/student — apply for the verified student rate.

   The gate is deliberately human: an educational address plus a current
   student ID, reviewed by a person. No automated .edu regex decides
   anything — a domain check would lock out most of the world (.ac.uk,
   .edu.au, and the many universities on plain national domains) while
   still being trivial to fake.

   PRIVACY: the ID image is written to a private bucket, read only by the
   reviewer, and DELETED the moment a decision is made. We keep the
   decision, the school address and the date — never the document. That
   promise is made on this page because it is a promise we keep in code
   (see the approve step in api/student-review). */

const MAX_MB = 8;

export function StudentPage() {
  const status = useCloudStatus();
  const signedIn = status.state === "synced" || status.state === "syncing" || status.state === "error";

  const [school, setSchool] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /* Where this account stands. This page is the ONE place a student lands
     for the whole journey — apply, wait, then buy — so the CTA on the
     pricing page can always point here without knowing anything. */
  const [state, setState] = useState<StudentStatus | null>(null);
  useEffect(() => {
    if (!signedIn) { setState("none"); return; }
    let live = true;
    void myStudentStatus().then((s2) => { if (live) setState(s2); });
    return () => { live = false; };
  }, [signedIn, done]);

  const buy = async () => {
    setBusy(true); setErr(null);
    const e = await startCheckout();   // server prices this at the student rate
    if (e) { setErr(e); setBusy(false); }
  };

  const tooBig = !!file && file.size > MAX_MB * 1024 * 1024;
  const ready = signedIn && !!school.trim() && !!file && !tooBig && attest && !busy;

  const submit = async () => {
    if (!ready || !file) return;
    setBusy(true); setErr(null);
    const e = await submitStudentVerification(school.trim(), file);
    setBusy(false);
    if (e) setErr(e); else setDone(true);
  };

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/pricing")}>← Pricing</button>
        <span className="fd-pricing__mark">PatternBreak</span>
      </header>

      <main className="fd-student">
        <span className="fd-pricing__ico fd-pricing__ico--edu"><GraduationCap size={17} strokeWidth={2.1} /></span>
        <h1>Student &amp; educator access</h1>
        <p className="fd-pricing__sub">
          The same tool professionals ship with, at $15.99 a year instead of $29.99.
          Send us proof you're enrolled or teaching and we'll switch your account over.
        </p>

        {state === "approved" ? (
          <section className="fd-studentcard">
            <p className="fd-studentcard__ok">
              <CheckCircle2 size={18} strokeWidth={2.2} /> You're verified
            </p>
            <p>
              Your student rate is ready. Checkout below bills $15.99 a year
              instead of $29.99 — everything else is the same account you're
              already signed in to.
            </p>
            <button className="fd-pricing__cta fd-pricing__cta--edu" disabled={busy} onClick={() => void buy()}>
              {busy
                ? (<><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Opening checkout…</>)
                : (<>Subscribe — $15.99/year <ChevronRight size={15} strokeWidth={2.4} /></>)}
            </button>
            <p className="fd-pricing__renew">
              You'll be charged $15.99 today, plus applicable tax. Renews automatically
              every 12 months at the then-current student price unless you cancel.
              Cancel anytime from your account — cancelling stops the next charge and
              your access runs to the end of the term. We may ask you to re-verify
              enrolment or teaching status before a renewal.
            </p>
            {err && <p className="fd-pricing__err">{err}</p>}
          </section>
        ) : state === "pending" && !done ? (
          <section className="fd-studentcard">
            <p className="fd-studentcard__ok fd-studentcard__ok--wait">
              <Clock size={18} strokeWidth={2.2} /> Under review
            </p>
            <p>
              We've got your application and we're looking at it — usually a day or
              two. We'll email you, and this page will show a checkout button the
              moment you're approved.
            </p>
            <button className="fd-pricing__cta fd-pricing__cta--ghost" onClick={() => navigate("#/app")}>
              Back to the generator
            </button>
          </section>
        ) : done ? (
          <section className="fd-studentcard">
            <p className="fd-studentcard__ok">
              <CheckCircle2 size={18} strokeWidth={2.2} /> Application received
            </p>
            <p>
              We'll review it and email you — usually within a day or two. Once you're
              approved, the student rate appears on the pricing page and you can
              subscribe from there.
            </p>
            <button className="fd-pricing__cta fd-pricing__cta--ghost" onClick={() => navigate("#/app")}>
              Back to the generator
            </button>
          </section>
        ) : (
          <section className="fd-studentcard">
            {!signedIn && (
              <p className="fd-studentcard__warn">
                You'll need an account first — that's what we attach the discount to.{" "}
                <button className="fd-linkbtn" onClick={() => openAuth("signin")}>Sign in or create one</button>.
              </p>
            )}

            <label className="fd-field">
              <span>School email address</span>
              <input type="email" value={school} disabled={!signedIn}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="you@university.edu" autoComplete="email" />
              <small>
                Any educational address — <code>.edu</code>, <code>.ac.uk</code>,
                <code>.edu.au</code> or your institution's own domain. It doesn't have
                to match the address on your account.
              </small>
            </label>

            <label className="fd-field">
              <span>Current student or faculty ID</span>
              <div className={`fd-drop${file ? " has-file" : ""}`}>
                <input type="file" accept="image/*,.pdf" disabled={!signedIn}
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(null); }} />
                <Upload size={16} strokeWidth={2.2} />
                <span>{file ? file.name : "Choose a photo or PDF"}</span>
              </div>
              <small>
                It needs to show your name and a date that hasn't passed. A faculty or
                staff card works too. Photos of a physical card are fine.
              </small>
              {tooBig && <small className="fd-field__err">That file is over {MAX_MB} MB — try a photo instead of a scan.</small>}
            </label>

            <label className="fd-check">
              <input type="checkbox" checked={attest} disabled={!signedIn}
                onChange={(e) => setAttest(e.target.checked)} />
              <span>I'm currently enrolled at, or teaching at, the institution above, and this ID is mine.</span>
            </label>

            <p className="fd-privacy">
              <ShieldCheck size={14} strokeWidth={2.2} />
              <span>
                <b>We delete your ID as soon as we've looked at it.</b> A person reviews
                it, records the decision, and the file is removed. We keep the school
                address and the date — never the document.
              </span>
            </p>

            <button className="fd-pricing__cta fd-pricing__cta--edu" disabled={!ready} onClick={() => void submit()}>
              {busy ? (<><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Sending…</>) : "Send for review"}
            </button>
            {err && <p className="fd-pricing__err">{err}</p>}
          </section>
        )}
      </main>
    </div>
  );
}
