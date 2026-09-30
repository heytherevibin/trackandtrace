import { expect, test } from "@playwright/test";
import { waitForJourney } from "./journey-helpers";

// The registration-mark cursor was removed by the owner on 2026-09-30. It hid the native pointer
// page-wide (`cursor: none !important` on every element) and drew a hairline cross in its place,
// which opened into four corner marks around whatever control the pointer rested on.
//
// What is left is this: the landing leaves the reader's own cursor alone. Kept as a test rather
// than deleted with the feature, because the failure it guards against is silent — a pointer that
// has vanished looks like a page that has frozen, and nothing in the DOM says why.

test.describe("the pointer on the landing", () => {
  test("is the reader's own, over the page and over a control", async ({ page, isMobile }) => {
    test.skip(isMobile, "a touch screen has no pointer to keep");
    await page.goto("/");
    await waitForJourney(page);

    await expect(page.locator(".reg-cursor")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/has-reg-cursor/);

    const bodyCursor = await page.locator("body").evaluate((el) => getComputedStyle(el).cursor);
    expect(bodyCursor).not.toBe("none");

    // A link still says it is a link, and a text field still shows a caret: removing the drawn
    // cursor must not have taken the ordinary affordances with it.
    const link = page.getByRole("banner").getByRole("link", { name: "Watchlist", exact: true });
    await link.hover();
    expect(await link.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");

    const field = page.getByTestId("hero-instrument").getByRole("textbox");
    expect(await field.evaluate((el) => getComputedStyle(el).cursor)).toBe("text");
  });

  test("nothing frames a control on hover", async ({ page, isMobile }) => {
    test.skip(isMobile, "fine pointers only");
    await page.goto("/");
    await waitForJourney(page);
    await page.getByRole("banner").getByRole("link", { name: "Watchlist", exact: true }).hover();
    await expect(page.locator(".reg-frame, .reg-cross, .reg-mark")).toHaveCount(0);
  });
});
