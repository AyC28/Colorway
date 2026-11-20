/**
 * Tuning aid for colour styles: analyses reference/ + starter-set/ (local, private) and writes
 * spike/out/styles.html, a contact sheet grouped by best style with each photo's top three fits.
 * Usage: npx tsx spike/styles-tune.ts
 */
import { readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { analyzePhoto } from "../src/analysis/photo";
import { scoreStyles, styleInputs, STYLES } from "../src/analysis/styles";

const dirs = ["reference", "starter-set"].filter((d) => existsSync(d));
await mkdir("spike/out/st", { recursive: true });
const rows: { file: string; thumb: string; fits: { id: string; score: number }[]; x: ReturnType<typeof styleInputs> }[] = [];
let n = 0;
for (const d of dirs) for (const f of (await readdir(d)).filter((x) => /\.(png|jpe?g)$/i.test(x)).sort()) {
  const { data, info } = await sharp(`${d}/${f}`).rotate().resize(256, 256, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = analyzePhoto(new Uint8ClampedArray(data), info.width, info.height, ++n);
  const thumb = `st/${n}.jpg`;
  await sharp(`${d}/${f}`).rotate().resize(220).jpeg({ quality: 70 }).toFile(`spike/out/${thumb}`);
  rows.push({ file: `${d}/${f}`, thumb, fits: scoreStyles(a).slice(0, 3), x: styleInputs(a) });
}
const by = new Map<string, typeof rows>();
for (const r of rows) by.set(r.fits[0].id, [...(by.get(r.fits[0].id) ?? []), r]);
const f2 = (v: number) => v.toFixed(2);
const html = `<!doctype html><meta charset=utf-8><title>Styles</title><body style="font:12px system-ui;background:#e6e6e6;padding:16px">
${STYLES.filter((s) => by.has(s.id)).map((s) => `<h2>${s.name} (${by.get(s.id)!.length})</h2><div style="display:flex;flex-wrap:wrap;gap:10px">${by.get(s.id)!.map((r) => `<figure style="margin:0;width:220px"><img src="${r.thumb}" width=220><figcaption>${r.fits.map((x) => `${x.id} ${f2(x.score)}`).join(" · ")}<br><small>L ${f2(r.x.L)} c ${f2(r.x.chroma)} warm ${f2(r.x.warm)} green ${f2(r.x.green)} cool ${f2(r.x.cool)} glow ${r.x.glow} col ${f2(r.x.colourful)} hiW ${f2(r.x.hiWarm)} shC ${f2(r.x.shCool)} p1 ${f2(r.x.black)}</small></figcaption></figure>`).join("")}</div>`).join("")}`;
await writeFile("spike/out/styles.html", html);
console.log(STYLES.map((s) => `${s.name}: ${by.get(s.id)?.length ?? 0}`).join(" | "));
