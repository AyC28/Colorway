/** Weighted k-means with deterministic k-means++ seeding. Points are row-major in `data` (n × dim). */
import { rng } from "./color";

export interface KMeansResult {
  centroids: Float64Array; // k × dim
  labels: Int32Array;
  /** sum of weights per cluster */
  mass: Float64Array;
  inertia: number;
  k: number;
}

export function kmeans(
  data: Float32Array | Float64Array,
  weights: Float32Array | Float64Array | null,
  dim: number,
  k: number,
  opts: { seed?: number; maxIter?: number } = {},
): KMeansResult {
  const n = data.length / dim;
  k = Math.min(k, n);
  const rand = rng(opts.seed ?? 1);
  const maxIter = opts.maxIter ?? 30;
  const w = (i: number) => (weights ? weights[i] : 1);
  const centroids = new Float64Array(k * dim);
  const labels = new Int32Array(n);
  const mass = new Float64Array(k);
  if (n === 0 || k === 0) return { centroids, labels, mass, inertia: 0, k: 0 };

  const d2 = (i: number, c: number) => {
    let s = 0;
    for (let d = 0; d < dim; d++) {
      const v = data[i * dim + d] - centroids[c * dim + d];
      s += v * v;
    }
    return s;
  };

  // k-means++ seeding (weighted)
  let totalW = 0;
  for (let i = 0; i < n; i++) totalW += w(i);
  let pick = rand() * totalW, first = 0;
  for (let i = 0; i < n; i++) { pick -= w(i); if (pick <= 0) { first = i; break; } }
  for (let d = 0; d < dim; d++) centroids[d] = data[first * dim + d];
  const best = new Float64Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const dd = d2(i, c - 1);
      if (dd < best[i]) best[i] = dd;
      sum += best[i] * w(i);
    }
    let r = rand() * sum, chosen = n - 1;
    for (let i = 0; i < n; i++) { r -= best[i] * w(i); if (r <= 0) { chosen = i; break; } }
    for (let d = 0; d < dim; d++) centroids[c * dim + d] = data[chosen * dim + d];
  }

  const acc = new Float64Array(k * dim);
  let inertia = 0;
  for (let it = 0; it < maxIter; it++) {
    let changed = 0;
    inertia = 0;
    acc.fill(0);
    mass.fill(0);
    for (let i = 0; i < n; i++) {
      let bc = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = d2(i, c);
        if (dd < bd) { bd = dd; bc = c; }
      }
      if (labels[i] !== bc || it === 0) { labels[i] = bc; changed++; }
      const wi = w(i);
      inertia += bd * wi;
      mass[bc] += wi;
      for (let d = 0; d < dim; d++) acc[bc * dim + d] += data[i * dim + d] * wi;
    }
    for (let c = 0; c < k; c++) {
      if (mass[c] > 0) for (let d = 0; d < dim; d++) centroids[c * dim + d] = acc[c * dim + d] / mass[c];
    }
    if (changed === 0) break;
  }
  return { centroids, labels, mass, inertia, k };
}

/** Best of several restarts by inertia. */
export function kmeansBest(
  data: Float32Array | Float64Array,
  weights: Float32Array | Float64Array | null,
  dim: number,
  k: number,
  restarts = 5,
  seed = 1,
): KMeansResult {
  let best: KMeansResult | null = null;
  for (let r = 0; r < restarts; r++) {
    const res = kmeans(data, weights, dim, k, { seed: seed + r * 7919 });
    if (!best || res.inertia < best.inertia) best = res;
  }
  return best!;
}

/** Mean silhouette over points (unweighted). O(n²): fine for photo-level clustering (n ≤ 50). */
export function silhouette(data: Float64Array, dim: number, labels: Int32Array, k: number): number {
  const n = labels.length;
  const dist = (i: number, j: number) => {
    let s = 0;
    for (let d = 0; d < dim; d++) { const v = data[i * dim + d] - data[j * dim + d]; s += v * v; }
    return Math.sqrt(s);
  };
  let total = 0;
  for (let i = 0; i < n; i++) {
    const sum = new Float64Array(k), cnt = new Float64Array(k);
    for (let j = 0; j < n; j++) if (j !== i) { sum[labels[j]] += dist(i, j); cnt[labels[j]]++; }
    const own = labels[i];
    if (cnt[own] === 0) continue; // singleton → s = 0
    const a = sum[own] / cnt[own];
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== own && cnt[c] > 0) b = Math.min(b, sum[c] / cnt[c]);
    total += b === Infinity ? 0 : (b - a) / Math.max(a, b);
  }
  return total / n;
}
