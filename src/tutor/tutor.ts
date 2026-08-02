import { create } from "zustand";
import { useGen } from "@/generator/store";
import { helpNavigate } from "@/ui/smartHelp";

/* Tutor — game-style contextual tips.
   POLICY (owner mandate, 2026-08-02):
   · A tip is (recent action, current context) → one short coaching line,
     shown as a toast over the canvas that fades on its own. Never a modal,
     never blocks input, one tip on screen at a time.
   · Every tip has a DESTINATION: the CTA navigates to the exact control and
     glows it (the Smart Help deep-link mechanism). A tip with nowhere to
     send you is trivia, not tutoring.
   · Frequency has teeth: one showing per tip per session, a lifetime cap,
     and a global gap between any two tips — a coach, not a parrot.
   · ADMIN-ONLY until the owner releases it, regardless of what else ships:
     the cap button renders for admins and the engine checks isAdmin at fire
     time, so merges can't leak it to the public.
   · No AI at runtime. The registry is hand-written copy — new tips are
     authored from real confusion moments (each owner/user report becomes a
     candidate tip) and wired to a concrete, detectable transition. */

export interface Tip {
  id: string;
  headline: string;
  body: string;
  cta?: { label: string; go: () => void };
}

type Gen = ReturnType<typeof useGen.getState>;

/* Wired tips — copy plus a transition detector over the store. detect runs
   on every store change with (next, prev); keep it cheap. */
const WIRED: Array<Tip & { detect: (s: Gen, p: Gen) => boolean }> = [
  {
    /* The badge lesson: the Typography nudge moves the words, and states
       that show only the icon ride along — so it "moves them both". The
       Icons nudge is the icon's own handle. */
    id: "two-nudges",
    headline: "Two nudges live here",
    body: "The Typography nudge moves the words — and any state that shows only the icon rides along with them. To place the icon by itself, use Icons → Nudge.",
    cta: { label: "Show me Icons → Nudge", go: () => helpNavigate("icon") },
    detect: (s, p) => {
      const textNudged = s.kitTextOy !== p.kitTextOy || s.kitTextOx !== p.kitTextOx
        || s.cfg.type.oy !== p.cfg.type.oy || s.cfg.type.ox !== p.cfg.type.ox;
      if (!textNudged || s.phase !== "master") return false;
      const f = s.focus;
      return !!(f ? (s.kitDesigns[f]?.icon?.show ?? s.cfg.icon.show) : s.cfg.icon.show);
    },
  },
];

/* Drafted tips — copy written ahead of wiring, so the catalog grows faster
   than the plumbing. Each needs a detectable transition before it ships;
   none of these fire yet. */
export const DRAFT_TIPS: Tip[] = [
  { id: "state-forks", headline: "Edits follow the selected state", body: "With Hover selected, design changes save to Hover alone — Default stays put. Flip back to Default for kit-wide moves." },
  { id: "group-scope", headline: "Editing pieces one by one?", body: "The scope bar's Group setting pins one edit to the whole family — locks are respected, and it's a single undo." },
  { id: "locked-piece", headline: "This piece is locked", body: "Lock — finished pauses every edit on this piece. Unlock in the scope bar to keep designing." },
  { id: "label-caps", headline: "Why did my label stop?", body: "Reading-line pieces cap their text so the layout can't break — the counter under the field shows each piece's limit." },
  { id: "whole-doc-undo", headline: "Undo covers everything", body: "Cmd+Z rewinds the whole document — piece looks, labels and icons included, not just the master." },
  { id: "looks-carry-all", headline: "Looks carry the whole kit", body: "Saving a look packs every piece's design with it — apply it anywhere and the full kit comes back." },
  { id: "kit-size", headline: "Size is a kit decision", body: "The M/L switch in the floating nav sizes every piece at once — locked pieces keep their snapshot size." },
  { id: "viewer-mode", headline: "You're viewing a shared kit", body: "Browsing is open; to make it yours, save a copy to your projects first." },
  { id: "staged-pieces", headline: "Staged pieces are backstage", body: "Components in the staging bay are admin-only until released — visitors never see them." },
  { id: "extremes", headline: "Proof at the extremes", body: "Max the extrusion and type size before you ship a look — the edges are where layouts crack." },
];

const SESSION_CAP = 1;   // showings per tip per page load
const LIFE_CAP = 3;      // showings per tip per browser, persisted
const GLOBAL_GAP = 45_000; // ms between any two tips

const seenLife = ((): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem("ui-tutor-seen") ?? "{}"); } catch { return {}; }
})();
const seenSession: Record<string, number> = {};
let lastShown = 0;

interface TutorState {
  /** The cap toggle — persisted, but the engine still requires isAdmin. */
  on: boolean;
  active: Tip | null;
  setOn: (v: boolean) => void;
  dismiss: () => void;
}

export const useTutor = create<TutorState>((set) => ({
  on: ((): boolean => { try { return localStorage.getItem("ui-tutor-on") === "1"; } catch { return false; } })(),
  active: null,
  setOn: (v) => {
    try { localStorage.setItem("ui-tutor-on", v ? "1" : "0"); } catch { /* ignore */ }
    set({ on: v, ...(v ? {} : { active: null }) });
  },
  dismiss: () => set({ active: null }),
}));

function eligible(id: string): boolean {
  const now = Date.now();
  if (now - lastShown < GLOBAL_GAP) return false;
  if ((seenSession[id] ?? 0) >= SESSION_CAP) return false;
  if ((seenLife[id] ?? 0) >= LIFE_CAP) return false;
  return true;
}

function show(tip: Tip): void {
  const now = Date.now();
  lastShown = now;
  seenSession[tip.id] = (seenSession[tip.id] ?? 0) + 1;
  seenLife[tip.id] = (seenLife[tip.id] ?? 0) + 1;
  try { localStorage.setItem("ui-tutor-seen", JSON.stringify(seenLife)); } catch { /* ignore */ }
  useTutor.setState({ active: tip });
}

let started = false;
/** Start watching the editor. Idempotent — App calls it once on mount. */
export function startTutor(): void {
  if (started) return;
  started = true;
  useGen.subscribe((s, p) => {
    if (!useTutor.getState().on || !s.isAdmin) return;
    if (useTutor.getState().active) return;
    for (const tip of WIRED) {
      if (eligible(tip.id) && tip.detect(s, p)) { show(tip); return; }
    }
  });
}
