"use client";
import { useSyncExternalStore } from "react";
import { getLibrary, getServerLibrary, subscribeLibrary } from "./library";
import type { PhotoRow } from "@/db/db";
import { thumbUrl } from "./thumbUrls";

export { thumbUrl };

export const useLibrary = () => useSyncExternalStore(subscribeLibrary, getLibrary, getServerLibrary);

export function useThumbUrls(photos: PhotoRow[]) {
  const byId = new Map(photos.map((p) => [p.id, p]));
  return (id: string) => thumbUrl(byId.get(id));
}
