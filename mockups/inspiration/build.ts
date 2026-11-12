/**
 * Phase 2 mockups: builds the Inspiration results screen in three directions
 * from the real Phase 1 output (spike/out/results.json). No invented numbers.
 * Usage: npx tsx mockups/inspiration/build.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { oklchToHex } from "../../src/analysis/color";

/* eslint-disable @typescript-eslint/no-explicit-any */
const R: any = JSON.parse(readFileSync("spike/out/results.json", "utf8"));
const DIR = "mockups/inspiration";

// ---------------------------------------------------------------- data
type Sw = { hex: string; share: number; h: number; c: number; neutral?: boolean };
const set = R.set;
const families: any[] = R.families.list;
const photos: any[] = R.photos;
const byFile = new Map(photos.map((p) => [p.file, p]));
const famPhotos = (f: any) => f.memberFiles.map((x: string) => byFile.get(x));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const hueName = (h: number) =>
  ([[30, "red"], [62, "orange"], [95, "gold"], [125, "olive"], [160, "green"], [215, "teal"], [270, "blue"], [310, "violet"], [350, "pink"], [361, "red"]] as [number, string][]).find(([l]) => h < l)![1];
const img = (p: any, cls = "", alt = "") =>
  `<img class="${cls}" src="../assets/${p.thumb}" width="${p.width}" height="${p.height}" alt="${esc(alt)}" loading="lazy" decoding="async">`;

// ---------------------------------------------------------------- data colours as tokens
/** Measured colours become :root tokens in data.css (Floor 1/48: no literal colour past a token block). */
const dataTokens = new Map<string, string>();
const tok = (hex: string) => {
  const k = hex.toLowerCase();
  if (!dataTokens.has(k)) dataTokens.set(k, `--data-${dataTokens.size + 1}`);
  return `var(${dataTokens.get(k)})`;
};

// ---------------------------------------------------------------- shared pieces
/** Swatch colours are measurements, so they are data, not chrome. */
const swatchStyle = (s: Sw, grow = true) => `style="--sw:${tok(s.hex)};${grow ? `flex-grow:${(s.share * 1000).toFixed(0)}` : ""}"`;

export const hexButton = (hex: string, extra = "") =>
  `<button type="button" class="hex" data-copy="${hex}" aria-label="Copy ${hex}">${hex}${extra}</button>`;

/** A proportional strip; `labels` adds a legend of hex buttons and shares beneath it. */
function strip(p: Sw[], cls = "strip", labels = false) {
  if (!p.length) return `<p class="strip-empty">No colourful pixels</p>`;
  const band = `<div class="${cls}">${p.map((s) => `<div class="sw${s.neutral ? " sw-neutral" : ""}" ${swatchStyle(s)}></div>`).join("")}</div>`;
  if (!labels) return band;
  return `${band}<ol class="legend">${p
    .map((s) => `<li><span class="chip" style="--sw:${tok(s.hex)}"></span>${hexButton(s.hex)}<span class="num">${pct(s.share)}</span></li>`)
    .join("")}</ol>`;
}

function smooth(v: number[]) {
  const k = [1, 2, 3, 2, 1];
  return v.map((_, i) => k.reduce((s, w, j) => s + w * (v[Math.min(v.length - 1, Math.max(0, i + j - 2))] ?? 0), 0) / 9);
}
function area(v: number[], max: number, W: number, H: number) {
  const step = W / (v.length - 1);
  return `M0,${H} L${v.map((x, i) => `${(i * step).toFixed(1)},${(H - Math.min(1, x / max) * (H - 2)).toFixed(1)}`).join(" L")} L${W},${H} Z`;
}
/** Lightroom-style RGB histogram; channel colours come from tokens (--hist-r/g/b). */
function histogram(rgb: any, W = 300, H = 92) {
  const ch = [smooth(rgb.r), smooth(rgb.g), smooth(rgb.b)];
  const max = Math.max(...ch.flatMap((v) => v.slice(1, -1))) * 1.05 || 1;
  return `<svg class="histo" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="RGB histogram"><g class="histo-ch">${ch
    .map((v, i) => `<path class="h-${"rgb"[i]}" d="${area(v, max, W, H)}"/>`)
    .join("")}</g><path class="histo-grid" d="M${W / 4},0V${H}M${W / 2},0V${H}M${(3 * W) / 4},0V${H}"/></svg>`;
}
let gid = 0;
/** Hue distribution, chroma-weighted, filled with the hue spectrum (data colours). */
function hueChart(v: number[], W = 300, H = 56) {
  const sm = smooth(v);
  const max = Math.max(...sm, 1e-9);
  const id = `hue${gid++}`;
  const stops = Array.from({ length: 13 }, (_, i) => `<stop offset="${(i / 12) * 100}%" style="stop-color:${tok(oklchToHex(0.72, 0.13, i * 30))}"/>`).join("");
  return `<svg class="huechart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Hue distribution"><defs><linearGradient id="${id}">${stops}</linearGradient></defs><path d="${area(sm, max, W, H)}" fill="url(#${id})"/></svg>`;
}
/** A grading wheel: hue ring (data colours), the estimated tint as a dot. */
function wheel(g: any, size = 76) {
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
const copyScript = `<script>
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); } catch {}
  b.dataset.state = "copied"; document.getElementById("live").textContent = b.dataset.copy + " copied";
  clearTimeout(b._t); b._t = setTimeout(() => { delete b.dataset.state; }, 1400);
});
</script>`;
const head = (title: string, css: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="Colorway Inspiration results: the colour of your reference photos, measured on your device.">
<link rel="stylesheet" href="./${css}"></head>`;
const NAV = ["Inspiration", "Compare", "Edit guide", "Grid"];
const nav = (cls: string) => `<nav class="${cls}" aria-label="Sections"><ul>${NAV.map((n, i) => `<li><a href="#" ${i === 0 ? 'aria-current="page"' : ""}>${n}</a></li>`).join("")}</ul></nav>`;
const est = `<span class="est">estimated</span>`;
const neutralNote = `Neutral greys are left out of palettes: ${pct(set.neutralShare)} of all pixels are near-neutral.`;

// ================================================================ A · Darkroom: a develop panel
function darkroom() {
  const famRow = (f: any, i: number) => `<li><button type="button" class="fam${i === 0 ? " is-current" : ""}" ${i === 0 ? 'aria-current="true"' : ""}>
    <span class="fam-name">${esc(f.name)}</span><span class="fam-count num">${f.members.length}</span>
    ${strip(f.summary.palette.slice(0, 6), "strip strip-micro")}</button></li>`;
  const panel = (title: string, body: string, note = "") => `<section class="panel"><div class="panel-top"><h2 class="panel-h">${title}</h2>${note}</div>${body}</section>`;
  const tile = (p: any) => `<li class="tile">${img(p, "tile-img")}${strip(p.photoPalette, "strip strip-tile")}</li>`;
  return `${head("Colorway inspiration", "page.css")}<body>
<header class="bar"><a class="wordmark" href="#" aria-label="Colorway home">Colorway</a>${nav("tabs")}
  <p class="bar-status">Saved on this device</p><a class="bar-link" href="#">Sign in</a></header>
<div class="work">
  <aside class="rail" aria-label="Families">
    <h2 class="rail-h">Families</h2>
    <ul class="fam-list"><li><button type="button" class="fam is-all" aria-current="true"><span class="fam-name">Whole set</span><span class="fam-count num">${set.count}</span>${strip(set.palette.slice(0, 6), "strip strip-micro")}</button></li>
    ${families.map((f, i) => famRow(f, i + 1)).join("")}</ul>
    <p class="rail-hint">Drag a photo onto a family to move it. Rename a family by double-clicking its name.</p>
  </aside>
  <main class="stage">
    <div class="stage-head"><h1>Whole set</h1><p class="stage-sub"><span class="num">${set.count}</span> reference photos in <span class="num">${families.length}</span> families</p>
      <button type="button" class="btn btn-primary">Add photos</button></div>
    <section aria-labelledby="pal-h"><h2 id="pal-h" class="vh">Palette</h2>${strip(set.palette, "strip strip-proof", true)}
      <p class="note">${neutralNote}</p></section>
    <section class="split" aria-label="Sky and ground">
      <div><div class="sub-top"><h2 class="sub-h">Sky</h2><p class="muted">top half</p></div>${strip(set.topPalette, "strip strip-band", true)}</div>
      <div><div class="sub-top"><h2 class="sub-h">Ground</h2><p class="muted">bottom half</p></div>${strip(set.bottomPalette, "strip strip-band", true)}</div>
    </section>
    <section aria-labelledby="ph-h"><h2 id="ph-h" class="sub-h">Photos</h2><ul class="sheet">${photos.map(tile).join("")}</ul></section>
  </main>
  <aside class="panels" aria-label="Measurements">
    ${panel("Histogram", histogram(set.rgbHist))}
    ${panel("Hue", hueChart(set.hueHist) + `<p class="axis"><span>red</span><span>gold</span><span>green</span><span>blue</span><span>pink</span></p>`)}
    ${panel("Color grading", `<div class="wheels">${set.grading.map((g: any) => `<figure>${wheel(g)}<figcaption>${g.range}<span class="num">${Math.round(g.hue)}°, ${g.sat}</span>${hexButton(g.hex)}</figcaption></figure>`).join("")}</div>`, est)}
    ${panel("Glow", `<p class="glow"><span class="figure">${set.glow.score}</span><span class="glow-of">of 100, ${set.glow.label}</span></p><p class="glow-tint"><span class="chip" style="--sw:${tok(set.glow.hex)}"></span>Halo tint ${hexButton(set.glow.hex)}</p>`, est)}
    ${panel("Neutral share", `<p class="glow"><span class="figure">${pct(set.neutralShare)}</span><span class="glow-of">of pixels near-neutral</span></p>`)}
  </aside>
</div>
<p id="live" class="vh" role="status" aria-live="polite"></p>${copyScript}</body></html>`;
}

// ================================================================ B · Terrazzo: a specimen sheet
function terrazzo() {
  const sel = families[0];
  const card = (s: Sw) => `<li class="spec-card"><div class="spec-field" style="--sw:${tok(s.hex)}"></div>
    <div class="spec-cap">${hexButton(s.hex)}<span class="num">${pct(s.share)}</span><span class="spec-hue">${hueName(s.h)}, <span class="num">${Math.round(s.h)}°</span></span></div></li>`;
  const row = (f: any, i: number) => `<tr${i === 0 ? ' class="is-selected" aria-selected="true"' : ""}>
    <th scope="row"><a href="#family">${esc(f.name)}</a></th><td class="num">${f.members.length}</td>
    <td>${strip(f.summary.palette, "strip strip-row")}</td>
    <td>${strip(f.summary.topPalette.slice(0, 5), "strip strip-mini")}${strip(f.summary.bottomPalette.slice(0, 5), "strip strip-mini")}</td>
    <td class="num">${Math.round(f.summary.tone.p50 * 100)}</td><td class="num">${f.summary.glow.score ?? "–"}</td></tr>`;
  const ph = (p: any) => `<li class="ph-card">${img(p, "ph-img")}${strip(p.photoPalette, "strip strip-ph")}
    <p class="ph-hex">${p.photoPalette.slice(0, 3).map((s: Sw) => hexButton(s.hex)).join("")}</p></li>`;
  return `${head("Colorway inspiration", "page.css")}<body>
<header class="bar container"><a class="wordmark" href="#" aria-label="Colorway home">Colorway</a>${nav("links")}<a class="btn btn-primary" href="#">Add photos</a></header>
<main class="container">
  <div class="intro"><h1>Your reference look</h1>
    <dl class="facts"><div><dt>Photos</dt><dd class="num">${set.count}</dd></div><div><dt>Families</dt><dd class="num">${families.length}</dd></div><div><dt>Near-neutral</dt><dd class="num">${pct(set.neutralShare)}</dd></div></dl></div>
  <section aria-labelledby="drawer-h"><h2 id="drawer-h">The palette, by share</h2><p class="note">${neutralNote}</p>
    <ol class="drawer">${set.palette.map(card).join("")}</ol></section>
  <div class="two">
    <section aria-labelledby="fam-h"><h2 id="fam-h">Families</h2>
      <table class="spec"><thead><tr><th scope="col">Family</th><th scope="col">Photos</th><th scope="col">Palette</th><th scope="col">Sky, ground</th><th scope="col">Brightness</th><th scope="col">Glow</th></tr></thead>
      <tbody>${families.map(row).join("")}</tbody></table>
      <p class="note">Brightness is the median lightness, 0 to 100. Families are grouped by hue and brightness only.</p></section>
    <section id="family" class="card" aria-labelledby="sel-h"><h2 id="sel-h">${esc(sel.name)}</h2>
      <ul class="sel-photos">${famPhotos(sel).map((p: any) => `<li>${img(p, "sel-img")}</li>`).join("")}</ul>
      <h3>Histogram</h3>${histogram(sel.summary.rgbHist, 300, 80)}
      <h3>Hue</h3>${hueChart(sel.summary.hueHist, 300, 48)}
      <div class="h-row"><h3>Color grading</h3>${est}</div><div class="wheels">${sel.summary.grading.map((g: any) => `<figure>${wheel(g, 64)}<figcaption>${g.range}<span class="num">${Math.round(g.hue)}°, ${g.sat}</span></figcaption></figure>`).join("")}</div>
      <div class="h-row"><h3>Glow</h3>${est}</div><p class="glow"><span class="figure num">${sel.summary.glow.score}</span> of 100, ${sel.summary.glow.label} ${hexButton(sel.summary.glow.hex)}</p>
    </section>
  </div>
  <section aria-labelledby="every-h"><h2 id="every-h">Every photo</h2><ul class="ph-grid">${photos.map(ph).join("")}</ul></section>
</main>
<p id="live" class="vh" role="status" aria-live="polite"></p>${copyScript}</body></html>`;
}

// ================================================================ C · Wayfind: a horizon board
function wayfind() {
  const sel = families[0];
  const horizon = (s: any, cls = "horizon") => `<div class="${cls}" aria-hidden="true">${strip(s.topPalette, "strip strip-sky")}${strip(s.bottomPalette, "strip strip-ground")}</div>`;
  const row = (name: string, n: number, s: any, i: number) => `<tr${i === 0 ? ' class="is-selected" aria-selected="true"' : ""}>
    <th scope="row"><a href="#detail">${esc(name)}</a><span class="row-n num">${n} photos</span></th>
    <td>${horizon(s)}</td><td class="num big">${Math.round(s.tone.p50 * 100)}</td><td class="num big">${s.glow.score ?? "–"}</td><td>${hueChart(s.hueHist, 160, 40)}</td></tr>`;
  return `${head("Colorway inspiration", "page.css")}<body>
<header class="bar"><div class="container bar-in"><a class="wordmark" href="#" aria-label="Colorway home">Colorway</a>${nav("cells")}<a class="btn btn-primary" href="#">Add photos</a></div></header>
<main class="container">
  <div class="intro"><h1>Your reference look</h1><p class="lead">${set.count} photos, sorted into ${families.length} families by hue and brightness. Each band shows the sky above the ground.</p></div>
  <table class="board"><thead><tr><th scope="col">Family</th><th scope="col">Sky over ground</th><th scope="col">Brightness</th><th scope="col">Glow</th><th scope="col">Hue</th></tr></thead>
  <tbody>${families.map((f, i) => row(f.name, f.members.length, f.summary, i)).join("")}${row("Whole set", set.count, set, 99)}</tbody></table>
  <section id="detail" class="detail" aria-labelledby="det-h">
    <div class="detail-head"><h2 id="det-h">${esc(sel.name)}</h2><p class="row-n"><span class="num">${sel.members.length}</span> photos</p></div>
    <ul class="det-photos">${famPhotos(sel).map((p: any) => `<li>${img(p, "det-img")}${strip(p.photoPalette, "strip strip-ph")}</li>`).join("")}</ul>
    <div class="plates">
      <section class="plate plate-wide"><h3>Palette</h3><ol class="pal-list">${sel.summary.palette.map((s: Sw) => `<li><span class="chip" style="--sw:${tok(s.hex)}"></span>${hexButton(s.hex)}<span class="num">${pct(s.share)}</span></li>`).join("")}</ol></section>
      <section class="plate"><h3>Histogram</h3>${histogram(sel.summary.rgbHist, 300, 84)}</section>
      <section class="plate"><div class="h-row"><h3>Color grading</h3>${est}</div><div class="wheels">${sel.summary.grading.map((g: any) => `<figure>${wheel(g, 64)}<figcaption>${g.range}<span class="num">${Math.round(g.hue)}°/${g.sat}</span></figcaption></figure>`).join("")}</div></section>
      <section class="plate"><div class="h-row"><h3>Glow</h3>${est}</div><p class="figure num">${sel.summary.glow.score}</p><p>${sel.summary.glow.label}, halo ${hexButton(sel.summary.glow.hex)}</p></section>
    </div>
    <p class="note">${neutralNote}</p>
  </section>
</main>
<p id="live" class="vh" role="status" aria-live="polite"></p>${copyScript}</body></html>`;
}

const pages = { darkroom: darkroom(), terrazzo: terrazzo(), wayfind: wayfind() };
for (const [k, html] of Object.entries(pages)) writeFileSync(`${DIR}/${k}/index.html`, html);
writeFileSync(
  `${DIR}/data.css`,
  `/* Generated by build.ts: measured colours from spike/out/results.json, as tokens. Data, not chrome. */\n:root {\n${[...dataTokens].map(([hex, name]) => `  ${name}: ${hex};`).join("\n")}\n}\n`,
);
console.log("built 3 directions");
