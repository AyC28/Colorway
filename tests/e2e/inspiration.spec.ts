import { test, expect } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The reference photos are private and gitignored; skip where they are absent.
const REF = "reference";
const pngs = existsSync(REF) ? readdirSync(REF).filter((f) => f.endsWith(".png")).sort().map((f) => join(REF, f)) : [];

test.describe("Inspiration", () => {
  test.skip(pngs.length < 15, "needs reference/ photos");

  test("analyses uploads on-device and builds families", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    const external: string[] = [];
    page.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.protocol.startsWith("blob") && !u.protocol.startsWith("data")) external.push(r.url()); });

    await page.goto("/inspiration");
    await expect(page.getByRole("heading", { name: "Start with photos you love" })).toBeVisible();

    const t0 = Date.now();
    await page.locator('input[type="file"]').first().setInputFiles(pngs.slice(0, 20));
    await expect(page.getByRole("heading", { name: "Families" })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".fam-row").first()).toBeVisible();
    const ms = Date.now() - t0;

    await expect(page.locator(".spec-card")).not.toHaveCount(0);
    await expect(page.locator(".ph-card")).toHaveCount(20);
    await page.screenshot({ path: "test-results/inspiration.png", fullPage: true });

    // hover preview + open family
    await page.locator(".fam-row").nth(1).hover();
    await page.locator(".fam-row").first().click();
    await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
    await page.screenshot({ path: "test-results/family.png", fullPage: true });

    console.log(`20 photos to families in ${ms} ms`);
    expect(external, "no third-party requests").toEqual([]);
    expect(errors).toEqual([]);
  });
});
