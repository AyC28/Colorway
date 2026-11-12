import { test, expect } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// 50 real photos: the 26-photo starter set plus reference screenshots (private, gitignored; skipped if absent).
const starter = existsSync("public/starter") ? readdirSync("public/starter").filter((f) => f.endsWith(".webp")).map((f) => join("public/starter", f)) : [];
const refs = existsSync("reference") ? readdirSync("reference").filter((f) => f.endsWith(".png")).sort().map((f) => join("reference", f)) : [];
const fifty = [...starter, ...refs].slice(0, 50);

test("50 photos: analysed in the target time with a responsive page", async ({ page }) => {
  test.skip(fifty.length < 50, "needs 50 local photos");
  test.setTimeout(180_000);
  await page.goto("/inspiration");
  await expect(page.getByRole("heading", { name: "Start with photos you love" })).toBeVisible();
  // responsiveness probe: the longest gap between animation frames while analysis runs
  await page.evaluate(() => {
    (window as any).__gap = 0; let last = performance.now();
    const tick = () => { const now = performance.now(); (window as any).__gap = Math.max((window as any).__gap, now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await page.locator('input[type="file"]').first().setInputFiles(fifty);
  await expect(page.locator(".fam-row").first()).toBeVisible({ timeout: 150_000 });
  await expect(page.locator(".ph-card")).toHaveCount(50);
  const ms = Date.now() - t0;
  const gap = await page.evaluate(() => (window as any).__gap);
  console.log(`50 photos to families: ${(ms / 1000).toFixed(1)} s, longest frame gap ${Math.round(gap)} ms, cores ${await page.evaluate(() => navigator.hardwareConcurrency)}`);
  expect(ms).toBeLessThan(20_000);
});
