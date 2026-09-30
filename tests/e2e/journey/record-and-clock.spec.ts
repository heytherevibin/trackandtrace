import { expect, test, type Page } from "@playwright/test";
import { frames, motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const lit = (page: Page) => page.locator(".berth-plan .plan-berth.is-lit");

/** Brings the plan into the window and waits for it to have drawn itself and lit the berth. */
async function drawPlan(page: Page): Promise<void> {
  await scrollToId(page, "record", 40);
  await page.locator(".berth-plan").scrollIntoViewIfNeeded();
  await expect(lit(page)).toHaveCount(1, { timeout: 4_000 });
  await expect.poll(() => page.evaluate(heldStrokes), { timeout: 4_000 }).toBe(0);
}

/** How many of the plan's strokes are not wholly drawn: anime's `draw` attribute on them is anything but "0 1" (none:
 * the server's own stroke). */
function heldStrokes(): number {
  return [...document.querySelectorAll(".berth-plan .plan-line, .berth-plan .plan-berth")].filter((el) => {
    const draw = el.getAttribute("draw");
    return draw !== null && draw !== "0 1";
  }).length;
}

/** Away from 03 and back: at every frame, there and back, the plan stays drawn (no stroke held back) and lit. */
async function expectNoRedraw(page: Page): Promise<void> {
  await scrollToId(page, "terminus");
  await frames(page, 3);
  await expect(lit(page)).toHaveCount(1);
  await scrollToId(page, "record", 40);
  await page.locator(".berth-plan").scrollIntoViewIfNeeded();
  const seen = await page.evaluate(
    () =>
      new Promise<string[]>((done) => {
        const states: string[] = [];
        const start = performance.now();
        const look = () => {
          const held = [...document.querySelectorAll(".berth-plan .plan-line, .berth-plan .plan-berth")].filter((el) => {
            const draw = el.getAttribute("draw");
            return draw !== null && draw !== "0 1";
          }).length;
          states.push(`lit ${document.querySelectorAll(".berth-plan .plan-berth.is-lit").length}, held ${held}`);
          if (performance.now() - start < 1_500) requestAnimationFrame(look);
          else done(states);
        };
        look();
      }),
  );
  expect(new Set(seen)).toEqual(new Set(["lit 1, held 0"]));
}

/** Flips Motion the way a reader does, through the footer's own switch, clicked in the DOM so the page never scrolls. */
async function clickMotion(page: Page): Promise<void> {
  await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
}

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

  // The berth plan plays once per load too (the owner, 2026-09-30): it draws the first time 03 is reached, then stays.
  test("the berth plan draws once: scrolled away and back, it never draws again", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await drawPlan(page);
    await expectNoRedraw(page);
  });

  test("a reload draws the berth plan again", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await drawPlan(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.reload();
    await waitForJourney(page);
    await expect(lit(page)).toHaveCount(0);
    await drawPlan(page);
  });

  test("Motion off, then on: the berth plan already drawn does not draw again", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await drawPlan(page);
    await scrollToId(page, "terminus");
    await clickMotion(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await frames(page, 3);
    await clickMotion(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
    await frames(page, 3);
    await expectNoRedraw(page);
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

  test("a rebuild mid-draw leaves the plan drawn and lit", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await scrollToId(page, "record", 40);
    // Catches the draw animation still running: T.draw is 1100ms, plus a small per-stroke stagger.
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.localStorage.setItem("tt.motion", "off");
      document.documentElement.setAttribute("data-motion", "off");
      window.dispatchEvent(new Event("tt:motion"));
    });
    await page.waitForTimeout(2_000);
    const dasharrays = await page.locator(".berth-plan .plan-line, .berth-plan .plan-berth").evaluateAll((els) => els.map((el) => el.getAttribute("stroke-dasharray")));
    expect(dasharrays.length).toBeGreaterThan(0);
    for (const attr of dasharrays) expect(attr).toBeNull();
    await expect(page.locator(".berth-plan .plan-berth.is-lit")).toHaveCount(1);
  });
});
