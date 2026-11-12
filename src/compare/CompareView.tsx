"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { makeThumb } from "@/library/thumb";
import { saveInquiry, useInquiries, inquiryImage } from "@/inquiries/store";
import { History } from "@/inquiries/History";
import { MoveGlyph } from "./MoveGlyph";
import { SiteHeader } from "@/ui/SiteHeader";
import { HexButton } from "@/ui/HexButton";
import { Strip, hueName } from "@/ui/viz";
import { AddPhotos } from "@/inspiration/AddPhotos";
import { getEngine } from "@/library/library";
import { useLibrary, useThumbUrls } from "@/library/hooks";
import type { PhotoAnalysis } from "@/analysis/photo";
import type { CompareResult, Suggestion } from "@/analysis/compare";
import { BAND_STEPS, colourPairs, matchBars, moveWord, topSuggestions } from "./presentation";

const sw = (hex: string) => ({ "--sw": hex }) as CSSProperties;

function Meter({ band }: { band: Suggestion["band"] }) {
  return (<>
    <span className="meter" role="img" aria-label={band}>{[1, 2, 3].map((i) => <span key={i} className={i <= BAND_STEPS[band] ? "on" : undefined} />)}</span>
    <span className="band">{band}</span>
  </>);
}
function SuggTable({ rows }: { rows: Suggestion[] }) {
  return (
    <table className="sugg">
      <thead><tr><th scope="col">Control</th><th scope="col">Move</th><th scope="col">How much</th><th scope="col">Why</th></tr></thead>
      <tbody>{rows.map((s) => (
        <tr key={s.group + s.control}><th scope="row">{s.control}<span className="grp">{s.group}</span></th><td className="move">{moveWord(s)}<span className="glyph-cell"><MoveGlyph s={s} /></span></td><td className="str"><Meter band={s.band} /></td><td className="why">{s.why}</td></tr>
      ))}</tbody>
    </table>
  );
}

export function CompareView() {
  const lib = useLibrary();
  const thumb = useThumbUrls(lib.photos);
  const inq = useInquiries();
  const rows = inq.rows.filter((r) => r.kind === "compare");
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; r: CompareResult } | null>(null);
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");
  const g = lib.grouping;
  // the photo on screen: the one picked, else the latest saved one (so a tab switch never loses it)
  const current = rows.find((r) => r.id === picked) ?? rows[0] ?? null;

  // recompute against the current families whenever the photo or the families change
  useEffect(() => {
    if (!current || !g) return;
    let live = true;
    getEngine().compare(current.analysis, g.families, current.image.type !== "image/png").then((r) => { if (live) setResult({ id: current.id, r }); }).catch(() => {});
    return () => { live = false; };
  }, [current, g]);

  const pick = async (files: File[]) => {
    const f = files[0];
    if (!f || !g) return;
    if (!/image\/(jpeg|png)/.test(f.type)) { setState("error"); setError("Compare takes one JPEG or PNG. RAW files go to the Edit guide."); return; }
    setState("working");
    try {
      const [{ analysis: a }, t] = await Promise.all([getEngine().analyze(f, 1), makeThumb(f)]);
      const id = await saveInquiry({ kind: "compare", name: f.name, image: f, thumb: t.thumb, analysis: a });
      setPicked(id); setState("idle");
    } catch (e) { setState("error"); setError(e instanceof Error ? e.message : "Could not read this image"); }
  };

  const name = (id: string, fallback: string) => g?.names[id] || fallback;
  const res = result && current && result.id === current.id ? result.r : null;
  const analysis = current?.analysis ?? null;
  const isJpeg = current ? current.image.type !== "image/png" : true;
  const fam = res && g ? g.families.families.find((f) => f.id === res.family.id) : null;
  const top = res ? topSuggestions(res.suggestions) : [];
  const rest = res ? res.suggestions.filter((s) => !top.includes(s)) : [];
  const { bars, alsoClose } = res ? matchBars(res.matches) : { bars: [], alsoClose: false };

  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Compare a photo</h1>{g && <AddPhotos onFiles={pick} label={current ? "Compare another photo" : "Choose a photo"} className={current ? "btn btn-secondary" : "btn btn-primary"} disabled={state === "working"} />}</div>
        <p className="status-line" role="status" aria-live="polite">{state === "working" ? "Reading the photo on this device…" : ""}</p>

        {(!lib.loaded || !inq.loaded) && <div className="skeleton" aria-hidden="true"><div className="sk-row" /><div className="sk-cards" /></div>}
        {lib.loaded && !g && (
          <section className="card empty"><h2 className="card-h">Build your reference look first</h2><p className="note">Compare matches a photo against your colour families, so it needs a few reference photos.</p><Link className="btn btn-primary" href="/inspiration">Go to Inspiration</Link></section>
        )}
        {g && inq.loaded && !current && state !== "error" && (
          <section className="card empty"><h2 className="card-h">Pick one JPEG or PNG</h2><p className="note">It is matched to your closest family, with the direction to move each slider. Nothing is uploaded, and the photo is kept here so you can come back to it.</p></section>
        )}
        {state === "error" && <section className="card errors" role="alert"><h2 className="card-h">That photo could not be compared</h2><p>{error}</p></section>}

        {current && (
          <div className="cmp-top">
            <figure className="cmp-photo">
              <img src={inquiryImage(current)} alt="The photo being compared" />
              <figcaption>{current.name}</figcaption>
              {analysis && <Strip p={analysis.photoPalette} className="strip strip-band" />}
            </figure>
            {res && fam && (
              <aside className="card cmp-card" aria-labelledby="near-h">
                <h2 id="near-h" className="card-h">Closest family</h2>
                <p className="near-name">{name(fam.id, fam.name)}</p>
                <ul className="sel-photos">{(g!.members[fam.id] ?? []).slice(0, 4).map((id) => <li key={id}><img className="sel-img" src={thumb(id)} alt="" /></li>)}</ul>
                {alsoClose && <p className="also">Also close to <b>{name(res.matches[1].id, res.matches[1].name)}</b>, almost as good a match.</p>}
                <h3>How close each family is</h3>
                <ol className="matches">{bars.map((m, i) => <li key={m.id} className={i === 0 ? "is-best" : undefined}><span className="m-name">{name(m.id, m.name)}</span><span className="m-bar"><span style={{ "--w": `${m.width}%` } as CSSProperties} /></span></li>)}</ol>
              </aside>
            )}
          </div>
        )}

        {res && fam && analysis && (<>
          <section aria-labelledby="col-h">
            <div className="sec-head"><h2 id="col-h">Your colours beside the family’s</h2><p className="note">Each of the photo’s main colours, paired with the nearest family colour.</p></div>
            <table className="pairs">
              <thead><tr><th scope="col">This photo</th><th scope="col">{name(fam.id, fam.name)}</th><th scope="col">Difference</th></tr></thead>
              <tbody>{colourPairs(analysis.palette, fam.summary.palette).map((p, i) => (
                <tr key={i}>
                  <td><span className="pair"><span className="chip" style={sw(p.mine.hex)} /><HexButton hex={p.mine.hex} /></span><span className="sub">{hueName(p.mine.h)}</span></td>
                  <td><span className="pair"><span className="chip" style={sw(p.theirs.hex)} /><HexButton hex={p.theirs.hex} /></span><span className="sub">{hueName(p.theirs.h)}</span></td>
                  <td><span className={`diff diff-${p.word.toLowerCase()}`}>{p.word}</span><span className="sub num">ΔE {p.deltaE}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </section>
          <section aria-labelledby="sug-h">
            <div className="sec-head"><h2 id="sug-h">Suggested moves</h2><p className="note">Directions, not exact values. The bar shows which way and how far, on what the slider changes.{isJpeg ? " JPEGs have limited headroom: big moves may band or clip." : ""}</p></div>
            {top.length ? <SuggTable rows={top} /> : <p className="note">This photo already sits close to the family: no move stands out.</p>}
            {rest.length > 0 && <details className="more"><summary className="btn btn-secondary">Show all {res.suggestions.length} suggestions</summary><SuggTable rows={rest} /></details>}
          </section>
        </>)}

        <History rows={rows} current={current?.id ?? null} onOpen={setPicked} label="Previous photos" />
      </main>
    </>
  );
}
