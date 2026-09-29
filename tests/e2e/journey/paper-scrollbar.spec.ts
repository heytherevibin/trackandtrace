import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { waitForLive } from "./journey-helpers";
import { STAGES, geometry, into } from "./paper-helpers";

// The paper under a pinned stage reaches past the page frame to the window's edges (paper.spec.ts), as 100vw: the window
// with its scrollbar. Beside a classic scrollbar, which takes room from the page, that is half a scrollbar past each
// edge, the one case in which the sheet could push the page sideways.
//
// A classic scrollbar is forced, so this never depends on the machine: Chromium hides scrollbars when headless (the
// switch is dropped here), and macOS draws overlay scrollbars that take no room unless a page styles its own. A test
// stylesheet does, as a page with ::-webkit-scrollbar styles gets a classic bar everywhere, whatever the system says.
// Should a browser still give it no room, the tests skip, saying so, rather than pass or fail on nothing.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const CLASSIC = "html { scrollbar-width: auto !important; scrollbar-color: auto !important; } ::-webkit-scrollbar { width: 12px; height: 12px; } ::-webkit-scrollbar-thumb { background: #888; }";

async function classicScrollbar(page: Page): Promise<void> {
  await page.addInitScript((rules) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(rules);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, CLASSIC);
}

async function sideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("beside a classic scrollbar", () => {
  for (const width of [1024, 1280, 1440]) {
    for (const hero of ["as it is", "without the hero dial's own clip"] as const) {
      test(`${width}px, hero ${hero}: the page never scrolls sideways, pinned or not`, async ({ page, isMobile }) => {
        test.skip(isMobile, "a phone's scrollbar overlays the page");
        await classicScrollbar(page);
        await page.setViewportSize({ width, height: 900 });
        await gotoReady(page, "/");
        await waitForLive(page);
        const bar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
        if (bar === 0) console.warn(`paper-scrollbar: no classic scrollbar at ${width}px in this browser; skipped, not passed`);
        test.skip(bar === 0, "this browser gave the forced classic scrollbar no room: nothing to measure");
        // The landing's #main also clips for the hero dial (journey.css); the sheet must not depend on it.
        if (hero !== "as it is") await page.evaluate(() => document.querySelectorAll(".hero-dial").forEach((dial) => dial.remove()));
        for (const stage of Object.values(STAGES)) {
          for (const [p, px] of [[0, -240], [0.5, 0], [1, 240]] as const) {
            await into(page, stage, p, px);
            expect(await sideways(page), `${stage.section} at ${p}${px ? `${px > 0 ? "+" : ""}${px}px` : ""}`).toBeLessThanOrEqual(0);
            if (p === 0.5) {
              await expect(page.locator(stage.section)).toHaveClass(stage.pinned);
              const g = await geometry(page, stage);
              // Half a scrollbar past each edge, cut by the clip (scrollWidth above); what shows covers the page.
              expect(g.paper!.left).toBeLessThanOrEqual(0.5);
              expect(g.paper!.right).toBeGreaterThanOrEqual(g.vw - 0.5);
            }
          }
        }
      });
    }
  }
});
