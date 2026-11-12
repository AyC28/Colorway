import { describe, it, expect } from "vitest";
import { clippedShare, linearSample, neutralRender, shadowRoom } from "@/edit/measure";

const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
  const px = new Uint16Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(f(x, y), (y * w + x) * 3);
  return px;
};

describe("RAW measurements", () => {
  it("counts clipped pixels", () => {
    const px = img(10, 10, (x) => (x < 3 ? [65535, 30000, 20000] : [30000, 30000, 30000]));
    expect(clippedShare(px, 10, 10)).toBeCloseTo(0.3, 5);
  });
  it("renders 18% linear grey to sRGB ~118", () => {
    const px = img(4, 4, () => [11796, 11796, 11796]);
    expect(neutralRender(px, 4, 4).rgba[0]).toBeGreaterThan(115);
    expect(neutralRender(px, 4, 4).rgba[0]).toBeLessThan(120);
  });
  it("downsizes the render to the max edge", () => {
    const r = neutralRender(new Uint16Array(3000 * 2000 * 3), 3000, 2000, 300);
    expect([r.width, r.height]).toEqual([300, 200]);
  });
  it("samples linear values in 0..1", () => {
    const s = linearSample(img(8, 8, () => [65535, 0, 32768]), 8, 8, 10);
    expect(s[0]).toBe(1); expect(s[1]).toBe(0); expect(s[2]).toBeCloseTo(0.5, 3);
  });
  it("a noisier image has less shadow room", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const clean = img(64, 64, (x) => { const v = x < 16 ? 600 : 20000; return [v, v, v]; });
    const noisy = img(64, 64, (x) => { const v = (x < 16 ? 600 : 20000) + Math.round((rnd() - 0.5) * 1200); return [v, v, v]; });
    expect(shadowRoom(noisy, 64, 64).stops).toBeLessThan(shadowRoom(clean, 64, 64).stops);
  });
});
