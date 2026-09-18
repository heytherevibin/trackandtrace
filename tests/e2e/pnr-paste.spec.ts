import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";

// Pasting a PNR: the real input lies over the drawn cells, so a right-click or long-press
// on them opens the browser's own Paste, and a clipboard paste fills all ten cells.

test("a right-click or long-press on the cells lands on the real input", async ({ page }) => {
  await gotoReady(page, "/");
  const target = await page.locator("[data-cell='5']").first().evaluate((cell) => {
    const box = cell.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit instanceof HTMLInputElement ? hit.name : hit?.tagName ?? null;
  });
  expect(target).toBe("pnr");
});

test("a PNR copied from the booking SMS pastes whole into the cells", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await gotoReady(page, "/");
  const plate = page.getByTestId("hero-instrument");
  await plate.getByLabel("PNR number").click();
  await page.keyboard.type("98");
  await page.evaluate((pnr) => navigator.clipboard.writeText(`PNR:${pnr},TRN:12951,DOJ:17-09-26`), PNR.notFound);
  await page.keyboard.press("ControlOrMeta+V");
  await expect(plate.locator("[data-filled]")).toHaveCount(10);
  await expect(page.getByLabel("PNR number").first()).toHaveValue("234 567 8900");
  await expect(plate.getByText("10 / 10")).toBeVisible();
});
