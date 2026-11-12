/** Shared mockup helpers (charts, swatches, copy button, data-colour tokens). */
import { oklchToHex } from "../src/analysis/color";
export type Sw = { hex: string; share: number; h: number; c: number; neutral?: boolean };
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const hueName = (h: number) =>
  ([[30, "red"], [62, "orange"], [95, "gold"], [125, "olive"], [160, "green"], [215, "teal"], [270, "blue"], [310, "violet"], [350, "pink"], [361, "red"]] as [number, string][]).find(([l]) => h < l)![1];
// ---------------------------------------------------------------- data colours as tokens
/** Measured colours become :root tokens in data.css (Floor 1/48: no literal colour past a token block). */
export const dataTokens = new Map<string, string>();
export const tok = (hex: string) => {
  const k = hex.toLowerCase();
  if (!dataTokens.has(k)) dataTokens.set(k, `--data-${dataTokens.size + 1}`);
  return `var(${dataTokens.get(k)})`;
};

// ---------------------------------------------------------------- shared pieces
/** Swatch colours are measurements, so they are data, not chrome. */
export const swatchStyle = (s: Sw, grow = true) => `style="--sw:${tok(s.hex)};${grow ? `flex-grow:${(s.share * 1000).toFixed(0)}` : ""}"`;

export const hexButton = (hex: string, extra = "") =>
  `<button type="button" class="hex" data-copy="${hex}" aria-label="Copy ${hex}">${hex}${extra}</button>`;

/** A proportional strip; `labels` adds a legend of hex buttons and shares beneath it. */
export function strip(p: Sw[], cls = "strip", labels = false) {
  if (!p.length) return `<p class="strip-empty">No colourful pixels</p>`;
  const band = `<div class="${cls}">${p.map((s) => `<div class="sw${s.neutral ? " sw-neutral" : ""}" ${swatchStyle(s)}></div>`).join("")}</div>`;
  if (!labels) return band;
  return `${band}<ol class="legend">${p
    .map((s) => `<li><span class="chip" style="--sw:${tok(s.hex)}"></span>${hexButton(s.hex)}<span class="num">${pct(s.share)}</span></li>`)
    .join("")}</ol>`;
}

export function smooth(v: number[]) {
  const k = [1, 2, 3, 2, 1];
  return v.map((_, i) => k.reduce((s, w, j) => s + w * (v[Math.min(v.length - 1, Math.max(0, i + j - 2))] ?? 0), 0) / 9);
}
export function area(v: number[], max: number, W: number, H: number) {
  const step = W / (v.length - 1);
  return `M0,${H} L${v.map((x, i) => `${(i * step).toFixed(1)},${(H - Math.min(1, x / max) * (H - 2)).toFixed(1)}`).join(" L")} L${W},${H} Z`;
}
/** Lightroom-style RGB histogram; channel colours come from tokens (--hist-r/g/b). */
export function histogram(rgb: any, W = 300, H = 92) {
  const ch = [smooth(rgb.r), smooth(rgb.g), smooth(rgb.b)];
  const max = Math.max(...ch.flatMap((v) => v.slice(1, -1))) * 1.05 || 1;
  return `<svg class="histo" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="RGB histogram"><g class="histo-ch">${ch
    .map((v, i) => `<path class="h-${"rgb"[i]}" d="${area(v, max, W, H)}"/>`)
    .join("")}</g><path class="histo-grid" d="M${W / 4},0V${H}M${W / 2},0V${H}M${(3 * W) / 4},0V${H}"/></svg>`;
}
let gid = 0;
/** Hue distribution, chroma-weighted, filled with the hue spectrum (data colours). */
export function hueChart(v: number[], W = 300, H = 56) {
  const sm = smooth(v);
  const max = Math.max(...sm, 1e-9);
  const id = `hue${gid++}`;
  const stops = Array.from({ length: 13 }, (_, i) => `<stop offset="${(i / 12) * 100}%" style="stop-color:${tok(oklchToHex(0.72, 0.13, i * 30))}"/>`).join("");
  return `<svg class="huechart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Hue distribution"><defs><linearGradient id="${id}">${stops}</linearGradient></defs><path d="${area(sm, max, W, H)}" fill="url(#${id})"/></svg>`;
}
/** A grading wheel: hue ring (data colours), the estimated tint as a dot. */
export function wheel(g: any, size = 76) {
  const r = size / 2, ring = r - 3;
  const segs = Array.from({ length: 36 }, (_, i) => {
    const a0 = (i * 10 * Math.PI) / 180, a1 = ((i + 1) * 10 * Math.PI) / 180;
    const p = (a: number, rr: number) => `${(r + rr * Math.cos(a)).toFixed(2)},${(r - rr * Math.sin(a)).toFixed(2)}`;
    return `<path d="M${p(a0, ring)} A${ring},${ring} 0 0 0 ${p(a1, ring)} L${p(a1, ring - 5)} A${ring - 5},${ring - 5} 0 0 1 ${p(a0, ring - 5)} Z" style="fill:${tok(oklchToHex(0.68, 0.11, i * 10 + 5))}"/>`;
  }).join("");
  const dist = Math.min(1, g.sat / 50) * (ring - 9);
  const a = (g.hue * Math.PI) / 180;
  return `<svg class="wheel" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${g.range}: hue ${Math.round(g.hue)} degrees, saturation ${g.sat}">${segs}<circle class="wheel-face" cx="${r}" cy="${r}" r="${ring - 6}"/><circle class="wheel-dot" cx="${(r + dist * Math.cos(a)).toFixed(1)}" cy="${(r - dist * Math.sin(a)).toFixed(1)}" r="5" style="--sw:${tok(g.wheelHex)}"/></svg>`;
}
export const copyScript = `<script>
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); } catch {}
  b.dataset.state = "copied"; document.getElementById("live").textContent = b.dataset.copy + " copied";
  clearTimeout(b._t); b._t = setTimeout(() => { delete b.dataset.state; }, 1400);
});
</script>`;

export const dataCss = () => `/* Generated: measured colours as tokens. Data, not chrome. */\n:root {\n${[...dataTokens].map(([hex, name]) => `  ${name}: ${hex};`).join("\n")}\n}\n`;
