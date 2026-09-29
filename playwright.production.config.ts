import { defineConfig, devices } from "@playwright/test";

// "/" as production serves it (J6-2): this checkout's production build, served on this machine with sample data and
// nothing live (scripts/serve-local-production.mjs). The journey's nightly runs it after `npm run build:local`, the only
// build the serve script accepts; so can anyone:
//   npm run build:local && npx playwright test -c playwright.production.config.ts
// Always its own server, on 127.0.0.1: a server already on the port is refused, never adopted (the 2026-09-26 lesson,
// playwright.config.ts). Once every test has run, the teardown reads the server's offline-guard log: nothing refused.
const PORT = Number(process.env.E2E_PORT ?? 4210);
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e/production",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-production" }]] : [["list"]],
  globalTeardown: "./tests/e2e/production/global-teardown.ts",
  use: { baseURL: ORIGIN, trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `node scripts/serve-local-production.mjs --port ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
