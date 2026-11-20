"use client";
/** One reference photo: large, its style fit, its palette, and its own 3D colour graph. */
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { SiteHeader } from "@/ui/SiteHeader";
import { Tabs } from "@/ui/Tabs";
import { ColorSpace } from "@/ui/colorspace/ColorSpace";
import { FullAnalysis, PaletteCards } from "@/ui/viz";
import { movePhoto } from "@/library/library";
import { useLibrary, useThumbUrls } from "@/library/hooks";
import { scoreStyles, styleById } from "@/analysis/styles";

export function PhotoView({ id }: { id: string }) {
  const lib = useLibrary();
  const thumb = useThumbUrls(lib.photos);
  const p = lib.photos.find((x) => x.id === id);
  const a = lib.analyses.get(id);
  const g = lib.grouping;
  const famId = g ? Object.entries(g.members).find(([, m]) => m.includes(id))?.[0] : undefined;
  const fam = g?.families.families.find((f) => f.id === famId);
  const famName = fam ? g?.names[fam.id] || fam.name : "";
  const [url, setUrl] = useState<string | null>(null);

  // the original when it is on this device, else the synced thumbnail
  useEffect(() => {
    if (!p?.original) return;
    const u = URL.createObjectURL(p.original);
    const t = setTimeout(() => setUrl(u), 0);
    return () => { clearTimeout(t); URL.revokeObjectURL(u); };
  }, [p?.original]);

  if (!lib.loaded) return (<><SiteHeader /><main className="container"><div className="skeleton" aria-hidden="true"><div className="sk-row" /><div className="sk-cards" /></div></main></>);
  if (!p || !a) return (<><SiteHeader /><main className="container"><section className="card empty"><h1 className="card-h">Photo not found</h1><Link className="btn btn-secondary" href="/inspiration">Back to your reference look</Link></section></main></>);

  const fits = scoreStyles(a).slice(0, 3);
  const top = fits[0].score || 1;
  const others = g ? g.families.families.filter((f) => f.id !== famId) : [];

  return (
    <>
      <SiteHeader />
      <main className="container">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/inspiration">Your reference look</Link><span aria-hidden="true">/</span>
          {fam && <><Link href={`/inspiration/family/${fam.id}`}>{famName}</Link><span aria-hidden="true">/</span></>}
          <span aria-current="page">{p.name}</span>
        </nav>
        <div className="cmp-top">
          <figure className="cmp-photo">
            <img src={url ?? thumb(id)} alt={p.name} />
            <figcaption>{p.name}</figcaption>
          </figure>
          <aside className="card cmp-card" aria-labelledby="st-h">
            <h2 id="st-h" className="card-h">Style</h2>
            <p className="near-name">{famName || styleById.get(fits[0].id)?.name}</p>
            <p className="note">{styleById.get(fam?.style ?? fits[0].id)?.blurb}</p>
            <h3>Fit</h3>
            <ol className="matches">{fits.map((f, i) => (
              <li key={f.id} className={i === 0 ? "is-best" : undefined}><span className="m-name">{styleById.get(f.id)?.name}</span><span className="m-bar"><span style={{ "--w": `${Math.max(6, Math.round((f.score / top) * 100))}%` } as CSSProperties} /></span></li>
            ))}</ol>
            {others.length > 0 && (
              <label className="move-to">Move to
                <select defaultValue="" onChange={(e) => { if (e.target.value) void movePhoto(id, e.target.value); }}>
                  <option value="" disabled>Choose a family</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{g!.names[o.id] || o.name}</option>)}
                </select>
              </label>
            )}
          </aside>
        </div>
        <section aria-labelledby="pp-h">
          <div className="sec-head"><h2 id="pp-h">Photo colour</h2><p className="note">Greys included where they dominate.</p></div>
          <Tabs label="Photo colour" tabs={[
            { id: "palette", label: "Palette", panel: () => <PaletteCards p={a.photoPalette} /> },
            { id: "space", label: "Colour space", panel: () => <ColorSpace layers={[
              ...(fam ? [{ id: "family", label: famName, style: "cloud" as const, samples: (g!.members[fam.id] ?? []).filter((x) => x !== id).map((x) => lib.analyses.get(x)?.sample.all).filter((x): x is NonNullable<typeof x> => !!x) }] : []),
              { id: "photo", label: "This photo", style: "focus" as const, samples: [a.sample.all] },
            ]} /> },
            { id: "analysis", label: "Full analysis", panel: () => <FullAnalysis s={a} idBase={`ph-${id}`} /> },
          ]} />
        </section>
      </main>
    </>
  );
}
