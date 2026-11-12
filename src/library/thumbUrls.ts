import type { PhotoRow } from "@/db/db";

/**
 * Object URLs for thumbnails, one per photo id, shared by every view.
 * At most 50 live at once; a URL is revoked when its photo is removed.
 */
const urls = new Map<string, string>();
export function thumbUrl(p: PhotoRow | undefined) {
  if (!p || !p.thumb.size) return undefined;
  let u = urls.get(p.id);
  if (!u) { u = URL.createObjectURL(p.thumb); urls.set(p.id, u); }
  return u;
}
export function forgetThumb(id: string) {
  const u = urls.get(id);
  if (u) { URL.revokeObjectURL(u); urls.delete(id); }
}
