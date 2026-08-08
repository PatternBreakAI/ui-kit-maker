import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { GAME_FONTS } from "@/generator/model";
import { ensureFont } from "@/generator/fonts";

/* Shared prop-driven control primitives — extracted verbatim from Panel.tsx
   so sibling surfaces (Type Maker) drive the same widgets against their own
   state. Everything here is pure value/onChange: no store reads, no
   persistence, no editor coupling. Styling rides the globally-imported
   gen.css classes. */

export function Slider({ label, value, min, max, unit, step, onChange, disabled }: {
  label: string; value: number; min: number; max: number; unit: string; step?: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const clampV = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="ctl" style={disabled ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step ?? 1} value={value} disabled={disabled} onChange={(e) => onChange(+e.target.value)} />
      <span className="valbox">
        <input className="numin" type="number" min={min} max={max} step={step ?? 1} value={value} disabled={disabled}
          aria-label={`${label} value`}
          onChange={(e) => { const v = +e.target.value; if (!Number.isNaN(v)) onChange(clampV(v)); }} />
        <i>{unit}</i>
      </span>
    </div>
  );
}

export function FxToggle({ label, on, onToggle, children }: {
  label: string; on: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode;
}) {
  // Effects that are on show their controls; off effects can still be peeked
  // open with the caret so nothing feels hidden.
  const [peek, setPeek] = useState(false);
  const expanded = on || peek;
  return (
    <div className="fxblock">
      <span className="fxhead">
        <button className={`fxchip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggle(!on)}>{label}</button>
        {!on && children && (
          <button className="fxpeek" aria-label={`${peek ? "Hide" : "Show"} ${label} controls`} onClick={() => setPeek(!peek)}>
            <ChevronDown size={14} strokeWidth={2} style={{ transform: peek ? "rotate(180deg)" : undefined }} />
          </button>
        )}
      </span>
      {expanded && children && <div className={`fxsub${on ? "" : " dim"}`}>{children}</div>}
    </div>
  );
}

export function AngleDial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fromEvent = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    let a = Math.round((Math.atan2(-dy, dx) * 180) / Math.PI);
    if (a < 0) a += 360;
    onChange(a);
  };
  return (
    <div ref={ref} className="dial" role="slider" aria-label="Lighting angle" aria-valuenow={value} tabIndex={0}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); fromEvent(e); }}
      onPointerMove={(e) => { if (e.buttons) fromEvent(e); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange((value + 5) % 360);
        if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange((value + 355) % 360);
      }}>
      <span className="hand" style={{ transform: `rotate(${-value}deg)` }} />
    </div>
  );
}

/** Font dropdown with each family previewed in its own face. */
export function FontPicker({ value, customFonts, onPick }: { value: string; customFonts: string[]; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const names = [...GAME_FONTS.map((f) => f.name), ...customFonts];
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => { if (open) names.forEach(ensureFont); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="fontpick">
      <button className="fieldbox fontpick-btn" aria-label="Font" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(!open)}>
        <span className="fl">Font</span>
        <span className="fontpick-cur" style={{ fontFamily: `'${value}', Inter, sans-serif` }}>{value}</span>
        <span className="chev"><ChevronDown size={17} strokeWidth={2} /></span>
      </button>
      {open && (
        <div className="fontpick-pop" role="listbox" aria-label="Fonts">
          {names.map((n) => (
            <button key={n} role="option" aria-selected={n === value} className={n === value ? "on" : ""}
              onClick={() => { onPick(n); setOpen(false); }}>
              <span className="fp-name">{n}</span>
              <span className="fp-preview" style={{ fontFamily: `'${n}', Inter, sans-serif` }}>PLAY</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
