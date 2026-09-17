import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

test("bottom tabs navigate and meet the touch target floor", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only surface");
  await gotoReady(page, "/");
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs).toBeVisible();
  for (const name of ["Check", "Watchlist", "Sign in"]) {
    const tab = tabs.getByRole("link", { name });
    const box = await tab.boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
  await tabs.getByRole("link", { name: "Watchlist" }).click();
  await page.waitForURL("**/watchlist");
  await expect(tabs.getByRole("link", { name: "Watchlist" })).toHaveAttribute("aria-current", "page");
});

test("the top rail hides section links on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only surface");
  await gotoReady(page, "/");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Accuracy" })).toBeHidden();
});
