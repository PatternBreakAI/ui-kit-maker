import { useEffect, useRef, useState } from "react";
import {
  Copy, ExternalLink, Eye, EyeOff, FilePlus2, FileUp, FolderOpen, House, Loader2, Pencil, Trash2, Wand2, XCircle,
} from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { t } from "@/shell/i18n";
import { usePageScroll } from "@/shell/usePageScroll";
import { openAuth } from "@/shell/authOverlay";
import { useCloudStatus } from "@/shell/useCloudStatus";
import {
  cloudConfig, listProjects, loadProjectDoc, saveProject, updateProjectDoc, renameProject,
  deleteProject, uniqueName, publicProjectUrl, type CloudProject,
} from "@/generator/cloud";
import { useGen } from "@/generator/store";
import { importSettingsFile } from "@/generator/settingsImport";
import { NewKitSheet, startNewKit } from "./NewKitSheet";
import { CardArt } from "./CommunityPage";
import { PromoShelf } from "./PromoShelf";
import logoUrl from "../../pb-logo.png";

/* #/projects — THE HOME (owner mandate, 2026-08-16: "break out of this
   pop-up world for file management and go with something like the adobe
   home screen where you can see your files as thumbnails"). A registered
   user's file room: every saved kit as a live engine render, newest
   first, the OPEN file wearing a ring; open / rename / duplicate /
   delete / close per card. Guests get a clean sign-in invitation — the
   home manages saved work, and guests can't save.

   The design plan is docs/projects-home-plan.md; this is slices H1+H2
   with the owner's amendments (Spotlight moves here, import lands here,
   the kit page stays pure). */

/** same words as the TopBar chip used — one vocabulary for file time */
const agoWord = (ts: number) => {
  const s = (Date.now() - ts) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `on ${new Date(ts).toLocaleDateString()}`;
};

export function ProjectsHome() {
  usePageScroll();
  const live = !!cloudConfig();
  const cloud = useCloudStatus();
  /* "error" still counts as signed in — RLS reads keep working while the
     workspace sync is paused (the ProjectsPanel precedent) */
  const signedIn = cloud.state === "synced" || cloud.state === "syncing" || cloud.state === "error";

  const openProjectId = useGen((s) => s.openProjectId);
  const projectDirty = useGen((s) => s.projectDirty);

  const [items, setItems] = useState<CloudProject[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  /* the close-settle sheet: non-null while "Update before closing?" waits */
  const [closing, setClosing] = useState<CloudProject | null>(null);
  const [settleBusy, setSettleBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const { projects, error } = await listProjects();
    setItems(projects);
    if (error) setNote(error);
  };

  useEffect(() => {
    if (!live || !signedIn) return;
    void refresh();
    /* resolve tier/admin (drives duplicate visibility rules) + promos —
       the home lives outside the editor, so nothing else loads them */
    if (useGen.getState().tier === "guest") void useGen.getState().loadCloudPresets();
    else void useGen.getState().refreshPromos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, signedIn]);

  /* ── the verbs ─────────────────────────────────────────────────── */

  const doOpen = async (p: CloudProject) => {
    /* replacing unsaved work needs a yes — in file words */
    const st = useGen.getState();
    if (st.projectDirty && !window.confirm(
      st.openProjectId
        ? `Open “${p.name}”? “${st.kitName ?? "your open file"}” has unsaved changes — they stay behind unless you Update it first.`
        : `Open “${p.name}”? The unsaved draft on your desk will be replaced.`,
    )) return;
    setBusyId(p.id); setNote(null);
    const { doc, error } = await loadProjectDoc(p.id);
    setBusyId(null);
    if (error || !doc) { setNote(error ?? "Couldn't load that kit."); return; }
    useGen.getState().loadKitPayload(doc as Record<string, unknown>, {
      viewer: false, projectId: p.id, savedAt: Date.parse(p.updated_at) || Date.now(),
    });
    useGen.getState().flashFile(`You're now working in “${p.name}”.`);
    navigate("#/app");
  };

  const commitRename = async (p: CloudProject) => {
    const desired = renameVal.trim();
    setRenaming(null);
    if (!desired || desired === p.name) return;
    /* renames obey the save rule's duplicate suffix — minus this row
       itself, so fixing capitalization never trips it (#259) */
    const name = uniqueName(desired, (items ?? []).filter((x) => x.id !== p.id).map((x) => x.name));
    setBusyId(p.id); setNote(null);
    const error = await renameProject(p.id, name);
    setBusyId(null);
    if (error) { setNote(error); return; }
    if (name !== desired) setNote(`Renamed to “${name}” — “${desired}” already exists.`);
    /* renaming the OPEN file: the chip's identity follows, without
       claiming unsaved changes — only the row's name moved, not the doc */
    if (useGen.getState().openProjectId === p.id) {
      useGen.getState().setKitName(name);
      useGen.getState().setOpenProject(p.id);
    }
    await refresh();
  };

  const doDuplicate = async (p: CloudProject) => {
    setBusyId(p.id); setNote(null);
    const { doc, error } = await loadProjectDoc(p.id);
    if (error || !doc) { setBusyId(null); setNote(error ?? "Couldn't read that kit."); return; }
    let st = useGen.getState();
    if (st.tier === "guest") { await st.loadCloudPresets(); st = useGen.getState(); }
    /* visibility follows the consent rule for the tier: free & student
       duplicates are public like their saves; Pro duplicates start
       private. Same line the save popover draws. */
    const canPrivate = st.tier === "pro" || st.isAdmin;
    const name = uniqueName(p.name, (items ?? []).map((x) => x.name));
    /* the copy's doc says the copy's name (a rename-shaped divergence
       otherwise), and a PUBLIC copy never carries boards — a public doc
       is fetchable by anyone, and uploaded backdrops must not ship there */
    const copy: Record<string, unknown> = { ...(doc as Record<string, unknown>), kitName: name };
    if (!canPrivate) delete copy.boards;
    const { error: saveErr } = await saveProject(name, copy, !canPrivate);
    setBusyId(null);
    if (saveErr) { setNote(saveErr); return; }
    /* the duplicate does NOT open itself — you stay in your file */
    const cur = useGen.getState();
    setNote(cur.openProjectId && cur.kitName
      ? `Duplicated as “${name}” — you're still in “${cur.kitName}”.`
      : `Duplicated as “${name}”.`);
    await refresh();
  };

  const doDelete = async (p: CloudProject) => {
    const isOpen = useGen.getState().openProjectId === p.id;
    if (!window.confirm(isOpen
      ? `Delete “${p.name}”? It's the file on your desk — the desk resets to a fresh draft, and there is no undo.`
      : `Delete “${p.name}”? This removes it from your account${p.is_public ? " and the community" : ""} — there is no undo.`,
    )) return;
    setBusyId(p.id); setNote(null);
    const err = await deleteProject(p.id);
    setBusyId(null);
    if (err) { setNote(err); return; }
    if (isOpen) {
      /* deleting the open file settles like Close: the desk clears */
      useGen.getState().closeDesk();
      setNote(`“${p.name}” deleted — your desk is a fresh draft.`);
    }
    await refresh();
  };

  /* ── Import kit — the OS picker into the ONE settings-import door
        (the same path the Export menu's import uses), then the editor
        as an unsaved draft with the file-switch flash ─────────────── */

  const doImport = async (f: File) => {
    setNote(null);
    const st = useGen.getState();
    if (st.projectDirty && !window.confirm(
      st.openProjectId
        ? `Import “${f.name}”? “${st.kitName ?? "your open file"}” has unsaved changes — they stay behind unless you Update it first.`
        : `Import “${f.name}”? The unsaved draft on your desk will be replaced.`,
    )) return;
    const ok = await importSettingsFile(f);
    if (!ok) { setNote(`“${f.name}” doesn't look like a kit settings file — nothing was imported.`); return; }
    const name = useGen.getState().kitName ?? f.name.replace(/\.json$/i, "");
    useGen.getState().flashFile(`Imported “${name}” — it's on your desk as an unsaved draft. Save kit files it.`);
    navigate("#/app");
  };

  /* ── Close — the verb (plan decision 3) ────────────────────────── */

  const startClose = (p: CloudProject) => {
    const st = useGen.getState();
    if (st.openProjectId === p.id && st.projectDirty) { setClosing(p); return; }
    st.closeDesk();
    setNote(`“${p.name}” closed — your desk is clean.`);
  };

  const settle = async (mode: "update" | "savenew" | "discard") => {
    const p = closing;
    if (!p) return;
    setSettleBusy(true); setNote(null);
    const st = useGen.getState();
    if (mode === "update") {
      /* same privacy line as every save: public docs never carry boards */
      const err = await updateProjectDoc(p.id, p.is_public ? st.kitPayload() : await st.kitPayloadWithBoards());
      if (err) { setSettleBusy(false); setNote(err); return; }
      setNote(`“${p.name}” updated and closed — your desk is clean.`);
    } else if (mode === "savenew") {
      const name = uniqueName(st.kitName ?? p.name, (items ?? []).map((x) => x.name));
      const canPrivate = st.tier === "pro" || st.isAdmin;
      let shareDef = false;
      try { shareDef = localStorage.getItem("ui-generator-sharedefault") === "1"; } catch { /* private mode */ }
      const pub = !canPrivate || shareDef;
      const { error } = await saveProject(name, pub ? st.kitPayload() : await st.kitPayloadWithBoards(), pub);
      if (error) { setSettleBusy(false); setNote(error); return; }
      setNote(`Saved as “${name}” and closed “${p.name}” — your desk is clean.`);
    } else {
      setNote(`“${p.name}” closed — the saved version stays as it was.`);
    }
    useGen.getState().closeDesk();
    setSettleBusy(false); setClosing(null);
    await refresh();
  };

  /* ── the page ──────────────────────────────────────────────────── */

  const rows = (items ?? []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="cg-nav">
          <button className="cg-navbtn cg-navbtn--go" onClick={() => navigate("#/app")}>{t("openGenerator")}</button>
          <button className="cg-navbtn" onClick={() => navigate("#/studio")}>{t("yourStudio")}</button>
          <button className="cg-navbtn" onClick={() => navigate("#/community")}>{t("cgTitle")}</button>
          <span className="fd-pricing__mark"><img className="fd-pricing__logo" src={logoUrl} alt="" />PatternBreak</span>
        </span>
      </header>

      <main className="cg">
        {!live ? (
          <section className="fd-studentcard"><p>The projects home needs the cloud, which isn't configured on this deployment.</p></section>
        ) : !signedIn ? (
          /* ── guests: a clean, centered invitation — no grid, no promo.
                The home manages SAVED work; unregistered users can't save. ── */
          <section className="ph-invite">
            <span className="ph-invite__mark" aria-hidden="true"><House size={26} strokeWidth={1.8} /></span>
            <h1>Sign in to save and manage projects</h1>
            <p>Sign in and every project you save shows up here as a thumbnail — ready to open, organize and come back to any time.</p>
            <button className="fd-pricing__cta" onClick={() => openAuth("signin")}>Sign in</button>
            <p className="fd-rfine">Signing in is free — your work syncs to your account.</p>
            {/* guests get the boundary too — their sheet says the discard
                plainly, since nothing can be saved without an account */}
            <button className="fd-linkbtn" onClick={startNewKit}>Or start a fresh kit from zero →</button>
          </section>
        ) : (
          <>
            <span className="fd-kicker">UI Kit Maker</span>
            <h1>Your projects</h1>
            <p className="fd-pricing__sub">Organize your projects here — open, rename, duplicate or delete them, and import a kit from your computer. The card marked OPEN is the file you're working in.</p>

            {/* ── Spotlight — the promo rail lives HERE now (owner: "this
                 is where the promo stuff belongs, not on the kit page") ── */}
            <PromoShelf home />

            <div className="cg-secline">
              Your projects
              <span className="ph-tools">
                <input className="ph-search" type="search" placeholder="Search by name…" aria-label="Search projects by name"
                  value={q} onChange={(e) => setQ(e.target.value)} />
                {/* the OS file picker into the existing settings-import
                    path — a .json from Export settings round-trips here */}
                <button className="fd-pricing__cta ph-import" onClick={() => importRef.current?.click()}
                  title="Open a kit settings .json from your computer — it lands on your desk as an unsaved draft">
                  <FileUp size={15} strokeWidth={2} /> Import kit
                </button>
                <input ref={importRef} type="file" accept="application/json,.json" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ""; }} />
              </span>
            </div>

            {note && <p className="fd-rfine ph-note" role="status">{note}</p>}

            {items === null ? (
              <section className="fd-studentcard"><p><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Loading your kits…</p></section>
            ) : items.length === 0 ? (
              <section className="fd-studentcard">
                <p>No saved kits yet. Build something in the editor, then save it as a project — it lands here.</p>
                <p>
                  <button className="fd-pricing__cta" onClick={() => navigate("#/app")}><Wand2 size={15} strokeWidth={2} /> {t("openGenerator")}</button>{" "}
                  <button className="cg-open" onClick={startNewKit}><FilePlus2 size={15} strokeWidth={2} /> New kit — start from zero</button>
                </p>
              </section>
            ) : rows.length === 0 ? (
              <section className="fd-studentcard"><p>Nothing named “{q}”.</p></section>
            ) : (
              <div className="cg-grid">
                {/* New kit — a first-class door beside the files themselves
                    (owner: the old/new boundary must be one obvious click).
                    Unsaved work gets the settle sheet before anything moves. */}
                <button type="button" className="ph-newcard" onClick={startNewKit}
                  title="Start a new kit from zero — your current kit is offered a save first">
                  <span className="ph-newcard__art" aria-hidden="true"><FilePlus2 size={30} strokeWidth={1.6} /></span>
                  <b>New kit</b>
                  <span className="ph-newcard__sub">A clean desk, from zero</span>
                </button>
                {rows.map((p) => {
                  const isOpen = openProjectId === p.id;
                  return (
                    <article key={p.id} className={`cg-card${isOpen ? " ph-opencard" : ""}`}>
                      {isOpen && <span className="ph-openchip">{projectDirty ? "OPEN · UNSAVED" : "OPEN"}</span>}
                      <CardArt card={p} />
                      <div className="cg-meta">
                        <div className="cg-title">
                          {renaming === p.id ? (
                            <input className="ph-rename" autoFocus value={renameVal} maxLength={120} aria-label="New name"
                              onChange={(e) => setRenameVal(e.target.value)}
                              onBlur={() => void commitRename(p)}
                              onKeyDown={(e) => { if (e.key === "Enter") void commitRename(p); if (e.key === "Escape") setRenaming(null); }} />
                          ) : (
                            <b>{p.name}</b>
                          )}
                          <span className="cg-maker cg-maker--plain">
                            {p.is_public ? <Eye size={11} strokeWidth={2.4} /> : <EyeOff size={11} strokeWidth={2.4} />}{" "}
                            {p.is_public ? t("pubLbl") : t("privLbl")} · updated {agoWord(Date.parse(p.updated_at) || Date.now())}
                          </span>
                        </div>
                        <div className="cg-actions">
                          {isOpen ? (
                            <button className="cg-open" disabled={busyId === p.id} title="Close this file — settles unsaved work, then clears the desk to a fresh draft"
                              onClick={() => startClose(p)}>
                              <XCircle size={13} strokeWidth={2.2} /> Close
                            </button>
                          ) : (
                            <button className="cg-open" disabled={busyId === p.id} onClick={() => void doOpen(p)}>
                              {busyId === p.id ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" /> : <FolderOpen size={13} strokeWidth={2.2} />} {t("openBtn")}
                            </button>
                          )}
                          {p.is_public && p.share_slug && (
                            <a className="cg-open" href={publicProjectUrl(p.share_slug)} title="The public share link">
                              <ExternalLink size={13} strokeWidth={2.2} /> {t("shareLink")}
                            </a>
                          )}
                          <button className="cg-curate" disabled={busyId === p.id} title="Rename"
                            onClick={() => { setRenaming(p.id); setRenameVal(p.name); }}>
                            <Pencil size={13} strokeWidth={2.2} />
                          </button>
                          <button className="cg-curate" disabled={busyId === p.id} title="Duplicate — a copy under the next free name; you stay in your file"
                            onClick={() => void doDuplicate(p)}>
                            <Copy size={13} strokeWidth={2.2} />
                          </button>
                          <button className="cg-curate cg-curate--danger" disabled={busyId === p.id} title={t("deleteBtn")}
                            onClick={() => void doDelete(p)}>
                            <Trash2 size={13} strokeWidth={2.2} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <NewKitSheet />

      {/* ── the close-settle sheet: unsaved work gets its yes, in file
           words (plan decision 3) — one question, three honest doors ── */}
      {closing && (
        <div className="ph-veil" role="dialog" aria-modal="true" aria-label={`Close “${closing.name}”`}>
          <div className="ph-sheet">
            <b>Update “{closing.name}” before closing?</b>
            <p>You have edits that aren't in the saved file yet.</p>
            <div className="ph-sheetrow">
              <button className="fd-pricing__cta" disabled={settleBusy} onClick={() => void settle("update")}>
                {settleBusy ? <Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> : "Update & close"}
              </button>
              <button className="cg-open" disabled={settleBusy} onClick={() => void settle("savenew")}>Save as a new file</button>
              <button className="cg-open" disabled={settleBusy} title="The saved version stays as it was"
                onClick={() => void settle("discard")}>Close without saving</button>
            </div>
            <button className="fd-linkbtn" disabled={settleBusy} onClick={() => setClosing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
