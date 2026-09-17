import { defineConfig, devices } from "@playwright/test";

const PORT = 4210;
const baseURL = `http://localhost:${PORT}`;

// Fixture mode is the default for e2e: deterministic sample data, no network.
// Signed-in specs run only when E2E_SUPABASE=1 and a local Supabase stack is up.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PNR_SOURCE: "fixture",
      E2E: "1",
      E2E_NOW: process.env.E2E_NOW ?? "2026-09-17T06:30:00.000Z",
    },
  },
});
