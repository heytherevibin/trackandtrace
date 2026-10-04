import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";
import { report, undersizedTargets } from "./targets";

// A finger is not a cursor. On a touch screen every control the reader aims at must answer across
// at least 44x44, whatever the drawing gives it. This measures the HIT area, not the painted box:
// a control keeps its drawn size and carries a transparent overlay (the coarse-pointer rule in
// motion.css), so the only honest test is to hit-test real points and see what answers.

// /pnr#<notFound> settles on the PageHeader's back link, which a found record shows only while it
// is still resolving: CI measured that moment and this machine did not, so the link's missing hit
// area reached review and not the suite. The list began as the axe scan's and has
// deliberately diverged: axe.spec.ts now also scans /subscribe/confirm, /unsubscribe and the signed
// link, and this one does not. The unsubscribe page's reason radios are size-4 (16px) inside min-h-11 labels; the
// hit-walk (targets.ts) credits a wrapping <label> since the 200% text sweep (text-200.ts) took those pages in, and
// their 44px floor is also asserted from the rendered rect in subscribe-layout.spec.ts.
const ROUTES = ["/", "/watchlist", "/pre-booking", "/accuracy", "/privacy", "/tos", "/login", "/account", `/pnr#${PNR.mixed}`, `/pnr#${PNR.notFound}`, "/pnr/abc", "/nowhere", "/offline"] as const;

for (const route of ROUTES) {
  test(`${route} answers a finger across 44px`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "tap targets are a touch-screen concern");
    await gotoReady(page, route);
    expect(report(await undersizedTargets(page))).toEqual([]);
  });
}

// A phone on its side is wider than 48rem but too short for eleven 44px stops, which is why the owner-rejected
// route rail used to fall back to a hairline rail here; the rail is gone entirely now, so this only proves every
// remaining control still answers across 44px at that size.
test("/ on a phone on its side answers a finger across 44px", async ({ page, isMobile }) => {
  test.skip(!isMobile, "tap targets are a touch-screen concern");
  await page.setViewportSize({ width: 844, height: 390 });
  await gotoReady(page, "/");
  expect(report(await undersizedTargets(page))).toEqual([]);
});

test("the masthead sheet's controls answer a finger too", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the sheet is the phone's nav");
  await gotoReady(page, "/");
  await page.getByRole("banner").getByRole("button", { name: "Open menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  // Visible is not arrived: the sheet slides in from off-screen left, and a control measured
  // mid-slide sits at a negative x, where nothing answers at all.
  await expect.poll(async () => (await sheet.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
  // Only the sheet: the masthead behind it is covered, and nothing there is reachable anyway.
  expect(report(await undersizedTargets(page, '[role="dialog"]'))).toEqual([]);
});

test("a fine pointer is left exactly as drawn", async ({ page, isMobile }) => {
  test.skip(isMobile, "the overlay is the coarse-pointer rule; this is the other side of it");
  await gotoReady(page, "/");
  const overlay = await page.getByRole("button", { name: "Run", exact: true }).first().evaluate((el) => getComputedStyle(el, "::after").content);
  expect(overlay).toBe("none");
});
