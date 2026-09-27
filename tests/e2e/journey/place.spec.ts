import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { frames, scrollToId, waitForJourney } from "./journey-helpers";

// The places the journey keeps (J5-17, J5-19): a change of height above 02 (the live drawing pinning, J5) must never
// throw a reader inside 02 when Motion then goes off; and Back, Forward, Back finds the reader's place each time.
// And a reader who arrives below the drawn train stays put while the journey takes the page over.

interface Sample {
  readonly top: number;
  readonly y: number;
  /** drawing.ts has decided which drawing the page shows: only it writes data-drawing-why. */
  readonly decided: boolean;
  /** still.ts has settled the still's labels into their columns. */
  readonly columns: boolean;
}

/** From before the page's first script: scroll anchoring off (a browser without it would move the reader with any
 * change of height above them), and #id's top every frame. */
async function watchTop(page: Page, id: string): Promise<void> {
  await page.addInitScript((target) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("html { overflow-anchor: none; }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
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
});
