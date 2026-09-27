import { consoleMessages } from "@/console/messages";
import { expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.abuse;

test.beforeEach(() => resetConsole());

/**
 * 04 Abuse & limits, its read-only half. The figures are proven in tests/unit/console/abuse and
 * tests/unit/services/limited-log.test.ts; this proves an Owner reaches it from the rail, that it
 * draws its two plates and no Block control, and that it lays out and scans clean at both widths.
 */
test.describe("Abuse & limits", () => {
  test("an Owner opens it from the rail, and it draws Limits and Most limited today", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);
    const rail = page.getByRole("navigation", { name: "Console" });
    await rail.getByRole("link", { name: /Abuse/ }).click();

    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    await expect(page.getByRole("region", { name: m.limits.title })).toBeVisible();
    await expect(page.getByRole("region", { name: m.mostLimited.title })).toBeVisible();
    await expect(page.getByRole("button", { name: /Block/ })).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("fits a phone with no horizontal overflow", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, "/abuse");
    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    expect(await layoutBreaks(page), "Abuse at 390px").toEqual([]);
    await expectAxeClean(page);
  });
});
