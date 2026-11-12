/**
 * Colour visuals shared by every screen. Swatch colours are runtime
 * measurements, passed as the --sw custom property (data, not chrome).
 */
import type { CSSProperties } from "react";
import { oklchToHex } from "@/analysis/color";
import type { Swatch } from "@/analysis/palette";
import type { GradingRange } from "@/analysis/photo";
import type { GroupSummary } from "@/analysis/group";
import { HexButton } from "./HexButton";

const sw = (hex: string, extra: Record<string, string | number> = {}) => ({ "--sw": hex, ...extra }) as CSSProperties;
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const hueName = (h: number) =>
  ([[30, "red"], [62, "orange"], [95, "gold"], [125, "olive"], [160, "green"], [215, "teal"], [270, "blue"], [310, "violet"], [350, "pink"], [361, "red"]] as [number, string][]).find(([l]) => h < l)![1];

export function Strip({ p, className = "strip" }: { p: Swatch[]; className?: string }) {
  if (!p.length) return <p className="note">No colourful pixels</p>;
  return (
    <div className={className} aria-hidden="true">
      {p.map((s, i) => <div key={i} className={`sw${s.neutral ? " sw-neutral" : ""}`} style={sw(s.hex, { flexGrow: Math.round(s.share * 1000) })} />)}
    </div>
  );
}

/** Role words instead of percentages: Main until half the colour, Supporting to 85%, then Accent. */
function roles(p: Swatch[]) {
  let cum = 0;
  return p.map((s) => { const r = cum < 0.5 ? "Main" : cum < 0.85 ? "Supporting" : "Accent"; cum += s.share; return r; });
}
export function PaletteCards({ p }: { p: Swatch[] }) {
  if (!p.length) return <p className="note">All greys: no colourful pixels.</p>;
  const max = Math.max(...p.map((s) => s.share));
  const rs = roles(p);
  return (
    <ol className="drawer">
      {p.map((s, i) => (
        <li key={s.hex + i} className="spec-card">
          <div className="spec-field" style={sw(s.hex)} />
          <div className="spec-cap">
            <span className="role">{rs[i]}</span>
            <HexButton hex={s.hex} />
            <span className="spec-hue">{hueName(s.h)}, <span className="num">{Math.round(s.h)}°</span></span>
            <span className="amount" role="img" aria-label={`${rs[i]} colour`}><span style={{ "--w": `${((s.share / max) * 100).toFixed(0)}%` } as CSSProperties} /></span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function smooth(v: number[]) {
  const k = [1, 2, 3, 2, 1];
  return v.map((_, i) => k.reduce((s, w, j) => s + w * (v[Math.min(v.length - 1, Math.max(0, i + j - 2))] ?? 0), 0) / 9);
}
function area(v: number[], max: number, W: number, H: number) {
  const step = W / (v.length - 1);
  return `M0,${H} L${v.map((x, i) => `${(i * step).toFixed(1)},${(H - Math.min(1, x / max) * (H - 2)).toFixed(1)}`).join(" L")} L${W},${H} Z`;
}

/** Lightroom-style RGB histogram: three channels blended so overlaps read grey. */
export function Histogram({ rgb, height = 96 }: { rgb: { r: number[]; g: number[]; b: number[] }; height?: number }) {
  const W = 300, H = height;
  const ch = [smooth(rgb.r), smooth(rgb.g), smooth(rgb.b)];
  const max = Math.max(...ch.flatMap((v) => v.slice(1, -1))) * 1.05 || 1;
  return (
    <svg className="histo" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="RGB histogram" style={{ height }}>
      <g className="histo-ch">{ch.map((v, i) => <path key={i} className={`h-${"rgb"[i]}`} d={area(v, max, W, H)} />)}</g>
      <path className="histo-grid" d={`M${W / 4},0V${H}M${W / 2},0V${H}M${(3 * W) / 4},0V${H}`} />
    </svg>
  );
}

const HUE_STOPS = Array.from({ length: 13 }, (_, i) => oklchToHex(0.72, 0.13, i * 30));
export function HueChart({ v, height = 52, id }: { v: number[]; height?: number; id: string }) {
  const W = 300, H = height, sm = smooth(v), max = Math.max(...sm, 1e-9);
  return (
    <svg className="huechart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Hue distribution" style={{ height }}>
      <defs><linearGradient id={id}>{HUE_STOPS.map((c, i) => <stop key={i} offset={`${(i / 12) * 100}%`} style={{ stopColor: c }} />)}</linearGradient></defs>
      <path d={area(sm, max, W, H)} fill={`url(#${id})`} />
    </svg>
  );
}

const RING = Array.from({ length: 36 }, (_, i) => oklchToHex(0.68, 0.11, i * 10 + 5));
/** Grading wheel. With `target`, draws both tints (ring = yours, dot = target) and the move between them. */
export function Wheel({ g, target, size = 72 }: { g: GradingRange; target?: GradingRange; size?: number }) {
  const r = size / 2, ring = r - 3, inner = ring - Math.max(5, size / 16);
  const p = (a: number, rr: number) => `${(r + rr * Math.cos(a)).toFixed(2)},${(r - rr * Math.sin(a)).toFixed(2)}`;
  const pos = (x: GradingRange) => { const d = Math.min(1, x.sat / 60) * (inner - 6), a = (x.hue * Math.PI) / 180; return [r + d * Math.cos(a), r - d * Math.sin(a)]; };
  const [x1, y1] = pos(g);
  const label = target ? `${g.range}: yours ${hueName(g.hue)}, target ${hueName(target.hue)}` : `${g.range}: ${hueName(g.hue)}, strength ${g.sat}`;
  return (
    <svg className="wheel" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
      {RING.map((c, i) => {
        const a0 = (i * 10 * Math.PI) / 180, a1 = ((i + 1) * 10 * Math.PI) / 180;
        return <path key={i} d={`M${p(a0, ring)} A${ring},${ring} 0 0 0 ${p(a1, ring)} L${p(a1, inner)} A${inner},${inner} 0 0 1 ${p(a0, inner)} Z`} style={{ fill: c }} />;
      })}
      <circle className="wheel-face" cx={r} cy={r} r={inner - 1} />
      {target ? (() => { const [x2, y2] = pos(target); return (<>
        <line className="w-move" x1={x1} y1={y1} x2={x2} y2={y2} />
        <circle className="w-you" cx={x1} cy={y1} r={5} />
        <circle className="w-fam" cx={x2} cy={y2} r={5} style={sw(target.wheelHex)} />
      </>); })() : <circle className="wheel-dot" cx={x1} cy={y1} r={5} style={sw(g.wheelHex)} />}
    </svg>
  );
}

export function Estimated() { return <span className="est">estimated</span>; }

/** The strip's colours as copyable hex codes (also what a screen reader gets). */
export function HexList({ p }: { p: Swatch[] }) {
  if (!p.length) return null;
  return <ul className="hex-list" aria-label="Hex codes">{p.map((s, i) => <li key={s.hex + i}><HexButton hex={s.hex} /></li>)}</ul>;
}

/** Sky/ground, histogram, hue, grading and glow for a set or a family. */
export function FullAnalysis({ s, idBase }: { s: GroupSummary; idBase: string }) {
  return (
    <div className="analysis">
      <section className="an an-sky">
        <h3>Sky, top half</h3><Strip p={s.topPalette} className="strip strip-band" /><HexList p={s.topPalette} />
        <h3>Ground, bottom half</h3><Strip p={s.bottomPalette} className="strip strip-band" /><HexList p={s.bottomPalette} />
      </section>
      <section className="an">
        <h3>Histogram</h3><Histogram rgb={s.rgbHist} />
        <h3>Hue</h3><HueChart v={s.hueHist} id={`${idBase}-hue`} />
      </section>
      <section className="an">
        <div className="h-row"><h3>Color grading</h3><Estimated /></div>
        <div className="wheels">{s.grading.map((g) => <figure key={g.range}><Wheel g={g} /><figcaption>{g.range}<span className="num">{Math.round(g.hue)}°, {g.sat}</span><HexButton hex={g.hex} /></figcaption></figure>)}</div>
        <div className="h-row"><h3>Glow</h3><Estimated /></div>
        {s.glow.score === null ? <p className="note">No highlights to measure.</p> : (<>
          <p className="glow"><span className="figure num">{s.glow.score}</span> of 100, {s.glow.label}</p>
          {s.glow.hex && <p className="glow-tint"><span className="chip" style={sw(s.glow.hex)} />Halo tint <HexButton hex={s.glow.hex} /></p>}
        </>)}
      </section>
    </div>
  );
}
