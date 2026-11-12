/**
 * Phase 2 data for the Edit guide mockup: decode a real R6 CR3, measure
 * clipping / noise / as-shot WB, find the nearest family, fit the edit model.
 * Usage: npx tsx spike/edit-mock.ts [reference/raw-test-2.CR3]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { librawClient } from "./libraw-node";
import { analyzePhoto } from "../src/analysis/photo";
import { matchFamilies, suggest } from "../src/analysis/compare";
import { fitEdit } from "../src/analysis/editModel";
import { rng, quantile } from "../src/analysis/color";

const file = process.argv[2] ?? "reference/raw-test-2.CR3";
const R = JSON.parse(await readFile("spike/out/results.json", "utf8"));
const fam = { k: R.families.k, silhouettes: [], standardizer: R.families.standardizer, families: R.families.list };

const c = librawClient();
const t0 = performance.now();
await c.call("open", new Uint8Array(await readFile(file)), { outputBps: 16, gamm: [1, 1], noAutoBright: true, useCameraWb: true, outputColor: 1, userQual: 0, halfSize: true });
const meta = await c.call("metadata", true);
const img = await c.call("imageData");
const decodeMs = performance.now() - t0;
c.close();
const { width: W, height: H } = img;
const px = img.data as Uint16Array;

// display render: sRGB gamma only, no tone curve (our baseline, not the camera JPEG)
const gamma = (v: number) => Math.round(255 * Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
const rgb8 = Buffer.alloc(W * H * 3);
for (let i = 0; i < px.length; i++) rgb8[i] = gamma(px[i] / 65535);
await mkdir("mockups/assets-raw", { recursive: true });
await sharp(rgb8, { raw: { width: W, height: H, channels: 3 } }).resize(1400).jpeg({ quality: 84 }).toFile("mockups/assets-raw/edit-baseline.jpg");
const small = await sharp(rgb8, { raw: { width: W, height: H, channels: 3 } }).resize(256, 256, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const a = analyzePhoto(new Uint8ClampedArray(small.data), small.info.width, small.info.height, 7);

// linear sample for the model, clipping and noise
const rand = rng(11);
const N = 8000, lin = new Float32Array(N * 3);
for (let j = 0; j < N; j++) { const i = Math.floor(rand() * W * H); for (let k = 0; k < 3; k++) lin[j * 3 + k] = px[i * 3 + k] / 65535; }
let clipped = 0;
for (let i = 0; i < W * H; i++) if (px[i * 3] >= 65000 || px[i * 3 + 1] >= 65000 || px[i * 3 + 2] >= 65000) clipped++;
// shadow noise: std of luminance inside the darkest 2% of 16-px blocks, vs the median luminance
const B = 16, blocks: { mean: number; sd: number }[] = [];
for (let by = 0; by + B <= H; by += B) for (let bx = 0; bx + B <= W; bx += B) {
  let s = 0, s2 = 0;
  for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) { const i = (y * W + x) * 3; const Y = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 65535; s += Y; s2 += Y * Y; }
  const m = s / (B * B); blocks.push({ mean: m, sd: Math.sqrt(Math.max(0, s2 / (B * B) - m * m)) });
}
blocks.sort((x, y) => x.mean - y.mean);
const dark = blocks.slice(0, Math.max(1, Math.floor(blocks.length * 0.02)));
const noiseSd = quantile(dark.map((b) => b.sd).sort((x, y) => x - y), 0.5);
const Ys = Array.from({ length: N }, (_, j) => 0.2126 * lin[j * 3] + 0.7152 * lin[j * 3 + 1] + 0.0722 * lin[j * 3 + 2]).sort((x, y) => x - y);
const cleanStops = Math.log2(quantile(Ys, 0.5) / Math.max(1e-6, noiseSd));

const matches = matchFamilies(a, fam as any);
const target = R.families.list.find((f: any) => f.id === matches[0].id);
const fit = fitEdit(lin, target.summary.tone);
const out = {
  file: file.split("/").pop(), decodeMs: Math.round(decodeMs), size: `${W}×${H} (half-size decode)`,
  camera: `${meta.camera_make} ${meta.camera_model}`, iso: meta.iso_speed, shutter: meta.shutter, aperture: meta.aperture, focal: meta.focal_len,
  craw: meta.canon?.Quality === 7, asShot: { rOverG: meta.color_data.cam_mul[0] / meta.color_data.cam_mul[1], bOverG: meta.color_data.cam_mul[2] / meta.color_data.cam_mul[1] },
  clippedShare: clipped / (W * H), noiseSd, cleanStops,
  palette: a.palette, photoPalette: a.photoPalette, rgbHist: a.rgbHist, tone: a.tone, hsl: a.hsl, grading: a.grading,
  matches, family: { id: target.id, name: target.name },
  fit, suggestions: suggest(a, target),
};
await writeFile("spike/out/edit.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, palette: undefined, photoPalette: undefined, rgbHist: undefined, suggestions: out.suggestions.length }, null, 1));
