/**
 * A small slider drawing for one suggested move: the track shows what the control
 * does (e.g. blue → yellow for Temp, the hue spectrum for an HSL hue), and a bar
 * from the centre shows the direction and how strong the move is. No numbers.
 */
import type { CSSProperties } from "react";
import { oklchToHex } from "@/analysis/color";
import type { Suggestion } from "@/analysis/compare";
import { HSL_BUCKETS } from "@/analysis/config";

const BAND_LEN: Record<Suggestion["band"], number> = { slight: 0.28, moderate: 0.58, strong: 0.92 };
const grey = (l: number) => oklchToHex(l, 0, 0);

/** Track colours for a control, left (−) to right (+). */
export function trackFor(s: Suggestion): string[] {
  const c = s.control;
  if (c === "Temp") return [oklchToHex(0.62, 0.13, 255), grey(0.8), oklchToHex(0.82, 0.14, 90)];
  if (c === "Tint") return [oklchToHex(0.66, 0.15, 145), grey(0.8), oklchToHex(0.64, 0.17, 340)];
  if (["Exposure", "Whites", "Highlights", "Shadows", "Blacks"].includes(c)) return [grey(0.25), grey(0.6), grey(0.95)];
  if (c === "Contrast") return [grey(0.6), grey(0.6), grey(0.6)].map((x, i) => (i === 0 ? grey(0.55) : i === 2 ? grey(0.7) : x));
  if (c === "Vibrance" || c === "Saturation") return [grey(0.65), oklchToHex(0.65, 0.08, 40), oklchToHex(0.65, 0.17, 40)];
  const hsl = HSL_BUCKETS.find((b) => c.startsWith(b.name));
  if (hsl) {
    const mid = hsl.from < hsl.to ? (hsl.from + hsl.to) / 2 : ((hsl.from + hsl.to + 360) / 2) % 360;
    if (c.endsWith("Hue")) return [-35, 0, 35].map((d) => oklchToHex(0.7, 0.13, mid + d));
    if (c.endsWith("Saturation")) return [oklchToHex(0.68, 0, mid), oklchToHex(0.68, 0.07, mid), oklchToHex(0.68, 0.15, mid)];
    return [oklchToHex(0.35, 0.1, mid), oklchToHex(0.6, 0.12, mid), oklchToHex(0.88, 0.06, mid)];
  }
  if (s.group === "Color Grading") {
    const m = /≈(\d+)°/.exec(s.why); const h = m ? +m[1] : 60;
    return [grey(0.75), oklchToHex(0.72, 0.06, h), oklchToHex(0.72, 0.13, h)];
  }
  return [grey(0.7), grey(0.5), grey(0.3)]; // Clarity / Dehaze: crisp ↔ soft
}

export function MoveGlyph({ s }: { s: Suggestion }) {
  // colour grading pushes away from neutral in one direction; everything else is ± around the centre
  const oneSided = s.group === "Color Grading";
  const len = BAND_LEN[s.band] * (oneSided ? 100 : 50);
  const right = oneSided || s.sign === "+";
  const start = oneSided ? 0 : right ? 50 : 50 - len;
  const t = trackFor(s);
  return (
    <span className="glyph" aria-hidden="true" style={{ "--t1": t[0], "--t2": t[1], "--t3": t[2] } as CSSProperties}>
      {!oneSided && <span className="glyph-mid" />}
      <span className={`glyph-bar ${right ? "to-r" : "to-l"}`} style={{ "--a": `${start}%`, "--w": `${len}%` } as CSSProperties} />
    </span>
  );
}
