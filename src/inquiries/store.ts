"use client";
/** Saved Compare / Edit guide photos ("inquiries"): local-only, newest first. */
import { useSyncExternalStore } from "react";
import { liveQuery } from "dexie";
import { db, type InquiryRow } from "@/db/db";

export async function saveInquiry(row: Omit<InquiryRow, "id" | "createdAt" | "inGrid">): Promise<string> {
  const id = crypto.randomUUID();
  await db().inquiries.add({ ...row, id, createdAt: Date.now(), inGrid: true });
  return id;
}
export const deleteInquiry = (id: string) => { forget(id); return db().inquiries.delete(id); };
export const setInGrid = (id: string, inGrid: boolean) => db().inquiries.update(id, { inGrid });
export const setEditTarget = (id: string, targetId: string) => db().inquiries.where("id").equals(id).modify((r) => { if (r.edit) r.edit.targetId = targetId; });

let state: { loaded: boolean; rows: InquiryRow[] } = { loaded: false, rows: [] };
const SERVER = state;
const listeners = new Set<() => void>();
let sub: { unsubscribe(): void } | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!sub) sub = liveQuery(() => db().inquiries.orderBy("createdAt").reverse().toArray()).subscribe({
    next: (rows) => { state = { loaded: true, rows }; listeners.forEach((l) => l()); },
    error: () => { state = { ...state, loaded: true }; listeners.forEach((l) => l()); },
  });
  return () => { listeners.delete(cb); if (!listeners.size) { sub?.unsubscribe(); sub = null; } };
}
export const useInquiries = () => useSyncExternalStore(subscribe, () => state, () => SERVER);

/** Object URLs per inquiry, shared by every view, revoked on delete. */
const urls = new Map<string, string>();
function url(key: string, blob: Blob) { let u = urls.get(key); if (!u) { u = URL.createObjectURL(blob); urls.set(key, u); } return u; }
export const inquiryThumb = (r: InquiryRow) => url(`t:${r.id}`, r.thumb);
export const inquiryImage = (r: InquiryRow) => url(`i:${r.id}`, r.image);
function forget(id: string) { for (const k of [`t:${id}`, `i:${id}`]) { const u = urls.get(k); if (u) { URL.revokeObjectURL(u); urls.delete(k); } } }
