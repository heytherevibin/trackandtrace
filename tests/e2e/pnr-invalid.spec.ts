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

test("a malformed PNR address lands on the check-again surface", async ({ page }) => {
  // An old /pnr/<x> address redirects to /pnr; with no PNR after "#" the page offers a new check.
  await gotoReady(page, "/pnr/abc");
  await expect(page).toHaveURL(/\/pnr$/);
  await expect(page.getByRole("heading", { name: "That is not a PNR" })).toBeVisible();
});
