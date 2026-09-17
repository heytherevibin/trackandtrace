import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// The masthead's Auto · Day · Night cells are toggle buttons in a "Theme" group.
test("the theme choice persists and applies before paint", async ({ page }) => {
  await gotoReady(page, "/");
  const cell = (name: "Auto" | "Day" | "Night") => page.getByRole("group", { name: "Theme" }).getByRole("button", { name, exact: true });

  await cell("Day").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(cell("Day")).toHaveAttribute("aria-pressed", "true");
  await page.reload({ waitUntil: "domcontentloaded" });
  // Applied before paint: the attribute is already set before React hydrates.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // Clicks before hydration are swallowed by the dev server; wait before choosing again.
  await page.locator("html[data-hydrated]").waitFor({ timeout: 15_000 });
  await expect(cell("Day")).toHaveAttribute("aria-pressed", "true");

  await cell("Night").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(cell("Night")).toHaveAttribute("aria-pressed", "true");
  await expect(cell("Day")).toHaveAttribute("aria-pressed", "false");
});
