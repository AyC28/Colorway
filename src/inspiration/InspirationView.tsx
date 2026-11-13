"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Tabs } from "@/ui/Tabs";
import { ColorSpace } from "@/ui/colorspace/ColorSpace";
import { SiteHeader } from "@/ui/SiteHeader";
import { HexButton } from "@/ui/HexButton";
import { FullAnalysis, Histogram, HueChart, PaletteCards, Strip, Wheel, Estimated, pct } from "@/ui/viz";
import { addPhotos, analysePending, loadStarterSet, MAX_PHOTOS, movePhoto, removePhoto } from "@/library/library";
import { useLibrary, useThumbUrls } from "@/library/hooks";
import type { Family } from "@/analysis/group";
import { AddPhotos } from "./AddPhotos";

export function InspirationView() {
  const lib = useLibrary();
  const thumb = useThumbUrls(lib.photos);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void analysePending((done, total) => setProgress(total ? { done, total } : null)).finally(() => setProgress(null)); }, []);
  const starter = async () => {
    setNotice(null);
    try { await loadStarterSet((done, total) => setProgress({ done, total })); } catch { setNotice("The starter set could not be loaded. Check your connection and try again."); }
    setProgress(null);
  };
  // arriving from Home's "Try the starter set" with an empty library: load it straight away
  const wantsStarter = lib.loaded && lib.photos.length === 0 && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("starter");
  useEffect(() => {
    if (!wantsStarter) return;
    window.history.replaceState(null, "", "/inspiration");
    const t = setTimeout(() => void starter(), 0);
    return () => clearTimeout(t);
  }, [wantsStarter]);

  const busy = !!progress && progress.done < progress.total;
  const ingest = async (files: File[]) => {
    const room = MAX_PHOTOS - lib.photos.length;
    if (room <= 0) { setNotice(`You already have ${MAX_PHOTOS} photos. Remove some to add more.`); return; }
    if (files.length > room) setNotice(`Only the first ${room} were added: the limit is ${MAX_PHOTOS} photos.`);
    else setNotice(null);
    await addPhotos(files, (done, total) => setProgress({ done, total }));
    setProgress(null);
  };
  const add = <AddPhotos onFiles={ingest} disabled={busy} />;
  const g = lib.grouping;
  const fams: (Family & { display: string })[] = g ? g.families.families.map((f) => ({ ...f, display: g.names[f.id] || f.name })) : [];
  const shown = active ?? fams[0]?.id ?? null;
  const memberIds = (f: Family) => g?.members[f.id] ?? [];
  const errors = lib.photos.filter((p) => p.status === "error");

  return (
    <>
      <SiteHeader action={add} />
      <main className={`container${dragOver ? " is-drop" : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragOver(false); if (!busy) void ingest([...e.dataTransfer.files]); }}>
        <div className="intro">
          <h1>Your reference look</h1>
          {g && <dl className="facts"><div><dt>Photos</dt><dd className="num">{g.photoIds.length}</dd></div><div><dt>Families</dt><dd className="num">{fams.length}</dd></div><div><dt>Near-neutral</dt><dd className="num">{pct(g.set.neutralShare)}</dd></div></dl>}
        </div>

        <p className="status-line" role="status" aria-live="polite">
          {progress && progress.total > 0 ? `Analysing on this device: ${progress.done} of ${progress.total}` : notice ?? ""}
        </p>

        {!lib.loaded && <div className="skeleton" aria-hidden="true"><div className="sk-row" /><div className="sk-cards" /><div className="sk-row" /></div>}

        {lib.loaded && lib.photos.length === 0 && (
          <section className="card empty" aria-labelledby="empty-h">
            <h2 id="empty-h" className="card-h">Start with photos you love</h2>
            <p className="note">Add up to {MAX_PHOTOS} reference photos, or drop them anywhere on this page. They are analysed on this device and the originals never leave it.</p>
            <div className="actions">{add}<button type="button" className="btn btn-secondary" onClick={starter} disabled={busy}>Try the starter set</button></div>
            <p className="note">Starter set: photos by Colorway’s photographer.</p>
          </section>
        )}

        {errors.length > 0 && (
          <section className="card errors" aria-labelledby="err-h">
            <h2 id="err-h" className="card-h">{errors.length === 1 ? "One photo could not be read" : `${errors.length} photos could not be read`}</h2>
            <ul>{errors.map((p) => <li key={p.id}><b>{p.name}</b>: {p.error ?? "unknown error"}. Try exporting it again as JPEG or PNG. <button type="button" className="link-btn" onClick={() => void removePhoto(p.id)}>Remove</button></li>)}</ul>
          </section>
        )}

        {g && (<>
          <section className="look" aria-labelledby="pal-h">
            <div className="sec-head"><h2 id="pal-h">Your colour</h2><p className="note">Colourful pixels, largest first.</p></div>
            <Tabs label="Your reference look" tabs={[
              { id: "palette", label: "Palette", panel: () => <PaletteCards p={g.set.palette} /> },
              { id: "space", label: "Colour space", panel: () => <ColorSpace layers={[{ id: "set", label: "All photos", style: "cloud", samples: g.photoIds.map((id) => lib.analyses.get(id)?.sample.all).filter((x): x is NonNullable<typeof x> => !!x) }]} /> },
              { id: "analysis", label: "Full analysis", panel: () => <FullAnalysis s={g.set} idBase="set" /> },
            ]} />
          </section>

          <section className="fams" aria-labelledby="fam-h">
            <div className="sec-head"><h2 id="fam-h">Families</h2><p className="note">Grouped by hue and brightness.</p></div>
            <div className="fam-grid">
              <ol className="fam-list">
                {fams.map((f) => (
                  <li key={f.id}>
                    <Link className={`fam-row${f.id === shown ? " is-active" : ""}`} href={`/inspiration/family/${f.id}`}
                      onMouseEnter={() => setActive(f.id)} onFocus={() => setActive(f.id)}
                      onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-colorway-photo")) e.preventDefault(); }}
                      onDrop={(e) => { const id = e.dataTransfer.getData("text/x-colorway-photo"); if (id) { e.preventDefault(); void movePhoto(id, f.id); } }}>
                      <span className="fam-mosaic">{memberIds(f).slice(0, 4).map((id) => <img key={id} className="fam-img" src={thumb(id)} alt="" />)}</span>
                      <span className="fam-body">
                        <span className="fam-name">{f.display}</span>
                        <span className="fam-n"><span className="num">{memberIds(f).length}</span> photos</span>
                        <Strip p={f.summary.palette} className="strip strip-row" />
                        <span className="fam-stats"><span>Brightness <b className="num">{Math.round(f.summary.tone.p50 * 100)}</b></span><span>Glow <b className="num">{f.summary.glow.score ?? "none"}</b></span></span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              <div className="previews" aria-live="polite">
                {fams.filter((f) => f.id === shown).map((f) => (
                  <article key={f.id} className="card preview" aria-label={`${f.display} preview`}>
                    <div className="h-row"><h3 className="pv-name">{f.display}</h3><Link className="pv-open" href={`/inspiration/family/${f.id}`}>Open family</Link></div>
                    <ul className="sel-photos">{memberIds(f).slice(0, 8).map((id) => <li key={id}><img className="sel-img" src={thumb(id)} alt="" /></li>)}</ul>
                    <Strip p={f.summary.palette} className="strip strip-band" />
                    <div className="pv-two"><div><h4>Histogram</h4><Histogram rgb={f.summary.rgbHist} height={72} /></div><div><h4>Hue</h4><HueChart v={f.summary.hueHist} height={72} id={`pv-${f.id}`} /></div></div>
                    <div className="h-row"><h4>Color grading</h4><Estimated /></div>
                    <div className="wheels">{f.summary.grading.map((x) => <figure key={x.range}><Wheel g={x} size={56} /><figcaption>{x.range}</figcaption></figure>)}</div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </>)}

        {lib.photos.some((p) => p.status !== "error") && (
          <section aria-labelledby="every-h">
            <div className="sec-head"><h2 id="every-h">Every photo</h2><p className="note">Greys included where they dominate.</p></div>
            <ul className="ph-grid">
              {lib.photos.filter((p) => p.status !== "error").map((p) => {
                const a = lib.analyses.get(p.id);
                return (
                  <li key={p.id} className="ph-card" draggable={!!a} onDragStart={(e) => e.dataTransfer.setData("text/x-colorway-photo", p.id)}>
                    {thumb(p.id) ? <img className="ph-img" src={thumb(p.id)} alt={p.name} /> : <div className="ph-img sk-img" />}
                    {a ? (<>
                      <Strip p={a.photoPalette} className="strip strip-ph" />
                      <p className="ph-hex">{a.photoPalette.slice(0, 3).map((s) => <HexButton key={s.hex} hex={s.hex} />)}</p>
                    </>) : <p className="note">Analysing…</p>}
                    <button type="button" className="link-btn ph-remove" aria-label={`Remove ${p.name}`} onClick={() => void removePhoto(p.id)}>Remove</button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

