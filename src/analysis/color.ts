/**
 * Color primitives. Pure, DOM-free: runs in a Web Worker and in Node.
 *
 * Per-pixel conversion uses a 256-entry sRGB→linear LUT and Björn Ottosson's
 * OKLab matrices inline (allocation-free, ~50× faster than creating a culori
 * object per pixel). culori is the reference implementation: it formats hex
 * output, maps colours back into the sRGB gamut, and the spike cross-checks
 * the fast path against it (see `selfCheck`).
 */
import {
  useMode as registerMode, // culori's mode registry, not a React hook
  modeRgb,
  modeLrgb,
  modeOklab,
  modeOklch,
  formatHex,
  clampChroma,
} from "culori/fn";

const toRgb = registerMode(modeRgb);
const toOklab = registerMode(modeOklab);
registerMode(modeLrgb);
registerMode(modeOklch);

export const SRGB_TO_LINEAR = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

/** Linear sRGB → OKLab. Writes into `out` (length 3). */
export function linearToOklab(r: number, g: number, b: number, out: Float32Array | number[]): void {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/** Per-pixel planes for one image. Pixels with alpha < 128 are dropped. */
export interface Planes {
  width: number;
  height: number;
  /** number of valid (opaque) pixels */
  n: number;
  /** index into the original grid for each valid pixel */
  idx: Uint32Array;
  L: Float32Array;
  A: Float32Array;
  B: Float32Array;
  /** OKLCH chroma */
  C: Float32Array;
  /** OKLCH hue, degrees [0, 360) */
  H: Float32Array;
  /** relative luminance (linear, Rec.709 weights), full grid incl. transparent (=0) */
  Ygrid: Float32Array;
  /** OKLab per full grid cell, for spatial ops (glow). NaN where transparent. */
  Lgrid: Float32Array;
  Agrid: Float32Array;
  Bgrid: Float32Array;
}

export function toPlanes(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Planes {
  const total = width * height;
  let n = 0;
  for (let i = 0; i < total; i++) if (rgba[i * 4 + 3] >= 128) n++;
  const idx = new Uint32Array(n);
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  const C = new Float32Array(n), H = new Float32Array(n);
  const Ygrid = new Float32Array(total);
  const Lgrid = new Float32Array(total).fill(NaN);
  const Agrid = new Float32Array(total).fill(NaN);
  const Bgrid = new Float32Array(total).fill(NaN);
  const lab = new Float32Array(3);
  let j = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    const r = SRGB_TO_LINEAR[rgba[o]], g = SRGB_TO_LINEAR[rgba[o + 1]], b = SRGB_TO_LINEAR[rgba[o + 2]];
    Ygrid[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    linearToOklab(r, g, b, lab);
    idx[j] = i;
    L[j] = lab[0]; A[j] = lab[1]; B[j] = lab[2];
    Lgrid[i] = lab[0]; Agrid[i] = lab[1]; Bgrid[i] = lab[2];
    C[j] = Math.hypot(lab[1], lab[2]);
    let h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
    if (h < 0) h += 360;
    H[j] = h;
    j++;
  }
  return { width, height, n, idx, L, A, B, C, H, Ygrid, Lgrid, Agrid, Bgrid };
}

/** OKLab → #rrggbb, chroma-reduced into sRGB gamut (culori). */
export function oklabToHex(l: number, a: number, b: number): string {
  const c = clampChroma({ mode: "oklab", l, a, b }, "oklch");
  return formatHex(toRgb(c)) ?? "#000000";
}

export function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  return oklabToHex(l, c * Math.cos(h), c * Math.sin(h));
}

export function hueDeg(a: number, b: number): number {
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

/** Max abs error of the fast path vs culori over a set of test colours. */
export function selfCheck(): number {
  let worst = 0;
  const out = new Float32Array(3);
  for (let r = 0; r < 256; r += 17)
    for (let g = 0; g < 256; g += 17)
      for (let b = 0; b < 256; b += 17) {
        linearToOklab(SRGB_TO_LINEAR[r], SRGB_TO_LINEAR[g], SRGB_TO_LINEAR[b], out);
        const ref = toOklab({ mode: "rgb", r: r / 255, g: g / 255, b: b / 255 });
        worst = Math.max(worst, Math.abs(ref.l - out[0]), Math.abs(ref.a - out[1]), Math.abs(ref.b - out[2]));
      }
  return worst;
}

/** Deterministic PRNG (mulberry32) so analysis is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
