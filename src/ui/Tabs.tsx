"use client";
/** Accessible tabs: arrow keys move between tabs; only the open panel is mounted (so 3D loads on demand). */
import { useId, useRef, useState, type ReactNode } from "react";

export function Tabs({ tabs, label }: { tabs: { id: string; label: string; panel: () => ReactNode }[]; label: string }) {
  const [open, setOpen] = useState(tabs[0]?.id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (i: number) => { const t = tabs[(i + tabs.length) % tabs.length]; setOpen(t.id); refs.current[(i + tabs.length) % tabs.length]?.focus(); };
  const current = tabs.find((t) => t.id === open) ?? tabs[0];
  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tablist">
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${base}-${t.id}`} aria-selected={t.id === current.id} aria-controls={`${base}-p-${t.id}`} tabIndex={t.id === current.id ? 0 : -1} className="tab"
            onClick={() => setOpen(t.id)}
            onKeyDown={(e) => { if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); }}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-p-${current.id}`} aria-labelledby={`${base}-${current.id}`} className="tabpanel">{current.panel()}</div>
    </div>
  );
}
