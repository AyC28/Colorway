"use client";
/**
 * React wrapper for the 3D colour graph. three.js loads only when this mounts
 * (i.e. when its tab is opened). Layers come from the analyses' colour samples.
 */
import { useEffect, useRef, useState } from "react";
import type { LabSample } from "@/analysis/palette";
import type { AxisLabel, ColorSpaceView } from "./colorSpace3d";

export interface ColorLayer { id: string; label: string; samples: LabSample[]; style: "cloud" | "focus" }
const AXIS_TEXT: Record<AxisLabel["id"], string> = { light: "Light", dark: "Dark", red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };

/** Up to `perPhoto` points from each photo, so every photo counts the same. */
export function poolSamples(samples: LabSample[], perPhoto = 220): Float32Array {
  const out: number[] = [];
  for (const s of samples) {
    const n = s.w.length;
    if (!n) continue;
    const step = Math.max(1, n / perPhoto);
    for (let i = 0; i < n; i += step) { const j = Math.floor(i) * 3; out.push(s.lab[j], s.lab[j + 1], s.lab[j + 2]); }
  }
  return new Float32Array(out);
}

export function ColorSpace({ layers, perPhoto = 220 }: { layers: ColorLayer[]; perPhoto?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<ColorSpaceView | null>(null);
  const [ready, setReady] = useState<"loading" | "ok" | "no-webgl">("loading");
  const [axes, setAxes] = useState<AxisLabel[]>([]);
  const [shown, setShown] = useState<"all" | string>("all");
  const key = layers.map((l) => `${l.id}:${l.samples.length}`).join("|");

  useEffect(() => {
    let dead = false;
    const ok = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } })();
    if (!ok) { const t = setTimeout(() => setReady("no-webgl"), 0); return () => clearTimeout(t); }
    import("./colorSpace3d").then(({ createColorSpace }) => {
      if (dead || !canvas.current) return;
      view.current = createColorSpace(canvas.current, setAxes);
      setReady("ok");
    });
    return () => { dead = true; view.current?.dispose(); view.current = null; };
  }, []);

  useEffect(() => {
    if (ready !== "ok" || !view.current) return;
    view.current.setLayers(layers.map((l) => ({ id: l.id, lab: poolSamples(l.samples, l.style === "focus" ? 900 : perPhoto), style: l.style, visible: shown === "all" || shown === l.id })));
  }, [ready, key, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cs">
      <div className="cs-bar">
        {layers.length > 1 && (
          <div className="seg" role="group" aria-label="Show">
            <button type="button" className="seg-b" aria-pressed={shown === "all"} onClick={() => setShown("all")}>Both</button>
            {layers.map((l) => <button key={l.id} type="button" className="seg-b" aria-pressed={shown === l.id} onClick={() => setShown(l.id)}>{l.label}</button>)}
          </div>
        )}
        {layers.length > 1 && (
          <p className="cs-legend">{layers.map((l) => <span key={l.id} className={`cs-key cs-${l.style}`}>{l.label}</span>)}</p>
        )}
        <button type="button" className="link-btn" onClick={() => view.current?.reset()}>Reset view</button>
      </div>
      <div className="cs-stage">
        <canvas ref={canvas} className="cs-canvas" tabIndex={0} aria-label="3D colour graph. Drag or use the arrow keys to turn it." />
        {ready === "ok" && <div className="axis-labels cs-axes" aria-hidden="true">{axes.map((a) => <span key={a.id} className="axis-l" style={{ left: a.x, top: a.y }}>{AXIS_TEXT[a.id]}</span>)}</div>}
        {ready === "no-webgl" && <p className="note cs-msg">This browser can’t draw 3D graphs.</p>}
      </div>
      <p className="note">Colourful pixels only. Drag to turn.</p>
    </div>
  );
}
