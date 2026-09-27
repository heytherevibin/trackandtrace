import { expect, test } from "../fixtures";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { blockJourneyChunk, blockSceneChunk, drawStill, motionOff, scrollIntoChapter, scrollToId, stubSaveData, waitForJourney, waitForLive } from "./journey-helpers";

const drawn = (page: import("@playwright/test").Page) => page.locator("#anatomy .anatomy-still:not(.is-noscript) use[href]");

test.describe("every drawing mode draws the train (spec §4)", () => {
  test("Motion off: still, and the page says why", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still"); // the head script, before first paint
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "motion"); // still from the start: the live drawing is never asked for
    await expect(drawn(page).first()).toBeAttached();
  });

  test("Data Saver: still from the first paint", async ({ page }) => {
    await stubSaveData(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-saver", "on");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "saver");
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
    await expect(drawn(page).first()).toBeAttached();
    await expect(page.locator("html")).toHaveAttribute("data-journey", "on");
    if (!isMobile) await expect(page.locator("#how")).toHaveClass(/is-pinned/);
  });

  test("the session's quality floor: still, and three.js never downloaded", async ({ page }) => {
    const three = watchThree(page);
    await drawStill(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "quality");
    // A window is the assertion: a download that never starts has no state to wait on.
    await page.waitForTimeout(1_500);
    expect(three()).toEqual([]);
  });

  test("a reader landing below the chapter: still (place) until they come back above it", async ({ page }) => {
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "place");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await waitForLive(page);
  });
});
