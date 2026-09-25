import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { PNR } from "../helpers";
import { motionOff, transformOf } from "./journey-helpers";

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

/** Fills the PNR only — on 390px this alone reveals the entry face's Clear button, growing it, which is
 * unrelated to the morph (the face never changes here). Height sampling must never straddle this. */
async function fill(page: Page): Promise<void> {
  await page.getByTestId("hero-instrument").getByRole("textbox").fill(PNR.cnf);
}

/** Clicks Run and waits for the record — the only span the morph itself runs across. */
async function clickRun(page: Page): Promise<void> {
  const plate = page.getByTestId("hero-instrument");
  await plate.getByRole("button", { name: /run/i }).click();
  const result = page.getByTestId("terminal-result");
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("data-kind", "ok");
}

async function run(page: Page): Promise<void> {
  await fill(page);
  await clickRun(page);
}

/** Every plate face's computed transform, sampled each frame from the first frame a face exists (the server's
 * markup, before hydration) until `ms` after the journey has taken the page over (so hydration and whatever
 * follows it are always inside the window, however slowly the dev server hydrates). Starts before the page's
 * own scripts. Identity is written as "none" however the browser spells it. */
async function faceTransformsFromFirstPaint(page: Page, ms = 600): Promise<string[]> {
  await page.addInitScript((span) => {
    const w = window as unknown as { __faces: string[]; __facesDone: boolean };
    w.__faces = [];
    w.__facesDone = false;
    let hydrated: number | null = null;
    const tick = () => {
      for (const face of document.querySelectorAll(".plate-morph > div")) {
        const t = getComputedStyle(face).transform;
        w.__faces.push(t === "matrix(1, 0, 0, 1, 0, 0)" ? "none" : t);
      }
      if (hydrated === null && document.documentElement.getAttribute("data-journey") === "on") hydrated = performance.now();
      if (hydrated === null || performance.now() - hydrated < span) requestAnimationFrame(tick);
      else w.__facesDone = true;
    };
    requestAnimationFrame(tick);
  }, ms);
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __facesDone: boolean }).__facesDone, null, { timeout: 20_000 });
  return page.evaluate(() => (window as unknown as { __faces: string[] }).__faces);
}

/** The hero face's vertical offset (px, from its computed matrix), sampled every frame for `ms` after `act`. */
async function riseDuring(page: Page, act: () => Promise<void>, ms = 900): Promise<number[]> {
  await page.evaluate((span) => {
    const w = window as unknown as { __rise: number[] };
    w.__rise = [];
    const end = performance.now() + span;
    const tick = () => {
      const face = document.querySelector('[data-testid="hero-instrument"] .plate-morph > div');
      if (face) w.__rise.push(new DOMMatrixReadOnly(getComputedStyle(face).transform).m42);
      if (performance.now() < end) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { __rise: number[] }).__rise);
}

test.describe("the plate morph", () => {
  test("Motion off: the first face never rises, from first paint on", async ({ page }) => {
    await motionOff(page);
    const transforms = await faceTransformsFromFirstPaint(page);
    expect(transforms.length).toBeGreaterThanOrEqual(10);
    expect(new Set(transforms)).toEqual(new Set(["none"]));
  });

  test("Motion on: the first face never rises either, from first paint on", async ({ page }) => {
    const transforms = await faceTransformsFromFirstPaint(page);
    expect(transforms.length).toBeGreaterThanOrEqual(10);
    expect(new Set(transforms)).toEqual(new Set(["none"]));
  });

  test("a change of face rises 8px with Motion on, and settles still", async ({ page }) => {
    await page.goto("/");
    await fill(page);
    const rise = await riseDuring(page, () => clickRun(page), 3_000);
    expect(Math.max(...rise)).toBeGreaterThan(1);
    expect(Math.max(...rise)).toBeLessThanOrEqual(8);
    expect(rise.at(-1)).toBe(0);
    expect(await transformOf(page.locator('[data-testid="hero-instrument"] .plate-morph > div'))).toBe("none");
  });

  test("Motion off: a change of face swaps at once, with no rise", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await fill(page);
    const rise = await riseDuring(page, () => clickRun(page), 3_000);
    expect(rise.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rise)).toEqual(new Set([0]));
  });

  test("the record grows out of the plate", async ({ page }) => {
    await page.goto("/");
    await fill(page);
    const heights = await heightsDuring(page, () => clickRun(page), 2_400);
    const final = heights.at(-1)!;
    const between = heights.filter((h) => h > heights[0]! + 2 && h < final - 2);
    expect(between.length).toBeGreaterThanOrEqual(3);
    expect(await page.locator('[data-testid="hero-instrument"] .plate-morph').evaluate((el) => (el as HTMLElement).style.height)).toMatch(/^(auto|)$/);
  });

  test("Motion off: the record appears at once", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await fill(page);
    const heights = await heightsDuring(page, () => clickRun(page), 2_400);
    const final = heights.at(-1)!;
    // Distinct values, not raw samples: the entry face's own running state (unrelated to the morph, still
    // its own face throughout) settles through one incidental plateau of its own before the result lands. A
    // real tween reads through dozens of distinct heights on its way; one incidental one is not that.
    const between = new Set(heights.filter((h) => h > heights[0]! + 2 && h < final - 2));
    expect(between.size).toBeLessThan(3);
  });

  test("checking another PNR morphs back, and the entry takes the caret", async ({ page }) => {
    await page.goto("/");
    await run(page);
    await page.getByRole("button", { name: /check another pnr/i }).click();
    await expect(page.getByTestId("hero-instrument").getByRole("textbox")).toBeFocused();
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
  });

  test("Motion off mid-morph ends at the new face's own height", async ({ page }) => {
    await page.goto("/");
    await run(page);
    // Mid-tween (420ms total): flip Motion off, the way the other journey specs do, then swap faces again
    // while the first tween is still in flight.
    await page.waitForTimeout(100);
    await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).click();
    await page.getByRole("button", { name: /check another pnr/i }).click();
    // Past the interrupted tween's own 420ms schedule, so any leftover write would have already landed.
    await page.waitForTimeout(1_000);
    const wrapper = page.locator('[data-testid="hero-instrument"] .plate-morph');
    expect(await wrapper.evaluate((el) => (el as HTMLElement).style.height)).toMatch(/^(auto|)$/);
    const box = await wrapper.boundingBox();
    const contentBox = await wrapper.locator(":scope > *").first().boundingBox();
    expect(Math.abs((box?.height ?? 0) - (contentBox?.height ?? 0))).toBeLessThanOrEqual(1);
  });
});
