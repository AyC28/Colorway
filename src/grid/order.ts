/** Grid ordering and colour-flow measures. Pure and unit-tested. */
import type { PhotoAnalysis } from "@/analysis/photo";

type V = [number, number, number];
const vec = (a: PhotoAnalysis): V => [a.tone.meanL, a.tone.meanA * 3, a.tone.meanB * 3];
const dist = (p: V, q: V) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Greedy nearest-neighbour walk over each photo's mean colour, starting from the brightest. */
export function smoothFlow(ids: string[], an: Map<string, PhotoAnalysis>): string[] {
  const left = ids.filter((id) => an.has(id));
  if (left.length < 2) return left;
  const v = new Map(left.map((id) => [id, vec(an.get(id)!)]));
  let cur = left.reduce((b, id) => (v.get(id)![0] > v.get(b)![0] ? id : b), left[0]);
  const out = [cur];
  const rest = new Set(left); rest.delete(cur);
  while (rest.size) {
    let best = "", bd = Infinity;
    for (const id of rest) { const d = dist(v.get(id)!, v.get(cur)!); if (d < bd) { bd = d; best = id; } }
    out.push(best); rest.delete(best); cur = best;
  }
  return out;
}

/** Family by family, largest family first, keeping each family's photos in the order given. */
export function byFamily(ids: string[], members: Record<string, string[]>): string[] {
  const fams = Object.values(members).sort((a, b) => b.length - a.length);
  const seen = new Set<string>(), out: string[] = [];
  for (const m of fams) for (const id of ids) if (m.includes(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  for (const id of ids) if (!seen.has(id)) out.push(id);
  return out;
}

/** Biggest colour jumps between left-right neighbours in a 3-wide grid (ΔE × 100). */
export function biggestJumps(order: string[], an: Map<string, PhotoAnalysis>, n = 3, cols = 3) {
  const out: { index: number; a: string; b: string; deltaE: number }[] = [];
  for (let i = 0; i + 1 < order.length; i++) {
    if (i % cols === cols - 1) continue;
    const a = an.get(order[i]), b = an.get(order[i + 1]);
    if (!a || !b) continue;
    out.push({ index: i, a: order[i], b: order[i + 1], deltaE: Math.round(dist(vec(a), vec(b)) * 100) });
  }
  return out.sort((x, y) => y.deltaE - x.deltaE).slice(0, n);
}

/** Move one id to a new position. */
export function moveTo(order: string[], id: string, to: number): string[] {
  const out = order.filter((x) => x !== id);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, id);
  return out;
}
