import { devices } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { PNR, enterPnr, gotoReady } from "./helpers";
import { cutText } from "./layout";

// The install plate an iPhone gets (its user agent alone, so any engine shows it here), as Neubrutal v4 places it: on
// the landing, under the check, once a check has come back with a record. "Not now" puts it away for a month.
test.use({ userAgent: devices["iPhone 13"].userAgent });

/** Runs a check on the landing's plate and waits for its record in place. */
async function checkInPlace(page: Page, pnr: string): Promise<void> {
  await enterPnr(page, pnr);
  await page.getByTestId("hero-instrument").getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("terminal-result")).toBeVisible({ timeout: 20_000 });
}

test("waits for a check that came back with a record", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.getByTestId("install-prompt")).toHaveCount(0);
  await checkInPlace(page, PNR.mixed);
  await expect(page.getByTestId("install-prompt")).toBeVisible();
  await expect(page.getByTestId("install-prompt")).toContainText("On iPhone: Share, then Add to Home Screen.");
});

test("is put away through Not now, for a month, not just this page", async ({ page }) => {
  await gotoReady(page, "/");
  await checkInPlace(page, PNR.mixed);
  const prompt = page.getByTestId("install-prompt");
  await prompt.getByTestId("install-dismiss").click();
  await expect(prompt).toBeHidden();
  await page.reload();
  await page.locator("html[data-hydrated]").waitFor();
  await checkInPlace(page, PNR.mixed);
  await expect(prompt).toHaveCount(0);
});

// Its words wrap in its plate, never cut off, on the narrowest phone and with the text at 200%.
for (const { viewport, text } of [
  { viewport: { width: 320, height: 568 }, text: "100%" },
  { viewport: { width: 390, height: 844 }, text: "200%" },
] as const) {
  test(`reads to the end at ${viewport.width}×${viewport.height}, its text at ${text}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    if (text === "200%") await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));
    await gotoReady(page, "/");
    await checkInPlace(page, PNR.mixed);
    await expect(page.getByTestId("install-prompt")).toBeVisible();
    expect(await cutText(page, '[data-testid="install-prompt"]')).toEqual([]);
  });
}
