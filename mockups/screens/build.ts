/**
 * Phase 2 screens in the locked direction (B, Terrazzo): Compare, Edit guide, Grid, Home.
 * Every number comes from spike/out/results.json and spike/out/edit.json.
 * Usage: npx tsx mockups/screens/build.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { esc, pct, hueName, tok, strip, hexButton, histogram, copyScript, dataCss, type Sw } from "../lib";
import { linearToOklab, SRGB_TO_LINEAR, oklabToHex, oklchToHex as oklchToHexS, rng } from "../../src/analysis/color";
import { kmeansBest } from "../../src/analysis/kmeans";

/* eslint-disable @typescript-eslint/no-explicit-any */
const R: any = JSON.parse(readFileSync("spike/out/results.json", "utf8"));
const E: any = JSON.parse(readFileSync("spike/out/edit.json", "utf8"));
const DIR = "mockups/screens";
mkdirSync(`${DIR}/img`, { recursive: true });
const families: any[] = R.families.list;
const photos: any[] = R.photos;
const byFile = new Map(photos.map((p) => [p.file, p]));
const famPhotos = (f: any) => f.memberFiles.map((x: string) => byFile.get(x));
const fam = (id: string) => families.find((f) => f.id === id);
const img = (p: any, cls = "", alt = "", eager = false) =>
  `<img class="${cls}" src="../inspiration/assets/${p.thumb}" width="${p.width}" height="${p.height}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const est = `<span class="est">estimated</span>`;

const head = (title: string, desc: string, extra = "") => `<!doctype html><html lang="en"${extra}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${desc}"><link rel="stylesheet" href="./screens.css"></head>`;
const NAV = [["Inspiration", "../inspiration/terrazzo/index.html"], ["Compare", "./compare.html"], ["Edit guide", "./edit.html"], ["Grid", "./grid.html"]];
const bar = (current: string) => `<header class="bar container"><a class="wordmark" href="./home.html" aria-label="Colorway home">Colorway</a>
  <nav class="links" aria-label="Sections"><ul>${NAV.map(([n, h]) => `<li><a href="${h}"${n === current ? ' aria-current="page"' : ""}>${n}</a></li>`).join("")}</ul></nav>
  <a class="btn btn-primary" href="../inspiration/terrazzo/index.html">Add photos</a></header>`;
const tail = `<p id="live" class="vh" role="status" aria-live="polite"></p>${copyScript}</body></html>`;

/** Strength of a suggestion as a three-step meter plus its word. */
const BANDN: Record<string, number> = { slight: 1, moderate: 2, strong: 3 };
const meter = (band: string) => `<span class="meter" role="img" aria-label="${band}">${[1, 2, 3].map((i) => `<span${i <= BANDN[band] ? ' class="on"' : ""}></span>`).join("")}</span><span class="band">${band}</span>`;
const moveWord = (s: any) => {
  if (s.control === "Temp") return s.sign === "+" ? "Warmer" : "Cooler";
  if (s.control === "Tint") return s.sign === "+" ? "More magenta" : "Greener";
  if (s.group === "Color Grading") { const m = /≈(\d+)°/.exec(s.why); return m ? `Toward ${hueName(+m[1])}` : "Tint toward"; }
  if (s.group === "Effects") return s.sign === "−" ? "Soften" : "Crisp up";
  return s.sign === "+" ? "Raise" : "Lower";
};
/** The six that matter most: strongest first, at most two per panel group. */
function topSuggestions(all: any[], n = 6) {
  const sorted = [...all].sort((a, b) => BANDN[b.band] - BANDN[a.band]);
  const per = new Map<string, number>(), out: any[] = [];
  for (const s of sorted) { const c = per.get(s.group) ?? 0; if (c < 2 && out.length < n) { out.push(s); per.set(s.group, c + 1); } }
  return out;
}
const suggRow = (s: any) => `<tr><th scope="row">${esc(s.control)}<span class="grp">${s.group}</span></th><td class="move">${moveWord(s)}</td><td class="str">${meter(s.band)}</td><td class="why">${esc(s.why)}</td></tr>`;
const suggTable = (rows: any[]) => `<table class="sugg"><thead><tr><th scope="col">Control</th><th scope="col">Move</th><th scope="col">How much</th><th scope="col">Why</th></tr></thead><tbody>${rows.map(suggRow).join("")}</tbody></table>`;

/** Each photo colour beside the nearest family colour, with a plain-language difference. */
function colourPairs(photoPal: Sw[], famPal: Sw[]) {
  return photoPal.slice(0, 6).map((p: any) => {
    let best: any = famPal[0], bd = Infinity;
    for (const f of famPal as any[]) { const d = Math.hypot(p.l - f.l, p.a - f.a, p.b - f.b); if (d < bd) { bd = d; best = f; } }
    const de = Math.round(bd * 100);
    const word = de < 4 ? "Close" : de < 10 ? "Noticeable" : "Far";
    return `<tr><td><span class="pair"><span class="chip" style="--sw:${tok(p.hex)}"></span>${hexButton(p.hex)}</span><span class="sub">${hueName(p.h)}</span></td>
      <td><span class="pair"><span class="chip" style="--sw:${tok(best.hex)}"></span>${hexButton(best.hex)}</span><span class="sub">${hueName(best.h)}</span></td>
      <td><span class="diff diff-${word.toLowerCase()}">${word}</span><span class="sub num">ΔE ${de}</span></td></tr>`;
  }).join("");
}
const matchList = (matches: any[]) => {
  const best = matches[0].score;
  return `<ol class="matches">${matches.map((m, i) => `<li${i === 0 ? ' class="is-best"' : ""}><span class="m-name">${esc(m.name)}</span><span class="m-bar"><span style="--w:${Math.max(6, Math.round((best / m.score) * 100))}%"></span></span></li>`).join("")}</ol>`;
};

// ================================================================ Compare
async function compare() {
  await sharp("reference/comparison-photo.jpg").rotate().resize(1400).jpeg({ quality: 84 }).toFile(`${DIR}/img/compare.jpg`);
  const C = R.compare, f = fam(C.family.id);
  const runnerUp = C.matches[1], close = runnerUp.score / C.matches[0].score < 1.15;
  const top = topSuggestions(C.suggestions);
  const rest = C.suggestions.filter((s: any) => !top.includes(s));
  return `${head("Compare, Colorway", "Compare one photo with your closest colour family and see which way to move each slider.")}<body>
${bar("Compare")}
<main class="container">
  <div class="intro"><h1>Compare a photo</h1><a class="btn btn-secondary" href="#">Choose another photo</a></div>
  <div class="cmp-top">
    <figure class="cmp-photo"><img src="./img/compare.jpg" width="1400" height="933" alt="The photo being compared" fetchpriority="high">
      <figcaption>${esc(C.file)}</figcaption>${strip(C.analysis.photoPalette, "strip strip-band")}</figure>
    <aside class="card cmp-card" aria-labelledby="near-h">
      <h2 id="near-h" class="card-h">Closest family</h2>
      <p class="near-name">${esc(f.name)}</p>
      <ul class="sel-photos">${famPhotos(f).slice(0, 4).map((p: any) => `<li>${img(p, "sel-img")}</li>`).join("")}</ul>
      ${close ? `<p class="also">Also close to <a href="#">${esc(runnerUp.name)}</a>, almost as good a match.</p>` : ""}
      <h3>How close each family is</h3>${matchList(C.matches)}
    </aside>
  </div>
  <section aria-labelledby="col-h"><div class="sec-head"><h2 id="col-h">Your colours beside the family’s</h2><p class="note">Each of the photo’s main colours, paired with the nearest family colour.</p></div>
    <table class="pairs"><thead><tr><th scope="col">This photo</th><th scope="col">${esc(f.name)}</th><th scope="col">Difference</th></tr></thead><tbody>${colourPairs(C.analysis.palette, f.summary.palette)}</tbody></table></section>
  <section aria-labelledby="sug-h"><div class="sec-head"><h2 id="sug-h">Suggested moves</h2><p class="note">Directions, not exact values. ${esc(C.headroomNote.split(":")[0])}: big moves may band or clip.</p></div>
    ${suggTable(top)}
    <details class="more"><summary class="btn btn-secondary">Show all ${C.suggestions.length} suggestions</summary>${suggTable(rest)}</details></section>
</main>${tail}`;
}


// ---------------------------------------------------------------- visual colour guide (Edit guide)
/** A track with two markers: hollow = yours, filled = family; the lit span is the move. */
function track(label: string, stops: string[], yours: number, fam: number, yourTxt: string, famTxt: string) {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const a = clamp(yours), b = clamp(fam);
  const g = stops.map((h, i) => `--g${i + 1}:${tok(h)}`).join(";");
  return `<div class="trk"><span class="trk-l">${label}</span>
    <span class="trk-bar" style="${g}" role="img" aria-label="${label}: yours ${yourTxt}, family ${famTxt}">
      <span class="trk-span" style="--a:${Math.min(a, b)}%;--b:${Math.max(a, b)}%"></span>
      <span class="mk mk-you" style="--x:${a}%"></span><span class="mk mk-fam" style="--x:${b}%"></span></span>
    <span class="trk-v">${famTxt === yourTxt ? "Keep" : `${yourTxt} to ${famTxt}`}</span></div>`;
}
function hslRows(mine: any[], theirs: any[], famName: string) {
  return mine.map((m, i) => ({ m, t: theirs[i] })).filter(({ m, t }) => m.share > 0.05 && t.share > 0.01 && Number.isFinite(m.hue) && Number.isFinite(t.hue))
    .map(({ m, t }) => {
      let dh = t.hue - m.hue; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
      const hueStops = [-40, -20, 0, 20, 40].map((d) => oklchToHexS(0.7, 0.12, m.hue + d));
      const satStops = [0, 0.08, 0.16].map((c) => oklchToHexS(m.l, c, m.hue));
      const lumStops = [0.2, 0.55, 0.9].map((l) => oklchToHexS(l, m.c, m.hue));
      const you = oklchToHexS(m.l, m.c, m.hue), fam = oklchToHexS(t.l, t.c, t.hue);
      const word = (d: number, small: number, pos: string, neg: string) => (Math.abs(d) < small ? "Keep" : d > 0 ? pos : neg);
      return `<li class="hsl-row"><div class="hsl-name"><b>${m.name}</b><span class="sub">${Math.round(m.share * 100) > 50 ? "most of your colour" : "in your photo"}</span></div>
        <div class="hsl-chips"><span class="sw-pair"><span class="chip-lg" style="--sw:${tok(you)}"></span><span class="sub">Yours</span>${hexButton(you)}</span>
          <span class="sw-pair"><span class="chip-lg" style="--sw:${tok(fam)}"></span><span class="sub">${esc(famName)}</span>${hexButton(fam)}</span></div>
        <div class="hsl-trks">
          ${track("Hue", hueStops, 50, 50 + (dh / 40) * 50, `${Math.round(m.hue)}°`, `${Math.round(t.hue)}°`)}
          ${track("Saturation", satStops, (m.c / 0.16) * 100, (t.c / 0.16) * 100, word(t.c - m.c, 0.006, "", "") === "Keep" ? "same" : `${Math.round((m.c / 0.16) * 100)}`, word(t.c - m.c, 0.006, "", "") === "Keep" ? "same" : `${Math.round((t.c / 0.16) * 100)}`)}
          ${track("Luminance", lumStops, ((m.l - 0.2) / 0.7) * 100, ((t.l - 0.2) / 0.7) * 100, `${Math.round(m.l * 100)}`, `${Math.round(t.l * 100)}`)}
        </div></li>`;
    }).join("");
}
/** Grading wheel with both tints: hollow ring = yours, filled dot = family, a line for the move. */
function wheel2(mine: any, fam: any, size = 112) {
  const r = size / 2, ring = r - 4;
  const segs = Array.from({ length: 36 }, (_, i) => {
    const a0 = (i * 10 * Math.PI) / 180, a1 = ((i + 1) * 10 * Math.PI) / 180;
    const p = (a: number, rr: number) => `${(r + rr * Math.cos(a)).toFixed(2)},${(r - rr * Math.sin(a)).toFixed(2)}`;
    return `<path d="M${p(a0, ring)} A${ring},${ring} 0 0 0 ${p(a1, ring)} L${p(a1, ring - 7)} A${ring - 7},${ring - 7} 0 0 1 ${p(a0, ring - 7)} Z" style="fill:${tok(oklchToHexS(0.68, 0.11, i * 10 + 5))}"/>`;
  }).join("");
  const pos = (g: any) => { const d = Math.min(1, g.sat / 60) * (ring - 12), a = (g.hue * Math.PI) / 180; return [r + d * Math.cos(a), r - d * Math.sin(a)]; };
  const [x1, y1] = pos(mine), [x2, y2] = pos(fam);
  return `<svg class="wheel2" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${mine.range}: yours hue ${Math.round(mine.hue)} saturation ${mine.sat}, family hue ${Math.round(fam.hue)} saturation ${fam.sat}">${segs}
    <circle class="wheel-face" cx="${r}" cy="${r}" r="${ring - 8}"/><line class="w-move" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>
    <circle class="w-you" cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="6"/><circle class="w-fam" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="6" style="--sw:${tok(fam.wheelHex)}"/></svg>`;
}

// ================================================================ Edit guide
function sliderTrack(label: string, r: any, min: number, max: number, unit = "", fmt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}`) {
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return `<li class="slider"><span class="s-name">${label}</span>
    <span class="s-track" role="img" aria-label="${label} roughly ${fmt(r.lo)} to ${fmt(r.hi)}${unit}"><span class="s-zero" style="--x:${pos(0)}%"></span><span class="s-range" style="--a:${pos(r.lo)}%;--b:${pos(r.hi)}%"></span></span>
    <span class="s-val num">${fmt(r.lo)} to ${fmt(r.hi)}${unit}</span></li>`;
}
function edit() {
  const f = fam(E.family.id), r = E.fit.ranges;
  const ev = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
  const tempWord = r.temp.best > 0 ? "Warmer" : r.temp.best < 0 ? "Cooler" : "Leave";
  const tempBand = Math.abs(r.temp.best) < 0.2 ? "slight" : Math.abs(r.temp.best) < 0.5 ? "moderate" : "strong";
  const clipRisk = E.fit.clippedAfter > 0.005;
  const shutter = E.shutter < 1 ? `1/${Math.round(1 / E.shutter)}` : `${E.shutter}s`;
  return `${head("Edit guide, Colorway", "Slider ranges for a RAW file, fitted toward your closest colour family.")}<body>
${bar("Edit guide")}
<main class="container">
  <div class="intro"><div><h1>Edit guide</h1><p class="file">${esc(E.file)}</p></div>
    <dl class="facts facts-sm"><div><dt>Camera</dt><dd>${esc(E.camera)}</dd></div><div><dt>ISO</dt><dd class="num">${E.iso}</dd></div><div><dt>Shutter</dt><dd class="num">${shutter}</dd></div><div><dt>Aperture</dt><dd class="num">f/${E.aperture.toFixed(1)}</dd></div></dl></div>
  <div class="ed-grid">
    <section class="ed-left" aria-label="The RAW file">
      <figure class="cmp-photo"><img src="../assets-raw/edit-baseline.jpg" width="1400" height="935" alt="Neutral render of the RAW file" fetchpriority="high">
        <figcaption>Our neutral render: camera white balance, no tone curve. Expect it flatter than your camera’s JPEG.</figcaption></figure>
      <div class="readouts">
        <div class="ro"><h2 class="ro-h">Histogram</h2>${histogram(E.rgbHist, 300, 84)}</div>
        <dl class="ro-list">
          <div><dt>Clipped highlights</dt><dd><span class="num">${(E.clippedShare * 100).toFixed(2)}%</span> now, about <span class="num">${Math.round(E.fit.clippedAfter * 100)}%</span> after the exposure below</dd></div>
          <div><dt>Shadow room</dt><dd>About <span class="num">${E.cleanStops.toFixed(1)}</span> stops above the noise floor</dd></div>
          <div><dt>As-shot white balance</dt><dd>Red ×<span class="num">${E.asShot.rOverG.toFixed(2)}</span>, blue ×<span class="num">${E.asShot.bOverG.toFixed(2)}</span> (camera multipliers)</dd></div>
          <div><dt>Format</dt><dd>${E.craw ? "Compressed C-RAW" : "RAW"}, decoded on this device in <span class="num">${(E.decodeMs / 1000).toFixed(1)}</span>&nbsp;s</dd></div>
        </dl>
      </div>
    </section>
    <section class="card ed-card" aria-labelledby="sl-h">
      <div class="h-row"><h2 id="sl-h" class="card-h">Slider ranges toward ${esc(f.name)}</h2>${est}</div>
      <p class="note">Fitted with our own simple edit model, so these are starting ranges, not Lightroom’s exact numbers.</p>
      <ul class="sliders">
        ${sliderTrack("Exposure", r.exposure, -2, 2, " EV", ev)}
        ${sliderTrack("Contrast", r.contrast, -100, 100)}
        ${sliderTrack("Highlights", r.highlights, -100, 100)}
        ${sliderTrack("Shadows", r.shadows, -100, 100)}
        <li class="slider"><span class="s-name">Temp</span><span class="s-dir">${tempWord}</span><span class="s-val">${meter(tempBand)}</span></li>
      </ul>
      ${clipRisk ? `<p class="risk"><b>Clipping risk.</b> The suggested exposure pushes about ${Math.round(E.fit.clippedAfter * 100)}% of pixels to pure white. Pull Highlights down first if the sky matters.</p>` : ""}
    </section>
  </div>
  <section class="colour" aria-labelledby="col-h">
    <div class="sec-head"><h2 id="col-h">Colour, toward ${esc(f.name)}</h2><p class="note">The ring is your photo now, the dot is the family. Move each slider in Lightroom’s HSL panel the same way.</p></div>
    <div class="colour-grid">
      <div class="card"><div class="h-row"><h3 class="card-h">HSL by colour</h3>${est}</div><ol class="hsl-list">${hslRows(E.hsl, f.summary.hsl, f.name)}</ol></div>
      <div class="card"><div class="h-row"><h3 class="card-h">Color grading</h3>${est}</div>
        <div class="wheels2">${E.grading.map((g: any, i: number) => { const t = f.summary.grading[i]; return `<figure>${wheel2(g, t)}<figcaption><b>${g.range}</b><span class="sub">${hueName(g.hue)} to ${hueName(t.hue)}, ${t.sat > g.sat + 5 ? "stronger" : t.sat < g.sat - 5 ? "softer" : "same strength"}</span></figcaption></figure>`; }).join("")}</div>
        <p class="legend-key"><span class="key-you"></span>Your photo <span class="key-fam"></span>${esc(f.name)}</p></div>
    </div>
  </section>
</main>${tail}`;
}

// ================================================================ Grid
/** Greedy smooth colour-flow order over each photo's mean OKLab, starting from the brightest. */
function flowOrder() {
  const v = photos.map((p) => [p.tone.meanL, p.tone.meanA * 3, p.tone.meanB * 3]);
  const left = new Set(photos.map((_, i) => i));
  let cur = v.reduce((bi, x, i) => (x[0] > v[bi][0] ? i : bi), 0);
  const out = [cur]; left.delete(cur);
  while (left.size) {
    let bi = -1, bd = Infinity;
    for (const i of left) { const d = Math.hypot(v[i][0] - v[cur][0], v[i][1] - v[cur][1], v[i][2] - v[cur][2]); if (d < bd) { bd = d; bi = i; } }
    out.push(bi); left.delete(bi); cur = bi;
  }
  return out.map((i) => photos[i]);
}
const GRID_ICON = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M2 2h16v16H2zM7.33 2v16M12.67 2v16M2 7.33h16M2 12.67h16" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
const SAVED_ICON = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 2.5h10v15l-5-4-5 4z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
function device(kind: "phone" | "tablet", order: any[]) {
  const n = kind === "phone" ? 18 : 24;
  return `<figure class="device device-${kind}"><div class="screen">
    <div class="profile"><span class="avatar">${img(order[0], "av-img", "", kind === "phone")}</span>
      <div class="p-meta"><p class="p-name">Your profile</p><p class="p-count"><b class="num">${photos.length}</b> posts</p></div></div>
    <div class="p-tabs"><span class="is-on" aria-label="Posts">${GRID_ICON}</span><span aria-label="Saved">${SAVED_ICON}</span></div>
    <ol class="tiles">${order.slice(0, n).map((p, i) => `<li draggable="true">${img(p, "tile-img")}<span class="flow" style="--sw:${tok(p.photoPalette[0].hex)}"></span>${i === 0 ? "" : ""}</li>`).join("")}</ol>
  </div><figcaption>${kind === "phone" ? "iPhone, 402 × 874" : "iPad, 820 × 1180"}</figcaption></figure>`;
}
function grid() {
  const order = flowOrder();
  // biggest colour jumps between neighbours in the 3-wide grid (left-right pairs)
  const v = (p: any) => [p.tone.meanL, p.tone.meanA, p.tone.meanB];
  const jumps = order.slice(0, 18).map((p, i, a) => (i % 3 === 2 || !a[i + 1] ? null : { i, d: Math.hypot(...v(p).map((x, k) => x - v(a[i + 1])[k])) * 100 }))
    .filter(Boolean).sort((x: any, y: any) => y.d - x.d).slice(0, 3) as any[];
  return `${head("Grid, Colorway", "Preview your profile grid with 3:4 tiles, in light and dark, on a phone.", ' data-theme="light"')}<body>
${bar("Grid")}
<main class="container">
  <div class="intro"><h1>Grid preview</h1><p class="note">3:4 tiles, centre-cropped from each photo. Drag a tile to reorder.</p></div>
  <div class="grid-tools">
    <fieldset class="seg"><legend>Theme</legend><button type="button" class="seg-b" aria-pressed="true" data-set-theme="light">Light</button><button type="button" class="seg-b" aria-pressed="false" data-set-theme="dark">Dark</button></fieldset>
    <fieldset class="seg"><legend>Order</legend><button type="button" class="seg-b" aria-pressed="false">As added</button><button type="button" class="seg-b" aria-pressed="false">By family</button><button type="button" class="seg-b" aria-pressed="true">Smooth colour flow</button></fieldset>
    <label class="check"><input type="checkbox" checked> Show colour flow</label>
  </div>
  <div class="devices">${device("phone", order)}
    <aside class="card flow-card" aria-labelledby="fl-h"><h2 id="fl-h" class="card-h">Colour flow</h2>
      <p class="note">The strip under each tile is its main colour. Biggest jumps between neighbours:</p>
      <ol class="jumps">${jumps.map((j) => `<li><span class="pair">${img(order[j.i], "j-img")}${img(order[j.i + 1], "j-img")}</span><span>Row <b class="num">${Math.floor(j.i / 3) + 1}</b>, tiles <b class="num">${(j.i % 3) + 1}</b> and <b class="num">${(j.i % 3) + 2}</b></span><span class="sub num">ΔE ${Math.round(j.d)}</span></li>`).join("")}</ol>
    </aside></div>
</main>
<script>document.querySelectorAll("[data-set-theme]").forEach((b) => b.addEventListener("click", () => { document.documentElement.dataset.theme = b.dataset.setTheme; document.querySelectorAll("[data-set-theme]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));</script>
${tail}`;
}

// ================================================================ Home
/** A static render of one photo's pixels in OKLab (the 3D hero's fallback), plus its clusters. */
async function cloud() {
  const src = photos[0];
  const { data, info } = await sharp(`reference/${src.file}`).resize(256, 256, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const rand = rng(5), N = 2600, pts: { l: number; a: number; b: number; hex: string }[] = [];
  const lab = new Float32Array(3);
  for (let j = 0; j < N; j++) {
    const i = Math.floor(rand() * info.width * info.height) * info.channels;
    linearToOklab(SRGB_TO_LINEAR[data[i]], SRGB_TO_LINEAR[data[i + 1]], SRGB_TO_LINEAR[data[i + 2]], lab);
    pts.push({ l: lab[0], a: lab[1], b: lab[2], hex: `#${[data[i], data[i + 1], data[i + 2]].map((x) => x.toString(16).padStart(2, "0")).join("")}` });
  }
  const yaw = 0.7, pitch = 0.35, S = 1300, W = 900, H = 760, CH = 3.2; // chroma axes stretched so hue spread reads
  const proj = (p: { l: number; a: number; b: number }) => {
    const x = (p.a * Math.cos(yaw) - p.b * Math.sin(yaw)) * CH, z = (p.a * Math.sin(yaw) + p.b * Math.cos(yaw)) * CH;
    const y = (p.l - 0.5) * 0.48;
    return { x: W / 2 + x * S, y: H / 2 - (y * Math.cos(pitch) - z * Math.sin(pitch)) * S, depth: z };
  };
  const axis = (a: any, b: any) => { const p = proj(a), q = proj(b); return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="#6b6b6b" stroke-width="1.5"/>`; };
  const svg = (dots: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${axis({ l: 0, a: 0, b: 0 }, { l: 1, a: 0, b: 0 })}${axis({ l: 0.5, a: -0.12, b: 0 }, { l: 0.5, a: 0.12, b: 0 })}${axis({ l: 0.5, a: 0, b: -0.12 }, { l: 0.5, a: 0, b: 0.12 })}${dots}</svg>`;
  const sorted = [...pts].sort((p, q) => proj(q).depth - proj(p).depth);
  await sharp(Buffer.from(svg(sorted.map((p) => { const o = proj(p); return `<circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="3.4" fill="${p.hex}"/>`; }).join("")))).png().toFile(`${DIR}/img/cloud.png`);
  // the same points pulled to their cluster colours: the scroll step where the cloud becomes the palette
  const flat = new Float32Array(pts.flatMap((p) => [p.l, p.a, p.b]));
  const km = kmeansBest(flat, null, 3, 6, 4, 3);
  const cHex = Array.from({ length: km.k }, (_, c) => oklabToHex(km.centroids[c * 3], km.centroids[c * 3 + 1], km.centroids[c * 3 + 2]));
  await sharp(Buffer.from(svg(sorted.map((p) => { const o = proj(p); const c = km.labels[pts.indexOf(p)]; return `<circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="3.4" fill="${cHex[c]}"/>`; }).join("")))).png().toFile(`${DIR}/img/cloud-clusters.png`);
  await sharp(`reference/${src.file}`).resize(900).jpeg({ quality: 84 }).toFile(`${DIR}/img/home-photo.jpg`);
  return src;
}
async function home() {
  const src = await cloud();
  const pal: Sw[] = src.palette;
  return `${head("Colorway: the colour in your photos", "Colorway reads the colour in the photos you love and helps you edit toward a look that is yours.")}<body class="home">
<header class="bar container"><a class="wordmark" href="./home.html" aria-label="Colorway home">Colorway</a>
  <nav class="links" aria-label="Sections"><ul><li><a href="#how">How it works</a></li><li><a href="../inspiration/terrazzo/index.html">Open the studio</a></li></ul></nav>
  <a class="btn btn-secondary" href="#">Sign in</a></header>
<main>
  <section class="hero container" aria-labelledby="hero-h">
    <div class="hero-text"><h1 id="hero-h">See the colour in your photos</h1>
      <p class="lead">Colorway reads the photos you love and shows the palette behind them.</p>
      <div class="actions"><a class="btn btn-primary btn-lg" href="../inspiration/terrazzo/index.html">Try the starter set</a><a class="btn btn-secondary btn-lg" href="#">Upload your photos</a></div>
      <p class="privacy">Analysed in your browser. Your originals never leave your device.</p></div>
    <figure class="hero-cloud"><img src="./img/cloud.png" width="900" height="760" alt="Thousands of dots, each one a pixel of a sunset photo, placed by lightness and hue" fetchpriority="high">
      <figcaption><img class="cap-img" src="./img/home-photo.jpg" width="900" height="640" alt="">Every pixel of this photo, placed by colour. Drag to turn it.</figcaption></figure>
  </section>
  <section id="how" class="how container" aria-labelledby="how-h">
    <h2 id="how-h">From a cloud of pixels to a palette</h2>
    <ol class="steps">
      <li><img src="./img/home-photo.jpg" width="900" height="640" alt="A sunset over islands"><p><b>Your photo.</b> Shrunk to 256 pixels and read on your device.</p></li>
      <li><img src="./img/cloud-clusters.png" width="900" height="760" alt="The pixel cloud grouped into six colour clusters"><p><b>Grouped by colour.</b> Similar pixels pull together; greys sit apart.</p></li>
      <li><ol class="mini-pal">${pal.slice(0, 5).map((s) => `<li><span class="mp-sw" style="--sw:${tok(s.hex)}"></span>${hexButton(s.hex)}</li>`).join("")}</ol><p><b>Your palette.</b> Largest first, each with a hex code to copy.</p></li>
    </ol>
  </section>
</main>${tail}`;
}

const pages: Record<string, string> = { compare: await compare(), edit: edit(), grid: grid(), home: await home() };
for (const [k, html] of Object.entries(pages)) writeFileSync(`${DIR}/${k}.html`, html);
writeFileSync(`${DIR}/data.css`, dataCss());
console.log("built", Object.keys(pages).join(", "));
