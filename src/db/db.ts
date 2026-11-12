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
  /** the file as the user gave it: never synced, so absent on other devices */
  original?: Blob;
  /** ≤ 400 px WebP re-encoded through a canvas, so no EXIF or GPS */
  thumb: Blob;
  status: PhotoStatus;
  error?: string;
  /** set when the user moved this photo to a family by hand */
  familyOverride?: string;
  /** changed since the last push (undefined counts as dirty) */
  dirty?: boolean;
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
  dirty?: boolean;
}

export interface GridRow { key: "current"; order: string[]; mode: "added" | "family" | "flow" | "custom"; theme: "light" | "dark"; showFlow: boolean; dirty?: boolean }
/**
 * A photo opened in Compare or the Edit guide, kept on this device so it survives
 * tab switches and can be reopened later. Never synced (like originals).
 * Results are recomputed on open, so they follow the current families.
 */
export interface InquiryRow {
  id: string;
  kind: "compare" | "edit";
  name: string;
  createdAt: number;
  /** what the page shows: the JPEG/PNG itself, or our neutral render of a RAW */
  image: Blob;
  /** ≤ 400 px thumbnail for lists and the grid */
  thumb: Blob;
  analysis: PhotoAnalysis;
  /** shown in the Grid preview */
  inGrid: boolean;
  /** Edit guide only */
  edit?: {
    lin: Float32Array;
    clipped: number | null;
    stops: number | null;
    raw: { camera: string; iso: number; shutter: number; aperture: number; craw: boolean; asShot: { rOverG: number; bOverG: number } | null; decodeMs: number } | null;
    targetId?: string;
  };
}

/** Deleted photos waiting to be deleted remotely. */
export interface TombstoneRow { id: string; at: number }
/** Small key-value store for sync bookkeeping. */
export interface MetaRow { key: string; value: string }

export class ColorwayDB extends Dexie {
  grid!: EntityTable<GridRow, "key">;
  tombstones!: EntityTable<TombstoneRow, "id">;
  meta!: EntityTable<MetaRow, "key">;
  inquiries!: EntityTable<InquiryRow, "id">;
  photos!: EntityTable<PhotoRow, "id">;
  analyses!: EntityTable<AnalysisRow, "photoId">;
  grouping!: EntityTable<GroupingRow, "key">;
  constructor() {
    super("colorway");
    this.version(1).stores({ photos: "id, addedAt, status", analyses: "photoId, version", grouping: "key" });
    this.version(2).stores({ grid: "key" });
    this.version(3).stores({ tombstones: "id", meta: "key" });
    this.version(4).stores({ inquiries: "id, kind, createdAt" });
  }
}

let instance: ColorwayDB | null = null;
export const db = () => (instance ??= new ColorwayDB());
export const isCurrent = (a: AnalysisRow | undefined) => !!a && a.version === ANALYSIS_VERSION;
