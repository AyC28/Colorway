/** Messages between the UI and the analysis worker. Everything here is structured-clone safe. */
import type { PhotoAnalysis } from "@/analysis/photo";
import type { GroupSummary, FamilyResult } from "@/analysis/group";
import type { CompareResult } from "@/analysis/compare";

export type Request =
  | { id: number; kind: "analyze"; file: Blob; seed: number }
  | { id: number; kind: "group"; photos: PhotoAnalysis[] }
  | { id: number; kind: "compare"; photo: PhotoAnalysis; families: FamilyResult; isJpeg: boolean };

export type Response =
  | { id: number; ok: true; kind: "analyze"; analysis: PhotoAnalysis; decodeMs: number }
  | { id: number; ok: true; kind: "group"; set: GroupSummary; families: FamilyResult }
  | { id: number; ok: true; kind: "compare"; result: CompareResult }
  | { id: number; ok: false; error: string };
