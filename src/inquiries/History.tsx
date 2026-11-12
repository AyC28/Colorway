"use client";
/** "Previous photos" for Compare and the Edit guide: reopen or delete a saved inquiry. */
import type { InquiryRow } from "@/db/db";
import { deleteInquiry, inquiryThumb } from "./store";

export function History({ rows, current, onOpen, label }: { rows: InquiryRow[]; current: string | null; onOpen: (id: string) => void; label: string }) {
  if (!rows.length) return null;
  return (
    <section className="history" aria-labelledby="hist-h">
      <div className="sec-head"><h2 id="hist-h">{label}</h2><p className="note">Saved on this device.</p></div>
      <ul className="hist-list">
        {rows.map((r) => (
          <li key={r.id} className={r.id === current ? "is-current" : undefined}>
            <button type="button" className="hist-open" onClick={() => onOpen(r.id)} aria-current={r.id === current ? "true" : undefined} aria-label={`Open ${r.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inquiryThumb(r)} alt="" />
              <span className="hist-name">{r.name}</span>
              <span className="sub">{new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
            </button>
            <button type="button" className="link-btn" onClick={() => void deleteInquiry(r.id)} aria-label={`Delete ${r.name}`}>Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
