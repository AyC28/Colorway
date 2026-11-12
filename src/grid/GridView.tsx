"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { liveQuery } from "dexie";
import { SiteHeader } from "@/ui/SiteHeader";
import { useLibrary } from "@/library/hooks";
import { useInquiries, inquiryThumb, inquiryImage, setInGrid } from "@/inquiries/store";
import { matchFamilies } from "@/analysis/compare";
import type { PhotoAnalysis } from "@/analysis/photo";
import { db, type GridRow } from "@/db/db";
import { biggestJumps, byFamily, moveTo, smoothFlow } from "./order";

const GridIcon = () => <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M2 2h16v16H2zM7.33 2v16M12.67 2v16M2 7.33h16M2 12.67h16" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
const SavedIcon = () => <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 2.5h10v15l-5-4-5 4z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
const DEFAULT: GridRow = { key: "current", order: [], mode: "flow", theme: "light", showFlow: true };
const MODES: [GridRow["mode"], string][] = [["added", "As added"], ["family", "By family"], ["flow", "Smooth colour flow"]];

export function GridView() {
  const lib = useLibrary();
  const inq = useInquiries();
  // the grid previews YOUR photos: the ones opened in Compare and the Edit guide
  const all = [...inq.rows].sort((a, b) => b.createdAt - a.createdAt);
  const byId = new Map(all.map((r) => [r.id, r]));
  const thumb = (id: string) => { const r = byId.get(id); return r ? inquiryThumb(r) : undefined; };
  const analyses = new Map<string, PhotoAnalysis>(all.map((r) => [r.id, r.analysis]));
  const [grid, setGrid] = useState<GridRow>(DEFAULT);
  const [open, setOpen] = useState<{ id: string; url: string } | null>(null);
  const [say, setSay] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => { const s = liveQuery(() => db().grid.get("current")).subscribe((r) => setGrid(r ?? DEFAULT)); return () => s.unsubscribe(); }, []);
  const save = (patch: Partial<GridRow>) => { const next = { ...grid, ...patch, dirty: true }; setGrid(next); void db().grid.put(next); };

  const done = all.filter((r) => r.inGrid);
  const added = done.map((r) => r.id); // newest first, like a profile
  // "by family": each photo's closest family from the reference look
  const famOf: Record<string, string[]> = {};
  if (lib.grouping) for (const r of done) { const m = matchFamilies(r.analysis, lib.grouping.families)[0]; if (m) (famOf[m.id] ??= []).push(r.id); }
  const order =
    grid.mode === "custom" ? [...grid.order.filter((id) => added.includes(id)), ...added.filter((id) => !grid.order.includes(id))]
    : grid.mode === "family" ? byFamily(added, famOf)
    : grid.mode === "flow" ? smoothFlow(added, analyses) : added;
  const jumps = biggestJumps(order.slice(0, 18), analyses);
  const nameOf = (id: string) => byId.get(id)?.name ?? "photo";

  const reorder = (id: string, to: number) => {
    const next = moveTo(order, id, to);
    save({ mode: "custom", order: next });
    setSay(`${nameOf(id)} moved to position ${next.indexOf(id) + 1} of ${next.length}`);
  };
  const show = (id: string) => {
    const r = byId.get(id);
    if (!r) return;
    setOpen({ id, url: inquiryImage(r) });
    requestAnimationFrame(() => dialog.current?.showModal());
  };
  const close = () => { dialog.current?.close(); setOpen(null); };

  return (
    <>
      <SiteHeader />
      <main className="container" data-theme={grid.theme}>
        <div className="intro"><h1>Grid preview</h1><p className="note">Your Compare and Edit guide photos, 3:4. Drag or Alt + arrows to reorder.</p></div>
        <p className="vh" role="status" aria-live="polite">{say}</p>

        {!inq.loaded && <div className="skeleton" aria-hidden="true"><div className="sk-row" /><div className="sk-cards" /></div>}
        {inq.loaded && !all.length && (
          <section className="card empty"><h2 className="card-h">Nothing to lay out yet</h2><p className="note">Photos from Compare and the Edit guide appear here.</p><div className="actions"><Link className="btn btn-primary" href="/compare">Compare a photo</Link><a className="btn btn-secondary" href="/edit">Open the Edit guide</a></div></section>
        )}
        {inq.loaded && all.length > 0 && !done.length && <p className="note">All photos are off. Tick some below.</p>}

        {all.length > 0 && (<>
          <div className="grid-tools">
            <fieldset className="seg"><legend>Theme</legend>
              {(["light", "dark"] as const).map((t) => <button key={t} type="button" className="seg-b" aria-pressed={grid.theme === t} onClick={() => save({ theme: t })}>{t === "light" ? "Light" : "Dark"}</button>)}
            </fieldset>
            <fieldset className="seg"><legend>Order</legend>
              {MODES.map(([m, label]) => <button key={m} type="button" className="seg-b" aria-pressed={grid.mode === m} onClick={() => save({ mode: m })}>{label}</button>)}
              {grid.mode === "custom" && <span className="seg-note">Your own order</span>}
            </fieldset>
            <label className="check"><input type="checkbox" checked={grid.showFlow} onChange={(e) => save({ showFlow: e.target.checked })} /> Show colour flow</label>
          </div>

          <div className="devices">
            <figure className="device device-phone">
              <div className="screen">
                <div className="profile">
                  <span className="avatar">{order[0] && <img className="av-img" src={thumb(order[0])} alt="" />}</span>
                  <div className="p-meta"><p className="p-name">Your profile</p><p className="p-count"><b className="num">{order.length}</b> posts</p></div>
                </div>
                <div className="p-tabs"><span className="is-on" aria-label="Posts"><GridIcon /></span><span aria-label="Saved"><SavedIcon /></span></div>
                <ol className="tiles" aria-label="Grid tiles">
                  {order.map((id, i) => {
                    const top = lib.analyses.get(id)?.photoPalette[0];
                    return (
                      <li key={id} draggable onDragStart={() => { dragId.current = id; }} onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); if (dragId.current && dragId.current !== id) reorder(dragId.current, i); dragId.current = null; }}>
                        <button type="button" className="tile-b" aria-label={`${nameOf(id)}, tile ${i + 1}. Open full photo`}
                          onClick={() => show(id)}
                          onKeyDown={(e) => {
                            if (!e.altKey) return;
                            const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -3 : e.key === "ArrowDown" ? 3 : 0;
                            if (d) { e.preventDefault(); reorder(id, i + d); }
                          }}>
                          <img className="tile-img" src={thumb(id)} alt="" />
                        </button>
                        {grid.showFlow && top && <span className="flow" style={{ "--sw": top.hex } as CSSProperties} />}
                      </li>
                    );
                  })}
                </ol>
              </div>
              <figcaption>Phone, 402 × 874</figcaption>
            </figure>
            {grid.showFlow && jumps.length > 0 && (
              <aside className="card flow-card" aria-labelledby="fl-h">
                <h2 id="fl-h" className="card-h">Colour flow</h2>
                <p className="note">Biggest jumps between neighbours:</p>
                <ol className="jumps">{jumps.map((j) => (
                  <li key={j.index}><span className="pair"><img className="j-img" src={thumb(j.a)} alt="" /><img className="j-img" src={thumb(j.b)} alt="" /></span>
                    <span>Row <b className="num">{Math.floor(j.index / 3) + 1}</b>, tiles <b className="num">{(j.index % 3) + 1}</b> and <b className="num">{(j.index % 3) + 2}</b></span><span className="sub num">ΔE {j.deltaE}</span></li>
                ))}</ol>
              </aside>
            )}
          </div>
        </>)}

        {all.length > 0 && (
          <section className="in-grid" aria-labelledby="ig-h">
            <div className="sec-head"><h2 id="ig-h">Photos in the grid</h2><p className="note">Newest first.</p></div>
            <ul className="hist-list">
              {all.map((r) => (
                <li key={r.id}>
                  <img src={inquiryThumb(r)} alt="" className="ig-img" />
                  <label className="check"><input key={`${r.id}:${r.inGrid}`} type="checkbox" defaultChecked={r.inGrid} onChange={(e) => void setInGrid(r.id, e.target.checked)} /> <span className="hist-name">{r.name}</span></label>
                  <span className="sub">{r.kind === "edit" ? "Edit guide" : "Compare"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <dialog ref={dialog} className="lightbox" onClose={close} aria-label="Full photo">
          {open && <img src={open.url} alt={nameOf(open.id)} />}
          <button type="button" className="btn btn-secondary" onClick={close}>Close</button>
        </dialog>
      </main>
    </>
  );
}
