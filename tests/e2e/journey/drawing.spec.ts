import { expect, test } from "../fixtures";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";
import { drawStill, scrollToId, waitForJourney } from "./journey-helpers";

const WIDE = STILL_MANIFEST.shapes.anatomyWide;

test.describe("the drawn train, still (spec §3.C–D)", () => {
  test.beforeEach(async ({ page }) => drawStill(page));

  test("draws every part of the shape its width shows, from immutable files", async ({ page, isMobile }) => {
    const shape = isMobile ? STILL_MANIFEST.shapes.anatomyTall : WIDE;
    const file = page.waitForResponse((r) => r.url().endsWith(shape.href));
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "quality");
    const uses = page.locator("#anatomy .anatomy-still:not(.is-noscript) use[href]");
    await expect(uses).toHaveCount(shape.parts.length);
    expect((await file).headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test("stands the labels beside the drawing at 1440×900, each leader ending on its part", async ({ page, isMobile }) => {
    test.skip(isMobile, "wide screens");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);
    const misses = await page.evaluate(({ viewBox, anchors, parts }) => {
      const pin = document.querySelector<HTMLElement>("#anatomy .anatomy-pin")!;
      const holder = pin.querySelector<HTMLElement>(".anatomy-still")!;
      const pr = pin.getBoundingClientRect();
      const hr = holder.getBoundingClientRect();
      const scale = Math.min(hr.width / viewBox[2], hr.height / viewBox[3]);
      const x0 = hr.left - pr.left + (hr.width - viewBox[2] * scale) / 2;
      const y0 = hr.top - pr.top + (hr.height - viewBox[3] * scale) / 2;
      const lines = [...pin.querySelectorAll<SVGLineElement>(".callout-lines line")];
      return parts.flatMap((part, i: number) => {
        const [ax, ay] = anchors[part];
        const line = lines[i];
        const dx = Number(line.getAttribute("x2")) - (x0 + ax * scale);
        const dy = Number(line.getAttribute("y2")) - (y0 + ay * scale);
        return Math.hypot(dx, dy) > 1.5 ? [`${part} ends ${dx.toFixed(1)},${dy.toFixed(1)} off`] : [];
      });
    }, { viewBox: WIDE.viewBox, anchors: WIDE.anchors, parts: [...CALLOUT_PARTS] });
    expect(misses).toEqual([]);
  });

  test("lights a part while a fine pointer rests on its label", async ({ page, isMobile }) => {
    test.skip(isMobile, "fine pointer");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);
    await page.locator('.callout[data-part="roof"]').hover();
    await expect(page.locator('#anatomy .anatomy-still g[data-part="roof"][data-hot]')).toHaveCount(2);
    await expect(page.locator('.callout[data-part="roof"]')).toHaveClass(/is-hot/);
    await page.mouse.move(5, 5);
    await expect(page.locator("#anatomy [data-hot]")).toHaveCount(0);
  });

  test("reads words, drawing, then the parts list on a phone", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).not.toHaveClass(/is-columns/);
    await expect(page.locator("#anatomy .anatomy-legend")).toBeVisible();
    await expect(page.getByRole("list", { name: "What each part does" }).getByRole("listitem")).toHaveCount(10);
  });

  test("a reader below the chapter stays on what they were reading when the labels take their columns", async ({ page, isMobile }) => {
    test.skip(isMobile, "wide screens");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#record");
    const before = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);
    const after = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(4);
  });

  test("a reader who left below the drawing and came back with Back keeps their place once the new journey settles", async ({ page, isMobile }) => {
    test.skip(isMobile, "wide screens");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);
    // #principles, just below the drawing: below #anatomy (spec's own landmark for this scenario), and short
    // of #how, whose own pinned-height mechanism (chapters.ts) is a separate module with its own concerns.
    await scrollToId(page, "principles");
    const before = await page.locator("#principles").evaluate((el) => el.getBoundingClientRect().top);

    // A real Next <Link> in the masthead, so the browser records genuine history/scroll state for "/".
    await page.getByLabel("Primary").getByRole("link", { name: "Watchlist" }).click();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect(page.locator("#anatomy .anatomy-pin")).toHaveClass(/is-columns/);

    const after = await page.locator("#principles").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(4);
  });
});
