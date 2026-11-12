/**
 * Local-first working copy (IndexedDB via Dexie). Originals live ONLY here;
 * sync (later in Phase 3) sends derived data and small thumbnails, never `original`.
 */
import Dexie, { type EntityTable } from "dexie";
import type { PhotoAnalysis } from "@/analysis/photo";
import type { FamilyResult, GroupSummary } from "@/analysis/group";
import { ANALYSIS_VERSION } from "@/analysis/config";

export type PhotoStatus = "queued" | "analysing" | "done" | "error";

export interface PhotoRow {
  id: string;
  name: string;
  kind: "jpeg" | "png" | "webp" | "other";
  width: number;
  height: number;
  addedAt: number;
  /** the file as the user gave it: never synced */
  original: Blob;
  /** ≤ 400 px WebP re-encoded through a canvas, so no EXIF or GPS */
  thumb: Blob;
  status: PhotoStatus;
  error?: string;
  /** set when the user moved this photo to a family by hand */
  familyOverride?: string;
}

export interface AnalysisRow { photoId: string; version: number; analysis: PhotoAnalysis }

/** One row: the latest grouping of the whole set. */
export interface GroupingRow {
  key: "current";
  version: number;
  photoIds: string[];
  set: GroupSummary;
  families: FamilyResult;
  /** family id → photo ids after the user's moves were applied */
  members: Record<string, string[]>;
  /** family id → the name the user gave it */
  names: Record<string, string>;
  updatedAt: number;
}

export interface GridRow { key: "current"; order: string[]; mode: "added" | "family" | "flow" | "custom"; theme: "light" | "dark"; showFlow: boolean }

export class ColorwayDB extends Dexie {
  grid!: EntityTable<GridRow, "key">;
  photos!: EntityTable<PhotoRow, "id">;
  analyses!: EntityTable<AnalysisRow, "photoId">;
  grouping!: EntityTable<GroupingRow, "key">;
  constructor() {
    super("colorway");
    this.version(1).stores({ photos: "id, addedAt, status", analyses: "photoId, version", grouping: "key" });
    this.version(2).stores({ grid: "key" });
  }
}

let instance: ColorwayDB | null = null;
export const db = () => (instance ??= new ColorwayDB());
export const isCurrent = (a: AnalysisRow | undefined) => !!a && a.version === ANALYSIS_VERSION;
