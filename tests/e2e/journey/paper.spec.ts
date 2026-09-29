import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { frames, motionOff, waitForJourney, waitForLive } from "./journey-helpers";
import { STAGES, geometry, into, type Stage } from "./paper-helpers";

// The paper under a pinned stage (owner, 2026-09-30, option D). While 02, the live drawing or the window-seat run is
// pinned, the whole window's grain holds still with it, and it moves with the page again once the stage lets go. Each
// stage carries a full-bleed sheet of the page's grain (.pin-paper) that sticks exactly as its pin does, below the live
// drawing's canvas and the pin itself. The pins are the page frame's width, so the sheet reaches past them to the
// window's edges, and the page must not scroll sideways for it, even beside a classic scrollbar. With Motion off or
// reduced motion nothing pins, and nothing here changes the page.

async function ready(page: Page, stage: Stage): Promise<void> {
  await gotoReady(page, "/");
  if (stage.section === "#anatomy") await waitForLive(page);
  else await waitForJourney(page);
  await into(page, stage, 0.5);
  await expect(page.locator(stage.section)).toHaveClass(stage.pinned);
}

for (const [name, stage] of Object.entries(STAGES)) {
  test(`${name}: while pinned, a full-bleed sheet of grain holds still with the pin`, async ({ page }) => {
    await ready(page, stage);
    for (const p of [0.02, 0.5, 0.98]) {
      await into(page, stage, p);
      const g = await geometry(page, stage);
      expect(g.paper, "the stage has its paper").not.toBeNull();
      const paper = g.paper!;
      expect(paper.display).toBe("block");
      expect(paper.image).toMatch(/^url\("[^"]+"\)$/);
      // Edge to edge of the window, beyond the page frame the pin keeps to.
      expect(Math.abs(paper.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(paper.right - g.vw)).toBeLessThanOrEqual(1);
      // From under the masthead to the pin's own foot: the window below the masthead is paper.
      expect(paper.top).toBeLessThanOrEqual(g.masthead + 1);
      expect(Math.abs(paper.bottom - g.pin.bottom)).toBeLessThanOrEqual(1);
    }
    // Held: a little more scroll moves neither the pin nor its paper.
    await into(page, stage, 0.5);
    const before = await geometry(page, stage);
    await page.evaluate(() => window.scrollBy({ top: 24, behavior: "instant" }));
    await frames(page, 3);
    const after = await geometry(page, stage);
    // The page moved under it (by the scroll, or more if the journey kept the reader's place across a relayout)…
    expect(before.section.top - after.section.top).toBeGreaterThanOrEqual(23);
    await expect(page.locator(stage.section)).toHaveClass(stage.pinned);
    // …and the pin and its paper did not.
    expect(after.paper!.top).toBeCloseTo(before.paper!.top, 0);
    expect(after.pin.top).toBeCloseTo(before.pin.top, 0);
  });

  test(`${name}: the sheet takes hold and lets go in the same scroll as the pin, and stays in its section`, async ({ page }) => {
    await ready(page, stage);
    for (const [p, px] of [[0, -240], [0, -24], [0, -2], [0, 2], [0, 24], [1, -24], [1, -2], [1, 2], [1, 24], [1, 240]] as const) {
      await into(page, stage, p, px);
      const g = await geometry(page, stage);
      const where = `${p}${px >= 0 ? "+" : ""}${px}px`;
      expect(Math.abs(g.paper!.bottom - g.pin.bottom), `feet at ${where}`).toBeLessThanOrEqual(1);
      expect(g.paper!.top, `top at ${where}`).toBeGreaterThanOrEqual(g.section.top - 1);
      expect(g.paper!.bottom, `foot at ${where}`).toBeLessThanOrEqual(g.section.bottom + 1);
    }
  });

  test(`${name}: before it pins, the sheet moves with the page`, async ({ page }) => {
    await ready(page, stage);
    // The section's top well down the window: nothing is pinned yet, and a little scroll is only a scroll.
    await page.evaluate((sel) => {
      const section = document.querySelector<HTMLElement>(sel)!;
      window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.6, behavior: "instant" });
    }, stage.section);
    await frames(page, 3);
    const before = await geometry(page, stage);
    await page.evaluate(() => window.scrollBy({ top: 24, behavior: "instant" }));
    await frames(page, 3);
    const after = await geometry(page, stage);
    const moved = before.section.top - after.section.top;
    expect(Math.abs(moved - 24)).toBeLessThanOrEqual(1);
    expect(before.paper!.top - after.paper!.top).toBeCloseTo(moved, 0);
    expect(before.pin.top - after.pin.top).toBeCloseTo(moved, 0);
  });
}

for (const [how, arrange] of [
  ["Motion off", (page: Page) => motionOff(page)],
  ["reduced motion", (page: Page) => page.emulateMedia({ reducedMotion: "reduce" })],
] as const) {
  test(`${how}: nothing pins, and no sheet is drawn`, async ({ page }) => {
    await arrange(page);
    await gotoReady(page, "/");
    await waitForJourney(page);
    for (const id of ["how", "anatomy", "run"]) {
      await page.evaluate((target) => document.getElementById(target)?.scrollIntoView({ block: "start", behavior: "instant" }), id);
      await frames(page, 3);
      const state = await page.evaluate(() => ({
        papers: [...document.querySelectorAll(".pin-paper")].map((el) => getComputedStyle(el).display),
        pinned: document.querySelectorAll("#how.is-pinned, #anatomy.is-live, #run.is-running").length,
      }));
      expect(state.pinned).toBe(0);
      expect(state.papers).toEqual(["none", "none", "none"]);
    }
  });
}

