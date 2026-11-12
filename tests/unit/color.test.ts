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
