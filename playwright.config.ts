import { defineConfig } from "@playwright/test";

/** Smoke tests drive the locally installed Microsoft Edge (no browser download). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  reporter: [["list"]],
  // one at a time: the 50-photo timing check must not share the CPU with other tests
  workers: 1,
  use: { baseURL: "http://localhost:3100", channel: "msedge", viewport: { width: 1440, height: 900 } },
  webServer: { command: "npx next dev -p 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 120_000 },
  outputDir: "test-results",
});
