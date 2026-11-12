/**
 * Compare one photo to the families: nearest family + suggested Lightroom
 * moves as direction + band. Never exact slider values.
 */
import { CONFIG } from "./config";
import { paletteDistance } from "./palette";
import { zscore, type Family, type FamilyResult } from "./group";
import type { PhotoAnalysis } from "./photo";

export type Band = "slight" | "moderate" | "strong";

export interface Suggestion {
  group: "Light" | "Color" | "HSL" | "Color Grading" | "Effects";
  control: string;
  /** "+" raise the slider, "−" lower it */
  sign: "+" | "−";
  band: Band;
  /** plain-language reason */
  why: string;
  /** raw delta in our metric (target − photo), for debugging/tuning */
  delta: number;
}

export interface FamilyMatch { id: string; name: string; featureDist: number; paletteDist: number; score: number }

export interface CompareResult {
  matches: FamilyMatch[];
  family: { id: string; name: string };
  suggestions: Suggestion[];
  /** shown in UI: JPEG has limited headroom */
  headroomNote: string;
}

/** [dead-zone, slight→moderate, moderate→strong] on |delta| */
const BANDS = {
  exposure: [0.015, 0.04, 0.08],
  temp: [0.004, 0.01, 0.02],
  tint: [0.004, 0.01, 0.02],
  contrast: [0.02, 0.05, 0.1],
  tonePct: [0.015, 0.04, 0.08],
  logChroma: [0.08, 0.2, 0.4],
  hueDeg: [4, 10, 20],
  hslL: [0.02, 0.05, 0.1],
  grading: [0.006, 0.015, 0.03],
  glow: [10, 25, 45],
} as const;

function band(delta: number, t: readonly number[]): Band | null {
  const d = Math.abs(delta);
  if (d < t[0]) return null;
  return d < t[1] ? "slight" : d < t[2] ? "moderate" : "strong";
}

export function matchFamilies(photo: PhotoAnalysis, fam: FamilyResult): FamilyMatch[] {
  const z = zscore(photo.features, fam.standardizer);
  return fam.families
    .map((f) => {
      const featureDist = Math.sqrt(f.centroidZ.reduce((s, x, i) => s + (x - z[i]) ** 2, 0) / z.length);
      const paletteDist = paletteDistance(photo.palette, f.summary.palette);
      // palette distance is in OKLab units (~0.02–0.2); scale to be comparable with z-distance
      const score = featureDist + CONFIG.compare.paletteWeight * (paletteDist / 0.05);
      return { id: f.id, name: f.name, featureDist, paletteDist, score };
    })
    .sort((a, b) => a.score - b.score);
}

export function suggest(photo: PhotoAnalysis, target: Family): Suggestion[] {
  const t = target.summary;
  const p = photo;
  const out: Suggestion[] = [];
  const push = (group: Suggestion["group"], control: string, delta: number, bands: readonly number[], why: (s: "+" | "−") => string) => {
    const b = band(delta, bands);
    if (!b) return;
    const sign = delta > 0 ? "+" : "−";
    out.push({ group, control, sign, band: b, why: why(sign), delta });
  };

  // Light
  push("Light", "Exposure", t.tone.p50 - p.tone.p50, BANDS.exposure, (s) => `median brightness is ${s === "+" ? "below" : "above"} the family`);
  push("Light", "Contrast", t.tone.p95 - t.tone.p5 - (p.tone.p95 - p.tone.p5), BANDS.contrast, (s) => `tonal range (5th–95th percentile) is ${s === "+" ? "narrower" : "wider"} than the family`);
  push("Light", "Highlights", t.tone.p90 - p.tone.p90, BANDS.tonePct, (s) => `upper tones sit ${s === "+" ? "lower" : "higher"} than the family`);
  push("Light", "Whites", t.tone.p99 - p.tone.p99, BANDS.tonePct, (s) => `brightest points are ${s === "+" ? "dimmer" : "brighter"} than the family`);
  push("Light", "Shadows", t.tone.p10 - p.tone.p10, BANDS.tonePct, (s) => `shadows are ${s === "+" ? "deeper" : "more open"} than the family`);
  push("Light", "Blacks", t.tone.p1 - p.tone.p1, BANDS.tonePct, (s) => `black point is ${s === "+" ? "lower" : "higher"} than the family`);

  // Color
  push("Color", "Temp", t.tone.meanB - p.tone.meanB, BANDS.temp, (s) => `overall cast is ${s === "+" ? "cooler" : "warmer"} than the family`);
  push("Color", "Tint", t.tone.meanA - p.tone.meanA, BANDS.tint, (s) => `overall cast is ${s === "+" ? "greener" : "more magenta"} than the family`);
  const lr = (a: number, b: number) => Math.log(Math.max(a, 1e-4) / Math.max(b, 1e-4));
  push("Color", "Vibrance", lr(t.tone.chromaMedian, p.tone.chromaMedian), BANDS.logChroma, (s) => `muted colours are ${s === "+" ? "less" : "more"} saturated than the family`);
  push("Color", "Saturation", lr(t.tone.chromaP90, p.tone.chromaP90), BANDS.logChroma, (s) => `strongest colours are ${s === "+" ? "less" : "more"} saturated than the family`);

  // HSL per bucket (only where either side has real colour in that bucket)
  t.hsl.forEach((th, i) => {
    const ph = p.hsl[i];
    if (th.share < 0.05 || ph.share < 0.05) return;
    let dh = th.hue - ph.hue;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    push("HSL", `${th.name} Hue`, dh, BANDS.hueDeg, (s) => `${th.name.toLowerCase()}s lean ${s === "+" ? "the next hue up" : "the previous hue"} in the family`);
    push("HSL", `${th.name} Saturation`, lr(th.c, ph.c), BANDS.logChroma, (s) => `${th.name.toLowerCase()}s are ${s === "+" ? "richer" : "softer"} in the family`);
    push("HSL", `${th.name} Luminance`, th.l - ph.l, BANDS.hslL, (s) => `${th.name.toLowerCase()}s are ${s === "+" ? "lighter" : "darker"} in the family`);
  });

  // Color grading: per-range tint vector delta
  t.grading.forEach((tg, r) => {
    const pg = p.grading[r];
    const da = tg.a - pg.a, db = tg.b - pg.b;
    const mag = Math.hypot(da, db);
    const b = band(mag, BANDS.grading);
    if (!b) return;
    let hue = (Math.atan2(db, da) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    out.push({
      group: "Color Grading",
      control: `${cap(tg.range)} wheel`,
      sign: "+",
      band: b,
      why: `push ${tg.range} toward hue ≈${Math.round(hue)}° (family ${tg.hex})`,
      delta: mag,
    });
  });

  // Glow
  if (t.glow.score !== null && p.glow.score !== null) {
    const d = t.glow.score - p.glow.score;
    const b = band(d, BANDS.glow);
    if (b)
      out.push({
        group: "Effects",
        control: d > 0 ? "Clarity / Dehaze (soften)" : "Clarity / Dehaze (crisp up)",
        sign: d > 0 ? "−" : "+",
        band: b,
        why: d > 0 ? "family highlights glow more: lower Clarity/Dehaze or add soft bloom" : "family highlights are crisper",
        delta: d,
      });
  }
  return out;
}

export function comparePhoto(photo: PhotoAnalysis, fam: FamilyResult, isJpeg = true): CompareResult {
  const matches = matchFamilies(photo, fam);
  const f = fam.families.find((x) => x.id === matches[0].id)!;
  return {
    matches,
    family: { id: f.id, name: f.name },
    suggestions: suggest(photo, f),
    headroomNote: isJpeg
      ? "JPEGs have limited headroom: large exposure, highlight or white-balance moves may band or clip. Treat these as directions, not exact values."
      : "",
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
