/**
 * The Inspiration library: add photos, analyse them in workers, regroup.
 * Families keep their ids (and user names) across regroups by matching
 * each new family to the old one it shares the most photos with.
 */
import { liveQuery } from "dexie";
import { db, isCurrent, type GroupingRow, type PhotoRow } from "@/db/db";
import { ANALYSIS_VERSION } from "@/analysis/config";
import { summarize, type Family } from "@/analysis/group";
import type { PhotoAnalysis } from "@/analysis/photo";
import { AnalysisEngine } from "@/engine/client";
import { makeThumb } from "./thumb";
import { forgetThumb } from "./thumbUrls";

export const MAX_PHOTOS = 50;
let engine: AnalysisEngine | null = null;
export const getEngine = () => (engine ??= new AnalysisEngine());

const kindOf = (t: string): PhotoRow["kind"] => (t === "image/jpeg" ? "jpeg" : t === "image/png" ? "png" : t === "image/webp" ? "webp" : "other");
const seedOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Store new files, then analyse them in parallel. Returns how many were accepted. */
export async function addPhotos(files: File[], onProgress?: (done: number, total: number) => void) {
  const d = db();
  const room = MAX_PHOTOS - (await d.photos.count());
  const accepted = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
  const rows: PhotoRow[] = [];
  for (const f of accepted) {
    const id = crypto.randomUUID();
    try {
      const { thumb, width, height } = await makeThumb(f);
      rows.push({ id, name: f.name, kind: kindOf(f.type), width, height, addedAt: Date.now(), original: f, thumb, status: "queued" });
    } catch (e) {
      rows.push({ id, name: f.name, kind: kindOf(f.type), width: 0, height: 0, addedAt: Date.now(), original: f, thumb: new Blob(), status: "error", error: e instanceof Error ? e.message : "Could not read this image" });
    }
  }
  await d.photos.bulkAdd(rows);
  await analysePending(onProgress);
  return accepted.length;
}

/** Analyse every photo without a current analysis (new photos, or after a version bump). */
export async function analysePending(onProgress?: (done: number, total: number) => void) {
  const d = db();
  const all = await d.photos.toArray();
  const have = new Map((await d.analyses.toArray()).map((a) => [a.photoId, a]));
  const todo = all.filter((p) => p.status !== "error" && !isCurrent(have.get(p.id)));
  let done = 0;
  onProgress?.(0, todo.length);
  await Promise.all(todo.map(async (p) => {
    await d.photos.update(p.id, { status: "analysing" });
    try {
      const { analysis } = await getEngine().analyze(p.original, seedOf(p.id));
      await d.analyses.put({ photoId: p.id, version: ANALYSIS_VERSION, analysis });
      await d.photos.update(p.id, { status: "done", error: undefined });
    } catch (e) {
      await d.photos.update(p.id, { status: "error", error: e instanceof Error ? e.message : "Analysis failed" });
    }
    onProgress?.(++done, todo.length);
  }));
  if (todo.length || !(await d.grouping.get("current"))) await regroup();
}

/** Re-cluster the set, keep family ids and names stable, apply the user's moves. */
export async function regroup() {
  const d = db();
  const photos = (await d.photos.orderBy("addedAt").toArray()).filter((p) => p.status === "done");
  const rows = new Map((await d.analyses.toArray()).map((a) => [a.photoId, a.analysis]));
  const ready = photos.filter((p) => rows.has(p.id));
  if (ready.length === 0) { await d.grouping.delete("current"); return; }
  const analyses = ready.map((p) => rows.get(p.id)!);
  const { set, families } = await getEngine().group(analyses);

  const prev = await d.grouping.get("current");
  const used = new Set<string>();
  const remap = new Map<string, string>();
  for (const f of families.families) {
    const ids = new Set(f.members.map((i) => ready[i].id));
    let best: string | null = null, overlap = 0;
    for (const [pid, mem] of Object.entries(prev?.members ?? {})) {
      if (used.has(pid)) continue;
      const o = mem.filter((x) => ids.has(x)).length;
      if (o > overlap) { overlap = o; best = pid; }
    }
    const id = best ?? `fam-${crypto.randomUUID().slice(0, 8)}`;
    used.add(id); remap.set(f.id, id);
  }
  for (const f of families.families) f.id = remap.get(f.id)!;

  const members: Record<string, string[]> = Object.fromEntries(families.families.map((f) => [f.id, f.members.map((i) => ready[i].id)]));
  // user moves win over the automatic assignment
  for (const p of ready) {
    if (!p.familyOverride || !members[p.familyOverride]) continue;
    for (const k of Object.keys(members)) members[k] = members[k].filter((x) => x !== p.id);
    members[p.familyOverride].push(p.id);
  }
  await resummarize(families.families, members, ready.map((p) => p.id), rows);
  const names = Object.fromEntries(Object.entries(prev?.names ?? {}).filter(([k]) => members[k]));
  const row: GroupingRow = { key: "current", version: ANALYSIS_VERSION, photoIds: ready.map((p) => p.id), set, families, members, names, updatedAt: Date.now() };
  await d.grouping.put(row);
}

/** Recompute a family's panels from its (possibly hand-edited) members. Runs locally: summaries are light. */
async function resummarize(fams: Family[], members: Record<string, string[]>, order: string[], rows: Map<string, PhotoAnalysis>) {
  for (const f of fams) {
    const ids = members[f.id];
    const same = ids.length === f.members.length && ids.every((x) => f.members.some((i) => order[i] === x));
    f.members = ids.map((x) => order.indexOf(x));
    if (!same && ids.length) f.summary = summarize(ids.map((x) => rows.get(x)!));
  }
}

export async function movePhoto(photoId: string, familyId: string) {
  await db().photos.update(photoId, { familyOverride: familyId });
  await regroup();
}

export async function renameFamily(familyId: string, name: string) {
  const g = await db().grouping.get("current");
  if (!g) return;
  await db().grouping.update("current", { names: { ...g.names, [familyId]: name.trim() } });
}

export async function removePhoto(id: string) {
  forgetThumb(id);
  await db().transaction("rw", db().photos, db().analyses, async () => { await db().photos.delete(id); await db().analyses.delete(id); });
  await regroup();
}

/** Live view for React (useSyncExternalStore). */
export interface LibraryState { loaded: boolean; photos: PhotoRow[]; analyses: Map<string, PhotoAnalysis>; grouping: GroupingRow | null }
const EMPTY: LibraryState = { loaded: false, photos: [], analyses: new Map(), grouping: null };
let state = EMPTY;
const listeners = new Set<() => void>();
let sub: { unsubscribe(): void } | null = null;
export function subscribeLibrary(cb: () => void) {
  listeners.add(cb);
  if (!sub) {
    sub = liveQuery(async () => {
      const d = db();
      const [photos, analyses, grouping] = await Promise.all([d.photos.orderBy("addedAt").toArray(), d.analyses.toArray(), d.grouping.get("current")]);
      return { loaded: true, photos, analyses: new Map(analyses.filter(isCurrent).map((a) => [a.photoId, a.analysis])), grouping: grouping ?? null };
    }).subscribe({ next: (s) => { state = s; listeners.forEach((l) => l()); }, error: () => { state = { ...state, loaded: true }; listeners.forEach((l) => l()); } });
  }
  return () => { listeners.delete(cb); if (!listeners.size) { sub?.unsubscribe(); sub = null; } };
}
export const getLibrary = () => state;
export const getServerLibrary = () => EMPTY;
