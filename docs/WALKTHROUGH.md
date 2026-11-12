# Phase 5 walkthrough (Gate 5)

The app runs at **http://localhost:3000**. Use your normal browser (Chrome or Safari), on a desktop first. Tick each line or note what's wrong; I'll screenshot and fix anything you flag. If the page shows "Your reference look" with old test photos, use Account → "Sign out and remove this device's data", or a private window, for a clean start.

## 1. Home `/`
- [ ] The headline, sentence and both buttons are visible without scrolling.
- [ ] Scrolling the story: your clock-tower photo turns into dots, the dots fly into the 3D colour cloud, then take their palette colours, and the palette bar appears.
- [ ] At the last step you can drag the cloud, or click it and use the arrow keys.
- [ ] With "reduce motion" switched on (macOS: System Settings → Accessibility → Display), you see still images instead and no animation.
- [ ] The summary at the bottom reads correctly to you as a photographer.

## 2. Inspiration `/inspiration`
- [ ] "Try the starter set" loads 26 of your photos, and the progress line counts up.
- [ ] Palette cards: role words (Main, Supporting, Accent) and the bar make sense without percentages. Clicking a hex code copies it.
- [ ] "Show full analysis": sky/ground (with hex codes), histogram, hue, grading wheels, glow.
- [ ] Families: the number and the names feel right for your work. Hovering a family swaps the preview card.
- [ ] Opening a family: Rename works and survives a reload. "Move to" moves a photo and the change sticks.
- [ ] "Remove" on a photo deletes it. Dropping your own JPGs onto the page adds them.

## 3. Compare `/compare`
- [ ] Choosing a JPG shows the closest family (plus "Also close to" when it's a near tie).
- [ ] The colour pairs and the six suggested moves match what you would actually do in Lightroom.
- [ ] "Show all suggestions" opens the rest. The "Directions, not exact values" wording reads as honest.

## 4. Edit guide `/edit` (desktop)
- [ ] Opening `043A7001.CR3` decodes in a couple of seconds and shows camera, ISO, shutter and aperture.
- [ ] Slider ranges look like plausible starting points for this photo toward the chosen family. Changing "Toward" refits.
- [ ] The colour section: your colour vs the family's on the HSL tracks, and the wheels with the move drawn.
- [ ] "Open another file" loads a second CR3 without a reload.
- [ ] On a phone: the banner suggests JPG/PNG.

## 5. Grid `/grid`
- [ ] Phone frame with 3:4 tiles; Light/Dark switch.
- [ ] Orders: As added, By family, Smooth colour flow. Dragging a tile (or Alt + arrow keys) reorders it, and the order survives a reload.
- [ ] Clicking a tile opens the full photo. The colour-flow strip and the "biggest jumps" card are useful.
- [ ] The phone size (402 × 874) matches your phone.

## 6. Accounts `/login`, `/account`
- [ ] Sign in (Google or email link) lands on Account, which says "Up to date" after a moment.
- [ ] Optional: sign in on a second browser or device. Your palettes, families and thumbnails arrive; originals don't.
- [ ] Optional: in Safari, add photos and confirm they sync (after running migration 0002).

## 7. Offline (optional, production build only)
Run `npm run build && npm start`, open the app once, then turn Wi-Fi off and reload: Inspiration, Grid and Edit guide still open.

## When you're happy
Say **"approved to publish"** to pass Gate 5. Nothing is pushed or deployed before that.
