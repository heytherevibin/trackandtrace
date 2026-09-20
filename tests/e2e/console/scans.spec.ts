import { expect, test } from "../fixtures";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} face`, () => {
    test.use({ colorScheme: theme });

    test("console sign in has no material axe findings", async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
      await gotoReady(page, "/login");
      await expectAxeClean(page);
    });

    test("console sign in breaks no rule of its policy, the theme button included", async ({ page }) => {
      await page.addInitScript((t) => {
        window.localStorage.setItem("tt.theme", t);
        window.__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`));
      }, theme);
      await gotoReady(page, "/login");
      await page.getByRole("button", { name: /^Theme/ }).click();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    });
  });
}

test("console sign in fits every phone width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "console-mobile", "phone widths");
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoReady(page, "/login");
    expect(await layoutBreaks(page), `${width}px`).toEqual([]);
  }
});
