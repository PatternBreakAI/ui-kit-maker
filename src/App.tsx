import { useEffect, useRef, useState } from "react";
import { TopBar } from "./ui/TopBar";
import { Rail, Panel } from "./ui/Panel";
import { CanvasView } from "./ui/CanvasView";
import { useGen, rehydrateBoardBgs } from "./generator/store";
import { LootModal } from "./ui/LootModal";
import { loadPublicProject, onCloudStatus } from "./generator/cloud";
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
}

/* Admin-curated shared presets load for everyone once cloud is reachable, and
   reload when the signed-in identity changes (so admin controls appear). */
function useCloudPresets() {
  useEffect(() => {
    let lastKey = "__init__";
    return onCloudStatus((s) => {
      const key = s.state === "off" ? "off" : (s.email ?? "signedout");
      if (key !== lastKey && (s.state === "synced" || s.state === "signedout" || s.state === "off")) {
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
      <TutorTip />
      <ChromeNudge />
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
