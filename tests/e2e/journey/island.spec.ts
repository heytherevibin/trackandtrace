import { expect, test } from "@playwright/test";
import { PNR } from "../helpers";
import { blockJourneyChunk, waitForJourney } from "./journey-helpers";

test.describe("the journey island", () => {
  test("starts once the page is idle", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
  });

  test("a blocked journey chunk leaves the page still, and the check still works", async ({ page }) => {
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.getByTestId("terminal-result")).toBeVisible();
  });

  test("never starts on other pages", async ({ page }) => {
    await page.goto("/accuracy");
    await page.waitForTimeout(2_000);
    await expect(page.locator("html")).not.toHaveAttribute("data-journey", /.+/);
  });
});
