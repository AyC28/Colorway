/**
 * RAW sub-spike (Node): decode R6 CR3 files with libraw-wasm and report time + memory.
 * libraw-wasm ships a browser Web Worker; here we run that same worker.js inside a
 * Node worker_thread with a tiny `self`/`postMessage` shim.
 * Usage: npm run spike:raw
 */
import { Worker } from "node:worker_threads";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const libDir = dirname(require.resolve("libraw-wasm/package.json"));
const workerUrl = new URL(`file://${join(libDir, "dist/worker.js")}`).href;

const shim = `
import { parentPort } from "node:worker_threads";
import { readFile } from "node:fs/promises";
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u);
  if (s.startsWith("file:")) return new Response(await readFile(new URL(s)), { headers: { "content-type": "application/wasm" } });
  return realFetch(u, o);
};
globalThis.self = globalThis;
globalThis.postMessage = (d, t) => parentPort.postMessage(d, t);
await import(${JSON.stringify(workerUrl)});
parentPort.on("message", (d) => globalThis.onmessage({ data: d }));
`;

function client() {
  const w = new Worker(new URL(`data:text/javascript,${encodeURIComponent(shim)}`), { resourceLimits: { maxOldGenerationSizeMb: 4096 } });
  let id = 0;
  const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  w.on("message", (m: any) => {
    const p = pending.get(m?.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error)) : p.res(m.out);
  });
  w.on("error", (e) => { for (const p of pending.values()) p.rej(e); });
  const call = (fn: string, ...args: any[]) =>
    new Promise<any>((res, rej) => { const i = id++; pending.set(i, { res, rej }); w.postMessage({ id: i, fn, args }); });
  return { call, close: () => w.terminate() };
}

let peakRss = 0;
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 20);

async function decode(file: string, settings: Record<string, unknown>, label: string) {
  const buf = new Uint8Array(await readFile(file));
  const c = client();
  peakRss = process.memoryUsage().rss;
  const t0 = performance.now();
  await c.call("open", buf, settings);
  const tOpen = performance.now();
  const meta = await c.call("metadata", true);
  const img = await c.call("imageData");
  const t1 = performance.now();
  c.close();
  return { label, file, openMs: tOpen - t0, totalMs: t1 - t0, peakRssMb: peakRss / 1048576, meta, img };
}

async function main() {
  await mkdir("spike/out/raw", { recursive: true });
  const files = ["reference/raw-test.CR3", "reference/raw-test-2.CR3"];
  const report: any[] = [];
  // linear 16-bit, camera WB, no auto-brightness: what the edit model needs
  const linear = { outputBps: 16, gamm: [1, 1], noAutoBright: true, useCameraWb: true, outputColor: 1, userQual: 0 };
  for (const f of files) {
    const size = (await stat(f)).size;
    for (const [label, s] of [
      ["full, linear 16-bit", linear],
      ["half-size, linear 16-bit", { ...linear, halfSize: true }],
    ] as const) {
      try {
        const r = await decode(f, s as any, label);
        const { width, height, bits, colors } = r.img;
        const m = r.meta;
        report.push({
          file: f, sizeMb: +(size / 1048576).toFixed(1), mode: label,
          ms: Math.round(r.totalMs), openMs: Math.round(r.openMs), peakRssMb: Math.round(r.peakRssMb),
          out: { width, height, bits, colors },
          camera: `${m.make ?? ""} ${m.model ?? ""}`.trim(),
          iso: m.iso_speed, shutter: m.shutter, aperture: m.aperture,
          rawSize: m.raw_width && `${m.raw_width}×${m.raw_height}`,
          asShotWB: m.cam_mul, maximum: m.maximum, black: m.black,
          colorData: Object.fromEntries(Object.entries(m.color_data ?? {}).filter(([k]) => /cam_mul|pre_mul|maximum|black$|as_shot|WB|cblack/i.test(k)).map(([k, v]: any) => [k, Array.isArray(v) || ArrayBuffer.isView(v) ? Array.from(v as any).slice(0, 8) : v])),
          canon: { Quality: m.canon?.Quality, RecordMode: m.canon?.RecordMode, SpecularWhiteLevel: m.canon?.SpecularWhiteLevel, NormalWhiteLevel: m.canon?.NormalWhiteLevel, AverageBlackLevel: m.canon?.AverageBlackLevel, HighlightTonePriority: m.canon?.HighlightTonePriority },
        });
        if (label.startsWith("half")) {
          // preview: linear → display gamma for a quick visual check
          const px = r.img.data as Uint16Array;
          const out = Buffer.alloc((px.length / 3) * 3);
          for (let i = 0; i < px.length; i++) {
            const v = px[i] / 65535;
            out[i] = Math.round(255 * Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
          }
          await sharp(out, { raw: { width, height, channels: 3 } }).resize(900).jpeg().toFile(`spike/out/raw/${f.split("/").pop()}.jpg`);
        }
        console.log(f, label, Math.round(r.totalMs), "ms", Math.round(r.peakRssMb), "MB");
      } catch (e: any) {
        report.push({ file: f, mode: label, error: e.message });
        console.log(f, label, "FAILED", e.message);
      }
    }
  }
  clearInterval(sampler);
  await writeFile("spike/out/raw/node-report.json", JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
