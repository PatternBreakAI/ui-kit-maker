import { useEffect, useRef, useState } from "react";
import {
  Check, X, Calendar, ShieldCheck, Compass, Crown, GraduationCap,
  Loader2, Globe, Target, Code2, ChevronRight, BadgeCheck, Star,
} from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { openAuth } from "@/shell/authOverlay";
import { cloudConfig } from "@/generator/cloud";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { startCheckout } from "@/generator/billing";
import { HUD_LEFT, HUD_RIGHT, paintHud } from "./pricingHud";

/* #/pricing — three tiers, in the product's own voice.

   Explorer is the no-account trial (today's guest caps exactly), Pro is the
   one everyone buys, Student is the learning tier at a verified price. The
   Pro column takes real money through Stripe Checkout: signed-out visitors
   sign in first (a subscription needs an account to attach to), and the
   upgrade is granted server-side by the webhook — never by this page.

   The chrome is a console shell: chamfered frames, a tab welded into the
   Pro card's top edge, and live HUD renders in the margins (see
   pricingHud.ts — real engine output, not decoration). */

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
  { label: "Every export: SVG, HTML, engine kit, game kit" },
  { label: "Cloud saves & named projects" },
  { label: "Share links included" },
  { label: "Commercial use included" },
];

/* Student is a real tier, not a discount code on Pro — every line below is
   enforced. `student` has its own row in TIER_CAPS and its own entry in
   EXPORT_KINDS, and /api/export checks the requested artifact against the
   plan_id in the database before it issues anything.

   Where the line falls: everything you need to LEARN and to build a
   portfolio, stopping short of the SHIPPING formats. The engine kit (Unity
   importer, nine-slice manifest) and the game-kit atlas are what a studio
   putting a product on a store needs, and those stay with Pro. Keep this
   list in step with EXPORT_KINDS and TIER_CAPS. */
const STUDENT: Row[] = [
  { label: "Full kit components + all presets" },
  { label: "150% zoom" },
  { label: "PNG export up to 2×" },
  { label: "Vector exports: SVG, HTML, sprite sheet" },
  { label: "Cloud saves & named projects" },
  { label: "Commercial use included" },
  { label: "Engine kit and game kit are Pro formats", on: false },
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

/** A price as the console draws it: small currency mark, big number. */
function Price({ amount, per }: { amount: string; per?: string }) {
  return (
    <div className="fd-pricing__price">
      {amount.startsWith("$") && <span className="fd-pricing__cur">$</span>}
      {amount.replace(/^\$/, "")}
      {per && <span className="fd-pricing__per"> / {per}</span>}
    </div>
  );
}

export function PricingPage() {
  const status = useCloudStatus();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signedIn = status.state === "synced" || status.state === "syncing" || status.state === "error";
  const billingLive = !!cloudConfig();
  const hudRef = useRef<HTMLDivElement>(null);

  /* The ornaments render after paint so the engine chunk never sits in
     front of the pricing table. If it never arrives, they stay empty. */
  useEffect(() => {
    const host = hudRef.current;
    if (!host) return;
    let cancelled = false;
    void paintHud(host, () => cancelled);
    return () => { cancelled = true; };
  }, []);

  const goPro = async () => {
    setErr(null);
    if (!signedIn) { openAuth("signin"); return; }
    setBusy(true);
    const e = await startCheckout();   // navigates away on success
    if (e) { setErr(e); setBusy(false); }
  };

  return (
    <div className="fd-pricing" ref={hudRef}>
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="fd-pricing__mark"><i className="fd-pricing__gem" aria-hidden="true" />PatternBreak</span>
      </header>

      <main>
        {/* ── HUD margins — live renders, purely ornamental ── */}
        <div className="fd-hud fd-hud--l" aria-hidden="true">
          <span className="fd-hud__cap">GRID 8PX</span>
          <div className="fd-hud__row">
            {HUD_LEFT.slice(0, 2).map((s, i) => (
              <div key={i} className="fd-hud__art" style={{ width: s.w }}
                data-hud={s.kid} data-v={s.value} data-label={s.label} />
            ))}
          </div>
          <div className="fd-hud__row">
            {HUD_LEFT.slice(2).map((s, i) => (
              <div key={i} className="fd-hud__art" style={{ width: s.w }}
                data-hud={s.kid} data-v={s.value} data-label={s.label} />
            ))}
          </div>
        </div>

        <div className="fd-hud fd-hud--r" aria-hidden="true">
          <span className="fd-hud__cap">COMPONENT PREVIEW</span>
          <div className="fd-hud__row fd-hud__row--end">
            {HUD_RIGHT.slice(0, 4).map((s, i) => (
              <div key={i} className="fd-hud__art" style={{ width: s.w }}
                data-hud={s.kid} data-icon={s.icon} />
            ))}
          </div>
          {HUD_RIGHT.slice(4).map((s, i) => (
            <div key={i} className="fd-hud__art fd-hud__art--wide" style={{ width: s.w }}
              data-hud={s.kid} data-v={s.value} data-label={s.label} />
          ))}
        </div>

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
            <div className="fd-pricing__head">
              <span className="fd-pricing__ico"><Compass size={18} strokeWidth={2.1} /></span>
              <h2>Explorer</h2>
            </div>
            <Price amount="Free" />
            <div className="fd-pricing__note">No account required</div>
            <div className="fd-pricing__forwho">Try the system</div>
            <Rows rows={EXPLORER} />
            <button className="fd-pricing__cta fd-pricing__cta--ghost" onClick={() => navigate("#/app")}>
              Start Building Free <ChevronRight size={15} strokeWidth={2.4} />
            </button>
          </section>

          {/* ── Pro — the one that pays for the thing ── */}
          <section className="fd-pricing__col fd-pricing__col--mid">
            <div className="fd-pricing__tag"><Star size={12} strokeWidth={2.6} /> MOST POPULAR</div>
            <div className="fd-pricing__head">
              {/* Crown, not the four-point star the mock carried — that mark
                  is the AI badge this product never wears. */}
              <span className="fd-pricing__ico fd-pricing__ico--pro"><Crown size={18} strokeWidth={2.1} /></span>
              <h2>Pro</h2>
            </div>
            <Price amount="$29.99" per="year" />
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
            {err && <p className="fd-pricing__err">{err}</p>}
          </section>

          {/* ── Student — the learning tier, verified ── */}
          <section className="fd-pricing__col fd-pricing__col--edu">
            <div className="fd-pricing__tag fd-pricing__tag--edu"><BadgeCheck size={12} strokeWidth={2.6} /> VERIFIED DISCOUNT</div>
            <div className="fd-pricing__head">
              <span className="fd-pricing__ico fd-pricing__ico--edu"><GraduationCap size={18} strokeWidth={2.1} /></span>
              <h2>Student</h2>
            </div>
            <Price amount="$15.99" per="year" />
            <div className="fd-pricing__note">For verified students &amp; educators</div>
            <div className="fd-pricing__forwho fd-pricing__forwho--edu">Learn with the real tool</div>
            <Rows rows={STUDENT} />
            <button className="fd-pricing__cta fd-pricing__cta--edu" onClick={() => navigate("#/student")}>
              Get Student Access <ChevronRight size={15} strokeWidth={2.4} />
            </button>
          </section>
        </div>

        {/* The annual-renewal disclosure of record. It must appear before
            payment: Stripe Managed Payments rejects custom_text, so Checkout
            can't carry it and this line does. It sits directly beneath the
            table rather than inside the Pro card so it reads at a legible
            size and the three columns keep their shape. Wording tracks
            PRO_ANNUAL_CONSENT in api/checkout.ts — keep them together. */}
        <p className="fd-pricing__renew">
          Paid plans are annual. You'll be charged $29.99 for Pro (or $15.99 for a verified
          Student plan) today, plus applicable tax, and the plan renews automatically every
          12 months at the then-current annual price unless you cancel. Cancel anytime from
          your account — cancelling stops the next charge and your access runs to the end of
          the term. Student eligibility may be re-verified before a renewal.
        </p>

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
          <StudioArt />
          <div className="fd-studio__say">
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

/* Blueprint line-art behind the studio band — a keep on one side, a
   classroom on the other. Drawn thin and faint so it reads as schematic
   under-print rather than illustration. */
function StudioArt() {
  return (
    <>
      <svg className="fd-studio__art fd-studio__art--l" viewBox="0 0 220 96" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M18 92V44l14-9 14 9v48" />
          <path d="M46 92V52h34v40" />
          <path d="M80 92V38l16-10 16 10v54" />
          <path d="M112 92V56h30v36" />
          <path d="M142 92V46l13-8 13 8v46" />
          <path d="M18 44h28M80 38h32M142 46h26" />
          <path d="M96 28V14h18l-6 5 6 5H96" />
          <path d="M60 92V72h12v20M122 92V74h12v18" />
          <circle cx="96" cy="52" r="6" />
          <path d="M8 92h180" />
        </g>
      </svg>
      <svg className="fd-studio__art fd-studio__art--r" viewBox="0 0 200 96" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
          <rect x="58" y="10" width="86" height="46" rx="3" />
          <path d="M70 24h44M70 34h58M70 44h30" />
          <path d="M14 92V70h44v22M14 70h44M30 92v-8h12v8" />
          <path d="M78 92V70h44v22M78 70h44M94 92v-8h12v8" />
          <path d="M142 92V70h44v22M142 70h44M158 92v-8h12v8" />
          <path d="M6 92h188" />
        </g>
      </svg>
    </>
  );
}
