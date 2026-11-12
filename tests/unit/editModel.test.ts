import { describe, it, expect } from "vitest";
import { applyModel, fitEdit } from "@/analysis/editModel";
import { rng } from "@/analysis/color";

function sample(scale: number, n = 3000) {
  const r = rng(2), lin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = Math.pow(r(), 2.2) * 0.8 * scale; lin.set([v * 1.02, v, v * 0.97], i * 3); }
  return lin;
}

describe("edit model", () => {
  it("recovers a known exposure difference", () => {
    const target = { ...applyModel(sample(1), { exposure: 0, temp: 0, contrast: 0, highlights: 0, shadows: 0 }) };
    const tone = { meanL: 0, p1: 0, p99: 1, chromaMedian: 0, chromaP90: 0, ...target };
    const fit = fitEdit(sample(0.5), tone as never);
    // half the light is one stop under: the range must contain +1 EV
    expect(fit.ranges.exposure.lo).toBeLessThanOrEqual(1);
    expect(fit.ranges.exposure.hi).toBeGreaterThanOrEqual(1);
    expect(fit.loss).toBeLessThan(fit.baselineLoss);
  });
  it("reports clipping once exposure pushes past white", () => {
    expect(applyModel(sample(1), { exposure: 2, temp: 0, contrast: 0, highlights: 0, shadows: 0 }).clipped).toBeGreaterThan(0.05);
  });
});

import { baseCurve } from "@/analysis/editModel";
describe("base curve for RAW", () => {
  it("keeps black, mid-grey and white, and is monotonic", () => {
    expect(baseCurve(0)).toBe(0); expect(baseCurve(0.5)).toBe(0.5); expect(baseCurve(1)).toBe(1);
    for (let x = 0; x < 1; x += 0.01) expect(baseCurve(x + 0.01)).toBeGreaterThan(baseCurve(x));
  });
  it("adds contrast: darker shadows, brighter highlights", () => {
    expect(baseCurve(0.25)).toBeLessThan(0.25);
    expect(baseCurve(0.75)).toBeGreaterThan(0.75);
  });
});
