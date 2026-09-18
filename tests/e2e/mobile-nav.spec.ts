import { expect, test } from "./fixtures";
import { gotoReady, navigateFromMasthead, openMasthead } from "./helpers";

// No phone tab bar and no clipped nav strip: below lg the masthead is one row — the hamburger beside
// the logo mark, the theme button and SIGN IN on the right — and the nav lives in a sheet behind the
// hamburger. The landing's section anchors live in the footer.

const PRODUCT = ["Check a PNR", "Watchlist", "Pre-booking", "Accuracy"] as const;
const SECTIONS = ["How it works", "The record", "Sources", "Roadmap", "FAQ"] as const;

test("the hamburger holds the product links and marks the current page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only surface");
  await gotoReady(page, "/watchlist");
  const banner = page.getByRole("banner");
  const hamburger = banner.getByRole("button", { name: "Open menu" });
  await expect(hamburger).toBeVisible();
  await expect(banner.getByRole("navigation", { name: "Primary" })).toBeHidden();
  const brand = banner.getByRole("link", { name: "Track & Trace" });
  const [menuBox, brandBox] = [await hamburger.boundingBox(), await brand.boundingBox()];
  expect(menuBox!.x).toBeLessThan(brandBox!.x);

  const nav = await openMasthead(page, true);
  for (const name of PRODUCT) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Watchlist", exact: true })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Pre-booking", exact: true }).click();
  await page.waitForURL("**/pre-booking");
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();

  await navigateFromMasthead(page, "Accuracy", true);
  await page.waitForURL("**/accuracy");
  const reopened = await openMasthead(page, true);
  await expect(reopened.getByRole("link", { name: "Accuracy", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
});

test("the landing keeps the check behind the hamburger and its section anchors in the footer on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only surface");
  await gotoReady(page, "/");
  await expect(page.getByRole("banner").getByTestId("sign-in")).toBeVisible();
  const sections = page.getByRole("contentinfo").getByRole("list", { name: "Sections" });
  for (const name of SECTIONS) await expect(sections.getByRole("link", { name, exact: true })).toBeAttached();

  const nav = await openMasthead(page, true);
  for (const name of SECTIONS) await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  const check = nav.getByRole("link", { name: "Check a PNR", exact: true });
  await expect(check).toHaveAttribute("aria-current", "page");
  await expect(check).toHaveAttribute("href", "#terminal");

  await check.click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  await expect(page).toHaveURL(/#terminal$/);
  await expect(page.locator("#terminal")).toBeInViewport();
});
