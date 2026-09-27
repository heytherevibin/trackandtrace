import { defineConfig, devices } from "@playwright/test";

// "/" as production serves it (J6-2): this checkout's production build, served on this machine with sample data and
// nothing live (scripts/serve-local-production.mjs). The journey's nightly runs it after `npm run build`; so can anyone:
//   npm run build && npx playwright test -c playwright.production.config.ts
// Always its own server: a server already on the port is refused, never adopted (the 2026-09-26 lesson,
// playwright.config.ts).
const PORT = Number(process.env.E2E_PORT ?? 4210);

export default defineConfig({
  testDir: "tests/e2e/production",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-production" }]] : [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `node scripts/serve-local-production.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
