import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { atRest, drawStill, firstStep, frames, holdLate, noAnchoring, release, scrollIntoRun, waitForJourney } from "./journey-helpers";

// The places the journey keeps through a resize WebKit lays out in steps (journey-helpers.ts, holdLate): 02's reader and
// the run's, with the still drawn above (live-drawing.spec.ts holds the live pin's), a Motion switch between the steps
// (J6-7), and a unit that moves alone for good.

/** 02's range as its timeline reads it: from its top under the masthead to its foot at the window's foot. */
const howRange = (page: Page) =>
  page.evaluate(() => {
    const how = document.getElementById("how");
    if (!how) throw new Error("#how is missing");
    const r = how.getBoundingClientRect();
    const start = r.top + window.scrollY - Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 0);
    return { start, end: r.bottom + window.scrollY - window.innerHeight, y: window.scrollY };
  });

test.describe("a resize WebKit lays out in two steps keeps a reader inside a pinned 02 the same fraction through it", () => {
  for (const anchoring of ["on", "off"] as const) {
    // 02's guard answered the first step, with the still's columns (100svh) above it and the large viewport (where its
    // timeline ends) still the old window's: the columns' change then landed unanswered, 40 px (open concern 3). 100svh
    // has landed in a step of its own too, apart from 100lvh (once in 576 resizes).
    for (const late of ["small and large", "small"] as const) {
      test(`the ${late} viewport${late === "small" ? "" : "s"} a frame late (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
        const base = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
        const size = isMobile ? { width: 390, height: 804 } : { width: 1440, height: 860 };
        await page.setViewportSize(base);
        await drawStill(page);
        if (anchoring === "off") await noAnchoring(page);
        await page.goto("/");
        await waitForJourney(page);
        await expect(page.locator("#how")).toHaveClass(/is-pinned/);
        if (!isMobile) await expect(page.locator(".anatomy-pin")).toHaveClass(/is-columns/);
        const at = await howRange(page);
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(at.start + 0.25 * (at.end - at.start)));
        await frames(page, 3); // the guard has learned the reader's place
        const was = await howRange(page);
        const through = (was.y - was.start) / (was.end - was.start);
        await holdLate(page, late);
        await page.setViewportSize(size);
        await firstStep(page); // the first step, and whatever answers it
        await release(page);
        await frames(page, 20);
        await atRest(page);
        const now = await howRange(page);
        const target = now.start + through * (now.end - now.start);
        expect(Math.abs(now.y - target), `${Math.round(through * 1000) / 10}% through was ${Math.round(target)}, the reader at ${now.y}`).toBeLessThanOrEqual(4);
      });
    }

    // A layout change told (the run's relayout for its pin, 100svh) or a scroll, between the steps: 02's guard learned
    // the new window with its own box still the old one's, and kept the wrong fraction (review, M3; 33 px on a phone).
    test(`the default viewport a frame late (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
      const base = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
      const size = isMobile ? { width: 390, height: 660 } : { width: 1440, height: 700 };
      await page.setViewportSize(base);
      await drawStill(page);
      if (anchoring === "off") await noAnchoring(page);
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator("#how")).toHaveClass(/is-pinned/);
      const at = await howRange(page);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(at.start + 0.6 * (at.end - at.start)));
      await frames(page, 3); // the guard has learned the reader's place
      const was = await howRange(page);
      const through = (was.y - was.start) / (was.end - was.start);
      await holdLate(page, "default");
      await page.setViewportSize(size);
      await firstStep(page);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("tt:layout"));
        window.dispatchEvent(new Event("scroll"));
      });
      await release(page);
      await frames(page, 20);
      await atRest(page);
      const now = await howRange(page);
      const target = now.start + through * (now.end - now.start);
      expect(Math.abs(now.y - target), `${Math.round(through * 1000) / 10}% through was ${Math.round(target)}, the reader at ${now.y}`).toBeLessThanOrEqual(4);
    });
  }

  // The run answers the step that completes a resize, after 02's guard, as it answers every resize, from the place it
  // learned while the page was laid out for one window. With the default viewport late, it answered its pin (100svh) on
  // a page 02 had yet to refit, and 02's guard, answering the second step, undid its move; with the small and large
  // late, it learned the new window with the old large viewport, and kept it.
  for (const [late, anchoring] of [["default", "on"], ["default", "off"], ["small and large", "on"], ["small and large", "off"]] as const) {
    test(`a reader mid-run stays the same fraction through it, the ${late} viewport${late === "default" ? "" : "s"} a frame late (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
      const base = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
      await page.setViewportSize(base);
      await drawStill(page);
      if (anchoring === "off") await noAnchoring(page);
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator("#how")).toHaveClass(/is-pinned/);
      await expect(page.locator("#run")).toHaveClass(/is-running/);
      await scrollIntoRun(page, 0.5);
      await frames(page, 3); // the run and 02's guard have learned the reader's place
      const through = () =>
        page.evaluate(() => {
          const r = document.getElementById("run")?.getBoundingClientRect();
          if (!r) throw new Error("#run is missing");
          const start = r.top + window.scrollY - (document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
          return (window.scrollY - start) / (r.bottom + window.scrollY - window.innerHeight - start);
        });
      const f = await through();
      await holdLate(page, late);
      await page.setViewportSize(isMobile ? { width: 390, height: 660 } : { width: 1440, height: 700 });
      await firstStep(page); // the first step, and whatever answers it
      await release(page);
      await frames(page, 20);
      await atRest(page);
      await expect(page.locator("#run")).toHaveClass(/is-running/);
      expect(Math.abs((await through()) - f), `${Math.round(f * 1000) / 10}% through the run`).toBeLessThanOrEqual(0.002);
    });
  }

  // J6-7 between the steps: a Motion switch settles 02 at once, its move using no window height, so the run's unpin,
  // made after it, stands. Waiting for the page to be laid out, 02's settle came after the unpin and undid it (#run's
  // top at -1,230 px, the review's M1).
  for (const anchoring of ["on", "off"] as const) {
    test(`a reader inside the pinned run lands on its start when Motion goes off between the steps (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
      test.skip(isMobile, "one project is enough");
      await page.setViewportSize({ width: 1440, height: 900 });
      await drawStill(page);
      if (anchoring === "off") await noAnchoring(page);
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator("#run")).toHaveClass(/is-running/);
      await scrollIntoRun(page, 0.5);
      await frames(page, 3);
      await holdLate(page, "small and large");
      await page.setViewportSize({ width: 1440, height: 860 });
      await firstStep(page);
      await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator("#run")).not.toHaveClass(/is-running/);
      await release(page);
      await frames(page, 20);
      await atRest(page);
      const [top, foot] = await page.evaluate(() => [document.getElementById("features")?.getBoundingClientRect().top ?? 0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0]);
      expect(Math.abs(top - foot), `06's top ${Math.round(top)}, the masthead's foot ${foot}`).toBeLessThanOrEqual(4);
    });
  }

  // A browser that moves 100svh alone, for good (the run's pin with it): the page counts as laid out once they have stood
  // apart a second, and the run, owed its refit, makes it then (the review's M2: it never did).
  test("the run refits within about a second when 100svh moves alone for good", async ({ page, isMobile }) => {
    const base = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    await page.setViewportSize(base);
    await drawStill(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#run")).toHaveClass(/is-running/);
    await scrollIntoRun(page, 0.5);
    await frames(page, 3);
    const runH = () => page.evaluate(() => document.getElementById("run")?.style.getPropertyValue("--run-h") ?? "");
    const pinH = () => page.evaluate(() => document.querySelector<HTMLElement>("#run .run-pin")?.clientHeight ?? 0);
    const before = { run: await runH(), pin: await pinH() };
    await holdLate(page, "default and large");
    await page.setViewportSize({ width: base.width, height: base.height - 100 });
    await expect.poll(pinH).toBeLessThan(before.pin);
    await expect.poll(runH, { timeout: 3_000, message: "the run's height, refit" }).not.toBe(before.run);
    await expect(page.locator("#run")).toHaveClass(/is-running/);
  });

  // And a reader who scrolls on during that second is refit from where they scrolled to, not put back where the second
  // began (the re-review's R1: 0.534 of the run, refit at 0.384).
  test("a reader who scrolls on while the run waits is refit from where they scrolled to", async ({ page, isMobile }) => {
    // a touch screen's stations are resting points: once the run refits, the page snaps to the station either way
    test.skip(isMobile, "a fine pointer's reader holds their own place");
    const base = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    await page.setViewportSize(base);
    await drawStill(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#run")).toHaveClass(/is-running/);
    await scrollIntoRun(page, 0.4);
    await frames(page, 3);
    // as the run's timeline reads it: to its foot at the large viewport's foot, which the hold keeps the old window's
    const through = () =>
      page.evaluate(() => {
        const r = document.getElementById("run")?.getBoundingClientRect();
        if (!r) throw new Error("#run is missing");
        const probe = document.createElement("div");
        probe.style.cssText = "position:absolute;top:0;width:0;visibility:hidden;height: 100lvh";
        document.body.append(probe);
        const view = probe.offsetHeight;
        probe.remove();
        const start = r.top + window.scrollY - (document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
        return (window.scrollY - start) / (r.bottom + window.scrollY - view - start);
      });
    const runH = () => page.evaluate(() => document.getElementById("run")?.style.getPropertyValue("--run-h") ?? "");
    const pinH = () => page.evaluate(() => document.querySelector<HTMLElement>("#run .run-pin")?.clientHeight ?? 0);
    const before = { run: await runH(), pin: await pinH() };
    await holdLate(page, "default and large");
    await page.setViewportSize({ width: base.width, height: base.height - 100 });
    await expect.poll(pinH).toBeLessThan(before.pin);
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: "instant" })); // the reader reads on
    await atRest(page, 5);
    const f = await through();
    await expect.poll(runH, { timeout: 3_000, message: "the run's height, refit" }).not.toBe(before.run);
    await frames(page, 3);
    await atRest(page);
    expect(Math.abs((await through()) - f), `${Math.round(f * 1000) / 10}% through the run as it waited`).toBeLessThanOrEqual(0.01);
  });
});

