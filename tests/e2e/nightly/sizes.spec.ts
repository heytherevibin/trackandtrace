import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
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
const AT_200 = new Set(["1440×900", "390×844", "844×390"]);
/** Pages other than the landing that carry the full masthead: it is the same on every page, so it reflows on each. */
const OTHER_PAGES = ["/pre-booking", "/accuracy", "/watchlist", "/privacy"] as const;

/** Text at 200%, from before the page's first paint (the browser's own text-size setting, as the landing's spec sets it). */
const text200 = (page: Page) => page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));

/** Words the window's edge cuts off: a line of text that runs past the window's side where the page clips it (the
 * sideways overflow the collision checker sees is the page scrolling instead). Clipped inside the page on purpose (a
 * wipe, a scroller, screen-reader-only text) is not cut by the window, and is left alone. Laid-out boxes, so it reads
 * the whole page from wherever it stands. */
async function cutAtTheEdge(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
      if (!own || el.closest(".sr-only, [aria-hidden='true'], svg, noscript") || !el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || (r.right <= vw + 1 && r.left >= -1)) continue;
      let clip: DOMRect | null = null;
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        if (getComputedStyle(n).overflowX !== "visible") {
          clip = n.getBoundingClientRect();
          break;
        }
      }
      if (clip && clip.right < vw - 1 && clip.left > 1) continue;
      found.push(`"${(el.textContent ?? "").trim().slice(0, 40)}" runs ${Math.round(Math.max(r.right - vw, -r.left))}px past the window`);
    }
    return found;
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
        expect(await cutAtTheEdge(page), "cut off at the window's edge").toEqual([]);
        expect(await collisionsTopToBottom(page, { ...LANDING_INSTRUMENTS, step: 0.15 })).toEqual([]);
      });

      test("the masthead reflows on every page with its text at 200%", async ({ page }) => {
        await text200(page);
        for (const path of OTHER_PAGES) {
          await gotoReady(page, path);
          expect([...(await collisionsInView(page)), ...(await cutAtTheEdge(page))], path).toEqual([]);
        }
      });
    }
  });
}
