import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { brokenWords, cutText } from "../layout";
import { LANDING_INSTRUMENTS, collisionsInView, collisionsTopToBottom } from "../journey/collisions";
import { waitForJourney } from "../journey/journey-helpers";
import { text200 } from "../text-200";

// Nightly (spec §5, §9; J6-13): the landing top to bottom, Motion on, at fifteen sizes, and with its text at 200% at five
// of them: the sizes every PR checks, and the narrowest common Android phone (360×740). The sweep is as dense as the
// PR's densest (collisions.spec.ts's sweep through 02 pinned: 0.15 of a window a step), here over the whole page, so
// every stop of the three pinned pieces (the drawing chapter, 02's dial, the run) is looked at. The live drawing draws
// through the runner's software GPU, which is slow, not wrong (J5-12). A size is a phone's when its short side is under
// 500px.

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
const AT_200 = new Set(["1440×900", "1024×768", "390×844", "360×740", "844×390"]);
/** Pages other than the landing that carry the full masthead: it is the same on every page, so it reflows on each. */
const OTHER_PAGES = ["/pre-booking", "/accuracy", "/watchlist", "/privacy"] as const;

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

/** The masthead is one row at every size the PR checks, text at 200% included: the menu, the mark and the controls, the
 * height every pinned piece sticks under (--header-height) and its hairline rule. */
async function mastheadRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.height = "var(--header-height)";
    document.body.append(probe);
    const row = probe.getBoundingClientRect().height;
    probe.remove();
    const masthead = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    return masthead > row + 1.5 ? [`the masthead is ${Math.round(masthead)}px tall, more than its one ${Math.round(row)}px row`] : [];
  });
}

/** Lists the trains on a route and opens the first one's run, as a reader does (hover, focus or a tap). */
async function openTrainRun(page: Page): Promise<void> {
  await page.getByLabel("From", { exact: true }).fill("SBC");
  await page.getByLabel("To", { exact: true }).fill("NDLS");
  await page.getByLabel("To", { exact: true }).blur();
  await page.getByLabel("Journey date").fill("2026-10-15");
  await page.getByRole("button", { name: "Find trains" }).click();
  await page.getByTestId("train-row").first().getByRole("button", { name: "This train's run", exact: true }).focus();
  const run = page.getByTestId("train-run");
  await expect(run).toBeVisible();
  // the whole run has arrived: its stops are drawn, not the four the search carried
  await expect(run.getByText("Reading the timetable…")).toHaveCount(0);
  await expect(run.getByRole("listitem")).not.toHaveCount(4);
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
        expect(await mastheadRows(page)).toEqual([]);
        expect(await cutText(page), "text cut off").toEqual([]);
        // the Updates by email band's heading stands outside <main>, between it and the footer
        expect(await brokenWords(page, "main h2, #updates h2"), "a heading's word broken").toEqual([]);
        expect(await collisionsTopToBottom(page, { ...LANDING_INSTRUMENTS, step: 0.15 })).toEqual([]);
      });

      test("the masthead reflows on every page with its text at 200%", async ({ page }) => {
        await text200(page);
        for (const path of OTHER_PAGES) {
          await gotoReady(page, path);
          expect([...(await collisionsInView(page)), ...(await cutText(page)), ...(await mastheadRows(page))], path).toEqual([]);
        }
      });

      // Text a reader opens, drawn only then: the route popover, and a signed-in traveller's account view and menu (the
      // fixture-mode run has no accounts, so /e2e/signed-in draws them with a long name and address).
      test("the route popover, the account view and the account menu keep every word with their text at 200%", async ({ page }) => {
        await text200(page);
        await gotoReady(page, "/pre-booking");
        await openTrainRun(page);
        expect(await cutText(page, '[data-testid="train-run"]'), "the route popover").toEqual([]);
        await gotoReady(page, "/e2e/signed-in");
        expect(await cutText(page, "main"), "the account view").toEqual([]);
        await page.getByTestId("account-menu").click();
        await expect(page.getByRole("menu")).toBeVisible();
        expect(await cutText(page, '[role="menu"]'), "the account menu").toEqual([]);
      });
    }
  });
}
