import { useState } from "react";
import { X, Zap, Crown, UserPlus, ChevronRight, Gamepad2, Loader2, FileJson, Check } from "lucide-react";
import { useGen } from "@/generator/store";
import { useGateModal, closeGate } from "@/shell/gateModal";
import { openAuth } from "@/shell/authOverlay";
import { navigate } from "@/shell/router";
import { downloadTestKit } from "@/generator/billing";

/* The gate modal — what a locked export opens instead of a hard
   navigation (Gate Round, owner mandate 2026-08-17). Wears the loot
   modal's chrome so the reward moment and the sell moment speak one
   visual language. Two pitches, keyed to who is looking:

   · guest + export → the playground is already theirs (free-play round,
     2026-08-26) — sign-up is pitched as the KEEP step: saved work, the
     settings file, the test kit. Honest: exports are NOT in it.
   · free  + export → exports ship with Pro; the Unity TEST KIT is the
     free counter-offer, downloadable right here ("prove the pipeline
     first"), and the settings file is called out as always-free

   Paid tiers never see this — their gates don't fire. */
export function GateModal() {
  const { open } = useGateModal();
  const tier = useGen((s) => s.tier);
  const [tkBusy, setTkBusy] = useState(false);
  const [tkNote, setTkNote] = useState<string | null>(null);

  if (!open || tier === "pro" || tier === "student") return null;
  const guest = tier === "guest";

  const done = () => { setTkNote(null); closeGate(); };
  const signUp = () => { done(); openAuth("signup"); };
  const seePlans = () => { done(); navigate("#/pricing"); };
  const getKit = async () => {
    if (tkBusy) return;
    setTkBusy(true); setTkNote(null);
    const err = await downloadTestKit();
    setTkBusy(false);
    setTkNote(err ?? "On its way — check your downloads.");
  };

  return (
    <div className="lootback" role="dialog" aria-modal="true"
      aria-label="Exports and your plan" onClick={done}>
      <div className="lootmodal gatemodal" onClick={(e) => e.stopPropagation()}>
        <span className="lootgrid" aria-hidden="true" />
        <span className="lootsweep sa" aria-hidden="true" />
        <button className="lootclose" aria-label="Close" onClick={done}><X size={16} strokeWidth={2.2} /></button>

        {guest ? (
          <>
            <div className="lootkicker"><Zap size={14} strokeWidth={2.2} /> FREE ACCOUNT</div>
            <h2>MAKE IT <span className="lootgrad">YOURS</span></h2>
            <p className="lootsub">The whole playground is already free — signing up is how you keep what you make:</p>
            <ul className="gateperks">
              {/* one span per row — the li is a flex row, and bare text nodes
                  beside a <b> would each become flex items and wrap apart */}
              <li><Check size={13} strokeWidth={3} /><span>Your kits and boards saved to your account — on any device, safe from a cleared browser</span></li>
              <li><Check size={13} strokeWidth={3} /><span>Named projects, and a spot in the Community Gallery if yours gets picked</span></li>
              <li><Check size={13} strokeWidth={3} /><span>Your settings file — the whole recipe, downloadable</span></li>
              <li><Check size={13} strokeWidth={3} /><span>The <b>Unity test kit</b> — a stock kit ZIP that proves the import pipeline in your engine</span></li>
            </ul>
            <p className="gatefine">Exporting your own designs is the Pro unlock — sign up free first, upgrade if it earns it.</p>
            <button className="lootclaim" onClick={signUp}>
              <UserPlus size={15} strokeWidth={2.4} /> CREATE A FREE ACCOUNT
            </button>
            <button className="gatequiet" onClick={seePlans}>See the plans <ChevronRight size={13} strokeWidth={2.4} /></button>
          </>
        ) : (
          <>
            <div className="lootkicker"><Crown size={14} strokeWidth={2.2} /> PRO UNLOCK</div>
            <h2>EXPORTS SHIP WITH <span className="lootgrad">PRO</span></h2>
            <p className="lootsub">
              Every export format — PNG up to 4×, layered SVG, HTML, game kit,
              engine ZIP — comes with Pro, and Student carries the same formats.
            </p>
            <button className="lootclaim" onClick={seePlans}>
              <Crown size={15} strokeWidth={2.4} /> GO PRO — SEE THE PLANS
            </button>
            <div className="gateoffer">
              <b><Gamepad2 size={14} strokeWidth={2.2} /> Prove the pipeline first — free</b>
              <p>
                The <b>Unity test kit</b> is a stock free kit — the same
                ZIP for everyone, not your design — with prefabs, scenes,
                gauges and words. Feel the whole import in your engine before
                you pay a cent, and ship what's inside if you like: it's
                yours, commercial projects included.
              </p>
              <button className="gatesecondary" disabled={tkBusy} onClick={() => void getKit()}>
                {tkBusy ? <Loader2 size={14} strokeWidth={2.2} className="fd-spin" /> : <Gamepad2 size={14} strokeWidth={2.2} />}
                {tkBusy ? "Fetching your kit…" : "Download the Unity test kit"}
              </button>
              {tkNote && <p className="gatenote" role="status">{tkNote}</p>}
            </div>
            <p className="gatefine"><FileJson size={12} strokeWidth={2.2} /> Your settings file (Export → Export settings) stays free — the recipe is always yours.</p>
          </>
        )}
      </div>
    </div>
  );
}
