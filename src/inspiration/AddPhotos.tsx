"use client";
import { useRef } from "react";

/** The one way photos come in: a real file input behind a button (keyboard and screen-reader friendly). */
export function AddPhotos({ onFiles, disabled, label = "Add photos", className = "btn btn-primary" }: { onFiles: (f: File[]) => void; disabled?: boolean; label?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => input.current?.click()}>{label}</button>
      <input ref={input} className="vh" type="file" accept="image/jpeg,image/png,image/webp" multiple tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) onFiles(f); }} />
    </>
  );
}
