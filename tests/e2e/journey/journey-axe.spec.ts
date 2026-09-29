import { expect, test } from "../fixtures";
import { expectAxeClean } from "../helpers";
import { drawStill, motionOff, scrollIntoChapter, scrollIntoRun, scrollToId, stubSaveData, waitForJourney, waitForLive } from "./journey-helpers";

const POSITIONS: readonly (readonly [name: string, id: string | null, fraction?: number])[] = [
  ["top", null],
  ["chapters, midway", "how", 0.5],
  ["record", "record"],
  ["roadmap", "roadmap"],
  ["drawing", "anatomy"],
  ["terminus", "terminus"],
];

test.describe("axe, while the journey runs", () => {
  for (const [name, id, fraction] of POSITIONS) {
    test(`clean at ${name}`, async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      if (id && fraction !== undefined) {
        await page.evaluate(([target, f]) => {
          const s = document.getElementById(target)!;
          window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY + (s.offsetHeight - window.innerHeight) * f, behavior: "instant" });
        }, [id, fraction] as const);
      } else if (id) await scrollToId(page, id, 40);
      await page.waitForTimeout(1_200);
      await expectAxeClean(page);
    });
  }

  for (const [name, night] of [
    ["the run, midway", false],
    ["Night, at the run, midway", true],
  ] as const) {
    test(`clean at ${name}`, async ({ page }) => {
      if (night) await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
      await drawStill(page);
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator("#run")).toHaveClass(/is-running/);
      await scrollIntoRun(page, 0.5);
      await expect(page.locator("#run [data-station].is-here")).toHaveCount(1);
      await expectAxeClean(page);
    });
  }

  test("clean with Motion off", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await expectAxeClean(page);
  });

  test("clean at Night, at the top", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForJourney(page);
    await page.waitForTimeout(1_200);
    await expectAxeClean(page);
  });

  test("clean at Night, at the drawing", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "anatomy", 40);
    await page.waitForTimeout(1_200);
    await expectAxeClean(page);
  });

  test("clean at Night, at the terminus", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus", 40);
    await page.waitForTimeout(1_200);
    await expectAxeClean(page);
  });

  test("clean at the drawing, live, with its labels out", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    // out: every label has wiped in whole
    await expect.poll(() => page.locator("#anatomy .callout").evaluateAll((els) => els.every((el) => getComputedStyle(el).clipPath === "none"))).toBe(true);
    await expectAxeClean(page);
  });

  test("clean at Night, at the drawing, live, with its labels out", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    await expect.poll(() => page.locator("#anatomy .callout").evaluateAll((els) => els.every((el) => getComputedStyle(el).clipPath === "none"))).toBe(true);
    await expectAxeClean(page);
  });

  test("clean on Data Saver, at the drawing", async ({ page }) => {
    await stubSaveData(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "anatomy", 40);
    await page.waitForTimeout(1_200);
    await expectAxeClean(page);
  });
});
