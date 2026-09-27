import { expect, test, type Page } from "@playwright/test";
import { motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const statuses = (page: Page) => page.locator("#departures tbody td.board-status").allTextContents();

test.describe("the departure board's status", () => {
  test("follows the page", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    await expect.poll(() => statuses(page)).toEqual(["Next", "", "", "", "", "", "", "", "", ""]);
    await scrollToId(page, "record", 40);
    await expect.poll(() => statuses(page)).toEqual(["Departed", "Departed", "Departed", "At platform", "Next", "", "", "", "", ""]);
  });

  test("is true with Motion off too", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "reliability", 40);
    await expect.poll(() => statuses(page)).toEqual(["Departed", "Departed", "Departed", "Departed", "At platform", "Next", "", "", "", ""]);
  });

  test("its rows' words are whole again after they flip in", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await expect.poll(() => page.locator("#departures .flap-char").count()).toBeGreaterThan(0);
    await scrollToId(page, "departures");
    await expect.poll(() => page.locator("#departures .flap-char").count(), { timeout: 3_000 }).toBe(0);
    await expect(page.locator("#departures .board-name a").first()).toHaveText("The train, drawn");
  });
});
