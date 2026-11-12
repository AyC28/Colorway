# Phase 3 notes (carried over from Gate 2 feedback)

## Home: scroll-driven story (must build in Phase 3)
The Gate 2 Home mockup shows only the static fallback. You asked for this sequence:
1. **One sample photo** shown whole.
2. **On scroll, its pixels come apart** and rearrange: each pixel flies from its place in the photo to its place in colour space.
3. **They settle into the 3D graph** (OKLab: lightness up, hue around, chroma out). The animation is driven by scroll position (scrubbed, not timed).
4. **At the end the visitor can rotate the graph** freely (drag or touch) and inspect it.
5. **Then a summary section** that explains in plain words what the analysis does (palette, families, compare, edit guide, grid).

Constraints from the brief: three.js lazy-loaded on `/` only. A static image fallback for `prefers-reduced-motion`, mobile and low-power devices (the Gate 2 hero image is that fallback). The 3D has to explain the product, not decorate it.

## Edit guide
- The colour section is visual (Gate 2 feedback): your colour beside the family colour, HSL tracks with a "yours" ring and a "family" dot, and grading wheels with the move drawn on them. Keep that pattern.
- `src/analysis/editModel.ts` is a first version: add unit tests, check the range tolerance, and test with an uncompressed (non-C-RAW) CR3 when one is available.

## Grid
- Phone only (iPad dropped at Gate 2). Phone frame 402 × 874 pt; confirm against the user's phone.

## Starter set
- Several reference photos carry Unsplash watermarks. Use only the user's own photos for the public starter set.
