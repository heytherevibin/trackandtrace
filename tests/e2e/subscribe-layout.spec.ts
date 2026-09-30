import { messages } from "@/messages";
import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";
import { layoutBreaks } from "./layout";
import { UNSUBSCRIBE } from "./subscribe-link";

// What responsive.spec.ts's sweep cannot see. `layoutBreaks` reports sideways scroll, boxes past the
// edge and boxes that HIDE content; a form squeezed to a few pixels beside its consent line is none of
// those, so the compact footer's width is measured here directly, as boxes.

/**
 * Per-width floors for the compact footer's field, each just under what is measured (194, 234 and
 * 264px). At 320px the field sits beside the 76px button, which is why it is the narrowest; the
 * collapse this guards against leaves single digits, and a floor this close also catches a field
 * that has quietly lost a tenth of its width.
 */
const FIELD_MIN = { 320: 190, 360: 230, 390: 260 } as const;
const PHONES = [320, 360, 390] as const;
const m = messages.subscribe.page.unsubscribe;

test.describe("sign-up and unsubscribe layout on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "runs once, on the phone project, across the widths");

  for (const width of PHONES) {
    test(`the compact footer's field keeps its width and the consent line sits below it at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      // Any path but "/": the landing draws the full footer, whose sign-up is a column.
      await gotoReady(page, "/accuracy");
      const field = page.locator("footer form input[name='email']");
      const consent = page.locator("footer p", { has: page.locator("a[href='/privacy']") });
      await expect(field).toBeVisible();
      const [f, c] = await Promise.all([field.boundingBox(), consent.boundingBox()]);
      if (!f || !c) throw new Error("the compact footer's field or consent line is not drawn");
      const measured = `field ${Math.round(f.width)}x${Math.round(f.height)} at y ${Math.round(f.y)}, consent ${Math.round(c.width)}x${Math.round(c.height)} at y ${Math.round(c.y)}`;
      expect(f.width, `the email field is under its ${FIELD_MIN[width]}px floor: ${measured}`).toBeGreaterThanOrEqual(FIELD_MIN[width]);
      expect(c.y, `the consent line sits beside the form, not below it: ${measured}`).toBeGreaterThanOrEqual(f.y + f.height);
    });
  }

  for (const width of PHONES) {
    test(`unsubscribe, before and after the press, fits ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      // The route stubbed, so the After state draws without a database behind it.
      await page.route("**/api/unsubscribe", (route) => route.fulfill({ json: { ok: true, state: "done" } }));
      await gotoReady(page, UNSUBSCRIBE.valid);
      const press = page.getByRole("button", { name: m.button, exact: true });
      await expect(press).toBeVisible();
      expect(await layoutBreaks(page), "before the press").toEqual([]);

      await press.click();
      await expect(page.getByText(m.whyLegend)).toBeVisible();
      expect(await layoutBreaks(page), "after the press").toEqual([]);

      // Every choice is at least a 44px target.
      const choices = page.locator("fieldset label");
      await expect(choices).toHaveCount(m.reasons.length);
      const heights = await choices.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      for (const height of heights) expect(height, `choice heights ${heights.join(", ")}`).toBeGreaterThanOrEqual(44);
    });
  }
});
