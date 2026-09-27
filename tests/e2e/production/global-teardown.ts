/**
 * The production smoke's last word (J6-2): did the server try to reach past this machine at any point in the run?
 *
 * Playwright runs this once, after every project and every worker has finished, whatever the result, so a refusal
 * logged after the last test to finish is still read, and read once. A spec's own `afterAll` runs once per worker,
 * which is not after every test.
 *
 * The log is the serve script's own (its path comes from the script's location, never this runner's working
 * directory), and `refusals()` throws when it is missing or the guard never opened it: no evidence fails the run
 * rather than passing it.
 *
 * Imported, not required: Playwright compiles this file to CommonJS, and the script is an ES module (import.meta).
 *
 * Not a `*.spec.ts`, so no `testMatch` collects it; playwright.production.config.ts names it directly.
 */
export default async function globalTeardown(): Promise<void> {
  const { refusals } = await import("../../../scripts/serve-local-production.mjs");
  const refused = refusals();
  if (refused.length > 0) throw new Error(`the local production server tried to reach past this machine:\n${refused.join("\n")}`);
}
