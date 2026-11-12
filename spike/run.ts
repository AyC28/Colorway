/**
 * Phase 1 spike: run the analysis on reference/ and write
 * spike/out/results.json + spike/out/contact-sheet.html.
 * Usage: npm run spike
 */
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { CONFIG, ANALYSIS_VERSION, HSL_BUCKETS } from "../src/analysis/config";
import { selfCheck } from "../src/analysis/color";
import { analyzePhoto, FEATURE_NAMES, type PhotoAnalysis } from "../src/analysis/photo";
import { buildFamilies, summarize } from "../src/analysis/group";
import { comparePhoto } from "../src/analysis/compare";
import { contactSheet } from "./sheet";

const REF = "reference";
const OUT = "spike/out";

async function load(path: string) {
  const img = sharp(path).rotate(); // honour EXIF orientation
  const { data, info } = await img
    .resize(CONFIG.analysisLongEdge, CONFIG.analysisLongEdge, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height };
}

async function thumb(path: string, name: string) {
  await sharp(path).rotate().resize(360, 360, { fit: "inside" }).jpeg({ quality: 80 }).toFile(join(OUT, "thumbs", name));
}

const strip = (p: PhotoAnalysis) => {
  const { sample, ...rest } = p;
  return rest;
};

async function main() {
  await mkdir(join(OUT, "thumbs"), { recursive: true });
  const fastPathErr = selfCheck();
  console.log(`fast OKLab path vs culori: max abs error ${fastPathErr.toExponential(2)}`);

  const files = (await readdir(REF)).filter((f) => /\.png$/i.test(f)).sort();
  const photos: { file: string; thumb: string; a: PhotoAnalysis; decodeMs: number }[] = [];
  const t0 = performance.now();
  for (const [i, file] of files.entries()) {
    const td = performance.now();
    const { rgba, w, h } = await load(join(REF, file));
    const decodeMs = performance.now() - td;
    const a = analyzePhoto(rgba, w, h, i + 1);
    const t = `p${String(i + 1).padStart(2, "0")}.jpg`;
    await thumb(join(REF, file), t);
    photos.push({ file, thumb: t, a, decodeMs });
    process.stdout.write(".");
  }
  const tA = performance.now();
  const set = summarize(photos.map((p) => p.a));
  const fam = buildFamilies(photos.map((p) => p.a));
  const tF = performance.now();

  // compare photo
  const cmpFile = "comparison-photo.jpg";
  const c = await load(join(REF, cmpFile));
  const cmpA = analyzePhoto(c.rgba, c.w, c.h, 999);
  await thumb(join(REF, cmpFile), "compare.jpg");
  const cmp = comparePhoto(cmpA, fam, true);

  const analysisMs = photos.reduce((s, p) => s + p.a.ms, 0);
  const decodeMs = photos.reduce((s, p) => s + p.decodeMs, 0);
  const timing = {
    photos: photos.length,
    perPhotoAnalysisMsAvg: analysisMs / photos.length,
    perPhotoDecodeResizeMsAvg: decodeMs / photos.length,
    setAndFamiliesMs: tF - tA,
    wallMs: tF - t0,
    projected50AnalysisOnlyS: ((analysisMs / photos.length) * 50 + (tF - tA)) / 1000,
  };
  console.log("\n", timing);
  console.log("families:", fam.families.map((f) => `${f.name} (${f.members.length})`).join(" | "));
  console.log("silhouettes:", fam.silhouettes.map((s) => `k${s.k}=${s.score.toFixed(3)}`).join(" "));
  console.log("compare →", cmp.family.name, cmp.suggestions.map((s) => `${s.control} ${s.sign} ${s.band}`).join("; "));

  const results = {
    version: ANALYSIS_VERSION,
    config: CONFIG,
    fastPathErr,
    timing,
    featureNames: FEATURE_NAMES,
    hslBuckets: HSL_BUCKETS,
    set,
    families: {
      k: fam.k,
      silhouettes: fam.silhouettes,
      standardizer: fam.standardizer,
      list: fam.families.map((f) => ({ ...f, memberFiles: f.members.map((i) => photos[i].file) })),
    },
    photos: photos.map((p) => ({ file: p.file, thumb: p.thumb, ...strip(p.a) })),
    compare: { file: cmpFile, analysis: strip(cmpA), ...cmp },
  };
  await writeFile(join(OUT, "results.json"), JSON.stringify(results, null, 1));
  await writeFile(join(OUT, "contact-sheet.html"), contactSheet(results));
  console.log(`wrote ${OUT}/results.json and ${OUT}/contact-sheet.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
