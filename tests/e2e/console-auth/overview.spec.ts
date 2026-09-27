import { consoleMessages } from "@/console/messages";
import { expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.overview;

test.beforeEach(() => resetConsole());

/**
 * 01 Overview is the console's home: "/" held a redirect to My keys until it existed, and setup's
 * "Open the console" and the sign-in key step both land here. The figures themselves are proven in
 * tests/unit/console/overview/; this proves the page a real session reaches, its plates, and that it
 * lays out and scans clean at both widths the sheet draws.
 */
test.describe("Overview", () => {
  test("an Owner lands on it after setup, with the four plates and the rail's first row", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);

    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    for (const title of [m.service.title, m.checks.title, m.quota.title, m.recent.title]) {
      await expect(page.getByRole("region", { name: title })).toBeVisible();
    }
    // The Owner's own setup is on the record, so Recent actions has something in it, and it links on.
    await expect(page.getByRole("table", { name: m.recent.caption })).toBeVisible();
    await expect(page.getByRole("link", { name: m.recent.open })).toHaveAttribute("href", "/audit-log");

    const rail = page.getByRole("navigation", { name: "Console" });
    await expect(rail.getByRole("link", { name: /Overview/ })).toHaveAttribute("href", "/");
    await expectAxeClean(page);
  });

  test("fits a phone with no horizontal overflow", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    expect(await layoutBreaks(page), "Overview at 390px").toEqual([]);
    await expectAxeClean(page);
  });
});
