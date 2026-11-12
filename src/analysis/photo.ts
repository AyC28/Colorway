/**
 * Per-photo analysis over an RGBA buffer (already downscaled to ~256 px long edge).
 * Pure function: no DOM, safe in a Worker or Node.
 */
import { CONFIG, HSL_BUCKETS, hslBucket } from "./config";
import { hueDeg, oklabToHex, oklchToHex, quantile, rng, smoothstep, toPlanes, type Planes } from "./color";
import { paletteFromSample, type LabSample, type Swatch } from "./palette";

export interface ToneStats {
  meanL: number;
  /** percentiles of OKLab L */
  p1: number; p5: number; p10: number; p50: number; p90: number; p95: number; p99: number;
  /** mean a/b over all pixels (colour cast) */
  meanA: number;
  meanB: number;
  /** chroma over all pixels */
  chromaMedian: number;
  chromaP90: number;
}

export interface GradingRange {
  range: "shadows" | "midtones" | "highlights";
  /** share of pixel weight falling in this range */
  presence: number;
  a: number;
  b: number;
  hue: number;
  /** 0..100 saturation proxy (estimated) */
  sat: number;
  /** the actual (often subtle) tint at a representative lightness */
  hex: string;
  /** the wheel position: same hue at a clearly visible chroma, for the UI's wheel dot */
  wheelHex: string;
}

export interface Glow {
  /** null when the photo has no clear bright regions */
  score: number | null;
  label: string;
  spill: number | null;
  hex: string | null;
  tintA: number;
  tintB: number;
  maskShare: number;
}

export interface HslStat {
  name: string;
  /** chroma-weighted share of colourful content */
  share: number;
  hue: number;
  l: number;
  c: number;
}

export interface PhotoAnalysis {
  width: number;
  height: number;
  neutralShare: number;
  /** chromatic palette (used for set/family pooling and compare) */
  palette: Swatch[];
  /** display palette for this photo alone: adds black/grey/white tones when they cover a large part of the frame; shares are pixel shares */
  photoPalette: Swatch[];
  topPalette: Swatch[];
  bottomPalette: Swatch[];
  toneHist: number[];
  /** Lightroom-style per-channel sRGB histograms (normalized by pixel count) */
  rgbHist: { r: number[]; g: number[]; b: number[] };
  hueHist: number[];
  tone: ToneStats;
  hsl: HslStat[];
  grading: GradingRange[];
  glow: Glow;
  /** raw (unstandardized) family features */
  features: number[];
  /** chromatic samples for pooling (not serialized in the spike JSON) */
  sample: { all: LabSample; top: LabSample; bottom: LabSample };
  ms: number;
}

/**
 * Family features: brightness + hue only (Gate 1 feedback).
 * Hue vectors are the chroma-weighted mean of unit hue directions over
 * chromatic pixels: angle = dominant hue, length = how concentrated it is.
 * Saturation/neutral share deliberately left out.
 */
export const FEATURE_NAMES = [
  "meanL",
  "hueX", "hueY",
  "topHueX", "topHueY",
  "botHueX", "botHueY",
] as const;

export function analyzePhoto(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, seed = 1): PhotoAnalysis {
  const t0 = performance.now();
  const P = toPlanes(rgba, width, height);
  const thr = CONFIG.chromaThreshold;
  const half = Math.floor(height / 2);

  // ---------- chromatic samples (weighted by chroma) ----------
  const chromaticIdx: number[] = [];
  let neutral = 0;
  for (let i = 0; i < P.n; i++) (P.C[i] > thr ? chromaticIdx.push(i) : neutral++);
  const neutralShare = P.n ? neutral / P.n : 1;

  const rand = rng(seed);
  const take = (filter: (i: number) => boolean): LabSample => {
    const pool = chromaticIdx.filter(filter);
    const step = Math.max(1, pool.length / CONFIG.samplePerPhoto);
    const m = Math.min(pool.length, CONFIG.samplePerPhoto);
    const lab = new Float32Array(m * 3), w = new Float32Array(m);
    for (let j = 0; j < m; j++) {
      const i = pool[Math.min(pool.length - 1, Math.floor(j * step + rand() * step))];
      lab[j * 3] = P.L[i]; lab[j * 3 + 1] = P.A[i]; lab[j * 3 + 2] = P.B[i];
      w[j] = P.C[i];
    }
    // keep the photo's chromatic mass meaningful: weights scaled by pool size
    const scale = pool.length / Math.max(1, m);
    for (let j = 0; j < m; j++) w[j] *= scale;
    return { lab, w };
  };
  const isTop = (i: number) => Math.floor(P.idx[i] / width) < half;
  const sampleAll = take(() => true);
  const sampleTop = take(isTop);
  const sampleBot = take((i) => !isTop(i));

  const palette = paletteFromSample(sampleAll, CONFIG.paletteK, seed);
  const topPalette = paletteFromSample(sampleTop, CONFIG.paletteK, seed);
  const bottomPalette = paletteFromSample(sampleBot, CONFIG.paletteK, seed);
  const photoPalette = withNeutrals(P, palette, neutralShare, seed);

  // ---------- histograms + tone stats ----------
  const RB = CONFIG.rgbBins;
  const rgbHist = { r: new Array(RB).fill(0), g: new Array(RB).fill(0), b: new Array(RB).fill(0) };
  for (let i = 0; i < P.n; i++) {
    const o = P.idx[i] * 4;
    rgbHist.r[(rgba[o] * RB) >> 8]++;
    rgbHist.g[(rgba[o + 1] * RB) >> 8]++;
    rgbHist.b[(rgba[o + 2] * RB) >> 8]++;
  }
  for (const ch of [rgbHist.r, rgbHist.g, rgbHist.b]) for (let i = 0; i < RB; i++) ch[i] /= P.n || 1;
  const toneHist = new Array(CONFIG.toneBins).fill(0);
  const hueHist = new Array(CONFIG.hueBins).fill(0);
  let hueMass = 0, sumL = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < P.n; i++) {
    toneHist[Math.min(CONFIG.toneBins - 1, Math.max(0, Math.floor(P.L[i] * CONFIG.toneBins)))]++;
    if (P.C[i] > thr) {
      hueHist[Math.floor(P.H[i] / (360 / CONFIG.hueBins)) % CONFIG.hueBins] += P.C[i];
      hueMass += P.C[i];
    }
    sumL += P.L[i]; sumA += P.A[i]; sumB += P.B[i];
  }
  for (let i = 0; i < toneHist.length; i++) toneHist[i] /= P.n || 1;
  for (let i = 0; i < hueHist.length; i++) hueHist[i] /= hueMass || 1;
  const Ls = Float32Array.from(P.L).sort();
  const Cs = Float32Array.from(P.C).sort();
  const tone: ToneStats = {
    meanL: sumL / P.n,
    p1: quantile(Ls, 0.01), p5: quantile(Ls, 0.05), p10: quantile(Ls, 0.1), p50: quantile(Ls, 0.5),
    p90: quantile(Ls, 0.9), p95: quantile(Ls, 0.95), p99: quantile(Ls, 0.99),
    meanA: sumA / P.n, meanB: sumB / P.n,
    chromaMedian: quantile(Cs, 0.5), chromaP90: quantile(Cs, 0.9),
  };

  // ---------- HSL buckets ----------
  const hb = HSL_BUCKETS.map((b) => ({ name: b.name, m: 0, ha: 0, hb: 0, l: 0, c: 0 }));
  for (const i of chromaticIdx) {
    const k = hb[hslBucket(P.H[i])];
    const w = P.C[i];
    k.m += w; k.ha += P.A[i] * w; k.hb += P.B[i] * w; k.l += P.L[i] * w; k.c += P.C[i] * w;
  }
  const hsl: HslStat[] = hb.map((k) => ({
    name: k.name,
    share: hueMass ? k.m / hueMass : 0,
    hue: k.m ? hueDeg(k.ha, k.hb) : NaN,
    l: k.m ? k.l / k.m : NaN,
    c: k.m ? k.c / k.m : NaN,
  }));

  const grading = gradeRanges(P);
  const glow = glowScore(P);

  // ---------- family features ----------
  const hueVec = (filter: (i: number) => boolean) => {
    let x = 0, y = 0, m = 0;
    for (const i of chromaticIdx) {
      if (!filter(i)) continue;
      const w = P.C[i];
      x += (P.A[i] / P.C[i]) * w; y += (P.B[i] / P.C[i]) * w; m += w;
    }
    return m ? [x / m, y / m] : [0, 0];
  };
  const features = [
    tone.meanL,
    ...hueVec(() => true),
    ...hueVec(isTop),
    ...hueVec((i) => !isTop(i)),
  ];

  return {
    width, height, neutralShare, palette, photoPalette, topPalette, bottomPalette,
    toneHist, rgbHist, hueHist, tone, hsl, grading, glow, features,
    sample: { all: sampleAll, top: sampleTop, bottom: sampleBot },
    ms: performance.now() - t0,
  };
}

/**
 * Per-photo display palette. When near-neutral pixels (black, grey, white)
 * cover at least `neutralPaletteMin` of the frame, add up to 3 neutral
 * swatches. All shares become pixel shares: neutral swatches by their own
 * pixel count, chromatic swatches scaled by the chromatic pixel share.
 */
function withNeutrals(P: Planes, chromatic: Swatch[], neutralShare: number, seed: number): Swatch[] {
  const chromaShare = 1 - neutralShare;
  const out: Swatch[] = chromatic.map((s) => ({ ...s, share: s.share * chromaShare }));
  if (neutralShare >= CONFIG.neutralPaletteMin) {
    const idx: number[] = [];
    for (let i = 0; i < P.n; i++) if (P.C[i] <= CONFIG.chromaThreshold) idx.push(i);
    const m = Math.min(idx.length, CONFIG.samplePerPhoto);
    const step = idx.length / m;
    const lab = new Float32Array(m * 3), w = new Float32Array(m).fill(1);
    for (let j = 0; j < m; j++) {
      const i = idx[Math.floor(j * step)];
      lab[j * 3] = P.L[i]; lab[j * 3 + 1] = P.A[i]; lab[j * 3 + 2] = P.B[i];
    }
    for (const s of paletteFromSample({ lab, w }, 3, seed, CONFIG.neutralMergeDist)) {
      const share = s.share * neutralShare;
      if (share >= CONFIG.neutralSwatchMin) out.push({ ...s, share, neutral: true });
    }
  }
  return out.filter((s) => s.share >= 0.02).sort((a, b) => b.share - a.share);
}

/** Soft tonal weights shared by grading (per-photo) and the edit model. */
export function rangeWeights(L: number): [number, number, number] {
  const g = CONFIG.grading;
  const s = 1 - smoothstep(g.s0, g.s1, L);
  const h = smoothstep(g.h0, g.h1, L);
  return [s, Math.max(0, 1 - s - h), h];
}

function gradeRanges(P: Planes): GradingRange[] {
  const names = ["shadows", "midtones", "highlights"] as const;
  const acc = names.map(() => ({ w: 0, cw: 0, a: 0, b: 0 }));
  for (let i = 0; i < P.n; i++) {
    const ws = rangeWeights(P.L[i]);
    for (let r = 0; r < 3; r++) {
      if (ws[r] <= 0) continue;
      const cw = ws[r] * P.C[i]; // chroma-weighted
      acc[r].w += ws[r];
      acc[r].cw += cw;
      acc[r].a += P.A[i] * cw;
      acc[r].b += P.B[i] * cw;
    }
  }
  return names.map((range, r) => gradingFromAB(range, acc[r].cw ? acc[r].a / acc[r].cw : 0, acc[r].cw ? acc[r].b / acc[r].cw : 0, acc[r].w / (P.n || 1)));
}

export function gradingFromAB(range: GradingRange["range"], a: number, b: number, presence: number): GradingRange {
  const g = CONFIG.grading;
  const c = Math.hypot(a, b);
  const hue = hueDeg(a, b);
  const repL = g.repL[["shadows", "midtones", "highlights"].indexOf(range)];
  return { range, presence, a, b, hue, sat: Math.round(Math.min(100, (c / g.satFull) * 100)), hex: oklchToHex(repL, c, hue), wheelHex: oklchToHex(0.72, 0.12, hue) };
}

/**
 * Glow: how much light spills past the edges of bright regions.
 * At analysis size a hard-edged highlight falls back to its surroundings
 * within ~1 px, so the band 2–3 px out sits near the background level
 * (11–16 px out). A glow keeps that band lifted:
 *   lift = (near − far) / (core − far)
 * Calibrated on the reference set (Phase 1): crisp ≈ 0.15–0.22, glowy ≈ 0.54–0.74.
 * Known false positives: bright snow fields and smooth sky gradients.
 */
function glowScore(P: Planes): Glow {
  const G = CONFIG.glow;
  const { width: W, height: H, Ygrid } = P;
  const ys: number[] = [];
  for (let i = 0; i < P.n; i++) ys.push(Ygrid[P.idx[i]]);
  ys.sort((x, y) => x - y);
  const T = Math.max(G.minY, quantile(ys, G.q));
  const total = W * H;
  const dist = new Float32Array(total).fill(1e9);
  let mask = 0;
  for (let i = 0; i < total; i++)
    if (Ygrid[i] >= T && !Number.isNaN(P.Lgrid[i])) { dist[i] = 0; mask++; }
  const maskShare = mask / (P.n || 1);
  const none: Glow = { score: null, label: "no bright highlights", spill: null, hex: null, tintA: 0, tintB: 0, maskShare };
  if (maskShare < G.minMaskShare) return none;

  // two-pass chamfer (1, √2) distance transform
  const D = Math.SQRT2;
  const relax = (i: number, j: number, c: number) => { if (dist[j] + c < dist[i]) dist[i] = dist[j] + c; };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) { relax(i, i - W, 1); if (x > 0) relax(i, i - W - 1, D); if (x < W - 1) relax(i, i - W + 1, D); }
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) relax(i, i + 1, 1);
      if (y < H - 1) { relax(i, i + W, 1); if (x < W - 1) relax(i, i + W + 1, D); if (x > 0) relax(i, i + W - 1, D); }
    }

  const inBand = (d: number, b: readonly [number, number]) => d >= b[0] && d <= b[1];
  let core = 0, nc = 0, near = 0, nn = 0, far = 0, nf = 0;
  for (let i = 0; i < total; i++) {
    if (Number.isNaN(P.Lgrid[i])) continue;
    const d = dist[i];
    if (d === 0) { core += Ygrid[i]; nc++; }
    else if (inBand(d, G.near)) { near += Ygrid[i]; nn++; }
    else if (inBand(d, G.far)) { far += Ygrid[i]; nf++; }
  }
  if (!nn || !nf) return none;
  core /= nc; near /= nn; far /= nf;
  const spill = Math.max(0, Math.min(1, (near - far) / Math.max(1e-4, core - far)));
  const score = Math.round(100 * Math.max(0, Math.min(1, (spill - G.spillRange[0]) / (G.spillRange[1] - G.spillRange[0]))));
  const label = G.labels.find(([lim]) => score < lim)![1];

  // halo tint: pixels just outside the highlights, weighted by how much they're lifted above the background
  let tw = 0, tl = 0, ta = 0, tb = 0;
  for (let i = 0; i < total; i++) {
    if (Number.isNaN(P.Lgrid[i]) || dist[i] < G.near[0] || dist[i] > G.far[0]) continue;
    const w = Math.max(0, Ygrid[i] - far);
    tw += w; tl += P.Lgrid[i] * w; ta += P.Agrid[i] * w; tb += P.Bgrid[i] * w;
  }
  if (tw <= 0) return { ...none, score, label, spill, maskShare };
  return { score, label, spill, hex: oklabToHex(tl / tw, ta / tw, tb / tw), tintA: ta / tw, tintB: tb / tw, maskShare };
}
