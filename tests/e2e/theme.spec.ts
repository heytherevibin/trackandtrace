import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// The masthead's theme control is one icon button showing the active mode; a click moves System → Day → Night.
test("the theme choice cycles, persists, and applies before paint", async ({ page }) => {
  await gotoReady(page, "/");
  const button = page.getByRole("banner").getByRole("button", { name: /^Theme:/ });

  await expect(button).toHaveAccessibleName("Theme: System. Switch to Day");
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(button).toHaveAccessibleName("Theme: Day. Switch to Night");

  await page.reload({ waitUntil: "domcontentloaded" });
  // Applied before paint: the attribute is already set before React hydrates.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // Clicks before hydration are swallowed by the dev server; wait before choosing again.
  await page.locator("html[data-hydrated]").waitFor({ timeout: 15_000 });
  await expect(button).toHaveAccessibleName("Theme: Day. Switch to Night");

  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(button).toHaveAccessibleName("Theme: Night. Switch to System");
  await expect(button).toBeInViewport();
});
