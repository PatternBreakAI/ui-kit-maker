import { useEffect, useRef, useState } from "react";
import { TopBar } from "./ui/TopBar";
import { Rail, Panel } from "./ui/Panel";
import { CanvasView } from "./ui/CanvasView";
import { useGen } from "./generator/store";
import { LootModal } from "./ui/LootModal";
import { loadPublicProject, onCloudStatus } from "./generator/cloud";

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
  const { panelW, setPanelW, undo, redo, theme, phase } = useGen();
  useSharedKit();
  useCloudPresets();
  const dragFrom = useRef<{ x: number; w: number } | null>(null);
  // The Kit is a reading surface — the inspector column steps aside entirely
  // and the guideline sheet becomes the hero. The rail still navigates.
  const slim = phase !== "master"; // kit reads, board assembles — both full-width

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
