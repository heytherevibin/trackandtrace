import { expect, test, type ElementHandle, type Page } from "@playwright/test";
import { JOURNEY_CHUNK_MARK } from "@/components/landing/journey/journey-mark";
import { collisionsInView } from "./collisions";
import { drawStill, motionOff, scrollToId, waitForJourney } from "./journey-helpers";

// A window too short for every stop of 02 to fit pinned below the masthead. The masthead is one row since the
// route strip became a left rail (2026-09-27), 32px shorter than with the strip's row, so 02 now fits pinned from
// about 340px tall at 1440 wide; 320 keeps the room below the masthead these tests were written for (263px then).
const TOO_SHORT_TO_PIN = { width: 1440, height: 320 } as const;
const PANELS = { panels: [".board", ".berth-plan", ".station-clock", ".route-map", ".chapter-card"], skip: [".hero-dial"] };

/** Waits for window.scrollY to stop moving: in-page anchors glide (base.css) once the journey has started
 * (before that, journey.css lands them instantly), and a glide can still be settling for several hundred ms
 * after its target first enters the viewport. */
async function waitForScrollSettled(page: Page): Promise<void> {
  let last = -1;
  for (let i = 0; i < 20; i++) {
    const y = await page.evaluate(() => window.scrollY);
    if (y === last) return;
    last = y;
    await page.waitForTimeout(100);
  }
}

/** Scrolls instantly so #how's top sits `by` px above the window's top (negative: below it), then lets the
 * place guard's scroll listener, a throttled task here, record the position. */
async function intoHow(page: Page, by: number): Promise<void> {
  await page.evaluate((px) => {
    const how = document.getElementById("how")!;
    window.scrollTo({ top: how.getBoundingClientRect().top + window.scrollY + px, behavior: "instant" });
  }, by);
  await page.waitForTimeout(300);
}

/** Waits for `count` of the page's own frames: a wait counted in rendering updates, never in wall time. */
async function frames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
        step(n);
      }),
    count,
  );
}

/** The footer's own Motion switch. These tests click it through the DOM (element.click()), never with
 * Playwright's click, which scrolls it into view first and would move the very reader they place. */
async function motionSwitch(page: Page): Promise<ElementHandle<HTMLElement | SVGElement>> {
  return (await page.getByRole("switch", { name: "Motion" }).elementHandle())!;
}

/** Flips Motion the way a reader does, through chooseMotion (use-motion.ts), without scrolling the page. */
async function clickMotionSwitch(page: Page): Promise<void> {
  await (await motionSwitch(page)).evaluate((el) => (el as HTMLElement).click());
}

/** How far #how's top is from its scroll-margin landing under the masthead. */
function howOffLanding(page: Page): Promise<number> {
  return page.locator("#how").evaluate((el) => Math.abs(el.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(el).scrollMarginTop)));
}

async function throughHow(page: Page, fractions: readonly number[]): Promise<string[]> {
  const found: string[] = [];
  for (const f of fractions) {
    await page.evaluate((frac) => {
      const how = document.getElementById("how")!;
      const top = how.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + (how.offsetHeight - window.innerHeight) * frac, behavior: "instant" });
    }, f);
    await page.waitForTimeout(250);
    found.push(...(await collisionsInView(page, PANELS)).map((c) => `@${f}: ${c}`));
  }
  return found;
}

test.describe("02 · the chapters, pinned", () => {
  test("holds under the masthead and plays its three stops as the page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    const headerBottom = await page.locator("header").evaluate((h) => Math.round(h.getBoundingClientRect().bottom));
    for (const [f, stop, card] of [[0.1, "0", "01 / 03"], [0.5, "1", "02 / 03"], [0.95, "2", "03 / 03"]] as const) {
      await page.evaluate((frac) => {
        const how = document.getElementById("how")!;
        window.scrollTo({ top: how.getBoundingClientRect().top + window.scrollY + (how.offsetHeight - window.innerHeight) * frac, behavior: "instant" });
      }, f);
      await expect(page.locator(`#how li[data-chapter="${stop}"]`)).toHaveClass(/is-current/);
      await expect(page.locator("#how .chapter-step-count")).toHaveText(card);
      const pinTop = await page.locator("#how .chapters-pin").evaluate((p) => Math.round(p.getBoundingClientRect().top));
      expect(Math.abs(pinTop - headerBottom)).toBeLessThanOrEqual(2);
    }
  });

  // Anime's smoothed scroll sync eases 02 toward the scroll only while its wake timer runs, 500 ms after each scroll
  // event; one frame longer than that ends it short (observers.ts keepUp). A slow device's stall, two frames after a
  // jump deep into 02: the busy loop is the stall itself, not a wait. The rail's marker stands at 02's drawn progress.
  test("a jump deep into 02 plays through to the scroll though a frame stalls past anime's wake (a slow device)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    await frames(page, 10);
    await page.evaluate(() => {
      const how = document.getElementById("how")!;
      window.scrollTo({ top: how.getBoundingClientRect().top + window.scrollY + (how.offsetHeight - window.innerHeight) * 0.9, behavior: "instant" });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const end = performance.now() + 700;
          while (performance.now() < end);
        }),
      );
    });
    // 02's progress by the scroll, as its observer reads it: from its top under the masthead to its foot at the window's
    const behind = () =>
      page.evaluate(() => {
        const how = document.getElementById("how")!;
        const top = how.getBoundingClientRect().top + window.scrollY;
        const start = top - Math.round(document.querySelector("header")!.getBoundingClientRect().height);
        const end = top + how.offsetHeight - window.innerHeight;
        const scrolled = Math.min(1, Math.max(0, (window.scrollY - start) / (end - start)));
        const drawn = Number.parseFloat(how.querySelector<HTMLElement>(".rail-marker")!.style.left) / 100;
        return Math.abs(scrolled - drawn);
      });
    await expect.poll(behind).toBeLessThanOrEqual(0.005);
  });

  test("never collides while it plays: desktop, short desktop, phone, and a phone on its side", async ({ page }) => {
    for (const size of [{ width: 1440, height: 900 }, { width: 1440, height: 600 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.goto("/");
      await waitForJourney(page);
      expect(await throughHow(page, [0, 0.2, 0.4, 0.6, 0.8, 1]), `${size.width}×${size.height}`).toEqual([]);
    }
  });

  test("Motion off: a plain section", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "how");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    await expect(page.locator("#how .chapters-instrument")).toBeHidden();
  });

  test("switching Motion keeps the reader where they were", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    await page.waitForTimeout(300);
    const headerBottom = await page.locator("header").evaluate((h) => Math.round(h.getBoundingClientRect().bottom));
    const target = headerBottom + 100;
    // The reader reads 03, a section below 02 with a box of its own: 06's box rides the pinned window-seat run, where its
    // top is not where the reader reads it (run.spec holds the run's own Motion switch).
    await scrollToId(page, "record", target);
    // No wait for the scroll's own "scroll" event: the place guard reads the reader's place as Motion changes,
    // whether or not a frame has delivered that event yet (the next test holds it to exactly that).
    await clickMotionSwitch(page);
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    // The collapse lands over two frames (the height, then the padding); a few more let any late move show.
    await frames(page, 6);
    let top = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - target)).toBeLessThanOrEqual(4);

    await clickMotionSwitch(page);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
    await frames(page, 6);
    // Motion re-enabling does not, by itself, re-pin #how here: the reader is still below its start (at
    // #record), and pinning is deferred until they scroll back above it (spec §3.A) — the point of that
    // deferral is exactly that this toggle must not grow #how under them, so nothing moves either way.
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    top = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - target)).toBeLessThanOrEqual(4);
  });

  test("a scroll and a Motion switch with no frame between them keep the reader where the scroll put them", async ({ page }) => {
    // What a slow device (or a loaded CI runner) does: the reader's last scroll has not yet reached a frame, so
    // its "scroll" event is still pending, when Motion collapses #how. That event then lands after the browser
    // has already moved scrollY for the collapse, so it reports the browser's move, never the reader's place.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    // The reader first settles well below 02, so the guard has a place below it on record.
    await scrollToId(page, "faq");
    await frames(page, 3);
    const headerBottom = await page.locator("header").evaluate((h) => Math.round(h.getBoundingClientRect().bottom));
    const target = headerBottom + 100;
    const toggle = await motionSwitch(page);
    await page.evaluate(
      ([by, sw]) => {
        const el = document.getElementById("record")!;
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - by, behavior: "instant" });
        (sw as HTMLElement).click();
      },
      [target, toggle] as const,
    );
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    // The collapse lands over two frames (the height, then the padding); a few more let any late move show.
    await frames(page, 6);
    const top = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - target)).toBeLessThanOrEqual(4);
  });

  test("a reader who scrolls away before the journey starts is left where they are", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Delays the one script chunk that carries the journey (found by its content, so its hashed name never
    // matters — the same mark blockJourneyChunk uses), instead of aborting it: the browser's own fragment
    // scroll for /#faq, and the reader's own scroll to #roadmap after it, both need time to happen before
    // the journey chunk finally loads and #how first pins.
    await page.route("**/_next/static/**/*.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes(JOURNEY_CHUNK_MARK)) await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ response, body });
    });
    await page.goto("/#faq");
    await expect(page.locator("#faq")).toBeInViewport();
    await waitForScrollSettled(page);
    const headerBottom = await page.locator("header").evaluate((h) => Math.round(h.getBoundingClientRect().bottom));
    const target = headerBottom + 100;
    await scrollToId(page, "roadmap", target);
    await waitForJourney(page);
    const top = await page.locator("#roadmap").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - target)).toBeLessThanOrEqual(4);
    // the live drawing's scene chunk may still be on its way through the route: let it go with the test
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("on /#faq, 02 never pins under the reader, and #faq stays where the link landed it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Records every moment #how carries .is-pinned, however briefly: a class added and removed within one task
    // shows up in the removal's old value.
    await page.addInitScript(() => {
      const w = window as unknown as { __howPinned: boolean };
      w.__howPinned = false;
      new MutationObserver((records) => {
        for (const r of records) {
          if (!(r.target instanceof Element) || r.target.id !== "how") continue;
          if (r.target.classList.contains("is-pinned") || /\bis-pinned\b/.test(r.oldValue ?? "")) w.__howPinned = true;
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    });
    await page.goto("/#faq");
    const faq = page.locator("#faq");
    const offLanding = () => faq.evaluate((el) => Math.abs(el.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(el).scrollMarginTop)));
    await expect.poll(offLanding).toBeLessThanOrEqual(4);
    await waitForJourney(page);
    await page.waitForTimeout(1000);
    expect(await offLanding()).toBeLessThanOrEqual(4);
    expect(await page.evaluate(() => (window as unknown as { __howPinned: boolean }).__howPinned)).toBe(false);
  });

  test("on /#record, the reader stays there: #anatomy settling into columns just above #how must never read as #how's own resize", async ({ page }) => {
    // #record sits immediately after #how, so landing here puts #how's own bottom edge only a sliver above
    // the window's top — the exact boundary the place guard's "was the reader inside #how" branch can
    // misjudge if it ever reacts to a delivery that was never #how's own resize (the bug this guards against).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#record");
    const record = page.locator("#record");
    const offLanding = () => record.evaluate((el) => Math.abs(el.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(el).scrollMarginTop)));
    await expect.poll(offLanding).toBeLessThanOrEqual(4);
    await waitForJourney(page);
    await page.waitForTimeout(1000);
    expect(await offLanding()).toBeLessThanOrEqual(4);
  });

  test.describe("coming back to the page", () => {
    test.skip(({ isMobile }) => isMobile, "the masthead's links, and a pinned 02 at 1440×900: wide screens");

    /** Settles once #how's pin, the drawing's columns and every compensating scroll have landed. */
    async function settled(page: Page): Promise<void> {
      await waitForJourney(page);
      await page.waitForTimeout(600);
      await waitForScrollSettled(page);
    }
    const topOf = (page: Page, id: string) => page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top);

    test("Back returns the reader to the section they left, though the pin no longer stands above it", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator("#how")).toHaveClass(/is-pinned/);
      await scrollToId(page, "record", 200);
      await page.waitForTimeout(300);
      const before = await topOf(page, "record");

      // A real Next <Link> in the masthead: a client navigation, so "/" unmounts and the journey tears down.
      await page.getByLabel("Primary").getByRole("link", { name: "Watchlist" }).click();
      await expect(page).toHaveURL(/\/watchlist/);
      await page.goBack();
      await expect(page).toHaveURL(/\/$/);
      await settled(page);
      expect(Math.abs((await topOf(page, "record")) - before)).toBeLessThanOrEqual(4);
    });

    test("a reload at a scroll position is left where the browser put it", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      // Records #record's top on every frame until the journey takes the page over: where the browser's own
      // restoration left the reader, before anything of the journey's could move them.
      await page.addInitScript(() => {
        const w = window as unknown as { __pre: number | null };
        w.__pre = null;
        const tick = () => {
          if (document.documentElement.getAttribute("data-journey") === "on") return;
          const el = document.getElementById("record");
          if (el) w.__pre = el.getBoundingClientRect().top;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.goto("/");
      await waitForJourney(page);
      await scrollToId(page, "record", 200);
      await page.waitForTimeout(300);
      await page.reload();
      await settled(page);
      const pre = await page.evaluate(() => (window as unknown as { __pre: number | null }).__pre);
      expect(pre).not.toBeNull();
      expect(Math.abs((await topOf(page, "record")) - (pre ?? 0))).toBeLessThanOrEqual(4);
    });

    test("a new visit through a link starts at the top, whatever place the last visit left", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await waitForJourney(page);
      await scrollToId(page, "record", 200);
      await page.waitForTimeout(300);
      await page.getByLabel("Primary").getByRole("link", { name: "Watchlist" }).click();
      await expect(page).toHaveURL(/\/watchlist/);
      await page.getByRole("link", { name: "Trakline" }).first().click();
      await expect(page).toHaveURL(/\/$/);
      await settled(page);
      expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(4);
    });
  });

  test("an anchor clicked on the board lands its section, and 02 stays pinned", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    await page.locator('.board a[href="#reliability"]').click();
    await page.waitForTimeout(300);
    await waitForScrollSettled(page);
    // The landing as the app defines it: the section's scroll-margin (base.css: the masthead's height and 1rem).
    const off = await page
      .locator("#reliability")
      .evaluate((el) => Math.abs(el.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(el).scrollMarginTop)));
    expect(off).toBeLessThanOrEqual(4);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
  });

  test("a window that grows tall enough never pins 02 while the reader is below it", async ({ page }) => {
    await page.setViewportSize(TOO_SHORT_TO_PIN);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    await scrollToId(page, "faq", 120);
    await page.waitForTimeout(300);
    const before = await page.locator("#faq").evaluate((el) => el.getBoundingClientRect().top);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    expect(await page.locator("#how").getAttribute("class")).not.toMatch(/is-pinned/);
    const after = await page.locator("#faq").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(4);
  });

  test("02 pins once the reader scrolls back above it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#faq");
    await waitForJourney(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
  });
  test("a window that turns wide and tall with the reader just inside a plain 02 keeps them at 02's start", async ({ page }) => {
    await page.setViewportSize(TOO_SHORT_TO_PIN);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    await intoHow(page, 60);
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.waitForTimeout(600);
    expect(await howOffLanding(page)).toBeLessThanOrEqual(4);
  });

  test("a pinned 02 that changes height below a reader above it never moves them", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await waitForJourney(page);
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.waitForTimeout(600);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    await intoHow(page, -100);
    // what the reader sees, not scrollY: the drawn train above may settle meanwhile, and keeps its reader in place by
    // scrolling with its own height change (drawing.ts)
    const howTop = () => page.evaluate(() => document.getElementById("how")?.getBoundingClientRect().top ?? Number.NaN);
    const before = await howTop();
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(600);
    expect(Math.abs((await howTop()) - before)).toBeLessThanOrEqual(4);
  });

  test("the device reducing motion mid-02 lands the reader at 02's start", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    const middle = await page.locator("#how").evaluate((el) => (el.getBoundingClientRect().height - window.innerHeight) / 2);
    await intoHow(page, middle);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(600);
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    expect(await howOffLanding(page)).toBeLessThanOrEqual(4);
  });

  // A turn keeps 02's shape: the reader stays the same fraction through it, where they once landed on its start (the
  // owner, 2026-09-29). Its range: from its landing (scroll-margin-top) to its foot at the window's foot.
  test("a phone turned upright with the reader inside a pinned 02 keeps them the same fraction through it", async ({ page }) => {
    const range = () =>
      page.locator("#how").evaluate((el) => {
        const r = el.getBoundingClientRect();
        const start = r.top + window.scrollY - Number.parseFloat(getComputedStyle(el).scrollMarginTop);
        return { start, end: r.bottom + window.scrollY - window.innerHeight, y: window.scrollY };
      });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    await intoHow(page, 60);
    const was = await range();
    const through = (was.y - was.start) / (was.end - was.start);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    const now = await range();
    expect(Math.abs(now.y - (now.start + through * (now.end - now.start)))).toBeLessThanOrEqual(4);
  });
});

// A reader whose web fonts land late: 02 judged whether it fits in the fallback's lines, which on a small phone are
// too tall for its stops, and nothing judged it again once the page's own type arrived, so 02 stayed a plain section
// though it fits. The journey announces tt:layout when the fonts land, and 02 measures again (final review, ruling).
test.describe("02 and fonts that land after it has decided", () => {
  test("pins once the page's own type arrives, though it could not in the fallback's", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    // the still, as the quality floor draws it: the live drawing's own wait for the fonts, and its pin, would announce
    // a layout of their own once the fonts land, and hide what this is about
    await drawStill(page);
    // how many frames since the page last announced tt:layout: the journey's own start has gone quiet
    await page.addInitScript(() => {
      let quiet = 0;
      window.addEventListener("tt:layout", () => (quiet = 0));
      const tick = () => {
        quiet += 1;
        Reflect.set(window, "__quiet", quiet);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    let land: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (land = resolve));
    await page.route("**/*.woff2", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForJourney(page);
    await expect.poll(() => page.evaluate(() => Number(Reflect.get(window, "__quiet")))).toBeGreaterThan(30);
    expect(await page.evaluate(() => document.fonts.status)).toBe("loading");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/); // decided in the fallback's lines
    land();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
  });
});
