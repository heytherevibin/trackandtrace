import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// The masthead's theme key is two-state (Neubrutal v4): a sun by Day, a moon by Night. It follows the device until a
// reader presses it; the choice then persists and applies before paint.
test("the theme key switches Day and Night, persists, and applies before paint", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await gotoReady(page, "/");
  const button = page.getByRole("banner").getByRole("button", { name: /^Theme:/ });

  await expect(button).toHaveAccessibleName("Theme: Day. Switch to Night");
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(button).toHaveAccessibleName("Theme: Night. Switch to Day");
  await expect(button).toHaveAttribute("aria-pressed", "true");

  await page.reload({ waitUntil: "domcontentloaded" });
  // Applied before paint: the attribute is already set before React hydrates.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Clicks before hydration are swallowed by the dev server; wait before choosing again.
  await page.locator("html[data-hydrated]").waitFor({ timeout: 15_000 });
  await expect(button).toHaveAccessibleName("Theme: Night. Switch to Day");

  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(button).toHaveAccessibleName("Theme: Day. Switch to Night");
  await expect(button).toBeInViewport();
});
