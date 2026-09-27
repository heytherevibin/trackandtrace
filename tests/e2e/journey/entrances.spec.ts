import { expect, test, type Page } from "@playwright/test";
import { motionOff, scrollToId, transformOf, waitForJourney } from "./journey-helpers";

const firstRow = (page: Page) => page.locator("#principles [role=row]").first();

test.describe("section entrances", () => {
  test.skip(({ isMobile }) => isMobile, "one viewport is enough for the mechanism; collisions cover phones");

  test("every row group the journey names exists", async ({ page }) => {
    await page.goto("/");
    for (const sel of ["#principles [role=row]", "#record .blueprint", "#reliability dl > div", "#roadmap li", "#features article", "#faq details"]) {
      await expect(page.locator(sel).first(), sel).toBeAttached();
    }
  });

  test("a row seen at rest arms out of sight and rises again when it comes back", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "principles", 120);
    await expect.poll(() => transformOf(firstRow(page))).toBe("none");
    await scrollToId(page, "terminus");
    await expect.poll(() => transformOf(firstRow(page))).toBe("matrix(1, 0, 0, 1, 0, 16)");
    await scrollToId(page, "principles", 120);
    await expect.poll(() => transformOf(firstRow(page)), { timeout: 3_000 }).toBe("none");
  });

  test("a jump straight to a section never strands its rows", async ({ page }) => {
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect.poll(() => transformOf(page.locator("#faq details").first()), { timeout: 3_000 }).toBe("none");
  });

  test("a kicker's words are whole again after it flips", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await scrollToId(page, "record", 120);
    const kicker = page.locator("#record [data-flap]");
    await expect.poll(() => kicker.evaluate((el) => el.children.length), { timeout: 3_000 }).toBe(0);
    await expect(kicker).toHaveText(/The record you get/i);
  });

  test("Motion off: nothing is ever offset", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await page.waitForTimeout(300);
    expect(await transformOf(firstRow(page))).toBe("none");
    await scrollToId(page, "principles", 120);
    expect(await transformOf(firstRow(page))).toBe("none");
  });
});
