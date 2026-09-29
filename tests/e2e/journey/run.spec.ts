import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { LANDING_INSTRUMENTS, collisionsInView } from "./collisions";
import { atRest, dismissInstall, drawStill, frames, motionOff, noAnchoring, pressTab, readyTab, scrollIntoRun, scrollToId, waitForJourney, waitForLive } from "./journey-helpers";

// 06–07, the window-seat run (spec §3.A, §3.G; J6-7, J6-8). The drawing above is held to the still (drawStill): these
// specs are about the run, and the live drawing would only make the software GPU slower.

/** How far station i's centre stands from the train's: 0 when it is at the window. */
function offTrain(page: Page, i: number): Promise<number> {
  return page.evaluate((k) => {
    const station = document.querySelectorAll("#run [data-station]")[k];
    const train = document.querySelector("#run .run-train");
    if (!station || !train) throw new Error("no such station, or no train");
    const s = station.getBoundingClientRect();
    const t = train.getBoundingClientRect();
    return Math.abs(Math.round(s.left + s.width / 2 - (t.left + t.width / 2)));
  }, i);
}
const here = (page: Page) => page.locator("#run [data-station]").evaluateAll((els) => els.findIndex((el) => el.classList.contains("is-here")));
const stationOf = (page: Page, selector: string) => page.locator("#run [data-station]").evaluateAll((els, sel) => els.findIndex((el) => el.matches(sel) || el.querySelector(sel) !== null || el.closest(sel) !== null), selector);
const running = (page: Page) => expect(page.locator("#run")).toHaveClass(/is-running/);
/** The longest the rest wait lasts before it gives up and the place is judged anyway: it then fails with the train's
 * distance from the station and says it was still moving, never as a bare test timeout (nightly review, I-2). */
const REST_MS = 20_000;
/** The page and the run's track have both held still for ten frames: the scroll has landed (a glide down to the run
 * leaves the track still until it gets there) and the track's smoothing has come to rest, however long that took, up to
 * REST_MS. Anime eases it a fixed share of the way each frame, so the time to settle is the machine's: on the nightly's
 * GPU-less WebKit runner (about 8 frames a second as the page loads) a jump across the run took about 7 s, still closing
 * in when a 5 s poll gave up (1,864 px, then 1,015, 385, 115 and 28 at the cutoff; run 36406365173). A state wait, then
 * the place is judged. True once at rest; false when it gave up still moving. */
const trackAtRest = (page: Page): Promise<boolean> =>
  page.evaluate(
    (limit) =>
      new Promise<boolean>((done) => {
        const until = performance.now() + limit;
        let last = "";
        let held = 0;
        const tick = () => {
          const now = `${window.scrollY} ${document.querySelector<HTMLElement>("#run .run-track")?.style.transform ?? ""}`;
          held = now === last ? held + 1 : 0;
          last = now;
          if (held >= 10) done(true);
          else if (performance.now() > until) done(false);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    REST_MS,
  );
/** Station i at the window once the track has come to rest: within 3 px of the train. A track still moving after REST_MS
 * fails here, saying how far off it was. A test that waits on it more than once sets its own timeout (up to REST_MS a
 * wait, plus its pages' own loads). */
const atTheWindow = async (page: Page, i: number) => {
  const rested = await trackAtRest(page);
  const off = await offTrain(page, i);
  expect(off, `station ${i} ${off}px off the train, ${rested ? "at rest" : `still moving after ${REST_MS / 1000} s`}`).toBeLessThanOrEqual(3);
  expect(rested, `the run's track still moving after ${REST_MS / 1000} s, station ${i} ${off}px off the train`).toBe(true);
};
/** How far 07's top stands from the masthead's foot, read as place-memory reads it (J6-9): where run.ts says it stands
 * while the run is pinned (data-run-at), its own box otherwise. 0 when the reader is at 07. */
const from07 = (page: Page) =>
  page.evaluate(() => {
    const use = document.getElementById("use");
    if (!use) throw new Error("#use is missing");
    const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const top = use.dataset.runAt === undefined ? use.getBoundingClientRect().top : Number(use.dataset.runAt) - window.scrollY;
    return Math.abs(Math.round(top - foot));
  });

test.describe("the window-seat run (spec §3.A)", () => {
  test.beforeEach(async ({ page }) => {
    await drawStill(page);
  });

  test("pins 06–07 and carries each station to the window in turn, lit, its words never fading", async ({ page }) => {
    test.setTimeout(60_000); // the rest wait's own limit (REST_MS) per station, and the page's loads
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    const count = await page.locator("#run [data-station]").count();
    expect(count).toBe(6);
    await scrollIntoRun(page, 0);
    await expect.poll(() => here(page)).toBe(0);
    await atTheWindow(page, 0);
    await scrollIntoRun(page, 1);
    await expect.poll(() => here(page)).toBe(count - 1);
    await atTheWindow(page, count - 1);
    await expect(page.locator("#run [data-station].is-passed")).toHaveCount(count - 1);
    await expect(page.locator("#run .run-stop.is-lit")).toHaveCount(count);
    expect(await page.locator("#run [data-station]").evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === "1"))).toBe(true);
  });

  test("the line counts kilometre posts on, and the train holds its place at the window", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    const posts = await page.locator("#run .run-km").allTextContents();
    expect(posts.length).toBeGreaterThan(2);
    expect(posts.every((p) => /^KM \d{3}$/.test(p))).toBe(true);
    const km = posts.map((p) => Number(p.slice(3)));
    expect(km.every((k, i) => i === 0 || k > km[i - 1]!)).toBe(true);
    const trainLeft = () => page.locator("#run .run-train").evaluate((el) => el.getBoundingClientRect().left);
    await scrollIntoRun(page, 0);
    const at = await trainLeft();
    await scrollIntoRun(page, 0.5);
    expect(await trainLeft()).toBe(at);
  });

  test("a link to 07 on the departure board brings its words to the window, and the address and the board say so", async ({ page }) => {
    test.setTimeout(60_000); // the rest wait's own limit (REST_MS) per station, and the page's loads
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    await page.locator(".board").getByRole("link", { name: "Where it gets used" }).click();
    await expect(page).toHaveURL(/#use$/);
    const first07 = await stationOf(page, "#use *");
    await atTheWindow(page, first07);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("use");
    // 07's row: the board's rows follow the stations after DEP, one each (departure-board.tsx)
    await expect(page.locator('.board tr[data-stop="8"] td.board-status')).toHaveText(/At\s*platform/i);
  });

  // Anime's smoothed scroll sync eases the run toward the scroll only while its wake timer runs, 500 ms after each scroll
  // event; one frame longer than that ended it short, the train left 1,500 px from 07 until the next scroll (Linux WebKit;
  // observers.ts keepUp). A slow device's stall, two frames after the jump: the busy loop is the stall itself, not a wait.
  test("a jump to 07 brings its first station to the window though a frame stalls past anime's wake (a slow device)", async ({ page, isMobile }) => {
    test.setTimeout(60_000); // the rest wait's own limit (REST_MS) per station, and the page's loads
    test.skip(isMobile, "one project is enough");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    await frames(page, 10);
    await page.evaluate(() => {
      const use = document.getElementById("use");
      const head = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      window.scrollTo({ top: Number(use?.dataset.runAt) - head, behavior: "instant" });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const end = performance.now() + 700;
          while (performance.now() < end);
        }),
      );
    });
    const first07 = await stationOf(page, "#use *");
    await atTheWindow(page, first07);
  });

  test("Back from 07, inside the run, returns the reader to 07, not 06 (J6-9)", async ({ page, isMobile }) => {
    test.setTimeout(60_000); // the rest wait's own limit (REST_MS) per station, and the page's loads
    test.skip(isMobile, "one project is enough");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    // 07's first station to the window, at the place run.ts gives it (data-run-at, less the masthead)
    await page.evaluate(() => {
      const use = document.getElementById("use");
      const head = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      window.scrollTo({ top: Number(use?.dataset.runAt) - head, behavior: "instant" });
    });
    const first07 = await stationOf(page, "#use *");
    await atTheWindow(page, first07);
    await frames(page); // the scroll has been sampled
    await page.getByLabel("Primary").getByRole("link", { name: "Watchlist" }).click();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
    await expect.poll(() => from07(page)).toBeLessThanOrEqual(4); // the restore has landed, on 07
  });

  test("Tab brings each card to the window, never under the masthead (spec §3.G; WCAG 2.4.11)", async ({ page, isMobile }) => {
    test.setTimeout(90_000); // the rest wait's own limit (REST_MS) per station, and the page's loads
    test.skip(isMobile, "the keyboard: one project is enough");
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    // by the keyboard from the first: only the keyboard's focus glides a station to the window (focus given in code, by a
    // mouse or by the window regaining focus does not)
    await readyTab(page, "#run", "Open Watchlist");
    for (const name of ["Open Watchlist →", "Open Pre-booking →", "Open Accuracy →"]) {
      await pressTab(page);
      const link = page.getByRole("link", { name });
      await expect(link).toBeFocused();
      const i = await link.evaluate((a) => [...document.querySelectorAll("#run [data-station]")].findIndex((s) => s.contains(a)));
      await atTheWindow(page, i);
      const seen = await link.evaluate((a) => {
        const r = a.getBoundingClientRect();
        const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        return r.top >= foot && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
      });
      expect(seen, `${name} is wholly in view, below the masthead`).toBe(true);
    }
  });

  test("on a touch screen each station is a resting point", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch screens");
    await page.goto("/");
    await waitForJourney(page);
    await running(page);
    await expect(page.locator("#run .run-snap")).toHaveCount(6);
    // proximity is scroll-snap-type's default strictness, which the computed value leaves out ("y")
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toMatch(/^y( proximity)?$/);
  });

  test("Motion off: 06 and 07 read as they always did", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#run")).not.toHaveClass(/is-running/);
    await expect(page.locator("#run .run-window")).toBeHidden();
    await expect(page.locator("#run .run-train")).toBeHidden();
    const [features, use] = await page.evaluate(() => ["features", "use"].map((id) => document.getElementById(id)?.getBoundingClientRect().toJSON() as DOMRect));
    expect(use!.top).toBeGreaterThanOrEqual(features!.bottom - 1);
  });

  test("a window too short for its stations: the sections as ever", async ({ page, isMobile }) => {
    await page.setViewportSize(isMobile ? { width: 844, height: 390 } : { width: 1440, height: 360 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#run")).not.toHaveClass(/is-running/);
    await expect(page.locator("#run .run-window")).toBeHidden();
  });

  test("a reader below the run leaves it unpinned until they come back above it (J3's rule)", async ({ page, isMobile }) => {
    test.skip(isMobile, "one project is enough");
    await page.goto("/#faq");
    await waitForJourney(page);
    await expect(page.locator("#run")).not.toHaveClass(/is-running/);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await running(page);
  });

  for (const anchoring of ["on", "off"] as const) {
    test(`a reader below the pinned run stays put when Motion goes off (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
      test.skip(isMobile, "one project is enough");
      await page.setViewportSize({ width: 1440, height: 900 });
      if (anchoring === "off") await noAnchoring(page);
      await page.goto("/");
      await waitForJourney(page);
      await running(page);
      await scrollToId(page, "faq", 120);
      await frames(page, 3); // the scroll has been heard
      const faqTop = () => page.locator("#faq").evaluate((el) => el.getBoundingClientRect().top);
      const before = await faqTop();
      // through the DOM: Playwright's click would scroll the footer's switch into view first
      await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator("#run")).not.toHaveClass(/is-running/);
      await frames(page, 6); // the unpin, 02's collapse and the still's settle
      expect(Math.abs((await faqTop()) - before)).toBeLessThanOrEqual(4);
    });
  }

  // Inside the pinned run as Motion goes off: J5-3 sends the reader to its start, 06's top under the masthead. The
  // rebuild tears the run down before the still and the drawing (it is started last), so the start is measured on the
  // page the reader sees, not one those teardowns have changed for a moment; and the unpin clamps the scroll at the
  // page's foot, which keepPlace reads through.
  for (const anchoring of ["on", "off"] as const) {
    test(`a reader inside the pinned run lands on its start when Motion goes off (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
      test.skip(isMobile, "one project is enough");
      await page.setViewportSize({ width: 1440, height: 900 });
      if (anchoring === "off") await noAnchoring(page);
      await page.goto("/");
      await waitForJourney(page);
      await running(page);
      await scrollIntoRun(page, 0.8);
      await frames(page, 3); // the scroll has been heard
      await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).evaluate((el) => (el as HTMLElement).click());
      await expect(page.locator("#run")).not.toHaveClass(/is-running/);
      await frames(page, 6); // the unpin, 02's collapse and the still's settle
      const [top, foot] = await page.evaluate(() => [document.getElementById("features")?.getBoundingClientRect().top ?? 0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0]);
      expect(Math.abs(top! - foot!)).toBeLessThanOrEqual(4);
    });
  }

  // A resize keeps a reader inside the running run the same fraction through it (the owner, 2026-09-29), where its start
  // once sent them back to 06: the same station at the window, at 06, mid-run or at 07, scroll anchoring or not, and
  // whether 02 above stands pinned (the reader scrolled down to the run) or plain (a link brought them here). A height
  // alone leaves the run's range as it was (its travel), so a station stays exactly at the window; a width re-lays it.
  /** The run's range as keepPlace reads it, from its start (its top under the masthead) to its foot at the window's foot. */
  const runThrough = (page: Page) =>
    page.evaluate(() => {
      const run = document.getElementById("run");
      if (!run) throw new Error("#run is missing");
      const r = run.getBoundingClientRect();
      const start = r.top + window.scrollY - (document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
      return (window.scrollY - start) / (r.bottom + window.scrollY - window.innerHeight - start);
    });
  /** How far the reader stands from where `id`'s first station is at the window (data-run-at, less the masthead). */
  const offStation = (page: Page, id: string) =>
    page.evaluate((target) => {
      const head = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      return Math.abs(Number(document.getElementById(target)?.dataset.runAt) - head - window.scrollY);
    }, id);
  const places = [
    { where: "at 06", to: (page: Page) => page.evaluate(() => window.scrollTo({ top: Number(document.getElementById("features")?.dataset.runAt) - (document.querySelector("header")?.getBoundingClientRect().bottom ?? 0), behavior: "instant" })), station: "features" },
    { where: "mid-run", to: (page: Page) => scrollIntoRun(page, 0.5), station: null },
    { where: "at 07", to: (page: Page) => page.evaluate(() => window.scrollTo({ top: Number(document.getElementById("use")?.dataset.runAt) - (document.querySelector("header")?.getBoundingClientRect().bottom ?? 0), behavior: "instant" })), station: "use" },
  ] as const;
  for (const anchoring of ["on", "off"] as const) {
    for (const arrival of ["scrolled", "linked"] as const) {
      for (const { where, to, station } of places) {
        test(`a reader ${where} stays on the same station through a resize (${arrival} there; scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
          test.setTimeout(90_000); // the rest wait's own limit (REST_MS) per resize, and the page's loads
          const base = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
          const sizes = isMobile ? [{ width: 390, height: 804 }, { width: 360, height: 844 }] : [{ width: 1440, height: 860 }, { width: 1200, height: 900 }];
          await page.setViewportSize(base);
          if (anchoring === "off") await noAnchoring(page);
          await page.goto(arrival === "linked" ? "/#features" : "/");
          await waitForJourney(page);
          await dismissInstall(page);
          await running(page);
          // 02 pinned above a reader who scrolled down to the run; left plain (pending) above one a link brought here
          if (arrival === "linked") await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
          else await expect(page.locator("#how")).toHaveClass(/is-pinned/);
          await to(page);
          await trackAtRest(page);
          for (const size of sizes.flatMap((s) => [s, base])) {
            const [f, i] = [await runThrough(page), await here(page)];
            await page.setViewportSize(size);
            await frames(page, 20); // the run's relayout, 02's guard, and anything they set going
            await atRest(page);
            const said = `${size.width}×${size.height}, ${Math.round(f * 1000) / 10}% through at station ${i}`;
            await running(page);
            // at 06 the run's top stands at the masthead's foot: above it by readerPlace (left where they are, the
            // change landing below them), so held only to its station
            if (where !== "at 06") expect(Math.abs((await runThrough(page)) - f), said).toBeLessThanOrEqual(0.002);
            await expect.poll(() => here(page), { message: said, timeout: REST_MS }).toBe(i);
            if (station && size.width === base.width) expect(await offStation(page, station), said).toBeLessThanOrEqual(4);
          }
        });
      }
    }
  }
});

// A Tab stop's glide to the window, cut short (Task 6 review): the drawing above fell to the still mid-glide, and the
// instant scroll its keepPlace made (a no-op under scroll anchoring, a real move without it) cancelled the smooth one,
// stranding focus off-screen at rest (WCAG 2.4.11). The glide is taken up after each such cut, at most three times, and
// never against the reader (rounds 2–4).
test.describe("a Tab stop's glide into the run (spec §3.G; WCAG 2.4.11)", () => {
  const inWindow = (page: Page, name: string) =>
    page.getByRole("link", { name }).evaluate((a) => {
      const r = a.getBoundingClientRect();
      const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const whole = r.top >= foot && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return whole && hit !== null && a.contains(hit);
    });
  const principlesTop = (page: Page) => page.locator("#principles").evaluate((el) => el.getBoundingClientRect().top);

  for (const anchoring of ["on", "off"] as const) {
    test(`reaches the window though the drawing above falls to the still mid-glide (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
      test.skip(isMobile, "the keyboard: one project is enough");
      await page.setViewportSize({ width: 1440, height: 900 });
      if (anchoring === "off") await noAnchoring(page);
      await page.goto("/");
      await waitForLive(page);
      await running(page);
      await scrollToId(page, "record"); // past the drawn train; the run below the window
      await frames(page, 3);
      await readyTab(page, "#run", "Open Watchlist", "lost");
      await pressTab(page);
      await expect(page.getByRole("link", { name: "Open Watchlist →" })).toBeFocused();
      await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
      await atRest(page);
      // the track trails the scroll a little (its sync), so the card may still be sliding in: poll, at rest
      await expect.poll(() => inWindow(page, "Open Watchlist →")).toBe(true);
    });

    // With the drawing yet to decide at the Tab, the resize's first jump lets it decide, and the still's own jump cuts
    // the glide again a few frames after it was taken up (round 4).
    for (const drawing of ["still", "undecided"] as const)
      for (const at of [2, 8]) {
        const when = drawing === "still" ? "" : ", the drawing yet to decide";
        test(`reaches the window though it is resized ${at} frames into the glide${when} (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
          test.skip(isMobile, "the keyboard: one project is enough");
          await page.setViewportSize({ width: 1440, height: 900 });
          if (anchoring === "off") await noAnchoring(page);
          // the still: held there, as the governor floors it on a slow GPU; undecided: the Tab before the scene arrives
          if (drawing === "still") await drawStill(page);
          await page.goto("/");
          await waitForJourney(page);
          await running(page);
          await scrollToId(page, "record", 100);
          await frames(page, 3);
          await readyTab(page, "#run", "Open Watchlist");
          await pressTab(page);
          await expect(page.getByRole("link", { name: "Open Watchlist →" })).toBeFocused();
          await frames(page, at);
          await page.setViewportSize({ width: 1440, height: 860 });
          await atRest(page, 15);
          await frames(page, 30); // the journey's own resize answer lands 150 ms later
          await atRest(page, 15);
          await expect.poll(() => inWindow(page, "Open Watchlist →")).toBe(true);
        });
      }

    // Shift+Tab from 08 for a reader below the run (here a /#faq link): focus lands on 06's last card while the run
    // stands unpinned, and the browser glides up to it; the glide brings the run's top into the window, so it pins at
    // its start, the card far to the right under the pin's clip. Its station is brought to the window as it pins
    // (final review, I1).
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
    ])
      test(`Shift+Tab from 08 into the run from below reaches the window as the run pins, at ${size.width}×${size.height} (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
        test.skip(isMobile, "the keyboard: one project is enough");
        await drawStill(page);
        await page.setViewportSize(size);
        if (anchoring === "off") await noAnchoring(page);
        await page.goto("/#faq");
        await waitForJourney(page);
        await expect(page.locator("#run")).not.toHaveClass(/is-running/);
        await page.locator("#faq summary").first().evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
        await pressTab(page, true);
        await expect.poll(() => page.evaluate(() => document.activeElement?.closest("#run [data-station]") !== null)).toBe(true);
        await running(page);
        await atRest(page);
        await expect
          .poll(() =>
            page.evaluate(() => {
              const a = document.activeElement;
              if (!a) return "nothing focused";
              const r = a.getBoundingClientRect();
              const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              const whole = r.top >= foot && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
              return whole && hit !== null && a.contains(hit) ? "in view" : `at ${Math.round(r.left)},${Math.round(r.top)}`;
            }),
          )
          .toBe("in view");
      });

    test(`never pulls back a reader who dragged away mid-glide, however long after (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
      test.skip(isMobile, "the keyboard: one project is enough");
      await drawStill(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      if (anchoring === "off") await noAnchoring(page);
      await page.goto("/");
      await waitForJourney(page);
      await running(page);
      await scrollToId(page, "record");
      await frames(page, 3);
      await readyTab(page, "#run", "Open Watchlist", "away");
      await pressTab(page);
      await expect(page.getByRole("link", { name: "Open Watchlist →" })).toBeFocused();
      await atRest(page);
      const before = await principlesTop(page);
      expect(before, "the drag left the reader at 01").toBeCloseTo(100, -1);
      await frames(page, 60);
      await page.evaluate(() => window.dispatchEvent(new Event("tt:layout")));
      await frames(page, 15);
      expect(Math.abs((await principlesTop(page)) - before)).toBeLessThanOrEqual(4);
    });
  }
});

test.describe("nothing collides while the run carries 06–07 past the window (spec §5)", () => {
  for (const size of [
    { name: "1440×900", viewport: { width: 1440, height: 900 }, phone: false },
    { name: "390×844", viewport: { width: 390, height: 844 }, phone: true },
  ] as const) {
    test(`at ${size.name}, a tenth of the run at a time`, async ({ page, isMobile }) => {
      test.skip(isMobile !== size.phone, "each size runs once, in the project that emulates its device");
      await drawStill(page);
      await page.setViewportSize(size.viewport);
      await page.goto("/");
      await waitForJourney(page);
      await dismissInstall(page);
      await running(page);
      const found: string[] = [];
      for (let k = 0; k <= 10; k += 1) {
        await scrollIntoRun(page, k / 10);
        await frames(page, 2);
        found.push(...(await collisionsInView(page, LANDING_INSTRUMENTS)));
      }
      expect(found).toEqual([]);
    });
  }
});
