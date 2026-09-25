import { expect, test, type Page } from "@playwright/test";
import { motionOff, waitForJourney } from "./journey-helpers";

async function roadmapAt(page: Page, fraction: number): Promise<void> {
  await page.evaluate((f) => {
    const s = document.getElementById("roadmap")!;
    const top = s.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - window.innerHeight * 0.75 + (s.offsetHeight + window.innerHeight * 0.65) * f, behavior: "instant" });
  }, fraction);
}
const laid = (page: Page) => page.locator("#roadmap .route-sleeper.is-laid").count();

test.describe("05 · the route, laid by scroll", () => {
  test.skip(({ isMobile }) => isMobile, "the route map draws from 40rem");

  test("lays the line and lights the rows as the page scrolls, and takes them up again going back", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    const all = await page.locator("#roadmap .route-sleeper").count();
    await roadmapAt(page, 0.02);
    await expect.poll(() => laid(page)).toBeLessThan(all / 4);
    await roadmapAt(page, 1.2);
    await expect.poll(() => laid(page)).toBe(all);
    await expect(page.locator("#roadmap li.is-passed")).toHaveCount(7);
    await expect(page.locator("#roadmap .route-train")).toHaveAttribute("transform", /rotate\(/);
    await roadmapAt(page, 0.02);
    await expect.poll(() => laid(page)).toBeLessThan(all / 4);
  });

  test("Motion off: the line is drawn, and no row is lit", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await roadmapAt(page, 0.02);
    const all = await page.locator("#roadmap .route-sleeper").count();
    expect(await laid(page)).toBe(all);
    await expect(page.locator("#roadmap li.is-passed")).toHaveCount(0);
  });
});
