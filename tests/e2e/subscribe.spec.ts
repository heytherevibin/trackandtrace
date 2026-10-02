import { messages } from "@/messages";
import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// The real form and the real `signUp` in a real browser, with only the API stubbed: this measures the
// FORM, not the route. The landing carries the full "Updates by email" band (the owner, 2026-10-01: the
// sign-up left the footer), so the button reads "Subscribe" and the source posted is "landing". Every
// locator goes through the band: a page can carry a second "Email" field, and a bare
// `getByLabel("Email")` would match twice there. The slim band's own path is in updates-band.spec.ts.
const m = messages.subscribe;
const ADDRESS = "asha@example.in";

test("the band takes an address and says to check the inbox", async ({ page }) => {
  await page.route("**/api/subscribe", (route) => route.fulfill({ status: 200, json: { ok: true, message: m.sent } }));
  await gotoReady(page, "/");
  const band = page.getByRole("region", { name: m.places.footerColumn });
  await band.getByLabel(m.form.label, { exact: true }).fill(ADDRESS);
  await band.getByRole("button", { name: m.form.subscribe }).click();
  await expect(band.getByText(m.sent)).toBeVisible();
});

test("a refused sign-up leaves the form standing and says why", async ({ page }) => {
  // The flat body the application sends (apiErrorSchema). A nested `error: {}` fails validation, and
  // `signUp` would answer with its generic fallback instead of this refusal.
  await page.route("**/api/subscribe", (route) =>
    route.fulfill({ status: 429, json: { ok: false, code: "RATE_LIMITED", message: m.errors.limited } }),
  );
  await gotoReady(page, "/");
  const band = page.getByRole("region", { name: m.places.footerColumn });
  await band.getByLabel(m.form.label, { exact: true }).fill(ADDRESS);
  await band.getByRole("button", { name: m.form.subscribe }).click();
  await expect(band.getByRole("alert")).toHaveText(m.errors.limited);
  // Not the fallback: a body `signUp` could not read would land on this copy instead.
  await expect(band.getByText(m.errors.failed)).toHaveCount(0);
  await expect(band.getByLabel(m.form.label, { exact: true })).toBeVisible();
  await expect(band.getByLabel(m.form.label, { exact: true })).toHaveValue(ADDRESS);
});

test("the landing band posts the address, the list and where it was asked", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/api/subscribe", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, json: { ok: true, message: m.sent } });
  });
  await gotoReady(page, "/");
  const band = page.getByRole("region", { name: m.places.footerColumn });
  // Typed with capitals and padding: `signUp` sends the trimmed, lower-cased address.
  await band.getByLabel(m.form.label, { exact: true }).fill("  Asha@Example.in ");
  await band.getByRole("button", { name: m.form.subscribe }).click();
  await expect(band.getByText(m.sent)).toBeVisible();
  // `source` is what the Leads list reads, and nothing else at this layer pins it.
  expect(sent).toEqual([{ email: ADDRESS, list: "news", source: "landing" }]);
});
