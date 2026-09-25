import { expect, test, type Page } from "@playwright/test";
import { PNR } from "../helpers";
import { motionOff } from "./journey-helpers";

/** Samples the morph's height every frame for `ms` after `act`. */
async function heightsDuring(page: Page, act: () => Promise<void>, ms = 900): Promise<number[]> {
  await page.evaluate((span) => {
    const w = window as unknown as { __heights: number[] };
    w.__heights = [];
    const el = document.querySelector('[data-testid="hero-instrument"] .plate-morph')!;
    const end = performance.now() + span;
    const tick = () => {
      w.__heights.push(Math.round(el.getBoundingClientRect().height));
      if (performance.now() < end) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { __heights: number[] }).__heights);
}

async function run(page: Page): Promise<void> {
  const plate = page.getByTestId("hero-instrument");
  await plate.getByRole("textbox").fill(PNR.cnf);
  await plate.getByRole("button", { name: /run/i }).click();
  await expect(page.getByTestId("terminal-result")).toBeVisible();
}

test.describe("the plate morph", () => {
  test("the record grows out of the plate", async ({ page }) => {
    await page.goto("/");
    const heights = await heightsDuring(page, () => run(page), 2_400);
    const final = heights.at(-1)!;
    const between = heights.filter((h) => h > heights[0]! + 2 && h < final - 2);
    expect(between.length).toBeGreaterThanOrEqual(3);
    expect(await page.locator('[data-testid="hero-instrument"] .plate-morph').evaluate((el) => (el as HTMLElement).style.height)).toMatch(/^(auto|)$/);
  });

  test("Motion off: the record appears at once", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    const heights = await heightsDuring(page, () => run(page), 2_400);
    const final = heights.at(-1)!;
    expect(heights.filter((h) => h > heights[0]! + 2 && h < final - 2)).toEqual([]);
  });

  test("checking another PNR morphs back, and the entry takes the caret", async ({ page }) => {
    await page.goto("/");
    await run(page);
    await page.getByRole("button", { name: /check another pnr/i }).click();
    await expect(page.getByTestId("hero-instrument").getByRole("textbox")).toBeFocused();
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
  });
});
