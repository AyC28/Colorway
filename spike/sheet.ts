/** Plain contact sheet for Gate 1 review. Functional, not the product design. */
import { oklchToHex } from "../src/analysis/color";
import type { Swatch } from "../src/analysis/palette";

/* eslint-disable @typescript-eslint/no-explicit-any */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pct = (x: number) => `${Math.round(x * 100)}%`;


function strip(p: Swatch[], h = 34) {
  if (!p.length) return `<div class="strip empty" style="height:${h}px">no chromatic pixels</div>`;
  return `<div class="strip" style="height:${h}px">${p
    .map((s) => `<div title="${s.hex} · ${pct(s.share)} · C ${s.c.toFixed(3)} · h ${Math.round(s.h)}°" style="flex:${s.share};background:${s.hex}"></div>`)
    .join("")}</div><div class="hexes">${p.map((s) => `<code>${s.hex}</code><small>${pct(s.share)}${s.neutral ? " · neutral" : ""}</small>`).join(" ")}</div>`;
}

/** Lightroom-style histogram: smoothed R, G, B areas blended with "screen" so overlaps read grey/yellow/cyan. */
let gid = 0;
function smooth(v: number[]) {
  const k = [1, 2, 3, 2, 1];
  return v.map((_, i) => k.reduce((s, w, j) => s + w * (v[Math.min(v.length - 1, Math.max(0, i + j - 2))] ?? 0), 0) / 9);
}
function areaPath(v: number[], max: number, W: number, H: number) {
  const step = W / (v.length - 1);
  const pts = v.map((x, i) => `${(i * step).toFixed(1)},${(H - Math.min(1, x / max) * (H - 2)).toFixed(1)}`);
  return `M0,${H} L${pts.join(" L")} L${W},${H} Z`;
}
function lrHist(rgb: { r: number[]; g: number[]; b: number[] }, W = 260, H = 64) {
  const ch = [smooth(rgb.r), smooth(rgb.g), smooth(rgb.b)];
  // scale to the tallest peak, ignoring the pure-black / pure-white end bins (they clip off the top like Lightroom)
  const max = Math.max(...ch.flatMap((v) => v.slice(1, -1))) * 1.05 || 1;
  // balanced so all three overlapping reads neutral grey, pairs read yellow / cyan / magenta
  const cols = ["#c42828", "#28c428", "#2848c4"];
  return `<svg class="lrhist" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#2b2b2b"/>
    <g style="isolation:isolate">${ch.map((v, i) => `<path d="${areaPath(v, max, W, H)}" fill="${cols[i]}" style="mix-blend-mode:screen"/>`).join("")}</g>
    <path d="M${W / 4},0V${H}M${W / 2},0V${H}M${(3 * W) / 4},0V${H}" stroke="#ffffff10"/></svg>`;
}
/** Compact hue distribution: smooth area filled with the hue spectrum. */
function hueChart(v: number[], W = 260, H = 44) {
  const sm = smooth(v);
  const max = Math.max(...sm, 1e-9);
  const id = `hg${gid++}`;
  const stops = Array.from({ length: 13 }, (_, i) => `<stop offset="${(i / 12) * 100}%" stop-color="${oklchToHex(0.72, 0.13, i * 30)}"/>`).join("");
  return `<svg class="lrhist" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="${id}">${stops}</linearGradient></defs>
    <rect width="${W}" height="${H}" fill="#2b2b2b"/><path d="${areaPath(sm, max, W, H)}" fill="url(#${id})"/></svg>`;
}

function grading(g: any[]) {
  return `<div class="grading">${g
    .map((r) => `<div><span class="chip" title="wheel" style="background:${r.wheelHex}"></span><b>${r.range}</b> ${Math.round(r.hue)}° · sat ${r.sat} <code>${r.hex}</code> <small>(${pct(r.presence)} of pixels)</small></div>`)
    .join("")}<small class="est">estimated</small></div>`;
}

function glow(g: any) {
  if (g.score === null) return `<div class="glow">Glow: <i>${g.label}</i></div>`;
  return `<div class="glow">Glow <b>${g.score}</b>/100 · ${g.label} ${g.hex ? `<span class="chip" style="background:${g.hex}"></span><code>${g.hex}</code>` : ""} <small class="est">estimated</small></div>`;
}

function panel(s: any) {
  return `<div class="panel">
    <div class="row"><div class="col"><h4>Palette <small>chromatic only · ${pct(s.neutralShare)} of pixels near-neutral</small></h4>${strip(s.palette, 44)}</div></div>
    <div class="row two"><div class="col"><h4>Top half</h4>${strip(s.topPalette, 24)}</div><div class="col"><h4>Bottom half</h4>${strip(s.bottomPalette, 24)}</div></div>
    <div class="row two"><div class="col"><h4>Histogram</h4>${lrHist(s.rgbHist)}</div><div class="col"><h4>Hue (chroma-weighted)</h4>${hueChart(s.hueHist)}</div></div>
    <div class="row two"><div class="col"><h4>Color grading</h4>${grading(s.grading)}</div><div class="col"><h4>Glow</h4>${glow(s.glow)}
      <p class="meta">L median ${s.tone.p50.toFixed(2)} · contrast (p95−p5) ${(s.tone.p95 - s.tone.p5).toFixed(2)} · cast a ${s.tone.meanA.toFixed(3)} b ${s.tone.meanB.toFixed(3)}</p></div></div>
  </div>`;
}

export function contactSheet(r: any): string {
  const photoByFile = new Map(r.photos.map((p: any) => [p.file, p]));
  const fams = r.families.list
    .map(
      (f: any) => `<section class="family"><h3>${esc(f.name)} <small>${f.members.length} photos · ${f.id}</small></h3>
      <div class="thumbs">${f.memberFiles.map((file: string) => `<img src="thumbs/${(photoByFile.get(file) as any).thumb}" title="${esc(file)}">`).join("")}</div>
      ${panel(f.summary)}</section>`,
    )
    .join("");

  const c = r.compare;
  const target = r.families.list.find((f: any) => f.id === c.family.id);
  const compare = `<section><h2>Compare: ${esc(c.file)} → <em>${esc(c.family.name)}</em></h2>
    <div class="cmp"><img src="thumbs/compare.jpg">
      <div><h4>This photo</h4>${strip(c.analysis.palette, 30)}<h4>Family target</h4>${strip(target.summary.palette, 30)}
      <h4>Family distances</h4><table>${c.matches.map((m: any) => `<tr><td>${esc(m.name)}</td><td>feat ${m.featureDist.toFixed(2)}</td><td>pal ${m.paletteDist.toFixed(3)}</td><td><b>${m.score.toFixed(2)}</b></td></tr>`).join("")}</table></div></div>
    <p class="note">${esc(c.headroomNote)}</p>
    <table class="sugg"><tr><th>Group</th><th>Control</th><th>Move</th><th>Why</th><th>Δ</th></tr>${c.suggestions
      .map((s: any) => `<tr><td>${s.group}</td><td>${esc(s.control)}</td><td><b>${s.sign}</b> ${s.band}</td><td>${esc(s.why)}</td><td><code>${s.delta.toFixed(3)}</code></td></tr>`)
      .join("")}</table></section>`;

  const each = r.photos
    .map(
      (p: any) => `<div class="photo"><img src="thumbs/${p.thumb}"><div>
      <div class="fname">${esc(p.file)} <small>${p.ms.toFixed(0)} ms</small></div>
      ${strip(p.photoPalette, 26)}
      <div class="row two"><div class="col">${strip(p.topPalette, 12)}</div><div class="col">${strip(p.bottomPalette, 12)}</div></div>
      <div class="hrow">${lrHist(p.rgbHist, 180, 46)}${hueChart(p.hueHist, 180, 46)}</div>
      <div class="mini">neutral ${pct(p.neutralShare)} · ${p.grading.map((g: any) => `<span class="chip" title="${g.range} ${g.hex}" style="background:${g.hex}"></span>`).join("")} · ${glow(p.glow)}</div>
      </div></div>`,
    )
    .join("");

  const t = r.timing;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Colorway spike: contact sheet</title><style>
  :root{color-scheme:dark}
  body{margin:0;padding:24px;background:#262626;color:#ddd;font:13px/1.45 -apple-system,system-ui,sans-serif}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:17px;margin:32px 0 10px;border-top:1px solid #444;padding-top:20px}
  h3{font-size:15px;margin:24px 0 8px} h4{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin:10px 0 4px;font-weight:600}
  small{color:#999} code{font:12px ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;color:#eee}
  .strip{display:flex;border-radius:3px;overflow:hidden} .strip.empty{background:#333;color:#777;font-size:11px;align-items:center;padding-left:6px}
  .hexes{margin-top:3px;display:flex;flex-wrap:wrap;gap:2px 10px} .hexes small{margin-left:3px}
  .hist{width:100%;display:block;background:#1e1e1e} .lrhist{display:block;border-radius:3px} .hrow{display:flex;gap:10px;margin-top:6px}
  .panel{background:#2e2e2e;padding:10px 14px;border-radius:6px} .row{display:flex;gap:18px}.row.two>.col{flex:1}.col{flex:1;min-width:0}
  .chip{display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle;margin:0 4px;border:1px solid #0006}
  .grading div{margin:2px 0} .est{color:#c9a46a;font-style:italic}
  .thumbs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}.thumbs img{height:84px;border-radius:2px}
  .photo{display:flex;gap:14px;padding:10px 0;border-bottom:1px solid #333}.photo>img{width:220px;height:auto;align-self:flex-start;border-radius:2px}.photo>div{flex:1;min-width:0}
  .fname{font-weight:600;margin-bottom:4px}.mini{margin-top:6px}.mini .glow{display:inline}
  .cmp{display:flex;gap:18px}.cmp>img{width:360px;align-self:flex-start}.cmp>div{flex:1}
  table{border-collapse:collapse}td,th{padding:3px 10px 3px 0;text-align:left;vertical-align:top}.sugg{margin-top:10px;width:100%}.sugg tr{border-bottom:1px solid #383838}
  .note{color:#c9a46a}.meta{color:#999;margin-top:8px}
  </style></head><body>
  <h1>Colorway: analysis spike</h1>
  <p class="meta">${t.photos} reference photos · analysis ${t.perPhotoAnalysisMsAvg.toFixed(0)} ms/photo (Node, 256 px) · set + families ${t.setAndFamiliesMs.toFixed(0)} ms ·
  projected 50 photos ≈ ${t.projected50AnalysisOnlyS.toFixed(1)} s analysis-only · chroma threshold ${r.config.chromaThreshold} · k=${r.config.paletteK} · fast-path err ${r.fastPathErr.toExponential(1)}</p>
  <p class="meta">Family k by silhouette: ${r.families.silhouettes.map((s: any) => `k${s.k} ${s.score.toFixed(3)}`).join(" · ")} → <b>${r.families.k}</b> families</p>
  <h2>Whole set</h2>${panel(r.set)}
  <h2>Families</h2>${fams}
  ${compare}
  <h2>Every photo</h2>${each}
  </body></html>`;
}
