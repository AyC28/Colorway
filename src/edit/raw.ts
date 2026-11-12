/**
 * RAW decoding in the browser with the pinned libraw-wasm build served from
 * /vendor/libraw (it runs its own Web Worker and needs cross-origin isolation).
 */
export interface RawResult {
  width: number; height: number;
  /** linear 16-bit RGB, camera white balance, sRGB primaries, half-size */
  px: Uint16Array;
  camera: string; iso: number; shutter: number; aperture: number;
  craw: boolean;
  asShot: { rOverG: number; bOverG: number } | null;
  decodeMs: number;
}

export const RAW_EXT = /\.(cr3|cr2|nef|arw|dng|raf|orf|rw2|pef|srw)$/i;

export async function decodeRaw(file: File): Promise<RawResult> {
  if (!crossOriginIsolated) throw new Error("This page needs a full reload to decode RAW files. Reload and try again.");
  const url = "/vendor/libraw/index.js";
  const { default: LibRaw } = await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ url);
  const raw = new LibRaw();
  const t0 = performance.now();
  try {
    await raw.open(new Uint8Array(await file.arrayBuffer()), { outputBps: 16, gamm: [1, 1], noAutoBright: true, useCameraWb: true, outputColor: 1, userQual: 0, halfSize: true });
    const m = await raw.metadata(true);
    const img = await raw.imageData();
    const mul = m?.color_data?.cam_mul;
    return {
      width: img.width, height: img.height, px: img.data as Uint16Array,
      camera: `${m.camera_make ?? ""} ${m.camera_model ?? ""}`.trim() || "Unknown camera",
      iso: m.iso_speed, shutter: m.shutter, aperture: m.aperture,
      craw: m?.canon?.Quality === 7,
      asShot: mul && mul[1] ? { rOverG: mul[0] / mul[1], bOverG: mul[2] / mul[1] } : null,
      decodeMs: performance.now() - t0,
    };
  } finally {
    raw.dispose();
  }
}
