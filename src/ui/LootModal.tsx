import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { useGen } from "@/generator/store";
import { capsOf } from "@/generator/entitlements";
import { presetArt } from "./Panel";

/* The signup reward, in the product's own language: creating an account
   "pulls" two preset packs — an animated reveal of the two starter presets
   the free tier unlocks (the guest limit and the free limit bound them).
   Shown once per account per browser; purely celebratory, nothing to claim
   server-side (the tier change itself unlocked the cards). */

const SEEN_PREFIX = "ui-generator-loot:";

export function LootModal() {
  const cloud = useCloudStatus();
  const tier = useGen((s) => s.tier);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (cloud.state !== "synced" || !cloud.email || tier === "guest") return;
    const key = SEEN_PREFIX + cloud.email.toLowerCase();
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch { return; }
    setOpen(true);
  }, [cloud.state, cloud.email, tier]);

  if (!open) return null;

  // the two packs = the presets between the guest limit and the free limit
  const from = capsOf("guest").presetLimit;
  const to = capsOf("free").presetLimit;
  const packs = presetArt().slice(from, to);

  return (
    <div className="lootback" role="dialog" aria-modal="true" aria-label="Preset packs unlocked" onClick={() => setOpen(false)}>
      <div className="lootmodal" onClick={(e) => e.stopPropagation()}>
        <button className="lootclose" aria-label="Close" onClick={() => setOpen(false)}><X size={16} strokeWidth={2.2} /></button>
        <div className="lootkicker"><Sparkles size={14} strokeWidth={2.2} /> LEVEL UP</div>
        <h2>Account created — you pulled 2 preset packs!</h2>
        <div className="lootrow">
          {packs.map((p, i) => (
            <div key={p.id} className="lootpack" style={{ animationDelay: `${0.25 + i * 0.55}s` }}>
              <div className="lootpack-inner">
                <div className="lootface lootback-face"><Sparkles size={22} strokeWidth={2} /><span>PACK {i + 1}</span></div>
                <div className="lootface lootfront">
                  <span className="lootart" dangerouslySetInnerHTML={{ __html: p.svg }} />
                  <b>{p.name}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p>They're live in your Presets panel now — plus the full kit and 150% zoom.</p>
        <button className="lootclaim" onClick={() => setOpen(false)}>Equip and continue</button>
      </div>
    </div>
  );
}
