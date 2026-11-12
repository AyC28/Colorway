# Colorway: Phase 0 plan

Status: proposal for Gate 0. Nothing here is app code. Versions checked against the npm registry on 2026-11-11, and Next.js docs checked through Context7 (`/vercel/next.js/v16.4.5`).

## 1. Stack (exact pins)

| Concern | Package | Pin | Note |
|---|---|---|---|
| Framework | `next` (App Router) | **16.4.5** | 16.4.6 came out today. 16.4.5 matches the Context7 docs snapshot. Can move up after the spike. |
| UI runtime | `react`, `react-dom` | 19.3.1 | Next 16.4.5 needs `^19.0.0` as a peer. |
| Language | `typescript` | **6.0.3** | Decided. 7.0.2 is `latest` (the native Go port), but Next's type plugin and many tools still rely on the classic JS compiler API. |
| Color math | `culori` | 4.0.2 | OKLab/OKLCH, sRGB↔linear. |
| EXIF / embedded preview | `exifr` | 7.1.3 | Last released 2022. Stable, but no new fixes are coming. |
| Local store | `dexie` | 4.4.7 | IndexedDB working copy. |
| Auth + sync | `@supabase/supabase-js` / `@supabase/ssr` | 2.119.0 / 0.12.7 | Email and Google OAuth. RLS on every table. |
| 3D hero | `three` | 0.187.0 | Loaded only through dynamic `import()` on `/`. |
| RAW decode | `libraw-wasm` | 1.6.0 | ISC license, runs in a Worker. **CR3 and C-RAW support is not verified yet.** The Phase 1 sub-spike tests it. Fallback is the exifr embedded JPEG (I'll ask you first). |
| Worker RPC | `comlink` | 4.4.2 | Small, typed `postMessage` wrapper. Optional. |
| Unit tests | `vitest` | 5.1.0 | Runs the pure analysis functions in Node. |
| E2E / screenshots | `@playwright/test` | 1.65.0 | Smoke tests and mockup PNGs. |
| Agent browser | `@playwright/mcp` | **0.0.85** | Decided: pinned in `.mcp.json` per rule 8 (the brief said `@latest`). |
| Hosting | Vercel | — | Only after Gate 5. |

Node 22.15.0, npm 10.9.2 and git 2.50 are installed locally. Next needs Node ≥ 20.9.

**Workers:** the plan is `new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })`. Context7 didn't return a direct App Router example for this pattern (the Next `<Script strategy="worker">` feature is something else and doesn't work in App Router). I'll prove the pattern in the Phase 1 spike before building on it.

**Icons and type:** provisional only. The brief asks for research first, so the real proposal comes at the start of Phase 2, with reasons.
- Icons: leaning **Phosphor** (`@phosphor-icons/react` 2.1.10) over Lucide. It has several weights (thin/light suit calm, dense panels) and more photo-specific glyphs (aperture, histogram, eyedropper). Custom SVGs for the Grid chrome so nothing looks like Instagram.
- Type: a neutral grotesk for the UI, a characterful display face for the Home story, and a monospace with tabular figures for hex codes. All self-hosted through `next/font/local`.

## 2. Folder layout

```
colorway/
  app/                       # Next App Router (Phase 3)
    (site)/page.tsx          # /  Home scroll story
    inspiration/ compare/ edit/ grid/ login/ account/
  src/
    analysis/                # PURE TS over RGBA, no DOM. Runs in a Worker and in Node.
      color.ts               # sRGB→linear→OKLab/OKLCH helpers
      palette.ts             # chroma-weighted k-means, merge, order
      histograms.ts          # tone + hue (chroma-weighted)
      grading.ts             # shadows/mid/highlights estimate
      glow.ts                # halo spill score + tint
      features.ts            # per-photo feature vector
      families.ts            # standardize, k-means, silhouette, min-size merge, naming
      compare.ts             # nearest family, deltas → direction + band
      editModel.ts           # RAW parametric search (Phase 3, last)
    workers/                 # analysis.worker.ts, raw.worker.ts
    db/                      # Dexie schema + sync engine
    supabase/                # client, typed queries
    ui/                      # components, tokens
  public/starter/            # starter set (1600px WebP, EXIF/GPS stripped)
  public/fonts/              # self-hosted fonts
  supabase/migrations/       # SQL + RLS policies
  spike/                     # Phase 1 scripts + contact sheet (out/ gitignored)
  mockups/                   # Phase 2 static HTML + PNGs
  reference/                 # your test photos (37 reference screenshots, 2× R6 CR3, comparison-photo.jpg). Gitignored, never committed.
  tests/{unit,e2e}/
  docs/
```

Phase 0 created only `docs/`, `spike/` and `mockups/`, plus `.gitignore` and `.mcp.json`. Test photos live in `reference/` (the earlier `test-photos/` folder was removed).

## 3. Data model

### Local (Dexie, working copy)
| Table | Key | Fields |
|---|---|---|
| `photos` | `id` (uuid) | `setId`, `name`, `kind` (`jpeg`/`png`/`raw`), `width`, `height`, `originalBlob` (**local only**), `thumbBlob` (≤400px WebP, no EXIF), `addedAt`, `familyId`, `familyOverride` (bool), `status` |
| `analyses` | `photoId` | `version` (algorithm version), `features` (vector), `palette`, `topPalette`, `bottomPalette`, `toneHist`, `hueHist`, `grading`, `glow`, `neutralShare` |
| `sets` | `id` | `name`, `createdAt`, `isStarter` |
| `families` | `id` | `setId`, `name`, `autoName`, `renamed` (bool), `centroid`, `summary` (same panels as the set summary) |
| `gridLayouts` | `id` | `name`, `order` (photoIds), `device`, `theme` |
| `syncState` | table+id | `dirty`, `updatedAt`, `remoteUpdatedAt`, `deleted` |

### Remote (Supabase Postgres, derived data only)
Each table has `user_id uuid references auth.users`, `updated_at`, and a soft-delete `deleted_at`. RLS: `user_id = auth.uid()` for select, insert, update and delete.
- `sets`, `photos` (metadata only, no original), `analyses` (jsonb), `families`, `photo_family_overrides`, `grid_layouts`.
- Storage bucket `thumbs/{user_id}/{photo_id}.webp`, private, with a storage RLS policy on the path prefix. Thumbnails are re-encoded through canvas, which drops all EXIF and GPS.
- Sync: last-write-wins on `updated_at` per row. Push dirty rows, then pull rows where `updated_at > lastPulledAt`. Each analysis row carries the algorithm `version`, so changing thresholds triggers a local recompute.

## 4. Test data (`reference/`)
- **Inspiration set:** 37 PNG screenshots (about 2504×1780, sunsets, fog, overcast valleys and so on). They're screen captures, so some include UI overlays (carousel arrows, possibly borders). The spike will trim a small edge margin and report any frames where the crop doesn't remove them.
- **Compare:** `comparison-photo.jpg` (5472×3648).
- **RAW:** `raw-test.CR3` (portrait) and `raw-test-2.CR3`, both Canon EOS R6. Whether either one is C-RAW will be read from the file during the spike. If neither is, a C-RAW sample is still needed for that test.
- **Starter set:** the brief says the starter set comes from your own photos. If these screenshots are other photographers' work, they shouldn't be shipped publicly. Decide in Phase 3.

## 5. Design skills (Phase 2, ask first)
Hallmark is now installed. The plan is Hallmark to build the mockups from the brief and Impeccable for the audit and polish. I'll ask before invoking either.
