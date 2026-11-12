import { test, expect } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REF = "reference";
const pngs = existsSync(REF) ? readdirSync(REF).filter((f) => f.endsWith(".png")).sort().map((f) => join(REF, f)) : [];
const cr3 = join(REF, "raw-test-2.CR3");
// the user's own extra CR3s (gitignored), tested too when present
const moreCr3 = ["starter-set/043A7001.CR3", "starter-set/043A0922.CR3"].filter((f) => existsSync(f));

test("edit guide decodes a CR3 in the browser and fits slider ranges", async ({ page }) => {
  test.skip(pngs.length < 15 || !existsSync(cr3), "needs reference/ photos and a CR3");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto("/inspiration");
  await page.locator('input[type="file"]').first().setInputFiles(pngs.slice(0, 20));
  await expect(page.locator(".fam-row").first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Edit guide" }).click();
  await expect(page.getByRole("heading", { name: "Edit guide", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated), "/edit must be cross-origin isolated").toBe(true);
  const t0 = Date.now();
  await page.locator('input[type="file"]').first().setInputFiles(cr3);
  await expect(page.locator(".slider").first()).toBeVisible({ timeout: 60_000 });
  console.log(`CR3 to slider ranges in ${Date.now() - t0} ms`);
  await expect(page.getByText("Compressed C-RAW")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Colour, toward/ })).toBeVisible();
  await page.screenshot({ path: "test-results/edit.png", fullPage: true });
  await expect(page.getByRole("button", { name: "Open another file" })).toBeVisible();
  // a reload keeps the file (saved on this device) and refits
  await page.reload();
  await expect(page.locator(".file")).toHaveText("raw-test-2.CR3");
  await expect(page.locator(".slider").first()).toBeVisible({ timeout: 30_000 });
  for (const f of moreCr3) {
    // a second file opens without reloading the page
    await page.locator('input[type="file"]').first().setInputFiles(f);
    await expect(page.locator(".file")).toHaveText(f.split("/").pop()!, { timeout: 60_000 });
    await expect(page.locator(".slider").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Canon EOS R6")).toBeVisible();
    console.log(`${f}: ranges shown`);
  }
  expect(errors).toEqual([]);
});
