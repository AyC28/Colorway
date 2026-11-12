/** Messages between the UI and the analysis worker. Everything here is structured-clone safe. */
import type { PhotoAnalysis } from "@/analysis/photo";
import type { GroupSummary, FamilyResult } from "@/analysis/group";
import type { CompareResult } from "@/analysis/compare";
import type { EditFit } from "@/analysis/editModel";
import type { ToneStats } from "@/analysis/photo";

export type Request =
  | { id: number; kind: "analyze"; file: Blob; seed: number }
  | { id: number; kind: "group"; photos: PhotoAnalysis[] }
  | { id: number; kind: "compare"; photo: PhotoAnalysis; families: FamilyResult; isJpeg: boolean }
  | { id: number; kind: "fitEdit"; lin: Float32Array; target: ToneStats; raw: boolean }
  | { id: number; kind: "measureRaw"; px: Uint16Array; width: number; height: number };

export type Response =
  | { id: number; ok: true; kind: "analyze"; analysis: PhotoAnalysis; decodeMs: number }
  | { id: number; ok: true; kind: "group"; set: GroupSummary; families: FamilyResult }
  | { id: number; ok: true; kind: "compare"; result: CompareResult }
  | { id: number; ok: true; kind: "fitEdit"; fit: EditFit }
  | { id: number; ok: true; kind: "measureRaw"; preview: Blob; lin: Float32Array; clipped: number; stops: number }
  | { id: number; ok: false; error: string };
