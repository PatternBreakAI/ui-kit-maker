import { useState, useRef, useEffect } from "react";
import { CheckCircle2, CloudOff, CloudUpload, Download, Image, Copy, RotateCcw, FileDown, FileUp, FileJson, FolderOpen, House, User, Moon, Sun, Gamepad2, Star, ChevronDown, Lock, Save, ShieldCheck, GraduationCap } from "lucide-react";
import { useTutor, TUTOR_SURFACED } from "@/tutor/tutor";
import { useGen, hydrate, getDefault, isTouched, exportableBoards } from "@/generator/store";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { openAuth } from "@/shell/authOverlay";
import { navigate } from "@/shell/router";
import { capsOf, canExport, UPGRADE_LINES } from "@/generator/entitlements";
import { renderBevel } from "@/generator/bevel";
import { downloadSvg, downloadPng, downloadWebKit, downloadSettings, downloadGameKit, copyText, inlineKitFace } from "@/generator/exportUtils";
import { fetchKitFont } from "@/generator/engineExport";
import { fontByName } from "@/generator/model";
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
  const { cfg, saveStatus, selectedState, theme, setTheme, replaceConfig, shine, setShine, tier, isAdmin, kitName, viewer, openProjectId, projectSavedAt, projectDirty, fileFlash } = useGen();
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
  // the web-kit zip renders the whole kit — minutes, not a blink; the
  // menu row stays open and narrates so the wait never reads as a hang
  const [htmlProg, setHtmlProg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  /* ── the current FILE, first-class chrome (owner: "it's not entirely
     clear when you're in a new file… there is a moment of confusion") —
     the open project's name and its save state sit in the bar's center,
     always visible. Click opens My Projects, where the file lives. */
  const [, setFileTick] = useState(0);
  useEffect(() => {
    // "2m ago" needs a heartbeat; only while a clean saved file shows it
    if (!openProjectId || projectDirty) return;
    const id = window.setInterval(() => setFileTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [openProjectId, projectDirty, projectSavedAt]);
  const agoWord = (ts: number) => {
    const s = (Date.now() - ts) / 1000;
    if (s < 45) return "just now";
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `on ${new Date(ts).toLocaleDateString()}`;
  };
  const fileName = kitName?.trim() || "Untitled kit";
  const fileState = viewer ? "shared kit — view only"
    : openProjectId
      ? (projectDirty ? "unsaved changes" : (projectSavedAt ? `saved ${agoWord(projectSavedAt)}` : "saved"))
      : "draft";
  const fileTitle = viewer
    ? "A shared kit, view only — Save kit files your own copy."
    : openProjectId
      ? (projectDirty
        ? `You have edits that aren't in the saved project “${fileName}” yet — open My Projects and Update it, or Save a new file.`
        : `This is your saved project “${fileName}”. Click to open My Projects.`)
      : "The kit on screen isn't saved as a project yet — Save kit files it. Click to open My Projects.";

  const svg = () => renderBevel(cfg, selectedState);
  /* The top-bar singles leave the page: the PNG rasterizes inside a sealed
     <img> document and the SVG opens in other tools — neither can see the
     page's loaded fonts, so the label falls back to a system face unless
     the kit's face rides inside the file. Google woff2 first (small,
     cached), the engine pipeline's google/fonts TTF as backup; a custom
     file font that matches neither ships as before, best effort. */
  const svgWithFace = async () => {
    const s = svg();
    const fam = cfg.type.font;
    if (!s.includes("<text")) return s;
    // exact-name match only: fontByName's GAME_FONTS[0] fallback would
    // embed the wrong face's bytes under a custom family's name
    const fdef = fontByName(fam);
    let out = await inlineKitFace(s, fam, fdef.name === fam ? fdef.css ?? null : null);
    if (out === s) {
      const kf = await fetchKitFont(fam).catch(() => null);
      if (kf) out = await inlineKitFace(s, fam, null, kf.bytes);
    }
    return out;
  };
  /* Paid formats go through the server gate — the client's caps decide how
     the menu LOOKS, the server decides whether the file is produced. */
  const handlers = {
    onSignIn: () => openAuth("signin"),
    onUpgrade: () => navigate("#/pricing"),
    onMessage: (m: string) => window.alert(m),
  };
  const dlSvg = () => void guardedExport("svg", handlers, async () =>
    downloadSvg(await svgWithFace(), `ui-${cfg.presetId}-${selectedState}.svg`));
  const copyCode = () => void guardedExport("svg", handlers, async () => {
    const ok = await copyText(svg());
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1400); }
  });
  const dlHtml = () => void guardedExport("html", handlers, (g) => {
    const st = useGen.getState();
    return downloadWebKit({
      cfg,
      kitDesigns: st.kitDesigns, kitTextFill: st.kitTextFill, kitShapes: st.kitShapes,
      kitSizes: st.kitSizes, kitLabels: st.kitLabels, kitIcons: st.kitIcons,
      kitVals: st.kitVals, releases: st.componentReleases, kitName: st.kitName,
    }, g.licence, (d, tot, label) => setHtmlProg(d >= tot ? null : `${d + 1}/${tot} · ${label}`))
      .finally(() => setHtmlProg(null));
  });
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
          // boards ride the payload — loadKitPayload runs importBoards
          // itself now; a second call here raced it and double-vaulted
          // every backdrop (review catch)
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

      {/* the HOME — the Adobe-style projects room (owner mandate). Always
          visible; guests land on its sign-in invitation. */}
      <button className="acct homebtn" onClick={() => navigate("#/projects")}
        aria-label="Home — your projects" title="Home — all your projects, as thumbnails">
        <House size={17} strokeWidth={1.9} />
      </button>

      {/* the center names the FILE — quiet, always on; the flash below it
          confirms a file switch in words for a few seconds */}
      <div className="top-spacer" />
      <div className="filewrap">
        <button className="filechip" onClick={() => openAuth("projects")} title={fileTitle}>
          <FolderOpen size={14} strokeWidth={1.9} />
          <span className="filechip-name">{fileName}</span>
          <span className={`filechip-state${!viewer && openProjectId && projectDirty ? " dirty" : ""}`}>· {fileState}</span>
        </button>
        {fileFlash && <div className="fileflash" role="status" aria-live="polite">{fileFlash}</div>}
      </div>
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
            releases it (renders on isAdmin AND the engine re-checks isAdmin
            at fire time). TUTOR_SURFACED additionally holds it off the live
            domain entirely — owner blessed everything EXCEPT this. */}
        {isAdmin && TUTOR_SURFACED && (
          <button className={`acct tutorbtn${tutorOn ? " on" : ""}`} onClick={() => setTutorOn(!tutorOn)}
            aria-pressed={tutorOn}
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
              <button onClick={() => { void (async () => downloadPng(await svgWithFace(), `ui-${cfg.presetId}-${selectedState}@${tcaps.pngScaleMax}x.png`, tcaps.pngScaleMax))(); setMenuOpen(false); }}>
                <Image size={15} strokeWidth={1.8} /> {t("exportPng")} {tcaps.pngScaleMax}×
              </button>
              {may("html") ? (
                <button disabled={htmlProg !== null} onClick={() => { if (!htmlProg) dlHtml(); }}>
                  <FileDown size={15} strokeWidth={1.8} /> {htmlProg ? `Building web kit… ${htmlProg}` : t("downloadHtml")}
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
              {/* the Unity download LIVES on the Kit page (it needs the whole
                  kit, progress UI and the licence flow) — but people look for
                  it HERE first (dev field report: "I expected the Unity Export
                  in the Export menu"), so this row walks them there */}
              <button onClick={() => { useGen.getState().setPhase("kit"); setMenuOpen(false); }}
                title="Opens your kit page — the Unity ZIP is the big export button there.">
                <Gamepad2 size={15} strokeWidth={1.8} /> Unity kit — on the Kit page
              </button>
              <button onClick={() => {
                void (async () => {
                  const st = useGen.getState();
                  downloadSettings(cfg, {
                    // the clone REGISTRY rides with its entries — the maps
                    // below already carry clone-keyed rows, and without the
                    // registry an import would strand them id-less
                    kitName: st.kitName, kitClones: st.kitClones, kitShapes: st.kitShapes, kitDesigns: st.kitDesigns,
                    kitTextFill: st.kitTextFill, kitLabels: st.kitLabels, kitSubs: st.kitSubs,
                    kitIcons: st.kitIcons, kitSlotVals: st.kitSlotVals, kitVals: st.kitVals,
                    kitBar: st.kitBar, kitTextOy: st.kitTextOy, kitTextOx: st.kitTextOx,
                    kitLocks: st.kitLocks, kitSizes: st.kitSizes,
                    // the boards ride too (owner): vaulted backdrops embed as
                    // data URLs so the file works on any machine
                    boards: await exportableBoards(st.boards),
                  });
                })();
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
