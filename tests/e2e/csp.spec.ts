import { expect, test } from "./fixtures";
import { PNR } from "./helpers";

// The content security policy is enforced: any violation is a broken page. Every route, both faces.
const ROUTES = ["/", "/watchlist", "/pre-booking", "/accuracy", "/privacy", "/tos", "/login", "/account", `/pnr#${PNR.mixed}`, `/pnr#${PNR.notFound}`, "/pnr/abc", "/nowhere", "/offline"] as const;

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} face`, () => {
    test.use({ colorScheme: theme });
    for (const route of ROUTES) {
      test(`${route} breaks no rule of the security policy`, async ({ page }) => {
        await page.addInitScript((t) => {
          window.localStorage.setItem("tt.theme", t);
          window.__cspViolations = [];
          document.addEventListener("securitypolicyviolation", (event) => {
            window.__cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`);
          });
        }, theme);
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        // Violations first, so a failure names the directive; then the page must still have come alive.
        expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
        await expect(page.locator("html[data-hydrated]")).toBeAttached({ timeout: 15_000 });
      });
    }
  });
}
