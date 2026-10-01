import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";
import { drawStill, waitForJourney } from "./journey/journey-helpers";
import { layoutBreaks } from "./layout";
import { UNSUBSCRIBE } from "./subscribe-link";

// Every route fits a phone: no sideways page scroll, nothing drawn past the screen edge, and no
// container that hides part of its content (a clipped nav strip, a table wider than its plate).

const WIDTHS = [320, 360, 390, 768] as const;
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

// layoutBreaks leaves alone only what the run's pin clips (layout.ts, CARRIED): a box that clips its content, and content
// past the window's side, are still found everywhere else.
test("layoutBreaks still finds a box that hides its content, and a box past the window's side", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's width");
  await page.setViewportSize({ width: 360, height: 844 });
  await gotoReady(page, "/privacy");
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

// The run's track runs on past the window's side by design, clipped by its pin: layoutBreaks leaves what the pin clips
// alone (layout.ts, CARRIED) on the strength of this. At every phone width it pins at, each station at its resting point
// stands wholly inside the pin and the window, and the page never scrolls sideways. (At 280 and 320, and at 200% text,
// its stations do not fit the window: it stays the two sections, measured by the sweep below.)
for (const width of [360, 390] as const) {
  test(`on a phone ${width}px wide, each station of the run at rest stands wholly in the window, and the page never scrolls sideways`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone's widths, and its resting points");
    test.setTimeout(90_000);
    await drawStill(page); // the run is what is measured; the live drawing would only slow the software GPU
    await page.setViewportSize({ width, height: 844 });
    await gotoReady(page, "/");
    await waitForJourney(page);
    await expect(page.locator("#run")).toHaveClass(/is-running/);
    const rests = await page.locator("#run .run-snap").evaluateAll((marks) => {
      const run = document.getElementById("run");
      if (!run) throw new Error("#run is missing");
      const top = run.getBoundingClientRect().top + window.scrollY;
      return marks.map((m) => Math.round(top + Number.parseFloat((m as HTMLElement).style.top)));
    });
    expect(rests).toHaveLength(6);
    for (const [i, y] of rests.entries()) {
      await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
      const fit = () =>
        page.evaluate((k) => {
          const station = document.querySelectorAll("#run [data-station]")[k]?.getBoundingClientRect();
          const pin = document.querySelector("#run .run-pin")?.getBoundingClientRect();
          const train = document.querySelector("#run .run-train")?.getBoundingClientRect();
          if (!station || !pin || !train) throw new Error("no such station, or no pin");
          const vw = document.documentElement.clientWidth;
          window.scrollBy({ left: 400, behavior: "instant" });
          return {
            off: Math.abs(Math.round(station.left + station.width / 2 - (train.left + train.width / 2))),
            inside: station.left >= Math.max(pin.left, 0) - 1 && station.right <= Math.min(pin.right, vw) + 1,
            box: `[${Math.round(station.left)}, ${Math.round(station.right)}] in [${Math.round(pin.left)}, ${Math.round(pin.right)}]`,
            sideways: [document.documentElement.scrollWidth - vw, window.scrollX],
          };
        }, i);
      // the track eases to the station: at rest once it stands at the train (within 3px, as run.spec.ts judges it)
      await expect.poll(async () => (await fit()).off, { timeout: 20_000 }).toBeLessThanOrEqual(3);
      const at = await fit();
      expect(at.inside, `station ${i} ${at.box}`).toBe(true);
      expect(at.sideways, `station ${i}: the page's sideways overflow, and its scroll after a sideways scroll`).toEqual([0, 0]);
    }
  });
}

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
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});
