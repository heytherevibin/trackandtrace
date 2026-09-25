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

  test("after the plan has drawn, a rebuild leaves it drawn and lit", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await scrollToId(page, "record", 40);
    await page.locator(".berth-plan").scrollIntoViewIfNeeded();
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(1, { timeout: 4_000 });
    await page.waitForTimeout(2_000);
    // Forces a rebuild the way chapters.spec.ts's Motion toggle does, without the footer switch. #how sits
    // above #record and collapses/re-expands its pinned height as Motion toggles, which would otherwise drift
    // the plan out of the viewport mid-toggle (a real, unrelated mechanic — startPlaceGuard corrects it, but
    // only once its ResizeObserver has had a turn, after this rebuild has already run synchronously). Re-centre
    // on the plan, from its rect under the CSS the toggle is about to apply, before dispatching each one, so the
    // rebuild this test is exercising always finds the plan on screen — the same as a reader watching it.
    for (const motion of ["off", "on"] as const) {
      await page.evaluate((m) => {
        if (m === "off") window.localStorage.setItem("tt.motion", "off");
        else window.localStorage.removeItem("tt.motion");
        document.documentElement.setAttribute("data-motion", m);
        const rect = document.querySelector(".berth-plan")!.getBoundingClientRect();
        const centre = window.innerHeight / 2 - rect.height / 2;
        window.scrollTo({ top: window.scrollY + rect.top - centre, behavior: "instant" });
        window.dispatchEvent(new Event("tt:motion"));
      }, motion);
      await page.waitForTimeout(300);
    }
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(1);
    const lines = await page.locator(".berth-plan .plan-line").evaluateAll((els) =>
      els.map((el) => ({ attr: el.getAttribute("stroke-dasharray"), computed: getComputedStyle(el).strokeDasharray })),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const { attr, computed } of lines) {
      expect(attr, "stroke-dasharray attribute").toBeNull();
      expect(computed, "computed stroke-dasharray").not.toMatch(/^0(\.\d+)?(px)?[ ,]/);
    }
  });
});
