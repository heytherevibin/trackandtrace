import { expect, test } from "./fixtures";
import { PNR, expectAxeClean, runCheck, gotoReady } from "./helpers";

test("the instrument is visible above the fold with the three assurances", async ({ page }) => {
  await gotoReady(page, "/");
  const instrument = page.getByTestId("hero-instrument");
  await expect(instrument).toBeInViewport();
  for (const claim of ["Only fields the source returned.", "Free, and no account to check.", "PNRs and passenger names are never logged."]) {
    await expect(page.getByText(claim)).toBeAttached();
  }
  await expect(page.getByText(/testimonial|trusted by|accurate|predict/i)).toHaveCount(0);
  await expectAxeClean(page);
});

test("a check lands in the recent strip and re-checks in one tap", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.getByTestId("recent-strip")).toHaveCount(0);
  await runCheck(page, PNR.rac);
  await gotoReady(page, "/");
  const item = page.getByTestId("recent-item").first();
  await expect(item).toContainText("234 567 8903");
  await item.click();
  await page.waitForURL(`**/pnr/${PNR.rac}`);
});
