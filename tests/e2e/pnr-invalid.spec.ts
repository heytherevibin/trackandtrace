import { expect, test } from "./fixtures";
import { enterPnr, gotoReady } from "./helpers";

test("an incomplete PNR alerts and never navigates", async ({ page }) => {
  await gotoReady(page, "/");
  const plate = page.getByTestId("hero-instrument");
  await enterPnr(page, "12345");
  await plate.getByRole("button", { name: "Run", exact: true }).click();
  await expect(plate.getByRole("alert")).toHaveText("Enter all 10 digits.");
  await expect(plate.getByText("Check the digits")).toBeVisible();
  await expect(page.getByLabel("PNR number").first()).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/$/);

  // Enter on an incomplete number explains itself the same way.
  await enterPnr(page, "234");
  await page.getByLabel("PNR number").first().press("Enter");
  await expect(plate.getByRole("alert")).toHaveText("Enter all 10 digits.");
  await expect(page).toHaveURL(/\/$/);
});

test("a malformed PNR address lands on the not-found surface", async ({ page }) => {
  // The route streams (a loading boundary commits the status early), so the
  // contract is the rendered not-found surface, not the status code.
  await gotoReady(page, "/pnr/abc");
  await expect(page.getByRole("heading", { name: "That is not a PNR" })).toBeVisible();
});
