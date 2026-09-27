import { expect, test } from "../fixtures";
import { waitForJourney } from "./journey-helpers";

test("the frame meter shows only when asked for, says which drawing is shown, and closes", async ({ page }) => {
  await page.goto("/");
  await waitForJourney(page);
  await expect(page.locator(".journey-hud")).toHaveCount(0);
  await page.goto("/?journey-hud");
  await waitForJourney(page);
  const hud = page.locator(".journey-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText(/drawing (live|still)/);
  await expect(hud).toContainText(/fps \d+ {3}p95/);
  // the page's bottom-right corner, 12px in (journey-island.css)
  const box = await hud.boundingBox();
  const size = page.viewportSize();
  expect(box && size ? [Math.round(size.width - box.x - box.width), Math.round(size.height - box.y - box.height)] : null).toEqual([12, 12]);
  await hud.getByRole("button", { name: "Close the frame meter" }).click();
  await expect(hud).toHaveCount(0);
});
