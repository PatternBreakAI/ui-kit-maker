import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import "@/styles/pricing.css";
import { useGen, isTouched } from "@/generator/store";
import { useNewKitSheet, openNewKitSheet, closeNewKitSheet } from "@/shell/newKit";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { openAuth } from "@/shell/authOverlay";
import { navigate } from "@/shell/router";
import { listProjects, saveProject, updateProjectDoc, uniqueName } from "@/generator/cloud";

/* New kit — the boundary flow (owner, 2026-08-18: "too confusing to know
   exactly where your old kit ends and your new kit begins").

   startNewKit() is the ONE entry every surface calls (TopBar's new-file
   button, the projects home's card). A clean desk starts fresh silently;
   unsaved work opens this sheet — the Close settle sheet's grammar,
   pointed forward: settle the OLD kit (update it, save it as a new file,
   or let it go), then the desk zeroes through store.newKit(). Guests
   can't save, so their sheet says the discard plainly and offers the
   sign-in door instead of a save. Never silent loss; the old kit stays
   findable in My Projects with its thumbnail. */

/** Zero the desk and land in the editor, saying so in file words. */
function freshDesk(after?: string) {
  const g = useGen.getState();
  g.newKit();
  g.flashFile(after ?? "A fresh kit is on your desk — nothing carried over.");
  navigate("#/app");
}

/** The one door: silent when there is nothing to lose, the sheet when
    there is. Every New kit surface calls this. */
export function startNewKit() {
  const st = useGen.getState();
  /* the unsaved-work test, one notch stricter than the replace flows'
     projectDirty: dirty covers this session's edits, and a TOUCHED,
     UNBOUND desk counts too — projectDirty doesn't survive a reload, so
     without the second clause a reloaded draft would zero silently.
     newKit() clears the touched flag, so a just-zeroed desk never
     re-prompts. A bound, clean project needs no goodbye — it's saved. */
  const unsaved = st.projectDirty || (!st.openProjectId && isTouched());
  if (!unsaved) { freshDesk(); return; }
  openNewKitSheet();
}

export function NewKitSheet() {
  const { open } = useNewKitSheet();
  const cloud = useCloudStatus();
  const kitName = useGen((s) => s.kitName);
  const openProjectId = useGen((s) => s.openProjectId);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /* house modal manners (round 56, the switch-look sweep): Escape and the
     backdrop dismiss like the Cancel button — never mid-save */
  useEffect(() => {
    if (!open || busy) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setNote(null); closeNewKitSheet(); } };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, busy]);
  if (!open) return null;

  // "error" still counts as signed in — RLS writes keep working while the
  // workspace sync is paused (the ProjectsPanel precedent)
  const signedIn = cloud.state === "synced" || cloud.state === "syncing" || cloud.state === "error";
  const name = kitName?.trim() || "Untitled kit";
  const done = () => { setBusy(false); setNote(null); closeNewKitSheet(); };

  const settle = async (mode: "update" | "savenew" | "discard") => {
    if (mode === "discard") {
      done();
      freshDesk(signedIn ? `Fresh kit — “${name}” was left as last saved.` : "Fresh kit — the old work was cleared.");
      return;
    }
    setBusy(true); setNote(null);
    const { projects, error } = await listProjects();
    if (error) { setBusy(false); setNote(error); return; }
    const st = useGen.getState();
    if (mode === "update" && st.openProjectId) {
      const row = (projects ?? []).find((x) => x.id === st.openProjectId);
      if (!row) { setBusy(false); setNote("That project's row is gone — save as a new file instead."); return; }
      /* same privacy line as every save: public docs never carry boards */
      const err = await updateProjectDoc(row.id, row.is_public ? st.kitPayload() : await st.kitPayloadWithBoards());
      if (err) { setBusy(false); setNote(err); return; }
      done();
      freshDesk(`“${row.name}” updated — a fresh kit is on your desk.`);
      return;
    }
    /* save as a NEW file — the save popover's exact rules: resolved tier
       decides visibility (free & student kits save public, the community
       consent), taken names auto-suffix, boards ride private saves only */
    let st2 = st;
    if (st2.tier === "guest") { await st2.loadCloudPresets(); st2 = useGen.getState(); }
    const canPrivate = st2.tier === "pro" || st2.isAdmin;
    let shareDef = false;
    try { shareDef = localStorage.getItem("ui-generator-sharedefault") === "1"; } catch { /* private mode */ }
    const pub = !canPrivate || shareDef;
    const saveName = uniqueName(name, (projects ?? []).map((x) => x.name));
    const { error: saveErr } = await saveProject(saveName, pub ? st2.kitPayload() : await st2.kitPayloadWithBoards(), pub);
    if (saveErr) { setBusy(false); setNote(saveErr); return; }
    done();
    freshDesk(`Saved as “${saveName}” — a fresh kit is on your desk.`);
  };

  return (
    <div className="ph-veil" role="dialog" aria-modal="true" aria-label="Start a new kit"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) done(); }}>
      {!signedIn ? (
        /* ── guests: no save exists, so the goodbye is said plainly ── */
        <div className="ph-sheet">
          <b>Start a new kit?</b>
          <p>
            The kit on your desk lives only in this browser — without an account it
            can't be saved. Starting fresh clears it, and there's no undo across a
            new kit.
          </p>
          <div className="ph-sheetrow">
            <button className="fd-pricing__cta" disabled={busy} onClick={() => { done(); openAuth("signin"); }}>
              Sign in free & keep it
            </button>
            <button className="cg-open" disabled={busy} onClick={() => void settle("discard")}>
              Clear it & start new
            </button>
          </div>
          <button className="fd-linkbtn" disabled={busy} onClick={done}>Cancel</button>
        </div>
      ) : openProjectId ? (
        /* ── a bound project with unsaved edits: the Close sheet's three
              honest doors, pointed at a fresh start ── */
        <div className="ph-sheet">
          <b>Update “{name}” before starting new?</b>
          <p>
            You have edits that aren't in the saved file yet. Either way, “{name}”
            stays in My Projects and the new kit starts from zero.
          </p>
          <div className="ph-sheetrow">
            <button className="fd-pricing__cta" disabled={busy} onClick={() => void settle("update")}>
              {busy ? <Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> : "Update & start new"}
            </button>
            <button className="cg-open" disabled={busy} onClick={() => void settle("savenew")}>Save as a new file</button>
            <button className="cg-open" disabled={busy} title="The saved version stays as it was"
              onClick={() => void settle("discard")}>Start new without saving</button>
          </div>
          {note && <p role="status">{note}</p>}
          <button className="fd-linkbtn" disabled={busy} onClick={done}>Cancel</button>
        </div>
      ) : (
        /* ── an unsaved draft: one save door, one goodbye ── */
        <div className="ph-sheet">
          <b>Save “{name}” before starting new?</b>
          <p>
            The draft on your desk isn't saved as a project yet. Save it and it
            lands in My Projects with a thumbnail; the new kit starts from zero.
          </p>
          <div className="ph-sheetrow">
            <button className="fd-pricing__cta" disabled={busy} onClick={() => void settle("savenew")}>
              {busy ? <Loader2 size={14} strokeWidth={2.4} className="fd-spin" /> : "Save to My Projects"}
            </button>
            <button className="cg-open" disabled={busy} onClick={() => void settle("discard")}>Start new without saving</button>
          </div>
          {note && <p role="status">{note}</p>}
          <button className="fd-linkbtn" disabled={busy} onClick={done}>Cancel</button>
        </div>
      )}
    </div>
  );
}
