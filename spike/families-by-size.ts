import { readFileSync, readdirSync } from "node:fs";
import sharp from "sharp";
import { analyzePhoto } from "../src/analysis/photo";
import { buildFamilies } from "../src/analysis/group";
const dir = "reference/";
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
const as = [];
for (const [i, f] of files.entries()) {
  const { data, info } = await sharp(dir + f).resize(256, 256, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  as.push(analyzePhoto(new Uint8ClampedArray(data), info.width, info.height, i + 1));
}
for (const n of [12, 20, 30, 37]) {
  const r = buildFamilies(as.slice(0, n));
  console.log(n, r.families.map((f) => `${f.name}(${f.members.length})`).join(" | "));
}
