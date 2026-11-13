import { test, expect } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REF = "reference";
const pngs = existsSync(REF) ? readdirSync(REF).filter((f) => f.endsWith(".png")).sort().map((f) => join(REF, f)) : [];

test("compare matches a JPEG to a family with directions", async ({ page }) => {
  test.skip(pngs.length < 15 || !existsSync(join(REF, "comparison-photo.jpg")), "needs reference/ photos");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto("/inspiration");
  await page.locator('input[type="file"]').first().setInputFiles(pngs.slice(0, 20));
  await expect(page.locator(".fam-row").first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Compare" }).click();
  await expect(page.getByRole("heading", { name: "Compare a photo" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(join(REF, "comparison-photo.jpg"));
  await expect(page.getByRole("heading", { name: "Closest family" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "What to change" })).toBeVisible();
  await expect(page.locator(".sugg tbody tr").first()).toBeVisible();
  await page.getByRole("tab", { name: "Colour space" }).click();
  await expect(page.getByRole("button", { name: "Your photo" })).toBeVisible();
  await page.waitForTimeout(800);
  await page.locator(".cs").screenshot({ path: "test-results/compare-space.png" });
  await page.getByRole("tab", { name: "Colour match" }).click();
  await expect(page.locator(".glyph").first()).toBeVisible();
  await expect(page.locator(".intro").getByRole("button", { name: "Compare another photo" })).toBeVisible();
  await page.screenshot({ path: "test-results/compare.png", fullPage: true });
  // leave and come back: the photo and its result are still there, and listed under previous photos
  await page.getByRole("link", { name: "Inspiration" }).click();
  await page.getByRole("link", { name: "Compare" }).click();
  await expect(page.getByRole("heading", { name: "Closest family" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Open comparison-photo.jpg" })).toBeVisible();
  expect(errors).toEqual([]);
});
