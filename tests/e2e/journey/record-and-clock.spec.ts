import { expect, test } from "@playwright/test";
import { motionOff, scrollToId, waitForJourney } from "./journey-helpers";

test.describe("03 and 04, moving", () => {
  test("the berth plan draws itself on arrival, then lights the berth", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(0);
    await scrollToId(page, "record", 40);
    await page.locator(".berth-plan").scrollIntoViewIfNeeded();
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(1, { timeout: 4_000 });
    await expect(page.locator(".berth-cap")).toContainText("12 LB");
  });

  test("the second hand sweeps while the clock is on screen", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "reliability", 40);
    const hand = page.locator(".station-clock .clock-hand.is-second");
    await expect(hand).toBeVisible();
    const first = await hand.getAttribute("transform");
    await page.waitForTimeout(1_200);
    expect(await hand.getAttribute("transform")).not.toBe(first);
  });

  test("Motion off: the plan is drawn and lit from the start, and there is no second hand", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(1);
    await scrollToId(page, "reliability", 40);
    await expect(page.locator(".station-clock .clock-hand.is-second")).toBeHidden();
  });
});
