/// <reference lib="webworker" />
/**
 * Analysis worker: decode + downscale with createImageBitmap/OffscreenCanvas,
 * then the pure analysis from src/analysis. Never touches the network.
 */
import { analyzePhoto } from "@/analysis/photo";
import { buildFamilies, summarize } from "@/analysis/group";
import { comparePhoto } from "@/analysis/compare";
import { fitEdit } from "@/analysis/editModel";
import { clippedShare, linearSample, neutralRender, shadowRoom } from "@/edit/measure";
import { CONFIG } from "@/analysis/config";
import type { Request, Response } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

async function decode(file: Blob) {
  const full = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, CONFIG.analysisLongEdge / Math.max(full.width, full.height));
  const w = Math.max(1, Math.round(full.width * s)), h = Math.max(1, Math.round(full.height * s));
  const bmp = await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
  full.close();
  const ctx = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D canvas in this browser");
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { rgba: ctx.getImageData(0, 0, w, h).data, w, h };
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  const reply = (r: Response, transfer: Transferable[] = []) => self.postMessage(r, transfer);
  try {
    if (req.kind === "analyze") {
      const t0 = performance.now();
      const { rgba, w, h } = await decode(req.file);
      const decodeMs = performance.now() - t0;
      const analysis = analyzePhoto(rgba, w, h, req.seed);
      const s = analysis.sample;
      reply({ id: req.id, ok: true, kind: "analyze", analysis, decodeMs }, [s.all.lab.buffer, s.all.w.buffer, s.top.lab.buffer, s.top.w.buffer, s.bottom.lab.buffer, s.bottom.w.buffer]);
    } else if (req.kind === "group") {
      reply({ id: req.id, ok: true, kind: "group", set: summarize(req.photos), families: buildFamilies(req.photos) });
    } else if (req.kind === "compare") {
      reply({ id: req.id, ok: true, kind: "compare", result: comparePhoto(req.photo, req.families, req.isJpeg) });
    } else if (req.kind === "fitEdit") {
      reply({ id: req.id, ok: true, kind: "fitEdit", fit: fitEdit(req.lin, req.target, 0.35, req.raw) });
    } else {
      const { px, width: w, height: h } = req;
      const r = neutralRender(px, w, h);
      const c = new OffscreenCanvas(r.width, r.height);
      c.getContext("2d")!.putImageData(new ImageData(r.rgba, r.width, r.height), 0, 0);
      const preview = await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
      const lin = linearSample(px, w, h);
      reply({ id: req.id, ok: true, kind: "measureRaw", preview, lin, clipped: clippedShare(px, w, h), stops: shadowRoom(px, w, h).stops }, [lin.buffer]);
    }
  } catch (err) {
    reply({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
