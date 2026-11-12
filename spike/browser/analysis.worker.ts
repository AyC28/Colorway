// Analysis worker: decode + downscale with createImageBitmap/OffscreenCanvas, then the same pure analysis as Node.
import { analyzePhoto } from "../../src/analysis/photo";
import { CONFIG } from "../../src/analysis/config";
self.onmessage = async (e: MessageEvent<{ id: number; blob: Blob }>) => {
  const t0 = performance.now();
  const bmp0 = await createImageBitmap(e.data.blob);
  const s = CONFIG.analysisLongEdge / Math.max(bmp0.width, bmp0.height);
  const w = Math.round(bmp0.width * s), h = Math.round(bmp0.height * s);
  const bmp = await createImageBitmap(bmp0, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
  bmp0.close();
  const ctx = new OffscreenCanvas(w, h).getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const t1 = performance.now();
  const a = analyzePhoto(rgba, w, h, e.data.id + 1);
  (self as any).postMessage({ id: e.data.id, decodeMs: t1 - t0, analysisMs: a.ms, glow: a.glow.score, top: a.palette[0]?.hex });
};
