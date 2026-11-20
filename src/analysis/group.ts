/**
 * Set-level and family-level summaries. Every photo gets an equal say,
 * so one large or very colourful photo can't dominate.
 */
import { CONFIG, HSL_BUCKETS } from "./config";
import { hueDeg, oklabToHex } from "./color";
import { bestStyle, STYLES } from "./styles";
import { paletteFromSample, poolEqual, type Swatch } from "./palette";
import { gradingFromAB, type GradingRange, type HslStat, type PhotoAnalysis, type ToneStats } from "./photo";

export interface GroupSummary {
  count: number;
  neutralShare: number;
  palette: Swatch[];
  topPalette: Swatch[];
  bottomPalette: Swatch[];
  toneHist: number[];
  rgbHist: { r: number[]; g: number[]; b: number[] };
  hueHist: number[];
  tone: ToneStats;
  hsl: HslStat[];
  grading: GradingRange[];
  glow: { score: number | null; label: string; hex: string | null; scored: number };
  /** mean raw feature vector */
  features: number[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const meanVec = (vs: number[][]) => vs[0].map((_, i) => mean(vs.map((v) => v[i])));

export function summarize(photos: PhotoAnalysis[], seed = 1): GroupSummary {
  const tone = Object.fromEntries(
    (Object.keys(photos[0].tone) as (keyof ToneStats)[]).map((k) => [k, mean(photos.map((p) => p.tone[k]))]),
  ) as unknown as ToneStats;

  const hsl: HslStat[] = HSL_BUCKETS.map((b, i) => {
    const ps = photos.map((p) => p.hsl[i]);
    const withMass = ps.filter((h) => h.share > 0.01);
    let a = 0, bb = 0, l = 0, c = 0, m = 0;
    for (const h of withMass) {
      const r = (h.hue * Math.PI) / 180;
      a += Math.cos(r) * h.share; bb += Math.sin(r) * h.share; l += h.l * h.share; c += h.c * h.share; m += h.share;
    }
    return { name: b.name, share: mean(ps.map((h) => h.share)), hue: m ? hueDeg(a, bb) : NaN, l: m ? l / m : NaN, c: m ? c / m : NaN };
  });

  const grading = (["shadows", "midtones", "highlights"] as const).map((range, r) => {
    const present = photos.map((p) => p.grading[r]).filter((g) => g.presence > 0.02);
    return gradingFromAB(range, mean(present.map((g) => g.a)) || 0, mean(present.map((g) => g.b)) || 0, mean(photos.map((p) => p.grading[r].presence)));
  });

  const glows = photos.map((p) => p.glow).filter((g) => g.score !== null);
  const glowScore = glows.length ? Math.round(mean(glows.map((g) => g.score!))) : null;
  const tinted = glows.filter((g) => g.hex);
  const glow = {
    score: glowScore,
    label: glowScore === null ? "no bright highlights" : CONFIG.glow.labels.find(([lim]) => glowScore < lim)![1],
    hex: tinted.length
      ? oklabToHex(0.85, mean(tinted.map((g) => g.tintA)), mean(tinted.map((g) => g.tintB)))
      : null,
    scored: glows.length,
  };

  return {
    count: photos.length,
    neutralShare: mean(photos.map((p) => p.neutralShare)),
    palette: paletteFromSample(poolEqual(photos.map((p) => p.sample.all)), CONFIG.paletteK, seed),
    topPalette: paletteFromSample(poolEqual(photos.map((p) => p.sample.top)), CONFIG.paletteK, seed),
    bottomPalette: paletteFromSample(poolEqual(photos.map((p) => p.sample.bottom)), CONFIG.paletteK, seed),
    toneHist: meanVec(photos.map((p) => p.toneHist)),
    hueHist: meanVec(photos.map((p) => p.hueHist)),
    tone, hsl, grading, glow,
    rgbHist: {
      r: meanVec(photos.map((p) => p.rgbHist.r)),
      g: meanVec(photos.map((p) => p.rgbHist.g)),
      b: meanVec(photos.map((p) => p.rgbHist.b)),
    },
    features: meanVec(photos.map((p) => p.features)),
  };
}

// ---------------------------------------------------------------- families

export interface Standardizer { mu: number[]; sd: number[] }

/** Per-group pooled SD (keeps hue-vector geometry intact), divided by the group weight. */
export function standardizer(vs: number[][]): Standardizer {
  const mu = meanVec(vs);
  const sd = mu.map(() => 1);
  for (const g of CONFIG.families.groups) {
    const v = mean(g.dims.map((d) => mean(vs.map((x) => (x[d] - mu[d]) ** 2))));
    const pooled = Math.sqrt(v) || 1;
    for (const d of g.dims) sd[d] = pooled / g.weight;
  }
  return { mu, sd };
}
export const zscore = (v: number[], s: Standardizer) => v.map((x, i) => (x - s.mu[i]) / s.sd[i]);

export interface Family {
  id: string;
  name: string;
  members: number[]; // photo indices
  centroidZ: number[];
  summary: GroupSummary;
  /** the colour style this family is (styles.ts) */
  style?: string;
}

export interface FamilyResult {
  k: number;
  silhouettes: { k: number; score: number }[];
  standardizer: Standardizer;
  families: Family[];
}

/**
 * Families are colour styles (see styles.ts): each photo joins the style it fits best.
 * Ids are the style ids, so names, moves and syncing stay stable as photos come and go.
 * The standardiser and centroids are kept for the palette/feature side of matching.
 */
export function buildFamilies(photos: PhotoAnalysis[], seed = 1): FamilyResult {
  const std = standardizer(photos.map((p) => p.features));
  const Z = photos.map((p) => zscore(p.features, std));
  const buckets = new Map<string, number[]>();
  photos.forEach((p, i) => { const id = bestStyle(p).id; buckets.set(id, [...(buckets.get(id) ?? []), i]); });
  const families: Family[] = STYLES.filter((d) => buckets.has(d.id)).map((d) => {
    const members = buckets.get(d.id)!;
    return { id: d.id, name: d.name, style: d.id, members, centroidZ: meanVec(members.map((i) => Z[i])), summary: summarize(members.map((i) => photos[i]), seed) };
  });
  families.sort((x, y) => y.members.length - x.members.length);
  return { k: families.length, silhouettes: [], standardizer: std, families };
}

/** Photographer-friendly hue words over OKLCH hue (degrees). */
const HUE_WORDS: [number, string][] = [
  [30, "Red"], [62, "Orange"], [95, "Golden"], [125, "Olive"], [160, "Green"],
  [215, "Teal"], [270, "Blue"], [310, "Violet"], [350, "Pink"], [360, "Red"],
];
export function hueWord(x: number, y: number): string {
  if (Math.hypot(x, y) < 0.15) return "Mixed-hue";
  return HUE_WORDS.find(([lim]) => hueDeg(x, y) < lim)![1];
}

