import { expect, test } from "../fixtures";
import { frames, scrollToId, waitForJourney } from "./journey-helpers";

// The places the journey keeps (J5-17, J5-19): a change of height above 02 (the live drawing pinning, J5) must never
// throw a reader inside 02 when Motion then goes off; and Back, Forward, Back finds the reader's place each time.

test.describe("the reader's place", () => {
  test.skip(({ isMobile }) => isMobile, "02 pins on wide screens; one project is enough");

  test("a change above 02 never throws a reader inside it when Motion then goes off", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    // Something above 02 grows by two windows and says so, as the live drawing's pin will.
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = `${window.innerHeight * 2}px`;
      document.getElementById("principles")?.after(spacer);
      window.dispatchEvent(new Event("tt:layout"));
    });
    await frames(page); // the grown page has laid out (tt:layout's listeners ran inside dispatchEvent)
    const vh = page.viewportSize()?.height ?? 800;
    await scrollToId(page, "how", -Math.round(vh * 2.5)); // well inside 02, past where its stale box would end
    await frames(page); // the scroll event has reached the guard, which learns the reader's place from it
    // Through the DOM, never Playwright's click, which scrolls the footer's switch into view first and would carry
    // the reader past 02's end before Motion goes off (as chapters.spec.ts's switch does).
    await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/); // the collapse has happened
    await frames(page, 3); // its height, then its padding a frame later, then the guard's settle
    const [top, foot] = await page.evaluate(() => [document.getElementById("how")?.getBoundingClientRect().top ?? 0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0]);
    expect(Math.abs(top - foot)).toBeLessThanOrEqual(24); // at 02's own start (its scroll margin), not thrown past it
  });

  test("Back, Forward, then Back again finds the reader's place each time", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "record", 120);
    await frames(page); // the scroll has been sampled
    const before = await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top);
    const drift = async () => Math.abs((await page.locator("#record").evaluate((el) => el.getBoundingClientRect().top)) - before);
    const away = page.getByLabel("Primary").getByRole("link", { name: "Watchlist" });
    await away.click();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect.poll(drift).toBeLessThanOrEqual(4); // the restore has landed
    await page.goForward();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect.poll(drift).toBeLessThanOrEqual(4);
  });
});
