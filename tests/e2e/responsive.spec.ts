import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";
import { layoutBreaks } from "./layout";

// Every route fits a phone: no sideways page scroll, nothing drawn past the screen edge, and no
// container that hides part of its content (a clipped nav strip, a table wider than its plate).

const WIDTHS = [320, 360, 390, 768] as const;
const ROUTES = ["/", "/watchlist", "/pre-booking", "/accuracy", "/login", "/account", `/pnr#${PNR.mixed}`, `/pnr#${PNR.notFound}`, "/pnr/abc", "/check", "/privacy", "/tos", "/offline", "/nowhere"] as const;

const SAVED = [
  {
    pnr: PNR.mixed,
    label: "12627 · SBC→NDLS · 19 Sept",
    addedAt: "2026-09-16T04:30:00.000Z",
    checks: [
      { at: "2026-09-16T04:30:00.000Z", status: "WL", position: 14 },
      { at: "2026-09-17T04:30:00.000Z", status: "RAC", position: 4 },
    ],
  },
  { pnr: PNR.cnf, label: "12951 · BCT→NDLS · 21 Sept", addedAt: "2026-09-16T04:30:00.000Z", checks: [] },
];

test.describe("phone and tablet widths", () => {
  test.skip(({ isMobile }) => !isMobile, "runs once, on the phone project, across the widths");

  for (const width of WIDTHS) {
    test(`every route fits ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((saved) => window.localStorage.setItem("tt.watchlist.v2", JSON.stringify(saved)), SAVED);
      const failures: string[] = [];
      for (const route of ROUTES) {
        await gotoReady(page, route);
        const breaks = await layoutBreaks(page);
        if (breaks.length > 0) failures.push(`${route}\n  ${breaks.join("\n  ")}`);
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});
