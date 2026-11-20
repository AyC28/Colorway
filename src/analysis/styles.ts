/**
 * Colour styles: a fixed list of common photography looks. Every photo is scored
 * against every style from what the analysis already measures, and belongs to the
 * style it fits best. Scores are 0..1 fuzzy memberships, not probabilities.
 * Pure: runs in the worker and in Node.
 */
import { smoothstep as s } from "./color";
import type { PhotoAnalysis } from "./photo";

export interface StyleDef { id: string; name: string; blurb: string }

export const STYLES: StyleDef[] = [
  { id: "golden-hour", name: "Golden hour", blurb: "Warm, low light; golden highlights" },
  { id: "warm-earth", name: "Warm earth", blurb: "Sand, rock, autumn tones" },
  { id: "lush-green", name: "Lush green", blurb: "Greens lead; natural saturation" },
  { id: "teal-orange", name: "Teal & orange", blurb: "Warm highlights, cool shadows" },
  { id: "blue-hour", name: "Blue hour", blurb: "Blue leads; twilight and dusk" },
  { id: "cool-crisp", name: "Cool & crisp", blurb: "Bright, cool, restrained" },
  { id: "moody-dark", name: "Moody & dark", blurb: "Low-key, deep shadows, muted" },
  { id: "bright-airy", name: "Bright & airy", blurb: "High-key, soft, pastel" },
  { id: "faded-film", name: "Faded film", blurb: "Lifted blacks, low contrast" },
  { id: "night-neon", name: "Night & neon", blurb: "Dark with vivid lights" },
  { id: "monochrome", name: "Monochrome", blurb: "Little or no colour" },
];
export const styleById = new Map(STYLES.map((x) => [x.id, x]));

/** Share of the chroma-weighted hue histogram between two hue angles (degrees, may wrap). */
export function hueShare(hist: number[], from: number, to: number): number {
  const w = 360 / hist.length;
  let t = 0;
  for (let i = 0; i < hist.length; i++) {
    const h = (i + 0.5) * w;
    if (from <= to ? h >= from && h < to : h >= from || h < to) t += hist[i];
  }
  return t;
}
const inHue = (h: number, from: number, to: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

/** The measurements every style is judged on, from one analysis. Exported for tests and tuning. */
export function styleInputs(a: PhotoAnalysis) {
  const colourful = 1 - a.neutralShare;
  const warm = hueShare(a.hueHist, 15, 98);    // red-orange through gold
  const green = hueShare(a.hueHist, 98, 165);  // olive through green
  const cool = hueShare(a.hueHist, 165, 285);  // teal, cyan, blue
  const [sh, , hi] = a.grading;
  return {
    L: a.tone.p50, contrast: a.tone.p95 - a.tone.p5, black: a.tone.p1,
    chroma: a.tone.chromaP90, colourful, warm, green, cool,
    glow: a.glow.score ?? 0,
    hiWarm: inHue(hi.hue, 30, 100) ? s(4, 18, hi.sat) : 0,
    shCool: inHue(sh.hue, 160, 270) ? s(4, 18, sh.sat) : 0,
  };
}

/** Every style's fit for one photo, best first. */
export function scoreStyles(a: PhotoAnalysis): { id: string; score: number }[] {
  const x = styleInputs(a);
  const vivid = s(0.07, 0.13, x.chroma), muted = 1 - vivid;
  const dark = 1 - s(0.3, 0.46, x.L), bright = s(0.6, 0.74, x.L);
  const lowContrast = 1 - s(0.5, 0.7, x.contrast);
  const hasColour = s(0.08, 0.2, x.colourful);
  const raw: Record<string, number> = {
    "golden-hour": hasColour * s(0.45, 0.68, x.warm) * Math.max(s(25, 60, x.glow), x.hiWarm) * (1 - 0.6 * dark),
    "warm-earth": hasColour * s(0.5, 0.72, x.warm) * (1 - 0.7 * s(35, 70, x.glow)) * (1 - 0.5 * x.shCool),
    "lush-green": hasColour * s(0.32, 0.55, x.green) * (1 - 0.5 * dark),
    "teal-orange": hasColour * x.hiWarm * x.shCool * s(0.2, 0.35, x.warm) * s(0.15, 0.3, x.cool),
    // twilight is dim: daytime blues belong to Cool & crisp
    "blue-hour": hasColour * s(0.42, 0.65, x.cool) * (1 - s(0.4, 0.56, x.L)),
    "cool-crisp": s(0.48, 0.62, x.L) * s(0.35, 0.6, x.cool + 0.5 * (1 - x.colourful)) * (1 - 0.6 * vivid) * (1 - 0.7 * s(0.45, 0.65, x.warm)),
    "moody-dark": dark * muted * (1 - 0.5 * s(0.1, 0.2, x.chroma)),
    "bright-airy": bright * lowContrast * (1 - 0.6 * vivid),
    "faded-film": hasColour * s(0.14, 0.22, x.black) * lowContrast * muted, // muted colour, not black and white
    "night-neon": (1 - s(0.24, 0.38, x.L)) * s(0.1, 0.17, x.chroma),
    // truly little colour: muted snow or mist still has some, and goes elsewhere
    "monochrome": s(0.85, 0.97, 1 - x.colourful) * (1 - s(0.03, 0.06, x.chroma)),
  };
  return STYLES.map((d) => ({ id: d.id, score: Math.max(0, Math.min(1, raw[d.id])) })).sort((p, q) => q.score - p.score);
}

/** The best style; falls back to the closest one even when nothing fits strongly. */
export const bestStyle = (a: PhotoAnalysis) => scoreStyles(a)[0];
