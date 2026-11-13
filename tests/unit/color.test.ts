import { describe, it, expect } from "vitest";
import { selfCheck, toPlanes, oklabToHex, quantile, rng } from "@/analysis/color";

describe("color", () => {
  it("fast OKLab path matches culori", () => expect(selfCheck()).toBeLessThan(1e-5));
  it("neutral grey has ~zero chroma", () => {
    const P = toPlanes(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1);
    expect(P.C[0]).toBeLessThan(1e-3);
    expect(P.L[0]).toBeCloseTo(0.5999, 3);
  });
  it("drops transparent pixels", () => {
    const P = toPlanes(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]), 2, 1);
    expect(P.n).toBe(1);
  });
  it("hex round-trips through OKLab", () => {
    const P = toPlanes(new Uint8ClampedArray([200, 120, 40, 255]), 1, 1);
    expect(oklabToHex(P.L[0], P.A[0], P.B[0])).toBe("#c87828");
  });
  it("quantile interpolates", () => expect(quantile([0, 10], 0.25)).toBe(2.5));
  it("rng is deterministic", () => { const a = rng(3), b = rng(3); expect([a(), a()]).toEqual([b(), b()]); });
});

import { oklabToSrgb, linearToOklab, SRGB_TO_LINEAR } from "@/analysis/color";
describe("oklabToSrgb", () => {
  it("inverts the forward conversion", () => {
    const lab = new Float32Array(3), rgb = new Float32Array(3);
    for (const c of [[200, 120, 40], [10, 200, 90], [128, 128, 128], [30, 40, 220]]) {
      linearToOklab(SRGB_TO_LINEAR[c[0]], SRGB_TO_LINEAR[c[1]], SRGB_TO_LINEAR[c[2]], lab);
      oklabToSrgb(lab[0], lab[1], lab[2], rgb);
      for (let i = 0; i < 3; i++) expect(Math.round(rgb[i] * 255)).toBe(c[i]);
    }
  });
});
