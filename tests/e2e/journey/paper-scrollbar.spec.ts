import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { waitForLive } from "./journey-helpers";
import { STAGES, geometry, into } from "./paper-helpers";

// The paper under a pinned stage reaches past the page frame to the window's edges (paper.spec.ts).
// Chromium hides scrollbars when headless; without that switch it draws the page's own thin classic one (11px here),
// which 100vw includes and the layout width does not: the one case in which a full-bleed sheet could push the page
// sideways. Desktop widths, since a phone's scrollbar overlays the page.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.describe("beside a classic scrollbar", () => {
  for (const width of [1024, 1280, 1440]) {
    test(`${width}px: the page never scrolls sideways, pinned or not`, async ({ page, isMobile }) => {
      test.skip(isMobile, "a phone's scrollbar overlays the page");
      await page.setViewportSize({ width, height: 900 });
      await gotoReady(page, "/");
      await waitForLive(page);
      const bar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
      expect(bar, "a classic scrollbar takes room").toBeGreaterThan(0);
      for (const stage of Object.values(STAGES)) {
        for (const p of [-0.15, 0.5, 1.15]) {
          await into(page, stage, p);
          const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(wide, `${stage.section} at ${p}`).toBeLessThanOrEqual(0);
          if (p === 0.5) {
            await expect(page.locator(stage.section)).toHaveClass(stage.pinned);
            const g = await geometry(page, stage);
            // 100vw is the window with its scrollbar: the sheet overhangs both sides by half of it, which the landing's
            // sideways clip cuts (the scrollWidth above); what shows covers the page from edge to edge.
            expect(g.paper!.left).toBeLessThanOrEqual(0.5);
            expect(g.paper!.right).toBeGreaterThanOrEqual(g.vw - 0.5);
          }
        }
      }
    });
  }
});
