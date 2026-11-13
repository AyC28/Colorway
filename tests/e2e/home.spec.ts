import { test, expect } from "@playwright/test";

test("home story animates the pixel cloud on scroll", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "See the colour in your photos" })).toBeVisible();
  await expect(page.locator(".story-canvas")).toBeVisible({ timeout: 20_000 });
  const story = page.locator("#story");
  const box = (await story.boundingBox())!;
  const top = await page.evaluate(() => window.scrollY);
  for (const [i, p] of [0.0, 0.08, 0.4, 0.7, 0.95].entries()) {
    await page.evaluate((y) => window.scrollTo(0, y), top + box.y + p * (box.height - 900));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/home-${i}.png` });
  }
  // turn it with the keyboard
  await page.locator(".story-canvas").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/home-turned.png" });
  expect(errors).toEqual([]);
});

test("reduced motion gets the static story, no WebGL", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator(".story-fallback")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".story-canvas")).toBeHidden();
  await ctx.close();
});
