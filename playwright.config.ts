import { defineConfig } from "@playwright/test";

// Next allows one dev server per project: reuse the one already running (E2E_PORT=3000 during the walkthrough)
const port = process.env.E2E_PORT ?? "3100";

/** Smoke tests drive the locally installed Microsoft Edge (no browser download). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  reporter: [["list"]],
  // one at a time: the 50-photo timing check must not share the CPU with other tests
  workers: 1,
  use: { baseURL: `http://localhost:${port}`, channel: "msedge", viewport: { width: 1440, height: 900 } },
  webServer: { command: `npx next dev -p ${port}`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 120_000 },
  outputDir: "test-results",
});
