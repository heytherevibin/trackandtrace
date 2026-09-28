import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { atRest, drawStill, frames, noAnchoring, readyTab, scrollToId, waitForJourney, waitForLive } from "./journey-helpers";

// A Tab stop's glide, taken up again (focus-glide.ts; WCAG 2.4.11; Task 6 review). The browser glides a Tab stop into the
// window, and an instant scroll that keeps the reader's place (the drawing falling to the still mid-glide) cancels it,
// stranding focus off-screen at rest: the glide is taken up once. Never against the reader (round 2): a reader who
// leaves mid-glide by a drag (no wheel, touch or key), or whom a mouse focused, stays where they are, whatever the layout
// does next. The link is 04's "Read the data policy", outside the window-seat run (run.spec holds the run's own).

const POLICY = "Read the data policy";
const policy = (page: Page) => page.locator("#reliability a", { hasText: POLICY });
/** Wholly in the window, below the masthead, and nothing painted over it. */
const inWindow = (page: Page) =>
  policy(page).evaluate((a) => {
    const r = a.getBoundingClientRect();
    const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= foot && r.bottom <= window.innerHeight && hit !== null && a.contains(hit);
  });
const principlesTop = (page: Page) => page.locator("#principles").evaluate((el) => el.getBoundingClientRect().top);

test.describe("a Tab stop's glide (spec §3.G; WCAG 2.4.11)", () => {
  test.skip(({ isMobile }) => isMobile, "the keyboard and a fine pointer: one project is enough");
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const anchoring of ["on", "off"] as const) {
    test.describe(`scroll anchoring ${anchoring}`, () => {
      test.beforeEach(async ({ page }) => {
        if (anchoring === "off") await noAnchoring(page);
      });

      test("reaches the window though the drawing above falls to the still mid-glide", async ({ page }) => {
        await page.goto("/");
        await waitForLive(page);
        await scrollToId(page, "record", 100); // past the drawn train; 04's link below the window
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY, "lost");
        await page.keyboard.press("Tab");
        await expect(policy(page)).toBeFocused();
        await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
        await atRest(page);
        expect(await inWindow(page), "the focused link is wholly in the window, below the masthead").toBe(true);
      });

      // A resize mid-glide (a window resized or zoomed, browser UI changing the height) makes 02's guard, the drawing and
      // the still keep the reader's place, and their instant scrolls cut the glide (round 3).
      for (const at of [2, 8]) {
        test(`reaches the window though it is resized ${at} frames into the glide`, async ({ page }) => {
          await drawStill(page); // the drawing held to the still, as the governor floors it on a slow GPU
          await page.goto("/");
          await waitForJourney(page);
          await scrollToId(page, "record", 100);
          await frames(page, 3);
          await readyTab(page, "#reliability", POLICY);
          await page.keyboard.press("Tab");
          await expect(policy(page)).toBeFocused();
          await frames(page, at);
          await page.setViewportSize({ width: 1440, height: 860 });
          await atRest(page, 15);
          await frames(page, 30); // the journey's own resize answer lands 150 ms later
          await atRest(page, 15);
          expect(await inWindow(page), "the focused link is wholly in the window, below the masthead").toBe(true);
        });
      }

      test("never pulls back a reader who dragged away mid-glide: a layout change and a resize leave them put", async ({ page }) => {
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        await scrollToId(page, "record", 100);
        await frames(page, 3);
        await readyTab(page, "#reliability", POLICY, "away");
        await page.keyboard.press("Tab");
        await expect(policy(page)).toBeFocused();
        await atRest(page);
        const before = await principlesTop(page);
        expect(before, "the drag left the reader at 01").toBeCloseTo(100, -1);
        await page.evaluate(() => window.dispatchEvent(new Event("tt:layout")));
        await frames(page, 5);
        await page.setViewportSize({ width: 1440, height: 880 });
        await atRest(page, 20);
        // 01 stays where the reader left it (a resize that changes the drawing above moves them by exactly its change)
        expect(Math.abs((await principlesTop(page)) - before)).toBeLessThanOrEqual(4);
      });

      test("never pulls back a reader whom a mouse focused: a click on a link cut off at the window's foot starts no glide", async ({ page }) => {
        await drawStill(page);
        await page.goto("/");
        await waitForJourney(page);
        // the link's foot below the window's; the click itself must not leave the page
        await page.evaluate((name) => {
          const link = [...document.querySelectorAll<HTMLAnchorElement>("#reliability a")].find((a) => a.textContent?.includes(name));
          if (!link) throw new Error("no data policy link");
          window.scrollTo({ top: link.getBoundingClientRect().top + window.scrollY - (window.innerHeight - 8), behavior: "instant" });
          link.addEventListener("click", (event) => event.preventDefault(), { once: true });
        }, POLICY);
        await frames(page, 3);
        const box = await policy(page).boundingBox();
        if (!box) throw new Error("the link is not laid out");
        await page.mouse.click(box.x + box.width / 2, box.y + 3);
        await expect(policy(page)).toBeFocused();
        await scrollToId(page, "principles", 100); // then a drag away
        await atRest(page);
        const before = await principlesTop(page);
        await page.evaluate(() => window.dispatchEvent(new Event("tt:layout")));
        await frames(page, 15);
        expect(Math.abs((await principlesTop(page)) - before)).toBeLessThanOrEqual(4);
      });
    });
  }
});
