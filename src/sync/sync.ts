/**
 * Two-way sync of DERIVED data. Never sends an original photo.
 *   push: dirty photos (metadata + EXIF-free WebP thumbnail + analysis), grouping, grid, deletions
 *   pull: rows changed remotely since the last pull; a remote photo arrives as thumbnail + analysis only
 * Conflicts: last writer wins per row (photos, analyses) and per document (grouping, grid).
 */
import { db, type PhotoRow } from "@/db/db";
import { ANALYSIS_VERSION } from "@/analysis/config";
import { supabase } from "./client";
import { analysisFromJson, analysisToJson } from "./serialize";

export interface SyncResult { pushed: number; pulled: number; deleted: number }
const BUCKET = "thumbs";
let running: Promise<SyncResult> | null = null;

export function syncNow(): Promise<SyncResult> {
  return (running ??= run().finally(() => { running = null; }));
}

async function run(): Promise<SyncResult> {
  const sb = supabase();
  if (!sb) throw new Error("Sync is not configured");
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const d = db();
  const r: SyncResult = { pushed: 0, pulled: 0, deleted: 0 };

  // ---- push deletions
  for (const t of await d.tombstones.toArray()) {
    await sb.storage.from(BUCKET).remove([`${user.id}/${t.id}.webp`]);
    const { error } = await sb.from("photos").update({ deleted_at: new Date().toISOString() }).eq("id", t.id);
    if (error) throw error;
    await d.tombstones.delete(t.id); r.deleted++;
  }

  // ---- push photos (+ thumbnail + analysis)
  const analyses = new Map((await d.analyses.toArray()).map((a) => [a.photoId, a]));
  for (const p of (await d.photos.toArray()).filter((x) => x.dirty !== false && x.status === "done")) {
    const path = `${user.id}/${p.id}.webp`;
    if (p.thumb.size) {
      const up = await sb.storage.from(BUCKET).upload(path, p.thumb, { upsert: true, contentType: "image/webp" });
      if (up.error) throw up.error;
    }
    const row = { id: p.id, user_id: user.id, name: p.name, kind: p.kind, width: p.width, height: p.height, added_at: new Date(p.addedAt).toISOString(), family_override: p.familyOverride ?? null, thumb_path: p.thumb.size ? path : null, deleted_at: null };
    const { error } = await sb.from("photos").upsert(row);
    if (error) throw error;
    const a = analyses.get(p.id);
    if (a) {
      const { error: e2 } = await sb.from("analyses").upsert({ photo_id: p.id, user_id: user.id, version: a.version, data: analysisToJson(a.analysis) });
      if (e2) throw e2;
    }
    await d.photos.update(p.id, { dirty: false }); r.pushed++;
  }

  // ---- push grouping and grid documents
  const g = await d.grouping.get("current");
  if (g && g.dirty !== false) {
    const { key: _k, dirty: _d, ...doc } = g;
    const { error } = await sb.from("groupings").upsert({ user_id: user.id, data: doc });
    if (error) throw error;
    await d.grouping.update("current", { dirty: false });
  }
  const grid = await d.grid.get("current");
  if (grid && grid.dirty !== false) {
    const { key: _k, dirty: _d, ...doc } = grid;
    const { error } = await sb.from("grid_layouts").upsert({ user_id: user.id, data: doc });
    if (error) throw error;
    await d.grid.update("current", { dirty: false });
  }

  // ---- pull
  const since = (await d.meta.get(`pulledAt:${user.id}`))?.value ?? "1970-01-01T00:00:00Z";
  const { data: photos, error } = await sb.from("photos").select("*").gt("updated_at", since);
  if (error) throw error;
  for (const rp of photos ?? []) {
    const local = await d.photos.get(rp.id);
    if (rp.deleted_at) { if (local) { await d.photos.delete(rp.id); await d.analyses.delete(rp.id); r.pulled++; } continue; }
    if (local && local.dirty !== false) continue; // local edits win until pushed
    const { data: ra } = await sb.from("analyses").select("*").eq("photo_id", rp.id).maybeSingle();
    let thumb = local?.thumb ?? new Blob();
    if (!local && rp.thumb_path) {
      const dl = await sb.storage.from(BUCKET).download(rp.thumb_path);
      if (dl.data) thumb = dl.data;
    }
    const row: PhotoRow = {
      id: rp.id, name: rp.name, kind: rp.kind, width: rp.width, height: rp.height, addedAt: Date.parse(rp.added_at),
      original: local?.original, thumb, status: ra ? "done" : "error", error: ra ? undefined : "No analysis synced", familyOverride: rp.family_override ?? undefined, dirty: false,
    };
    await d.photos.put(row);
    if (ra && ra.version === ANALYSIS_VERSION) await d.analyses.put({ photoId: rp.id, version: ra.version, analysis: analysisFromJson(ra.data) });
    r.pulled++;
  }
  const local = await d.grouping.get("current");
  const { data: rg } = await sb.from("groupings").select("*").gt("updated_at", since).maybeSingle();
  if (rg && (!local || local.dirty === false)) { await d.grouping.put({ ...rg.data, key: "current", dirty: false }); r.pulled++; }
  const lgrid = await d.grid.get("current");
  const { data: rgrid } = await sb.from("grid_layouts").select("*").gt("updated_at", since).maybeSingle();
  if (rgrid && (!lgrid || lgrid.dirty === false)) { await d.grid.put({ ...rgrid.data, key: "current", dirty: false }); r.pulled++; }
  // bookmark by server time (never the device clock) so clock drift cannot skip rows
  const newest = [since, ...(photos ?? []).map((x) => x.updated_at), rg?.updated_at, rgrid?.updated_at].filter(Boolean).sort().at(-1)!;
  await d.meta.put({ key: `pulledAt:${user.id}`, value: newest });
  return r;
}
