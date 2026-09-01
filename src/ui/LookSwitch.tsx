import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import "@/styles/pricing.css";
import { useGen } from "@/generator/store";

/* Round 45 · B1 — the look-switch door's two moments, mounted app-wide:

   · the GUARD SHEET: tweaks made since the last look apply or save would be
     replaced by the incoming look, so the switch parks behind a small
     are-you-sure (owner: "Hey, you're changing looks, x will be lost unless
     you save, ok?"). Browsing looks back-to-back never asks — only a real
     edit arms it, and any save settles it.
   · the LANDING PILL: the brief "loading the look" moment while the
     incoming look's typefaces arrive (the commit waits for them so the kit
     never paints a new look in fallback letterforms). Cached faces skip
     the pill entirely. */
export function LookSwitch() {
  const busy = useGen((s) => s.lookBusy);
  const pending = useGen((s) => s.pendingLook);
  const confirm = useGen((s) => s.confirmPendingLook);
  const cancel = useGen((s) => s.cancelPendingLook);

  /* the standard dismissal manners (owner, round 56: "we should add a
     'cancel' button to the switch look modal... clicking outside the modal
     should also kill it"): Escape here, the backdrop below, the Cancel
     button in the row — all three run the same cancel, which only clears
     the pending look (no changes, no history entry). */
  useEffect(() => {
    if (!pending || busy !== null) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [pending, busy, cancel]);

  if (busy !== null) {
    return (
      <div className="lookbusy" role="status" aria-live="polite">
        <div className="lookbusy-pill">
          <Loader2 size={15} strokeWidth={2.4} className="fd-spin" />
          <span>Loading {busy ? <>“<b>{busy}</b>”</> : "the look"}…</span>
        </div>
      </div>
    );
  }
  if (!pending) return null;
  return (
    <div className="ph-veil" role="dialog" aria-modal="true" aria-label="Switch look"
      onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="ph-sheet">
        <b>Switch to {pending.name ? `“${pending.name}”` : "this look"}?</b>
        <p>
          A look replaces the whole design — colors, type, silhouettes and every
          per-piece tweak. The tweaks you've made since your last save will be
          lost unless you save first. (Undo — Ctrl/⌘Z — brings the old design
          back if you change your mind right after.)
        </p>
        <div className="ph-sheetrow">
          <button className="fd-pricing__cta" onClick={confirm}>Switch look</button>
          <button className="cg-open" onClick={cancel} title="Nothing changes — your tweaks stay as they are">Cancel</button>
        </div>
      </div>
    </div>
  );
}
