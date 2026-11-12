# Phase 4 review (Gate 4)

Reviewers: a Haiku subagent (mechanical checks) and a fresh-context Opus 5.5 subagent (full review). Fixes by the main session.

## Mechanical checks
lint, typecheck, 35 unit tests, build and 9 browser tests (Edge) all pass. `npm audit --omit=dev`: 0 vulnerabilities. Full audit: 10 moderate, all one `minimatch` ReDoS chain inside eslint tooling (dev only; the fix is a breaking eslint downgrade, not taken).

## Performance (50 real photos, this 8-core Mac)
6.0 s from upload to families; the longest main-thread frame gap was 70 ms. Expect about 12–18 s on a mid-range laptop, inside the brief's 10–20 s target.

## Findings and what was done
| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | high | No way to delete a photo (the 50-photo limit was a dead end; deletion sync never ran) | "Remove" on every photo card and every failed photo |
| 2 | high | Edit guide could not open a second file without a reload | "Open another file" in the header once a file is loaded |
| 3 | high | Safari encodes canvas WebP as PNG: thumbnails could exceed the bucket cap and one failure aborted the whole sync | Explicit JPEG fallback (correct type and extension); migration 0002 allows JPEG; per-photo errors no longer stop the run and are reported |
| 4 | medium | Shared device: user B could receive user A's unsynced data | The device records its owning account and refuses to push into another; "Sign out and remove this device's data" with confirmation |
| 5 | medium | A family emptied by moves kept a stale summary and could still be the closest match | Empty families are dropped; centroids recomputed from final members |
| 6 | medium | Sync pulled back what it had just pushed (one analyses query per photo) | Pull bookmark taken before push, pushed rows skipped, analyses fetched in batches of 50 |
| 7 | medium | Every status write re-rendered every view | One write per analysed photo (in a transaction); live updates coalesced (~120 ms) |
| 8 | medium | RAW render and measurements ran on the main thread (~15 M values) | Moved into the worker; the pixel buffer is transferred, not copied |
| 9 | medium | RAW fit compared scene-linear data against finished photos, biasing exposure and contrast upward | Approximate base tone curve applied for RAW before fitting (documented as approximate; unit-tested) |
| 10 | low | Dropping files during analysis could analyse photos twice | Analysis runs are queued; drops are ignored while busy |
| 11 | low | Compare showed the previous photo's palette while reading a new one | Reset on pick |
| 12 | low | Sky/ground palettes and grading wheels had no hex | Copyable hex codes under each |
| 13 | low | Static Home story said "drag the cloud" with nothing to drag | Static wording for the last step |

## Confirmed sound by the reviewer
Colour math (LUT, OKLab matrices, hue wrap, circular means, chroma-weighted k-means, equal per-photo weighting, glow, compare signs); RLS on every table and action plus storage scoped to the user's folder; PKCE auth with a fixed callback (no open redirect); no secrets tracked; starter and Home images free of EXIF/XMP/ICC; service worker ignores other origins and non-GET; COOP/COEP scoped correctly; focus, reduced motion, keyboard reordering and contrast.

## Needs you
Run `supabase/migrations/0002_thumbs_jpeg.sql` in the Supabase SQL editor (one line: lets Safari's JPEG thumbnails into the bucket).
