import { expect, test, type Page } from "@playwright/test";
import { messages } from "@/messages";
import { drawStill, frames, motionOff, movedFrames, resetMoved, scrollToId, waitForJourney, watchMotion } from "./journey-helpers";

const statuses = (page: Page) => page.locator("#departures tbody td.board-status").allTextContents();
/** The board's destinations, top to bottom: every station but the platform itself. */
const DESTINATIONS = Object.entries(messages.journey.stations)
  .filter(([id]) => id !== "top")
  .map(([, name]) => name);
const nameFlaps = (page: Page) => page.locator("#departures .board-name .flap-char").count();

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

  // A section entrance, once per load (the owner, 2026-09-30): out of sight at load (the reader landed on 03, below the
  // board), the rows' names wait turned away, flip in the first time the reader reaches the board, scrolling up to it
  // here, and never again this load. (The status column's own flips follow the station, so only the names are watched.)
  test("its rows flip in once, the first time the reader reaches it, and their words are whole again after", async ({ page }) => {
    await page.goto("/#record");
    await waitForJourney(page);
    await expect.poll(() => nameFlaps(page)).toBeGreaterThan(0);
    await scrollToId(page, "departures");
    await expect.poll(() => page.locator("#departures .flap-char").count(), { timeout: 6_000 }).toBe(0);
    await expect(page.locator("#departures .board-name a").first()).toHaveText("The train, drawn");
    await scrollToId(page, "terminus");
    await frames(page, 3);
    expect(await nameFlaps(page)).toBe(0);
    await scrollToId(page, "departures");
    const seen = await page.evaluate(
      () =>
        new Promise<number[]>((done) => {
          const counts: number[] = [];
          const start = performance.now();
          const look = () => {
            counts.push(document.querySelectorAll("#departures .board-name .flap-char").length);
            if (performance.now() - start < 1_200) requestAnimationFrame(look);
            else done(counts);
          };
          look();
        }),
    );
    expect(new Set(seen)).toEqual(new Set([0]));
  });

  // Loaded at the top of a desktop window, the board shows at the window's foot (609 of 800 px, 637 of 900): visible
  // when the journey starts, so its rows flip in right then, at load, like the headline (the owner, 2026-09-30), and
  // are never blank once they settle; then scrolled away and back, they never flip in again. Held to the still
  // drawing: the live one, loading just below the board, can stall a busy runner's page for seconds mid-flip, which is
  // the harness's, not the board's.
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ] as const) {
    test(`at ${width}×${height}, loaded at the top, its rows flip in at load, once`, async ({ page, isMobile }) => {
      test.skip(isMobile, "desktop windows");
      await drawStill(page);
      await watchMotion(page, "#departures .board-name .flap-char");
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await waitForJourney(page);
      await expect.poll(() => movedFrames(page), { timeout: 6_000 }).toBeGreaterThan(0);
      await expect.poll(() => page.locator("#departures .flap-char").count(), { timeout: 6_000 }).toBe(0);
      await expect(page.locator("#departures .board-name a")).toHaveText(DESTINATIONS);
      await resetMoved(page);
      await scrollToId(page, "terminus");
      await frames(page, 3);
      await scrollToId(page, "departures");
      await frames(page, 30);
      expect(await movedFrames(page)).toBe(0);
      await expect(page.locator("#departures .board-name a")).toHaveText(DESTINATIONS);
    });
  }

  test("loaded on the board, its rows flip in at load, once", async ({ page }) => {
    await drawStill(page);
    await watchMotion(page, "#departures .board-name .flap-char");
    await page.goto("/#departures");
    await waitForJourney(page);
    await expect.poll(() => movedFrames(page), { timeout: 6_000 }).toBeGreaterThan(0);
    await expect.poll(() => page.locator("#departures .flap-char").count(), { timeout: 6_000 }).toBe(0);
    await expect(page.locator("#departures .board-name a")).toHaveText(DESTINATIONS);
    await resetMoved(page);
    await scrollToId(page, "terminus");
    await frames(page, 3);
    await scrollToId(page, "departures");
    await frames(page, 30);
    expect(await movedFrames(page)).toBe(0);
  });

  // Mid-flip, each character turns in its own inline-block span; a span holding an ordinary space collapsed to nothing,
  // so "The train, drawn" ran together as "THETRAIN,DRAWN". Watched from the first frame: at every frame of the load's
  // flip, every space in a multi-word destination keeps its width. Settled, the row is the plain words again, named
  // with ordinary spaces: the flip is presentational.
  test("mid-flip, a destination's spaces never collapse; settled, it is the plain words", async ({ page, isMobile }) => {
    test.skip(isMobile, "the desktop load's flip; the mechanism is the same on a phone");
    await drawStill(page);
    await page.addInitScript(() => {
      const seen = { frames: 0, spaces: 0, narrowest: Number.POSITIVE_INFINITY };
      Reflect.set(window, "__ttSpaces", seen);
      const look = () => {
        for (const a of document.querySelectorAll<HTMLElement>("#departures .board-name a")) {
          const label = a.getAttribute("aria-label");
          const chars = a.querySelectorAll(".flap-char");
          if (!label || chars.length !== label.length) continue;
          seen.frames += 1;
          [...label].forEach((c, i) => {
            if (c !== " ") return;
            seen.spaces += 1;
            seen.narrowest = Math.min(seen.narrowest, chars[i]!.getBoundingClientRect().width);
          });
        }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect.poll(() => page.locator("#departures .flap-char").count(), { timeout: 6_000 }).toBe(0);
    const seen = await page.evaluate(() => Reflect.get(window, "__ttSpaces") as { frames: number; spaces: number; narrowest: number });
    expect(seen.frames, "frames with a destination mid-flip").toBeGreaterThan(0);
    expect(seen.spaces, "spaces measured mid-flip").toBeGreaterThan(0);
    expect(seen.narrowest, "the narrowest space mid-flip, px").toBeGreaterThan(2);

    const names = page.locator("#departures .board-name a");
    await expect(names).toHaveText(DESTINATIONS);
    const settled = await names.evaluateAll((els) => els.map((el) => ({ text: el.textContent, label: el.getAttribute("aria-label") })));
    expect(settled.map((s) => s.text)).toEqual(DESTINATIONS);
    expect(settled.every((s) => s.label === null)).toBe(true);
    for (const name of DESTINATIONS) await expect(page.getByRole("link", { name, exact: true }).first()).toBeAttached();
  });
});
