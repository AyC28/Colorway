/** Make a ≤ 400 px WebP (JPEG where the browser cannot encode WebP). Drawing through a canvas drops all metadata (EXIF, GPS). Browser-only. */
export async function makeThumb(file: Blob, longEdge = 400): Promise<{ thumb: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(1, longEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas in this browser");
  ctx.drawImage(bmp, 0, 0, w, h);
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  let thumb = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
  // Safari cannot encode WebP from a canvas and silently returns PNG: use an explicit JPEG instead
  if (thumb.type !== "image/webp") thumb = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
  return { thumb, ...out };
}
