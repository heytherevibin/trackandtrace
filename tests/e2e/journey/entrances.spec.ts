import { expect, test, type Page } from "@playwright/test";
import { frames, motionOff, scrollToId, transformOf, waitForJourney } from "./journey-helpers";

// Section entrances play once per section per page load (the owner, 2026-09-30, reverting 2026-09-25's replay): the
// first time the reader reaches a section, never again when they scroll back; a reload plays them again, and a rebuild
// (Motion off, then on) never replays one already played.

const RISEN = "none";
const ARMED = "matrix(1, 0, 0, 1, 0, 16)";
const recordRow = (page: Page) => page.locator("#record .blueprint").first();
const recordKicker = (page: Page) => page.locator("#record [data-flap]");

/** 03's first row's transform and its kicker's split count, every frame for `ms`: all a reader would have seen move. */
function watchRecord(page: Page, ms: number): Promise<{ readonly transforms: readonly string[]; readonly split: readonly number[] }> {
  return page.evaluate(
    (span) =>
      new Promise((done) => {
        const row = document.querySelector("#record .blueprint")!;
        const kicker = document.querySelector("#record [data-flap]")!;
        const transforms: string[] = [];
        const split: number[] = [];
        const start = performance.now();
        const look = () => {
          const t = getComputedStyle(row).transform;
          transforms.push(t === "matrix(1, 0, 0, 1, 0, 0)" ? "none" : t);
          split.push(kicker.children.length);
          if (performance.now() - start < span) requestAnimationFrame(look);
          else done({ transforms, split });
        };
        look();
      }),
    ms,
  );
}

/** Flips Motion the way a reader does, through the footer's own switch, clicked in the DOM so the page never scrolls. */
async function clickMotion(page: Page): Promise<void> {
  await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
}

/** Plays 03's entrance: out of sight at load (armed), then scrolled to, its rows rise and its kicker is whole again. */
async function play03(page: Page): Promise<void> {
  await expect.poll(() => transformOf(recordRow(page))).toBe(ARMED);
  await scrollToId(page, "record", 120);
  await expect.poll(() => transformOf(recordRow(page)), { timeout: 3_000 }).toBe(RISEN);
  await expect.poll(() => recordKicker(page).evaluate((el) => el.children.length), { timeout: 3_000 }).toBe(0);
}

/** Away from 03 (to the terminus) and back: nothing of 03 is offset or split at any frame, there or on the way back. */
async function expectNoReplay(page: Page): Promise<void> {
  await scrollToId(page, "terminus");
  await frames(page, 3);
  expect(await transformOf(recordRow(page))).toBe(RISEN);
  await scrollToId(page, "record", 120);
  const seen = await watchRecord(page, 1_200);
  expect(new Set(seen.transforms)).toEqual(new Set([RISEN]));
  expect(new Set(seen.split)).toEqual(new Set([0]));
}

test.describe("section entrances", () => {
  test.skip(({ isMobile }) => isMobile, "one viewport is enough for the mechanism; collisions cover phones");

  test("every row group the journey names exists", async ({ page }) => {
    await page.goto("/");
    for (const sel of ["#principles [role=row]", "#record .blueprint", "#reliability dl > div", "#roadmap li", "#features article", "#faq details"]) {
      await expect(page.locator(sel).first(), sel).toBeAttached();
    }
  });

  test("scrolled to, 03's rows rise", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await play03(page);
  });

  test("scrolled away and back, a section already played does not play again", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await play03(page);
    await expectNoReplay(page);
  });

  test("a reload plays it again", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await play03(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.reload();
    await waitForJourney(page);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await play03(page);
  });

  test("Motion off, then on: a section already played does not play again", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await play03(page);
    await scrollToId(page, "terminus");
    await clickMotion(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await frames(page, 3);
    await clickMotion(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
    await frames(page, 3);
    expect(await transformOf(recordRow(page))).toBe(RISEN);
    await expectNoReplay(page);
  });

  test("a section properly in view at start stays at rest, as the server drew it, and never plays", async ({ page }) => {
    await page.goto("/#record");
    await waitForJourney(page);
    const atLoad = await watchRecord(page, 600);
    expect(new Set(atLoad.transforms)).toEqual(new Set([RISEN]));
    expect(new Set(atLoad.split)).toEqual(new Set([0]));
    await expectNoReplay(page);
  });

  test("a jump past a section still plays it the first time it is seen, coming back up", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await expect.poll(() => transformOf(recordRow(page))).toBe(ARMED);
    await scrollToId(page, "faq");
    await frames(page, 3);
    expect(await transformOf(recordRow(page))).toBe(ARMED);
    await scrollToId(page, "record", 120);
    await expect.poll(() => transformOf(recordRow(page)), { timeout: 3_000 }).toBe(RISEN);
    await expect.poll(() => recordKicker(page).evaluate((el) => el.children.length), { timeout: 3_000 }).toBe(0);
  });

  test("a jump straight to a section never strands its rows", async ({ page }) => {
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect.poll(() => transformOf(page.locator("#faq details").first()), { timeout: 3_000 }).toBe("none");
  });

  test("a kicker's words are whole again after it flips", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus");
    await scrollToId(page, "record", 120);
    const kicker = recordKicker(page);
    await expect.poll(() => kicker.evaluate((el) => el.children.length), { timeout: 3_000 }).toBe(0);
    await expect(kicker).toHaveText(/The record you get/i);
  });

  test("Motion off: nothing is ever offset", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    const firstRow = page.locator("#principles [role=row]").first();
    await scrollToId(page, "terminus");
    await page.waitForTimeout(300);
    expect(await transformOf(firstRow)).toBe("none");
    await scrollToId(page, "principles", 120);
    expect(await transformOf(firstRow)).toBe("none");
  });
});
