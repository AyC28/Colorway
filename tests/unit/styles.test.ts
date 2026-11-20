import { describe, it, expect } from "vitest";
import { analyzePhoto } from "@/analysis/photo";
import { bestStyle, hueShare, scoreStyles } from "@/analysis/styles";
import { noisy, solid } from "./fixtures";

const style = (rgb: [number, number, number], amp = 14) => bestStyle(analyzePhoto(noisy(64, 48, rgb, amp, 3), 64, 48, 3)).id;

describe("colour styles", () => {
  it("a grey photo is monochrome", () => expect(bestStyle(analyzePhoto(solid(64, 48, [128, 128, 128]), 64, 48)).id).toBe("monochrome"));
  it("a green photo is lush green", () => expect(style([70, 130, 50])).toBe("lush-green"));
  it("a dim blue photo is blue hour", () => expect(style([30, 50, 110])).toBe("blue-hour"));
  it("a dark, muted photo is moody", () => expect(style([40, 36, 34], 6)).toBe("moody-dark"));
  it("a warm orange photo is a warm style", () => expect(["golden-hour", "warm-earth"]).toContain(style([200, 120, 50])));
  it("scores every style, best first, in 0..1", () => {
    const s = scoreStyles(analyzePhoto(noisy(32, 32, [120, 140, 90], 20), 32, 32));
    expect(s).toHaveLength(11);
    for (let i = 1; i < s.length; i++) expect(s[i].score).toBeLessThanOrEqual(s[i - 1].score);
    for (const x of s) { expect(x.score).toBeGreaterThanOrEqual(0); expect(x.score).toBeLessThanOrEqual(1); }
  });
  it("hue shares wrap around red", () => {
    const h = new Array(36).fill(0); h[35] = 0.5; h[0] = 0.5;
    expect(hueShare(h, 350, 10)).toBeCloseTo(1, 6);
  });
});
