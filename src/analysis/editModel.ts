/**
 * Edit guide model (first version, Phase 2). Pure TS over linear RGB.
 *
 * A deliberately simple parametric edit applied by OUR pipeline, not Lightroom's:
 *   exposure e (stops, on linear light) → temp t (R/B gain tilt) → clip at 1
 *   → OKLab → contrast c, highlights h, shadows s (soft-weighted shifts of L).
 * We search the parameters that bring the photo's tone stats and cast closest
 * to a target family, then report each parameter as a RANGE: every value whose
 * loss stays within `tolerance` of the best, widened by one step. Ranges are
 * wider than the model's error on purpose; the UI says they're estimates.
 */
import { linearToOklab, quantile } from "./color";
import { rangeWeights } from "./photo";
import type { ToneStats } from "./photo";

export interface EditParams { exposure: number; temp: number; contrast: number; highlights: number; shadows: number }
export interface ParamRange { best: number; lo: number; hi: number }
export interface EditFit {
  ranges: Record<keyof EditParams, ParamRange>;
  loss: number;
  baselineLoss: number;
  /** share of sampled pixels with a channel at/over white, before and after the best edit */
  clippedBefore: number;
  clippedAfter: number;
}

const GRID: Record<keyof EditParams, [number, number, number]> = {
  exposure: [-2, 2, 0.1],
  temp: [-1, 1, 0.05],
  contrast: [-60, 60, 5],
  highlights: [-100, 100, 5],
  shadows: [-100, 100, 5],
};
const KEYS = Object.keys(GRID) as (keyof EditParams)[];

type Stats = { p5: number; p10: number; p50: number; p90: number; p95: number; meanA: number; meanB: number; clipped: number };

/**
 * An approximate default base curve (a gentle S in OKLab L, endpoints and mid-grey fixed).
 * RAW data is scene-linear with no tone curve, while family stats come from finished,
 * display-referred photos; applying this first stops the fit "adding back" the missing
 * base contrast. Approximate: Lightroom's own default curves are not published.
 */
export const baseCurve = (L: number) => L + 0.45 * (L - 0.5) * (1 - Math.abs(2 * L - 1));

/** Apply the model to a linear RGB sample (n × 3, camera WB already applied) and measure. */
export function applyModel(lin: Float32Array, p: EditParams, raw = false): Stats {
  const n = lin.length / 3;
  const Ls = new Float32Array(n);
  const lab = new Float32Array(3);
  const g = Math.pow(2, p.exposure);
  const rg = Math.pow(2, p.temp * 0.35), bg = Math.pow(2, -p.temp * 0.35);
  let sa = 0, sb = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    let r = lin[i * 3] * g * rg, gg = lin[i * 3 + 1] * g, b = lin[i * 3 + 2] * g * bg;
    if (r >= 1 || gg >= 1 || b >= 1) clipped++;
    r = Math.min(1, r); gg = Math.min(1, gg); b = Math.min(1, b);
    linearToOklab(r, gg, b, lab);
    let L = raw ? baseCurve(lab[0]) : lab[0];
    const [ws, , wh] = rangeWeights(L);
    L = 0.5 + (L - 0.5) * (1 + (p.contrast / 100) * 0.6);
    L += (p.highlights / 100) * 0.14 * wh + (p.shadows / 100) * 0.14 * ws;
    Ls[i] = Math.min(1, Math.max(0, L));
    sa += lab[1]; sb += lab[2];
  }
  Ls.sort();
  return {
    p5: quantile(Ls, 0.05), p10: quantile(Ls, 0.1), p50: quantile(Ls, 0.5), p90: quantile(Ls, 0.9), p95: quantile(Ls, 0.95),
    meanA: sa / n, meanB: sb / n, clipped: clipped / n,
  };
}

function loss(s: Stats, t: ToneStats) {
  const d = (x: number, y: number, w = 1) => (w * (x - y)) ** 2;
  return d(s.p10, t.p10) + d(s.p50, t.p50, 1.5) + d(s.p90, t.p90) + d(s.p95 - s.p5, t.p95 - t.p5) + d(s.meanB, t.meanB, 3) + d(s.meanA, t.meanA, 3);
}

const steps = (k: keyof EditParams) => {
  const [lo, hi, st] = GRID[k];
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += st) out.push(Math.round(v / st) * st);
  return out;
};

export function fitEdit(lin: Float32Array, target: ToneStats, tolerance = 0.35, raw = false): EditFit {
  const p: EditParams = { exposure: 0, temp: 0, contrast: 0, highlights: 0, shadows: 0 };
  const L = (q: EditParams) => loss(applyModel(lin, q, raw), target);
  const baselineLoss = L(p);
  let best = baselineLoss;
  for (let pass = 0; pass < 4; pass++) {
    for (const k of KEYS) {
      for (const v of steps(k)) {
        const q = { ...p, [k]: v };
        const l = L(q);
        if (l < best - 1e-12) { best = l; p[k] = v; }
      }
    }
  }
  const ranges = {} as Record<keyof EditParams, ParamRange>;
  for (const k of KEYS) {
    const ok = steps(k).filter((v) => L({ ...p, [k]: v }) <= best * (1 + tolerance) + 1e-5);
    const st = GRID[k][2];
    ranges[k] = { best: p[k], lo: Math.max(GRID[k][0], Math.min(...ok) - st), hi: Math.min(GRID[k][1], Math.max(...ok) + st) };
  }
  return {
    ranges, loss: best, baselineLoss,
    clippedBefore: applyModel(lin, { exposure: 0, temp: 0, contrast: 0, highlights: 0, shadows: 0 }, raw).clipped,
    clippedAfter: applyModel(lin, p, raw).clipped,
  };
}
