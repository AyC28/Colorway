import { defineConfig } from "@playwright/test";

/** Smoke tests drive the locally installed Microsoft Edge (no browser download). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", channel: "msedge", viewport: { width: 1440, height: 900 } },
  webServer: { command: "npx next dev -p 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 120_000 },
  outputDir: "test-results",
});
