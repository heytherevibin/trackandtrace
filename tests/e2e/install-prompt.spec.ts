import { devices } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// The install prompt an iPhone gets (spec §8's iOS row; J6 nightly, round 1): a plate fixed over the page's foot, shown
// by the user agent alone, so any engine shows it here. A reader can put it away through its own control, and while it
// shows it never covers the masthead's controls, at a phone's sizes held either way.
test.use({ userAgent: devices["iPhone 13"].userAgent });

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const) {
  test(`is dismissed through its own control, and never covers the masthead's controls (${viewport.width}×${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await gotoReady(page, "/");
    const prompt = page.getByTestId("install-prompt");
    await expect(prompt).toBeVisible();
    const overlaps = await prompt.evaluate((plate) => {
      const p = plate.getBoundingClientRect();
      const controls = [...document.querySelectorAll<HTMLElement>("header a, header button")].filter((el) => el.checkVisibility());
      return controls
        .map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.right > p.left && r.left < p.right && r.bottom > p.top && r.top < p.bottom)
        .map(({ name }) => name);
    });
    expect(overlaps).toEqual([]);
    await prompt.getByTestId("install-dismiss").click();
    await expect(prompt).toBeHidden();
    await page.reload();
    await page.locator("html[data-hydrated]").waitFor();
    await expect(prompt).toBeHidden(); // asleep for a month, not just this page
  });
}
