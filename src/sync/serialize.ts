/** PhotoAnalysis ↔ JSON for sync. Typed-array colour samples travel as base64. */
import type { PhotoAnalysis } from "@/analysis/photo";

const b64 = (a: Float32Array) => {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const f32 = (s: string) => {
  const bin = atob(s), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
};

type Sample = PhotoAnalysis["sample"]["all"];
const enc = (s: Sample) => ({ lab: b64(s.lab), w: b64(s.w) });
const dec = (s: { lab: string; w: string }): Sample => ({ lab: f32(s.lab), w: f32(s.w) });

export function analysisToJson(a: PhotoAnalysis) {
  return { ...a, sample: { all: enc(a.sample.all), top: enc(a.sample.top), bottom: enc(a.sample.bottom) } };
}
export function analysisFromJson(j: ReturnType<typeof analysisToJson>): PhotoAnalysis {
  return { ...j, sample: { all: dec(j.sample.all), top: dec(j.sample.top), bottom: dec(j.sample.bottom) } } as PhotoAnalysis;
}
