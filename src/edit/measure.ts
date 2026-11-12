/**
 * Measurements on decoded RAW data: 16-bit LINEAR RGB with camera white balance
 * (what libraw-wasm returns with gamm [1,1] and no auto-brightness). Pure.
 */
import { rng, quantile } from "@/analysis/color";

const gamma = (v: number) => Math.round(255 * Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));

/** Our neutral render for display and colour analysis: sRGB gamma only, no tone curve. RGBA8 out. */
export function neutralRender(px: Uint16Array, w: number, h: number, maxEdge = 1400) {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
  const out = new Uint8ClampedArray(W * H * 4);
  const lut = new Uint8Array(65536);
  for (let i = 0; i < 65536; i++) lut[i] = gamma(i / 65535);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.floor(y / s));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.floor(x / s)), i = (sy * w + sx) * 3, o = (y * W + x) * 4;
      out[o] = lut[px[i]]; out[o + 1] = lut[px[i + 1]]; out[o + 2] = lut[px[i + 2]]; out[o + 3] = 255;
    }
  }
  return { rgba: out, width: W, height: H };
}

/** A random linear-RGB sample (0..1), for the edit model. */
export function linearSample(px: Uint16Array, w: number, h: number, n = 8000, seed = 11) {
  const r = rng(seed), lin = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) { const i = Math.floor(r() * w * h) * 3; lin[j * 3] = px[i] / 65535; lin[j * 3 + 1] = px[i + 1] / 65535; lin[j * 3 + 2] = px[i + 2] / 65535; }
  return lin;
}

/** Share of pixels with any channel at (or within 1% of) white: highlights that are already gone. */
export function clippedShare(px: Uint16Array, w: number, h: number, limit = 65000) {
  let c = 0;
  for (let i = 0; i < w * h; i++) if (px[i * 3] >= limit || px[i * 3 + 1] >= limit || px[i * 3 + 2] >= limit) c++;
  return c / (w * h || 1);
}

/**
 * Shadow room: stops between the median luminance and the noise floor, where the
 * noise floor is the typical spread inside the darkest 2% of 16-pixel blocks.
 */
export function shadowRoom(px: Uint16Array, w: number, h: number, B = 16) {
  const blocks: { mean: number; sd: number }[] = [];
  const Ys: number[] = [];
  for (let by = 0; by + B <= h; by += B) for (let bx = 0; bx + B <= w; bx += B) {
    let s = 0, s2 = 0;
    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
      const i = (y * w + x) * 3, Y = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 65535;
      s += Y; s2 += Y * Y;
    }
    const m = s / (B * B);
    blocks.push({ mean: m, sd: Math.sqrt(Math.max(0, s2 / (B * B) - m * m)) });
    Ys.push(m);
  }
  if (!blocks.length) return { noise: 0, stops: 0 };
  blocks.sort((a, b) => a.mean - b.mean);
  const dark = blocks.slice(0, Math.max(1, Math.floor(blocks.length * 0.02))).map((b) => b.sd).sort((a, b) => a - b);
  const noise = quantile(dark, 0.5);
  Ys.sort((a, b) => a - b);
  return { noise, stops: Math.log2(Math.max(1e-6, quantile(Ys, 0.5)) / Math.max(1e-6, noise)) };
}
