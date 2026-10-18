import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";
import { drawStill, waitForJourney } from "./journey/journey-helpers";
import { layoutBreaks } from "./layout";
import { UNSUBSCRIBE } from "./subscribe-link";
import { LANDING_WITH_RECORD, sweepAt200, text200 } from "./text-200";

// Every route fits a phone: no sideways page scroll, nothing drawn past the screen edge, and no
// container that hides part of its content (a clipped nav strip, a table wider than its plate).

const WIDTHS = [280, 320, 360, 390, 768] as const;
const ROUTES = ["/", "/watchlist", "/pre-booking", "/accuracy", "/login", "/account", `/pnr#${PNR.mixed}`, `/pnr#${PNR.notFound}`, "/pnr/abc", "/check", "/privacy", "/tos", "/offline", "/nowhere", "/subscribe/confirm", "/unsubscribe", UNSUBSCRIBE.valid] as const;

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

// layoutBreaks still finds a box that clips its content and content past the window's side.
test("layoutBreaks still finds a box that hides its content, and a box past the window's side", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's width");
  await drawStill(page);
  await page.setViewportSize({ width: 360, height: 844 });
  await gotoReady(page, "/");
  await waitForJourney(page);
  await page.evaluate(() => {
    const strip = document.createElement("div");
    strip.id = "clipped-strip";
    strip.setAttribute("style", "width: 200px; overflow: clip; white-space: nowrap;");
    strip.textContent = "A strip of words much wider than the box it is clipped by, whatever it says.";
    const wide = document.createElement("div");
    wide.id = "too-wide";
    wide.setAttribute("style", "position: fixed; top: 100px; left: 300px; width: 200px; height: 20px;");
    document.querySelector("main")?.prepend(strip, wide);
  });
  const breaks = await layoutBreaks(page);
  expect(breaks).toContainEqual(expect.stringMatching(/^hides \d+px of its content: div#clipped-strip/));
  expect(breaks).toContainEqual(expect.stringMatching(/^past the edge \[300, 500\]: div#too-wide/));
});

// layoutBreaks also leaves alone two things a wide window or large text brings (layout.ts): the hero's dial, a drawing
// behind the page's words that `main` clips at the page's edge by design, and a reader's own scroller: one of the three
// named tables (layout.ts lists them), a region with a name in the Tab order, at or above the width where that table is
// a table. Only those: content past the edge of the same `main`, a scroller a reader cannot reach, a scroller that is
// none of the three, and any of the three scrolling below its width (a phone) are found.
function plantScrollers(page: import("@playwright/test").Page): Promise<void> {
  return page.evaluate(() => {
    const scroller = (id: string, name: string | null, reachable: boolean) => {
      const box = document.createElement("div");
      box.id = id;
      box.setAttribute("style", "width: 200px; overflow-x: auto;");
      box.setAttribute("role", "region");
      box.setAttribute("aria-label", "A table");
      if (name) box.dataset.scrollRegion = name;
      box.dataset.scrolls = "yes";
      if (reachable) box.tabIndex = 0;
      const wide = document.createElement("div");
      wide.setAttribute("style", "width: 600px; height: 20px;");
      wide.textContent = "wide";
      box.append(wide);
      return box;
    };
    document.querySelector("main")?.prepend(scroller("listed", "passengers", true), scroller("unreachable", "passengers", false), scroller("unlisted", null, true));
  });
}

test("layoutBreaks leaves a reader's own scroller alone, and nothing else like it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "runs once, on the phone project, at a desk's width");
  await drawStill(page);
  await page.setViewportSize({ width: 1280, height: 844 });
  await gotoReady(page, "/");
  await waitForJourney(page);
  expect(await layoutBreaks(page)).toEqual([]);
  await plantScrollers(page);
  const scrollers = await layoutBreaks(page);
  expect(scrollers).toContainEqual(expect.stringMatching(/^hides 400px of its content: div#unreachable/));
  expect(scrollers).toContainEqual(expect.stringMatching(/^hides 400px of its content: div#unlisted/));
  expect(scrollers.filter((b) => b.includes("div#listed")), "a named, focusable scroller, one of the three, where its table is a table").toEqual([]);
  // real content past the page's edge: still found
  await page.evaluate(() => {
    const wide = document.createElement("p");
    wide.id = "past-the-page";
    wide.setAttribute("style", "width: 1600px; margin: 0;");
    wide.textContent = "Words wider than the page.";
    document.querySelector("main")?.prepend(wide);
  });
  const past = await layoutBreaks(page);
  expect(past).toContainEqual(expect.stringMatching(/^past the edge \[\d+, \d+\]: p#past-the-page/));
});

test("on a phone no scroller is a reader's own: the same named region below the width its table stands at is found", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's width");
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoReady(page, "/privacy");
  await plantScrollers(page);
  expect(await layoutBreaks(page)).toContainEqual(expect.stringMatching(/^hides 400px of its content: div#listed/));
});

// The defect that rule is for, planted: the passenger table made to need 700px. At 100% on a phone that is a table a
// reader must scroll sideways, and the 100% sweep ("every route fits") has to say so.
test("a passenger table that needs sideways scrolling on a phone at 100% is a break", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's width");
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoReady(page, `/pnr#${PNR.mixed}`);
  await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[data-scroll-region="passengers"]')).toBeVisible();
  expect(await layoutBreaks(page), "as drawn").toEqual([]);
  await page.addStyleTag({ content: '[data-scroll-region="passengers"] table { min-width: 700px; }' });
  expect(await layoutBreaks(page)).toContainEqual(expect.stringMatching(/^hides \d+px of its content: div "Passenger/));
});

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
        // The landing is measured as the journey leaves it, not in the race with it: the run pins (#run.is-running) a
        // few frames after hydration where its stations fit (360px and up), and this sweep once measured either page.
        if (route === "/") await waitForJourney(page);
        // A page still loading shows skeletons, whose sheen (utilities.css) slides past each block's clipped edge
        // and reads as hidden content mid-slide. The layout measured is the one the reader is left with: on a slow
        // runner the record's first ask can outlast the sheen's first pass (CI #72, /pnr#… at 360px).
        await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 30_000 });
        const breaks = await layoutBreaks(page);
        if (breaks.length > 0) failures.push(`${route}\n  ${breaks.join("\n  ")}`);
      }
      // And the landing with a record in its check plate: the one state of a route whose table once ran out of the
      // window (four columns, under 352px), where the page cut its last column off. It stacks there now.
      await LANDING_WITH_RECORD.open(page);
      const breaks = await layoutBreaks(page);
      if (breaks.length > 0) failures.push(`${LANDING_WITH_RECORD.name}\n  ${breaks.join("\n  ")}`);
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});

// Every traveller page, in each state the fixture server can draw, with its text at 200% (text-200.ts): nothing scrolls
// sideways, no text is cut, no word is broken where its line could have held it (a word longer than its whole line
// does break: "Karnatak/a" at 280px), every control answers a finger across 44px, no field is too narrow to type in or
// to show the value it holds. Three widths on every PR, each the tightest of its layout: the narrowest phone (280), the first width where
// tables are tables and the page is still one column (640), and the first where the desk's columns stand (1024). The
// nightly runs all nine widths, one test a page and width, with the landing's drawing live (nightly/text-200.spec.ts);
// here the landing draws still, which costs the software GPU nothing.
test.describe("every page with its text at 200%", () => {
  test.skip(({ isMobile }) => !isMobile, "runs once, on the phone project (a touch screen), across the widths");

  for (const width of [280, 640, 1024] as const) {
    test(`reflows at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await drawStill(page);
      await text200(page);
      await page.setViewportSize({ width, height: 844 });
      const failures = await sweepAt200(page);
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});

// layoutBreaks sees what runs past the window or a box that clips, not a row running past a bordered box that does not
// clip: the roadmap's rows at 280 at 100% (their 200px and 220px minimums ran 5px past the list's border).
test("at 280px every roadmap row stands inside the list's border", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's width");
  await page.setViewportSize({ width: 280, height: 844 });
  await gotoReady(page, "/");
  await waitForJourney(page);
  const out = await page.locator("#roadmap ul").evaluate((ul) => {
    const box = ul.getBoundingClientRect();
    return [...ul.querySelectorAll("li *")].flatMap((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1) ? [`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}" [${Math.round(r.left)}, ${Math.round(r.right)}] in [${Math.round(box.left)}, ${Math.round(box.right)}]`] : [];
    });
  });
  expect(out).toEqual([]);
});
