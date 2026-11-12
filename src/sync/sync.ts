/**
 * Two-way sync of DERIVED data. Never sends an original photo.
 *   push: dirty photos (metadata + EXIF-free WebP thumbnail + analysis), grouping, grid, deletions
 *   pull: rows changed remotely since the last pull; a remote photo arrives as thumbnail + analysis only
 * Conflicts: last writer wins per row (photos, analyses) and per document (grouping, grid).
 */
import { db, type PhotoRow } from "@/db/db";
import { ANALYSIS_VERSION } from "@/analysis/config";
import { supabase } from "./client";
import { analysisFromJson, analysisToJson, b64, f32 } from "./serialize";

export interface SyncResult { pushed: number; pulled: number; deleted: number; failed: { name: string; error: string }[] }
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
  const r: SyncResult = { pushed: 0, pulled: 0, deleted: 0, failed: [] };

  // this device's data belongs to one account: never push it into a different one
  const owner = (await d.meta.get("owner"))?.value;
  if (owner && owner !== user.id) throw new Error("This device holds another account's photos. Sign out and remove this device's data first, or sign back in to that account.");
  if (!owner) await d.meta.put({ key: "owner", value: user.id });
  // bookmark the pull BEFORE pushing, and skip what this run pushed, so nothing echoes straight back
  const since = (await d.meta.get(`pulledAt:${user.id}`))?.value ?? "1970-01-01T00:00:00Z";
  const pushedIds = new Set<string>();

  // ---- push deletions
  for (const t of await d.tombstones.toArray()) {
    const inq = t.id.startsWith("inq:");
    const id = inq ? t.id.slice(4) : t.id;
    const base = `${user.id}/${inq ? "inq-" : ""}${id}`;
    await sb.storage.from(BUCKET).remove([`${base}.webp`, `${base}.jpg`]);
    const { error } = await sb.from(inq ? "inquiries" : "photos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await d.tombstones.delete(t.id); r.deleted++;
  }

  // ---- push photos (+ thumbnail + analysis)
  const analyses = new Map((await d.analyses.toArray()).map((a) => [a.photoId, a]));
  for (const p of (await d.photos.toArray()).filter((x) => x.dirty !== false && x.status === "done")) {
    // one photo failing (e.g. an oversized thumbnail) must not stop the rest
    try {
      const ext = p.thumb.type === "image/jpeg" ? "jpg" : "webp";
      const path = `${user.id}/${p.id}.${ext}`;
      if (p.thumb.size) {
        const up = await sb.storage.from(BUCKET).upload(path, p.thumb, { upsert: true, contentType: p.thumb.type || "image/webp" });
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
      await d.photos.update(p.id, { dirty: false }); r.pushed++; pushedIds.add(p.id);
    } catch (e) {
      r.failed.push({ name: p.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ---- push Compare / Edit guide photos: analysis, measurements and thumbnail only
  for (const q of (await d.inquiries.toArray()).filter((x) => x.dirty !== false)) {
    try {
      const ext = q.thumb.type === "image/jpeg" ? "jpg" : "webp";
      const path = `${user.id}/inq-${q.id}.${ext}`;
      if (!q.fromSync && q.thumb.size) {
        const up = await sb.storage.from(BUCKET).upload(path, q.thumb, { upsert: true, contentType: q.thumb.type || "image/webp" });
        if (up.error) throw up.error;
      }
      const edit = q.edit ? { ...q.edit, lin: b64(q.edit.lin) } : null;
      const { error } = await sb.from("inquiries").upsert({
        id: q.id, user_id: user.id, kind: q.kind, name: q.name, created_at: new Date(q.createdAt).toISOString(), in_grid: q.inGrid,
        thumb_path: q.thumb.size ? path : null, data: { analysis: analysisToJson(q.analysis), edit }, deleted_at: null,
      });
      if (error) throw error;
      await d.inquiries.update(q.id, { dirty: false }); r.pushed++; pushedIds.add(`inq:${q.id}`);
    } catch (e) {
      r.failed.push({ name: q.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ---- push grouping and grid documents
  const g = await d.grouping.get("current");
  if (g && g.dirty !== false) {
    const { key: _k, dirty: _d, ...doc } = g;
    const { error } = await sb.from("groupings").upsert({ user_id: user.id, data: doc });
    if (error) throw error;
    await d.grouping.update("current", { dirty: false }); pushedIds.add("grouping");
  }
  const grid = await d.grid.get("current");
  if (grid && grid.dirty !== false) {
    const { key: _k, dirty: _d, ...doc } = grid;
    const { error } = await sb.from("grid_layouts").upsert({ user_id: user.id, data: doc });
    if (error) throw error;
    await d.grid.update("current", { dirty: false }); pushedIds.add("grid");
  }

  // ---- pull
  const { data: photos, error } = await sb.from("photos").select("*").gt("updated_at", since);
  if (error) throw error;
  const incoming = (photos ?? []).filter((x) => !pushedIds.has(x.id));
  const wanted = incoming.filter((x) => !x.deleted_at).map((x) => x.id);
  const remoteAnalyses = new Map<string, { version: number; data: Parameters<typeof analysisFromJson>[0] }>();
  for (let i = 0; i < wanted.length; i += 50) {
    const { data, error: e3 } = await sb.from("analyses").select("photo_id, version, data").in("photo_id", wanted.slice(i, i + 50));
    if (e3) throw e3;
    for (const a of data ?? []) remoteAnalyses.set(a.photo_id, a);
  }
  for (const rp of incoming) {
    const local = await d.photos.get(rp.id);
    if (rp.deleted_at) { if (local) { await d.photos.delete(rp.id); await d.analyses.delete(rp.id); r.pulled++; } continue; }
    if (local && local.dirty !== false) continue; // local edits win until pushed
    const ra = remoteAnalyses.get(rp.id);
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
  if (rg && !pushedIds.has("grouping") && (!local || local.dirty === false)) { await d.grouping.put({ ...rg.data, key: "current", dirty: false }); r.pulled++; }
  const lgrid = await d.grid.get("current");
  const { data: rgrid } = await sb.from("grid_layouts").select("*").gt("updated_at", since).maybeSingle();
  if (rgrid && !pushedIds.has("grid") && (!lgrid || lgrid.dirty === false)) { await d.grid.put({ ...rgrid.data, key: "current", dirty: false }); r.pulled++; }
  // ---- pull Compare / Edit guide photos (they arrive as thumbnail + analysis; the thumbnail stands in for the image)
  const { data: rinq, error: e4 } = await sb.from("inquiries").select("*").gt("updated_at", since);
  if (e4) throw e4;
  for (const rq of (rinq ?? []).filter((x) => !pushedIds.has(`inq:${x.id}`))) {
    const local = await d.inquiries.get(rq.id);
    if (rq.deleted_at) { if (local) { await d.inquiries.delete(rq.id); r.pulled++; } continue; }
    if (local && local.dirty !== false) continue; // local edits win until pushed
    let thumb = local?.thumb ?? new Blob();
    if (!local && rq.thumb_path) { const dl = await sb.storage.from(BUCKET).download(rq.thumb_path); if (dl.data) thumb = dl.data; }
    const e = rq.data.edit;
    await d.inquiries.put({
      id: rq.id, kind: rq.kind, name: rq.name, createdAt: Date.parse(rq.created_at), inGrid: rq.in_grid,
      image: local?.image ?? thumb, thumb, analysis: analysisFromJson(rq.data.analysis),
      edit: e ? { ...e, lin: f32(e.lin) } : undefined, dirty: false, fromSync: local ? local.fromSync : true,
    });
    r.pulled++;
  }

  // bookmark by server time (never the device clock) so clock drift cannot skip rows
  const newest = [since, ...(photos ?? []).map((x) => x.updated_at), ...(rinq ?? []).map((x) => x.updated_at), rg?.updated_at, rgrid?.updated_at].filter(Boolean).sort().at(-1)!;
  await d.meta.put({ key: `pulledAt:${user.id}`, value: newest });
  return r;
}
