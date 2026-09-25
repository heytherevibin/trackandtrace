import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// Form TL-02 v2 as the sheet draws it: stations, a date and the classes you would travel in, then
// every train on that route with the first of those classes answered.
//
// The assertion that matters most is the one about what is NOT shown. A journey the source cannot
// answer must never render an empty list, because a traveller reads that as "no berths" — and the
// same is true of a pair that has no trains, which is a different fact and gets its own sentence.

async function pickRoute(page: import("@playwright/test").Page, from: string, to: string): Promise<void> {
  await page.getByLabel("From", { exact: true }).fill(from);
  await page.getByLabel("To", { exact: true }).fill(to);
  await page.getByLabel("To", { exact: true }).blur();
}

async function search(page: import("@playwright/test").Page, date = "2026-10-15"): Promise<void> {
  await page.getByLabel("Journey date").fill(date);
  await page.getByRole("button", { name: "Find trains" }).click();
}

test("opens with three classes chosen and nothing asked", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  for (const cls of ["SL", "3A", "2A"]) {
    await expect(page.getByRole("button", { name: cls, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByRole("button", { name: "1A", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Find trains" })).toBeDisabled();
});

test("lists every train on the route, each carrying one class", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await search(page);

  const rows = page.getByTestId("train-row");
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  // Every chosen class is answered for every train, so nothing is left "not asked yet" — and the
  // sample Rajdhani carries no sleeper, which the page says rather than leaving the class out.
  await expect(page.getByText(/not asked yet/)).toHaveCount(0);
  await expect(page.getByText("Not carried").first()).toBeVisible();
  // And the sample special is closed for booking, which the page says in its own words. "Could not
  // answer" would be the opposite claim: one means try again, this means pick another date.
  await expect(page.getByText("This train cannot be booked for this date.")).toBeVisible();
  await expect(page.getByText(/could not answer for this train/i)).toHaveCount(0);
});

test("says which class the list leads with, so the column is not arbitrary", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  // 2A leads out of SL/3A/2A because the enum declares it first — not because of click order.
  await expect(page.getByText("2A first")).toBeVisible();
});

test("will not let the last class be turned off", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  for (const cls of ["3A", "2A"]) await page.getByRole("button", { name: cls, exact: true }).click();
  await expect(page.getByRole("button", { name: "SL", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "SL", exact: true }).click();
  // No class is not a question anyone can answer.
  await expect(page.getByRole("button", { name: "SL", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a pair with no trains says so, and is never searched", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "XXXX");

  // Said twice on purpose: once under the field that is wrong, once as the lifecycle stop that failed.
  await expect(page.getByText(/No trains run SBC/i)).toHaveCount(2);
  await expect(page.getByLabel("Journey date")).toBeVisible();
  await page.getByLabel("Journey date").fill("2026-10-15");
  // Searching would spend a request to learn what the railway already answered for free.
  await expect(page.getByRole("button", { name: "Find trains" })).toBeDisabled();
  await expect(page.getByTestId("train-row")).toHaveCount(0);
});

test("a search the source cannot answer shows a refusal, never an empty list", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await page.route("**/api/route-availability", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "SOURCE_UNAVAILABLE", message: "The reservation service could not answer for this journey. Nothing was shown in its place." }),
    }),
  );
  await pickRoute(page, "SBC", "NDLS");
  await search(page);

  await expect(page.getByText("The reservation service could not answer for this journey.")).toBeVisible();
  await expect(page.getByTestId("train-row")).toHaveCount(0);
});

test("a past date is refused before anything is spent", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await page.getByLabel("Journey date").fill("2020-01-01");
  await expect(page.getByText("Pick today or a later date.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find trains" })).toBeDisabled();
});

test("the lifecycle marks the route resolved and the search done", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  const lifecycle = page.getByRole("list", { name: /lifecycle/i });
  await expect(lifecycle.getByRole("listitem")).toHaveCount(4);

  await pickRoute(page, "SBC", "NDLS");
  await search(page);

  await expect(lifecycle.getByRole("listitem").nth(1)).toHaveAttribute("data-state", "done");
  await expect(lifecycle.getByRole("listitem").nth(2)).toHaveAttribute("data-state", "done");
});
