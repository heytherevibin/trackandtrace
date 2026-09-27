import { expect, test } from "../fixtures";
import { JOURNEY_CHUNK_MARK } from "@/components/landing/journey/journey-mark";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { blockJourneyChunk, motionOff, stubSaveData, waitForJourney } from "./journey-helpers";

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

  test("a live page fetches no still file until the page draws still", async ({ page }) => {
    const fetched: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/journey/")) fetched.push(r.url());
    });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/_next/static/**/*.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes(JOURNEY_CHUNK_MARK)) {
        await held;
        return route.fulfill({ response, body });
      }
      return route.fulfill({ response, body });
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "live");
    await page.waitForTimeout(1_500);
    expect(fetched).toEqual([]);
    release();
    await waitForJourney(page);
    await expect.poll(() => fetched.length).toBeGreaterThan(0);
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

  test("the terminus draws the arrived train above the closing plate", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#terminus .terminus-still:not(.is-noscript) use[href]").first()).toBeAttached();
  });
});
