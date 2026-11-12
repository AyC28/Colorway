import { describe, it, expect } from "vitest";
import { analyzePhoto } from "@/analysis/photo";
import { buildFamilies, summarize } from "@/analysis/group";
import { comparePhoto } from "@/analysis/compare";
import { CONFIG } from "@/analysis/config";
import { noisy } from "./fixtures";

const warm = Array.from({ length: 8 }, (_, i) => analyzePhoto(noisy(48, 36, [210 - i * 4, 140, 60], 20, i + 1), 48, 36, i + 1));
const cool = Array.from({ length: 8 }, (_, i) => analyzePhoto(noisy(48, 36, [50, 90 + i * 3, 190], 20, i + 40), 48, 36, i + 40));
const dark = Array.from({ length: 5 }, (_, i) => analyzePhoto(noisy(48, 36, [40, 30, 70 + i * 2], 10, i + 80), 48, 36, i + 80));
const all = [...warm, ...cool, ...dark];

describe("families", () => {
  const fam = buildFamilies(all);
  it("separates clearly different looks", () => {
    const of = (i: number) => fam.families.find((f) => f.members.includes(i))!.id;
    expect(new Set(warm.map((_, i) => of(i))).size).toBe(1);
    expect(new Set(cool.map((_, i) => of(i + 8))).size).toBe(1);
    expect(of(0)).not.toBe(of(8));
  });
  it("never leaves a family under the minimum size", () => {
    for (const f of fam.families) expect(f.members.length).toBeGreaterThanOrEqual(CONFIG.families.minClusterSize);
  });
  it("names every family, uniquely", () => {
    const names = fam.families.map((f) => f.name);
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("summary", () => {
  it("gives every photo an equal say", () => {
    // one very colourful photo must not swamp nine plain ones
    const plain = Array.from({ length: 9 }, (_, i) => analyzePhoto(noisy(40, 30, [120, 150, 110], 8, i + 1), 40, 30, i + 1));
    const loud = analyzePhoto(noisy(40, 30, [230, 30, 160], 10, 99), 40, 30, 99);
    const s = summarize([...plain, loud]);
    expect(s.palette[0].h).toBeGreaterThan(90);
    expect(s.palette[0].h).toBeLessThan(180);
  });
});

describe("compare", () => {
  it("matches a warm photo to the warm family and suggests directions only", () => {
    const fam = buildFamilies(all);
    const probe = analyzePhoto(noisy(48, 36, [205, 130, 55], 20, 7), 48, 36, 7);
    const r = comparePhoto(probe, fam);
    const warmId = fam.families.find((f) => f.members.includes(0))!.id;
    expect(r.family.id).toBe(warmId);
    for (const s of r.suggestions) expect(["slight", "moderate", "strong"]).toContain(s.band);
    expect(r.headroomNote).toMatch(/headroom/);
  });
});
