import { expect, test } from "../fixtures";
import { PNR } from "../helpers";
import { frames, waitForJourney } from "../journey/journey-helpers";

// "/" as production serves it (J6-2; spec §5's production-build smoke): this checkout's production build on this
// machine, with sample data and nothing live. The dev-only probes (__ttJourney, __ttJourneyStarted) are compiled out
// here, so state is read from the page's own attributes. The server's offline guard writes every connection it refused
// to its log (scripts/serve-local-production.mjs); global-teardown.ts reads it once every test has run, from both
// projects and every worker, and fails the run on a refusal or on a missing log.

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`));
  });
});

test("'/' scrolled end to end breaks no rule of the security policy and asks no other host", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost").origin;
  const foreign = new Set<string>();
  const heard = { worker: 0 };
  // Every request the context sees, the service worker's (/sw.js, which a production build registers) as well as the
  // page's, and every WebSocket; a page listener alone hears neither (final review).
  context.on("request", (r) => {
    if (r.serviceWorker()) heard.worker += 1;
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.origin !== origin) foreign.add(u.origin);
  });
  page.on("websocket", (ws) => {
    const u = new URL(ws.url());
    if (u.host !== new URL(origin).host) foreign.add(`${u.protocol}//${u.host}`);
  });
  await page.goto("/");
  await waitForJourney(page);
  // the worker has installed, and its precache has been heard: the watch covers it
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => heard.worker).toBeGreaterThan(0);
  const bottom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const step = await page.evaluate(() => Math.round(window.innerHeight * 0.5));
  for (let y = 0; y <= bottom + step; y += step) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await frames(page, 2);
  }
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  expect([...foreign]).toEqual([]);
});

test("a sample PNR is checked from the fixture, never a live source", async ({ page }) => {
  await page.goto("/");
  await waitForJourney(page);
  const plate = page.getByTestId("hero-instrument");
  await plate.getByRole("textbox").fill(PNR.cnf);
  await plate.getByRole("button", { name: /run/i }).click();
  const result = page.getByTestId("terminal-result");
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("data-kind", "ok");
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test("a production build has no frame meter and no dev probes", async ({ page }) => {
  await page.goto("/?journey-hud");
  await waitForJourney(page);
  await expect(page.getByRole("button", { name: "Close the frame meter" })).toHaveCount(0);
  // (__ttHoldFloor is not in the list: tests/e2e/fixtures.ts sets it in every context; production only never reads it.)
  expect(await page.evaluate(() => ["__ttJourney", "__ttJourneyStarted"].filter((k) => k in window))).toEqual([]);
});
