// Gate 2 screenshots of the Phase 2 screens (playwright-core + Edge).
import { chromium } from "playwright-core";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
mkdirSync("mockups/png", { recursive: true });
const url = (f) => "file://" + resolve(`mockups/screens/${f}`);
const ready = async (p) => {
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => document.querySelectorAll("img").forEach((i) => (i.loading = "eager")));
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  await p.waitForTimeout(300);
};
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
for (const f of ["compare", "edit", "home"]) {
  await p.goto(url(`${f}.html`)); await ready(p);
  await p.screenshot({ path: `mockups/png/${f}.png` });
  await p.screenshot({ path: `mockups/png/${f}-full.png`, fullPage: true });
}
await p.goto(url("grid.html")); await ready(p);
await p.screenshot({ path: "mockups/png/grid-light.png", fullPage: true });
await p.click('[data-set-theme="dark"]'); await p.waitForTimeout(200);
await p.screenshot({ path: "mockups/png/grid-dark.png", fullPage: true });
await b.close();
console.log("done");
