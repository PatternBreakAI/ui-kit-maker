import { useState } from "react";
import {
  Check, X, Calendar, ShieldCheck, Compass, Crown, GraduationCap,
  Loader2, Globe, Target, Code2, ChevronRight, BadgeCheck, Sparkle,
} from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { openAuth } from "@/shell/authOverlay";
import { cloudConfig } from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { startCheckout } from "@/generator/billing";

/* #/pricing — three tiers, in the product's own voice.

   Explorer is the no-account trial (today's guest caps exactly), Pro is the
   one everyone buys, Student is the same tool at a verified discount. The
   Pro column takes real money through Stripe Checkout: signed-out visitors
   sign in first (a subscription needs an account to attach to), and the
   upgrade is granted server-side by the webhook — never by this page. */

type Row = { label: string; on?: boolean; note?: boolean };

const EXPLORER: Row[] = [
  { label: "Starter kit components" },
  { label: "4 starter presets" },
  { label: "100% zoom" },
  { label: "Limited PNG export" },
  { label: "Read-only share links" },
  { label: "No vector exports or cloud saves", on: false },
];

const PRO: Row[] = [
  { label: "Full kit components" },
  { label: "All starter presets + shared library" },
  { label: "Unlimited zoom" },
  { label: "PNG export up to 4×" },
  { label: "Vector exports: SVG, HTML, JSON, game kit" },
  { label: "Cloud saves & named projects" },
  { label: "Share links included" },
  { label: "Commercial use included" },
];

/* Student is Pro at a discount — NOT a cut-down build. There is no
   student tier in the caps table: any paid plan resolves to `pro`, so a
   student gets unlimited zoom, 4× PNG and every export. Listing smaller
   numbers here would be a straight lie, and crippling it would be the
   wrong move anyway — the point of student pricing is fluency in the
   whole tool, so they ask for it at work later. The only real difference
   is that eligibility is checked, and re-checked. */
const STUDENT: Row[] = [
  { label: "Everything in Pro — nothing held back" },
  { label: "Full kit, all presets, unlimited zoom" },
  { label: "PNG up to 4× and every vector export" },
  { label: "Cloud saves & named projects" },
  { label: "Commercial use included — keep what you ship" },
  { label: "Verified once, re-checked each year", note: true },
];

const PROOF = [
  { icon: Globe, title: "Runs in your browser", note: "No installs. Always up to date." },
  { icon: Target, title: "Deterministic, not AI", note: "You control every pixel." },
  { icon: ShieldCheck, title: "Commercial use included", note: "Ship with confidence." },
  { icon: Code2, title: "Export for engines, web, and mockups", note: "SVG, HTML, JSON & more." },
];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.label} className={r.on === false ? "is-off" : r.note ? "is-note" : undefined}>
          {r.on === false
            ? <X size={14} strokeWidth={2.6} />
            : r.note
              ? <BadgeCheck size={14} strokeWidth={2.6} />
              : <Check size={14} strokeWidth={2.8} />}
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function PricingPage() {
  const status = useCloudStatus();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signedIn = status.state === "synced" || status.state === "syncing" || status.state === "error";
  const billingLive = !!cloudConfig();

  const goPro = async () => {
    setErr(null);
    if (!signedIn) { openAuth("signin"); return; }
    setBusy(true);
    const e = await startCheckout();   // navigates away on success
    if (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="fd-pricing__mark">PatternBreak</span>
      </header>

      <main>
        <div className="fd-pricing__pills">
          <span className="fd-pill"><Calendar size={13} strokeWidth={2.2} /> Annual pricing</span>
          <span className="fd-pill"><ShieldCheck size={13} strokeWidth={2.2} /> Commercial use included</span>
        </div>

        <h1>Pick your tier</h1>
        <p className="fd-pricing__sub">
          Everything runs in your browser, and what you export is yours to ship.<br />
          Start with Free Explorer, then upgrade when you're ready for the full production toolkit.
        </p>

        <div className="fd-pricing__cols">
          {/* ── Explorer — the no-account trial ── */}
          <section className="fd-pricing__col">
            <span className="fd-pricing__ico"><Compass size={17} strokeWidth={2.1} /></span>
            <h2>Explorer</h2>
            <div className="fd-pricing__price">Free</div>
            <div className="fd-pricing__note">No account required</div>
            <div className="fd-pricing__forwho">Try the system</div>
            <Rows rows={EXPLORER} />
            <button className="fd-pricing__cta fd-pricing__cta--ghost" onClick={() => navigate("#/app")}>
              Start Building Free <ChevronRight size={15} strokeWidth={2.4} />
            </button>
          </section>

          {/* ── Pro — the one that pays for the thing ── */}
          <section className="fd-pricing__col fd-pricing__col--mid">
            <div className="fd-pricing__tag"><Crown size={12} strokeWidth={2.6} /> MOST POPULAR</div>
            <span className="fd-pricing__ico fd-pricing__ico--pro"><Sparkle size={17} strokeWidth={2.1} /></span>
            <h2>Pro</h2>
            <div className="fd-pricing__price">$29.99<span> / year</span></div>
            <div className="fd-pricing__note fd-pricing__note--accent">Founding price</div>
            <div className="fd-pricing__forwho fd-pricing__forwho--accent">For creators who ship</div>
            <Rows rows={PRO} />
            <button className="fd-pricing__cta fd-pricing__cta--pro" disabled={busy || !billingLive}
              title={billingLive ? "Secure checkout on Stripe" : "Checkout isn't available on this deployment."}
              onClick={() => void goPro()}>
              {busy
                ? (<><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Opening checkout…</>)
                : (<>{signedIn ? "Go Pro" : "Sign in and go Pro"} <ChevronRight size={15} strokeWidth={2.4} /></>)}
            </button>
            <p className="fd-pricing__founding">
              <ShieldCheck size={12} strokeWidth={2.2} /> Founding members keep this price while subscribed.
            </p>
            {/* The annual-renewal disclosure of record. It must appear before
                payment: Stripe Managed Payments rejects custom_text, so
                Checkout can't carry it and this line does. Wording tracks
                PRO_ANNUAL_CONSENT in api/checkout.ts — keep them together. */}
            <p className="fd-pricing__renew">
              You'll be charged $29.99 today, plus applicable tax. Renews automatically
              every 12 months at the then-current annual price unless you cancel.
              Cancel anytime from your account — cancelling stops the next charge and
              your Pro access runs to the end of the term.
            </p>
            {err && <p className="fd-pricing__err">{err}</p>}
          </section>

          {/* ── Student — same tool, verified discount ── */}
          <section className="fd-pricing__col fd-pricing__col--edu">
            <div className="fd-pricing__tag fd-pricing__tag--edu"><BadgeCheck size={12} strokeWidth={2.6} /> VERIFIED DISCOUNT</div>
            <span className="fd-pricing__ico fd-pricing__ico--edu"><GraduationCap size={17} strokeWidth={2.1} /></span>
            <h2>Student</h2>
            <div className="fd-pricing__price">$15.99<span> / year</span></div>
            <div className="fd-pricing__note">For verified students &amp; educators</div>
            <div className="fd-pricing__forwho fd-pricing__forwho--edu">The whole tool, half the price</div>
            <Rows rows={STUDENT} />
            <button className="fd-pricing__cta fd-pricing__cta--edu" onClick={() => navigate("#/student")}>
              Get Student Access <ChevronRight size={15} strokeWidth={2.4} />
            </button>
          </section>
        </div>

        <div className="fd-proof">
          {PROOF.map(({ icon: Ico, title, note }) => (
            <div className="fd-proof__item" key={title}>
              <span className="fd-proof__ico"><Ico size={17} strokeWidth={2} /></span>
              <div>
                <b>{title}</b>
                <span>{note}</span>
              </div>
            </div>
          ))}
        </div>

        <section className="fd-studio">
          <div>
            <h3>Need a studio or classroom plan?</h3>
            <p>Custom seats, team libraries, and flexible licensing.</p>
          </div>
          <a className="fd-pricing__cta fd-pricing__cta--ghost" href="mailto:hello@uikitmaker.com?subject=Studio%20%2F%20classroom%20plan">
            Contact us <ChevronRight size={15} strokeWidth={2.4} />
          </a>
        </section>

        <p className="fd-pricing__fine">License in one line: ship your kits in any product, commercial included — just don't resell or redistribute the assets themselves.</p>
      </main>
    </div>
  );
}
