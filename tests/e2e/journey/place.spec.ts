import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { REBUILD_EVENT } from "@/components/landing/journey/journey-events";
import { frames, scrollToId, waitForJourney, waitForLive } from "./journey-helpers";

// The places the journey keeps (J5-17, J5-19): a change of height above 02 (the live drawing pinning, J5) must never
// throw a reader inside 02 when Motion then goes off; and Back, Forward, Back finds the reader's place each time.
// And a reader below the drawn train stays put while the journey takes the page over, and through a rebuild.

interface Sample {
  readonly top: number;
  readonly y: number;
  /** drawing.ts has decided which drawing the page shows: only it writes data-drawing-why. */
  readonly decided: boolean;
  /** still.ts has settled the still's labels into their columns. */
  readonly columns: boolean;
}

/** From before the page's first script: scroll anchoring off, as a browser without it would be, moving the reader with
 * any change of height above them that nothing compensates. */
async function noAnchoring(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("html { overflow-anchor: none; }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}

/** Scroll anchoring off (above), and #id's top every frame from before the page's first script. */
async function watchTop(page: Page, id: string): Promise<void> {
  await noAnchoring(page);
  await page.addInitScript((target) => {
    const samples: Sample[] = [];
    Reflect.set(window, "__ttTops", samples);
    const tick = () => {
      const el = document.getElementById(target);
      if (el) {
        const html = document.documentElement;
        const columns = document.querySelector(".anatomy-pin")?.classList.contains("is-columns") ?? false;
        samples.push({ top: Math.round(el.getBoundingClientRect().top), y: Math.round(window.scrollY), decided: html.hasAttribute("data-drawing-why"), columns });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, id);
}

test.describe("the reader's place", () => {
  test.skip(({ isMobile }) => isMobile, "02 pins on wide screens; one project is enough");

  test("a change above 02 never throws a reader inside it when Motion then goes off", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    // Something above 02 grows by two windows and says so, as the live drawing's pin will.
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = `${window.innerHeight * 2}px`;
      document.getElementById("principles")?.after(spacer);
      window.dispatchEvent(new Event("tt:layout"));
    });
    await frames(page); // the grown page has laid out (tt:layout's listeners ran inside dispatchEvent)
    const vh = page.viewportSize()?.height ?? 800;
    await scrollToId(page, "how", -Math.round(vh * 2.5)); // well inside 02, past where its stale box would end
    await frames(page); // the scroll event has reached the guard, which learns the reader's place from it
    // Through the DOM, never Playwright's click, which scrolls the footer's switch into view first and would carry
    // the reader past 02's end before Motion goes off (as chapters.spec.ts's switch does).
    await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/); // the collapse has happened
    await frames(page, 3); // its height, then its padding a frame later, then the guard's settle
    const [top, foot] = await page.evaluate(() => [document.getElementById("how")?.getBoundingClientRect().top ?? 0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0]);
    expect(Math.abs(top - foot)).toBeLessThanOrEqual(24); // at 02's own start (its scroll margin), not thrown past it
  });

  test("Back, Forward, then Back again finds the reader's place each time", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "record", 120);
    await frames(page); // the scroll has been sampled
    const before = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    const drift = async () => Math.abs((await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top)) - before);
    const away = page.getByLabel("Primary").getByRole("link", { name: "Watchlist" });
    await away.click();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect.poll(drift).toBeLessThanOrEqual(4); // the restore has landed
    await page.goForward();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect.poll(drift).toBeLessThanOrEqual(4);
  });

  // The journey marks the page as its own (data-journey="on") before drawing.ts, eleventh of the modules it starts a
  // turn at a time, has decided which drawing it shows; nothing in between may hide the still and collapse the chapter
  // under a reader who arrived below it (an in-page link, a reload, Back). #principles is judged up to that decision:
  // still.ts's first columns settle, next, moves a reader whose window still overlaps the chapter's foot (77 px here),
  // as it did before J5. #record, further down, is judged through the whole start and settle.
  for (const { id, through } of [
    { id: "principles", through: "drawing.ts's decision" },
    { id: "record", through: "the still's settle" },
  ] as const) {
    test(`a reader who arrives at #${id}, below the drawn train, stays put through ${through}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await watchTop(page, id);
      await page.goto(`/#${id}`);
      await waitForJourney(page);
      await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "place");
      await frames(page, 4); // anything the settle set going has had its turn
      const samples = await page.evaluate(() => (Reflect.get(window, "__ttTops") ?? []) as Sample[]);
      const landed = samples.findIndex((s) => s.y > 0); // the browser's jump to the fragment
      expect(landed, "the page never scrolled to the fragment").toBeGreaterThanOrEqual(0);
      const settled = samples.findIndex((s) => s.columns);
      const judged = samples.slice(landed, id === "principles" && settled >= 0 ? settled : samples.length);
      expect(judged.some((s) => s.decided), "the samples stop before drawing.ts decided").toBe(true);
      const at = judged[0]!.top;
      const moved = judged.map((s) => s.top).filter((top) => Math.abs(top - at) > 4);
      expect(moved, `#${id} landed at ${at} px`).toEqual([]);
    });
  }

  // A rebuild tears the live drawing down and builds the drawing again: to a reader below the chapter, the unpin and
  // the still's return are one change, kept in place together (J5-3), whether the browser anchors scroll or not. For the
  // fit rebuild the reader has the chapter's foot out of the window: with it still in view, still.ts's first columns
  // settle after a live drawing moves the reader 77 px, as it did before this rule (see the load case above).
  const principlesTop = (page: Page) => page.locator("#principles").evaluate((el) => el.getBoundingClientRect().top);
  const rebuilds = [
    {
      change: "Motion goes off",
      offset: 120,
      act: async (page: Page) => {
        // through the DOM: Playwright's click would scroll the footer's switch into view first
        await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
        await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
      },
    },
    {
      change: "a fit change rebuilds the journey",
      offset: 0,
      act: (page: Page) => page.evaluate((type) => window.dispatchEvent(new Event(type)), REBUILD_EVENT),
    },
  ] as const;
  for (const anchoring of ["on", "off"] as const) {
    for (const { change, offset, act } of rebuilds) {
      test(`a reader below the live drawing stays put when ${change} (scroll anchoring ${anchoring})`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        if (anchoring === "off") await noAnchoring(page);
        await page.goto("/");
        await waitForLive(page);
        await scrollToId(page, "principles", offset);
        await frames(page, 3); // the scroll has been heard: the live drawing's place, 02's guard
        const before = await principlesTop(page);
        await act(page);
        await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
        await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
        await frames(page, 6); // the new build's first layout pass and the still's settle
        const after = await principlesTop(page);
        expect(Math.abs(after - before), `#principles ${before} -> ${after}`).toBeLessThanOrEqual(4);
      });
    }
  }
});
