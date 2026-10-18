import { expect, test } from "./fixtures";
import { gotoReady, openMasthead } from "./helpers";

// A phone's navigation, as Neubrutal v4 draws it: the masthead keeps the brand, the theme key and the sign-in key; the
// nav keys step aside for a tab bar fixed to the foot of the window (Check, Watchlist, Pre-booking, Menu), and Menu
// opens a drawer from the left with the four product keys. The landing's section anchors live in the footer.

const PRODUCT = ["Check a PNR", "Watchlist", "Pre-booking", "Accuracy"] as const;
const SECTIONS = ["How it works", "Reliability", "Roadmap", "FAQ"] as const;

test("the tab bar sits at the foot of the window and marks the current page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only surface");
  await gotoReady(page, "/watchlist");
  await expect(page.getByRole("banner").getByRole("navigation", { name: "Primary" })).toBeHidden();
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs).toBeVisible();
  const box = await tabs.boundingBox();
  const height = page.viewportSize()!.height;
  expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(height - 1);
  for (const name of ["Check", "Watchlist", "Pre-booking"]) await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Watchlist", exact: true })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Pre-booking", exact: true }).click();
  await page.waitForURL("**/pre-booking");
  await expect(tabs.getByRole("link", { name: "Pre-booking", exact: true })).toHaveAttribute("aria-current", "page");
});

test("Menu opens the drawer with the product keys, and choosing one closes it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only surface");
  await gotoReady(page, "/watchlist");
  const nav = await openMasthead(page, true);
  for (const name of PRODUCT) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Watchlist", exact: true })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Accuracy", exact: true }).click();
  await page.waitForURL("**/accuracy");
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  const reopened = await openMasthead(page, true);
  await expect(reopened.getByRole("link", { name: "Accuracy", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
});

test("the landing keeps Check a PNR on the check plate and its section anchors in the footer on a phone", async ({ page, isMobile }) => {
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
