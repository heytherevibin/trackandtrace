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
      // To the pin's foot, and on past it by as much as a phone's toolbar can give back (100lvh − 100svh), so the strip
      // a collapsing toolbar opens is paper too; the section clips that overhang, so it never shows past the stage.
      expect(Math.abs(paper.bottom - g.toolbar - g.pin.bottom)).toBeLessThanOrEqual(1);
      expect(g.section.overflowY).toBe("clip");
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
      expect(Math.abs(g.paper!.bottom - g.toolbar - g.pin.bottom), `feet at ${where}`).toBeLessThanOrEqual(1);
      expect(g.paper!.top, `top at ${where}`).toBeGreaterThanOrEqual(g.section.top - 1);
      expect(g.paper!.bottom - g.toolbar, `foot at ${where}`).toBeLessThanOrEqual(g.section.bottom + 1);
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


// Short windows, where the pins' own minimum heights take over from the window's (the drawing's 520px at 1280×560, and
// the list and the phone on its side): the sheet must end where each pin ends, whichever rule sizes the pin.
for (const size of [{ width: 1280, height: 560 }, { width: 390, height: 560 }, { width: 844, height: 390 }] as const) {
  test(`${size.width}×${size.height}: every stage that pins keeps its sheet's foot at the pin's`, async ({ page, isMobile }) => {
    test.skip(isMobile, "sizes are set here");
    await page.setViewportSize(size);
    await gotoReady(page, "/");
    await waitForLive(page);
    const pinned: string[] = [];
    for (const [name, stage] of Object.entries(STAGES)) {
      await into(page, stage, 0.5);
      const on = await page.locator(stage.section).evaluate((el, cls) => new RegExp(cls).test(el.className), stage.pinned.source);
      if (!on) continue;
      pinned.push(name);
      const g = await geometry(page, stage);
      expect(Math.abs(g.paper!.bottom - g.toolbar - g.pin.bottom), `${name}: feet`).toBeLessThanOrEqual(1);
      expect(g.paper!.top, `${name}: top`).toBeLessThanOrEqual(g.masthead + 1);
    }
    // 02 and the drawing pin at all three; the run needs its stations to fit, which a phone on its side does not give it.
    expect(pinned).toEqual(expect.arrayContaining(["02", "the drawing"]));
  });
}

// The sheet takes no pointer: a press in the margin beside a pinned stage lands on the page beneath it.
for (const [name, stage] of Object.entries(STAGES)) {
  test(`${name}: a press through the sheet reaches what is beneath it`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the pins fill a phone's width: no margin to press in");
    await ready(page, stage);
    const at = await page.evaluate((sel) => {
      const header = document.querySelector("header")!.getBoundingClientRect().bottom;
      const x = 6;
      const y = Math.round((header + window.innerHeight) / 2);
      const hit = document.elementFromPoint(x, y);
      const paper = document.querySelector(`${sel} > .pin-paper`);
      window.addEventListener("pointerdown", (e) => Reflect.set(window, "__paperHit", (e.target as Element | null)?.getAttribute("class") ?? ""), { once: true, capture: true });
      return { x, y, hitsPaper: !!hit && !!paper && (hit === paper || paper.contains(hit)) };
    }, stage.section);
    expect(at.hitsPaper).toBe(false);
    await page.mouse.click(at.x, at.y);
    expect(await page.evaluate(() => Reflect.get(window, "__paperHit") as string)).not.toContain("pin-paper");
  });
}

// A phone's toolbar collapsing mid-pin makes the window taller. This browser cannot collapse one (its 100svh and 100lvh
// are the same height), so a resize stands in for it: the window grows under a pinned stage, and the sheet still reaches
// the window's foot, still held. The toolbar case itself rests on the sizing (100lvh, pinned by the CSS contract test).
for (const [name, stage] of Object.entries(STAGES)) {
  test(`${name}: when the window grows under the pin, the sheet still reaches its foot`, async ({ page, viewport }) => {
    await ready(page, stage);
    const base = viewport ?? { width: 1280, height: 800 };
    await page.setViewportSize({ width: base.width, height: base.height + 90 });
    await into(page, stage, 0.5);
    await expect(page.locator(stage.section)).toHaveClass(stage.pinned);
    const g = await geometry(page, stage);
    const tall = await page.evaluate(() => window.innerHeight);
    expect(g.paper!.bottom).toBeGreaterThanOrEqual(Math.min(tall, g.pin.bottom) - 1);
    expect(g.paper!.top).toBeLessThanOrEqual(g.masthead + 1);
  });
}
