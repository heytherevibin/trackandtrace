import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { LANDING_INSTRUMENTS, collisionsTopToBottom } from "../journey/collisions";
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
const AT_200 = new Set(["1440×900", "390×844", "844×390"]);

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
        await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));
        await gotoReady(page, "/");
        await waitForJourney(page);
        expect(await collisionsTopToBottom(page, { ...LANDING_INSTRUMENTS, step: 0.15 })).toEqual([]);
      });
    }
  });
}
