import { expect, test } from "./fixtures";
import { PNR, expectAxeClean, gotoReady } from "./helpers";

// Every route, in both faces. The only exemption is the design-locked steel pairing (see helpers).
const ROUTES = ["/", "/watchlist", "/pre-booking", "/accuracy", "/privacy", "/tos", "/login", "/account", `/pnr/${PNR.mixed}`, `/pnr/${PNR.notFound}`, "/pnr/abc", "/nowhere", "/offline"] as const;

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} face`, () => {
    test.use({ colorScheme: theme });
    for (const route of ROUTES) {
      test(`${route} has no material axe findings`, async ({ page }) => {
        await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
        await gotoReady(page, route);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectAxeClean(page);
      });
    }
  });
}
