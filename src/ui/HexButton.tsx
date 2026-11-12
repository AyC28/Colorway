"use client";
import { useRef, useState } from "react";

/** One-tap copy of a hex code. Announces the copy for screen readers. */
export function HexButton({ hex }: { hex: string }) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      type="button"
      className="hex"
      aria-label={`Copy ${hex}`}
      data-state={copied ? "copied" : undefined}
      onClick={async () => {
        try { await navigator.clipboard.writeText(hex); } catch { /* clipboard blocked: the code is still visible */ }
        setCopied(true);
        if (t.current) clearTimeout(t.current);
        t.current = setTimeout(() => setCopied(false), 1400);
      }}
    >
      {hex}
      <span className="vh" role="status">{copied ? `${hex} copied` : ""}</span>
    </button>
  );
}
