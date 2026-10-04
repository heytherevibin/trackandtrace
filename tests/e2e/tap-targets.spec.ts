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

// The rule that makes a pressable `relative` on a touch screen (so its overlay is its own) is in the base layer, under
// every utility: a control that places itself keeps its place. Unlayered, it beat them all, whatever their specificity,
// and the date field's calendar button fell out of its field (pre-booking.spec.ts). Read here against test-only
// controls on a real page, placed by rules in the utilities layer as Tailwind's are: each keeps the position it asked
// for, carries the overlay, and answers across 44px from a drawn 20.
test("a control that places itself keeps its place under a finger, and still answers across 44px", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the coarse-pointer rule is a touch screen's");
  await gotoReady(page, "/privacy");
  const read = await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("@layer utilities { .t-absolute { position: absolute; } .t-fixed { position: fixed; } .t-sticky { position: sticky; } }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const box = document.createElement("div");
    box.id = "placed";
    box.setAttribute("style", "position: relative; height: 320px;");
    const controls = (
      [
        ["Plain", "", "margin: 40px 0 0 40px;"],
        ["Absolute", "t-absolute", "left: 40px; top: 120px;"],
        ["Sticky", "t-sticky", "left: 40px; top: 0; margin: 160px 0 0 40px;"],
        ["Fixed", "t-fixed", "left: 40px; top: 700px; z-index: 9999;"],
      ] as const
    ).map(([name, className, place]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.setAttribute("aria-label", name);
      button.setAttribute("style", `display: block; width: 20px; height: 20px; padding: 0; ${place}`);
      box.append(button);
      return button;
    });
    document.querySelector("main")?.prepend(box);
    return controls.map((button) => {
      const overlay = getComputedStyle(button, "::after");
      return `${button.getAttribute("aria-label")}: ${getComputedStyle(button).position}, overlay ${overlay.content === "none" ? "none" : `${overlay.position} ${overlay.width} by ${overlay.height}`}`;
    });
  });
  expect(read).toEqual(["Plain: relative, overlay absolute 44px by 44px", "Absolute: absolute, overlay absolute 44px by 44px", "Sticky: sticky, overlay absolute 44px by 44px", "Fixed: fixed, overlay absolute 44px by 44px"]);
  expect(report(await undersizedTargets(page, "#placed"))).toEqual([]);
});

// `static` is the one position a control cannot take: it is then no containing block, and its overlay is laid over an
// ancestor's box instead of its own. The hit-walk says so (targets.ts), since reach alone would not.
test("the hit-walk reports a control that says static, whose overlay is not its own", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the coarse-pointer rule is a touch screen's");
  await gotoReady(page, "/privacy");
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("@layer utilities { .t-static { position: static; } }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const box = document.createElement("div");
    box.id = "statics";
    box.setAttribute("style", "position: relative; padding: 40px;");
    for (const [name, className] of [
      ["Static", "t-static"],
      ["Relative", ""],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.setAttribute("aria-label", name);
      button.setAttribute("style", "display: block; width: 20px; height: 20px; padding: 0; margin: 0 0 40px;");
      box.append(button);
    }
    document.querySelector("main")?.prepend(box);
  });
  expect(report(await undersizedTargets(page, "#statics"))).toEqual(["Static [20x20] is position: static, so its 44px overlay is an ancestor's, not its own"]);
});
