import { describe, it, expect } from "vitest";
import { analyzePhoto } from "@/analysis/photo";
import { analysisFromJson, analysisToJson } from "@/sync/serialize";
import { noisy } from "./fixtures";

describe("sync serialisation", () => {
  it("round-trips an analysis through JSON, samples included", () => {
    const a = analyzePhoto(noisy(64, 48, [180, 120, 60], 30), 64, 48, 5);
    const back = analysisFromJson(JSON.parse(JSON.stringify(analysisToJson(a))));
    expect(back.palette).toEqual(a.palette);
    expect(Array.from(back.sample.all.lab)).toEqual(Array.from(a.sample.all.lab));
    expect(back.sample.bottom.w).toBeInstanceOf(Float32Array);
  });
});
