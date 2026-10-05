import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { PNR } from "../helpers";
import { drawStill, motionOff, transformOf, waitForJourney } from "./journey-helpers";

/** Samples the morph's height every frame for `ms` after `act`. */
async function heightsDuring(page: Page, act: () => Promise<void>, ms = 900): Promise<number[]> {
  await page.evaluate((span) => {
    const w = window as unknown as { __heights: number[] };
    w.__heights = [];
    const el = document.querySelector('[data-testid="hero-instrument"] .plate-morph')!;
    const end = performance.now() + span;
    const tick = () => {
      w.__heights.push(Math.round(el.getBoundingClientRect().height));
      if (performance.now() < end) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { __heights: number[] }).__heights);
}

/** Fills the PNR only — on 390px this alone reveals the entry face's Clear button, growing it, which is
 * unrelated to the morph (the face never changes here). Height sampling must never straddle this. */
async function fill(page: Page): Promise<void> {
  await page.getByTestId("hero-instrument").getByRole("textbox").fill(PNR.cnf);
}

/** Clicks Run and waits for the record — the only span the morph itself runs across. */
async function clickRun(page: Page): Promise<void> {
  const plate = page.getByTestId("hero-instrument");
  await plate.getByRole("button", { name: /run/i }).click();
  const result = page.getByTestId("terminal-result");
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("data-kind", "ok");
}

async function run(page: Page): Promise<void> {
  await fill(page);
  await clickRun(page);
}

/** Keeps every height the morph writes on the plate, in order (`window.__written`): a MutationObserver is told each
 * write with the value it replaced, so the list is every inline height the plate has had, the last one before the morph
 * cleared it included, whatever the frame rate. */
async function watchHeights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __written: number[] };
    w.__written = [];
    const el = document.querySelector('[data-testid="hero-instrument"] .plate-morph')!;
    new MutationObserver((records) => {
      for (const record of records) {
        const height = /(?:^|;\s*)height:\s*([\d.]+)px/.exec(record.oldValue ?? "");
        if (height) w.__written.push(Number(height[1]));
      }
    }).observe(el, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
  });
}

/** The morph has run and let go: it wrote heights, and none is left on the plate. A state, never a time. */
async function letGo(page: Page): Promise<void> {
  const wrapper = page.locator('[data-testid="hero-instrument"] .plate-morph');
  await expect.poll(() => wrapper.evaluate((el) => (window as unknown as { __written: number[] }).__written.length > 0 && (el as HTMLElement).style.height === ""), { timeout: 10_000 }).toBe(true);
}

/** Every plate face's computed transform, sampled each frame from the first frame a face exists (the server's
 * markup, before hydration) until `ms` after the journey has taken the page over (so hydration and whatever
 * follows it are always inside the window, however slowly the dev server hydrates). Starts before the page's
 * own scripts. Identity is written as "none" however the browser spells it. */
async function faceTransformsFromFirstPaint(page: Page, ms = 600): Promise<string[]> {
  await page.addInitScript((span) => {
    const w = window as unknown as { __faces: string[]; __facesDone: boolean };
    w.__faces = [];
    w.__facesDone = false;
    let hydrated: number | null = null;
    const tick = () => {
      for (const face of document.querySelectorAll(".plate-morph > div")) {
        const t = getComputedStyle(face).transform;
        w.__faces.push(t === "matrix(1, 0, 0, 1, 0, 0)" ? "none" : t);
      }
      if (hydrated === null && document.documentElement.getAttribute("data-journey") === "on") hydrated = performance.now();
      if (hydrated === null || performance.now() - hydrated < span) requestAnimationFrame(tick);
      else w.__facesDone = true;
    };
    requestAnimationFrame(tick);
  }, ms);
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __facesDone: boolean }).__facesDone, null, { timeout: 20_000 });
  return page.evaluate(() => (window as unknown as { __faces: string[] }).__faces);
}

/** The hero face's vertical offset (px, from its computed matrix), sampled every frame for `ms` after `act`. */
async function riseDuring(page: Page, act: () => Promise<void>, ms = 900): Promise<number[]> {
  await page.evaluate((span) => {
    const w = window as unknown as { __rise: number[] };
    w.__rise = [];
    const end = performance.now() + span;
    const tick = () => {
      const face = document.querySelector('[data-testid="hero-instrument"] .plate-morph > div');
      if (face) w.__rise.push(new DOMMatrixReadOnly(getComputedStyle(face).transform).m42);
      if (performance.now() < end) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { __rise: number[] }).__rise);
}

test.describe("the plate morph", () => {
  test("Motion off: the first face never rises, from first paint on", async ({ page }) => {
    await motionOff(page);
    const transforms = await faceTransformsFromFirstPaint(page);
    expect(transforms.length).toBeGreaterThanOrEqual(10);
    expect(new Set(transforms)).toEqual(new Set(["none"]));
  });

  test("Motion on: the first face never rises either, from first paint on", async ({ page }) => {
    const transforms = await faceTransformsFromFirstPaint(page);
    expect(transforms.length).toBeGreaterThanOrEqual(10);
    expect(new Set(transforms)).toEqual(new Set(["none"]));
  });

  test("a change of face rises 8px with Motion on, and settles still", async ({ page }) => {
    await page.goto("/");
    await fill(page);
    const rise = await riseDuring(page, () => clickRun(page), 3_000);
    expect(Math.max(...rise)).toBeGreaterThan(1);
    expect(Math.max(...rise)).toBeLessThanOrEqual(8);
    expect(rise.at(-1)).toBe(0);
    expect(await transformOf(page.locator('[data-testid="hero-instrument"] .plate-morph > div'))).toBe("none");
  });

  test("Motion off: a change of face swaps at once, with no rise", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await fill(page);
    const rise = await riseDuring(page, () => clickRun(page), 3_000);
    expect(rise.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rise)).toEqual(new Set([0]));
  });

  test("the record grows out of the plate", async ({ page }) => {
    await page.goto("/");
    await fill(page);
    const heights = await heightsDuring(page, () => clickRun(page), 2_400);
    const final = heights.at(-1)!;
    const between = heights.filter((h) => h > heights[0]! + 2 && h < final - 2);
    expect(between.length).toBeGreaterThanOrEqual(3);
    expect(await page.locator('[data-testid="hero-instrument"] .plate-morph').evaluate((el) => (el as HTMLElement).style.height)).toMatch(/^(auto|)$/);
  });

  test("Motion off: the record appears at once", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await fill(page);
    const heights = await heightsDuring(page, () => clickRun(page), 2_400);
    const final = heights.at(-1)!;
    // Distinct values, not raw samples: the entry face's own running state (unrelated to the morph, still
    // its own face throughout) settles through one incidental plateau of its own before the result lands. A
    // real tween reads through dozens of distinct heights on its way; one incidental one is not that.
    const between = new Set(heights.filter((h) => h > heights[0]! + 2 && h < final - 2));
    expect(between.size).toBeLessThan(3);
  });

  test("checking another PNR morphs back, and the entry takes the caret", async ({ page }) => {
    await page.goto("/");
    await run(page);
    await page.getByRole("button", { name: /check another pnr/i }).click();
    await expect(page.getByTestId("hero-instrument").getByRole("textbox")).toBeFocused();
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
  });

  test("Motion switched off mid-rise stops the face where it rests", async ({ page }) => {
    await page.goto("/");
    await fill(page);
    // All in the page, frame-timed: catch the record face mid-rise (moving, between its start and rest), flip
    // the footer's switch, read the face's own inline transform at once, then its drawn offset every frame for
    // longer than the rest of the rise's 420ms. The face must never move on from where the switch found it:
    // every frame reads that offset or rest, and it ends at rest. (The drawn value can hold for a frame or
    // two after the inline transform is cleared: the site's Motion-off rule gives every element a 0.01ms
    // transition, motion.css, which the browser only starts and ends on later frames.)
    const run = page.getByTestId("hero-instrument").getByRole("button", { name: /run/i });
    const toggle = await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).elementHandle();
    const read = page.evaluate(
      (motionSwitch) =>
        new Promise<{ readonly before: number; readonly inline: string; readonly after: number[] }>((resolve) => {
          const offset = (el: Element) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
          const face = () => document.querySelector<HTMLElement>('[data-testid="hero-instrument"] .plate-morph > div');
          const sample = (before: number, inline: string, after: number[], end: number) => {
            const now = face();
            if (now) after.push(offset(now));
            if (performance.now() < end) requestAnimationFrame(() => sample(before, inline, after, end));
            else resolve({ before, inline, after });
          };
          const waitForRise = () => {
            const el = face();
            const y = el?.querySelector('[data-testid="terminal-result"]') ? offset(el) : 0;
            if (!el || y <= 0.5 || y >= 7.5) return requestAnimationFrame(waitForRise);
            (motionSwitch as HTMLElement).click();
            const inline = el.style.transform;
            requestAnimationFrame(() => sample(y, inline, [], performance.now() + 600));
          };
          requestAnimationFrame(waitForRise);
        }),
      toggle,
    );
    await run.click();
    const { before, inline, after } = await read;
    await expect(page.getByTestId("terminal-result")).toHaveAttribute("data-kind", "ok");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    expect(before).toBeGreaterThan(0.5);
    expect(inline).toBe("");
    expect(after.length).toBeGreaterThanOrEqual(10);
    expect(after.filter((y) => y !== before && y !== 0)).toEqual([]);
    expect(after.slice(after.indexOf(0))).toEqual(after.slice(after.indexOf(0)).map(() => 0));
    expect(after.at(-1)).toBe(0);
  });

  test("under a slow CPU the plate still ends at its content's own height", async ({ page }) => {
    test.setTimeout(90_000);
    // The morph once left the plate at its tween's last pixel height when the tween's completion landed
    // late (reproduced only with the CPU throttled). A few throttled runs, each read after the morph.
    const cdp = await page.context().newCDPSession(page);
    for (const rate of [4, 6, 8]) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      await page.goto("/");
      await run(page);
      await page.waitForTimeout(2_500);
      const wrapper = page.locator('[data-testid="hero-instrument"] .plate-morph');
      expect(await wrapper.evaluate((el) => (el as HTMLElement).style.height), `at ${rate}x`).toMatch(/^(auto|)$/);
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  });

  test("Motion off mid-morph ends at the new face's own height", async ({ page }) => {
    await page.goto("/");
    await run(page);
    // Mid-tween (420ms total): flip Motion off, the way the other journey specs do, then swap faces again
    // while the first tween is still in flight.
    await page.waitForTimeout(100);
    await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).click();
    await page.getByRole("button", { name: /check another pnr/i }).click();
    // Past the interrupted tween's own 420ms schedule, so any leftover write would have already landed.
    await page.waitForTimeout(1_000);
    const wrapper = page.locator('[data-testid="hero-instrument"] .plate-morph');
    expect(await wrapper.evaluate((el) => (el as HTMLElement).style.height)).toMatch(/^(auto|)$/);
    const box = await wrapper.boundingBox();
    const contentBox = await wrapper.locator(":scope > *").first().boundingBox();
    expect(Math.abs((box?.height ?? 0) - (contentBox?.height ?? 0))).toBeLessThanOrEqual(1);
  });

  // A face can change its own height after the commit the morph first measures it in. On a phone the record's
  // passenger table stacks (use-outgrown.ts: a frame narrower than the table, every window under 394px), in that
  // commit's own layout effects, and the stacked record is taller than the table the morph measured. A tween to the
  // first measure ended that much short and the plate jumped the rest when it let go. The tween runs to the face's
  // height as it stands on each frame, so the last height it writes is the height the plate keeps. Read from the writes
  // themselves, each one (a MutationObserver is told every one, with the value it replaced), never from frames: a slow
  // runner drops frames.
  test("where the record stacks, the morph ends at the height the record stands at: the plate does not jump when it lets go", async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone: the record stacks there");
    await page.goto("/");
    // a party of three: the record with a passenger table in it
    await page.getByTestId("hero-instrument").getByRole("textbox").fill(PNR.mixed);
    await watchHeights(page);
    await clickRun(page);
    const wrapper = page.locator('[data-testid="hero-instrument"] .plate-morph');
    await letGo(page);
    const at = await wrapper.evaluate((el) => ({
      written: (window as unknown as { __written: number[] }).__written,
      stands: el.getBoundingClientRect().height,
      rows: [...new Set([...el.querySelectorAll("tbody tr")].map((row) => getComputedStyle(row).display))],
    }));
    expect(at.rows, "the record's rows are stacked: the case this test is about").toEqual(["grid"]);
    expect(new Set(at.written).size, "the morph tweened: it wrote many heights").toBeGreaterThan(5);
    expect(Math.abs((at.written.at(-1) ?? 0) - at.stands), `the last height written, ${at.written.at(-1)}px, against the ${at.stands}px the plate keeps`).toBeLessThanOrEqual(1);
  });

  // And the way back. The morph starts from the height of the face it replaces, which it remembered from the commit
  // that drew that face: for a record that stacked afterwards, the table's height, not the record's. "Check another
  // PNR" then cut the plate to that height for its first frame (731px of a 911px record on a 390px phone) before it
  // shrank. The morph keeps the face's height as it changes, so the first height it writes is the height the plate had.
  test("checking another PNR from a stacked record starts from the height the record stood at", async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone: the record stacks there");
    await page.goto("/");
    await page.getByTestId("hero-instrument").getByRole("textbox").fill(PNR.mixed);
    await watchHeights(page);
    await clickRun(page);
    await letGo(page);
    const wrapper = page.locator('[data-testid="hero-instrument"] .plate-morph');
    const stood = await wrapper.evaluate((el) => {
      (window as unknown as { __written: number[] }).__written = [];
      return { height: el.getBoundingClientRect().height, rows: [...new Set([...el.querySelectorAll("tbody tr")].map((row) => getComputedStyle(row).display))] };
    });
    expect(stood.rows, "the record's rows are stacked: the case this test is about").toEqual(["grid"]);
    await page.getByRole("button", { name: /check another pnr/i }).click();
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
    await letGo(page);
    const written = await page.evaluate(() => (window as unknown as { __written: number[] }).__written);
    expect(new Set(written).size, "the morph tweened back: it wrote many heights").toBeGreaterThan(5);
    expect(Math.abs((written[0] ?? 0) - stood.height), `the first height written, ${written[0]}px, against the ${stood.height}px the record stood at`).toBeLessThanOrEqual(1);
    expect(Math.max(...written), "and it only shrinks from there").toBeLessThanOrEqual(stood.height + 1);
  });
  // Motion off gives every property of every element a 0.01ms transition (motion.css): a change of style lands a frame
  // late. The record stacks by its own measure in the commit that draws it, and while that swapped classes on the same
  // table, rows and cells, their paddings and borders were the table's for one frame under the stacked layout: the
  // record was drawn 900px tall and 770px a frame later on a 390px phone, the page under it shifting twice. The stacked
  // record is its own elements now, which start as they stand. Read every frame from the press: once the record is
  // drawn, the plate is at its rest height in every frame, and the page shifts once, for the record's arrival.
  test("Motion off: the stacked record stands at its own height from the first frame it is drawn in", async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone: the record stacks there");
    await motionOff(page);
    await page.goto("/");
    await page.getByTestId("hero-instrument").getByRole("textbox").fill(PNR.mixed);
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __first: number | null; __shifts: number[] | null };
      w.__frames = [];
      w.__first = null;
      w.__shifts = null;
      if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
        const shifts: number[] = [];
        w.__shifts = shifts;
        new PerformanceObserver((list) => shifts.push(...list.getEntries().map((entry) => entry.startTime))).observe({ type: "layout-shift" });
      }
      const el = document.querySelector('[data-testid="hero-instrument"] .plate-morph')!;
      const tick = () => {
        if (el.querySelector('[data-testid="terminal-result"]')) {
          w.__first ??= performance.now();
          w.__frames.push(el.getBoundingClientRect().height);
        }
        // sixty frames from the record's first: the frame the fault was in is the first
        if (w.__frames.length < 60) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await clickRun(page);
    await page.waitForFunction(() => (window as unknown as { __frames: number[] }).__frames.length >= 60, undefined, { timeout: 15_000 });
    const at = await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __first: number; __shifts: number[] | null };
      const rows = [...new Set([...document.querySelectorAll('[data-testid="terminal-result"] tbody tr')].map((row) => getComputedStyle(row).display))];
      // a shift is timed at its frame's layout, after that frame's callbacks: the record's own is at or after `first`
      return { frames: w.__frames, rows, shifts: w.__shifts?.filter((time) => time >= w.__first - 1).length ?? null };
    });
    expect(at.rows, "the record's rows are stacked: the case this test is about").toEqual(["grid"]);
    const rest = at.frames.at(-1)!;
    expect(at.frames.filter((height) => Math.abs(height - rest) > 1), `every frame from the record's first at its rest height, ${rest}px`).toEqual([]);
    if (at.shifts !== null) expect(at.shifts, "the page shifts once, as the record arrives, and not again a frame later").toBeLessThanOrEqual(1);
  });

  // With Motion off the plate swaps faces at once and tells the journey its layout moved (tt:layout) in the same
  // commit, before the record has stacked: the journey measured the page with the table in it (731px) and the record
  // then stood at 911px on a 360px phone with nobody told. Every station was announced 180px early from there on. A
  // face that changes its own height with no morph running tells the journey again. Here the board's stations are swept
  // as the page was left, then again after a layout event sent from the test: told right the first time, both are the
  // same.
  test("Motion off: the journey is told once the record has stacked, and announces each station where it stands", async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone: the record stacks there");
    test.setTimeout(90_000);
    await motionOff(page);
    await drawStill(page);
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto("/");
    await waitForJourney(page);
    await page.evaluate(() => {
      const w = window as unknown as { __layouts: number };
      w.__layouts = 0;
      window.addEventListener("tt:layout", () => {
        w.__layouts += 1;
      });
    });
    await page.getByTestId("hero-instrument").getByRole("textbox").fill(PNR.mixed);
    await clickRun(page);
    await expect(page.getByTestId("terminal-result").locator("tbody tr").first()).toHaveCSS("display", "grid");
    // The telling ends: the layout events stop (a face told of nothing new tells nobody), however long is waited.
    const layouts = () => page.evaluate(() => (window as unknown as { __layouts: number }).__layouts);
    await expect.poll(async () => {
      const before = await layouts();
      await page.waitForTimeout(600);
      return (await layouts()) - before;
    }, { timeout: 15_000 }).toBe(0);
    expect(await layouts(), "told, and not without end").toBeLessThan(12);

    /** Where the scroll stands as each of the first stations is announced, from the top down in 20px steps. */
    const sweep = () =>
      page.evaluate(async () => {
        const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const seen: { readonly station: number; readonly y: number }[] = [];
        const onStation = (event: Event) => seen.push({ station: (event as CustomEvent<{ index: number }>).detail.index, y: Math.round(window.scrollY) });
        window.scrollTo({ top: 0, behavior: "instant" });
        await frame();
        window.addEventListener("tt:station", onStation);
        const foot = document.documentElement.scrollHeight - window.innerHeight;
        for (let y = 20; y <= foot && seen.length < 3; y += 20) {
          window.scrollTo({ top: y, behavior: "instant" });
          await frame();
        }
        window.removeEventListener("tt:station", onStation);
        window.scrollTo({ top: 0, behavior: "instant" });
        await frame();
        return seen;
      });
    const asLeft = await sweep();
    expect(asLeft.length, "three stations passed on the way down").toBe(3);
    await page.evaluate(() => window.dispatchEvent(new Event("tt:layout")));
    const toldAgain = await sweep();
    expect(asLeft, "the stations as the record left them, against the same once told afresh").toEqual(toldAgain);
  });

  // A tween that is stopped is run to "now" once more as it stops, and writes. Stopped because the face changed, the
  // face it measures has gone from the page: its height reads 0, and the plate was written a height below either face's
  // (overwritten in the same effect, so never painted). Only the tween still current writes. Read from the writes.
  test("checking another PNR while the record is still growing writes no height below the entry's", async ({ page, isMobile }) => {
    test.skip(!isMobile, "once is enough");
    await page.goto("/");
    await page.getByTestId("hero-instrument").getByRole("textbox").fill(PNR.mixed);
    await watchHeights(page);
    // In the page, frame by frame: as soon as the plate is growing (an inline height on it) and the record's button is
    // there, press it. The press lands at a share of the morph, never at a time.
    const pressed = page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const end = performance.now() + 20_000;
          const tick = () => {
            const el = document.querySelector<HTMLElement>('[data-testid="hero-instrument"] .plate-morph');
            const another = [...(el?.querySelectorAll("button") ?? [])].find((button) => /check another pnr/i.test(button.textContent ?? ""));
            if (el && another && el.style.height !== "") {
              const at = Number.parseFloat(el.style.height);
              another.click();
              return resolve(at);
            }
            if (performance.now() > end) return reject(new Error("the record never grew"));
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.getByTestId("hero-instrument").getByRole("button", { name: /run/i }).click();
    const at = await pressed;
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
    await letGo(page);
    const written = await page.evaluate(() => (window as unknown as { __written: number[] }).__written);
    // the first height written is the entry's own, where the growth started from
    const entry = written[0] ?? 0;
    expect(at, "pressed while the plate was growing, an inline height on it: the case this test is about").toBeGreaterThanOrEqual(entry);
    expect(written.filter((height) => height < entry - 2), `every height written, against the entry's ${entry}px`).toEqual([]);
  });
});
