import { test } from "../fixtures";
import { expectAxeClean } from "../helpers";
import { motionOff, scrollToId, scrollToTerminus, stubSaveData, waitForJourney, waitForLive } from "./journey-helpers";

// The landing (Neubrutal v4) with its one journey stage, the terminus: clean wherever the reader stands, in both faces.
const POSITIONS: readonly (readonly [name: string, id: string | null])[] = [
  ["top", null],
  ["principles", "principles"],
  ["how it works", "how"],
  ["roadmap", "roadmap"],
  ["questions", "faq"],
  ["terminus", "terminus"],
];

test.describe("axe, while the journey runs", () => {
  for (const [name, id] of POSITIONS) {
    test(`clean at ${name}`, async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      if (id) await scrollToId(page, id, 40);
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

  for (const [name, id] of [
    ["the top", null],
    ["the terminus", "terminus"],
  ] as const) {
    test(`clean at Night, at ${name}`, async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
      await page.goto("/");
      await waitForJourney(page);
      if (id) await scrollToId(page, id, 40);
      await page.waitForTimeout(1_200);
      await expectAxeClean(page);
    });
  }

  test("clean at the terminus, live", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollToTerminus(page);
    await expectAxeClean(page);
  });

  test("clean on Data Saver, at the terminus", async ({ page }) => {
    await stubSaveData(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "terminus", 40);
    await page.waitForTimeout(1_200);
    await expectAxeClean(page);
  });
});
