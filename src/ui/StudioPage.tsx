import { useEffect, useRef, useState } from "react";
import {
  Camera, CreditCard, Crown, ExternalLink, Heart, Loader2, Settings,
  Trash2, Users, Wand2,
} from "lucide-react";
import "@/styles/pricing.css";
import { navigate } from "@/shell/router";
import { openAuth } from "@/shell/authOverlay";
import { useCloudStatus } from "@/shell/useCloudStatus";
import {
  cloudConfig, listProjects, loadProjectDoc, deleteProject, myProfileTier,
  publicProjectUrl, type CloudProject,
} from "@/generator/cloud";
import {
  myPublicProfile, setMyPublicProfile, uploadAvatar, avatarUrl, myWork,
} from "@/generator/community";
import { openBillingPortal } from "@/generator/billing";
import { useGen } from "@/generator/store";
import { CardArt } from "./CommunityPage";

/* #/studio — the maker's own room. One page that answers "where is my
   stuff and who am I out there": the public face (avatar, name, handle),
   the doors (account, billing, plans, gallery), and the work — every
   saved kit as a live render, sortable, openable, deletable.

   Organization beyond sorting (folders and friends) is Pro territory by
   owner decree — not shown here until it exists, same cadence rule as
   the packs. */

type SortKey = "new" | "old" | "az" | "public";
const SORTS: { k: SortKey; label: string }[] = [
  { k: "new", label: "Newest" },
  { k: "old", label: "Oldest" },
  { k: "az", label: "A–Z" },
  { k: "public", label: "Public first" },
];

function sortWork(rows: CloudProject[], k: SortKey): CloudProject[] {
  const r = [...rows];
  if (k === "old") r.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  else if (k === "az") r.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  else if (k === "public") r.sort((a, b) => Number(b.is_public) - Number(a.is_public) || b.updated_at.localeCompare(a.updated_at));
  else r.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return r;
}

export function StudioPage() {
  const live = !!cloudConfig();
  const cloud = useCloudStatus();
  const signedIn = cloud.state === "synced" || cloud.state === "syncing";

  // the public face
  const [face, setFace] = useState<{ handle: string | null; display_name: string | null; avatar_path: string | null } | null>(null);
  const [handle, setHandle] = useState("");
  const [dname, setDname] = useState("");
  const [faceNote, setFaceNote] = useState<string | null>(null);
  const [faceBusy, setFaceBusy] = useState(false);
  const [avBusy, setAvBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // the work
  const [work, setWork] = useState<CloudProject[] | null>(null);
  const [meta, setMeta] = useState<Map<string, { listed: boolean; likes: number }>>(new Map());
  const [sort, setSort] = useState<SortKey>("new");
  const [workNote, setWorkNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  const loadFace = async () => {
    const f = await myPublicProfile();
    setFace(f ?? { handle: null, display_name: null, avatar_path: null });
    setHandle(f?.handle ?? "");
    setDname(f?.display_name ?? "");
  };
  const loadWork = async () => {
    const { projects, error } = await listProjects();
    if (error) setWorkNote(error);
    setWork(projects);
    setMeta(await myWork());
  };

  useEffect(() => {
    if (!live || !signedIn) return;
    void loadFace();
    void loadWork();
    void myProfileTier().then((p) => setPlan(p.admin ? "pro" : p.plan));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, signedIn]);

  const saveFace = async () => {
    setFaceBusy(true); setFaceNote(null);
    const err = await setMyPublicProfile({ handle: handle.trim(), display_name: dname });
    setFaceBusy(false);
    if (err) { setFaceNote(err); return; }
    setFaceNote("Saved.");
    void loadFace();
  };

  const pickAvatar = async (f: File) => {
    setAvBusy(true); setFaceNote(null);
    const err = await uploadAvatar(f);
    setAvBusy(false);
    if (err) { setFaceNote(err); return; }
    void loadFace();
  };

  const openKit = async (p: CloudProject) => {
    setBusyId(p.id); setWorkNote(null);
    const { doc, error } = await loadProjectDoc(p.id);
    setBusyId(null);
    if (error || !doc) { setWorkNote(error ?? "Couldn't load that kit."); return; }
    useGen.getState().loadKitPayload(doc as Record<string, unknown>, { viewer: false });
    navigate("#/app");
  };

  const removeKit = async (p: CloudProject) => {
    if (!window.confirm(`Delete “${p.name}”? This removes it from your account${p.is_public ? " and the community" : ""} — there is no undo.`)) return;
    setBusyId(p.id); setWorkNote(null);
    const err = await deleteProject(p.id);
    setBusyId(null);
    if (err) { setWorkNote(err); return; }
    void loadWork();
  };

  const billing = async () => {
    const err = await openBillingPortal();
    if (err) window.alert(err);
  };

  const av = avatarUrl(face?.avatar_path ?? null);
  const rows = sortWork(work ?? [], sort);

  return (
    <div className="fd-pricing">
      <header className="fd-pricing__nav">
        <button className="fd-pricing__brand" onClick={() => navigate("#/")}>← UI Kit Maker</button>
        <span className="cg-nav">
          <button className="cg-navbtn" onClick={() => navigate("#/community")}>Community Gallery</button>
          <span className="fd-pricing__mark"><i className="fd-pricing__gem" aria-hidden="true" />PatternBreak</span>
        </span>
      </header>

      <main className="cg">
        <h1>Your Studio</h1>
        <p className="fd-pricing__sub">Your public face, your doors, your work — all in one room.</p>

        {!live ? (
          <section className="fd-studentcard"><p>The studio needs the cloud, which isn't configured on this deployment.</p></section>
        ) : !signedIn ? (
          <section className="fd-studentcard">
            <p>The studio is your signed-in room — your profile, your billing, your saved kits.</p>
            <p><button className="fd-pricing__cta" onClick={() => openAuth("signin")}>Sign in</button></p>
          </section>
        ) : (
          <>
            {/* ── the public face ── */}
            <section className="fd-studentcard cg-face">
              <label className="cg-face__avatar" title="Change your picture">
                {av ? <img src={av} alt="Your profile picture" /> : <span className="cg-face__blank" aria-hidden="true" />}
                <span className="cg-face__cam">{avBusy ? <Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> : <Camera size={14} strokeWidth={2.2} />}</span>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAvatar(f); e.target.value = ""; }} />
              </label>
              <div className="cg-face__fields">
                <div className="cg-face__row">
                  <label>Display name
                    <input value={dname} maxLength={40} placeholder="Shown on your kits"
                      onChange={(e) => setDname(e.target.value)} />
                  </label>
                  <label>Handle
                    <span className="cg-face__at">@<input value={handle} maxLength={20} placeholder="your_handle"
                      onChange={(e) => setHandle(e.target.value.toLowerCase())} /></span>
                  </label>
                  <button className="fd-pricing__cta cg-face__save" disabled={faceBusy} onClick={() => void saveFace()}>
                    {faceBusy ? <Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> : "Save"}
                  </button>
                </div>
                <p className="fd-rfine">
                  The handle is your public page's address — lowercase letters, numbers, underscore.
                  {face?.handle && (
                    <>{" "}<button className="fd-linkbtn" onClick={() => navigate(`#/u/${face.handle}`)}>View your public page <ExternalLink size={11} strokeWidth={2.2} /></button></>
                  )}
                </p>
                {faceNote && <p className={`fd-rfine${faceNote === "Saved." ? "" : " cg-err"}`}>{faceNote}</p>}
              </div>
            </section>

            {/* ── the doors ── */}
            <div className="cg-doors">
              <button className="cg-door" onClick={() => navigate("#/account")}>
                <Settings size={15} strokeWidth={2} /> Account settings
              </button>
              <button className="cg-door" onClick={() => void billing()}>
                <CreditCard size={15} strokeWidth={2} /> Billing
              </button>
              <button className="cg-door" onClick={() => navigate("#/pricing")}>
                <Crown size={15} strokeWidth={2} /> Plans
              </button>
              <button className="cg-door" onClick={() => navigate("#/community")}>
                <Users size={15} strokeWidth={2} /> Community Gallery
              </button>
            </div>

            {/* ── the work ── */}
            <div className="cg-secline">
              Your work
              <span className="cg-sort">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {SORTS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
                </select>
              </span>
            </div>
            {plan !== null && plan !== "pro" && (
              <p className="fd-rfine cg-worknote">
                Saved kits on the {plan === "student" ? "Student" : "Free"} plan may be curated into the Community
                Gallery, where other users can use and remix them.{" "}
                <button className="fd-linkbtn" onClick={() => navigate("#/pricing")}>Upgrade to Pro</button> to keep your kits private.
              </p>
            )}
            {workNote && <p className="fd-rfine cg-err">{workNote}</p>}
            {work === null ? (
              <section className="fd-studentcard"><p><Loader2 size={15} strokeWidth={2.4} className="fd-spin" /> Loading your kits…</p></section>
            ) : rows.length === 0 ? (
              <section className="fd-studentcard">
                <p>No saved kits yet. Build something in the editor, then save it as a project — it lands here.</p>
                <p><button className="fd-pricing__cta" onClick={() => navigate("#/app")}><Wand2 size={15} strokeWidth={2} /> Open the generator</button></p>
              </section>
            ) : (
              <div className="cg-grid">
                {rows.map((p) => {
                  const m = meta.get(p.id);
                  return (
                    <article key={p.id} className="cg-card">
                      <CardArt card={p} />
                      <div className="cg-meta">
                        <div className="cg-title">
                          <b>{p.name}</b>
                          <span className="cg-maker cg-maker--plain">
                            {m?.listed ? "In the gallery" : p.is_public ? "Public" : "Private"}
                            {m && m.likes > 0 && <> · <Heart size={11} strokeWidth={2.4} /> {m.likes}</>}
                          </span>
                        </div>
                        <div className="cg-actions">
                          <button className="cg-open" disabled={busyId === p.id} onClick={() => void openKit(p)}>
                            {busyId === p.id ? <Loader2 size={13} strokeWidth={2.4} className="fd-spin" /> : <Wand2 size={13} strokeWidth={2.2} />} Open
                          </button>
                          {p.is_public && p.share_slug && (
                            <a className="cg-open" href={publicProjectUrl(p.share_slug)} title="The public share link">
                              <ExternalLink size={13} strokeWidth={2.2} /> Share link
                            </a>
                          )}
                          <button className="cg-curate cg-del" disabled={busyId === p.id} onClick={() => void removeKit(p)}>
                            <Trash2 size={13} strokeWidth={2.2} /> Delete
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
    </div>
  );
}
