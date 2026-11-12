"use client";
/** Auth + sync status for the UI (one store, many readers). */
import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";

export interface SyncStatus { configured: boolean; user: User | null; ready: boolean; state: "idle" | "syncing" | "error" | "offline"; lastSyncedAt: number | null; error: string | null }
let status: SyncStatus = { configured: false, user: null, ready: false, state: "idle", lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();
export const setStatus = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
const SERVER: SyncStatus = { ...status };
export const useSyncStatus = () => useSyncExternalStore(subscribe, () => status, () => SERVER);
