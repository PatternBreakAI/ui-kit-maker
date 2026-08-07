import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useGen } from "@/generator/store";

/* First-visit hints (owner: "I definitely want to do first visit hints").
   Two coach marks on the controls seasoned users have walked past — the
   Play toggle and the state picker. Sequential, dismissable, shown once
   per browser; ?hints anywhere in the URL re-arms them for review.
   This is the seed of onboarding, not the whole tree: two marks that
   earn their interruption, not a tour. */

interface Hint { id: string; sel: string; title: string; body: string }

const HINTS: Hint[] = [
  {
    id: "play",
    sel: '.zoolbar button[title^="Play mode"]',
    title: "This canvas is playable",
    body: "The pencil designs. The ▶ plays — hover and press your button and it responds exactly like it will in your game.",
  },
  {
    id: "states",
    sel: ".allstateschip",
    title: "One look per state",
    body: "Default, Hover, Pressed and Disabled each get their own design — pick a state here to style it. The All states chip writes a single edit across all four.",
  },
];

const KEY = "ui-hints-v1";
const forced = () =>
  typeof location !== "undefined" && (location.search.includes("hints") || location.hash.includes("hints"));

export function FirstVisitHints() {
  const phase = useGen((s) => s.phase);
  const sliceStage = useGen((s) => s.sliceStage);
  const [step, setStep] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (phase !== "master" || step >= 0) return;
    try { if (localStorage.getItem(KEY) && !forced()) return; } catch { return; }
    const t = window.setTimeout(() => setStep(0), 1600);
    return () => window.clearTimeout(t);
  }, [phase, step]);

  // the target's live box — re-read on step, resize, and layout drift
  useEffect(() => {
    if (step < 0 || step >= HINTS.length) return;
    const read = () => {
      const el = document.querySelector(HINTS[step].sel);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    read();
    const t = window.setInterval(read, 600);
    window.addEventListener("resize", read);
    return () => { window.clearInterval(t); window.removeEventListener("resize", read); };
  }, [step]);

  const finish = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setStep(HINTS.length);
  };
  const next = () => {
    // a missing next target (panel closed, mode switched) skips forward
    for (let s = step + 1; s < HINTS.length; s++) {
      if (document.querySelector(HINTS[s].sel)) { setStep(s); return; }
    }
    finish();
  };

  useEffect(() => {
    if (step < 0 || step >= HINTS.length) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // the slicing workbench covers the canvas — hold the hint until it closes
  if (phase !== "master" || sliceStage || step < 0 || step >= HINTS.length || !rect) return null;
  const hint = HINTS[step];
  const CARD_W = 296, CARD_H = 132, M = 14;
  const below = rect.bottom + CARD_H + M < window.innerHeight;
  const top = below ? rect.bottom + M : Math.max(12, rect.top - CARD_H - M);
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - CARD_W / 2, window.innerWidth - CARD_W - 12));
  return (
    <>
      <div className="fv-pulse" style={{
        left: rect.left + rect.width / 2, top: rect.top + rect.height / 2,
      }} aria-hidden="true" />
      <div className={`fv-card${below ? "" : " up"}`} role="dialog" aria-label={hint.title}
        style={{ left, top, width: CARD_W }}>
        <b>{hint.title}</b>
        <p>{hint.body}</p>
        <div className="fv-row">
          <span className="fv-dots">{HINTS.map((h, i) => <i key={h.id} className={i === step ? "on" : ""} />)}</span>
          <button className="fv-next" onClick={next}>{step === HINTS.length - 1 ? "Got it" : "Next"}</button>
        </div>
        <button className="fv-x" onClick={finish} aria-label="Dismiss hints"><X size={13} /></button>
      </div>
    </>
  );
}
