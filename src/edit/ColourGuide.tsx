/** Visual colour guidance: your colour vs the family's, on hue/saturation/luminance tracks and grading wheels. */
import type { CSSProperties } from "react";
import { oklchToHex } from "@/analysis/color";
import type { HslStat, GradingRange } from "@/analysis/photo";
import { HexButton } from "@/ui/HexButton";
import { Wheel, Estimated, hueName } from "@/ui/viz";

const clamp = (v: number) => Math.min(100, Math.max(0, v));
function Track({ label, stops, you, fam, text }: { label: string; stops: string[]; you: number; fam: number; text: string }) {
  const a = clamp(you), b = clamp(fam);
  const style = Object.fromEntries(stops.map((h, i) => [`--g${i + 1}`, h])) as CSSProperties;
  return (
    <div className="trk">
      <span className="trk-l">{label}</span>
      <span className="trk-bar" style={style} role="img" aria-label={`${label}: ${text}`}>
        <span className="trk-span" style={{ "--a": `${Math.min(a, b)}%`, "--b": `${Math.max(a, b)}%` } as CSSProperties} />
        <span className="mk mk-you" style={{ "--x": `${a}%` } as CSSProperties} />
        <span className="mk mk-fam" style={{ "--x": `${b}%` } as CSSProperties} />
      </span>
      <span className="trk-v">{text}</span>
    </div>
  );
}

export function HslGuide({ mine, theirs, famName }: { mine: HslStat[]; theirs: HslStat[]; famName: string }) {
  const rows = mine.map((m, i) => ({ m, t: theirs[i] })).filter(({ m, t }) => m.share > 0.05 && t.share > 0.01 && Number.isFinite(m.hue) && Number.isFinite(t.hue));
  if (!rows.length) return <p className="note">No colour in this photo is strong enough to compare by HSL.</p>;
  return (
    <ol className="hsl-list">
      {rows.map(({ m, t }) => {
        let dh = t.hue - m.hue; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
        const you = oklchToHex(m.l, m.c, m.hue), fam = oklchToHex(t.l, t.c, t.hue);
        return (
          <li key={m.name} className="hsl-row">
            <div className="hsl-name"><b>{m.name}</b><span className="sub">{m.share > 0.5 ? "most of your colour" : "in your photo"}</span></div>
            <div className="hsl-chips">
              <span className="sw-pair"><span className="chip-lg" style={{ "--sw": you } as CSSProperties} /><span className="sub">Yours</span><HexButton hex={you} /></span>
              <span className="sw-pair"><span className="chip-lg" style={{ "--sw": fam } as CSSProperties} /><span className="sub" title={famName}>{famName}</span><HexButton hex={fam} /></span>
            </div>
            <div className="hsl-trks">
              <Track label="Hue" stops={[-40, -20, 0, 20, 40].map((d) => oklchToHex(0.7, 0.12, m.hue + d))} you={50} fam={50 + (dh / 40) * 50} text={`${Math.round(m.hue)}° to ${Math.round(t.hue)}°`} />
              <Track label="Saturation" stops={[0, 0.08, 0.16].map((c) => oklchToHex(m.l, c, m.hue))} you={(m.c / 0.16) * 100} fam={(t.c / 0.16) * 100} text={`${Math.round((m.c / 0.16) * 100)} to ${Math.round((t.c / 0.16) * 100)}`} />
              <Track label="Luminance" stops={[0.2, 0.55, 0.9].map((l) => oklchToHex(l, m.c, m.hue))} you={((m.l - 0.2) / 0.7) * 100} fam={((t.l - 0.2) / 0.7) * 100} text={`${Math.round(m.l * 100)} to ${Math.round(t.l * 100)}`} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function GradingGuide({ mine, theirs, famName }: { mine: GradingRange[]; theirs: GradingRange[]; famName: string }) {
  return (<>
    <div className="wheels2">
      {mine.map((g, i) => {
        const t = theirs[i];
        return (
          <figure key={g.range}>
            <Wheel g={g} target={t} size={112} />
            <figcaption><b>{g.range}</b><span className="sub">{hueName(g.hue)} to {hueName(t.hue)}, {t.sat > g.sat + 5 ? "stronger" : t.sat < g.sat - 5 ? "softer" : "same strength"}</span></figcaption>
          </figure>
        );
      })}
    </div>
    <p className="legend-key"><span className="key-you" />Your photo <span className="key-fam" />{famName}</p>
    <Estimated />
  </>);
}
