import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";

// Addresses are unique per test and attempt: the limits last 10 minutes on the shared dev server.
const address = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test("sends and answers the same for every address", async ({ page }) => {
  await gotoReady(page, "/login");
  await expect(page.getByRole("heading", { level: 1, name: "Console sign in" })).toBeVisible();
  await page.getByLabel("Console email").fill(address("asha"));
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeFocused();
  await expect(page.getByText("If this address belongs to a console member, a sign-in link is on its way.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send again in \d+ s/ })).toBeDisabled();
  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Console email")).toBeFocused();
});

test("refuses a malformed address in place", async ({ page }) => {
  await gotoReady(page, "/login");
  await page.getByLabel("Console email").fill("asha@example");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Enter an email address like name@example.com.")).toBeVisible();
});

test("says too many after five requests for one address", async ({ page }) => {
  const email = address("limit");
  for (let i = 0; i < 5; i++) {
    const response = await page.request.post("/api/sign-in", { data: { email }, headers: { "sec-fetch-site": "same-origin" } });
    expect(response.status()).toBe(200);
  }
  await gotoReady(page, "/login");
  await page.getByLabel("Console email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Too many sign-in requests. Try again in 10 minutes.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
});
