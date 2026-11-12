"use client";
import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/ui/SiteHeader";
import { HexButton } from "@/ui/HexButton";
import { FullAnalysis, PaletteCards, Strip } from "@/ui/viz";
import { movePhoto, renameFamily } from "@/library/library";
import { useLibrary, useThumbUrls } from "@/library/hooks";

export function FamilyView({ id }: { id: string }) {
  const lib = useLibrary();
  const thumb = useThumbUrls(lib.photos);
  const g = lib.grouping;
  const fam = g?.families.families.find((f) => f.id === id);
  const name = (fid: string, fallback: string) => g?.names[fid] || fallback;
  const [draft, setDraft] = useState<string | null>(null);

  if (!lib.loaded) return (<><SiteHeader /><main className="container"><div className="skeleton" aria-hidden="true"><div className="sk-row" /><div className="sk-cards" /></div></main></>);
  if (!g || !fam) return (
    <><SiteHeader /><main className="container">
      <section className="card empty"><h1 className="card-h">This family no longer exists</h1><p className="note">Families change when photos are added or moved.</p><Link className="btn btn-secondary" href="/inspiration">Back to your reference look</Link></section>
    </main></>
  );

  const ids = g.members[fam.id] ?? [];
  const others = g.families.families.filter((f) => f.id !== fam.id);
  const title = name(fam.id, fam.name);
  const commit = async () => { if (draft !== null && draft.trim() && draft.trim() !== title) await renameFamily(fam.id, draft); setDraft(null); };

  return (
    <>
      <SiteHeader />
      <main className="container">
        <nav className="crumbs" aria-label="Breadcrumb"><Link href="/inspiration">Your reference look</Link><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>
        <div className="intro">
          <div className="name-row">
            {draft === null ? (<>
              <h1>{title}</h1>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(title)}>Rename</button>
            </>) : (
              <form onSubmit={(e) => { e.preventDefault(); void commit(); }} className="name-row">
                <label className="vh" htmlFor="fam-name">Family name</label>
                <input id="fam-name" className="name-edit" value={draft} maxLength={40} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setDraft(null); }} />
                <button type="submit" className="btn btn-primary btn-sm">Save</button>
              </form>
            )}
          </div>
          <dl className="facts"><div><dt>Photos</dt><dd className="num">{ids.length}</dd></div><div><dt>Brightness</dt><dd className="num">{Math.round(fam.summary.tone.p50 * 100)}</dd></div><div><dt>Glow</dt><dd className="num">{fam.summary.glow.score ?? "none"}</dd></div></dl>
        </div>

        <section aria-labelledby="fph-h">
          <div className="sec-head"><h2 id="fph-h">Photos in this family</h2><p className="note">Move a photo if it belongs with another family; your choice sticks when the set is regrouped.</p></div>
          <ul className="ph-grid">
            {ids.map((pid) => {
              const p = lib.photos.find((x) => x.id === pid), a = lib.analyses.get(pid);
              if (!p) return null;
              return (
                <li key={pid} className="ph-card">
                  <img className="ph-img" src={thumb(pid)} alt={p.name} />
                  {a && <><Strip p={a.photoPalette} className="strip strip-ph" /><p className="ph-hex">{a.photoPalette.slice(0, 3).map((s) => <HexButton key={s.hex} hex={s.hex} />)}</p></>}
                  {others.length > 0 && (
                    <label className="move">Move to
                      <select defaultValue="" onChange={(e) => { if (e.target.value) void movePhoto(pid, e.target.value); }}>
                        <option value="" disabled>Choose a family</option>
                        {others.map((o) => <option key={o.id} value={o.id}>{name(o.id, o.name)}</option>)}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="fp-h"><div className="sec-head"><h2 id="fp-h">The palette</h2><p className="note">Colourful pixels only, largest first.</p></div><PaletteCards p={fam.summary.palette} /></section>
        <FullAnalysis s={fam.summary} idBase={`fam-${fam.id}`} />
      </main>
    </>
  );
}
