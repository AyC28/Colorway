/**
 * Builds the public starter set from the user's own photos in starter-set/ (gitignored originals):
 * 1600 px long edge, WebP, and NO metadata (sharp drops EXIF, GPS, XMP and ICC unless asked to keep them).
 * Usage: npx tsx scripts/build-starter.ts
 */
import { readdir, mkdir, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SRC = "starter-set", OUT = "public/starter";
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.jpe?g$/i.test(f)).sort();
const list: { file: string; width: number; height: number }[] = [];
for (const f of files) {
  const name = f.replace(/\.jpe?g$/i, ".webp");
  const info = await sharp(`${SRC}/${f}`).rotate().resize(1600, 1600, { fit: "inside" }).webp({ quality: 80 }).toFile(`${OUT}/${name}`);
  const meta = await sharp(`${OUT}/${name}`).metadata();
  if (meta.exif || meta.xmp || meta.iptc) throw new Error(`${name} still carries metadata`);
  list.push({ file: name, width: info.width, height: info.height });
}
await writeFile(`${OUT}/manifest.json`, JSON.stringify({ photos: list }, null, 1));
console.log(`starter set: ${list.length} photos, metadata-free`);
