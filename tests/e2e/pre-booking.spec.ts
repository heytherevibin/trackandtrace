import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// Form TL-02 as the sheet draws it: stations first, the train chosen from what that route answers,
// then the chart read. Driven against sample data, where 12627 answers with a queue that moves,
// 22691 answers with a departure-day row that cannot be joined, and SBC → XXXX has no trains.
//
// The assertion that matters most is the one about what is NOT shown: a journey the source cannot
// answer must never render an empty table, because a traveller reads that as "no berths".

async function pickRoute(page: import("@playwright/test").Page, from: string, to: string): Promise<void> {
  await page.getByLabel("From", { exact: true }).fill(from);
  await page.getByLabel("To", { exact: true }).fill(to);
  await page.getByLabel("To", { exact: true }).blur();
}

test("finds the route's trains, then reads the chart for the one chosen", async ({ page }) => {
  await gotoReady(page, "/pre-booking");

  // Nothing can be asked until a route is known.
  await expect(page.getByLabel("Train", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check availability" })).toBeDisabled();

  await pickRoute(page, "SBC", "NDLS");
  const train = page.getByLabel("Train", { exact: true });
  await expect(train).toBeEnabled();
  await expect(train.locator("option")).toHaveCount(2);

  await train.selectOption("12627");
  await page.getByLabel("Journey date").fill("2026-10-15");
  await page.getByRole("button", { name: "Check availability" }).click();

  const table = page.getByRole("table", { name: /availability/i });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(5); // a head row and four dates
  await expect(page.getByText("of 244 when booking opened").first()).toBeVisible();

  // One comma, after the weekday. en-IN's own long form adds a second before the year.
  await expect(table.getByRole("cell").first()).toHaveText(/^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}$/);
});

test("the train field is wide enough for a train's name", async ({ page, isMobile }) => {
  test.skip(isMobile, "one column on a phone, so every field is already full width");
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await expect(page.getByLabel("Train", { exact: true })).toBeEnabled();

  // A train reads "12602 · MAQ CHENNAI MAIL". In one column of this grid it was cut mid-word and
  // ran into the select's own arrow, which read as the arrow being out of place.
  const train = await page.getByLabel("Train", { exact: true }).boundingBox();
  const cls = await page.getByLabel("Class", { exact: true }).boundingBox();
  expect(train!.width).toBeGreaterThan(cls!.width * 1.8);
});

test("says a date cannot be booked, without claiming to know why", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await page.getByLabel("Train", { exact: true }).selectOption("22691");
  await page.getByLabel("Journey date").fill("2026-10-15");
  await page.getByRole("button", { name: "Check availability" }).click();

  await expect(page.getByText("Booking closed")).toBeVisible();
  // The note used to say the chart was prepared. Production answered canBook false twenty-one days
  // out, where no chart exists, so the page no longer offers a reason it cannot stand behind.
  await expect(page.getByText(/chart is prepared/i)).toHaveCount(0);
});

test("a pair with no trains says so, and leaves the train field empty", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "XXXX");

  // Said twice on purpose: once under the field that is wrong, once as the lifecycle stop that failed.
  await expect(page.getByText(/No trains run SBC/i)).toHaveCount(2);
  await expect(page.getByText(/No trains run SBC/i).first()).toBeVisible();
  await expect(page.getByLabel("Train", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check availability" })).toBeDisabled();
});

test("a journey the source cannot answer shows a refusal, never an empty table", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  // The sample source answers only for its two trains; this route's second train is not one of them
  // in the availability fixture, so the chart read refuses.
  await page.route("**/api/availability", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "SOURCE_UNAVAILABLE", message: "The reservation service could not answer for this journey. Nothing was shown in its place." }) }),
  );
  await pickRoute(page, "SBC", "NDLS");
  await page.getByLabel("Train", { exact: true }).selectOption("12627");
  await page.getByLabel("Journey date").fill("2026-10-15");
  await page.getByRole("button", { name: "Check availability" }).click();

  await expect(page.getByText("No availability returned")).toBeVisible();
  await expect(page.getByRole("table", { name: /availability/i })).toHaveCount(0);
});

test("the lifecycle marks the train resolved and the chart read", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  const lifecycle = page.getByRole("list", { name: /lifecycle/i });
  await expect(lifecycle.getByRole("listitem")).toHaveCount(4);

  await pickRoute(page, "SBC", "NDLS");
  await page.getByLabel("Train", { exact: true }).selectOption("12627");
  await page.getByLabel("Journey date").fill("2026-10-15");
  await page.getByRole("button", { name: "Check availability" }).click();

  await expect(lifecycle.getByRole("listitem").nth(1)).toHaveAttribute("data-state", "done");
  await expect(lifecycle.getByRole("listitem").nth(2)).toHaveAttribute("data-state", "done");
});
