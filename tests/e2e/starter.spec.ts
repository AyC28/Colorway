import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const count = JSON.parse(readFileSync("public/starter/manifest.json", "utf8")).photos.length;

test("home's starter-set button fills the library with the photographer's photos", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto("/");
  await page.getByRole("link", { name: "Try the starter set" }).click();
  await expect(page.locator(".fam-row").first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".ph-card")).toHaveCount(count);
  await page.screenshot({ path: "test-results/starter.png", fullPage: true });
  expect(errors).toEqual([]);
});
