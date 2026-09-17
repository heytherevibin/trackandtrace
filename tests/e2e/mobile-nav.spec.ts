import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// No phone tab bar: below lg the masthead is two tiers (brand and SIGN IN, then the nav strip with
// the theme button). The landing's section anchors live in the footer. These specs hold that on a phone.

const PRODUCT = ["Check a PNR", "Watchlist", "Pre-booking", "Accuracy"] as const;
const SECTIONS = ["How it works", "The record", "Sources", "Roadmap", "FAQ"] as const;

test("the wrapped masthead keeps the product links and marks the current page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only surface");
  await gotoReady(page, "/watchlist");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  for (const name of PRODUCT) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Watchlist", exact: true })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Pre-booking", exact: true }).click();
  await page.waitForURL("**/pre-booking");
  await expect(nav.getByRole("link", { name: "Pre-booking", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Watchlist", exact: true })).not.toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Accuracy", exact: true }).click();
  await page.waitForURL("**/accuracy");
  await expect(nav.getByRole("link", { name: "Accuracy", exact: true })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Check a PNR", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
});

test("the landing keeps the check in the masthead and its section anchors in the footer on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only surface");
  await gotoReady(page, "/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  for (const name of SECTIONS) await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  const sections = page.getByRole("contentinfo").getByRole("list", { name: "Sections" });
  for (const name of SECTIONS) await expect(sections.getByRole("link", { name, exact: true })).toBeAttached();

  const check = nav.getByRole("link", { name: "Check a PNR", exact: true });
  await expect(check).toBeVisible();
  await expect(check).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("banner").getByTestId("sign-in")).toBeVisible();
  await expect(check).toHaveAttribute("href", "#terminal");
  await check.click();
  await expect(page).toHaveURL(/#terminal$/);
  await expect(page.locator("#terminal")).toBeInViewport();
});
