import LibRaw from "libraw-wasm";

const log = (s: string) => { document.getElementById("log")!.textContent += s + "\n"; };
const results: any = { isolated: crossOriginIsolated, ua: navigator.userAgent, cores: navigator.hardwareConcurrency, raw: [], analysis: null };
(window as any).__results = results;

async function mem(): Promise<number | null> {
  const p: any = performance;
  if (!p.measureUserAgentSpecificMemory) return null;
  try { return (await p.measureUserAgentSpecificMemory()).bytes / 1048576; } catch { return null; }
}

async function rawTest(file: string, settings: any, label: string) {
  const buf = new Uint8Array(await (await fetch(`/reference/${file}`)).arrayBuffer());
  const raw = new LibRaw();
  const t0 = performance.now();
  await raw.open(buf, settings);
  const meta: any = await raw.metadata(true);
  const img: any = await raw.imageData();
  const ms = performance.now() - t0;
  const m = await mem();
  raw.dispose();
  const r = { file, label, ms: Math.round(ms), width: img.width, height: img.height, bits: img.bits, uaMemoryMb: m && Math.round(m), cam_mul: Array.from(meta.color_data?.cam_mul ?? []), quality: meta.canon?.Quality };
  results.raw.push(r);
  log(JSON.stringify(r));
}

async function analysisTest() {
  const files: string[] = await (await fetch("/reference/index.json")).json();
  const blobs = await Promise.all(files.map(async (f) => (await fetch(`/reference/${encodeURIComponent(f)}`)).blob()));
  const n = Math.min(4, navigator.hardwareConcurrency || 4);
  const workers = Array.from({ length: n }, () => new Worker("/spike/browser/dist/analysis.worker.js", { type: "module" }));
  // main-thread responsiveness probe: longest gap between animation frames
  let maxGap = 0, last = performance.now(), running = true;
  const tick = () => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; if (running) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const t0 = performance.now();
  const per: any[] = [];
  let next = 0;
  await Promise.all(workers.map((w) => new Promise<void>((done) => {
    const send = () => { if (next >= blobs.length) return done(); const id = next++; w.postMessage({ id, blob: blobs[id] }); };
    w.onmessage = (e) => { per.push(e.data); send(); };
    send();
  })));
  const wall = performance.now() - t0;
  running = false;
  workers.forEach((w) => w.terminate());
  const avg = (k: string) => per.reduce((s, p) => s + p[k], 0) / per.length;
  results.analysis = { photos: per.length, workers: n, wallMs: Math.round(wall), avgDecodeMs: Math.round(avg("decodeMs")), avgAnalysisMs: Math.round(avg("analysisMs")), projected50s: +((wall / per.length) * 50 / 1000).toFixed(1), maxFrameGapMs: Math.round(maxGap) };
  log("analysis " + JSON.stringify(results.analysis));
}

(async () => {
  log(`crossOriginIsolated=${crossOriginIsolated} cores=${navigator.hardwareConcurrency}`);
  try {
    await analysisTest();
    const linear = { outputBps: 16, gamm: [1, 1], noAutoBright: true, useCameraWb: true, outputColor: 1, userQual: 0 };
    for (const f of ["raw-test.CR3", "raw-test-2.CR3"]) {
      await rawTest(f, linear, "full linear16");
      await rawTest(f, { ...linear, halfSize: true }, "half linear16");
    }
  } catch (e: any) { results.error = String(e?.message ?? e); log("ERROR " + results.error); }
  results.done = true;
  log("done");
})();
