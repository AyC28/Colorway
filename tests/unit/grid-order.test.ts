import { describe, it, expect } from "vitest";
import { smoothFlow, byFamily, biggestJumps, moveTo } from "@/grid/order";
import type { PhotoAnalysis } from "@/analysis/photo";

const fake = (L: number, a: number, b: number) => ({ tone: { meanL: L, meanA: a, meanB: b } }) as unknown as PhotoAnalysis;

describe("grid order", () => {
  const an = new Map([["w", fake(0.9, 0, 0)], ["dark", fake(0.2, 0, 0)], ["mid", fake(0.6, 0, 0)], ["light", fake(0.8, 0, 0)]]);
  it("smooth flow walks from the brightest to its nearest neighbour", () => {
    expect(smoothFlow(["dark", "mid", "w", "light"], an)).toEqual(["w", "light", "mid", "dark"]);
  });
  it("groups by family, largest first", () => {
    expect(byFamily(["a", "b", "c", "d"], { f1: ["d"], f2: ["b", "c"] })).toEqual(["b", "c", "d", "a"]);
  });
  it("finds the biggest jump and skips row ends", () => {
    const j = biggestJumps(["w", "dark", "light", "mid"], an, 1);
    expect(j[0]).toMatchObject({ a: "w", b: "dark" });
    expect(biggestJumps(["w", "light", "dark", "mid"], an).some((x) => x.index === 2)).toBe(false);
  });
  it("moves an item", () => expect(moveTo(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]));
});
