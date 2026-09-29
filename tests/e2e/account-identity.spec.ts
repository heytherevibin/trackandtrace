import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";
import { cutText } from "./layout";

// A signed-in traveller's name and address, drawn by /e2e/signed-in (fixture mode has no accounts): a long address,
// so a line that cannot hold it shows it. Run in the desktop project only; each test sets its own window.
const ADDRESS = "venkataramanan.subramanian@example.co.in";

test.skip(({ isMobile }) => isMobile, "each test sets its own window");

/** Text at `percent`, from before the page's first paint, as the nightly sets 200%. */
const textAt = (page: Page, percent: number) =>
  page.addInitScript((pct) => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", `${pct}%`)), percent);

// The account menu holds to the window (menu.tsx): at a narrow window its 12rem floor, and a long address, would carry
// its box past the window's edge, at 100% text (280px) and at 200% (280px, 360px).
for (const [width, height] of [
  [280, 653],
  [360, 740],
] as const) {
  for (const percent of [100, 200]) {
    test(`the account menu stays inside a ${width}px window with its text at ${percent}%`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      if (percent !== 100) await textAt(page, percent);
      await gotoReady(page, "/e2e/signed-in");
      await page.getByTestId("account-menu").click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      const box = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), vw: document.documentElement.clientWidth };
      });
      expect(box.left, "its left edge").toBeGreaterThanOrEqual(0);
      expect(box.right, `its right edge, in a ${box.vw}px window`).toBeLessThanOrEqual(box.vw);
      expect(await cutText(page, '[role="menu"]')).toEqual([]);
    });
  }
}

test("the address is one plain address: in the accessibility tree, and when it is copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoReady(page, "/e2e/signed-in");
  const address = page.getByRole("main").getByText(ADDRESS, { exact: true });
  await expect(address).toBeVisible();
  // the paragraph that holds it is read as the one address, nothing added between its parts
  await expect(address.locator("xpath=..")).toMatchAriaSnapshot(`- paragraph: ${ADDRESS}`);
  // selected and copied, it is the plain address
  await address.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  });
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe(ADDRESS);
  await page.keyboard.press("ControlOrMeta+C");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ADDRESS);
});
