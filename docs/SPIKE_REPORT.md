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
| Families | k=3 (silhouette 0.27, with k=2 at 0.26, so the clustering is weak): **Muted** (23), **Vivid & cool** (8: blue, night, snow), **Warm & vivid** (6: golden hour) |
| Set | 66% of pixels near-neutral. The palette is olive/earth plus slate blues. Glow 49 ("sometimes") |
| Compare | `comparison-photo.jpg` → **Muted** (score 1.17 vs 2.13 and 2.63). It produced 17 suggestions, too many for the UI, so Phase 2 should rank them and show about 6 |
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

## Caveats
- Some screenshots include the UI's carousel arrows (for example p32, p33). They're small and neutral, so they're excluded from the palettes, but they add a little to the tone stats.
- Family names compare each family with the set (for example, "Muted" means more muted than the rest of your photos). Absolute words like "mid-dark" didn't separate this moody set.
