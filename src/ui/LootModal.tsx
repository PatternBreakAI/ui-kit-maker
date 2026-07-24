import { useEffect, useMemo, useState } from "react";
import { Zap, X } from "lucide-react";
import { useCloudStatus } from "@/shell/useCloudStatus";
import { useGen, hydrate, PRESET_DEFAULTS } from "@/generator/store";
import { capsOf } from "@/generator/entitlements";
import { PRESETS, defaultConfig, defaultCandy, applyPresetCandy } from "@/generator/model";
import type { GenConfig } from "@/generator/model";
import { retintText } from "@/generator/store";
import { renderKit } from "@/generator/bevel";
import { presetArt } from "./Panel";

/* The signup reward, staged like a real card-game pull — and built from the
   kit itself as proof: each unopened pack is the kit's own `pack` component
   rendered in the style of the preset inside it; the reveal rides the same
   engine's thumbnail. Tap a pack to crack it. Shown once per account per
   browser; purely celebratory — the tier change already unlocked the cards. */

const RARITY = ["RARE", "EPIC"] as const;

function presetCfg(id: string): GenConfig {
  if (PRESET_DEFAULTS[id]) return hydrate(structuredClone(PRESET_DEFAULTS[id]));
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  const pc = defaultConfig();
  pc.presetId = p.id; pc.shape = p.shape; pc.bevel = { ...p.bevel }; pc.effects = { ...p.effects };
  const candy = defaultCandy(); applyPresetCandy(candy, p); pc.candy = candy;
  retintText(pc);
  return pc;
}

/** Presentational core — exported so it can be previewed without auth. */
export function LootModalView({ onClose }: { onClose: () => void }) {
  const from = capsOf("guest").presetLimit;
  const to = capsOf("free").presetLimit;
  const pulls = presetArt().slice(from, to);
  const packArts = useMemo(
    () => pulls.map((p) => renderKit(presetCfg(p.id), "pack", "m", "default")),
    [pulls.map((p) => p.id).join(",")] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [opened, setOpened] = useState<boolean[]>(pulls.map(() => false));
  const allOpen = opened.every(Boolean);

  return (
    <div className="lootback" role="dialog" aria-modal="true" aria-label="Preset packs unlocked" onClick={onClose}>
      <div className="lootmodal" onClick={(e) => e.stopPropagation()}>
        <span className="lootrays" aria-hidden="true" />
        {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} className={`lootspark ls${i}`} aria-hidden="true" />)}
        <button className="lootclose" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={2.2} /></button>
        <div className="lootkicker"><Zap size={14} strokeWidth={2.2} /> LEVEL UP</div>
        <h2>YOU PULLED 2 PRESET PACKS</h2>
        <p className="lootsub">{allOpen ? "Equipped — they're live in your Presets panel, with the full kit and 150% zoom." : "Tap a pack to crack it open."}</p>
        <div className="lootrow">
          {pulls.map((p, i) => (
            <div key={p.id} className={`lootcell${opened[i] ? " open" : ""}`}>
              {!opened[i] ? (
                <button className="lootpackbtn" style={{ animationDelay: `${i * 0.18}s` }}
                  aria-label={`Open pack ${i + 1}`}
                  onClick={() => setOpened((o) => o.map((v, j) => (j === i ? true : v)))}>
                  <span className="lootpackart" dangerouslySetInnerHTML={{ __html: packArts[i] }} />
                  <em className={`lootrarity r${i}`}>{RARITY[i] ?? "RARE"} PACK</em>
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
                  <em className={`lootrarity r${i}`}>{RARITY[i] ?? "RARE"} STYLE</em>
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="lootclaim" onClick={onClose}>{allOpen ? "EQUIP & CONTINUE" : "Skip — equip both"}</button>
      </div>
    </div>
  );
}

export function LootModal() {
  const cloud = useCloudStatus();
  const tier = useGen((s) => s.tier);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (cloud.state !== "synced" || !cloud.email || tier === "guest") return;
    /* TEMP while the pull animation is under review: play on EVERY signed-in
       editor load. When it moves into FTUE, restore the once-per-account
       gate (localStorage "ui-generator-loot:<email>" — set on first show,
       skip when present). */
    setOpen(true);
  }, [cloud.state, cloud.email, tier]);

  if (!open) return null;
  return <LootModalView onClose={() => setOpen(false)} />;
}
