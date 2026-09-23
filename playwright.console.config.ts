import { defineConfig, devices } from "@playwright/test";

// 4211 by default, overridable with CONSOLE_E2E_PORT. `reuseExistingServer` is what makes the
// override necessary rather than merely convenient: a second worktree, pointed at its own Supabase
// stack, running this suite on 4211 would silently reuse whichever `next dev` got there first and
// test the wrong checkout against the wrong database. One port per worktree, named at the command
// line, is the only thing that keeps the two apart.
const PORT = Number(process.env.CONSOLE_E2E_PORT ?? 4211);
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
  // The console is emptied once, after the whole run, whatever ran and however it ended -- so that
  // `supabase test db` against the same database is not at the mercy of which specs were selected
  // or of `team.spec.ts` happening to sort last. See the file's own note.
  globalTeardown: "./tests/e2e/console-auth/global-teardown.ts",
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
