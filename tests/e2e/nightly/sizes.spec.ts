import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { cutText } from "../layout";
import { LANDING_INSTRUMENTS, collisionsInView, collisionsTopToBottom } from "../journey/collisions";
import { waitForJourney } from "../journey/journey-helpers";

// Nightly (spec §5, §9; J6-13): the landing top to bottom, Motion on, at fifteen sizes, and with its text at 200% at the
// three sizes every PR checks. The sweep is as dense as the PR's densest (collisions.spec.ts's sweep through 02 pinned:
// 0.15 of a window a step), here over the whole page, so every stop of the three pinned pieces (the drawing chapter,
// 02's dial, the run) is looked at. The live drawing draws through the runner's software GPU, which is slow, not wrong
// (J5-12). A size is a phone's when its short side is under 500px.

const SIZES = [
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 740],
  [320, 568],
  [844, 390],
  [667, 375],
  [280, 653],
  [1280, 600],
  [1180, 820],
  [820, 1180],
  [1920, 1080],
  [2560, 1440],
] as const;
const AT_200 = new Set(["1440×900", "1024×768", "390×844", "844×390"]);
/** Pages other than the landing that carry the full masthead: it is the same on every page, so it reflows on each. */
const OTHER_PAGES = ["/pre-booking", "/accuracy", "/watchlist", "/privacy"] as const;

/** Text at 200%, from before the page's first paint (the browser's own text-size setting, as the landing's spec sets it). */
const text200 = (page: Page) => page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));

/** Pieces pinned under the masthead stick at its height as drawn (--header-height, 4rem): a masthead taller than that
 * covers the top of every pinned piece for the whole of its pin (the drawing at 1024×768, text at 200%). */
async function mastheadOverPins(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.height = "var(--header-height)";
    document.body.append(probe);
    const pinsAt = probe.getBoundingClientRect().height;
    probe.remove();
    const masthead = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    const pinned = ["#anatomy.is-live", "#how.is-pinned", "#run.is-running"].filter((selector) => document.querySelector(selector));
    return masthead > pinsAt + 1 ? pinned.map((selector) => `the masthead (${Math.round(masthead)}px) covers ${selector}'s pin, which sticks at ${Math.round(pinsAt)}px`) : [];
  });
}

for (const [width, height] of SIZES) {
  const name = `${width}×${height}`;
  const phone = Math.min(width, height) < 500;
  test.describe(name, () => {
    test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone });

    test("nothing collides, top to bottom", async ({ page }) => {
      test.setTimeout(600_000);
      await gotoReady(page, "/");
      await waitForJourney(page);
      expect(await collisionsTopToBottom(page, { ...LANDING_INSTRUMENTS, step: 0.15 })).toEqual([]);
    });

    if (AT_200.has(name)) {
      test("nothing collides with its text at 200%", async ({ page }) => {
        test.setTimeout(600_000);
        await text200(page);
        await gotoReady(page, "/");
        await waitForJourney(page);
        // the drawing has decided: pinned live, or the still
        await expect(page.locator('html[data-drawing="still"], #anatomy.is-live')).not.toHaveCount(0, { timeout: 25_000 });
        expect(await mastheadOverPins(page)).toEqual([]);
        expect(await cutText(page), "text cut off").toEqual([]);
        expect(await collisionsTopToBottom(page, { ...LANDING_INSTRUMENTS, step: 0.15 })).toEqual([]);
      });

      test("the masthead reflows on every page with its text at 200%", async ({ page }) => {
        await text200(page);
        for (const path of OTHER_PAGES) {
          await gotoReady(page, path);
          expect([...(await collisionsInView(page)), ...(await cutText(page))], path).toEqual([]);
        }
      });
    }
  });
}
