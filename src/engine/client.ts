/**
 * A small pool of analysis workers. Photos are analysed in parallel off the
 * main thread; grouping and compare run on one worker. Browser-only.
 */
import type { PhotoAnalysis } from "@/analysis/photo";
import type { FamilyResult, GroupSummary } from "@/analysis/group";
import type { CompareResult } from "@/analysis/compare";
import type { EditFit } from "@/analysis/editModel";
import type { ToneStats } from "@/analysis/photo";
import type { Request, Response } from "@/workers/protocol";

type Pending = { resolve: (r: Response) => void; reject: (e: Error) => void };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class AnalysisEngine {
  private workers: Worker[] = [];
  private busy: number[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private broken: string | null = null;

  constructor(size = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<Response>) => {
        this.busy[i]--;
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data);
        else p.reject(new Error(e.data.error));
      };
      w.onerror = (e) => {
        // a worker that cannot start fires a bare error event: fail loudly instead of hanging
        this.broken = e.message || "The analysis worker could not start in this page";
        for (const p of this.pending.values()) p.reject(new Error(this.broken));
        this.pending.clear();
      };
      this.workers.push(w);
      this.busy.push(0);
    }
  }

  private send(req: DistributiveOmit<Request, "id">): Promise<Response> {
    if (this.broken) return Promise.reject(new Error(this.broken));
    const id = this.nextId++;
    const i = this.busy.indexOf(Math.min(...this.busy)); // least-loaded worker
    this.busy[i]++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.workers[i].postMessage({ ...req, id } as Request);
    });
  }

  async analyze(file: Blob, seed: number): Promise<{ analysis: PhotoAnalysis; decodeMs: number }> {
    const r = await this.send({ kind: "analyze", file, seed });
    if (r.ok && r.kind === "analyze") return { analysis: r.analysis, decodeMs: r.decodeMs };
    throw new Error("Unexpected worker reply");
  }

  async group(photos: PhotoAnalysis[]): Promise<{ set: GroupSummary; families: FamilyResult }> {
    const r = await this.send({ kind: "group", photos });
    if (r.ok && r.kind === "group") return { set: r.set, families: r.families };
    throw new Error("Unexpected worker reply");
  }

  async compare(photo: PhotoAnalysis, families: FamilyResult, isJpeg = true): Promise<CompareResult> {
    const r = await this.send({ kind: "compare", photo, families, isJpeg });
    if (r.ok && r.kind === "compare") return r.result;
    throw new Error("Unexpected worker reply");
  }

  async fitEdit(lin: Float32Array, target: ToneStats): Promise<EditFit> {
    const r = await this.send({ kind: "fitEdit", lin, target });
    if (r.ok && r.kind === "fitEdit") return r.fit;
    throw new Error("Unexpected worker reply");
  }

  dispose() {
    this.workers.forEach((w) => w.terminate());
    for (const p of this.pending.values()) p.reject(new Error("Engine disposed"));
    this.pending.clear();
  }
}
