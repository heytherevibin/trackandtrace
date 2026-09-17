import { expect, test } from "./fixtures";
import { enterPnr, gotoReady } from "./helpers";

test("an incomplete PNR alerts and never navigates", async ({ page }) => {
  await gotoReady(page, "/");
  await enterPnr(page, "12345");
  await page.getByRole("button", { name: "Run" }).first().click();
  await expect(page.getByRole("alert").first()).toHaveText("Enter all 10 digits.");
  await expect(page).toHaveURL(/\/$/);
});

test("a malformed PNR address lands on the not-found surface", async ({ page }) => {
  // The route streams (a loading boundary commits the status early), so the
  // contract is the rendered not-found surface, not the status code.
  await gotoReady(page, "/pnr/abc");
  await expect(page.getByRole("heading", { name: "That is not a PNR" })).toBeVisible();
});
