import { expect, test } from "@playwright/test";
import { motionOff, waitForJourney } from "./journey-helpers";

test.describe("the registration-mark cursor", () => {
  test("frames a control, gives way to the caret in a text field", async ({ page, isMobile }) => {
    test.skip(isMobile, "fine pointers only");
    await page.goto("/");
    await waitForJourney(page);
    const cursor = page.locator(".reg-cursor");
    await expect(cursor).toBeAttached();
    await expect(page.locator("html")).toHaveClass(/has-reg-cursor/);
    await page.getByRole("banner").getByRole("link", { name: "Watchlist", exact: true }).hover();
    await expect(cursor).toHaveClass(/is-snapped/);
    await page.getByTestId("hero-instrument").getByRole("textbox").hover();
    await expect(cursor).toHaveClass(/is-off/);
    expect(await page.getByTestId("hero-instrument").getByRole("textbox").evaluate((el) => getComputedStyle(el).cursor)).toBe("text");
  });

  test("none on a touch screen", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch only");
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator(".reg-cursor")).toHaveCount(0);
  });

  test("none with Motion off", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator(".reg-cursor")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/has-reg-cursor/);
  });
});
