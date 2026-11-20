/**
 * Every tunable threshold in one place. Bump ANALYSIS_VERSION whenever a value
 * changes so stored analyses get recomputed.
 */
export const ANALYSIS_VERSION = 4;
/** Bump when how photos are GROUPED changes (no re-analysis needed). 2 = colour styles. */
export const GROUPING_VERSION = 2;

export const CONFIG = {
  /** Long edge for analysis downscale (caller does the resize). */
  analysisLongEdge: 256,
  /** OKLCH chroma above which a pixel counts as chromatic. */
  chromaThreshold: 0.04,
  /** Palette k-means. */
  paletteK: 7,
  /** Merge palette centroids closer than this in OKLab (ΔEok). */
  paletteMergeDist: 0.06,
  /** Drop palette entries below this share after merging. */
  paletteMinShare: 0.03,
  /** Chromatic pixels kept per photo for set/family pooling. */
  samplePerPhoto: 2500,
  toneBins: 64,
  rgbBins: 64,
  /** per-photo palette shows neutral tones once near-neutral pixels cover this share of the frame */
  neutralPaletteMin: 0.3,
  /** min pixel share for a single neutral swatch */
  neutralSwatchMin: 0.08,
  /** neutral tones closer than this (OKLab) merge, so we get ~black / grey / white rather than near-duplicates */
  neutralMergeDist: 0.12,
  hueBins: 36,
  /** Soft tonal ranges in OKLab L for grading: shadows fade out over [s0,s1], highlights fade in over [h0,h1]. */
  grading: { s0: 0.3, s1: 0.5, h0: 0.65, h1: 0.85, satFull: 0.1, repL: [0.35, 0.6, 0.85] },
  glow: {
    /** bright region = Y ≥ max(minY, quantile(Y, q)) */
    minY: 0.5,
    q: 0.98,
    /** need at least this share of pixels in the bright mask */
    minMaskShare: 0.001,
    /** distance bands (px at 256-px analysis size) outside the bright edge */
    near: [2, 3] as [number, number],
    far: [11, 16] as [number, number],
    /** spill → score: first value maps to 0, second to 100 */
    spillRange: [0.2, 0.7] as [number, number],
    labels: [
      [25, "rarely"],
      [55, "sometimes"],
      [101, "often"],
    ] as [number, string][],
  },
  families: {
    maxK: 8, minPerK: 5, minClusterSize: 3, restarts: 12,
    /** merge clusters that share a dominant-hue word (Gate 1/2 feedback: fewer, broader families) */
    /** with 15+ photos, consider at least this many families (silhouette alone favours 2 on mixed sets) */
    minFamiliesLarge: 3,
    mergeSameHue: true,
    /** only merge when the two families' dominant hues are within this many degrees */
    mergeMaxHueDiff: 30,
    /**
     * Feature groups (indices into FEATURE_NAMES). Each group is scaled by one
     * pooled SD, then by its weight. Hue has 3 two-d vectors (6 dims) vs 1
     * brightness dim, so weight ≈ 1/√6 gives the two groups equal say.
     */
    groups: [
      { name: "brightness", dims: [0], weight: 1 },
      { name: "hue", dims: [1, 2, 3, 4, 5, 6], weight: 0.41 },
    ],
  },
  compare: {
    /** weight of palette distance relative to standardized feature distance */
    paletteWeight: 0.5,
  },
} as const;

/**
 * Lightroom's eight HSL colours, mapped to OKLCH hue ranges (degrees).
 * Approximate: Lightroom's own hue boundaries are not published.
 */
export const HSL_BUCKETS = [
  { name: "Red", from: 349, to: 42 },
  { name: "Orange", from: 42, to: 82 },
  { name: "Yellow", from: 82, to: 126 },
  { name: "Green", from: 126, to: 168 },
  { name: "Aqua", from: 168, to: 230 },
  { name: "Blue", from: 230, to: 277 },
  { name: "Purple", from: 277, to: 309 },
  { name: "Magenta", from: 309, to: 349 },
] as const;

export function hslBucket(h: number): number {
  for (let i = 0; i < HSL_BUCKETS.length; i++) {
    const { from, to } = HSL_BUCKETS[i];
    if (from < to ? h >= from && h < to : h >= from || h < to) return i;
  }
  return 0;
}
