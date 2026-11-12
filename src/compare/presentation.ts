/** Turning compare results into what the screen shows. Pure and unit-tested. */
import type { Suggestion, FamilyMatch } from "@/analysis/compare";
import type { Swatch } from "@/analysis/palette";

export const BAND_STEPS: Record<Suggestion["band"], number> = { slight: 1, moderate: 2, strong: 3 };

const HUE_WORDS: [number, string][] = [[30, "red"], [62, "orange"], [95, "gold"], [125, "olive"], [160, "green"], [215, "teal"], [270, "blue"], [310, "violet"], [350, "pink"], [361, "red"]];
export const hueWordOf = (h: number) => HUE_WORDS.find(([l]) => h < l)![1];

/** The action word for a suggestion: never a number. */
export function moveWord(s: Suggestion): string {
  if (s.control === "Temp") return s.sign === "+" ? "Warmer" : "Cooler";
  if (s.control === "Tint") return s.sign === "+" ? "More magenta" : "Greener";
  if (s.group === "Color Grading") { const m = /≈(\d+)°/.exec(s.why); return m ? `Toward ${hueWordOf(+m[1])}` : "Tint toward"; }
  if (s.group === "Effects") return s.sign === "−" ? "Soften" : "Crisp up";
  return s.sign === "+" ? "Raise" : "Lower";
}

/** The ones that matter most: strongest first, at most two from any one Lightroom panel. */
export function topSuggestions(all: Suggestion[], n = 6): Suggestion[] {
  const sorted = [...all].sort((a, b) => BAND_STEPS[b.band] - BAND_STEPS[a.band]);
  const per = new Map<string, number>(), out: Suggestion[] = [];
  for (const s of sorted) {
    const c = per.get(s.group) ?? 0;
    if (c < 2 && out.length < n) { out.push(s); per.set(s.group, c + 1); }
  }
  return out;
}

export type Closeness = "Close" | "Noticeable" | "Far";
export interface ColourPair { mine: Swatch; theirs: Swatch; deltaE: number; word: Closeness }

/** Each of the photo's main colours beside the nearest family colour (ΔE in OKLab × 100). */
export function colourPairs(mine: Swatch[], theirs: Swatch[], n = 6): ColourPair[] {
  if (!theirs.length) return [];
  return mine.slice(0, n).map((m) => {
    let best = theirs[0], bd = Infinity;
    for (const t of theirs) { const d = Math.hypot(m.l - t.l, m.a - t.a, m.b - t.b); if (d < bd) { bd = d; best = t; } }
    const deltaE = Math.round(bd * 100);
    return { mine: m, theirs: best, deltaE, word: deltaE < 4 ? "Close" : deltaE < 10 ? "Noticeable" : "Far" };
  });
}

/** Relative closeness bars (best match = 100%) and whether the runner-up is nearly as good. */
export function matchBars(matches: FamilyMatch[]) {
  const best = matches[0]?.score ?? 1;
  return { bars: matches.map((m) => ({ ...m, width: Math.max(6, Math.round((best / m.score) * 100)) })), alsoClose: matches.length > 1 && matches[1].score / best < 1.15 };
}
