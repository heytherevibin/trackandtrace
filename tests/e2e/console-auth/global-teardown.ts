import { resetConsole } from "./fixtures";

/**
 * The console, emptied once the whole run is over, however much of it ran.
 *
 * `resetConsole()` in `beforeEach` fixes the state each test *starts* in and says nothing about
 * what the last one leaves behind, and `supabase test db` is not isolated from that: it runs
 * against the same local database, and several of its pgTAP files make statements about the whole
 * console -- `console_team()`'s roster, the "at least one Owner" floor, `has_owner()`, the
 * Security-email address list -- which one leftover member falsifies.
 *
 * Until this file, that was held by `team.spec.ts`'s own `afterAll`, plus the fact that
 * `workers: 1` and alphabetical ordering put `team.spec.ts` last. A **full** run therefore ended
 * clean; a **partial** one did not. `scans.spec.ts` on its own leaves one member, two keys and one
 * session, and that was exactly fourteen pgTAP failures across five files that had not been
 * touched -- a wrong answer to "is the database healthy?", produced by how the specs happen to be
 * named. Running one spec to look at one thing is the most ordinary thing anybody does here, so the
 * property is held here instead, where it holds for any subset, in any order, and after a failure.
 *
 * Playwright runs this after every project and every worker has finished, whatever the result, so
 * the database is left as the run found it even when the run itself went red.
 *
 * Not a `*.spec.ts`, so the default `testMatch` never collects it as a test file
 * (team-helpers.ts's own note); `playwright.console.config.ts` names it directly.
 *
 * It throws rather than swallowing: `resetConsole()` shells out to `psql`, and a teardown that
 * quietly did nothing would put the suite straight back to leaving a dirty database with nothing
 * on screen to say so -- which is the thing this file exists to stop.
 */
export default function globalTeardown(): void {
  try {
    resetConsole();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[console-e2e] the console could not be emptied after the run, so the database is left dirty and \`npm run db:test\` will fail against it: ${message}`,
    );
  }
}
