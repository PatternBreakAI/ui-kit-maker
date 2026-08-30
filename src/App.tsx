import { useEffect, useRef, useState } from "react";
import { TopBar } from "./ui/TopBar";
import { Rail, Panel } from "./ui/Panel";
import { CanvasView } from "./ui/CanvasView";
import { useGen, rehydrateBoardBgs, SAFE_BOOT } from "./generator/store";
import { LootModal } from "./ui/LootModal";
import { GateModal } from "./ui/GateModal";
import { NewKitSheet } from "./ui/NewKitSheet";
import { LookSwitch } from "./ui/LookSwitch";
import { loadPublicProject, onCloudStatus } from "./generator/cloud";
import { readFlightRings } from "./generator/flightRecorder";
import { ensureFont } from "./generator/fonts";
import { registerCustomFont } from "./generator/model";
import { TutorTip } from "./ui/TutorTip";
import { startTutor } from "./tutor/tutor";

/* Board backdrops rehydrate (and legacy data-URL boards MIGRATE into the
   vault) at BOOT, not on first Board visit — a fat board key made every
   edit-screen click drag pixels through history and cloud sync (field:
   "freezes whenever I click anything in the left tray"). */
function useBoardBgBoot() {
  useEffect(() => { void rehydrateBoardBgs(); }, []);
  /* a board whose backdrop lives only in the ACCOUNT's bucket (fresh
     browser, workspace arrived via sync) can't paint until the parked
     session restores — poke the rehydrate once when the cloud COMES UP.
     Two hard-won rules (the live backdrop flicker, 2026-08-16):
     · only a TRANSITION into the cloud-up states pokes — a status event
       fires on every synced-keyspace write (the TopBar's syncing→synced
       flip), so poking per event re-resolved every backdrop on every
       edit and every push, forever;
     · a live blob: URL is NOT missing — object URLs never survive a
       reload (loadBoards nulls them at boot), so any blob: in state was
       minted this session and still paints. Counting it as missing made
       each poke mint a FRESH object URL, swap the CSS url, and force a
       re-decode: the visible flicker. */
  useEffect(() => {
    let wasUp = false;
    return onCloudStatus((s) => {
      const up = s.state === "synced" || s.state === "syncing";
      const rose = up && !wasUp;
      wasUp = up;
      if (!rose) return;
      const missing = useGen.getState().boards.some((b) => b.bgAssetId && !b.bgImage);
      if (missing) void rehydrateBoardBgs({ retry: true });
    });
  }, []);
}

/* Admin-curated shared presets load for everyone once cloud is reachable, and
   reload when the signed-in identity changes (so admin controls appear).
   "error" and "recovery" count as identity arrivals too: reconcile() sets the
   session BEFORE it pulls the workspace doc, so a sync engine that lands in a
   terminal error (pull failure, storage-full apply, reload-loop guard) still
   has a live session whose profile read works — waiting for "synced" alone
   left isAdmin/tier stranded at boot values all session while the admin
   desk's own mount-time read succeeded (owner: kit page had no staging bay
   in the very session where /#/admin opened fully). Only "syncing" stays
   excluded as transitional; the key dedupe keeps later push errors from
   re-firing this — same email, no repeat. */
function useCloudPresets() {
  useEffect(() => {
    let lastKey = "__init__";
    return onCloudStatus((s) => {
      const key = s.state === "off" ? "off" : (s.email ?? "signedout");
      if (key !== lastKey && s.state !== "syncing") {
        lastKey = key;
        void useGen.getState().loadCloudPresets();
      }
    });
  }, []);
}

/* Shared kits open straight into the Kit as a read-only viewer — downloads
   stay with the owner (real permissions come later). Two link shapes:
   · v67  #share=<deflate+base64url of the kit state>  (self-contained URL)
   · v76  #p=<share_slug>  (a published cloud project, resolved from Supabase) */
function useSharedKit() {
  useEffect(() => {
    // v76: a published-project link — resolve the slug from the cloud
    const mp = /#p=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    if (mp) {
      (async () => {
        try {
          const doc = await loadPublicProject(mp[1]);
          if (doc) useGen.getState().hydrateShared(doc as Record<string, unknown>);
          else console.warn("shared project not found or cloud not configured");
        } catch (e) {
          console.warn("project link failed", e);
        }
      })();
      return;
    }
    const m = /#share=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    if (!m) return;
    (async () => {
      try {
        const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const json = await new Response(stream).text();
        useGen.getState().hydrateShared(JSON.parse(json));
      } catch (e) {
        console.warn("share link failed", e);
      }
    })();
  }, []);
}

/* Fonts load where the DOCUMENT lives, not where the type controls live.
   The Panel's ensureFont effects only run while the Panel is mounted — but a
   project open lands straight on the Kit page (Panel unmounted), so its fonts
   never got a stylesheet until the user visited the Editor (owner: "loaded up
   Miami Nice on preview and it didn't render the font"). Watch the whole
   document here — master face, list face, state forks, per-piece forks — and
   ensure each one. ensureFont is idempotent, so re-runs are free. */
function useDocumentFonts() {
  const cfg = useGen((s) => s.cfg);
  const kitDesigns = useGen((s) => s.kitDesigns);
  useEffect(() => {
    // custom families must be in the registry before fontByName can resolve them
    (cfg.type.customFonts ?? []).forEach(registerCustomFont);
    const wanted = new Set<string>([cfg.type.font]);
    if (cfg.type.listFont) wanted.add(cfg.type.listFont);
    for (const sd of Object.values(cfg.stateDesigns ?? {})) if (sd?.type?.font) wanted.add(sd.type.font);
    for (const kd of Object.values(kitDesigns)) {
      if (kd?.type?.font) wanted.add(kd.type.font);
      if (kd?.type?.listFont) wanted.add(kd.type.listFont);
      for (const sd of Object.values(kd?.stateDesigns ?? {})) if (sd?.type?.font) wanted.add(sd.type.font);
    }
    wanted.forEach(ensureFont);
  }, [cfg, kitDesigns]);
}

/* Safari runs the app — the rendering is correct since the italic cure —
   but its filter pipeline makes the heavy pages take longer. One polite,
   dismissed-forever nudge toward Chromium, industry-standard for tools
   this graphics-heavy (owner decision: support Safari, recommend Chrome;
   the front door stays universal and never sees this). */
function ChromeNudge() {
  const [show, setShow] = useState(() => {
    try { if (localStorage.getItem("ui-generator-chrome-nudge") === "done") return false; } catch { /* private mode */ }
    const ua = navigator.userAgent;
    return /safari/i.test(ua) && !/chrome|crios|chromium|edg|android/i.test(ua);
  });
  if (!show) return null;
  const dismiss = () => {
    try { localStorage.setItem("ui-generator-chrome-nudge", "done"); } catch { /* private mode */ }
    setShow(false);
  };
  return (
    <div className="chrome-nudge" role="status">
      <span>UI Kit Maker runs smoothest in <b>Chrome</b> or <b>Edge</b> — Safari works, but the heavy pages take a little longer.</span>
      <button onClick={dismiss}>Got it</button>
    </div>
  );
}

/* SAFE MODE reads the stored workspace without loading it — so it can hand
   support a one-click diagnostics summary even when a normal boot freezes
   before DevTools can open (field: "I don't know how to hit F12"). Key
   sizes, kit vitals and board shapes only — never full stored values. */
function safeDiagnostics(): string {
  const lines: string[] = [`UI Kit Maker diagnostics · ${new Date().toISOString().slice(0, 16)}`];
  try {
    const keys: [string, number][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("ui-generator")) keys.push([k, Math.round((localStorage.getItem(k) ?? "").length / 1024)]);
    }
    keys.sort((a, b) => b[1] - a[1]);
    lines.push("keys: " + keys.map(([k, s]) => `${k.replace("ui-generator-", "")}=${s}KB`).join(" · "));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = JSON.parse(localStorage.getItem("ui-generator-v10") ?? "null") as any;
    if (cfg) {
      lines.push(`cfg: preset=${cfg.presetId} font=${cfg.type?.font} shape=${cfg.shape} extrusion=${cfg.candy?.extrusion?.depth} glowD/H=${cfg.states?.default?.glow}/${cfg.states?.hover?.glow} customFonts=[${(cfg.type?.customFonts ?? []).join(",")}]`);
      const eff = cfg.effects && typeof cfg.effects === "object" ? Object.keys(cfg.effects).length : 0;
      const patName = (p: unknown): string => (p && typeof p === "object"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? String((p as any).kind ?? (p as any).id ?? (p as any).name ?? "custom") : String(p ?? "-"));
      lines.push(`cfg2: effects=${eff} wall=${patName(cfg.candy?.wall?.pattern ?? cfg.candy?.wallPattern)} face=${patName(cfg.candy?.pattern)} states=${Object.keys(cfg.states ?? {}).join("/")}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shapes = JSON.parse(localStorage.getItem("ui-generator-kitshapes") ?? "{}") as any;
    const shapeSet = [...new Set([cfg?.shape, ...Object.values(shapes ?? {})])].filter(Boolean);
    lines.push("shapes: " + (shapeSet.join(", ") || "-"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bd = JSON.parse(localStorage.getItem("ui-generator-board") ?? "null") as any;
    if (bd?.boards) lines.push("boards: " + bd.boards.map((b: { name?: string; items?: unknown[]; bgAssetId?: string; bgImage?: string }) =>
      `${b.name ?? "?"}[${(b.items ?? []).length} items, bg:${b.bgAssetId ? "vault" : b.bgImage ? (b.bgImage.startsWith("data:") ? "DATA-URL" : b.bgImage.slice(0, 24)) : "none"}]`).join(" · "));
    lines.push("ua: " + navigator.userAgent);
  } catch (e) { lines.push("collect error: " + String(e).slice(0, 100)); }
  /* flight recorder rings: what each recent session was doing when its
     beat stopped. A ring whose last entry isn't "pagehide" ended
     un-cleanly — its tail is the freeze's last known act. */
  try {
    for (const { slot, ring } of readFlightRings()) {
      const age = Math.round((Date.now() - ring.beat) / 1000);
      // pagehide can be trailed by its own vis-hidden entry — a clean
      // navigation, not a wedge; look at the last two
      const cleanExit = ring.entries.slice(-2).some((e) => e.includes("pagehide"));
      lines.push(`— flight ring ${slot}: build ${ring.build}, beat ${age}s ago, ${cleanExit ? "clean exit" : "NO clean exit"}`);
      lines.push(ring.entries.slice(-40).join(" | "));
    }
  } catch (e) { lines.push("flight rings unreadable: " + String(e).slice(0, 80)); }
  return lines.join("\n");
}

/* The freeze follows the owner's evolving document — replicas built from a
   stale copy keep coming back clean. SAFE MODE can hand over the real
   thing: every ui-generator key, serialized to a downloadable file (board
   pixels live in the vault, not these keys, so the file stays small). */
function downloadWorkspaceFile() {
  const doc: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("ui-generator")) doc[k] = localStorage.getItem(k) ?? "";
    }
  } catch { /* storage unavailable */ }
  const blob = new Blob([JSON.stringify(doc)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `uikitmaker-workspace-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function SafeBootBanner() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="safeboot-badge" role="status">
      SAFE MODE — factory defaults, nothing saves. Your real workspace is untouched; remove <b>?safe</b> from the URL to return to it.
      <button onClick={() => { void navigator.clipboard.writeText(safeDiagnostics()).then(() => setCopied(true)); }}>
        {copied ? "Copied — paste it in chat" : "Copy diagnostics"}
      </button>
      <button onClick={downloadWorkspaceFile} title="Save your full workspace as a file — for support only, nothing leaves this machine until you send it">
        Download workspace file
      </button>
    </div>
  );
}

/* When something inside a handler throws, React can leave the UI looking fine
   while every click silently dies — the "app craps out" report. Surface it. */
function useCrashBanner() {
  const [crash, setCrash] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (e: ErrorEvent) => setCrash(e.message || "Unknown error");
    const onRej = (e: PromiseRejectionEvent) => setCrash(String(e.reason).slice(0, 200));
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return crash;
}

export function App() {
  const { panelW, setPanelW, undo, redo, theme, phase, canvasMode } = useGen();
  useSharedKit();
  useBoardBgBoot();
  useCloudPresets();
  useDocumentFonts();
  useEffect(() => { startTutor(); }, []);
  const dragFrom = useRef<{ x: number; w: number } | null>(null);
  // The Kit is a reading surface — the inspector column steps aside entirely
  // and the guideline sheet becomes the hero. The rail still navigates.
  // Play mode steps it aside too: playing is for feeling the component, not
  // reading sliders (owner: "when you hit the play button it should
  // automatically turn off the inspector") — the Design pencil brings it back.
  const slim = phase !== "master" || canvasMode === "play";

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // Cmd/Ctrl+Z undo, Shift for redo. Text fields keep their native undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement;
      if (t instanceof HTMLTextAreaElement) return;
      if (t instanceof HTMLInputElement && (t.type === "text" || t.type === "number" || t.type === "search")) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const onHandleDown = (e: React.PointerEvent) => {
    dragFrom.current = { x: e.clientX, w: panelW };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragFrom.current) return;
    setPanelW(dragFrom.current.w + (e.clientX - dragFrom.current.x));
  };
  const onHandleUp = () => { dragFrom.current = null; };

  const crash = useCrashBanner();
  return (
    <div className="app">
      {crash && (
        <div className="crashbar" role="alert">
          Something glitched under the hood — your work is saved. <button onClick={() => window.location.reload()}>Reload</button>
          <span className="crashdetail">{crash}</span>
        </div>
      )}
      <TopBar />
      <LootModal />
      <GateModal />
      <NewKitSheet />
      <LookSwitch />
      <TutorTip />
      <ChromeNudge />
      {SAFE_BOOT && <SafeBootBanner />}
      <div className="body" style={{ gridTemplateColumns: slim ? "84px 1fr" : `84px ${panelW}px 6px 1fr` }}>
        <Rail />
        {!slim && <Panel />}
        {!slim && (
          <div className="panel-resize" role="separator" aria-orientation="vertical" aria-label="Resize panel"
            onPointerDown={onHandleDown} onPointerMove={onHandleMove}
            onPointerUp={onHandleUp} onPointerCancel={onHandleUp} />
        )}
        <CanvasView />
      </div>
    </div>
  );
}
