import { test } from "../fixtures";
import { expectAxeClean } from "../helpers";
import { motionOff, scrollToId, stubSaveData, waitForJourney } from "./journey-helpers";

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

  test("clean on Data Saver, at the drawing", async ({ page }) => {
    await stubSaveData(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "anatomy", 40);
    await page.waitForTimeout(1_200);
    await expectAxeClean(page);
  });
});
