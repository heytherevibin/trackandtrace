import { expect, test } from "../fixtures";
import { STATES, WIDTHS_AT_200, breaksAt200, text200 } from "../text-200";

// Nightly: every traveller page, in each state the fixture server can draw, with its text at 200% at nine widths
// (text-200.ts). One test a page and width, so a break names both. A touch screen at every width (a tablet, a touch
// laptop), so the 44px targets are measured as a finger finds them.
for (const width of WIDTHS_AT_200) {
  test.describe(`text at 200% at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: width < 500 });

    for (const state of STATES) {
      test(`${state.name} reflows`, async ({ page }) => {
        test.setTimeout(120_000);
        await text200(page);
        await state.open(page);
        expect(await breaksAt200(page)).toEqual([]);
      });
    }
  });
}
