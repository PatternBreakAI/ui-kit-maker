import { useEffect, useState } from "react";
import {
  ArrowLeft, FolderOpen, Save, Trash2, Pencil, Link2, Check, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { useGen } from "@/generator/store";
import {
  listProjects, saveProject, renameProject, deleteProject, setProjectPublic,
  loadProjectDoc, updateProjectDoc, publicProjectUrl, type CloudProject,
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
    const name = newName.trim() || kitName || "Untitled kit";
    // the kit takes the project's name, so the kit-page title reflects the
    // project you just saved (and the saved snapshot carries it)
    useGen.getState().setKitName(name);
    const st = useGen.getState();
    /* the consent moment's other half: free & student kits save PUBLIC
       (the community launch); Pro and admin default private and keep
       their toggle. RLS enforces the same line server-side. */
    const canPrivate = st.tier === "pro" || st.isAdmin;
    const { project, error } = await saveProject(name, st.kitPayload(), !canPrivate || shareDef);
    setBusy(false);
    if (error || !project) { setNote(error ?? "Couldn't save."); return; }
    setNewName("");
    await refresh();
  };

  const doOpen = async (p: CloudProject) => {
    if (confirmReplace && !window.confirm(`Open “${p.name}”? It replaces the kit on screen — save the current one as a project first if you want to keep it.`)) return;
    setBusy(true); setNote(null);
    const { doc, error } = await loadProjectDoc(p.id);
    setBusy(false);
    if (error || !doc) { setNote(error ?? "Couldn't load that project."); return; }
    useGen.getState().loadKitPayload(doc as Record<string, unknown>, { viewer: false });
    onClose();
    onOpened?.();
  };

  const doUpdate = async (p: CloudProject) => {
    if (!window.confirm(`Overwrite “${p.name}” with the kit currently on screen?`)) return;
    setBusy(true); setNote(null);
    const error = await updateProjectDoc(p.id, useGen.getState().kitPayload());
    setBusy(false);
    if (error) { setNote(error); return; }
    setNote(`“${p.name}” updated.`);
    await refresh();
  };

  const commitRename = async (p: CloudProject) => {
    const name = renameVal.trim();
    setRenaming(null);
    if (!name || name === p.name) return;
    setBusy(true);
    const error = await renameProject(p.id, name);
    setBusy(false);
    if (error) { setNote(error); return; }
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
        <b>My Projects</b>
      </div>

      <div className="proj-save">
        <input className="acct-in proj-save-in" type="text" placeholder={kitName ? `Save as “${kitName}”…` : "Name this kit…"}
          value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) void doSave(); }} />
        <button className="proj-save-btn" disabled={busy} onClick={() => void doSave()}>
          <Save size={15} strokeWidth={1.8} /> Save
        </button>
      </div>
      {!canPrivate ? (
        /* THE CONSENT MOMENT — said where the decision happens, not in
           fine print: free & student kits are community kits. The same
           sentence is the product's cleanest Pro doorway. */
        <div className="proj-consent">
          Saved kits on the Free plan may be curated into the <b>Community Gallery</b>, where
          other users can use and remix them. <button className="fd-linkbtn" onClick={() => { window.location.hash = "#/pricing"; }}>Upgrade to Pro</button> to keep your kits private.
        </div>
      ) : (
        /* the Pro mirror of the consent line — their kits save PRIVATE
           unless the global default below says otherwise. Owner report
           2026-07-25: a Pro user couldn't find how to enter the community
           at all. */
        <div className="proj-consent">
          Your kits save <b>{shareDef ? "public" : "private"}</b>. Tap the eye on any kit to
          flip one — public kits get a link and may be curated into the <b>Community Gallery</b>.
          <label className="check proj-sharedef">
            <input type="checkbox" checked={shareDef} onChange={(e) => flipShareDef(e.target.checked)} />
            Share new kits by default
          </label>
        </div>
      )}
      {note && <div className="menu-note acct-note">{note}</div>}

      <div className="proj-list">
        {items === null && <div className="menu-note acct-note">Loading…</div>}
        {items !== null && items.length === 0 && (
          <div className="menu-note acct-note">No saved projects yet — name the kit above and Save.</div>
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
                {p.is_public && <span className="proj-badge"><Eye size={11} strokeWidth={2} /> public</span>}
              </div>
            )}
            <div className="proj-meta">Updated {new Date(p.updated_at).toLocaleDateString()}</div>
            <div className="proj-actions">
              <button title="Open into the editor" disabled={busy} onClick={() => void doOpen(p)}>
                <FolderOpen size={14} strokeWidth={1.8} /> Open
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
      <div className="menu-note acct-note">A public link opens the kit read-only for anyone; public kits may be curated into the Community Gallery.</div>
    </div>
  );
}
