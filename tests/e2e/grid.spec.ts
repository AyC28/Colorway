import { test, expect } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REF = "reference";
const pngs = existsSync(REF) ? readdirSync(REF).filter((f) => f.endsWith(".png")).sort().map((f) => join(REF, f)) : [];

test("grid shows 3:4 tiles, switches theme and reorders", async ({ page }) => {
  test.skip(pngs.length < 15, "needs reference/ photos");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto("/inspiration");
  await page.locator('input[type="file"]').first().setInputFiles(pngs.slice(0, 12));
  await expect(page.locator(".fam-row").first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Grid" }).click();
  await expect(page.getByRole("heading", { name: "Grid preview" })).toBeVisible();
  await expect(page.locator(".tiles li")).toHaveCount(12);
  const box = await page.locator(".tile-img").first().boundingBox();
  expect(Math.abs(box!.height / box!.width - 4 / 3)).toBeLessThan(0.02);
  const first = await page.locator(".tile-b").first().getAttribute("aria-label");
  await page.locator(".tile-b").first().focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".tile-b").nth(1)).toHaveAttribute("aria-label", first!.replace("tile 1", "tile 2"));
  await page.getByRole("button", { name: "Dark" }).click();
  await page.screenshot({ path: "test-results/grid-dark.png", fullPage: true });
  expect(errors).toEqual([]);
});
