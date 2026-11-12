"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
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
        <tr key={s.group + s.control}><th scope="row">{s.control}<span className="grp">{s.group}</span></th><td className="move">{moveWord(s)}</td><td className="str"><Meter band={s.band} /></td><td className="why">{s.why}</td></tr>
      ))}</tbody>
    </table>
  );
}

export function CompareView() {
  const lib = useLibrary();
  const thumb = useThumbUrls(lib.photos);
  const [file, setFile] = useState<{ url: string; name: string; isJpeg: boolean } | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");
  const g = lib.grouping;

  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);

  const pick = async (files: File[]) => {
    const f = files[0];
    if (!f || !g) return;
    if (!/image\/(jpeg|png)/.test(f.type)) { setState("error"); setError("Compare takes one JPEG or PNG. RAW files go to the Edit guide."); return; }
    setFile({ url: URL.createObjectURL(f), name: f.name, isJpeg: f.type === "image/jpeg" });
    setState("working"); setResult(null);
    try {
      const { analysis: a } = await getEngine().analyze(f, 1);
      setAnalysis(a);
      setResult(await getEngine().compare(a, g.families, f.type === "image/jpeg"));
      setState("idle");
    } catch (e) { setState("error"); setError(e instanceof Error ? e.message : "Could not read this image"); }
  };

  const name = (id: string, fallback: string) => g?.names[id] || fallback;
  const fam = result && g ? g.families.families.find((f) => f.id === result.family.id) : null;
  const top = result ? topSuggestions(result.suggestions) : [];
  const rest = result ? result.suggestions.filter((s) => !top.includes(s)) : [];
  const { bars, alsoClose } = result ? matchBars(result.matches) : { bars: [], alsoClose: false };

  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Compare a photo</h1>{g && <AddPhotos onFiles={pick} label={file ? "Choose another photo" : "Choose a photo"} className={file ? "btn btn-secondary" : "btn btn-primary"} disabled={state === "working"} />}</div>
        <p className="status-line" role="status" aria-live="polite">{state === "working" ? "Reading the photo on this device…" : ""}</p>

        {!lib.loaded && <div className="skeleton" aria-hidden="true"><div className="sk-row" /><div className="sk-cards" /></div>}
        {lib.loaded && !g && (
          <section className="card empty"><h2 className="card-h">Build your reference look first</h2><p className="note">Compare matches a photo against your colour families, so it needs a few reference photos.</p><Link className="btn btn-primary" href="/inspiration">Go to Inspiration</Link></section>
        )}
        {g && !file && state !== "error" && (
          <section className="card empty"><h2 className="card-h">Pick one JPEG or PNG</h2><p className="note">It is matched to your closest family, with the direction to move each slider. Nothing is uploaded.</p></section>
        )}
        {state === "error" && <section className="card errors" role="alert"><h2 className="card-h">That photo could not be compared</h2><p>{error}</p></section>}

        {file && (
          <div className="cmp-top">
            <figure className="cmp-photo">
              
              <img src={file.url} alt="The photo being compared" />
              <figcaption>{file.name}</figcaption>
              {analysis && <Strip p={analysis.photoPalette} className="strip strip-band" />}
            </figure>
            {result && fam && (
              <aside className="card cmp-card" aria-labelledby="near-h">
                <h2 id="near-h" className="card-h">Closest family</h2>
                <p className="near-name">{name(fam.id, fam.name)}</p>
                <ul className="sel-photos">{(g!.members[fam.id] ?? []).slice(0, 4).map((id) => <li key={id}><img className="sel-img" src={thumb(id)} alt="" /></li>)}</ul>
                {alsoClose && <p className="also">Also close to <b>{name(result.matches[1].id, result.matches[1].name)}</b>, almost as good a match.</p>}
                <h3>How close each family is</h3>
                <ol className="matches">{bars.map((m, i) => <li key={m.id} className={i === 0 ? "is-best" : undefined}><span className="m-name">{name(m.id, m.name)}</span><span className="m-bar"><span style={{ "--w": `${m.width}%` } as CSSProperties} /></span></li>)}</ol>
              </aside>
            )}
          </div>
        )}

        {result && fam && analysis && (<>
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
            <div className="sec-head"><h2 id="sug-h">Suggested moves</h2><p className="note">Directions, not exact values.{file?.isJpeg ? " JPEGs have limited headroom: big moves may band or clip." : ""}</p></div>
            {top.length ? <SuggTable rows={top} /> : <p className="note">This photo already sits close to the family: no move stands out.</p>}
            {rest.length > 0 && <details className="more"><summary className="btn btn-secondary">Show all {result.suggestions.length} suggestions</summary><SuggTable rows={rest} /></details>}
          </section>
        </>)}
      </main>
    </>
  );
}
