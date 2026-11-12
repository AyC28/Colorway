"use client";
/** Keeps the local copy and the account in step while signed in. Renders nothing. */
import { useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/db/db";
import { supabase } from "./client";
import { syncNow } from "./sync";
import { setStatus } from "./status";

export function SyncProvider() {
  useEffect(() => {
    const sb = supabase();
    setStatus({ configured: !!sb });
    if (!sb) { setStatus({ ready: true }); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let signedIn = false;
    const go = async () => {
      if (!signedIn) return;
      if (!navigator.onLine) { setStatus({ state: "offline" }); return; }
      setStatus({ state: "syncing", error: null });
      try {
        const r = await syncNow();
        if (r.failed.length) setStatus({ state: "error", error: `${r.failed.length} photo${r.failed.length > 1 ? "s" : ""} did not sync: ${r.failed[0].error}` });
        else setStatus({ state: "idle", lastSyncedAt: Date.now() });
      }
      catch (e) { setStatus({ state: "error", error: e instanceof Error ? e.message : "Sync failed" }); }
    };
    const soon = () => { if (timer) clearTimeout(timer); timer = setTimeout(go, 3000); };

    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      signedIn = !!session?.user;
      setStatus({ user: session?.user ?? null, ready: true });
      if (signedIn) soon();
    });
    // local edits mark rows dirty: push a few seconds after the last one
    const dirty = liveQuery(async () => {
      const d = db();
      const [p, t, g, grid] = await Promise.all([d.photos.filter((x) => x.dirty !== false && x.status === "done").count(), d.tombstones.count(), d.grouping.get("current"), d.grid.get("current")]);
      return p + t + (g && g.dirty !== false ? 1 : 0) + (grid && grid.dirty !== false ? 1 : 0);
    }).subscribe((n) => { if (n > 0) soon(); });
    const every = setInterval(go, 60_000);
    const online = () => soon();
    window.addEventListener("online", online);
    return () => { sub.subscription.unsubscribe(); dirty.unsubscribe(); clearInterval(every); window.removeEventListener("online", online); if (timer) clearTimeout(timer); };
  }, []);
  return null;
}
