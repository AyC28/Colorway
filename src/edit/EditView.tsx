"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { SiteHeader } from "@/ui/SiteHeader";
import { Histogram, Estimated } from "@/ui/viz";
import { AddPhotos } from "@/inspiration/AddPhotos";
import { getEngine } from "@/library/library";
import { useLibrary } from "@/library/hooks";
import { suggest } from "@/analysis/compare";
import { SRGB_TO_LINEAR } from "@/analysis/color";
import type { PhotoAnalysis } from "@/analysis/photo";
import type { EditFit, ParamRange } from "@/analysis/editModel";
import type { FamilyMatch } from "@/analysis/compare";
import { BAND_STEPS } from "@/compare/presentation";
import { decodeRaw, RAW_EXT, type RawResult } from "./raw";
import { makeThumb } from "@/library/thumb";
import { saveInquiry, setEditTarget, useInquiries, inquiryImage } from "@/inquiries/store";
import { History } from "@/inquiries/History";
import { MoveGlyph } from "@/compare/MoveGlyph";
import type { InquiryRow } from "@/db/db";
import { GradingGuide, HslGuide } from "./ColourGuide";

type Loaded = { name: string; previewUrl: string; analysis: PhotoAnalysis; lin: Float32Array; raw: NonNullable<InquiryRow["edit"]>["raw"]; clipped: number | null; stops: number | null; matches: FamilyMatch[] };

async function jpegLinear(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const ctx = new OffscreenCanvas(w, h).getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
  const d = ctx.getImageData(0, 0, w, h).data, n = 8000, lin = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) { const i = Math.floor((j / n) * w * h) * 4; lin[j * 3] = SRGB_TO_LINEAR[d[i]]; lin[j * 3 + 1] = SRGB_TO_LINEAR[d[i + 1]]; lin[j * 3 + 2] = SRGB_TO_LINEAR[d[i + 2]]; }
  return lin;
}

function Slider({ label, r, min, max, unit = "", fmt }: { label: string; r: ParamRange; min: number; max: number; unit?: string; fmt: (v: number) => string }) {
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  // a range covering most of the slider means the model found no clear direction: say so
  if (r.hi - r.lo >= 0.75 * (max - min)) return <li className="slider"><span className="s-name">{label}</span><span className="s-dir muted-dir">No clear direction</span><span className="s-val">leave as is</span></li>;
  return (
    <li className="slider"><span className="s-name">{label}</span>
      <span className="s-track" role="img" aria-label={`${label} roughly ${fmt(r.lo)} to ${fmt(r.hi)}${unit}`}>
        <span className="s-zero" style={{ "--x": `${pos(0)}%` } as CSSProperties} />
        <span className="s-range" style={{ "--a": `${pos(r.lo)}%`, "--b": `${pos(r.hi)}%` } as CSSProperties} />
      </span>
      <span className="s-val num">{fmt(r.lo)} to {fmt(r.hi)}{unit}</span></li>
  );
}
const ACCEPT = ".cr3,.cr2,.nef,.arw,.dng,.raf,.orf,.rw2,.pef,.srw,image/jpeg,image/png";
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}`;
const ev = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

export function EditView() {
  const lib = useLibrary();
  const g = lib.grouping;
  const inq = useInquiries();
  const rows = inq.rows.filter((r) => r.kind === "edit");
  const [picked, setPicked] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ id: string; m: FamilyMatch[] } | null>(null);
  const [fit, setFit] = useState<{ key: string; fit: EditFit } | null>(null);
  const [state, setState] = useState<"idle" | "decoding" | "fitting" | "error">("idle");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse) and (max-width: 900px)");
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    const t = setTimeout(on, 0);
    return () => { mq.removeEventListener("change", on); clearTimeout(t); };
  }, []);

  // the file on screen: the one picked, else the latest saved one (a tab switch never loses it)
  const row = rows.find((r) => r.id === picked) ?? rows[0] ?? null;
  const loaded: Loaded | null = row && row.edit ? {
    name: row.name, previewUrl: inquiryImage(row), analysis: row.analysis, lin: row.edit.lin, raw: row.edit.raw, clipped: row.edit.clipped, stops: row.edit.stops,
    matches: matches && matches.id === row.id ? matches.m : [],
  } : null;
  const target = row?.edit?.targetId ?? loaded?.matches[0]?.id ?? null;
  const name = (id: string, fb: string) => g?.names[id] || fb;
  const fam = g && target ? g.families.families.find((f) => f.id === target) ?? null : null;

  // closest families for this file, against the current families
  useEffect(() => {
    if (!row || !g) return;
    let live = true;
    getEngine().compare(row.analysis, g.families, !row.edit?.raw).then((c) => { if (live) setMatches({ id: row.id, m: c.matches }); }).catch(() => {});
    return () => { live = false; };
  }, [row?.id, g]); // eslint-disable-line react-hooks/exhaustive-deps

  // slider ranges toward the chosen family
  const fitKey = row && fam ? `${row.id}:${fam.id}:${g?.updatedAt}` : null;
  useEffect(() => {
    if (!row?.edit || !fam || !fitKey) return;
    let live = true;
    const t = setTimeout(() => setState((s) => (s === "decoding" ? s : "fitting")), 0);
    getEngine().fitEdit(row.edit.lin, fam.summary.tone, !!row.edit.raw)
      .then((f) => { if (live) { setFit({ key: fitKey, fit: f }); setState((s) => (s === "fitting" ? "idle" : s)); } })
      .catch((e) => { if (live) { setState("error"); setError(e instanceof Error ? e.message : "The edit model failed"); } });
    return () => { live = false; clearTimeout(t); };
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitNow = fit && fit.key === fitKey ? fit.fit : null;

  const open = async (files: File[]) => {
    const file = files[0];
    if (!file || !g) return;
    setState("decoding"); setError("");
    try {
      let raw: RawResult | null = null, previewBlob: Blob, lin: Float32Array, clipped: number | null = null, stops: number | null = null;
      if (RAW_EXT.test(file.name)) {
        raw = await decodeRaw(file);
        // render and measure in the worker: these loops cover ~15 M values
        const m = await getEngine().measureRaw(raw.px, raw.width, raw.height);
        previewBlob = m.preview; lin = m.lin; clipped = m.clipped; stops = m.stops;
      } else if (/image\/(jpeg|png)/.test(file.type)) {
        previewBlob = file; lin = await jpegLinear(file);
      } else throw new Error("Open a RAW file (Canon CR3 works best) or a JPEG or PNG.");
      const [{ analysis }, t] = await Promise.all([getEngine().analyze(previewBlob, 7), makeThumb(previewBlob)]);
      const meta = raw ? { camera: raw.camera, iso: raw.iso, shutter: raw.shutter, aperture: raw.aperture, craw: raw.craw, asShot: raw.asShot, decodeMs: raw.decodeMs } : null;
      const id = await saveInquiry({ kind: "edit", name: file.name, image: previewBlob, thumb: t.thumb, analysis, edit: { lin, clipped, stops, raw: meta } });
      setPicked(id); setState("idle");
    } catch (e) { setState("error"); setError(e instanceof Error ? e.message : "Could not read this file"); }
  };

  const busy = state === "decoding" || state === "fitting";
  const tempBand = fitNow ? (Math.abs(fitNow.ranges.temp.best) < 0.2 ? "slight" : Math.abs(fitNow.ranges.temp.best) < 0.5 ? "moderate" : "strong") : "slight";
  const sugg = loaded && fam ? suggest(loaded.analysis, fam) : [];

  return (
    <>
      <SiteHeader action={loaded && g ? <AddPhotos accept={ACCEPT} onFiles={open} label="Open another file" className="btn btn-secondary" disabled={busy} /> : undefined} />
      <main className="container">
        {mobile && <p className="banner" role="note">RAW files are large and work best on a desktop. On a phone, open a JPG or PNG instead.</p>}
        <div className="intro">
          <div><h1>Edit guide</h1>{loaded && <p className="file">{loaded.name}</p>}</div>
          {loaded?.raw ? (
            <dl className="facts facts-sm"><div><dt>Camera</dt><dd>{loaded.raw.camera}</dd></div><div><dt>ISO</dt><dd className="num">{loaded.raw.iso}</dd></div><div><dt>Shutter</dt><dd className="num">{loaded.raw.shutter < 1 ? `1/${Math.round(1 / loaded.raw.shutter)}` : `${loaded.raw.shutter} s`}</dd></div><div><dt>Aperture</dt><dd className="num">f/{loaded.raw.aperture?.toFixed(1)}</dd></div></dl>
          ) : g && <AddPhotos accept={ACCEPT} onFiles={open} label="Open a RAW or JPEG" disabled={busy} />}
        </div>
        <p className="status-line" role="status" aria-live="polite">{state === "decoding" ? "Decoding on this device…" : state === "fitting" ? "Fitting slider ranges…" : ""}</p>

        {!lib.loaded && <div className="skeleton" aria-hidden="true"><div className="sk-row" /><div className="sk-cards" /></div>}
        {lib.loaded && !g && <section className="card empty"><h2 className="card-h">Build your reference look first</h2><p className="note">The guide fits slider ranges toward one of your colour families.</p><Link className="btn btn-primary" href="/inspiration">Go to Inspiration</Link></section>}
        {g && !loaded && state !== "error" && <section className="card empty"><h2 className="card-h">Open a RAW or JPEG file</h2><p className="note">Canon CR3 works best, on a desktop. It is decoded here; nothing is uploaded. You get slider ranges toward your closest family.</p><AddPhotos accept={ACCEPT} onFiles={open} label="Open a file" disabled={busy} className="btn btn-primary" /></section>}
        {state === "error" && <section className="card errors" role="alert"><h2 className="card-h">That file could not be guided</h2><p>{error}</p>{g && <AddPhotos accept={ACCEPT} onFiles={open} label="Try another file" className="btn btn-secondary" />}</section>}

        {loaded && (
          <div className="ed-grid">
            <section className="ed-left" aria-label="The file">
              <figure className="cmp-photo">
                <img src={loaded.previewUrl} alt={loaded.raw ? "Neutral render of the RAW file" : "The photo"} />
                <figcaption>{loaded.raw ? "Our neutral render: camera white balance, no tone curve. Expect it flatter than your camera’s JPEG." : "JPEGs have limited headroom: big moves may band or clip."}</figcaption>
              </figure>
              <div className="readouts">
                <div className="ro"><h2 className="ro-h">Histogram</h2><Histogram rgb={loaded.analysis.rgbHist} height={84} /></div>
                <dl className="ro-list">
                  {loaded.clipped !== null && <div><dt>Clipped highlights</dt><dd><span className="num">{(loaded.clipped * 100).toFixed(2)}%</span> now{fitNow && <>, about <span className="num">{Math.round(fitNow.clippedAfter * 100)}%</span> after the exposure below</>}</dd></div>}
                  {loaded.stops !== null && <div><dt>Shadow room</dt><dd>About <span className="num">{loaded.stops.toFixed(1)}</span> stops above the noise floor</dd></div>}
                  {loaded.raw?.asShot && <div><dt>As-shot white balance</dt><dd>Red ×<span className="num">{loaded.raw.asShot.rOverG.toFixed(2)}</span>, blue ×<span className="num">{loaded.raw.asShot.bOverG.toFixed(2)}</span> (camera multipliers)</dd></div>}
                  {loaded.raw && <div><dt>Format</dt><dd>{loaded.raw.craw ? "Compressed C-RAW" : "RAW"}, decoded on this device in <span className="num">{(loaded.raw.decodeMs / 1000).toFixed(1)}</span>&nbsp;s</dd></div>}
                </dl>
              </div>
            </section>
            <section className="card ed-card" aria-labelledby="sl-h">
              <div className="h-row"><h2 id="sl-h" className="card-h">Slider ranges</h2><Estimated /></div>
              <label className="move-to target">Toward
                <select value={target ?? ""} onChange={(e) => { if (row) void setEditTarget(row.id, e.target.value); }} disabled={busy || !loaded.matches.length}>
                  {loaded.matches.map((m, i) => <option key={m.id} value={m.id}>{name(m.id, m.name)}{i === 0 ? " (closest)" : ""}</option>)}
                </select>
              </label>
              <p className="note">Fitted with our own simple edit model, so these are starting ranges, not Lightroom’s exact numbers.</p>
              {!fitNow ? <div className="skeleton" aria-hidden="true"><div className="sk-row" /><div className="sk-row" /></div> : (<>
                <ul className="sliders">
                  <Slider label="Exposure" r={fitNow.ranges.exposure} min={-2} max={2} unit=" EV" fmt={ev} />
                  <Slider label="Contrast" r={fitNow.ranges.contrast} min={-100} max={100} fmt={signed} />
                  <Slider label="Highlights" r={fitNow.ranges.highlights} min={-100} max={100} fmt={signed} />
                  <Slider label="Shadows" r={fitNow.ranges.shadows} min={-100} max={100} fmt={signed} />
                  <li className="slider"><span className="s-name">Temp</span><span className="s-dir">{fitNow.ranges.temp.best > 0 ? "Warmer" : fitNow.ranges.temp.best < 0 ? "Cooler" : "Leave"}</span>
                    {fitNow.ranges.temp.best !== 0 && <MoveGlyph s={{ group: "Color", control: "Temp", sign: fitNow.ranges.temp.best > 0 ? "+" : "−", band: tempBand, why: "", delta: 0 }} />}
                    {fitNow.ranges.temp.best !== 0 && <span className="s-val"><span className="meter" role="img" aria-label={tempBand}>{[1, 2, 3].map((i) => <span key={i} className={i <= BAND_STEPS[tempBand] ? "on" : undefined} />)}</span><span className="band">{tempBand}</span></span>}</li>
                </ul>
                {fitNow.clippedAfter > 0.005 && <p className="risk"><b>Clipping risk.</b> The suggested exposure pushes about {Math.round(fitNow.clippedAfter * 100)}% of pixels to pure white. Pull Highlights down first if the sky matters.</p>}
                {sugg.length === 0 && <p className="note">This file already sits close to the family.</p>}
              </>)}
            </section>
          </div>
        )}

        {loaded && fam && (
          <section className="colour" aria-labelledby="col-h">
            <div className="sec-head"><h2 id="col-h">Colour, toward {name(fam.id, fam.name)}</h2><p className="note">The ring is your photo now, the dot is the family. Move each slider in Lightroom’s HSL panel the same way.</p></div>
            <div className="colour-grid">
              <div className="card"><div className="h-row"><h3 className="card-h">HSL by colour</h3><Estimated /></div><HslGuide mine={loaded.analysis.hsl} theirs={fam.summary.hsl} famName={name(fam.id, fam.name)} /></div>
              <div className="card"><div className="h-row"><h3 className="card-h">Color grading</h3></div><GradingGuide mine={loaded.analysis.grading} theirs={fam.summary.grading} famName={name(fam.id, fam.name)} /></div>
            </div>
          </section>
        )}
        <History rows={rows} current={row?.id ?? null} onOpen={setPicked} label="Previous files" />
      </main>
    </>
  );
}
