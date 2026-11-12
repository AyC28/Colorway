// Mockup screenshots with playwright-core driving the installed Microsoft Edge.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["darkroom", "terrazzo", "wayfind"];
mkdirSync("mockups/inspiration/png", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
for (const d of dirs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto("file://" + resolve(`mockups/inspiration/${d}/index.html`));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.querySelectorAll("img").forEach((i) => (i.loading = "eager")));
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `mockups/inspiration/png/${d}-1440.png` });
  await page.screenshot({ path: `mockups/inspiration/png/${d}-1440-full.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `mockups/inspiration/png/${d}-390-full.png`, fullPage: true });
  await page.close();
  console.log("shot", d);
}
await browser.close();
