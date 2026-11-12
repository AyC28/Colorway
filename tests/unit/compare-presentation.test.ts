import { describe, it, expect } from "vitest";
import { moveWord, topSuggestions, colourPairs, matchBars } from "@/compare/presentation";
import type { Suggestion } from "@/analysis/compare";

const s = (group: Suggestion["group"], control: string, sign: "+" | "−", band: Suggestion["band"], why = ""): Suggestion => ({ group, control, sign, band, why, delta: 0 });

describe("compare presentation", () => {
  it("words moves without numbers", () => {
    expect(moveWord(s("Color", "Temp", "+", "slight"))).toBe("Warmer");
    expect(moveWord(s("Light", "Exposure", "−", "strong"))).toBe("Lower");
    expect(moveWord(s("Color Grading", "Shadows wheel", "+", "moderate", "push shadows toward hue ≈250° (family #123)"))).toBe("Toward blue");
  });
  it("ranks strongest first with at most two per panel", () => {
    const all = [s("Light", "A", "+", "slight"), s("Light", "B", "+", "strong"), s("Light", "C", "+", "strong"), s("Light", "D", "+", "strong"), s("HSL", "E", "+", "moderate")];
    const top = topSuggestions(all);
    expect(top.map((x) => x.control)).toEqual(["B", "C", "E"]);
  });
  it("pairs colours with their nearest family colour", () => {
    const mk = (l: number, a: number, b: number) => ({ hex: "#000000", l, a, b, c: Math.hypot(a, b), h: 0, share: 0.5 });
    const p = colourPairs([mk(0.5, 0.1, 0)], [mk(0.9, 0, 0), mk(0.5, 0.1, 0.02)]);
    expect(p[0].deltaE).toBe(2);
    expect(p[0].word).toBe("Close");
  });
  it("flags a near-tie runner-up", () => {
    const m = (score: number) => ({ id: "x", name: "x", featureDist: 0, paletteDist: 0, score });
    expect(matchBars([m(1), m(1.1)]).alsoClose).toBe(true);
    expect(matchBars([m(1), m(1.5)]).alsoClose).toBe(false);
  });
});
