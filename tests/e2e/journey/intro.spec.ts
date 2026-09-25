import { expect, test, type Page } from "@playwright/test";
import { motionOff, waitForJourney } from "./journey-helpers";

/** Counts every plotter outline and masthead rule the page ever inserts, from the first script on. */
async function countPlotting(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __plots: number };
    w.__plots = 0;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && n.matches(".intro-outline, .intro-rule")) w.__plots += 1;
    }).observe(document, { childList: true, subtree: true });
  });
}
const plots = (page: Page) => page.evaluate(() => (window as unknown as { __plots: number }).__plots);

test.describe("the intro", () => {
  test("plays once on a first visit at the top, and leaves the headline whole", async ({ page }) => {
    await countPlotting(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect.poll(() => plots(page)).toBeGreaterThan(0);
    await expect(page.locator(".intro-outline, .intro-rule")).toHaveCount(0, { timeout: 4_000 });
    const h1 = page.locator("#hero-title");
    await expect(h1).toHaveText(/Your PNR,\s*as the railway records it\./i);
    await expect(h1.locator(":scope > span")).toHaveCount(2);
    expect(await page.evaluate(() => sessionStorage.getItem("tt.intro"))).toBe("1");
  });

  test("does not play again on this visit", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await countPlotting(page);
    await page.reload();
    await waitForJourney(page);
    await page.waitForTimeout(800);
    expect(await plots(page)).toBe(0);
  });

  test("does not play for a reader who starts partway down, or with Motion off", async ({ page }) => {
    await countPlotting(page);
    await page.goto("/#record");
    await waitForJourney(page);
    await page.waitForTimeout(800);
    expect(await plots(page)).toBe(0);
  });

  test("Motion off: no intro", async ({ page }) => {
    await motionOff(page);
    await countPlotting(page);
    await page.goto("/");
    await waitForJourney(page);
    await page.waitForTimeout(800);
    expect(await plots(page)).toBe(0);
  });
});
