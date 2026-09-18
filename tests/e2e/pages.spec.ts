import { expect, test } from "./fixtures";
import { expectAxeClean, gotoReady } from "./helpers";

test("pre-booking answers honestly and never lists an invented train", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await expect(page.getByText("Train search: not connected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check availability" })).toBeDisabled();
  await page.getByLabel("Journey date").fill("2027-01-15");
  await page.getByRole("button", { name: "Check availability" }).click();
  await expect(page.getByRole("heading", { name: "No availability returned" })).toBeVisible();
  await expect(page.getByText(/Requested: 3A · GN · 2027-01-15/)).toBeVisible();
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
