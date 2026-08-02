import { useState, useRef, useEffect } from "react";
import { CheckCircle2, CloudOff, CloudUpload, Download, Image, Copy, RotateCcw, FileDown, FileUp, FileJson, User, Moon, Sun, Gamepad2, Star, ChevronDown, Lock, Save, ShieldCheck, GraduationCap } from "lucide-react";
import { useTutor } from "@/tutor/tutor";
import { useGen, hydrate, getDefault, isTouched } from "@/generator/store";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { openAuth } from "@/shell/authOverlay";
import { navigate } from "@/shell/router";
import { capsOf, canExport, UPGRADE_LINES } from "@/generator/entitlements";
import { renderBevel } from "@/generator/bevel";
import { downloadSvg, downloadPng, downloadHtml, downloadSettings, downloadGameKit, copyText } from "@/generator/exportUtils";
import { guardedExport } from "@/generator/exportGate";
import { t } from "@/shell/i18n";

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
  const { cfg, saveStatus, selectedState, theme, setTheme, replaceConfig, shine, setShine, tier, isAdmin } = useGen();
  const { on: tutorOn, setOn: setTutorOn } = useTutor();
  const tcaps = capsOf(tier);
  /* Per-artifact, not one blanket "vectors yes/no" — student buys the
     learning formats and stops short of the shipping ones, so the game kit
     row locks for them while SVG and HTML stay open. */
  const may = (k: Parameters<typeof canExport>[1]) => canExport(tier, k);
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
  /* Paid formats go through the server gate — the client's caps decide how
     the menu LOOKS, the server decides whether the file is produced. */
  const handlers = {
    onSignIn: () => openAuth("signin"),
    onUpgrade: () => navigate("#/pricing"),
    onMessage: (m: string) => window.alert(m),
  };
  const dlSvg = () => void guardedExport("svg", handlers, () =>
    downloadSvg(svg(), `ui-${cfg.presetId}-${selectedState}.svg`));
  const copyCode = () => void guardedExport("svg", handlers, async () => {
    const ok = await copyText(svg());
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1400); }
  });
  const dlHtml = () => void guardedExport("html", handlers, () =>
    downloadHtml(cfg, `ui-${cfg.presetId}.html`));
  const dlGameKit = () => void guardedExport("gamekit", handlers, (g) =>
    downloadGameKit(cfg, g.licence));

  const importSettings = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !parsed.presetId || !parsed.candy) return;
        // full-document files carry the workspace (piece forks, shapes,
        // icon swaps, nudges) — route those through the same door a project
        // open uses, so migration, healing and persistence all apply
        const ws = parsed.__workspace as Record<string, unknown> | undefined;
        delete parsed.__workspace;
        if (ws && typeof ws === "object") {
          useGen.getState().loadKitPayload({ cfg: hydrate(parsed), ...ws }, { viewer: false, phase: "master" });
        } else {
          replaceConfig(hydrate(parsed));
        }
      } catch { /* not a settings file — ignore */ }
    };
    reader.readAsText(file);
  };

  return (
    <header className="top">
      <button className="brand" onClick={() => navigate("#/")} title={t("backHome")} aria-label={t("backHome")}>
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
            title={t("localNote")}>
            <span className="ok"><CloudOff size={18} strokeWidth={1.9} color="#d97706" /></span>
            {saveStatus === "saved" ? t("savedLocal") : t("saving")}
          </button>
        ) : (
          <div className="saved">
            {cloud.state === "error" ? (
              <><span className="ok"><CloudOff size={18} strokeWidth={1.9} color="#d97706" /></span>Cloud paused</>
            ) : cloud.state === "synced" || cloud.state === "syncing" ? (
              <><span className="ok"><CloudUpload size={18} strokeWidth={1.9} color={cloud.state === "synced" && saveStatus === "saved" ? "#16a34a" : "#9aa1ac"} /></span>{cloud.state === "synced" && saveStatus === "saved" ? t("saved") : t("syncing")}</>
            ) : (
              <><span className="ok"><CheckCircle2 size={18} strokeWidth={1.9} color={saveStatus === "saved" ? "#16a34a" : "#9aa1ac"} /></span>{saveStatus === "saved" ? t("saved") : t("saving")}</>
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

        {/* one click to the desks for admin accounts — no more typing #/admin
            by hand (owner). Renders on the client flag only; every desk
            re-verifies is_admin server-side. */}
        {isAdmin && (
          <button className="acct" onClick={() => navigate("#/admin")}
            aria-label="Admin desk" title="Admin desk — only admin accounts see this">
            <ShieldCheck size={17} strokeWidth={1.9} />
          </button>
        )}

        {/* The Tutor's cap — contextual tips, ADMIN PREVIEW until the owner
            releases it (standing gate: renders on isAdmin AND the engine
            re-checks isAdmin at fire time, so a merge can't leak it). */}
        {isAdmin && (
          <button className={`acct${tutorOn ? " on" : ""}`} onClick={() => setTutorOn(!tutorOn)}
            aria-label="Tutor tips" title={tutorOn ? "Tutor is watching — contextual tips are live (admin preview)" : "Tutor — turn on contextual tips (admin preview)"}>
            <GraduationCap size={17} strokeWidth={1.9} />
          </button>
        )}

        <button className={`acct${cloud.state === "synced" ? " on" : ""}`} onClick={() => openAuth("signin")}
          aria-label={t("account")} title={cloud.email ? `${t("account")} — ${cloud.email}` : t("account")}>
          <User size={17} strokeWidth={1.9} />
        </button>

        {/* the submit moment, finally visible (owner report, 2026-07-25:
            "can't figure out how to submit") — one button straight into
            My projects, where saving IS submitting: free & student saves
            join the community queue, Pro kits go public via the globe. */}
        <button className="exportbtn savekitbtn" onClick={() => openAuth("projects")}
          title="Save this kit as a project. Free and Student kits join the Community Gallery; Pro kits stay private until you share them.">
          <Save size={15} strokeWidth={1.9} /> {t("saveKit")}
        </button>

        <div ref={menuRef} style={{ position: "relative" }}>
          <button className="exportbtn" onClick={() => setMenuOpen(!menuOpen)} aria-label={t("exportAndSettings")} aria-haspopup="menu" aria-expanded={menuOpen}>
            <Download size={15} strokeWidth={1.9} /> {t("export")} <ChevronDown size={14} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div className="menu-pop">
              {may("svg") ? (
                <button onClick={() => { dlSvg(); setMenuOpen(false); }}>
                  <Download size={15} strokeWidth={1.8} /> {t("exportSvg")}
                </button>
              ) : (
                <button className="lockedmi" title={`Vector exports are a Pro format. ${UPGRADE_LINES[tier]}`} onClick={() => { setMenuOpen(false); gate(); }}>{lockrow(t("exportSvg"))}</button>
              )}
              <button onClick={() => { void downloadPng(svg(), `ui-${cfg.presetId}-${selectedState}@${tcaps.pngScaleMax}x.png`, tcaps.pngScaleMax); setMenuOpen(false); }}>
                <Image size={15} strokeWidth={1.8} /> {t("exportPng")} {tcaps.pngScaleMax}×
              </button>
              {may("html") ? (
                <button onClick={() => { dlHtml(); setMenuOpen(false); }}>
                  <FileDown size={15} strokeWidth={1.8} /> {t("downloadHtml")}
                </button>
              ) : (
                <button className="lockedmi" title={`HTML export is a Pro format. ${UPGRADE_LINES[tier]}`} onClick={() => { setMenuOpen(false); gate(); }}>{lockrow(t("downloadHtml"))}</button>
              )}
              {may("svg") ? (
                <button onClick={() => { copyCode(); setMenuOpen(false); }}>
                  <Copy size={15} strokeWidth={1.8} /> {t("copySvg")}
                </button>
              ) : (
                <button className="lockedmi" title={`SVG code is a Pro format. ${UPGRADE_LINES[tier]}`} onClick={() => { setMenuOpen(false); gate(); }}>{lockrow(t("copySvg"))}</button>
              )}
              {may("gamekit") ? (
                <button onClick={() => { dlGameKit(); setMenuOpen(false); }}>
                  <Gamepad2 size={15} strokeWidth={1.8} /> {t("exportGameKit")}
                </button>
              ) : (
                <button className="lockedmi" title={`The game kit is a Pro format. ${UPGRADE_LINES[tier]}`} onClick={() => { setMenuOpen(false); gate(); }}>{lockrow(t("exportGameKit"))}</button>
              )}
              <button onClick={() => {
                const st = useGen.getState();
                downloadSettings(cfg, {
                  kitName: st.kitName, kitShapes: st.kitShapes, kitDesigns: st.kitDesigns,
                  kitTextFill: st.kitTextFill, kitLabels: st.kitLabels, kitSubs: st.kitSubs,
                  kitIcons: st.kitIcons, kitSlotVals: st.kitSlotVals, kitVals: st.kitVals,
                  kitBar: st.kitBar, kitTextOy: st.kitTextOy, kitTextOx: st.kitTextOx,
                  kitLocks: st.kitLocks, kitSizes: st.kitSizes,
                });
                setMenuOpen(false);
              }}>
                <FileJson size={15} strokeWidth={1.8} /> {t("exportSettings")}
              </button>
              <button onClick={() => { fileRef.current?.click(); }}>
                <FileUp size={15} strokeWidth={1.8} /> {t("importSettings")}
              </button>
              <button onClick={() => {
                // component-only reset: the stage (canvas color, grid, zoom) is
                // the user's workspace and stays put
                const d = getDefault();
                d.canvas = cfg.canvas;
                replaceConfig(d);
                setMenuOpen(false);
              }}>
                <RotateCcw size={15} strokeWidth={1.8} /> {t("resetComponent")}
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
