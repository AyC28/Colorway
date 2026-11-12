import { CONFIG } from "./config";
import { hueDeg, oklabToHex } from "./color";
import { kmeansBest } from "./kmeans";

export interface Swatch {
  hex: string;
  l: number;
  a: number;
  b: number;
  /** OKLCH chroma of the swatch */
  c: number;
  /** degrees */
  h: number;
  /** share of chroma-weighted mass, 0..1, sums to 1 over the palette */
  share: number;
  /** true for black/grey/white tones (only in per-photo display palettes) */
  neutral?: boolean;
}

/** Chromatic pixel sample: OKLab triplets + weight. */
export interface LabSample {
  lab: Float32Array; // n × 3
  w: Float32Array; // n
}

export function paletteFromSample(s: LabSample, k: number = CONFIG.paletteK, seed = 1, mergeDist: number = CONFIG.paletteMergeDist): Swatch[] {
  const n = s.w.length;
  if (n < 8) return [];
  const res = kmeansBest(s.lab, s.w, 3, k, 4, seed);
  let items = [] as { l: number; a: number; b: number; m: number }[];
  for (let c = 0; c < res.k; c++) {
    if (res.mass[c] <= 0) continue;
    items.push({ l: res.centroids[c * 3], a: res.centroids[c * 3 + 1], b: res.centroids[c * 3 + 2], m: res.mass[c] });
  }
  // merge near-duplicates, closest pair first
  for (;;) {
    let bi = -1, bj = -1, bd: number = mergeDist;
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const d = Math.hypot(items[i].l - items[j].l, items[i].a - items[j].a, items[i].b - items[j].b);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    if (bi < 0) break;
    const p = items[bi], q = items[bj], m = p.m + q.m;
    items[bi] = { l: (p.l * p.m + q.l * q.m) / m, a: (p.a * p.m + q.a * q.m) / m, b: (p.b * p.m + q.b * q.m) / m, m };
    items.splice(bj, 1);
  }
  const total = items.reduce((s, x) => s + x.m, 0);
  items = items.filter((x) => x.m / total >= CONFIG.paletteMinShare);
  const kept = items.reduce((s, x) => s + x.m, 0);
  return items
    .sort((x, y) => y.m - x.m)
    .map((x) => ({
      hex: oklabToHex(x.l, x.a, x.b),
      l: x.l, a: x.a, b: x.b,
      c: Math.hypot(x.a, x.b),
      h: hueDeg(x.a, x.b),
      share: x.m / kept,
    }));
}

/** Concatenate samples; each input is rescaled so its weights sum to 1 (equal say per photo). */
export function poolEqual(samples: LabSample[], maxPoints = 24000): LabSample {
  const per = Math.max(200, Math.floor(maxPoints / Math.max(1, samples.length)));
  let n = 0;
  for (const s of samples) n += Math.min(per, s.w.length);
  const lab = new Float32Array(n * 3), w = new Float32Array(n);
  let o = 0;
  for (const s of samples) {
    const m = Math.min(per, s.w.length);
    if (!m) continue;
    const step = s.w.length / m;
    let sum = 0;
    for (let j = 0; j < m; j++) sum += s.w[Math.floor(j * step)];
    if (sum <= 0) continue;
    for (let j = 0; j < m; j++) {
      const i = Math.floor(j * step);
      lab[(o + j) * 3] = s.lab[i * 3]; lab[(o + j) * 3 + 1] = s.lab[i * 3 + 1]; lab[(o + j) * 3 + 2] = s.lab[i * 3 + 2];
      w[o + j] = s.w[i] / sum; // each photo's weights sum to 1
    }
    o += m;
  }
  return { lab: lab.subarray(0, o * 3), w: w.subarray(0, o) };
}

/** Share-weighted symmetric chamfer distance between two palettes in OKLab. */
export function paletteDistance(p: Swatch[], q: Swatch[]): number {
  if (!p.length || !q.length) return 1;
  const one = (x: Swatch[], y: Swatch[]) =>
    x.reduce((s, a) => s + a.share * Math.min(...y.map((b) => Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b))), 0);
  return (one(p, q) + one(q, p)) / 2;
}
