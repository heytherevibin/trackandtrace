import { expect, test } from "@playwright/test";
import { blockJourneyChunk, motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const km = async (text: string | null) => Number(/KM (\d{3})/.exec(text ?? "")?.[1]);

test.describe("the route strip, moving", () => {
  test.describe("desktop", () => {
    test.skip(({ isMobile }) => isMobile, "the strip's row is for 48rem and up");

    test("follows the page: the current stop, the odometer, the train", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      const strip = page.locator("#route-strip");
      await expect(strip.locator(".strip-odo")).toHaveText("KM 000");
      await expect(strip.getByRole("link", { name: /^DEP ·/ })).toHaveAttribute("aria-current", "location");
      await scrollToId(page, "record", 40);
      await expect(strip.getByRole("link", { name: /^03 ·/ })).toHaveAttribute("aria-current", "location");
      await expect(strip.getByRole("link", { name: /^DEP ·/ })).not.toHaveAttribute("aria-current", "location");
      await expect.poll(async () => km(await strip.locator(".strip-odo").textContent())).toBeGreaterThanOrEqual(212);
      const left = await strip.locator(".strip-train").evaluate((el) => parseFloat(el.style.left));
      expect(left).toBeGreaterThan(30);
      expect(left).toBeLessThan(45);
    });

    test("Motion off: the train still moves, but never leans", async ({ page }) => {
      await motionOff(page);
      await page.goto("/");
      await waitForJourney(page);
      await page.mouse.wheel(0, 2_400);
      const lean = await page.locator("#route-strip .strip-glyph").evaluate((el) => el.style.transform);
      expect(lean).toBe("");
      await expect.poll(() => page.locator("#route-strip .strip-train").evaluate((el) => parseFloat(el.style.left))).toBeGreaterThan(0);
    });

    test("without the journey, the strip is J2's: no odometer, no train", async ({ page }) => {
      await blockJourneyChunk(page);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
      await expect(page.locator("#route-strip .strip-odo")).toBeHidden();
      await expect(page.locator("#route-strip .strip-train")).toBeHidden();
    });
  });

  test.describe("phone", () => {
    test.skip(({ isMobile }) => !isMobile, "phones only");

    test("a hairline rail in the masthead's foot carries the train, with no strip landmark", async ({ page }) => {
      await page.goto("/");
      await waitForJourney(page);
      await expect(page.locator(".phone-rail")).toBeVisible();
      await expect(page.locator("#route-strip")).toBeHidden();
      await expect(page.getByRole("navigation", { name: "Route through this page" })).toHaveCount(0);
      await scrollToId(page, "roadmap");
      await expect.poll(() => page.locator(".phone-rail .strip-train").evaluate((el) => parseFloat(el.style.left))).toBeGreaterThan(40);
    });
  });
});
