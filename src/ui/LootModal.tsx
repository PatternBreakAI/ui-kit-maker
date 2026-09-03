import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, X } from "lucide-react";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { useGen, presetLookConfig } from "@/generator/store";
import { renderKit } from "@/generator/bevel";
import { presetArt } from "./Panel";

/* The signup welcome, staged like a real card-game pull — and built from
   the kit itself as proof: each unopened pack is the kit's own `pack`
   component rendered in the style of the preset inside it. Tap a pack and
   it shakes, strains, then explodes into the reveal. Shown once per
   account per browser; purely celebratory.

   Free-play round (owner mandate, 2026-08-26): every starter preset is
   open to everyone, so the packs stopped being an unlock and the pitch
   moved to what signing up actually buys — your work saved to your
   account, on any device. The crack-a-pack theater stays (it's the
   product's own showmanship); it now deals two showcase looks. */

const RARITY = ["RARE", "EPIC"] as const;
/* white-hot ignition (.5s, the claim celebration's language) — the reveal
   bursts in as the flare peaks */
const CRACK_MS = 500;

/** Presentational core — exported so it can be previewed without auth. */
export function LootModalView({ onClose }: { onClose: () => void }) {
  // two showcase looks to crack open — celebration, not an unlock; every
  // starter is already free for every tier
  const pulls = presetArt().slice(-2);
  const packArts = useMemo(
    /* label:"" drops the pack face's "12 CARDS" caption — the reward mock
       wants clean faces; the rarity plate below carries the words. Each
       pack renders from the EXACT document its look lands
       (presetLookConfig — the setPreset road); the private builder that
       used to sit here was a fossil of the font-dropping recipe branch
       the Looks rack already killed, so a pack could wear a different
       face than the look inside it. */
    () => pulls.map((p) => renderKit(presetLookConfig(p.id), "pack", "m", "default", undefined, undefined, { label: "" })),
    [pulls.map((p) => p.id).join(",")] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [opened, setOpened] = useState<boolean[]>(pulls.map(() => false));
  const [cracking, setCracking] = useState<boolean[]>(pulls.map(() => false));
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const allOpen = opened.every(Boolean);

  const crack = (i: number) => {
    if (opened[i] || cracking[i]) return;
    // reduced-motion opens instantly — no flare to sit through
    const instant = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (instant) { setOpened((o) => o.map((v, j) => (j === i ? true : v))); return; }
    setCracking((c) => c.map((v, j) => (j === i ? true : v)));
    timers.current.push(window.setTimeout(() => {
      setOpened((o) => o.map((v, j) => (j === i ? true : v)));
      setCracking((c) => c.map((v, j) => (j === i ? false : v)));
    }, CRACK_MS));
  };

  return (
    <div className="lootback" role="dialog" aria-modal="true" aria-label="Welcome. Your work now saves to your account" onClick={onClose}>
      <div className="lootmodal" onClick={(e) => e.stopPropagation()}>
        {/* animated backdrop: drifting circuit field + diagonal light sweeps */}
        <span className="lootgrid" aria-hidden="true" />
        <span className="lootsweep sa" aria-hidden="true" />
        <span className="lootsweep sb" aria-hidden="true" />
        <button className="lootclose" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={2.2} /></button>
        <div className="lootkicker"><Zap size={14} strokeWidth={2.2} /> LEVEL UP</div>
        <h2>YOUR WORK <span className="lootgrad">FOLLOWS YOU</span></h2>
        <p className="lootsub">{allOpen ? "Both looks live in your Presets panel, and everything you make from here rides your account." : "Thanks for signing up. Kits, boards and uploads now save to your account, on any device. Tap a pack to crack open a look."}</p>
        <div className="lootrow">
          {pulls.map((p, i) => (
            <div key={p.id} className={`lootcell${opened[i] ? " open" : ""}`}>
              <div className="lootframe">
                {!opened[i] ? (
                  <button className={`lootpackbtn${cracking[i] ? " cracking" : ""}`} style={{ animationDelay: cracking[i] ? undefined : `${i * 0.18}s` }}
                    aria-label={`Open pack ${i + 1}`}
                    onClick={() => crack(i)}>
                    <span className="lootpackart" dangerouslySetInnerHTML={{ __html: packArts[i] }} />
                  </button>
                ) : (
                  <div className="lootcard">
                    <span className="lootburst" aria-hidden="true">
                      {Array.from({ length: 12 }).map((_, k) => (
                        <i key={k} style={{ ["--a" as string]: `${k * 30}deg`, ["--t" as string]: `${0.55 + (k % 3) * 0.2}s` }} />
                      ))}
                    </span>
                    <span className="lootart" dangerouslySetInnerHTML={{ __html: p.svg }} />
                    <b>{p.name}</b>
                  </div>
                )}
              </div>
              <em className={`lootplate r${i}`}>{RARITY[i] ?? "RARE"} {opened[i] ? "STYLE" : "PACK"}</em>
              <i className={`lootchev r${i}`} aria-hidden="true" />
            </div>
          ))}
        </div>
        <button className="lootclaim" onClick={onClose}>{allOpen ? "BACK TO MAKING" : "Skip the reveal"}</button>
      </div>
    </div>
  );
}

export function LootModal() {
  const cloud = useCloudStatus();
  const tier = useGen((s) => s.tier);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // review affordance: ?lootpreview opens the modal without auth
    if (window.location.search.includes("lootpreview")) { setOpen(true); return; }
    if (cloud.state !== "synced" || !cloud.email || tier === "guest") return;
    /* Once per account per browser (owner call, 2026-07-25 — the review
       period's play-every-load is over). The key is per-email so a second
       account on the same machine still gets its own celebration; the
       flag is set on SHOW, not on close, so a refresh mid-animation
       doesn't replay it. ?lootpreview stays as the review door. */
    const key = `ui-generator-loot:${cloud.email}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString());
    } catch { /* private mode — showing twice beats never showing */ }
    setOpen(true);
  }, [cloud.state, cloud.email, tier]);

  if (!open) return null;
  return <LootModalView onClose={() => setOpen(false)} />;
}
