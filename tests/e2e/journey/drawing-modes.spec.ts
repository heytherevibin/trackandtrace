import { expect, test } from "../fixtures";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { blockJourneyChunk, blockSceneChunk, drawStill, frames, motionOff, scrollIntoChapter, scrollToId, stubSaveData, waitForJourney, waitForLive } from "./journey-helpers";

const drawn = (page: import("@playwright/test").Page) => page.locator("#anatomy .anatomy-still:not(.is-noscript) use[href]");

/** Every script response carrying three.js; its renderer's own message text survives minification. */
function watchThree(page: import("@playwright/test").Page): () => readonly string[] {
  const seen: string[] = [];
  page.on("response", async (r) => {
    if (!r.url().endsWith(".js")) return;
    try {
      if ((await r.text()).includes("THREE.WebGLRenderer")) seen.push(r.url());
    } catch {
      // a body the browser already let go of
    }
  });
  return () => seen;
}

test.describe("every drawing mode draws the train (spec §4)", () => {
  test("Motion off: still, the page says why, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await motionOff(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still"); // the head script, before first paint
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "motion"); // still from the start: the live drawing is never asked for
    await expect(drawn(page).first()).toBeAttached();
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("Data Saver: still from the first paint, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await stubSaveData(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-saver", "on");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "saver");
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("a journey that never loads still draws the train, and never touches Motion", async ({ page }) => {
    test.setTimeout(40_000);
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 20_000 });
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
    await expect(drawn(page).first()).toBeAttached();
  });

  test("a live page never fetches a still file", async ({ page }) => {
    const fetched: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/journey/")) fetched.push(r.url());
    });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.5);
    await scrollToId(page, "terminus");
    // the terminus has drawn live: every stage this page shows has been drawn, and none asked for a still
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked(".terminus-stage") ?? 0)).toBeGreaterThan(0.002);
    expect(fetched).toEqual([]);
  });

  test("a page without JavaScript draws the train from its noscript copy, the wide shape only (§3.H's budget)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    const shape = STILL_MANIFEST.shapes.anatomyWide;
    await expect(page.locator(`#anatomy .is-noscript use[href="${shape.href}#shell"]`)).toBeAttached();
    await expect(page.locator("#anatomy .anatomy-still:not(.is-noscript)")).toBeHidden();
    await context.close();
  });

  test.describe("on a phone without JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    test.skip(({ isMobile }) => !isMobile, "the wide shape is hidden below 48rem only for the scripted copy; phones only");

    test("the noscript copy still shows the drawn train, with a real box", async ({ page }) => {
      await page.goto("/");
      for (const svg of [page.locator("#anatomy .is-noscript svg"), page.locator("#terminus .is-noscript svg")]) {
        await expect(svg).toBeVisible();
        const box = await svg.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(0);
        expect(box?.height ?? 0).toBeGreaterThan(0);
      }
    });
  });

  test("the terminus draws the arrived train still above the closing plate", async ({ page }) => {
    await drawStill(page); // live, it is live-drawing.spec's
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#terminus .terminus-still:not(.is-noscript) use[href]").first()).toBeAttached();
  });
});

test.describe("J5: every reason not to draw live (spec §3.C, §4)", () => {
  test("reduced motion: still, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "motion");
    // A window is the assertion: nothing is asked for, so there is no state to wait on; 1.5 s is longer than a
    // prepare would take to start the scene's import.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("no WebGL: still from the start, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
        return id === "webgl2" ? null : Reflect.apply(real, this, [id, ...rest]);
      } as typeof real;
    });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "webgl");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await expect(drawn(page).first()).toBeAttached();
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("the GPU drops the context: still at once, and live again when it is restored", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await page.evaluate(() => {
      const lose = document.querySelector<HTMLCanvasElement>("#journey-canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context");
      if (!lose) throw new Error("no WEBGL_lose_context");
      Reflect.set(window, "__lose", lose);
      lose.loseContext();
    });
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "webgl");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await expect(drawn(page).first()).toBeAttached();
    await page.evaluate(() => {
      // WEBGL_lose_context is an interface in lib.dom, not a constructor, so the extension is narrowed by its method.
      const lose: unknown = Reflect.get(window, "__lose");
      const restore: unknown = typeof lose === "object" && lose !== null ? Reflect.get(lose, "restoreContext") : undefined;
      if (typeof restore !== "function") throw new Error("no restoreContext");
      Reflect.apply(restore, lose, []);
    });
    await waitForLive(page);
  });

  test("the scene chunk blocked: still (load), and everything else keeps moving", async ({ page, isMobile }) => {
    await blockSceneChunk(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "load", { timeout: 25_000 });
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await expect(drawn(page).first()).toBeAttached();
    await expect(page.locator("html")).toHaveAttribute("data-journey", "on");
    if (!isMobile) await expect(page.locator("#how")).toHaveClass(/is-pinned/);
  });

  // A font request that never answers leaves document.fonts loading for good: the fit judgement waits for it only so
  // long, and the scene's 20 s limit counts that wait in, so the chapter always decides (re-review, N1).
  test("web fonts that never arrive: the chapter still decides, live or still with its reason", async ({ page }) => {
    await page.route("**/*.woff2", () => undefined); // never answered
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForJourney(page);
    expect(await page.evaluate(() => document.fonts.status)).toBe("loading"); // the stall holds
    const decided = () => page.evaluate(() => document.querySelector("#anatomy.is-live") !== null || (document.documentElement.dataset.drawingWhy ?? "") !== "");
    await expect.poll(decided, { timeout: 25_000 }).toBe(true);
  });

  test("the session's quality floor: still, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await drawStill(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "quality");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("words too large for the window, even as a list: still (fit), and three.js never downloaded (J6-5)", async ({ page }) => {
    const three = watchThree(page);
    // A phone with its text at 200%: the lead and the parts list leave the drawing less than its 150px (spec §3.C).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));
    await page.goto("/");
    await waitForJourney(page);
    // judged before the scene is fetched: the pinned layout, laid out for an instant and put back
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "fit");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await expect(drawn(page).first()).toBeAttached();
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  // Motion turned back on rebuilds the journey, and the drawing judges fit (J6-5) while the still's columns, handed over
  // to its own successor (still.ts), still stand on the pin. Their rules hid the parts list the live list layout
  // measures, so a chapter that fits as a list read as too tall: still (fit) for the session (nightly review, I-1).
  for (const text of ["140%", "150%"] as const) {
    test(`Motion turned back on judges fit as a fresh load does: a short window with text at ${text}`, async ({ page, browser, isMobile }) => {
      test.skip(isMobile, "the still's columns stand on wide screens only");
      const size = { width: 1440, height: 640 };
      const scaled = (p: import("@playwright/test").Page) => p.addInitScript((v) => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", v)), text);
      await page.setViewportSize(size);
      await scaled(page);
      await page.goto("/");
      await waitForJourney(page);
      const fresh = await page.locator("html").getAttribute("data-drawing-why");
      expect(fresh, "a fresh load at this size fits the chapter (as a list)").not.toMatch(/fit/);
      const context = await browser.newContext({ viewport: size, userAgent: await page.evaluate(() => navigator.userAgent) });
      const again = await context.newPage();
      await motionOff(again);
      await scaled(again);
      await again.goto("/");
      await waitForJourney(again);
      await expect(again.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/); // the still's columns stand
      await again.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
      await expect(again.locator("html")).toHaveAttribute("data-motion", "on");
      await expect(again.locator("html")).toHaveAttribute("data-drawing-why", fresh ?? "");
      await context.close();
    });
  }

  test("a reader landing below the chapter: still (place) until they come back above it", async ({ page }) => {
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "place");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await waitForLive(page);
  });

  // The same reader, on a slow device: 02 pinned (its refit, or a "resize") after their jump to the top and before that
  // scroll's own event was told, so 02's guard still held them below it, judged them past it, and threw them back down
  // by the pin's growth, where the drawing stays still (1 run in 30 at 6× CPU). Forced here: a "resize" in the scroll's
  // own task has 02 decide before the scroll event.
  test("a reader who jumps to the top from below stays there, though 02 pins before their scroll is told", async ({ page }) => {
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "place");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      window.dispatchEvent(new Event("resize"));
    });
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    await frames(page, 6); // the scroll's event, and 02's guard's answer to the pin
    expect(await page.evaluate(() => window.scrollY), "the reader is still at the top").toBeLessThanOrEqual(4);
    await waitForLive(page);
  });
});
