/**
 * Builds the Home story assets from the user's own R6 test photo:
 *   public/home/sample.webp       the photo (embedded camera JPEG, metadata stripped)
 *   public/home/points.json       a pixel grid: sRGB bytes + palette group per pixel
 *   public/home/cloud*.webp       static fallbacks (reduced motion, phones, low power)
 * Usage: npx tsx spike/home-assets.ts [reference/raw-test-2.CR3]
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { librawClient } from "./libraw-node";
import { analyzePhoto } from "../src/analysis/photo";
import { linearToOklab, SRGB_TO_LINEAR } from "../src/analysis/color";

const src = process.argv[2] ?? "reference/raw-test-2.CR3";
const c = librawClient();
await c.call("open", new Uint8Array(await readFile(src)), {});
const th = await c.call("thumbnailData");
c.close();
if (!th || th.format !== "jpeg") throw new Error("No embedded JPEG preview in this RAW");
const jpeg = Buffer.from(th.data);

// sharp drops EXIF/GPS unless asked to keep it
await sharp(jpeg).rotate().resize(1400).webp({ quality: 82 }).toFile("public/home/sample.webp");

const GW = 96;
const meta = await sharp(jpeg).rotate().metadata();
const GH = Math.round((GW * (meta.height ?? 2)) / (meta.width ?? 3));
const grid = await sharp(jpeg).rotate().resize(GW, GH, { fit: "fill" }).removeAlpha().raw().toBuffer();
const small = await sharp(jpeg).rotate().resize(256, 256, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const a = analyzePhoto(new Uint8ClampedArray(small.data), small.info.width, small.info.height, 3);
const pal = a.photoPalette;

const lab = new Float32Array(3);
const group = new Uint8Array(GW * GH);
for (let i = 0; i < GW * GH; i++) {
  linearToOklab(SRGB_TO_LINEAR[grid[i * 3]], SRGB_TO_LINEAR[grid[i * 3 + 1]], SRGB_TO_LINEAR[grid[i * 3 + 2]], lab);
  let best = 0, bd = Infinity;
  pal.forEach((s, k) => { const d = Math.hypot(lab[0] - s.l, lab[1] - s.a, lab[2] - s.b); if (d < bd) { bd = d; best = k; } });
  group[i] = best;
}
await writeFile("public/home/points.json", JSON.stringify({
  w: GW, h: GH,
  rgb: Buffer.from(grid).toString("base64"),
  group: Buffer.from(group).toString("base64"),
  palette: pal.map((s) => ({ hex: s.hex, share: s.share, neutral: !!s.neutral })),
}));

// static fallbacks: the same projection the 3D view starts from
const W = 900, H = 760, yaw = 0.7, pitch = 0.35, S = 1300, CH = 3.2;
const proj = (l: number, A: number, B: number) => {
  const x = (A * Math.cos(yaw) - B * Math.sin(yaw)) * CH, z = (A * Math.sin(yaw) + B * Math.cos(yaw)) * CH;
  const y = (l - 0.5) * 0.48;
  return { x: W / 2 + x * S, y: H / 2 - (y * Math.cos(pitch) - z * Math.sin(pitch)) * S, depth: z };
};
const pts = Array.from({ length: GW * GH }, (_, i) => {
  linearToOklab(SRGB_TO_LINEAR[grid[i * 3]], SRGB_TO_LINEAR[grid[i * 3 + 1]], SRGB_TO_LINEAR[grid[i * 3 + 2]], lab);
  return { ...proj(lab[0], lab[1], lab[2]), hex: `#${[grid[i * 3], grid[i * 3 + 1], grid[i * 3 + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`, g: group[i] };
}).sort((p, q) => q.depth - p.depth);
const axis = (a1: number[], b1: number[]) => { const p = proj(a1[0], a1[1], a1[2]), q = proj(b1[0], b1[1], b1[2]); return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="#6b6b6b" stroke-width="1.5"/>`; };
const axes = axis([0, 0, 0], [1, 0, 0]) + axis([0.5, -0.12, 0], [0.5, 0.12, 0]) + axis([0.5, 0, -0.12], [0.5, 0, 0.12]);
const svg = (colour: (p: (typeof pts)[number]) => string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${axes}${pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.2" fill="${colour(p)}"/>`).join("")}</svg>`);
await sharp(svg((p) => p.hex)).webp({ quality: 88 }).toFile("public/home/cloud.webp");
await sharp(svg((p) => pal[p.g].hex)).webp({ quality: 88 }).toFile("public/home/cloud-grouped.webp");
console.log("home assets:", GW, "x", GH, "points,", pal.length, "palette colours:", pal.map((s) => s.hex).join(" "));
