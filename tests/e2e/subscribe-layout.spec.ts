import { messages } from "@/messages";
import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";
import { layoutBreaks } from "./layout";
import { UNSUBSCRIBE } from "./subscribe-link";

// What responsive.spec.ts's sweep cannot see. `layoutBreaks` reports sideways scroll, boxes past the
// edge and boxes that HIDE content; a form squeezed to a few pixels beside its consent line is none of
// those, so the slim band's form is measured here directly, as boxes.

/**
 * The sign-up left the footer on 2026-10-01 and is the "Updates by email" band above it; on an app page that is the
 * slim band, one column on a phone. The compact footer's rule was `min-w-[240px]` on its form, which collapsed to 22px
 * at 390px when the class was removed. The band has no such rule to lose: its form is a block in a one-column grid, so
 * it is asserted as that, the band's column wide, and never under FORM_MIN.
 *
 * The field's own width is the form minus the button and the gap, and the button's width depends on how
 * the display font draws "Subscribe", so it is only sanity-checked, against one loose floor for all
 * widths: it guards against the button eating the row. Per-width floors fitted to one machine's font
 * metrics were here first; they failed on CI by 3px and were removed.
 */
const FORM_MIN = 240;
const FIELD_MIN = 120;
const PHONES = [320, 360, 390] as const;
const m = messages.subscribe.page.unsubscribe;

test.describe("sign-up and unsubscribe layout on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "runs once, on the phone project, across the widths");

  for (const width of PHONES) {
    test(`the slim band's field keeps its width and the consent line sits below it at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      // Any shown path but "/": the landing draws the full band.
      await gotoReady(page, "/accuracy");
      const band = page.locator("#updates");
      const form = band.locator("form").filter({ has: page.locator("input[name='email']") });
      const field = form.locator("input[name='email']");
      const consent = band.locator("p", { has: page.locator("a[href='/privacy']") });
      await expect(field).toBeVisible();
      const [f, c, o, column] = await Promise.all([field.boundingBox(), consent.boundingBox(), form.boundingBox(), band.locator("hr").boundingBox()]);
      if (!f || !c || !o || !column) throw new Error("the slim band's form, field, consent line or rule is not drawn");
      const measured = `form ${Math.round(o.width)}x${Math.round(o.height)}, field ${Math.round(f.width)}x${Math.round(f.height)} at y ${Math.round(f.y)}, consent ${Math.round(c.width)}x${Math.round(c.height)} at y ${Math.round(c.y)}`;
      expect(o.width, `the form is under ${FORM_MIN}px: ${measured}`).toBeGreaterThanOrEqual(FORM_MIN);
      expect(Math.round(o.width), `the form is not the band's column wide: ${measured}`).toBe(Math.round(column.width));
      expect(f.width, `the button is eating the row, the field is under ${FIELD_MIN}px: ${measured}`).toBeGreaterThanOrEqual(FIELD_MIN);
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
