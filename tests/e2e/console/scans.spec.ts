import { expect, test } from "../fixtures";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";
import { report, undersizedTargets } from "../targets";

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

// The console's pressables are the traveller site's (Button, .press, the same coarse-pointer rule in motion.css), so the
// same hit-walk reads them (targets.ts): every control answers a finger across 44px, and none says `position: static`,
// which would hand its overlay to a box above it. With no database here the console draws three things: sign in, the
// inbox notice after the press, and its own "unavailable" in place of every page that needs a member.
test("the console's controls answer a finger across 44px, on every page it can draw here", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "console-mobile", "tap targets are a touch-screen concern");
  await gotoReady(page, "/login");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "a touch screen").toBe(true);
  expect(report(await undersizedTargets(page)), "sign in").toEqual([]);
  await page.getByLabel("Console email").fill(`targets-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  expect(report(await undersizedTargets(page)), "the inbox notice").toEqual([]);
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(report(await undersizedTargets(page)), "a page that needs a member").toEqual([]);
});
