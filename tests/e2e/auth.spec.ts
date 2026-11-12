import { test, expect } from "@playwright/test";

test("sign-in page offers Google and an email link, and explains what syncs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a link" })).toBeDisabled();
  await page.getByLabel("Email").fill("someone@example.com");
  await expect(page.getByRole("button", { name: "Email me a link" })).toBeEnabled();
  await expect(page.getByText("Your original photos never leave this device.")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Not signed in" })).toBeVisible();
  await page.screenshot({ path: "test-results/login.png" });
  expect(errors).toEqual([]);
});
