import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";

// A finger is not a cursor. On a touch screen every control the reader aims at must answer across
// at least 44x44, whatever the drawing gives it. This measures the HIT area, not the painted box:
// a control keeps its drawn size and carries a transparent overlay (the coarse-pointer rule in
// motion.css), so the only honest test is to hit-test real points and see what answers.

// /pnr#<notFound> settles on the PageHeader's back link, which a found record shows only while it
// is still resolving: CI measured that moment and this machine did not, so the link's missing hit
// area reached review and not the suite. The list is the axe scan's, so the two stay comparable.
const ROUTES = ["/", "/watchlist", "/pre-booking", "/accuracy", "/privacy", "/tos", "/login", "/account", `/pnr#${PNR.mixed}`, `/pnr#${PNR.notFound}`, "/pnr/abc", "/nowhere", "/offline"] as const;

const MIN = 44;

interface Undersized {
  readonly name: string;
  readonly box: string;
  readonly missed: string;
}

/**
 * Measures how far each control actually answers, by walking outward from its centre until
 * something else replies, and reports the ones that reach less than 44px across. The reach is
 * measured, not assumed to be centred: a narrow control beside a neighbour grows to one side
 * (.tap-44-start), and that is still 44px of target. A point answered by a DIFFERENT control
 * ends the walk — an overlay that swallows its neighbour shortens the neighbour, and shows up here.
 * A walk that leaves the viewport also ends: the reader cannot reach there either.
 */
async function undersizedTargets(page: import("@playwright/test").Page, within = "body"): Promise<readonly Undersized[]> {
  return page.evaluate(
    ({ min, within }) => {
      const SELECTOR = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary';
      const reach = min; // how far the walk may go from the centre before giving up
      const root = document.querySelector(within);
      if (!root) throw new Error(`nothing matches ${within}`);
      const out: { name: string; box: string; missed: string }[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) {
        if (!el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true })) continue;
        if (el.closest(".sr-only")) continue; // the skip link, revealed only on focus
        if (el.tagName === "A" && el.closest("p, li, dd")) continue; // a link in running text is prose
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // A field is a replaced element and takes no pseudo-element, so it cannot carry an overlay.
        // The drawn 40px well is the whole target; growing it would change the drawing. Named here
        // rather than silently skipped: a field under 40px is still a failure.
        if (el.matches("input, select, textarea") && r.height >= 40) continue;
        // elementFromPoint only answers inside the viewport, so bring the control into it first and
        // re-read the box. Centred, so the sticky masthead never sits on what is being measured.
        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        const seen = el.getBoundingClientRect();
        const cx = seen.left + seen.width / 2;
        const cy = seen.top + seen.height / 2;
        const answers = (x: number, y: number): boolean => {
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
          const hit = document.elementFromPoint(x, y);
          return hit === el || el.contains(hit) || hit?.closest(SELECTOR) === el;
        };
        const reachFrom = (dx: number, dy: number): number => {
          let far = 0;
          for (let d = 1; d <= reach; d += 1) {
            if (!answers(cx + dx * d, cy + dy * d)) break;
            far = d;
          }
          return far;
        };
        const width = reachFrom(-1, 0) + reachFrom(1, 0) + 1;
        const height = reachFrom(0, -1) + reachFrom(0, 1) + 1;
        if (width < min || height < min) {
          out.push({
            name: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 32) || el.tagName,
            box: `${Math.round(r.width)}x${Math.round(r.height)}`,
            missed: `reaches ${width}x${height}`,
          });
        }
      }
      return out;
    },
    { min: MIN, within },
  );
}

const report = (missed: readonly Undersized[]): readonly string[] => missed.map((m) => `${m.name} [${m.box}] ${m.missed}`);

for (const route of ROUTES) {
  test(`${route} answers a finger across 44px`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "tap targets are a touch-screen concern");
    await gotoReady(page, route);
    expect(report(await undersizedTargets(page))).toEqual([]);
  });
}

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
