import { useState, useRef, useEffect } from "react";
import { CheckCircle2, CloudOff, CloudUpload, Download, Image, Copy, RotateCcw, FileDown, FileUp, FileJson, User, Moon, Sun, Gamepad2, Star, ChevronDown, Lock } from "lucide-react";
import { useGen, hydrate, getDefault, isTouched } from "@/generator/store";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { openAuth } from "@/shell/authOverlay";
import { navigate } from "@/shell/router";
import { capsOf, UPGRADE_LINES } from "@/generator/entitlements";
import { renderBevel } from "@/generator/bevel";
import { downloadSvg, downloadPng, downloadHtml, downloadSettings, downloadGameKit, copyText } from "@/generator/exportUtils";

// The actual PatternBreak logo file, bundled from the repo's top-level
// pb-logo.png — never redrawn or interpreted.
import logoUrl from "../../pb-logo.png";

function Logo() {
  return <img className="logo" src={logoUrl} alt="PatternBreak" />;
}

/* A quiet toolbar: brand at the left (now the way back to the front door),
   an empty center (help lives in tooltips), and one tight cluster of global
   actions on the right — save-status, shine, theme, account, and Export.
   The account button opens the shell's AuthOverlay; the old inline
   AccountMenu popover is retired. */
export function TopBar() {
  const { cfg, saveStatus, selectedState, theme, setTheme, replaceConfig, shine, setShine, tier } = useGen();
  const tcaps = capsOf(tier);
  const gate = () => { if (tier === "guest") openAuth("signin"); else navigate("#/pricing"); };
  const lockrow = (label: string) => (<><Lock size={13} strokeWidth={2.2} /> {label} <i className="protag">PRO</i></>);
  const cloud = useCloudStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const svg = () => renderBevel(cfg, selectedState);
  const copyCode = () => {
    void copyText(svg()).then((ok) => {
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1400); }
    });
  };
  const dlHtml = () => downloadHtml(cfg, `ui-${cfg.presetId}.html`);

  const importSettings = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !parsed.presetId || !parsed.candy) return;
        replaceConfig(hydrate(parsed));
      } catch { /* not a settings file — ignore */ }
    };
    reader.readAsText(file);
  };

  return (
    <header className="top">
      <button className="brand" onClick={() => navigate("#/")} title="Back to home" aria-label="Back to home">
        <Logo />
        <span className="name">UI Kit Maker</span>
      </button>

      {/* empty center — help now lives in tooltips, not a narrator bar */}
      <div className="top-spacer" />

      <div className="topcluster">
        {cloud.state === "signedout" && isTouched() ? (
          /* honest chip: anonymous work is browser-only — one tap to make it
             an account. Quiet wording, not an alarm; the tooltip explains. */
          <button className="saved savedbtn" onClick={() => openAuth("signin")}
            title="Your work is saved only in this browser — clearing browser data would erase it. Sign in (free) and it syncs to your account.">
            <span className="ok"><CloudOff size={18} strokeWidth={1.9} color="#d97706" /></span>
            {saveStatus === "saved" ? "Saved — this browser only" : "Saving…"}
          </button>
        ) : (
          <div className="saved">
            {cloud.state === "error" ? (
              <><span className="ok"><CloudOff size={18} strokeWidth={1.9} color="#d97706" /></span>Cloud paused</>
            ) : cloud.state === "synced" || cloud.state === "syncing" ? (
              <><span className="ok"><CloudUpload size={18} strokeWidth={1.9} color={cloud.state === "synced" && saveStatus === "saved" ? "#16a34a" : "#9aa1ac"} /></span>{cloud.state === "synced" && saveStatus === "saved" ? "Saved" : "Syncing…"}</>
            ) : (
              <><span className="ok"><CheckCircle2 size={18} strokeWidth={1.9} color={saveStatus === "saved" ? "#16a34a" : "#9aa1ac"} /></span>{saveStatus === "saved" ? "Saved" : "Saving…"}</>
            )}
          </div>
        )}

        <button className={`acct${shine ? " on" : ""}`} onClick={() => setShine(!shine)}
          aria-label={shine ? "Turn the shine sweep off" : "Turn the shine sweep on"} aria-pressed={shine}
          title={shine ? "Shine sweep — on" : "Shine sweep — off"} data-shinebtn="1">
          <Star size={17} strokeWidth={1.9} />
        </button>

        <button className="acct" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}>
          {theme === "dark" ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
        </button>

        <button className={`acct${cloud.state === "synced" ? " on" : ""}`} onClick={() => openAuth("signin")}
          aria-label="Account" title={cloud.email ? `Account — ${cloud.email}` : "Account"}>
          <User size={17} strokeWidth={1.9} />
        </button>

        <div ref={menuRef} style={{ position: "relative" }}>
          <button className="exportbtn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Export and settings" aria-haspopup="menu" aria-expanded={menuOpen}>
            <Download size={15} strokeWidth={1.9} /> Export <ChevronDown size={14} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div className="menu-pop">
              {tcaps.vectorExports ? (
                <button onClick={() => { downloadSvg(svg(), `ui-${cfg.presetId}-${selectedState}.svg`); setMenuOpen(false); }}>
                  <Download size={15} strokeWidth={1.8} /> Export SVG
                </button>
              ) : (
                <button className="lockedmi" title={`Vector exports are a Pro format. ${UPGRADE_LINES[tier]}`} onClick={() => { setMenuOpen(false); gate(); }}>{lockrow("Export SVG")}</button>
              )}
              <button onClick={() => { void downloadPng(svg(), `ui-${cfg.presetId}-${selectedState}@${tcaps.pngScaleMax}x.png`, tcaps.pngScaleMax); setMenuOpen(false); }}>
                <Image size={15} strokeWidth={1.8} /> Export PNG {tcaps.pngScaleMax}×
              </button>
              {tcaps.vectorExports ? (
                <button onClick={() => { dlHtml(); setMenuOpen(false); }}>
                  <FileDown size={15} strokeWidth={1.8} /> Download HTML
                </button>
              ) : (
                <button className="lockedmi" title={`HTML export is a Pro format. ${UPGRADE_LINES[tier]}`} onClick={() => { setMenuOpen(false); gate(); }}>{lockrow("Download HTML")}</button>
              )}
              {tcaps.vectorExports ? (
                <button onClick={() => { copyCode(); setMenuOpen(false); }}>
                  <Copy size={15} strokeWidth={1.8} /> Copy SVG code
                </button>
              ) : (
                <button className="lockedmi" title={`SVG code is a Pro format. ${UPGRADE_LINES[tier]}`} onClick={() => { setMenuOpen(false); gate(); }}>{lockrow("Copy SVG code")}</button>
              )}
              {tcaps.vectorExports ? (
                <button onClick={() => { void downloadGameKit(cfg); setMenuOpen(false); }}>
                  <Gamepad2 size={15} strokeWidth={1.8} /> Export game kit
                </button>
              ) : (
                <button className="lockedmi" title={`The game kit is a Pro format. ${UPGRADE_LINES[tier]}`} onClick={() => { setMenuOpen(false); gate(); }}>{lockrow("Export game kit")}</button>
              )}
              <button onClick={() => { downloadSettings(cfg); setMenuOpen(false); }}>
                <FileJson size={15} strokeWidth={1.8} /> Export settings
              </button>
              <button onClick={() => { fileRef.current?.click(); }}>
                <FileUp size={15} strokeWidth={1.8} /> Import settings…
              </button>
              <button onClick={() => {
                // component-only reset: the stage (canvas color, grid, zoom) is
                // the user's workspace and stays put
                const d = getDefault();
                d.canvas = cfg.canvas;
                replaceConfig(d);
                setMenuOpen(false);
              }}>
                <RotateCcw size={15} strokeWidth={1.8} /> Reset component
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importSettings(f); e.target.value = ""; setMenuOpen(false); }} />
        </div>
      </div>
    </header>
  );
}
