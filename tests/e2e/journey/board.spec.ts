import { expect, test, type Page } from "@playwright/test";
import { frames, motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const statuses = (page: Page) => page.locator("#departures tbody td.board-status").allTextContents();
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

  // A section entrance, once per load (the owner, 2026-09-30): out of sight at load (the reader landed on 03; a board
  // in the window at load stays as the server drew it), the rows' names wait turned away, flip in the first time the
  // reader reaches the board, from above here, and never again this load. (The status column's own flips follow the
  // station, so only the names are watched.)
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
});
