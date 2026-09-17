import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

test("the theme choice persists and applies before paint", async ({ page }) => {
  await gotoReady(page, "/");
  await page.getByRole("radio", { name: "Day" }).or(page.getByRole("button", { name: "Day" })).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "Night" }).or(page.getByRole("button", { name: "Night" })).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
