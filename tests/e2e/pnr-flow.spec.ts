import { expect, test } from "./fixtures";
import { PNR, expectAxeClean, navigateFromMasthead, runCheck, gotoReady } from "./helpers";

test("check, save, remove, and undo a PNR", async ({ page, isMobile }) => {
  await gotoReady(page, "/");
  await expect(page.getByTestId("hero-instrument")).toBeVisible();
  await runCheck(page, PNR.cnf);

  const status = page.getByTestId("result-status");
  await expect(status).toHaveText("Confirmed");
  await expect(page.getByText("Sample data")).toBeVisible();

  await page.getByTestId("save-watchlist").click();
  await expect(page.getByTestId("save-watchlist")).toHaveText(/Saved/);

  await navigateFromMasthead(page, "Watchlist", isMobile);
  await page.waitForURL("**/watchlist");
  const row = page.getByRole("link", { name: "234 567 8901" });
  await expect(row).toBeVisible();

  await page.getByTestId("watchlist-remove").click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: "234 567 8901" })).toBeVisible();
});

test("the result page passes an axe scan", async ({ page }) => {
  await gotoReady(page, `/pnr/${PNR.cnf}`);
  await expect(page.getByTestId("result-status")).toBeVisible();
  await expectAxeClean(page);
});
