import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { REBUILD_EVENT } from "@/components/landing/journey/journey-events";
import { atRest, drawStill, frames, noAnchoring, pressTab, scrollToId, waitForJourney, waitForLive } from "./journey-helpers";

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

/** #id's top every frame from before the page's first script. */
async function watchTop(page: Page, id: string): Promise<void> {
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

  // What cancels a Back restore (J6-9; the owner, 2026-09-28 and 2026-09-29): the reader taking over. Space only where it
  // would scroll the page; Tab always (never Ctrl or Meta with it). The restore waits for the first build, which
  // pauses between its modules through scheduler.yield (pause.ts): these specs hold that pause, so the restore is
  // pending, press the key as a reader would, then let the build go on. (The pending window is wide without the hold too;
  // the hold makes it certain rather than likely. It replaces window.scheduler for the page, which nothing else here uses.)
  interface Hold {
    __ttHold?: boolean;
    __ttRelease?: () => void;
  }
  async function holdable(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const w = window as unknown as Hold;
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      w.__ttRelease = () => {
        w.__ttHold = false;
        open();
      };
      const held = Reflect.get(window, "scheduler") as { yield?: () => Promise<void> } | undefined;
      const real = held?.yield?.bind(held);
      Object.defineProperty(window, "scheduler", {
        configurable: true,
        value: { yield: () => (w.__ttHold ? gate : (real?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 0)))) },
      });
    });
  }
  /** Leaves "/" from 05 by a link and comes Back with the build held: the restore is pending, the listeners are up. */
  async function backHeld(page: Page): Promise<number> {
    await page.setViewportSize({ width: 1440, height: 900 });
    await holdable(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "record", 120);
    await frames(page); // the scroll has been sampled
    const before = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    await page.getByLabel("Primary").getByRole("link", { name: "Watchlist" }).click();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.evaluate(() => Reflect.set(window, "__ttHold", true));
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("data-journey", "on");
    return before;
  }
  async function release(page: Page): Promise<void> {
    await page.evaluate(() => (window as unknown as Hold).__ttRelease?.());
    // The journey says it has started only after the first build and the restore have run, in the same frame
    // (start-journey.ts: memory.restore(), then __ttJourneyStarted): a restore that was coming has landed by now.
    await waitForJourney(page);
    await frames(page, 2);
  }

  test("Back, then no key at all: the restore lands (the control for the tests that cancel it)", async ({ page }) => {
    const before = await backHeld(page);
    await release(page);
    expect(Math.abs((await recordTop(page)) - before)).toBeLessThanOrEqual(4);
  });

  test("Back, then Space on a focused control: the control acts, and the restore still lands", async ({ page }) => {
    const before = await backHeld(page);
    const theme = page.getByRole("banner").getByRole("button", { name: /^Theme:/ });
    const named = await theme.getAttribute("aria-label");
    await theme.evaluate((el) => el.focus({ preventScroll: true }));
    await page.keyboard.press("Space");
    await expect(theme).not.toHaveAttribute("aria-label", named ?? "");
    await release(page);
    expect(Math.abs((await recordTop(page)) - before)).toBeLessThanOrEqual(4);
  });

  test("Back, then Space on a focused link: it scrolls the page, so the restore is cancelled", async ({ page }) => {
    const before = await backHeld(page);
    const link = page.getByLabel("Primary").getByRole("link", { name: "Watchlist" });
    await link.evaluate((el) => el.focus({ preventScroll: true }));
    await page.keyboard.press("Space"); // the page scrolls a screen; the link is not followed
    await release(page);
    expect(Math.abs((await recordTop(page)) - before)).toBeGreaterThan(4); // not restored
  });

  test("Back, then Tab: the restore is cancelled, and focus stays in view", async ({ page }) => {
    const before = await backHeld(page);
    await pressTab(page);
    const focus = () =>
      page.evaluate(() => {
        const r = document.activeElement?.getBoundingClientRect();
        return r ? { top: r.top, bottom: r.bottom, height: window.innerHeight, body: document.activeElement === document.body } : null;
      });
    await release(page);
    const at = await focus();
    expect(at?.body).toBe(false);
    expect(at?.top).toBeGreaterThanOrEqual(0);
    expect(at?.bottom).toBeLessThanOrEqual(at?.height ?? 0);
    expect(Math.abs((await recordTop(page)) - before)).toBeGreaterThan(4); // not restored
  });

  test("Back, then Space with nothing focused: the restore is cancelled, as before", async ({ page }) => {
    const before = await backHeld(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Space"); // the page scrolls a screen
    await release(page);
    expect(Math.abs((await recordTop(page)) - before)).toBeGreaterThan(4); // not restored
  });

  // The journey marks the page as its own (data-journey="on") before drawing.ts, eleventh of the modules it starts a
  // turn at a time, has decided which drawing it shows, and still.ts then settles the still's columns. None of it may
  // move a reader who arrived below the chapter (an in-page link, a reload, Back), scroll anchoring or not: the still's
  // first settle judges them past the pin by readerPlace (J6-4), where it once moved #principles by 77 px.
  for (const anchoring of ["on", "off"] as const) {
    for (const id of ["principles", "record"] as const) {
      test(`a reader who arrives at #${id}, below the drawn train, stays put through the journey's start and the still's settle (scroll anchoring ${anchoring})`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        if (anchoring === "off") await noAnchoring(page);
        await watchTop(page, id);
        await page.goto(`/#${id}`);
        await waitForJourney(page);
        await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "place");
        await frames(page, 4); // anything the settle set going has had its turn
        const samples = await page.evaluate(() => (Reflect.get(window, "__ttTops") ?? []) as Sample[]);
        const landed = samples.findIndex((s) => s.y > 0); // the browser's jump to the fragment
        expect(landed, "the page never scrolled to the fragment").toBeGreaterThanOrEqual(0);
        const judged = samples.slice(landed);
        expect(judged.some((s) => s.decided), "the samples stop before drawing.ts decided").toBe(true);
        expect(judged.some((s) => s.columns), "the samples stop before the still settled its columns").toBe(true);
        const at = judged[0]!.top;
        const moved = judged.map((s) => s.top).filter((top) => Math.abs(top - at) > 4);
        expect(moved, `#${id} landed at ${at} px`).toEqual([]);
      });
    }
  }

  // A rebuild tears the live drawing down and builds the drawing again: to a reader below the chapter, the unpin and
  // the still's return are one change, kept in place together (J5-3), whether the browser anchors scroll or not; the
  // still's first columns settle then keeps them too (J6-4).
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
      offset: 120,
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

  // A rebuild tears the still down and starts its successor in one task. Columns cleared in between left the chapter
  // 304 px shorter for every layout the teardowns and starts forced meanwhile, and Linux WebKit's scroll anchoring moved
  // the reader for that collapse, never for the columns' return (the nightly, run 36406365173). Every class the pin
  // carries through the rebuild is read back (a MutationObserver sees a class removed and added back in one task).
  test("the still's columns stand through a Motion rebuild: no layout in between sees the chapter without them", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await drawStill(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);
    await page.evaluate(() => {
      const pin = document.querySelector("#anatomy .anatomy-pin");
      if (!pin) throw new Error("no .anatomy-pin");
      const classes: string[] = [];
      const watch = new MutationObserver((records) => classes.push(...records.map((r) => r.oldValue ?? "")));
      watch.observe(pin, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
      Reflect.set(window, "__ttPinClasses", () => [...classes, pin.className]);
    });
    await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await frames(page, 3);
    const classes = await page.evaluate(() => (Reflect.get(window, "__ttPinClasses") as () => string[])());
    expect(classes.filter((c) => !c.split(/\s+/).includes("is-columns")), classes.join(" | ")).toEqual([]);
  });

  // 02's last lines (J6-4): a reader whose window still shows 02's foot, #record's heading below it, is past 02 by
  // readerPlace, and stays on #record through a change of 02's height, where the window's top edge alone sent them back
  // 2,300–3,000 px to 02's start (J5 final re-review 2).
  const recordTop = (page: Page) => page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
  const changes = [
    {
      change: "Motion goes off",
      act: async (page: Page) => {
        await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
        await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
      },
    },
    { change: "the window gets shorter", act: (page: Page) => page.setViewportSize({ width: 1440, height: 700 }) },
  ] as const;
  for (const anchoring of ["on", "off"] as const) {
    for (const { change, act } of changes) {
      test(`a reader in 02's last lines stays on #record when ${change} (scroll anchoring ${anchoring})`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await drawStill(page);
        if (anchoring === "off") await noAnchoring(page);
        await page.goto("/");
        await waitForJourney(page);
        await expect(page.locator("#how")).toHaveClass(/is-pinned/);
        await scrollToId(page, "record", 120); // 02's foot 120px down the window
        await frames(page, 3); // the guard has learned the reader's place
        const before = await recordTop(page);
        await act(page);
        await frames(page, 6); // the collapse, its padding a frame later, the guard's and the still's settles
        const after = await recordTop(page);
        expect(Math.abs(after - before), `#record ${before} -> ${after}`).toBeLessThanOrEqual(4);
      });
    }
  }
});

// A resize keeps a reader inside a pinned 02 the same fraction of the way through it (the owner, 2026-09-29), where its
// start once took them back up to 2,472 px: the same chapter, and the scroll within a few px of where that fraction
// stands in the new window. Each size is judged against the one before it, and back again, scroll anchoring or not.
// The drawing above is held to the still: its own resizes are drawing.ts's, and live-drawing.spec.ts holds them.
/** 02's range as its timeline reads it: from its top under the masthead to its foot at the window's foot (the large
 * viewport's, which Playwright's window always is). */
const howRange = (page: Page) =>
  page.evaluate(() => {
    const how = document.getElementById("how");
    if (!how) throw new Error("#how is missing");
    const r = how.getBoundingClientRect();
    const start = r.top + window.scrollY - Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 0);
    return { start, end: r.bottom + window.scrollY - window.innerHeight, y: window.scrollY };
  });
/** A resize and everything it sets going have landed: 02's guard, its refit 200 ms on, and any late move. */
async function resizedTo(page: Page, size: { readonly width: number; readonly height: number }): Promise<void> {
  await page.setViewportSize(size);
  await frames(page, 20);
  await atRest(page);
}

test.describe("a resize keeps a reader inside a pinned 02 the same fraction through it", () => {
  for (const anchoring of ["on", "off"] as const) {
    for (const f of [0.25, 0.6, 0.9] as const) {
      test(`${f * 100}% through 02 (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
        const base = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
        const sizes = isMobile
          ? [{ width: 390, height: 804 }, { width: 390, height: 660 }, { width: 360, height: 844 }]
          : [{ width: 1440, height: 860 }, { width: 1440, height: 700 }, { width: 1200, height: 900 }];
        const chapter = page.locator(`#how li[data-chapter="${Math.floor(f * 3)}"]`);
        await page.setViewportSize(base);
        await drawStill(page);
        if (anchoring === "off") await noAnchoring(page);
        await page.goto("/");
        await waitForJourney(page);
        await expect(page.locator("#how")).toHaveClass(/is-pinned/);
        const at = await howRange(page);
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(at.start + f * (at.end - at.start)));
        await expect(chapter).toHaveClass(/is-current/);
        await frames(page, 3); // the guard has learned the reader's place
        for (const size of sizes.flatMap((s) => [s, base])) {
          const was = await howRange(page);
          const through = (was.y - was.start) / (was.end - was.start);
          await resizedTo(page, size);
          const now = await howRange(page);
          const target = now.start + through * (now.end - now.start);
          const where = `${size.width}×${size.height}: ${Math.round(through * 1000) / 10}% through was ${Math.round(target)}, the reader at ${now.y}`;
          await expect(page.locator("#how"), where).toHaveClass(/is-pinned/);
          expect(Math.abs(now.y - target), where).toBeLessThanOrEqual(4);
          await expect(chapter, where).toHaveClass(/is-current/);
        }
      });
    }
  }

  // A reader just past 02's end, its foot still in the window's lower half (inside by readerPlace), on its third stop:
  // turned on its side, the foot's distance from the window's top no longer fits the window, and keeping it sent them
  // back into 02, 54% through, on its second stop (review, I1). They stay at its end, or beyond it.
  test("a reader past 02's end stays at or beyond its end, on its last stop, when a phone turns on its side", async ({ page }) => {
    const last = page.locator('#how li[data-chapter="2"]');
    await page.setViewportSize({ width: 390, height: 844 });
    await drawStill(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    const at = await howRange(page);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(at.end + 60));
    await expect(last).toHaveClass(/is-current/);
    await frames(page, 3); // the guard has learned the reader's place
    await resizedTo(page, { width: 844, height: 390 });
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    const now = await howRange(page);
    expect(now.y, `02's end at ${Math.round(now.end)}`).toBeGreaterThanOrEqual(now.end - 2);
    await expect(last).toHaveClass(/is-current/);
  });
});
