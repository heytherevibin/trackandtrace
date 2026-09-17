import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";

test("a waitlisted fixture shows WL with its position and description", async ({ page }) => {
  await gotoReady(page, `/pnr/${PNR.wl}`);
  await expect(page.getByTestId("result-status")).toHaveText("WL 5");
  await expect(page.getByTestId("pnr-result").getByText("Waitlisted: no berth yet. The chart decides.", { exact: true }).first()).toBeVisible();
});

test("a mixed fixture lists three passengers with their own states", async ({ page }) => {
  await gotoReady(page, `/pnr/${PNR.mixed}`);
  await expect(page.getByRole("cell", { name: "Passenger 3" })).toBeVisible();
  const table = page.getByRole("region", { name: "Passengers" });
  await expect(table.getByText("RAC 4")).toBeVisible();
  await expect(table.getByText("WL 9")).toBeVisible();
});

test("a PNR the source does not know reads as no record, not an error", async ({ page }) => {
  await gotoReady(page, `/pnr/${PNR.notFound}`);
  await expect(page.getByRole("heading", { name: "No record for this PNR" })).toBeVisible();
});
