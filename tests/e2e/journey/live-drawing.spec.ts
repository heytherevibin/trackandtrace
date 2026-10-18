import { expect, test } from "../fixtures";
import { frames, scrollToId, scrollToTerminus, skipWithoutWebgl2, waitForLive } from "./journey-helpers";

// The train drawn live at the terminus (spec §3.A, §3.C), the one stage of the journey Neubrutal v4 keeps
// (2026-10-18): it rolls in as the stage comes up the window, drawn in the page's ink with a yellow headlight. Every test
// here needs the live drawing: in a WebKit with no WebGL 2 (J6-12) each skips before it starts, saying so.
test.beforeEach(async ({ page }) => skipWithoutWebgl2(page));

test.describe("the train, drawn live at the terminus (spec §3.A, §3.C)", () => {
  test("loads its scene and draws the arrived train into the terminus's stage", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "");
    await scrollToTerminus(page);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked(".terminus-stage") ?? 0)).toBeGreaterThan(0.002);
  });

  test("rolls in as the stage comes up the window, and never steps back while scrolling down (§3.H)", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await waitForLive(page);
    await scrollToId(page, "terminus", -800);
    const seen: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.evaluate(() => window.scrollBy({ top: 90, behavior: "instant" }));
      await frames(page, 3);
      seen.push(await page.evaluate(() => window.__ttJourney?.terminus() ?? 0));
    }
    const back = seen.filter((p, i) => i > 0 && p < seen[i - 1]! - 1e-6);
    expect(back, seen.join(", ")).toEqual([]);
    expect(seen.at(-1)).toBeGreaterThan(seen[0]!);
  });

  test("draws Night from the theme's own tokens", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForLive(page);
    expect(await page.evaluate(() => window.__ttJourney?.night())).toBe(true);
  });

  test("forced colours: it still draws live", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Playwright emulates forced colours only in Chromium");
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await waitForLive(page);
    await scrollToTerminus(page);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked(".terminus-stage") ?? 0)).toBeGreaterThan(0.002);
  });
});
