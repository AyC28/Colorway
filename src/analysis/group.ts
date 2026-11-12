/**
 * Set-level and family-level summaries. Every photo gets an equal say,
 * so one large or very colourful photo can't dominate.
 */
import { CONFIG, HSL_BUCKETS } from "./config";
import { hueDeg, oklabToHex } from "./color";
import { kmeansBest, silhouette } from "./kmeans";
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
}

export interface FamilyResult {
  k: number;
  silhouettes: { k: number; score: number }[];
  standardizer: Standardizer;
  families: Family[];
}

export function buildFamilies(photos: PhotoAnalysis[], seed = 1): FamilyResult {
  const n = photos.length;
  const F = CONFIG.families;
  const std = standardizer(photos.map((p) => p.features));
  const Z = photos.map((p) => zscore(p.features, std));
  const dim = Z[0].length;
  const data = Float64Array.from(Z.flat());
  const maxK = Math.min(F.maxK, Math.floor(n / F.minPerK));

  let labels: Int32Array = new Int32Array(n);
  let k = 1;
  const silhouettes: { k: number; score: number }[] = [];
  if (maxK >= 2) {
    let bestS = -Infinity;
    for (let kk = 2; kk <= maxK; kk++) {
      const res = kmeansBest(data, null, dim, kk, F.restarts, seed);
      const s = silhouette(data, dim, res.labels, kk);
      silhouettes.push({ k: kk, score: s });
      if (s > bestS) { bestS = s; labels = res.labels; k = kk; }
    }
  }

  // merge clusters smaller than minClusterSize into the nearest other centroid
  const centroid = (c: number) => {
    const idx = [...labels.keys()].filter((i) => labels[i] === c);
    return idx.length ? meanVec(idx.map((i) => Z[i])) : null;
  };
  for (;;) {
    const sizes = new Map<number, number>();
    labels.forEach((l) => sizes.set(l, (sizes.get(l) ?? 0) + 1));
    if (sizes.size <= 1) break;
    const small = [...sizes].filter(([, s]) => s < F.minClusterSize).sort((a, b) => a[1] - b[1])[0];
    if (!small) break;
    const [c] = small;
    // reassign each member to its nearest remaining centroid
    const others = [...sizes.keys()].filter((o) => o !== c).map((o) => ({ o, z: centroid(o)! }));
    labels.forEach((l, i) => {
      if (l !== c) return;
      let best = others[0].o, bd = Infinity;
      for (const { o, z } of others) {
        const d = z.reduce((s, x, j) => s + (x - Z[i][j]) ** 2, 0);
        if (d < bd) { bd = d; best = o; }
      }
      labels[i] = best;
    });
  }

  let groups = [...new Set(labels)].map((c) => [...labels.keys()].filter((i) => labels[i] === c));
  if (F.mergeSameHue) {
    // the hue key a family would be named by (sky/ground pair when no single hue dominates)
    const key = (members: number[]) => {
      const f = meanVec(members.map((i) => photos[i].features));
      const h = hueWord(f[1], f[2]);
      return h !== "Mixed-hue" ? h : `${hueWord(f[3], f[4])}/${hueWord(f[5], f[6])}`;
    };
    const merged = new Map<string, number[]>();
    for (const g of groups) { const k = key(g); merged.set(k, [...(merged.get(k) ?? []), ...g]); }
    groups = [...merged.values()];
  }
  groups.sort((a, b) => b.length - a.length);
  const families: Family[] = groups.map((members, fi) => {
    const summary = summarize(members.map((i) => photos[i]), seed);
    return { id: `f${fi + 1}`, name: "", members, centroidZ: meanVec(members.map((i) => Z[i])), summary };
  });
  nameFamilies(families, photos.map((p) => p.features));
  return { k: families.length, silhouettes, standardizer: std, families };
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

/**
 * Names from hue + brightness only: "<hue> & <bright|dark>", the brightness
 * word only when the family stands out from the set (|z| ≥ 0.5). Duplicates
 * get their sky/ground hues, e.g. "Green, blue sky".
 */
function nameFamilies(families: Family[], all: number[][]) {
  const Ls = all.map((v) => v[0]);
  const mu = mean(Ls), sd = Math.sqrt(mean(Ls.map((x) => (x - mu) ** 2))) || 1;
  const base = families.map((fam) => {
    const f = fam.summary.features;
    const z = (f[0] - mu) / sd;
    const light = z >= 0.5 ? "bright" : z <= -0.5 ? "dark" : "";
    let hue = hueWord(f[1], f[2]);
    // no single dominant hue but sky and ground each have one (e.g. sunset over water)
    const sky = hueWord(f[3], f[4]), ground = hueWord(f[5], f[6]);
    if (hue === "Mixed-hue" && sky !== "Mixed-hue" && ground !== "Mixed-hue" && sky !== ground)
      hue = `${sky} sky / ${ground.toLowerCase()} ground`;
    return [hue, light].filter(Boolean).join(" & ");
  });
  const used = new Map<string, number>();
  families.forEach((fam, i) => {
    let name = base[i];
    if (base.filter((b) => b === name).length > 1) {
      const f = fam.summary.features;
      const sky = hueWord(f[3], f[4]).toLowerCase(), ground = hueWord(f[5], f[6]).toLowerCase();
      name += sky !== ground ? `, ${sky} sky / ${ground} ground` : "";
    }
    const c = (used.get(name) ?? 0) + 1;
    used.set(name, c);
    fam.name = c > 1 ? `${name} ${c}` : name;
  });
}
