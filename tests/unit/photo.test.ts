import { describe, it, expect } from "vitest";
import { analyzePhoto } from "@/analysis/photo";
import { solid, halves, disk, noisy } from "./fixtures";

describe("analyzePhoto", () => {
  it("a grey photo is all neutral, with no palette", () => {
    const a = analyzePhoto(solid(64, 48, [120, 120, 120]), 64, 48);
    expect(a.neutralShare).toBe(1);
    expect(a.palette).toEqual([]);
    expect(a.photoPalette.length).toBeGreaterThan(0);
    expect(a.photoPalette.every((s) => s.neutral)).toBe(true);
  });
  it("finds the two colours of a split frame and puts each in the right half", () => {
    const a = analyzePhoto(halves(64, 64, [60, 110, 200], [200, 140, 40]), 64, 64);
    expect(a.palette.map((s) => s.hex).sort()).toEqual(["#3c6ec8", "#c88c28"]);
    expect(a.topPalette[0].hex).toBe("#3c6ec8");
    expect(a.bottomPalette[0].hex).toBe("#c88c28");
  });
  it("orders the palette by share and the shares sum to 1", () => {
    const a = analyzePhoto(noisy(80, 60, [180, 90, 60], 25), 80, 60);
    const total = a.palette.reduce((s, x) => s + x.share, 0);
    expect(total).toBeCloseTo(1, 5);
    for (let i = 1; i < a.palette.length; i++) expect(a.palette[i].share).toBeLessThanOrEqual(a.palette[i - 1].share);
  });
  it("histograms are normalised", () => {
    const a = analyzePhoto(noisy(40, 40, [90, 140, 70], 30), 40, 40);
    expect(a.toneHist.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    expect(a.hueHist.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    expect(a.rgbHist.g.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
  });
  it("a soft halo scores more glow than a hard edge", () => {
    const hard = analyzePhoto(disk(128, 128, 14, 0), 128, 128).glow;
    const soft = analyzePhoto(disk(128, 128, 14, 7), 128, 128).glow;
    expect(hard.score).not.toBeNull();
    expect(soft.score!).toBeGreaterThan(hard.score! + 30);
  });
  it("is deterministic for the same seed", () => {
    const img = noisy(50, 50, [150, 100, 200], 40, 9);
    expect(analyzePhoto(img, 50, 50, 4).palette).toEqual(analyzePhoto(img, 50, 50, 4).palette);
  });
});
