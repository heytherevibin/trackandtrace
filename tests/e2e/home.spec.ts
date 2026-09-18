import { expect, test } from "./fixtures";
import { PNR, enterPnr, expectAxeClean, gotoReady, runCheck } from "./helpers";

test("the check plate is above the fold beside the promise and its four tags", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.getByTestId("hero-instrument")).toBeInViewport();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Your PNR,\s*as the railway records it\./i);
  const hero = page.locator("section", { has: page.getByRole("heading", { level: 1 }) });
  for (const tag of ["Free", "No account needed", "PNR never logged", "Fails closed"]) {
    await expect(hero.getByText(tag, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("hero-instrument").getByText("PNR check — live request")).toBeVisible();
});

test("the sheet carries the operating principles, every anchored section, and no invented proof", async ({ page }) => {
  await gotoReady(page, "/");
  const principles = page.getByRole("table", { name: "Operating principles" });
  for (const claim of ["Fields shown beyond the source response", "Confirmation odds invented", "Account required to check", "PNRs and names written to logs"]) {
    await expect(principles.getByText(claim)).toBeAttached();
  }
  for (const id of ["how", "record", "reliability", "roadmap", "faq", "terminal"]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  await expect(page.getByText("Specimen record", { exact: true })).toBeAttached();
  // No social proof and no invented odds. ("Predict" appears only in the refusals to predict.)
  await expect(page.getByText(/testimonial|trusted by|\d+\s?%\s?(chance|likely|confirm)|chance of confirmation is/i)).toHaveCount(0);
  await expectAxeClean(page);
});

test("a check renders the record in place, then opens the full record", async ({ page }) => {
  await gotoReady(page, "/");
  const plate = page.getByTestId("hero-instrument");
  await enterPnr(page, PNR.mixed);
  await expect(plate.getByText("Ready to run")).toBeVisible();
  await plate.getByRole("button", { name: "Run", exact: true }).click();
  await expect(plate.getByText("CNF · RAC · WL — party of three")).toBeVisible({ timeout: 20_000 });
  await expect(plate.getByRole("cell", { name: "RAC 4" })).toBeVisible();
  await expect(plate.getByText("Sample data")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expectAxeClean(page);
  await plate.getByRole("link", { name: "Open full record" }).click();
  await page.waitForURL(new RegExp(`/pnr#${PNR.mixed}$`));
});

test("a recent check returns to the entry block in one tap", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.getByTestId("recent-strip")).toHaveCount(0);
  await runCheck(page, PNR.rac);
  await gotoReady(page, "/");
  const item = page.getByTestId("recent-item").first();
  await expect(item).toContainText("234 567 8903");
  await item.click();
  await expect(page.getByLabel("PNR number").first()).toHaveValue("234 567 8903");
  await expect(page.getByTestId("hero-instrument").getByText("Ready to run")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
