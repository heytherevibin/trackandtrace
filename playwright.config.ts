import { defineConfig, devices } from "@playwright/test";

/**
 * `E2E_PORT` overrides it, because 4210 is not reliably ours.
 *
 * `reuseExistingServer` is on outside CI, so a dev server another WORKTREE left on this port is
 * silently adopted and the whole suite then tests that branch's app. It happened on 2026-09-26:
 * a sibling worktree's server answered, and the run reported a page that no longer exists on this
 * branch. Nothing in the output says which tree served it — the only symptom is assertions failing
 * for reasons the diff cannot explain.
 */
const PORT = Number(process.env.E2E_PORT ?? 4210);
// E2E_BASE_URL points the suite at a deployed site instead (no local server starts).
const remote = process.env.E2E_BASE_URL;
const baseURL = remote ?? `http://localhost:${PORT}`;

/** Not this config's: the console's suites, the production build's, and the nightly's. */
const NOT_HERE = /(console(-auth)?|production|nightly)\//;
/** The desktop suite's later half, as `--shard` orders it (by path): the journey's specs from p on (paper, place, plate
 * morph, record and clock, route, run, sound, teardown), and every spec after the journey's folder. */
const DESKTOP_LATER = /tests\/e2e\/(journey\/[p-z][^/]*|[k-z][^/]*)\.spec\.ts$/;
const DESKTOP = { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } };

// Fixture mode is the default for e2e: deterministic sample data, no network.
// Signed-in specs run only when E2E_SUPABASE=1 and a local Supabase stack is up.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // On CI each shard writes a blob; the e2e job merges a failing run's blobs into one HTML report (ci.yml).
  reporter: process.env.CI ? [["github"], ["blob"]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // console/ is this file's own fixture-mode console specs; console-auth/ is playwright.console.config.ts's
    // real-Supabase suite, run separately (npm run test:e2e:console) -- neither belongs here. production/ runs against a
    // production build (playwright.production.config.ts), nightly/ in the nightly's own config
    // (playwright.nightly.config.ts): neither belongs to the fixture-mode `next dev` run.
    //
    // The desktop suite in two entries of one name, its later specs (DESKTOP_LATER) after the phone's. `--shard` cuts
    // the suite, in this order and then by file path, into runs of equal test counts; the desktop suite all in a row
    // filled CI's shards 1 and 2 by itself, and its journey specs drawn live on SwiftShader made shard 2 the slowest of
    // every run (11.8 minutes against 7.7 for the others' mean, the five runs to 36746923546). Split so, its live
    // drawing and its run fall to different shards. `--project=desktop` still runs both; the second's results are
    // test-results/*-desktop1.
    { ...DESKTOP, testIgnore: [NOT_HERE, DESKTOP_LATER] },
    {
      name: "mobile",
      testIgnore: NOT_HERE,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    { ...DESKTOP, testMatch: DESKTOP_LATER },
    // The console host, served by the same dev server: Chromium resolves *.localhost to this machine.
    ...(remote
      ? []
      : [
          { name: "console-desktop", testMatch: /console\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, baseURL: `http://admin.localhost:${PORT}` } },
          { name: "console-mobile", testMatch: /console\/.*\.spec\.ts/, use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: `http://admin.localhost:${PORT}` } },
        ]),
  ],
  webServer: remote ? undefined : {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PNR_SOURCE: "fixture",
      // Empty values win over .env.local (Next never overrides a set variable), so a
      // server Playwright starts stays signed-out and offline from the hosted project.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      E2E: "1",
      E2E_NOW: process.env.E2E_NOW ?? "2026-09-17T06:30:00.000Z",
      // Fixed, so a spec can sign an unsubscribe link with the key the server derives from it. Without
      // DATA_KEY the server's key is randomBytes(32) per process, a link minted by the runner never
      // verifies, and the /unsubscribe sweeps would only ever measure the invalid-link page. The test
      // key the unit tests use, 32 bytes of 7: never a real one (the environment check requires a real
      // DATA_KEY in production).
      DATA_KEY: Buffer.alloc(32, 7).toString("base64"),
    },
  },
});
