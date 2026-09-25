import { expect, test } from "./fixtures";
import { expectAxeClean, gotoReady } from "./helpers";

test("pre-booking searches nothing until a route answers, and labels a sample answer", async ({ page }) => {
  // The honest stub this replaced could not list a train because nothing could find one. Now a
  // route can, so the honesty moves: nothing is searched until a route has answered, what is listed
  // comes from that answer, and sample data says it is sample data.
  await gotoReady(page, "/pre-booking");
  await expect(page.getByRole("button", { name: "Find trains" })).toBeDisabled();

  await page.getByLabel("From", { exact: true }).fill("SBC");
  await page.getByLabel("To", { exact: true }).fill("NDLS");
  await page.getByLabel("Journey date").fill("2027-01-15");
  await expect(page.getByRole("button", { name: "Find trains" })).toBeEnabled();
  await page.getByRole("button", { name: "Find trains" }).click();

  await expect(page.getByText("Sample data").first()).toBeVisible();
  await expectAxeClean(page);
});

test("accuracy, privacy, terms, login, and account render their states", async ({ page }) => {
  await gotoReady(page, "/accuracy");
  await expect(page.getByRole("heading", { name: "Accuracy reporting is not available yet" })).toBeVisible();
  await gotoReady(page, "/privacy");
  await expect(page.getByRole("heading", { name: "What we process" })).toBeVisible();
  await gotoReady(page, "/tos");
  await expect(page.getByText("Not affiliated with IRCTC or Indian Railways.").first()).toBeVisible();
  await gotoReady(page, "/login");
  // A server Playwright starts has no Supabase (see playwright.config.ts); a reused dev
  // server may be connected. Either honest state passes; login-form.test.tsx pins both.
  await expect(page.getByRole("heading", { name: "Sign-in is not connected" }).or(page.getByLabel("Email"))).toBeVisible();
  await gotoReady(page, "/account");
  await expect(page.getByRole("heading", { name: "Nothing to sync yet" })).toBeVisible();
  await expectAxeClean(page);
});

test("an unknown address offers the check", async ({ page }) => {
  await gotoReady(page, "/nowhere");
  await expect(page.getByRole("heading", { name: "There is nothing at this address." })).toBeVisible();
  await expect(page.getByLabel("PNR number")).toBeAttached();
});
