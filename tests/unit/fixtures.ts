/** Synthetic RGBA images with known answers. */
export function solid(w: number, h: number, rgb: [number, number, number]) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) a.set([...rgb, 255], i * 4);
  return a;
}
/** Top half one colour, bottom half another. */
export function halves(w: number, h: number, top: [number, number, number], bottom: [number, number, number]) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set([...(y < h / 2 ? top : bottom), 255], (y * w + x) * 4);
  return a;
}
/** A white disk on a dark ground; `blur` px of Gaussian-ish falloff makes it glow. */
export function disk(w: number, h: number, r: number, blur: number, ground = 30) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - w / 2, y - h / 2) - r;
    const t = d <= 0 ? 1 : blur > 0 ? Math.exp(-(d * d) / (2 * blur * blur)) : 0;
    const v = Math.round(ground + (255 - ground) * t);
    a.set([v, v, v, 255], (y * w + x) * 4);
  }
  return a;
}
/** Deterministic noise around a base colour. */
export function noisy(w: number, h: number, rgb: [number, number, number], amp: number, seed = 1) {
  let s = seed;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2 * amp;
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) a.set([rgb[0] + r(), rgb[1] + r(), rgb[2] + r(), 255], i * 4);
  return a;
}
