"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/ui/SiteHeader";
import { useLibrary } from "@/library/hooks";
import { supabase } from "./client";
import { syncNow } from "./sync";
import { setStatus, useSyncStatus } from "./status";

export function AccountView() {
  const s = useSyncStatus();
  const lib = useLibrary();
  const router = useRouter();
  const sync = async () => {
    setStatus({ state: "syncing", error: null });
    try { await syncNow(); setStatus({ state: "idle", lastSyncedAt: Date.now() }); } catch (e) { setStatus({ state: "error", error: e instanceof Error ? e.message : "Sync failed" }); }
  };
  const signOut = async () => { await supabase()?.auth.signOut(); router.replace("/"); };
  const pending = lib.photos.filter((p) => p.dirty !== false && p.status === "done").length;

  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Your account</h1></div>
        {!s.ready ? <div className="skeleton" aria-hidden="true"><div className="sk-row" /></div> : !s.user ? (
          <section className="card empty"><h2 className="card-h">Not signed in</h2><p className="note">Your work is saved on this device. Sign in to sync it to your other devices.</p><Link className="btn btn-primary" href="/login">Sign in</Link></section>
        ) : (
          <section className="card account" aria-labelledby="acc-h">
            <h2 id="acc-h" className="card-h">{s.user.email}</h2>
            <dl className="ro-list">
              <div><dt>Sync</dt><dd role="status">{s.state === "syncing" ? "Syncing…" : s.state === "offline" ? "Offline: changes wait on this device" : s.state === "error" ? `Failed: ${s.error}` : s.lastSyncedAt ? `Up to date, last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}` : "Waiting for the first sync"}</dd></div>
              <div><dt>On this device</dt><dd><span className="num">{lib.photos.length}</span> photos, <span className="num">{pending}</span> waiting to sync</dd></div>
              <div><dt>What syncs</dt><dd>Palettes, families and their names, grid order, and 400-pixel thumbnails with no camera or location data. Original photos stay on the device you added them on.</dd></div>
            </dl>
            <div className="actions"><button type="button" className="btn btn-primary" onClick={sync} disabled={s.state === "syncing"}>Sync now</button><button type="button" className="btn btn-secondary" onClick={signOut}>Sign out</button></div>
          </section>
        )}
      </main>
    </>
  );
}
