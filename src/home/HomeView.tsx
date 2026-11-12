"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AxisLabel, CloudView } from "./cloud3d";

const AXIS_TEXT: Record<AxisLabel["id"], string> = { light: "Light", dark: "Dark", red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };

const STEPS = [
  { h: "One of your photos", p: "Shrunk to 96 by 64 pixels and read in your browser. Nothing is uploaded." },
  { h: "Every pixel, placed by colour", p: "Dark to light runs up the middle. Around it, green faces red and blue faces yellow, so hue is the direction a pixel leans and the more colourful it is, the further out it sits." },
  { h: "Grouped into a palette", p: "Similar pixels pull together. Each group becomes one colour in the photo’s palette, with a hex code to copy." },
  { h: "Turn it around", p: "Drag the cloud, or focus it and use the arrow keys, to see the colour from every side." },
];
/** The static story has nothing to drag, so its last step says what the 3D view would show. */
const STATIC_LAST = "On a desktop with motion on, this cloud turns in 3D so you can see the colour from every side.";
const FALLBACK = ["/home/sample.webp", "/home/cloud.webp", "/home/cloud-grouped.webp", "/home/cloud-grouped.webp"];

/** 3D only where it helps: motion allowed, a wide screen, a capable device and WebGL. */
function canRun3D() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.innerWidth < 900) return false;
  if ((navigator.hardwareConcurrency ?? 8) <= 2) return false;
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}

export function HomeView() {
  const story = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<CloudView | null>(null);
  const [mode, setMode] = useState<"pending" | "3d" | "static">("pending");
  const [step, setStep] = useState(0);
  const [palette, setPalette] = useState<{ hex: string; neutral: boolean }[]>([]);
  const [axes, setAxes] = useState<{ labels: AxisLabel[]; visible: number }>({ labels: [], visible: 0 });

  useEffect(() => {
    const run = canRun3D();
    let disposed = false;
    fetch("/home/points.json").then((r) => r.json()).then(async (d) => {
      if (disposed) return;
      setPalette(d.palette);
      if (!run || !canvas.current) { setMode("static"); return; }
      const { createCloud } = await import("./cloud3d"); // three.js loads only here
      if (disposed || !canvas.current) return;
      const dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      view.current = createCloud(canvas.current, { ...d, rgb: dec(d.rgb), group: dec(d.group) }, (labels, visible) => setAxes({ labels, visible }));
      setMode("3d");
    }).catch(() => setMode("static"));
    return () => { disposed = true; view.current?.dispose(); view.current = null; };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const el = story.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      view.current?.setProgress(p);
      setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length * 0.999)));
    };
    const onResize = () => { view.current?.resize(); onScroll(); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); };
  }, [mode]);

  return (
    <>
      <header className="bar container">
        <Link className="wordmark" href="/" aria-label="Colorway home">Colorway</Link>
        <nav className="links" aria-label="Sections"><ul><li><a href="#story">How it works</a></li><li><Link href="/inspiration">Open the studio</Link></li></ul></nav>
        <Link className="btn btn-secondary" href="/login">Sign in</Link>
      </header>
      <main className="home">
        <section className="hero container" aria-labelledby="hero-h">
          <div className="hero-text">
            <h1 id="hero-h">See the colour in your photos</h1>
            <p className="lead">Colorway reads the photos you love and shows the palette behind them.</p>
            <div className="actions"><Link className="btn btn-primary btn-lg" href="/inspiration?starter=1">Try the starter set</Link><Link className="btn btn-secondary btn-lg" href="/inspiration">Upload your photos</Link></div>
            <p className="privacy">Analysed in your browser. Your originals never leave your device.</p>
          </div>
          <figure className="hero-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home/sample.webp" width={1400} height={933} alt="A red-brick Victorian building with a clock tower behind summer trees, under a clear blue sky" fetchPriority="high" />
            <figcaption>Scroll to take this photo apart.</figcaption>
          </figure>
        </section>

        <section id="story" ref={story} className="story" aria-label="How Colorway reads a photo">
          <div className="story-stage">
            {mode === "3d" && axes.visible > 0.3 && (
              <div className="axis-labels" aria-hidden="true" style={{ opacity: Math.min(1, (axes.visible - 0.3) / 0.4) }}>
                {axes.labels.map((l) => <span key={l.id} className={`axis-l axis-${l.id}`} style={{ left: l.x, top: l.y }}>{AXIS_TEXT[l.id]}</span>)}
              </div>
            )}
            <canvas ref={canvas} className="story-canvas" hidden={mode !== "3d"} tabIndex={mode === "3d" ? 0 : -1} aria-label="The photo’s pixels as a 3D colour cloud. Drag or use the arrow keys to turn it." />
            {mode !== "3d" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="story-fallback" src={FALLBACK[step]} alt={STEPS[step].h} width={step === 0 ? 1400 : 900} height={step === 0 ? 933 : 760} />
            )}
            {step >= 2 && palette.length > 0 && (
              <ol className="story-pal" aria-label="The photo’s palette">{palette.map((s) => <li key={s.hex} style={{ "--sw": s.hex } as React.CSSProperties}><span className="vh">{s.hex}</span></li>)}</ol>
            )}
          </div>
          <ol className="story-steps">
            {STEPS.map((s, i) => (
              <li key={s.h} className={i === step ? "is-on" : undefined}><h2>{s.h}</h2><p>{i === 3 && mode !== "3d" ? STATIC_LAST : s.p}</p></li>
            ))}
          </ol>
        </section>

        <section className="summary container" aria-labelledby="sum-h">
          <h2 id="sum-h">What Colorway does with your photos</h2>
          <ol className="sum-list">
            <li><h3>Finds your palette</h3><p>Up to 50 reference photos become one palette, plus sky and ground colours, tone and hue charts.</p></li>
            <li><h3>Sorts them into families</h3><p>Sunsets, blue hours, misty greens: grouped by hue and brightness, and yours to rename.</p></li>
            <li><h3>Compares a new photo</h3><p>Matched to its closest family, with the way to move each Lightroom slider.</p></li>
            <li><h3>Guides a RAW edit</h3><p>Slider ranges for a Canon CR3, fitted toward the family you pick, labelled as estimates.</p></li>
            <li><h3>Previews your grid</h3><p>3:4 tiles on a phone, light or dark, ordered for a smooth flow of colour.</p></li>
          </ol>
          <p className="privacy">Everything is measured on your device. Accounts only sync palettes and small thumbnails.</p>
          <Link className="btn btn-primary btn-lg" href="/inspiration">Open the studio</Link>
        </section>
      </main>
    </>
  );
}
