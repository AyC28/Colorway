# Colorway: project brief

*Colorway reads the color in the photos you love and helps you edit toward a look that's unmistakably yours.*

A color style studio for photographers. The project name is **Colorway** (decided; use it for the repo, package name, page titles and copy). The tagline above is a starting point for the Home hero and may be refined in design.

Read this whole file before doing anything. Then do **Phase 0 only** and stop at Gate 0.

---

## 0. Rules of engagement (these override your defaults)

1. **Phases and gates.** Work one phase at a time. At each Gate, stop, summarize in 10 lines or fewer, and wait for my explicit approval. Never start the next phase on your own.
2. **Ask before burning tokens.** Before any large or costly action (spawning subagents, generating many screens or images, whole-repo reads or reviews, big installs, long research), tell me what, why, and the rough size, then wait for a yes. Small reads, edits and commands inside an approved phase don't need asking.
3. **Skills.** At the start, list the skills, plugins and MCP servers you can see. Before invoking any skill (Hallmark, Impeccable, frontend-design, anything else), name it, name the command, say why, and wait for approval. Suggested split if I approve: Hallmark to build from the brief, Impeccable for audit and polish.
4. **No LLM in the product.** All analysis is deterministic code running in the user's browser (Web Workers). No LLM calls and no third-party analysis APIs from the app. The only network calls the app makes go to its own backend (Supabase auth and sync). Self-host fonts.
5. **Models.** Main session: Opus 5.5 through Phase 2; tell me when it's time for me to switch to Sonnet 5.5 for Phase 3. Subagents: Sonnet 5.5 for page building and research, Haiku 5.5 for mechanical work (lint, typecheck, tests, build, grep, file hunting), Opus 5.5 in a fresh context for the final review. Fable 5.2 only if a task is too hard for the others: ask me first and say why.
6. **Subagents.** Before spawning, list each one (task, model, expected size) and get approval. Parallel page builders use separate git worktrees or branches.
7. **Reporting.** Be brief. Report outcomes and decisions I need to make, not play-by-play. If something contradicts this brief, flag it instead of silently deviating.
8. **Library facts.** Verify versions and APIs with Context7 instead of memory. Pin versions.
9. **Honest UI copy.** Never claim exact Lightroom slider values. Anything inferred is labelled "estimated".
10. **Git.** `git init` in Phase 0, commit at each gate. Never push or deploy anywhere without asking.

---

## 1. Product

A website built for photographers by a photographer. It helps photographers discover and refine their own color-editing style and palette. It is **informative more than interactive** (not a Lightroom clone). Four sections, each on its own URL:

| Route | Section |
|---|---|
| `/` | Home: explains how the tool works (infographic, engaging, interactive 3D) |
| `/inspiration` | 1. Build your reference look from up to 50 photos |
| `/compare` | 2. Compare one JPEG/PNG photo to the closest color family, with suggested slider changes |
| `/edit` | 3. Edit guide: upload a RAW (CR3) or JPEG and get more specific slider guidance |
| `/grid` | 4. Preview your profile grid, Instagram-style |
| `/login`, `/account` | Sign-in and saved work |

Reference photos are uploaded by the user (first-step inspiration). A **starter set** is also provided so a new visitor can try the tool without uploading anything.

---

## 2. Locked decisions

- Everything analytical runs on-device, no outsourced analysis. The app is online with accounts and cross-device sync.
- Accounts: email and Google sign-in via Supabase. **Local-first:** IndexedDB (Dexie) is the working copy, Supabase syncs it. Sync only derived data (palettes, histograms, families, overrides, grid layouts) plus small thumbnails (max 400px, WebP, EXIF stripped). **Originals never leave the device.** Say so in the site copy. Row-level security on every table.
- Offline use is a nice-to-have (PWA service worker), not a launch blocker.
- RAW: support both RAW and JPEG/PNG. Test camera is a **Canon R6** (CR3, including the compressed C-RAW option). Decode in a Web Worker with a LibRaw WASM build; pin the version (no regular updates needed). Show a banner on mobile devices suggesting JPG/PNG. Desktop is the primary context for RAW.
- Section order is fixed (above). The JPEG compare flow must work completely without the RAW section.
- Family assignment is automatic, with user override (move a photo, rename a family).
- Proposed stack (confirm at Gate 0): Next.js App Router + TypeScript, culori for color math, exifr for EXIF, Dexie, Supabase, three.js (lazy-loaded) for the homepage, Playwright for screenshots and smoke tests. Vercel for hosting.
- Fonts: self-hosted. Icons: pick one library (or custom) and justify it. Neutral Lightroom-like structure is a reference, not a copy.

---

## 3. Section specs

### 3.1 Inspiration (`/inspiration`)

Upload up to 50 photos. Show progress; analysis never blocks the UI. Downscale to about 256px on the long edge for analysis. Weight each photo equally in set-level results so one photo can't dominate.

**Color math.** sRGB to linear to OKLab/OKLCH (culori). Use OKLCH **chroma** (not HSL saturation) to decide what counts as colorful.

**Outputs, each with a hex code:**
1. **General style summary.** Palette of chromatic colors only. Mark a pixel chromatic if chroma exceeds a threshold (start around 0.04, tune in the spike). Averaging collapses to grey, so use k-means (k about 5 to 8) in OKLab on chromatic pixels weighted by chroma, merge near-duplicates, and order by weighted share. Also show a separate **neutral share** stat ("62% of pixels are near-neutral").
2. **Top half and bottom half palettes** (sky and ground), same method on each half.
3. **Distribution views:** (a) tone histogram (exposure distribution), (b) hue distribution weighted by chroma.
4. **Color grading estimate** mapped roughly to Lightroom's wheels: shadows, midtones, highlights. Split by lightness with soft weights; per range compute chroma-weighted mean a/b, then hue (degrees), saturation proxy, and hex. Label "estimated".
5. **Glow score.** Glow means soft glow around highlights. Heuristic: measure how much luminance spills past bright-region edges compared with a hard-edge baseline; the hex is the tint of that halo. Output a 0-100 score plus a plain-language label (e.g. "rarely / sometimes / often"). Label "estimated" and validate in the spike.

**Color families** (same section). Cluster photos by situation (sunset vs night vs overcast, etc.). Features per photo: mean lightness, warmth (a/b), chroma-weighted top and bottom palettes, contrast (p95 minus p5 of lightness), neutral share. Standardize, k-means with k chosen by silhouette (2 up to min(8, n/5)), minimum cluster size 3 (merge smaller clusters into the nearest). Name families with plain rules (warm and bright, dark, cool and mid-dark, low-contrast and low-chroma, etc.), and let the user rename. Every family gets the same panels as the general summary (palette, top, bottom, grading, histograms, glow). New photos are auto-assigned; user can drag a photo to another family.

### 3.2 Compare (`/compare`)

User uploads one JPEG/PNG. Compute the same features, find the nearest family (standardized feature distance plus palette distance in Lab), and show the photo's colors beside the family's target colors with hex codes and deltas. Suggested changes as **direction plus a band** (slight / moderate / strong), never fake precision. Map deltas to Lightroom controls:

- Temp/Tint from mean a/b shift
- Exposure from median lightness shift
- Contrast from p95 minus p5 gap
- Highlights/Whites from the upper-percentile gap
- Shadows/Blacks from the lower-percentile gap
- Vibrance/Saturation from the chroma ratio
- HSL from per-hue-bucket deltas
- Color Grading wheels from per-range tint deltas
- Glow (negative Clarity/Dehaze, soft bloom) from glow-score difference

JPEG has limited headroom: say so in the UI.

### 3.3 Edit guide (`/edit`)

Accepts CR3 (best effort for other RAW) and JPEG. For RAW, decode with LibRaw WASM in a worker, use real linear data to estimate clipped-highlight share, shadow noise floor and as-shot white balance, then search a simple parametric edit model (exposure, WB, contrast, highlights, shadows) toward the target family's stats. Output **slider ranges** (e.g. "Highlights roughly -30 to -50"), wider than the model's error, and flag clipping risk. This is more specific than Section 2 but still approximate: our pipeline is not Lightroom's, and the UI must say so. If decode is too slow or heavy on the test machine, fall back to the embedded JPEG preview via exifr and tell me first.

### 3.4 Grid (`/grid`)

Instagram-style profile preview (do not use Instagram's logo, wordmark or branding; draw own icons). The profile grid shows **3:4 portrait thumbnails**, center-cropped from whatever was posted, and the full image on tap. Provide: light/dark toggle, iPhone and iPad frames (layouts differ slightly; confirm against my devices), drag-to-reorder. Optional if cheap: a color-flow indicator showing how neighbouring tiles' colors transition.

### 3.5 Home (`/`)

A scroll story, not a feature grid: upload, analyze, families, compare, grid. Interactive 3D hero: a rotatable point cloud of one photo's pixels plotted in color space (each point colored as the pixel), morphing into the palette on scroll. Lazy-load three.js; static image fallback for reduced-motion, mobile and low-power devices. The 3D must explain the product, not decorate it.

---

## 4. Design direction

- It must look human-designed: clear visual hierarchy, a good font pairing, intentional spacing and sizes, small details that make the UI intuitive and easy to navigate. Reason about every element's size and position from a photographer's point of view.
- Avoid: uniform spacing and identical card layouts, gradients everywhere, generic icons, every section shouting equally for attention.
- Lightroom-like structure as reference (panels, dense but calm readouts), but more informative than interactive.
- Keep UI chrome neutral so it doesn't bias how photographers judge color. Photos and swatches are the heroes. Hex codes in tabular monospace with one-tap copy.
- Research current approaches for this kind of tool before proposing type and icons, and give a short reason for each choice.
- Accessibility basics: keyboard navigation, contrast, reduced-motion.

---

## 5. Phases and gates

**Phase 0: Setup and plan (no app code)**
- List skills/plugins/MCP servers you see. Create the project folder structure, `git init`. Create `.mcp.json` with the Playwright MCP entry (`npx @playwright/mcp@latest`); confirm it appears in `/mcp`. Confirm the Context7 skill works.
- Propose stack with verified versions, folder layout and data model. (Name is already decided: Colorway.)
- **Gate 0:** I confirm the plan.

**Phase 1: Analysis spike**
- Write the analysis as pure TypeScript functions over RGBA arrays so they run in a Worker and in Node. Run them on `test-photos/` (mix of golden hour, night, overcast, plus R6 CR3 and C-RAW). Output JSON and a simple contact-sheet HTML.
- RAW sub-spike: decode one CR3 and one C-RAW in Node and in a browser Worker; report time and memory.
- **Gate 1:** I check whether palettes, families, grading and glow ring true on my photos; tune thresholds.

**Phase 2: Mockups from real data**
- Use real spike output, not invented numbers. First: up to 3 visual directions for the Inspiration results screen only (static HTML, Playwright screenshots, saved as PNGs). I pick one. Then: Compare, Edit guide, Grid (iPhone and iPad, light and dark) and Home (hero plus one scroll section), at most 6 more screens.
- **Gate 2:** I approve the mockups.

**Phase 3: Build** (switch main model to Sonnet 5.5)
- Order: scaffold and design tokens, analysis engine in a Worker with unit tests, Inspiration, Compare, Grid, Home, accounts and sync, Edit guide (RAW), PWA offline.
- At the start of accounts and sync, tell me exactly what I need to provide (Supabase project and keys, Google OAuth client, GitHub repo). Supabase MCP read-only, scoped to the one project.
- Starter set: use my photos from `test-photos/`, resized to 1600px max, WebP, **EXIF and GPS stripped**.
- **Gate 3:** feature-complete build, tests pass.

**Phase 4: Review**
- Haiku subagent: lint, typecheck, tests, build. Opus 5.5 fresh-context reviewer: color-math correctness, accessibility, performance with 50 photos, security (RLS, auth, no EXIF/GPS leaks), fidelity to approved mockups. Impeccable audit if I approve. Fix findings and report.
- Targets (confirm in the spike): about 50 photos analyzed in roughly 10 to 20 seconds on a mid-range laptop, UI stays responsive.
- **Gate 4:** I read the review summary.

**Phase 5: Run locally with me**
- Start the dev server, walk me through each route with a checklist, take Playwright screenshots of anything I flag.
- **Gate 5:** my explicit "approved to publish".

**Phase 6: Publish on Vercel**
- Only after Gate 5. Connect the GitHub repo, set environment variables, point OAuth redirects at the production URL, deploy a preview first, then production. Do not deploy automatically through the Vercel MCP; ask before every deploy.
