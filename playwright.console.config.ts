import { defineConfig, devices } from "@playwright/test";

const PORT = 4211;
const baseURL = `http://admin.localhost:${PORT}`;

// The console's end-to-end run, against a real local Supabase stack -- the opposite of
// playwright.config.ts, which deliberately blanks NEXT_PUBLIC_SUPABASE_URL so the traveller run
// never reaches a real project. Next allows one dev server per project at a time, so this runs on
// its own port (4211, never 4210: the traveller run reuses an existing server there) and after the
// traveller run, not alongside it.
//
// Serial, one worker, one project: the console has exactly one first Owner at a time, and
// resetConsole() before each test is what makes several tests able to set one up in turn.
export default defineConfig({
  testDir: "tests/e2e/console-auth",
  fullyParallel: false,
  workers: 1,
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
      name: "console-auth",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PNR_SOURCE: "fixture",
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? "",
      E2E: "1",
      E2E_NOW: process.env.E2E_NOW ?? "2026-09-17T06:30:00.000Z",
    },
  },
});
