# Phase 1: analysis spike report (Gate 1)

Run: `npm run spike` (analysis → `spike/out/results.json` + `spike/out/contact-sheet.html`) and `npm run spike:raw` (RAW in Node). The browser test is at `spike/browser/` and is served by `node spike/serve.mjs` with COOP/COEP headers. Every threshold lives in `src/analysis/config.ts`.

## What was built
All analysis is pure TypeScript over RGBA arrays in `src/analysis/` (no DOM). The same code runs in Node and in a browser Worker.
- `color.ts`: sRGB → linear → OKLab/OKLCH. The per-pixel path uses a lookup table and inline matrices. culori is used for hex output and gamut clamping. Compared with culori, the fast path's max error is **4e-8**.
- `photo.ts`: per-photo analysis.
  - Chromatic palette: chroma-weighted k-means with k=7 in OKLab, then near-duplicates are merged.
  - Neutral share, top and bottom palettes, tone and hue histograms, tone stats.
  - HSL buckets (estimated), grading (estimated) and glow (estimated).
  - An 11-number feature vector for families.
- `group.ts`: set and family summaries with every photo weighted equally. Families come from z-scored k-means, with k chosen by silhouette and a minimum of 3 photos per family. Names come from rules.
- `compare.ts`: finds the nearest family (feature distance plus palette distance), then turns the differences into suggestions with a direction and a band (slight, moderate or strong).

## Results on `reference/` (37 screenshots)
| | |
|---|---|
| Families (v2: hue + brightness only) | k=7 (silhouette 0.34, best tested): **Golden** (8), **Teal** (7), **Olive & bright** (5), **Orange sky / blue ground** (5), **Blue** (4), **Blue & dark** (4), **Golden & dark** (4) |
| Set | 66% of pixels near-neutral. The palette is olive/earth plus slate blues. Glow 49 ("sometimes") |
| Compare | `comparison-photo.jpg` → **Golden** (0.93), with **Olive & bright** a close second (0.98). The UI should show "also close to…" when scores are within about 10%. It produced 17+ suggestions, too many for the UI, so Phase 2 should rank them and show about 6 |
| Glow | Calibrated against a visual check of 18 photos: crisp shots score 0–19 and glowy ones 68–100. Known false positives: a bright snow field (p05 = 91) and smooth sky gradients (p26 = 100, p19 = 80) |
| Grading | Saturation reads low (4–40) because chroma-weighted means of opposite hues cancel out. Each range now has a `wheelHex` (hue at visible chroma) for the wheel dot, as well as the actual subtle tint |

## Performance
| Where | Result |
|---|---|
| Node, analysis | about 70 ms per photo at 256 px. Set summary plus families about 2 s for 37 photos |
| Browser (this Mac, Chrome 156, 8 cores, 4 Workers) | **37 photos in 0.98 s** including decode and downscale. Projected 50 photos ≈ 1.3 s plus families. Longest frame gap 18 ms (UI responsive) |

This machine is faster than a mid-range laptop. The 10–20 s target for 50 photos still has a lot of room.

## RAW sub-spike (libraw-wasm 1.6.0)
| File | Mode | Node | Browser Worker |
|---|---|---|---|
| raw-test.CR3 (10.8 MB) | full 16-bit linear | 1.31 s, peak RSS ≈ 600 MB | 1.28 s |
| | half size | 0.56 s, ≈ 470 MB | 0.48 s |
| raw-test-2.CR3 (10.0 MB) | full | 1.16 s, ≈ 600 MB | 1.08 s |
| | half size | 0.57 s, ≈ 510 MB | 0.45 s |

- **Both files are C-RAW** (Canon `Quality = 7`). **Standard uncompressed CR3 hasn't been tested yet.**
- The output is correct: orientation is applied and camera white balance is used. Metadata gives as-shot white balance (`cam_mul`), white level (`SpecularWhiteLevel` 14888) and black level (2048), which is enough for the clipping and noise-floor estimates.
- Browser memory couldn't be measured (`measureUserAgentSpecificMemory` isn't available). The Node RSS figures are the best guide. Half-size decode is enough for the edit model and saves time and memory.
- **Constraint:** the library uses WebAssembly threads (shared memory), so the page needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. In Phase 3, I'll scope those headers to `/edit`. Any cross-origin images or scripts there would need CORP/CORS headers.
- No fallback to the embedded JPEG is needed.

## Gate 1 feedback applied (v2)
- **Families use hue and brightness only.** The features are mean lightness plus chroma-weighted hue vectors for the whole frame, the top half (sky) and the bottom half (ground). Saturation, neutral share and contrast are no longer used, which removes the unhelpful "Muted" family. The brightness and hue groups get equal weight (`CONFIG.families.groups`).
- **Names:** a hue word (Red, Orange, Golden, Olive, Green, Teal, Blue, Violet, Pink), plus "bright" or "dark" when the family stands out from the set. A family with no single dominant hue is named by its sky and ground hues.
- **Per-photo palette (`photoPalette`):** when at least 30% of the frame is near-neutral, a photo's own palette also shows up to 3 black/grey/white swatches (each covering at least 8% of the pixels). Shares are pixel shares. Set and family palettes stay chromatic only.
- **Charts:** a Lightroom-style RGB histogram (64 bins per channel, smoothed, blended so overlaps read grey, yellow and cyan) and a compact hue chart filled with the hue spectrum. The new histogram data is `rgbHist`.

## Phase 2 feedback applied (analysis v3)
- **Fewer families:** after clustering, families that share the same dominant-hue word are merged (`CONFIG.families.mergeSameHue`). The reference set now has 5 families: Golden (12), Blue & dark (8), Teal (7), Olive & bright (5) and Orange sky / blue ground (5). Lowering the k cap instead made the silhouette score pick only 2 families.

## Caveats
- Some screenshots include the UI's carousel arrows (for example p32, p33). They're small and neutral, so they're excluded from the palettes, but they add a little to the tone stats.
- Silhouette kept rising up to the k=7 cap (37 photos ÷ 5). With 50 photos the cap would be 8.
- Several reference screenshots carry "Unsplash" watermarks, so they're stock photos rather than your own work. They must not go into the public starter set.
