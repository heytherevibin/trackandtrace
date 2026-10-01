import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { atRest, dismissInstall, drawStill, frames, noAnchoring, scrollIntoRun, waitForJourney } from "./journey-helpers";

// The place the window-seat run keeps through a resize (#95), apart from run.spec.ts (which is at its length limit).
// Held to the still drawing, as run.spec.ts is: this is about the run.

/** The run's range as keepPlace reads it, from its start (its top under the masthead) to its foot at the window's foot. */
const runThrough = (page: Page) =>
  page.evaluate(() => {
    const run = document.getElementById("run");
    if (!run) throw new Error("#run is missing");
    const r = run.getBoundingClientRect();
    const start = r.top + window.scrollY - (document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
    return (window.scrollY - start) / (r.bottom + window.scrollY - window.innerHeight - start);
  });

test.describe("the window-seat run's kept place", () => {
  test.beforeEach(async ({ page }) => {
    await drawStill(page);
  });

  // The place a resize keeps is the one the reader last read the run in, kept current without a layout read on every
  // scroll (#95): a change above the run that nobody announces (no tt:layout, no "resize", and no scroll without scroll
  // anchoring) moves the run under a reader who stays put, and only the pin's observer of the page's height (the body)
  // hears it. Missed, the resize after it put the reader back where the run stood before the change: 9.3% of the run
  // off on the desktop, 20.6% on a phone.
  test("a reader mid-run stays where they are through a resize after an unannounced change above the run", async ({ page, isMobile }) => {
    const base = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    await page.setViewportSize(base);
    await noAnchoring(page); // so the change moves the run, not the reader, and sends no scroll
    await page.goto("/");
    await waitForJourney(page);
    await dismissInstall(page);
    await expect(page.locator("#run")).toHaveClass(/is-running/);
    await scrollIntoRun(page, 0.5);
    await atRest(page);
    await page.evaluate(() => {
      const shim = document.createElement("div");
      shim.style.height = "240px";
      document.getElementById("run")?.before(shim);
    });
    await frames(page, 4); // the observers have had their turn
    const f = await runThrough(page);
    await page.setViewportSize(isMobile ? { width: 390, height: 804 } : { width: 1440, height: 860 });
    await frames(page, 20); // the run's relayout, 02's guard, and anything they set going
    await atRest(page);
    await expect(page.locator("#run")).toHaveClass(/is-running/);
    expect(Math.abs((await runThrough(page)) - f), `${Math.round(f * 1000) / 10}% through before the resize`).toBeLessThanOrEqual(0.002);
  });
});
