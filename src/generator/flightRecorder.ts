/* Flight recorder — the freeze hunt's black box.

   A "Page Unresponsive" wedge leaves no console, no stack, no report: the
   main thread simply never runs again, and every replica of the owner's
   data on our side comes back clean. So the app keeps a tiny breadcrumb
   ring (clicks, keys, route hops, cloud transitions, long tasks, errors)
   in localStorage, with a once-a-second beat. When a session wedges, the
   beat stops and the ring's tail is the last thing the main thread did —
   readable afterwards from SAFE MODE's "Copy diagnostics" button.

   Ground rules:
   - Keys live OUTSIDE the ui-generator sync prefix: never pushed to the
     cloud, never part of the doc, invisible to the write hook and poll
     (same doctrine as the thumbnail circuit breaker).
   - Interaction entries flush SYNCHRONOUSLY from a window capture
     listener, so a click whose handler wedges the tab is still the last
     recorded entry.
   - Three ring slots used round-robin per session, so a frozen tab's
     evidence survives the next couple of boots (and two live tabs never
     clobber each other's ring).
   - No PII: element descriptors and UI labels only — never input values,
     never plain typed characters, never stored-key contents.
   - SAFE MODE does not record — a safe boot is the reading session, and
     writing there would overwrite the very evidence it came to collect. */

const SEQ_KEY = "forge-flightrec-seq";
const SLOT_PREFIX = "forge-flightrec-"; // + 0|1|2
export const FLIGHT_SLOTS = 3;

// same derivation as store.ts's SAFE_BOOT — duplicated on purpose: this
// module is wired from main.tsx and must not drag the generator store
// (and everything it imports) into the landing bundle
const SAFE = typeof location !== "undefined" && /[?&#]safe\b/.test(location.href);

const MAX_ENTRIES = 110;
const MAX_ENTRY_LEN = 90;

type Ring = { boot: number; beat: number; build: string; entries: string[] };

let ring: Ring | null = null;
let slotKey = "";
let dirty = false;
let t0 = 0;
const lastByChannel: Record<string, string> = {};

function writeRing() {
  if (!ring) return;
  ring.beat = Date.now();
  try { localStorage.setItem(slotKey, JSON.stringify(ring)); } catch { /* quota — the app's problem is bigger than ours */ }
  dirty = false;
}

/** Append a breadcrumb. `sync` flushes immediately (interaction entries —
    the wedge race is real); everything else rides the 1s beat. */
export function record(tag: string, sync = false) {
  if (!ring) return;
  const t = ((Date.now() - t0) / 1000).toFixed(1);
  ring.entries.push(`${t}s ${tag}`.slice(0, MAX_ENTRY_LEN));
  if (ring.entries.length > MAX_ENTRIES) ring.entries.splice(0, ring.entries.length - MAX_ENTRIES);
  if (sync) writeRing(); else dirty = true;
}

/** Append only when the tag changed for this channel — keeps chatty
    sources (cloud status fires on every synced tick) to transitions. */
export function recordChange(channel: string, tag: string) {
  if (lastByChannel[channel] === tag) return;
  lastByChannel[channel] = tag;
  record(`${channel} ${tag}`);
}

/* a compact, PII-free description of what was clicked */
function describe(el: EventTarget | null): string {
  if (!(el instanceof Element)) return "?";
  const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
  let label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
  if (!label && el instanceof HTMLElement && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
    label = (el.textContent ?? "").trim().slice(0, 20);
  }
  return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${label ? ` "${label}"` : ""}`;
}

export function startFlightRecorder() {
  if (SAFE || ring || typeof localStorage === "undefined") return;
  try {
    const n = Number(localStorage.getItem(SEQ_KEY) ?? 0) || 0;
    localStorage.setItem(SEQ_KEY, String((n + 1) % FLIGHT_SLOTS));
    slotKey = SLOT_PREFIX + String(n % FLIGHT_SLOTS);
  } catch { return; /* storage unavailable — nothing to record into */ }
  t0 = Date.now();
  const build = typeof __BUILD_STAMP__ === "string" ? __BUILD_STAMP__.split(" ")[0] : "dev";
  ring = { boot: t0, beat: t0, build, entries: [] };
  record(`boot ${build} ${location.hash.slice(0, 24)} ${navigator.userAgent.includes("Mac") ? "mac" : "other"}`);
  writeRing();

  // interactions flush synchronously, ahead of the app's own handlers
  window.addEventListener("pointerdown", (e) => { record(`down ${describe(e.target)}`, true); }, true);
  window.addEventListener("keydown", (e) => {
    // modifier chords and structural keys only — typed text is not ours
    const structural = e.key.length > 1;
    if (!structural && !e.metaKey && !e.ctrlKey && !e.altKey) return;
    const mods = `${e.metaKey ? "meta+" : ""}${e.ctrlKey ? "ctrl+" : ""}${e.altKey ? "alt+" : ""}${e.shiftKey ? "shift+" : ""}`;
    record(`key ${mods}${structural ? e.key : e.key.toLowerCase()}`, true);
  }, true);
  window.addEventListener("hashchange", () => { record(`route ${location.hash.slice(0, 30)}`, true); });
  document.addEventListener("visibilitychange", () => { record(`vis ${document.visibilityState}`, true); });
  window.addEventListener("pagehide", () => { record("pagehide", true); });
  window.addEventListener("error", (e) => { record(`error ${String(e.message).slice(0, 60)}`, true); });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => { record(`reject ${String(e.reason).slice(0, 60)}`, true); });

  // completed long tasks — the jank trail that often leads up to a wedge
  try {
    new PerformanceObserver((list) => {
      for (const en of list.getEntries()) if (en.duration >= 200) record(`longtask ${Math.round(en.duration)}ms`);
    }).observe({ type: "longtask", buffered: true });
  } catch { /* observer unsupported — the beat still tells the story */ }

  // the beat: while this ticks, the main thread is alive
  setInterval(() => { if (ring) { if (dirty) writeRing(); else { ring.beat = Date.now(); try { localStorage.setItem(slotKey, JSON.stringify(ring)); } catch { /* ignore */ } } } }, 1000);
}

/** Every stored ring, newest beat first — SAFE MODE's diagnostics reads
    these to show what each recent session was doing when it went quiet. */
export function readFlightRings(): { slot: string; ring: Ring }[] {
  const out: { slot: string; ring: Ring }[] = [];
  for (let i = 0; i < FLIGHT_SLOTS; i++) {
    try {
      const raw = localStorage.getItem(SLOT_PREFIX + String(i));
      if (!raw) continue;
      const r = JSON.parse(raw) as Ring;
      if (r && Array.isArray(r.entries)) out.push({ slot: String(i), ring: r });
    } catch { /* corrupt slot — skip */ }
  }
  out.sort((a, b) => b.ring.beat - a.ring.beat);
  return out;
}
