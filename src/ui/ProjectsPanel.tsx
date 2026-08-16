import { useEffect, useState } from "react";
import {
  ArrowLeft, FolderOpen, Save, Trash2, Pencil, Link2, Check, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { useGen } from "@/generator/store";
import { t } from "@/shell/i18n";
import { useCloudStatus } from "@/shell/useCloudStatus";
import {
  listProjects, saveProject, renameProject, deleteProject, setProjectPublic,
  loadProjectDoc, updateProjectDoc, publicProjectUrl, uniqueName, type CloudProject,
} from "@/generator/cloud";

/* v76 · My Projects — the projects table goes live. A named library of kit
   snapshots (the same portable payload a share link carries): save the kit
   on screen, open any project back into the editor, and opt-in publish one
   behind a short #p=<slug> link. Private by default; RLS enforces it. */
export function ProjectsPanel({ onBack, onClose, confirmReplace = true, onOpened }: {
  onBack: () => void;
  onClose: () => void;
  /** Ask before replacing the kit on screen. The account/landing surfaces
      pass false — there's no in-progress kit there to lose. */
  confirmReplace?: boolean;
  /** Called after a project is opened into the editor store (the landing and
      account page navigate to #/app here). */
  onOpened?: () => void;
}) {
  const [items, setItems] = useState<CloudProject[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const kitName = useGen((s) => s.kitName);
  const tier = useGen((s) => s.tier);
  const isAdmin = useGen((s) => s.isAdmin);
  const canPrivate = tier === "pro" || isAdmin;

  /* The tier used to resolve only when the EDITOR mounted, so this panel —
     reachable from the account page and the overlay without ever opening
     the editor — could read a Pro user as "guest": wrong consent message,
     and a save that would have gone PUBLIC under the free rule (owner
     report, 2026-07-25). The panel now resolves the tier itself, and the
     consent line waits until the answer is real. */
  const cloud = useCloudStatus();
  const signedIn = cloud.state === "synced" || cloud.state === "syncing" || cloud.state === "error";
  const tierKnown = !signedIn || tier !== "guest";
  useEffect(() => {
    if (signedIn && useGen.getState().tier === "guest") void useGen.getState().loadCloudPresets();
  }, [signedIn]);

  /* Pro-only global default (owner call, 2026-07-25): share new kits by
     default instead of flipping each eye by hand. Lives in the synced
     ui-generator-* keyspace, so the choice follows the account. Free and
     student saves are public regardless — this switch never renders for
     them. */
  const [shareDef, setShareDef] = useState<boolean>(() => {
    try { return localStorage.getItem("ui-generator-sharedefault") === "1"; } catch { return false; }
  });
  const flipShareDef = (v: boolean) => {
    setShareDef(v);
    try { localStorage.setItem("ui-generator-sharedefault", v ? "1" : "0"); } catch { /* private mode */ }
  };

  const refresh = async () => {
    const { projects, error } = await listProjects();
    setItems(projects);
    if (error) setNote(error);
  };
  useEffect(() => { void refresh(); }, []);

  const copyLink = async (slug: string, id: string) => {
    const url = publicProjectUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch { window.prompt("Public link to this kit:", url); }
  };

  const doSave = async () => {
    setBusy(true); setNote(null);
    const desired = newName.trim() || kitName || "Untitled kit";
    /* Save always mints a NEW file — a second save under a taken name
       auto-suffixes to the lowest free number ("Hot Rod" → "Hot Rod 2")
       so two same-day saves stay tellable apart (owner mandate,
       2026-08-16). Case-insensitive; the note below says it happened.
       Overwriting an existing project is the row's Update button, which
       never touches names. */
    const name = uniqueName(desired, (items ?? []).map((p) => p.name));
    // the kit takes the project's name, so the kit-page title reflects the
    // project you just saved (and the saved snapshot carries it)
    useGen.getState().setKitName(name);
    let st = useGen.getState();
    /* never decide visibility on an unresolved tier — a quick Save could
       otherwise publish a Pro kit under the free rule */
    if (signedIn && st.tier === "guest") { await st.loadCloudPresets(); st = useGen.getState(); }
    /* the consent moment's other half: free & student kits save PUBLIC
       (the community launch); Pro and admin default private and keep
       their toggle. RLS enforces the same line server-side. */
    const canPrivate = st.tier === "pro" || st.isAdmin;
    /* boards (and their embedded backdrop images) ride PRIVATE saves only —
       a public doc is fetchable by anyone and feeds the gallery, and a
       user's uploaded photos must never ship there (review catch) */
    const pub = !canPrivate || shareDef;
    const { project, error } = await saveProject(name, pub ? st.kitPayload() : await st.kitPayloadWithBoards(), pub);
    setBusy(false);
    if (error || !project) { setNote(error ?? "Couldn't save."); return; }
    setNewName("");
    /* say what happened, especially the rename — a silent suffix would
       trade one confusion for another */
    setNote(name === desired ? `Saved as “${name}”.` : `Saved as “${name}” — “${desired}” already exists.`);
    await refresh();
  };

  const doOpen = async (p: CloudProject) => {
    if (confirmReplace && !window.confirm(`Open “${p.name}”? It replaces the kit on screen AND the boards — save the current work as a project first if you want to keep either.`)) return;
    setBusy(true); setNote(null);
    const { doc, error } = await loadProjectDoc(p.id);
    setBusy(false);
    if (error || !doc) { setNote(error ?? "Couldn't load that project."); return; }
    useGen.getState().loadKitPayload(doc as Record<string, unknown>, { viewer: false, projectId: p.id });
    onClose();
    onOpened?.();
  };

  const doUpdate = async (p: CloudProject) => {
    if (!window.confirm(`Overwrite “${p.name}” with the kit currently on screen?`)) return;
    setBusy(true); setNote(null);
    // same privacy line as saving: a public project's doc never carries boards
    const error = await updateProjectDoc(p.id, p.is_public ? useGen.getState().kitPayload() : await useGen.getState().kitPayloadWithBoards());
    setBusy(false);
    if (error) { setNote(error); return; }
    setNote(`“${p.name}” updated.`);
    await refresh();
  };

  const commitRename = async (p: CloudProject) => {
    const desired = renameVal.trim();
    setRenaming(null);
    if (!desired || desired === p.name) return;
    /* renames obey the same duplicate rule as saves — minus this row
       itself, so fixing capitalization never trips the suffix */
    const name = uniqueName(desired, items?.filter((x) => x.id !== p.id).map((x) => x.name) ?? []);
    setBusy(true);
    const error = await renameProject(p.id, name);
    setBusy(false);
    if (error) { setNote(error); return; }
    if (name !== desired) setNote(`Renamed to “${name}” — “${desired}” already exists.`);
    await refresh();
  };

  const doDelete = async (p: CloudProject) => {
    if (!window.confirm(`Delete “${p.name}”? This can't be undone.`)) return;
    setBusy(true); setNote(null);
    const error = await deleteProject(p.id);
    setBusy(false);
    if (error) { setNote(error); return; }
    await refresh();
  };

  const togglePublic = async (p: CloudProject) => {
    /* free & student going PRIVATE is the Pro doorway, said honestly —
       not an RLS error. Publishing (the other direction) is open to all. */
    const st = useGen.getState();
    if (p.is_public && !(st.tier === "pro" || st.isAdmin)) {
      setNote("Private kits come with Pro — free and student kits are part of the community.");
      return;
    }
    setBusy(true); setNote(null);
    const { share_slug, error } = await setProjectPublic(p.id, !p.is_public);
    setBusy(false);
    if (error) { setNote(error); return; }
    await refresh();
    if (!p.is_public && share_slug) void copyLink(share_slug, p.id); // just published → link on clipboard
  };

  return (
    <div className="menu-pop acct-pop proj-pop">
      <div className="proj-head">
        <button className="proj-back" onClick={onBack}><ArrowLeft size={15} strokeWidth={1.8} /></button>
        <b>{t("myProjects")}</b>
      </div>

      <div className="proj-save">
        <input className="acct-in proj-save-in" type="text" placeholder={kitName ? `Save as “${kitName}”…` : t("nameThisKit")}
          value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) void doSave(); }} />
        <button className="proj-save-btn" disabled={busy} onClick={() => void doSave()}>
          <Save size={15} strokeWidth={1.8} /> {t("saveBtn")}
        </button>
      </div>
      {!tierKnown ? null : !canPrivate ? (
        /* THE CONSENT MOMENT — said where the decision happens, not in
           fine print: free & student kits are community kits. The same
           sentence is the product's cleanest Pro doorway. */
        <div className="proj-consent">
          {t("consentFree")} <button className="fd-linkbtn" onClick={() => { window.location.hash = "#/pricing"; }}>{t("consentUpgrade")}</button> {t("consentPrivate")}
        </div>
      ) : (
        /* the Pro mirror of the consent line — their kits save PRIVATE
           unless the global default below says otherwise. Owner report
           2026-07-25: a Pro user couldn't find how to enter the community
           at all. */
        <div className="proj-consent">
          {t("consentProA")} <b>{shareDef ? t("consentProPublic") : t("consentProPrivate")}</b>. {t("consentProB")}
          <label className="check proj-sharedef">
            <input type="checkbox" checked={shareDef} onChange={(e) => flipShareDef(e.target.checked)} />
            {t("shareDefault")}
          </label>
        </div>
      )}
      {note && <div className="menu-note acct-note">{note}</div>}

      <div className="proj-list">
        {items === null && <div className="menu-note acct-note">Loading…</div>}
        {items !== null && items.length === 0 && (
          <div className="menu-note acct-note">{t("noProjects")}</div>
        )}
        {items?.map((p) => (
          <div className="proj-row" key={p.id}>
            {renaming === p.id ? (
              <input className="acct-in proj-rename" autoFocus value={renameVal} maxLength={120}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => void commitRename(p)}
                onKeyDown={(e) => { if (e.key === "Enter") void commitRename(p); if (e.key === "Escape") setRenaming(null); }} />
            ) : (
              <div className="proj-name" title={p.name}>
                {p.name}
                {p.is_public && <span className="proj-badge"><Eye size={11} strokeWidth={2} /> {t("badgePublic")}</span>}
              </div>
            )}
            <div className="proj-meta">Updated {new Date(p.updated_at).toLocaleDateString()}</div>
            <div className="proj-actions">
              <button title="Open into the editor" disabled={busy} onClick={() => void doOpen(p)}>
                <FolderOpen size={14} strokeWidth={1.8} /> {t("openBtn")}
              </button>
              <button title="Overwrite with the kit on screen" disabled={busy} onClick={() => void doUpdate(p)}>
                <RefreshCw size={14} strokeWidth={1.8} />
              </button>
              <button title="Rename" disabled={busy} onClick={() => { setRenaming(p.id); setRenameVal(p.name); }}>
                <Pencil size={14} strokeWidth={1.8} />
              </button>
              {/* the eyeball tells the STATE (owner call): open eye = the
                  world can see it, slashed = private. Click to flip. */}
              <button className={p.is_public ? "proj-eye on" : "proj-eye"}
                title={p.is_public ? "Public — anyone with the link can view it, and it may be curated into the Community Gallery. Click to make private." : "Private — only you. Click to share: it gets a public link and may be curated into the Community Gallery."}
                disabled={busy} onClick={() => void togglePublic(p)}>
                {p.is_public ? <Eye size={14} strokeWidth={1.8} /> : <EyeOff size={14} strokeWidth={1.8} />}
              </button>
              {p.is_public && p.share_slug && (
                <button title="Copy public link" disabled={busy} onClick={() => void copyLink(p.share_slug!, p.id)}>
                  {copied === p.id ? <Check size={14} strokeWidth={2} /> : <Link2 size={14} strokeWidth={1.8} />}
                </button>
              )}
              <button className="proj-del" title="Delete" disabled={busy} onClick={() => void doDelete(p)}>
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="menu-note acct-note">{t("projFootnote")}</div>
    </div>
  );
}
