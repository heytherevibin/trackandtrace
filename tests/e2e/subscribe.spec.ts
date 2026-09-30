import { messages } from "@/messages";
import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// The real form and the real `signUp` in a real browser, with only the API stubbed: this measures the
// FORM, not the route. The landing carries the full footer, so the button reads "Subscribe" and the
// source posted is "landing". Every locator goes through the footer: the compact one on other pages
// adds a second "Email" field, and a bare `getByLabel("Email")` would match twice there.
const m = messages.subscribe;
const ADDRESS = "asha@example.in";

test("the footer takes an address and says to check the inbox", async ({ page }) => {
  await page.route("**/api/subscribe", (route) => route.fulfill({ status: 200, json: { ok: true, message: m.sent } }));
  await gotoReady(page, "/");
  const footer = page.getByRole("contentinfo");
  await footer.getByLabel(m.form.label).fill(ADDRESS);
  await footer.getByRole("button", { name: m.form.subscribe }).click();
  await expect(footer.getByText(m.sent)).toBeVisible();
});

test("a refused sign-up leaves the form standing and says why", async ({ page }) => {
  // The flat body the application sends (apiErrorSchema). A nested `error: {}` fails validation, and
  // `signUp` would answer with its generic fallback instead of this refusal.
  await page.route("**/api/subscribe", (route) =>
    route.fulfill({ status: 429, json: { ok: false, code: "RATE_LIMITED", message: m.errors.limited } }),
  );
  await gotoReady(page, "/");
  const footer = page.getByRole("contentinfo");
  await footer.getByLabel(m.form.label).fill(ADDRESS);
  await footer.getByRole("button", { name: m.form.subscribe }).click();
  await expect(footer.getByRole("alert")).toHaveText(m.errors.limited);
  // Not the fallback: a body `signUp` could not read would land on this copy instead.
  await expect(footer.getByText(m.errors.failed)).toHaveCount(0);
  await expect(footer.getByLabel(m.form.label)).toBeVisible();
  await expect(footer.getByLabel(m.form.label)).toHaveValue(ADDRESS);
});

test("the landing footer posts the address, the list and where it was asked", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/api/subscribe", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, json: { ok: true, message: m.sent } });
  });
  await gotoReady(page, "/");
  const footer = page.getByRole("contentinfo");
  // Typed with capitals and padding: `signUp` sends the trimmed, lower-cased address.
  await footer.getByLabel(m.form.label).fill("  Asha@Example.in ");
  await footer.getByRole("button", { name: m.form.subscribe }).click();
  await expect(footer.getByText(m.sent)).toBeVisible();
  // `source` is what the Leads list reads, and nothing else at this layer pins it.
  expect(sent).toEqual([{ email: ADDRESS, list: "news", source: "landing" }]);
});
