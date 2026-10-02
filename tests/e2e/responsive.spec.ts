import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";
import { drawStill, waitForJourney } from "./journey/journey-helpers";
import { brokenWords, cutText, layoutBreaks } from "./layout";
import { UNSUBSCRIBE } from "./subscribe-link";

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

// layoutBreaks leaves alone only what the run's pin clips (layout.ts, CARRIED), and only while it clips: a box that clips
// its content, content past the window's side, and the run's pin made a sideways scroller are still found.
test("layoutBreaks still finds a box that hides its content, a box past the window's side, and a pin that scrolls", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's width");
  await drawStill(page);
  await page.setViewportSize({ width: 360, height: 844 });
  await gotoReady(page, "/");
  await waitForJourney(page);
  await expect(page.locator("#run")).toHaveClass(/is-running/);
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
  expect(breaks.filter((b) => /KM \d{3}/.test(b)), "the run's pin, clipping as designed").toEqual([]);
  // the same pin, made a sideways scroller: a reader could scroll what it holds, so it is measured as any box is
  await page.addStyleTag({ content: "html[data-journey='on'] #run.is-running .run-pin { overflow-x: auto !important; overflow-y: hidden !important; }" });
  expect(await layoutBreaks(page)).toContainEqual(expect.stringMatching(/^hides \d+px of its content: div "KM \d{3}/));
});

// The run's track runs on past the window's side by design, clipped by its pin: layoutBreaks leaves what the pin clips
// alone (layout.ts, CARRIED) on the strength of this. At every width the sweep checks where the run pins (360, 390 and
// 768), each station at its resting point stands wholly inside the pin and the window, every word of it included, the
// pin clips (it never scrolls), and the page never scrolls sideways. At 280 and 320 its stations are too tall for the
// window, and at 200% text too: it stays the two sections, which the sweep below measures as any page.
for (const width of [360, 390, 768] as const) {
  test(`at ${width}px, each station of the run at rest stands wholly in the window, every word of it, and nothing scrolls sideways`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "the sweep's widths, and a touch screen's resting points");
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
          const el = document.querySelectorAll("#run [data-station]")[k];
          const pinEl = document.querySelector<HTMLElement>("#run .run-pin");
          const station = el?.getBoundingClientRect();
          const pin = pinEl?.getBoundingClientRect();
          const train = document.querySelector("#run .run-train")?.getBoundingClientRect();
          if (!el || !station || !pinEl || !pin || !train) throw new Error("no such station, or no pin");
          const vw = document.documentElement.clientWidth;
          const lo = Math.max(pin.left, 0) - 1;
          const hi = Math.min(pin.right, vw) + 1;
          // every line of its words, as the reader sees them: each text node's own boxes
          const cut: string[] = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if ((node.textContent ?? "").trim() === "" || !node.parentElement?.checkVisibility()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const r of range.getClientRects()) {
              if (r.width > 0 && (r.left < lo || r.right > hi)) cut.push(`"${(node.textContent ?? "").trim().slice(0, 24)}" [${Math.round(r.left)}, ${Math.round(r.right)}]`);
            }
          }
          window.scrollBy({ left: 400, behavior: "instant" });
          pinEl.scrollBy({ left: 400, behavior: "instant" });
          return {
            off: Math.abs(Math.round(station.left + station.width / 2 - (train.left + train.width / 2))),
            inside: station.left >= lo && station.right <= hi,
            box: `[${Math.round(station.left)}, ${Math.round(station.right)}] in [${Math.round(pin.left)}, ${Math.round(pin.right)}]`,
            cut,
            clips: getComputedStyle(pinEl).overflowX,
            sideways: [document.documentElement.scrollWidth - vw, window.scrollX, pinEl.scrollLeft],
          };
        }, i);
      // the track eases to the station: at rest once it stands at the train (within 3px, as run.spec.ts judges it)
      await expect.poll(async () => (await fit()).off, { timeout: 20_000 }).toBeLessThanOrEqual(3);
      const at = await fit();
      expect(at.inside, `station ${i} ${at.box}`).toBe(true);
      expect(at.cut, `station ${i}: its words past the pin or the window`).toEqual([]);
      expect(at.clips, "the run's pin clips; it is never a scroller").toBe("clip");
      expect(at.sideways, `station ${i}: the page's sideways overflow, its scroll and the pin's after a sideways scroll`).toEqual([0, 0, 0]);
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

// The landing with its text at 200% (the browser's own text size, set before first paint, as the nightly sets it), at the
// phone widths the sweep checks: it fits as at 100%, and the departure board reflows inside its plate, never cut. At 100%
// the board stays the table it always was.
test.describe("the landing at 200% text", () => {
  test.skip(({ isMobile }) => !isMobile, "runs once, on the phone project, across the widths");

  for (const width of [280, 320, 360, 390] as const) {
    test(`fits ${width}px, the departure board inside its plate`, async ({ page }) => {
      await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));
      await page.setViewportSize({ width, height: 844 });
      await gotoReady(page, "/");
      await waitForJourney(page);
      expect(await layoutBreaks(page)).toEqual([]);
      const board = await page.evaluate(() => {
        const plate = document.querySelector(".board")?.getBoundingClientRect();
        const table = document.querySelector(".board-table")?.getBoundingClientRect();
        if (!plate || !table) throw new Error("the departure board is missing");
        return { plate: `[${Math.round(plate.left)}, ${Math.round(plate.right)}]`, table: `[${Math.round(table.left)}, ${Math.round(table.right)}]`, inside: table.left >= plate.left - 1 && table.right <= plate.right + 1 };
      });
      expect(board.inside, `the board's table ${board.table} in its plate ${board.plate}`).toBe(true);
      expect(await cutText(page, "#departures"), "the board's words").toEqual([]);
      expect(await brokenWords(page, "#departures"), "a word of the board broken").toEqual([]);
    });
  }

  test("at 100% the departure board is the table it always was", async ({ page }) => {
    for (const width of [280, 390, 768] as const) {
      await page.setViewportSize({ width, height: 844 });
      await gotoReady(page, "/");
      await waitForJourney(page);
      const displays = await page.locator(".board-table tr").evaluateAll((rows) => rows.map((r) => getComputedStyle(r).display));
      expect(displays.length, `${width}px`).toBeGreaterThan(1);
      expect(new Set(displays), `${width}px`).toEqual(new Set(["table-row"]));
    }
  });
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
